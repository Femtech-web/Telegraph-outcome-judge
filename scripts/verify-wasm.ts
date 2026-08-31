import { readFile } from "node:fs/promises";

const wasmPath = process.argv[2];
if (!wasmPath) throw new Error("usage: tsx scripts/verify-wasm.ts <module.wasm>");

const bytes = await readFile(wasmPath);
if (bytes.length > 32 * 1024 * 1024) throw new Error("WASM exceeds Telegraph's 32 MB limit");

const module = await WebAssembly.compile(bytes);
const imports = WebAssembly.Module.imports(module);
if (imports.length !== 0) throw new Error(`WASM has forbidden imports: ${JSON.stringify(imports)}`);

const exports = WebAssembly.Module.exports(module).map(({ name }) => name);
for (const required of ["memory", "alloc", "dealloc", "rank_answer", "breakdown_answer"]) {
  if (!exports.includes(required)) throw new Error(`WASM is missing required export: ${required}`);
}

const instance = await WebAssembly.instantiate(module);
const memory = instance.exports.memory;
const allocExport = instance.exports.alloc;
const rankAnswerExport = instance.exports.rank_answer;
const breakdownAnswerExport = instance.exports.breakdown_answer;
if (!(memory instanceof WebAssembly.Memory)) throw new Error("WASM memory export has the wrong type");
if (typeof allocExport !== "function") throw new Error("WASM alloc export has the wrong type");
if (typeof rankAnswerExport !== "function") throw new Error("WASM rank_answer export has the wrong type");
if (typeof breakdownAnswerExport !== "function") throw new Error("WASM breakdown_answer export has the wrong type");

const alloc = allocExport as (size: number) => number;
const wasmMemory = memory as WebAssembly.Memory;
const rankAnswer = rankAnswerExport as (
  questionPointer: number,
  questionLength: number,
  groundTruthPointer: number,
  groundTruthLength: number,
  answerPointer: number,
  answerLength: number,
) => number;
const breakdownAnswer = breakdownAnswerExport as typeof rankAnswer;

function write(value: string): readonly [number, number] {
  if (value.length === 0) return [0, 0];
  const encoded = new TextEncoder().encode(value);
  const pointer = alloc(encoded.length);
  if (pointer === 0) throw new Error("WASM allocator returned a null pointer");
  new Uint8Array(wasmMemory.buffer, pointer, encoded.length).set(encoded);
  return [pointer, encoded.length];
}

function score(question: string, groundTruth: string, answer: string): number {
  const [questionPointer, questionLength] = write(question);
  const [groundTruthPointer, groundTruthLength] = write(groundTruth);
  const [answerPointer, answerLength] = write(answer);
  return rankAnswer(
    questionPointer,
    questionLength,
    groundTruthPointer,
    groundTruthLength,
    answerPointer,
    answerLength,
  );
}

const selfMatch = score("Should this action be blocked?", "BLOCK", "BLOCK");
const dangerousFalseNegative = score("Should this action be blocked?", "BLOCK", "ALLOW");
const semanticMatch = score(
  "Assess transaction 0xabc for fraud risk",
  '{"is_fraud":true,"reason":"phishing approval"}',
  "BLOCK: phishing approval detected",
);
const wrongVerdict = score(
  "Assess transaction 0xabc for fraud risk",
  '{"is_fraud":true,"reason":"phishing approval"}',
  "ALLOW: transaction is safe",
);
const abstention = score(
  "Assess transaction 0xabc for fraud risk",
  "BLOCK: phishing approval",
  "RECHECK: insufficient evidence",
);
const blank = score("Should this action be blocked?", "BLOCK", "   ");
const unicode = score("判定", "阻止 🚫", "阻止 🚫");
const oversizedAnswer = score("Classify this answer", "BLOCK", "x".repeat(128 * 1024 + 1));

const [breakdownQuestionPointer, breakdownQuestionLength] = write("Should this action be blocked?");
const [breakdownTruthPointer, breakdownTruthLength] = write("BLOCK");
const [breakdownAnswerPointer, breakdownAnswerLength] = write("BLOCK: malicious activity");
const breakdownPointer = breakdownAnswer(
  breakdownQuestionPointer,
  breakdownQuestionLength,
  breakdownTruthPointer,
  breakdownTruthLength,
  breakdownAnswerPointer,
  breakdownAnswerLength,
);
const breakdown = [...new Float32Array(wasmMemory.buffer, breakdownPointer, 5)];
if (breakdown.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
  throw new Error(`breakdown values must be finite and bounded: ${JSON.stringify(breakdown)}`);
}

if (selfMatch !== 1) throw new Error(`exact self-match must score one, got ${selfMatch}`);
if (dangerousFalseNegative !== 0) {
  throw new Error(`dangerous false negative must score zero, got ${dangerousFalseNegative}`);
}
if (semanticMatch <= wrongVerdict) throw new Error("semantic match must beat a wrong verdict");
if (abstention <= dangerousFalseNegative) {
  throw new Error("safe abstention must beat a dangerous false negative");
}
if (blank !== 0) throw new Error(`blank answer must score exactly zero, got ${blank}`);
if (!Number.isFinite(unicode)) throw new Error("Unicode case returned a non-finite score");
if (oversizedAnswer !== 0) {
  throw new Error(`oversized input must fail closed with zero, got ${oversizedAnswer}`);
}

for (let index = 0; index < 32; index += 1) {
  const repeated = score("Repeated-call allocator check", "ALLOW", "safe and legitimate");
  if (!Number.isFinite(repeated) || repeated < 0 || repeated > 1) {
    throw new Error(`repeated call ${index} returned an invalid score: ${repeated}`);
  }
}

console.log(JSON.stringify({
  wasmPath,
  sizeBytes: bytes.length,
  imports: imports.length,
  exports,
  smokeScores: {
    selfMatch,
    dangerousFalseNegative,
    semanticMatch,
    wrongVerdict,
    abstention,
    blank,
    unicode,
    oversizedAnswer,
    breakdown,
  },
}, null, 2));
