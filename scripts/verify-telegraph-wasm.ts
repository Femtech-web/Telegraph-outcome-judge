import { readFile } from "node:fs/promises";

const wasmPath = process.argv[2];
if (!wasmPath) throw new Error("usage: tsx scripts/verify-telegraph-wasm.ts <module.wasm>");

const bytes = await readFile(wasmPath);
if (bytes.length > 32 * 1024 * 1024) throw new Error("WASM exceeds Telegraph's 32 MB limit");

const module = await WebAssembly.compile(bytes);
const imports = WebAssembly.Module.imports(module);
if (imports.length !== 0) throw new Error(`WASM has forbidden imports: ${JSON.stringify(imports)}`);

const exportNames = WebAssembly.Module.exports(module).map(({ name }) => name);
for (const required of ["memory", "alloc", "dealloc", "rank_answer"]) {
  if (!exportNames.includes(required)) throw new Error(`WASM is missing required export: ${required}`);
}

const instance = await WebAssembly.instantiate(module);
const memory = instance.exports.memory;
const allocExport = instance.exports.alloc;
const rankAnswerExport = instance.exports.rank_answer;
if (!(memory instanceof WebAssembly.Memory)) throw new Error("WASM memory export has the wrong type");
if (typeof allocExport !== "function") throw new Error("WASM alloc export has the wrong type");
if (typeof rankAnswerExport !== "function") throw new Error("WASM rank_answer export has the wrong type");

const wasmMemory = memory as WebAssembly.Memory;
const alloc = allocExport as (size: number) => number;
const rankAnswer = rankAnswerExport as (
  questionPointer: number,
  questionLength: number,
  groundTruthPointer: number,
  groundTruthLength: number,
  answerPointer: number,
  answerLength: number,
) => number;
const encoder = new TextEncoder();

function write(value: string): readonly [number, number] {
  const encoded = encoder.encode(value);
  if (encoded.length === 0) return [0, 0];
  const pointer = alloc(encoded.length);
  if (pointer === 0) throw new Error("WASM allocator returned a null pointer");
  new Uint8Array(wasmMemory.buffer, pointer, encoded.length).set(encoded);
  return [pointer, encoded.length];
}

function score(question: string, groundTruth: string, answer: string): number {
  const [qp, ql] = write(question);
  const [tp, tl] = write(groundTruth);
  const [ap, al] = write(answer);
  return rankAnswer(qp, ql, tp, tl, ap, al);
}

const smokeCases = [
  ["What characterized the fraud?", "The operator diverted investor funds.", "The operator diverted investor funds."],
  ["What characterized the fraud?", "The operator diverted investor funds.", "The weather was sunny."],
  ["判定", "詐欺を阻止する", "詐欺を阻止する"],
  ["Blank answer", "A factual answer", "   "],
] as const;
const smokeScores = smokeCases.map(([question, truth, answer]) => score(question, truth, answer));
for (const [index, value] of smokeScores.entries()) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`smoke score ${index} is outside [0,1]: ${value}`);
  }
}
if (smokeScores[0] !== 1 || smokeScores[2] !== 1) {
  throw new Error(`exact self-match must score 1: ${JSON.stringify(smokeScores)}`);
}
if (smokeScores[3] !== 0) throw new Error(`blank answer must score 0, got ${smokeScores[3]}`);

for (let index = 0; index < 16; index += 1) {
  const value = score("Repeated-call check", "Fraud involved diverted funds.", "Fraud involved diverted funds.");
  if (value !== 1) throw new Error(`repeated exact match ${index} returned ${value}`);
}

console.log(JSON.stringify({
  wasmPath,
  sizeBytes: bytes.length,
  imports: imports.length,
  exports: exportNames,
  smokeScores,
}, null, 2));
