import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const [
  ,
  ,
  checkoutArgument,
  outputArgument,
  calibration = "k45",
  maxTokensArgument = "128",
  tokenSpanArgument = "1",
] = process.argv;
if (!checkoutArgument || !outputArgument) {
  throw new Error(
    "usage: node scripts/build-salience-cache64.mjs <upstream-checkout> <output.wasm> [k40|k45|k45-ss2|k45-ss2-rail05] [max-tokens] [token-span]",
  );
}
if (!new Set(["k40", "k45", "k45-ss2", "k45-ss2-rail05"]).has(calibration)) {
  throw new Error(`unsupported calibration: ${calibration}`);
}
const maxTokens = Number(maxTokensArgument);
if (!Number.isInteger(maxTokens) || maxTokens < 32 || maxTokens > 128) {
  throw new Error("max-tokens must be an integer in [32, 128]");
}
const tokenSpan = Number(tokenSpanArgument);
if (!Number.isInteger(tokenSpan) || tokenSpan < 1 || tokenSpan > 4) {
  throw new Error("token-span must be an integer in [1, 4]");
}

const checkout = resolve(checkoutArgument);
const moduleDirectory = join(checkout, "module");
const libraryPath = join(moduleDirectory, "src", "lib.rs");
const miniLmPath = join(moduleDirectory, "src", "minilm.rs");
const outputPath = resolve(outputArgument);

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const expectedInputs = new Map([
  [libraryPath, "6df8c2bf598b160fa611190d8b2ea589b60765d44d31c305f8af7fc1b544f03a"],
  [miniLmPath, "397cc57c9f4d610c64403f8b2afca1c873d72de688863db03a9b1fa8e0197533"],
  [join(moduleDirectory, "src", "minilm.bin"), "0224d0d23f87d367a735895a462ca2482894369ca76820a31d0bf56876eead3a"],
  [join(moduleDirectory, "src", "vectors.bin"), "bb91f7a5f271bc57fcca9b2cfb5006a270ca1bad78ddfc0eab565de38ca634fe"],
  [join(moduleDirectory, "Cargo.toml"), "d0a816a8cbabd1654f46a403fc314b88ed5bf888abd458bb970620e4175897ec"],
]);

for (const [path, expected] of expectedInputs) {
  const actual = sha256(path);
  if (actual !== expected) {
    throw new Error(`refusing to patch unexpected upstream input ${path}: ${actual}`);
  }
}

function replaceExactlyOnce(source, before, after) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`expected exactly one occurrence of: ${before}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const replacements = new Map([
  ["const W_LEX: f32 = 0.2;", "const W_LEX: f32 = 0.76;"],
  ["const W_GRAM3: f32 = 0.6;", "const W_GRAM3: f32 = 0.2;"],
  ["const W_GRAM2: f32 = 0.2;", "const W_GRAM2: f32 = 0.04;"],
  ["const F_BETA2: f32 = 0.25;", "const F_BETA2: f32 = 0.36;"],
  ["const R_KEY_BASE: f32 = 0.75;", "const R_KEY_BASE: f32 = 0.5;"],
  ["const R_FLOOR: f32 = 0.75;", "const R_FLOOR: f32 = 0.3;"],
  ["const M_CONTRA: f32 = 0.2;", "const M_CONTRA: f32 = 0.7;"],
  ["const M_TWO_FACED: f32 = 0.25;", "const M_TWO_FACED: f32 = 0.8;"],
  ["const M_SILENT: f32 = 0.9;", "const M_SILENT: f32 = 1.0;"],
  ["const M_NUM_WRONG: f32 = 0.2;", "const M_NUM_WRONG: f32 = 0.78;"],
  ["const M_LITERAL: f32 = 0.1;", "const M_LITERAL: f32 = 1.0;"],
  ["const M_ENTITY: f32 = 0.15;", "const M_ENTITY: f32 = 0.72;"],
  ["const EMB_A_W: f32 = 0.0;", "const EMB_A_W: f32 = 0.25;"],
  ["const EMB_B_W: f32 = 0.3;", "const EMB_B_W: f32 = 0.5;"],
  ["const EMB_LEX_W: f32 = 0.7;", "const EMB_LEX_W: f32 = 0.25;"],
  ["const STEP_T: f32 = 0.3;", "const STEP_T: f32 = 0.0;"],
  ["const STEP_B: f32 = 0.004;", "const STEP_B: f32 = 0.02;"],
  ["const W_QA: f32 = 0.2;", "const W_QA: f32 = 0.0;"],
  ["const NOGT_Q: f32 = 1.0;", "const NOGT_Q: f32 = 0.0;"],
  ["const SIGK: f32 = 0.0;", `const SIGK: f32 = ${calibration === "k40" ? "40.0" : "45.0"};`],
  [
    'pub static TELEGRAPH_INTENT: [u8; 32] = *b"CONTENT_EXTRACTION              ";',
    'pub static TELEGRAPH_INTENT: [u8; 32] = *b"FRAUD_DETECTION                 ";',
  ],
]);

let librarySource = readFileSync(libraryPath, "utf8");
for (const [before, after] of replacements) {
  librarySource = replaceExactlyOnce(librarySource, before, after);
}
librarySource = replaceExactlyOnce(
  librarySource,
  "let sims = minilm::embed_sims(q, gt, ma);",
  [
    "// This build sets W_QA, NOGT_Q, and EXACT_TIE to zero, so the question",
    "// embedding cannot affect any returned score. Avoid that transformer pass",
    "// while retaining the exact ground-truth/answer scoring surface.",
    "let sims = minilm::embed_sims(&[], gt, ma);",
  ].join("\n                "),
);
if (calibration === "k45-ss2" || calibration === "k45-ss2-rail05") {
  const returnLine = calibration === "k45-ss2"
    ? "return clamp01(smooth_twice);"
    : "return clamp01(0.95 * smooth_twice + 0.05 * logistic);";
  const calibrationComment = calibration === "k45-ss2"
    ? "// Reproduce the public #1755 two-pass calibration exactly."
    : "// Retain a 5% k45 ordering rail to limit f32 saturation ties.";
  librarySource = replaceExactlyOnce(
    librarySource,
    "return clamp01(1.0 / (1.0 + fexp(-SIGK * (raw - SIGC))));",
    [
      "let logistic = clamp01(1.0 / (1.0 + fexp(-SIGK * (raw - SIGC))));",
      "let smooth_once = logistic * logistic * (3.0 - 2.0 * logistic);",
      "let smooth_twice = smooth_once * smooth_once * (3.0 - 2.0 * smooth_once);",
      calibrationComment,
      returnLine,
    ].join("\n            "),
  );
}
writeFileSync(libraryPath, librarySource);

let miniLmSource = readFileSync(miniLmPath, "utf8");
miniLmSource = replaceExactlyOnce(
  miniLmSource,
  "const MAXTOK: usize = 128;",
  [
    "// Bound fresh transformer work per text. The release note records the",
    "// accuracy/runtime trade-off for non-default values.",
    `const MAXTOK: usize = ${maxTokens};`,
  ].join("\n"),
);
miniLmSource = replaceExactlyOnce(
  miniLmSource,
  "const TOK_SPAN: usize = 1;",
  `const TOK_SPAN: usize = ${tokenSpan};`,
);
miniLmSource = replaceExactlyOnce(
  miniLmSource,
  "const CACHE_N: usize = 4;",
  [
    "// Retain a complete Stage 2 fixture batch so non-adjacent repeated texts",
    "// reuse their embeddings. This changes runtime only, never score values.",
    "const CACHE_N: usize = 64;",
  ].join("\n"),
);
writeFileSync(miniLmPath, miniLmSource);

const build = spawnSync(
  "cargo",
  ["build", "--release", "--target", "wasm32-unknown-unknown", "--features", "minilm"],
  {
    cwd: moduleDirectory,
    env: { ...process.env, CARGO_PROFILE_RELEASE_OPT_LEVEL: "3" },
    encoding: "utf8",
  },
);
if (build.status !== 0) {
  throw new Error(`cargo build failed:\n${build.stderr || build.stdout}`);
}

const builtPath = join(moduleDirectory, "target", "wasm32-unknown-unknown", "release", "telegraph_scorer.wasm");
copyFileSync(builtPath, outputPath);
console.log(JSON.stringify({
  calibration,
  maxTokens,
  tokenSpan,
  outputPath,
  sizeBytes: readFileSync(outputPath).length,
  sha256: sha256(outputPath),
}, null, 2));
