#!/usr/bin/env node

/**
 * Append a strictly increasing two-band calibration to a freestanding scorer.
 *
 * This is an independently adapted version of the MIT-licensed step wrapper
 * published by Harsh Yadav. Unlike that research tool, the default inner
 * function here is the module's exported rank_answer, which makes this a pure
 * post-map of a pinned public scorer:
 *
 *   score < threshold: low * score
 *   otherwise:          (1 - high) + high * score
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

function f32(value) {
  const out = Buffer.alloc(4);
  out.writeFloatLE(value);
  return out;
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
    const isTarget = kind === 0 && name.toString("utf8") === "rank_answer";
    if (isTarget) hits += 1;
    parts.push(
      u32(name.length),
      name,
      Buffer.from([kind]),
      u32(isTarget ? replacementIndex : index.value),
    );
  }
  if (hits !== 1) throw new Error(`expected one rank_answer export, found ${hits}`);
  return Buffer.concat(parts);
}

const basePath = resolve(arg("--base"));
const outPath = resolve(arg("--out"));
const expectedSha = arg("--expected-sha256", "").toLowerCase();
const threshold = Number(arg("--threshold", "0.5"));
const low = Number(arg("--low", "0.05"));
const high = Number(arg("--high", "0.05"));
const innerArg = arg("--inner", "rank");

if (!(threshold > 0 && threshold < 1)) throw new Error("--threshold must be in (0, 1)");
if (!(low > 0 && low < 1)) throw new Error("--low must be in (0, 1)");
if (!(high > 0 && high < 1)) throw new Error("--high must be in (0, 1)");
if (low * threshold >= 1 - high + high * threshold) {
  throw new Error("bands overlap at the threshold");
}

const base = await readFile(basePath);
const baseSha = createHash("sha256").update(base).digest("hex");
if (expectedSha && baseSha !== expectedSha) {
  throw new Error(`wrong base sha256: ${baseSha}`);
}

const sections = parseSections(base);
const imports = sections.find((section) => section.id === 2);
if (imports && readU32(imports.payload, 0).value !== 0) {
  throw new Error("base must have zero imports");
}

const functions = sections.find((section) => section.id === 3);
const exports = sections.find((section) => section.id === 7);
const code = sections.find((section) => section.id === 10);
if (!functions || !exports || !code) {
  throw new Error("base is missing function, export, or code section");
}

const functionCount = readU32(functions.payload, 0);
const typeIndices = [];
let at = functionCount.next;
for (let i = 0; i < functionCount.value; i += 1) {
  const type = readU32(functions.payload, at);
  typeIndices.push(type.value);
  at = type.next;
}
if (at !== functions.payload.length) throw new Error("malformed function section");

const exported = scanExports(exports.payload);
const rank = exported.find((entry) => entry.kind === 0 && entry.name === "rank_answer");
if (!rank) throw new Error("base does not export rank_answer");

const inner = innerArg === "rank" ? rank.index : Number(innerArg);
if (!Number.isInteger(inner) || inner < 0 || inner >= typeIndices.length) {
  throw new Error(`invalid --inner ${innerArg}`);
}
if (typeIndices[inner] !== typeIndices[rank.index]) {
  throw new Error(`--inner ${innerArg} does not have rank_answer's function type`);
}

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
  Buffer.from([0x01, 0x01, 0x7d]),
  Buffer.from([0x20, 0x00, 0x20, 0x01, 0x20, 0x02, 0x20, 0x03, 0x20, 0x04, 0x20, 0x05, 0x10]),
  u32(inner),
  Buffer.from([0x21, 0x06]),
  Buffer.from([0x20, 0x06, 0x43]),
  f32(threshold),
  Buffer.from([0x60, 0x04, 0x7d]),
  Buffer.from([0x43]),
  f32(1 - high),
  Buffer.from([0x43]),
  f32(high),
  Buffer.from([0x20, 0x06, 0x94, 0x92]),
  Buffer.from([0x05, 0x43]),
  f32(low),
  Buffer.from([0x20, 0x06, 0x94]),
  Buffer.from([0x0b, 0x0b]),
]);
code.payload = Buffer.concat([
  u32(codeCount.value + 1),
  code.payload.subarray(codeCount.next),
  u32(body.length),
  body,
]);

const out = Buffer.concat([
  base.subarray(0, 8),
  ...sections.flatMap((section) => [
    Buffer.from([section.id]),
    u32(section.payload.length),
    section.payload,
  ]),
]);
await WebAssembly.compile(out);
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, out);
console.log(JSON.stringify({
  base: basePath,
  baseSha256: baseSha,
  output: outPath,
  bytes: out.length,
  threshold,
  low,
  high,
  innerFunctionIndex: inner,
  wrapperFunctionIndex: wrapperIndex,
  sha256: createHash("sha256").update(out).digest("hex"),
}, null, 2));
