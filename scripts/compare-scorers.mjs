import { readFileSync } from "node:fs";

const [, , corpusPath, ...specs] = process.argv;
if (!corpusPath || specs.length === 0) {
  throw new Error("usage: node scripts/compare-scorers.mjs <corpus.json> <name=module.wasm> [...]");
}

async function loadScorer(path) {
  const bytes = readFileSync(path);
  const module = await WebAssembly.compile(bytes);
  if (WebAssembly.Module.imports(module).length !== 0) {
    throw new Error(`${path} has forbidden imports`);
  }
  const instance = await WebAssembly.instantiate(module);
  const { memory, alloc, rank_answer: rankAnswer } = instance.exports;
  if (!(memory instanceof WebAssembly.Memory) || typeof alloc !== "function" || typeof rankAnswer !== "function") {
    throw new Error(`${path} does not expose the Telegraph scoring ABI`);
  }
  const encoder = new TextEncoder();
  function write(value) {
    const encoded = encoder.encode(value);
    if (encoded.length === 0) return [0, 0];
    const pointer = alloc(encoded.length);
    new Uint8Array(memory.buffer, pointer, encoded.length).set(encoded);
    return [pointer, encoded.length];
  }
  return (question, truth, answer) => {
    const [qp, ql] = write(question);
    const [tp, tl] = write(truth);
    const [ap, al] = write(answer);
    return rankAnswer(qp, ql, tp, tl, ap, al);
  };
}

const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
const scorers = [];
for (const spec of specs) {
  const separator = spec.indexOf("=");
  if (separator < 1) throw new Error(`invalid scorer specification: ${spec}`);
  const name = spec.slice(0, separator);
  const path = spec.slice(separator + 1);
  scorers.push({ name, score: await loadScorer(path) });
}

for (const scorer of scorers) {
  const margins = [];
  const observations = [];
  let wins = 0;
  let comparisons = 0;
  let worstSelfMatch = 1;
  const failures = [];
  for (const testCase of corpus.cases) {
    const goodAnswers = testCase.good_answers ?? testCase.answers
      ?.filter((answer) => answer.tier === "high")
      .map((answer) => answer.text);
    const lowAnswers = testCase.answers
      ?.filter((answer) => answer.tier === "low")
      .map((answer) => answer.text);
    const midAnswers = testCase.answers
      ?.filter((answer) => answer.tier === "mid")
      .map((answer) => answer.text);
    const badAnswers = testCase.bad_answers ?? (lowAnswers?.length ? lowAnswers : midAnswers);
    if (!goodAnswers?.length || !badAnswers?.length) {
      throw new Error(`case ${testCase.family ?? testCase.question} has no good/bad answer pair`);
    }
    worstSelfMatch = Math.min(
      worstSelfMatch,
      scorer.score(testCase.question, testCase.ground_truth, testCase.ground_truth),
    );
    for (const good of goodAnswers) {
      const goodScore = scorer.score(testCase.question, testCase.ground_truth, good);
      for (const bad of badAnswers) {
        const badScore = scorer.score(testCase.question, testCase.ground_truth, bad);
        const margin = goodScore - badScore;
        margins.push(margin);
        observations.push({ family: testCase.family ?? testCase.question, goodScore, badScore, margin });
        comparisons += 1;
        if (margin > 0) wins += 1;
        else failures.push({ family: testCase.family, goodScore, badScore, margin });
      }
    }
  }
  const mean = margins.reduce((sum, value) => sum + value, 0) / margins.length;
  const variance = margins.reduce((sum, value) => sum + (value - mean) ** 2, 0) / margins.length;
  console.log(JSON.stringify({
    scorer: scorer.name,
    corpus: corpus.version,
    cases: corpus.cases.length,
    wins,
    comparisons,
    winRate: wins / comparisons,
    averageMargin: mean,
    standardDeviation: Math.sqrt(variance),
    minimumMargin: Math.min(...margins),
    worstSelfMatch,
    weakestCases: observations.sort((left, right) => left.margin - right.margin).slice(0, 10),
    failures,
  }, null, 2));
}
