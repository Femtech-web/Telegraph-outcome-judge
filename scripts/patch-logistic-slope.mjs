import { readFileSync, writeFileSync } from "node:fs";

const [, , slope30Path, slope40Path, desiredSlopeText, outputPath] = process.argv;
if (!slope30Path || !slope40Path || !desiredSlopeText || !outputPath) {
  throw new Error(
    "usage: node scripts/patch-logistic-slope.mjs <k30.wasm> <k40.wasm> <new-slope> <output.wasm>",
  );
}

const desiredSlope = Number(desiredSlopeText);
if (!Number.isFinite(desiredSlope) || desiredSlope <= 0 || desiredSlope > 100) {
  throw new Error(`invalid logistic slope: ${desiredSlopeText}`);
}

const slope30 = readFileSync(slope30Path);
const slope40 = readFileSync(slope40Path);
if (slope30.length !== slope40.length) {
  throw new Error("reference modules have different byte lengths");
}

const changedOffsets = [];
for (let index = 0; index < slope30.length; index += 1) {
  if (slope30[index] !== slope40[index]) changedOffsets.push(index);
}

const matchingOffsets = [];
for (let offset = Math.max(0, changedOffsets[0] - 3); offset <= changedOffsets[0]; offset += 1) {
  if (offset + 4 > slope30.length) continue;
  if (Math.abs(slope30.readFloatLE(offset)) !== 30 || Math.abs(slope40.readFloatLE(offset)) !== 40) continue;
  if (changedOffsets.every((changedOffset) => changedOffset >= offset && changedOffset < offset + 4)) {
    matchingOffsets.push(offset);
  }
}

if (changedOffsets.length === 0 || matchingOffsets.length !== 1) {
  throw new Error(
    `could not isolate one f32 slope constant (changed bytes: ${changedOffsets.length}, matches: ${matchingOffsets.length})`,
  );
}

const output = Buffer.from(slope40);
const encodedSlope = Math.sign(slope40.readFloatLE(matchingOffsets[0])) * desiredSlope;
output.writeFloatLE(encodedSlope, matchingOffsets[0]);
writeFileSync(outputPath, output);
console.log(JSON.stringify({
  sourceSlope: 40,
  desiredSlope,
  byteOffset: matchingOffsets[0],
  changedBytesFromK40Baseline: output.reduce(
    (count, byte, index) => count + Number(byte !== slope40[index]),
    0,
  ),
  outputPath,
}, null, 2));
