#!/usr/bin/env node

/**
 * Append a rank_answer wrapper that bounds the byte length of each input before
 * invoking an existing freestanding scorer. The wrapped scorer and all of its
 * data remain byte-for-byte unchanged; only the lengths passed to it are capped.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing ${name}`);
  }
  return process.argv[index + 1];
}

function readU32(bytes, offset) {
  let value = 0;
  let shift = 0;
  let at = offset;
  while (at < bytes.length && shift < 35) {
    const byte = bytes[at++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value: value >>> 0, next: at };
    shift += 7;
  }
  throw new Error(`invalid u32 LEB at ${offset}`);
}

function u32(value) {
  const out = [];
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value) byte |= 0x80;
    out.push(byte);
  } while (value);
  return Buffer.from(out);
}

function parseSections(bytes) {
  if (bytes.subarray(0, 8).toString("hex") !== "0061736d01000000") {
    throw new Error("not a core WASM v1 module");
  }
  const sections = [];
  let at = 8;
  while (at < bytes.length) {
    const id = bytes[at++];
    const size = readU32(bytes, at);
    at = size.next;
    const end = at + size.value;
    if (end > bytes.length) throw new Error(`section ${id} exceeds file`);
    sections.push({ id, payload: bytes.subarray(at, end) });
    at = end;
  }
  return sections;
}

function scanExports(payload) {
  const count = readU32(payload, 0);
  let at = count.next;
  const entries = [];
  for (let i = 0; i < count.value; i += 1) {
    const length = readU32(payload, at);
    at = length.next;
    const name = payload.subarray(at, at + length.value).toString("utf8");
    at += length.value;
    const kind = payload[at++];
    const index = readU32(payload, at);
    at = index.next;
    entries.push({ name, kind, index: index.value });
  }
  if (at !== payload.length) throw new Error("malformed export section");
  return entries;
}

function rewriteExports(payload, replacementIndex) {
  const count = readU32(payload, 0);
  let at = count.next;
  const parts = [u32(count.value)];
  let hits = 0;
  for (let i = 0; i < count.value; i += 1) {
    const length = readU32(payload, at);
    at = length.next;
    const name = payload.subarray(at, at + length.value);
    at += length.value;
    const kind = payload[at++];
    const index = readU32(payload, at);
    at = index.next;
    const target = kind === 0 && name.toString("utf8") === "rank_answer";
    if (target) hits += 1;
    parts.push(u32(name.length), name, Buffer.from([kind]), u32(target ? replacementIndex : index.value));
  }
  if (hits !== 1) throw new Error(`expected one rank_answer export, found ${hits}`);
  return Buffer.concat(parts);
}

function cappedLength(localIndex, cap) {
  return Buffer.concat([
    Buffer.from([0x20]), u32(localIndex),
    Buffer.from([0x41]), u32(cap),
    Buffer.from([0x49, 0x04, 0x7f]),
    Buffer.from([0x20]), u32(localIndex),
    Buffer.from([0x05, 0x41]), u32(cap),
    Buffer.from([0x0b]),
  ]);
}

const basePath = resolve(arg("--base"));
const outPath = resolve(arg("--out"));
const expectedSha = arg("--expected-sha256", "").toLowerCase();
const questionCap = Number(arg("--question-cap", "96"));
const truthCap = Number(arg("--truth-cap", "192"));
const answerCap = Number(arg("--answer-cap", "192"));
for (const [name, value] of [["question", questionCap], ["truth", truthCap], ["answer", answerCap]]) {
  if (!Number.isInteger(value) || value < 1 || value > 131072) {
    throw new Error(`--${name}-cap must be an integer in [1, 131072]`);
  }
}

const base = await readFile(basePath);
const baseSha = createHash("sha256").update(base).digest("hex");
if (expectedSha && baseSha !== expectedSha) throw new Error(`wrong base sha256: ${baseSha}`);

const sections = parseSections(base);
const imports = sections.find((section) => section.id === 2);
if (imports && readU32(imports.payload, 0).value !== 0) throw new Error("base must have zero imports");
const functions = sections.find((section) => section.id === 3);
const exports = sections.find((section) => section.id === 7);
const code = sections.find((section) => section.id === 10);
if (!functions || !exports || !code) throw new Error("base is missing function, export, or code section");

const functionCount = readU32(functions.payload, 0);
const typeIndices = [];
let at = functionCount.next;
for (let i = 0; i < functionCount.value; i += 1) {
  const type = readU32(functions.payload, at);
  typeIndices.push(type.value);
  at = type.next;
}
if (at !== functions.payload.length) throw new Error("malformed function section");

const rank = scanExports(exports.payload).find((entry) => entry.kind === 0 && entry.name === "rank_answer");
if (!rank) throw new Error("base does not export rank_answer");
const wrapperIndex = typeIndices.length;
functions.payload = Buffer.concat([
  u32(functionCount.value + 1),
  functions.payload.subarray(functionCount.next),
  u32(typeIndices[rank.index]),
]);
exports.payload = rewriteExports(exports.payload, wrapperIndex);

const codeCount = readU32(code.payload, 0);
if (codeCount.value !== functionCount.value) throw new Error("function/code count mismatch");
const body = Buffer.concat([
  Buffer.from([0x00, 0x20, 0x00]),
  cappedLength(1, questionCap),
  Buffer.from([0x20, 0x02]),
  cappedLength(3, truthCap),
  Buffer.from([0x20, 0x04]),
  cappedLength(5, answerCap),
  Buffer.from([0x10]), u32(rank.index), Buffer.from([0x0b]),
]);
code.payload = Buffer.concat([
  u32(codeCount.value + 1),
  code.payload.subarray(codeCount.next),
  u32(body.length),
  body,
]);

const out = Buffer.concat([
  base.subarray(0, 8),
  ...sections.flatMap((section) => [Buffer.from([section.id]), u32(section.payload.length), section.payload]),
]);
await WebAssembly.compile(out);
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, out);
console.log(JSON.stringify({
  base: basePath,
  baseSha256: baseSha,
  output: outPath,
  bytes: out.length,
  questionCap,
  truthCap,
  answerCap,
  innerFunctionIndex: rank.index,
  wrapperFunctionIndex: wrapperIndex,
  sha256: createHash("sha256").update(out).digest("hex"),
}, null, 2));
