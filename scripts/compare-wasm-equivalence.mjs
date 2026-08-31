import { readFileSync } from "node:fs";

const [, , corpusPath, referencePath, comparisonPath] = process.argv;
if (!corpusPath || !referencePath || !comparisonPath) {
  throw new Error(
    "usage: node scripts/compare-wasm-equivalence.mjs <corpus.json> <reference.wasm> <comparison.wasm>",
  );
}

const encoder = new TextEncoder();

async function load(path) {
  const bytes = readFileSync(path);
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module);
  const { memory, alloc, rank_answer: rankAnswer } = instance.exports;
  if (!(memory instanceof WebAssembly.Memory) || typeof alloc !== "function" || typeof rankAnswer !== "function") {
    throw new Error(`${path} does not expose the Telegraph scoring ABI`);
  }

  function write(value) {
    const bytes = encoder.encode(value);
    if (bytes.length === 0) return [0, 0];
    const pointer = alloc(bytes.length);
    new Uint8Array(memory.buffer, pointer, bytes.length).set(bytes);
    return [pointer, bytes.length];
  }

  return (question, groundTruth, answer) => {
    const questionInput = write(question);
    const truthInput = write(groundTruth);
    const answerInput = write(answer);
    return rankAnswer(...questionInput, ...truthInput, ...answerInput);
  };
}

function answersFor(testCase, tier) {
  if (tier === "good" && testCase.good_answers) return testCase.good_answers;
  if (tier === "bad" && testCase.bad_answers) return testCase.bad_answers;
  const acceptedTiers = tier === "good" ? new Set(["high"]) : new Set(["low", "mid"]);
  return (testCase.answers ?? [])
    .filter((answer) => acceptedTiers.has(answer.tier))
    .map((answer) => answer.text);
}

const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
const reference = await load(referencePath);
const comparison = await load(comparisonPath);
const rows = [];

for (const testCase of corpus.cases) {
  rows.push({
    family: testCase.family ?? testCase.question,
    question: testCase.question,
    groundTruth: testCase.ground_truth,
    answer: testCase.ground_truth,
    tier: "self",
  });
  for (const answer of answersFor(testCase, "good")) {
    rows.push({ ...testCase, family: testCase.family ?? testCase.question, groundTruth: testCase.ground_truth, answer, tier: "good" });
  }
  for (const answer of answersFor(testCase, "bad")) {
    rows.push({ ...testCase, family: testCase.family ?? testCase.question, groundTruth: testCase.ground_truth, answer, tier: "bad" });
  }
}

// Evaluate by tier rather than by fixture. This deliberately revisits each
// question/ground-truth after many intervening calls and exposes cache-size
// regressions while checking that the scoring function remains byte-exact.
const orderedRows = ["self", "good", "bad"].flatMap((tier) => rows.filter((row) => row.tier === tier));
let maximumAbsoluteDifference = 0;
const mismatches = [];
const startedAt = performance.now();

for (const row of orderedRows) {
  const expected = reference(row.question, row.groundTruth, row.answer);
  const actual = comparison(row.question, row.groundTruth, row.answer);
  const difference = Math.abs(expected - actual);
  maximumAbsoluteDifference = Math.max(maximumAbsoluteDifference, difference);
  if (difference !== 0) {
    mismatches.push({ family: row.family, tier: row.tier, expected, actual, difference });
  }
}

const result = {
  corpus: corpus.version,
  cases: corpus.cases.length,
  scoredRows: orderedRows.length,
  elapsedMs: performance.now() - startedAt,
  exact: mismatches.length === 0,
  maximumAbsoluteDifference,
  mismatches: mismatches.slice(0, 20),
};

console.log(JSON.stringify(result, null, 2));
if (mismatches.length > 0) process.exitCode = 1;
