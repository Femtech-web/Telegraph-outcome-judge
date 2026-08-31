import { readFileSync } from "node:fs";

const [, , corpusPath, referencePath, evaluatedPath] = process.argv;
if (!corpusPath || !referencePath || !evaluatedPath) {
  throw new Error(
    "usage: node scripts/analyze-scorer-calibration.mjs <corpus.json> <reference.wasm> <evaluated.wasm>",
  );
}

async function loadScorer(path) {
  const module = await WebAssembly.compile(readFileSync(path));
  const instance = await WebAssembly.instantiate(module);
  const { memory, alloc, rank_answer: rankAnswer } = instance.exports;
  const encoder = new TextEncoder();

  return (question, truth, answer) => {
    const write = (value) => {
      const bytes = encoder.encode(value);
      if (bytes.length === 0) return [0, 0];
      const pointer = alloc(bytes.length);
      new Uint8Array(memory.buffer, pointer, bytes.length).set(bytes);
      return [pointer, bytes.length];
    };
    const [questionPointer, questionLength] = write(question);
    const [truthPointer, truthLength] = write(truth);
    const [answerPointer, answerLength] = write(answer);
    return rankAnswer(
      questionPointer,
      questionLength,
      truthPointer,
      truthLength,
      answerPointer,
      answerLength,
    );
  };
}

const smoothstep = (value) => value * value * (3 - 2 * value);
const transforms = [
  { name: "identity", apply: (value) => value },
  { name: "smoothstep-1", apply: smoothstep },
  { name: "smoothstep-2", apply: (value) => smoothstep(smoothstep(value)) },
  {
    name: "smoothstep-1.5",
    apply: (value) => {
      const once = smoothstep(value);
      return once + 0.5 * (smoothstep(once) - once);
    },
  },
  {
    name: "smoothstep-2-rail02",
    apply: (value) => 0.98 * smoothstep(smoothstep(value)) + 0.02 * value,
  },
  {
    name: "smoothstep-2-rail05",
    apply: (value) => 0.95 * smoothstep(smoothstep(value)) + 0.05 * value,
  },
];

const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
const reference = await loadScorer(referencePath);
const evaluated = await loadScorer(evaluatedPath);
const pairs = [];

for (const testCase of corpus.cases) {
  const answers = [
    testCase.ground_truth,
    ...(testCase.good_answers ?? []),
    ...(testCase.bad_answers ?? []),
    ...(testCase.answers ?? []).map(({ text }) => text),
  ];
  for (const answer of answers) {
    const input = reference(testCase.question, testCase.ground_truth, answer);
    const output = evaluated(testCase.question, testCase.ground_truth, answer);
    pairs.push({ family: testCase.family ?? testCase.question, input, output });
  }
}

const uniquePairs = [...new Map(pairs.map((pair) => [`${pair.input}:${pair.output}`, pair])).values()];
let inversions = 0;
let introducedTies = 0;
const inversionExamples = [];
const introducedTieExamples = [];
for (let leftIndex = 0; leftIndex < uniquePairs.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < uniquePairs.length; rightIndex += 1) {
    const left = uniquePairs[leftIndex];
    const right = uniquePairs[rightIndex];
    if (left.input === right.input) continue;
    if (left.output === right.output) {
      introducedTies += 1;
      if (introducedTieExamples.length < 5) introducedTieExamples.push({ left, right });
    }
    if ((left.input - right.input) * (left.output - right.output) < 0) {
      inversions += 1;
      if (inversionExamples.length < 5) inversionExamples.push({ left, right });
    }
  }
}
console.log(JSON.stringify({
  observedMapping: {
    observations: uniquePairs.length,
    inversions,
    introducedTies,
    inversionExamples,
    introducedTieExamples,
  },
}));
for (const transform of transforms) {
  const errors = uniquePairs.map(({ input, output }) => transform.apply(input) - output);
  const meanAbsoluteError = errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length;
  const maximumAbsoluteError = Math.max(...errors.map(Math.abs));
  console.log(JSON.stringify({
    transform: transform.name,
    observations: errors.length,
    meanAbsoluteError,
    maximumAbsoluteError,
  }));
}

for (const transform of transforms) {
  const margins = [];
  let wins = 0;
  let comparisons = 0;
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
    for (const goodAnswer of goodAnswers) {
      const goodScore = transform.apply(reference(testCase.question, testCase.ground_truth, goodAnswer));
      for (const badAnswer of badAnswers) {
        const badScore = transform.apply(reference(testCase.question, testCase.ground_truth, badAnswer));
        const margin = goodScore - badScore;
        margins.push(margin);
        comparisons += 1;
        if (margin > 0) wins += 1;
      }
    }
  }
  const averageMargin = margins.reduce((sum, margin) => sum + margin, 0) / margins.length;
  console.log(JSON.stringify({
    transformedReference: transform.name,
    wins,
    comparisons,
    averageMargin,
    minimumMargin: Math.min(...margins),
  }));
}

console.log(JSON.stringify({
  sample: uniquePairs
    .filter(({ input }) => input > 0 && input < 1)
    .sort((left, right) => left.input - right.input)
    .slice(0, 30),
}, null, 2));
