# Release artifact — OutcomeJudge registration #1733

The artifact documented here was activated as Telegraph registration #1733 with
15/15 ordering, margin `0.87411624`, self-match `1`, standard deviation
`0.44028768`, and historical Spearman `0.91513044`. It remains the frozen base
for the calibration study documented in `calibration-study-1755.md`.

Registration #1608 evaluated the k45 scorer after #1078 missed one of fifteen
ordering comparisons relative to public baseline #997. #1608 did not reach
scoring: Stage 2 timed out after 10m52s. This artifact reconstructs the public `rawRp`
k45 scoring function from source and increases only its internal transformer
embedding cache from 4 to 64 entries. Score values are unchanged.

| | |
| --- | --- |
| File | `dist/outcome_judge_salience_k45_cache64.wasm` |
| Size | `23,993,059` bytes |
| SHA-256 | `4017150ea398a765f4efce6659fe9ec77006f8f3d9041a8635031ca54392bd61` |
| Keccak-256 | `0xfea871a8b1951730daa479cccc9254c21062523c62f0278f7db639f088d25fb2` |
| Imports | `0` |
| Exports | `memory`, `alloc`, `dealloc`, `rank_answer`, `TELEGRAPH_INTENT` |
| Intent | `FRAUD_DETECTION` |

## Provenance

- Upstream: `zkasuran/telegraph-salience-scorer`, MIT licensed.
- Model implementation and weights: commit `f334d30`.
- Scoring source and hosted rawRp artifacts: commit
  `d30bd4f7e346a44bd6099222b4a5f7f22f85c88a`.
- `k=30` SHA-256: `f28b9182a5ad116aaf36ab52ca30ed3c0f5264d765739e11a34177ed5a34b8dd`.
- Public `k=40` baseline SHA-256: `48193c51a0302da2a63c39e453fa147d01adffa894e32d4a0077607c85be3cfe`.
- Public `k=40` baseline Keccak-256: `0x9cce1cfe2d61ff05d69023755d7ab24d4086696c1dc40ddc0f7ef2a3a93d1617`,
  matching Telegraph registration #997.

The upstream `variants.py` defines `rawRp` as the reference blend (`0.25`
shallow transformer, `0.50` full transformer, `0.25` lexical) plus the published
correctness penalties. `scripts/build-salience-cache64.mjs` verifies every
source/model input hash, applies that full configuration, sets logistic `k=45`,
and expands `CACHE_N` to 64 before compiling with the upstream release profile.

## Verification evidence

- Generic Telegraph ABI verification passes: under 32 MB, no imports, required
  exports present, exact self-match `1`, blank answer `0`, finite bounded output.
- The cache64 build matches #1608's k45 module exactly on all 48 self/good/bad
  rows in the 16-case fraud-prose equivalence run (`max_abs_diff = 0`).
- A warmed instance, a repeated call, and a separately instantiated module
  returned the same `f32` for the determinism probe.
- Under a deliberately non-adjacent good-then-bad access pattern, local runtime
  fell from `40.75s` to `27.96s` (`1.46x`) without changing any output.
- The calibration is strictly monotonic, so #997's 15/15 fixture ordering is
  preserved before `f32` rounding.
- On 88 current non-terminal public `FRAUD_DETECTION` scores, `k=45` introduced
  no additional `f32` ties relative to `k=40`; therefore the observed ordering
  and rank correlation are preserved.
- On eight public question groups with a high- and low-scoring answer, local
  average separation moved from `0.9421` at `k=40` to `0.9529` at `k=45`, with
  8/8 ordering and worst self-match `1`.
- Registration #997's official historical Spearman is `0.6964`, above Telegraph's
  `0.60` gate. A strictly monotonic transform preserves Spearman absent new
  ties; none appeared in the current public sample.

These are strong pre-registration checks, not a claim about hidden fixtures.
Only Telegraph's official evaluation can establish registry activation.

## Reproduce

Create a source-only checkout without the upstream repository's large historical
`dist/` tree, restore the pinned model and scoring sources, then build:

```bash
git clone --filter=blob:none --no-checkout \
  https://github.com/zkasuran/telegraph-salience-scorer.git \
  /tmp/telegraph-salience-source
git -C /tmp/telegraph-salience-source sparse-checkout init --cone
git -C /tmp/telegraph-salience-source sparse-checkout set module
git -C /tmp/telegraph-salience-source checkout f334d30
git -C /tmp/telegraph-salience-source restore \
  --source=d30bd4f7e346a44bd6099222b4a5f7f22f85c88a \
  -- module/src/lib.rs

node scripts/build-salience-cache64.mjs \
  /tmp/telegraph-salience-source \
  dist/outcome_judge_salience_k45_cache64.wasm

npx tsx scripts/verify-telegraph-wasm.ts \
  dist/outcome_judge_salience_k45_cache64.wasm

node scripts/compare-wasm-equivalence.mjs \
  benchmarks/fraud-prose.json \
  dist/outcome_judge_salience_k45.wasm \
  dist/outcome_judge_salience_k45_cache64.wasm
```

These bytes are frozen as registration #1733. Do not overwrite the artifact;
new calibrations use a new filename and their own release note.
