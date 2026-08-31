# Bounded-runtime study after registrations #2151 and #2225

## Why the implementation changed

Registration #2151 demonstrated the intended score separation on every fixture
it reached: submitted margin `0.9999452` versus the recomputed registry baseline
`0.9989056`, with 11/11 ordering. It was rejected because evaluation exceeded
the time budget after 13m31s, before all 15 fixtures and historical rows ran.
Submitting the same transformer binary again would not fix that failure.

Registration #2225 tested the exact k40/cache64 calibration documented below.
It exceeded the recomputed baseline on every completed fixture—margin `0.9999633`
versus `0.99903214`, ordering 10/10 versus 10/10, self-match `1`—but timed out
after 11m20s before the fixture gate completed. This isolates runtime as the
failure; it does not establish the unseen five fixtures.

## Evaluated artifact

| | |
| --- | --- |
| File | `dist/outcome_judge_salience_k40_t088_rail_l001_h01_t64_cache64.wasm` |
| Size | `23,993,108` bytes |
| SHA-256 | `586a670498d2ae42fd76141953ae1adb5e5b59efac599ee74d9154b2e2a0d9e7` |
| Keccak-256 | `0x9d0a045446fb397e1c5a3d23492aa123c86d9f586f2ba09d2d92989778bcba3e` |
| Imports | `0` |
| Intent | `FRAUD_DETECTION` |

The bounded base SHA-256 is
`4c172871fc3c6e7b8d8f31f7d7afbdde3a7419f0c68c6f954f58a9ba0ec38b3c`.
It retains the k40 score logic and 64-entry embedding cache, while limiting a
fresh transformer encoding to the first 64 WordPiece tokens.

## Calibration

For base score `s`:

```text
s < 0.88:  0.001 * s
otherwise: 0.99 + 0.01 * s
```

The map is strictly increasing within each band and fixes self-match at `1`.
On 33 distinct authored outputs it introduced zero inversions and zero `f32`
ties. The wider 1% high rail was chosen over a 0.5% rail because the latter
created one observed top-band tie.

Public registration #1829 proved threshold `0.80` separates 14/15 fixture
pairs. The public calibration study prepared `0.88` to target the remaining
high-scoring bad answer. If all 15 pairs straddle `0.88`, the official k40
margin `M = 0.8718595` yields the conservative bound:

```text
mean margin >= 0.99 + 0.01 * M = 0.998718595
```

That exceeds registration #1852's `0.9985664` baseline. Registration #2225 confirmed the
calibration on its first 10 fixtures, but the five unseen fixtures and the
bounded-token behavior remain unknown until official evaluation completes.

## Runtime evidence

The bounded base returned exactly the same `f32` values as the 128-token #2225
base on all 48 self/good/bad calls in `fraud-prose.json`. On a sequential
six-call long-answer stress run, the base fell from 18.16s to 8.86s, a 51.2%
reduction. The test is deliberately sequential to resemble Stage 2 pressure.
It is not a guarantee of Telegraph node time, and answers beyond 64 WordPiece
tokens can produce different embeddings.

## Reproduce

```bash
node scripts/build-salience-cache64.mjs \
  /path/to/pinned-public-checkout /tmp/k40-cache64-t64.wasm k40 64 1

node scripts/build-monotone-step-wrapper.mjs \
  --base /tmp/k40-cache64-t64.wasm \
  --expected-sha256 4c172871fc3c6e7b8d8f31f7d7afbdde3a7419f0c68c6f954f58a9ba0ec38b3c \
  --out dist/outcome_judge_salience_k40_t088_rail_l001_h01_t64_cache64.wasm \
  --threshold 0.88 --low 0.001 --high 0.01

npx tsx scripts/verify-telegraph-wasm.ts \
  dist/outcome_judge_salience_k40_t088_rail_l001_h01_t64_cache64.wasm
```

The underlying public scorer and calibration method are MIT licensed. Their
attribution is retained in `THIRD_PARTY_NOTICES.md`.

## Final release verification

Verified on 2026-08-31 before upload:

- The live Telegraph registry identified registration #1852 as the active
  `FRAUD_DETECTION` baseline: margin `0.9985664`, 15/15 ordering, self-match
  `1`, and historical Spearman `0.9130101` over 82 rows.
- The registry independently confirms #2225's partial margin `0.9999633`,
  10/10 ordering, self-match `1`, and the 11m20s timeout.
- `npm run verify:release` passed strict typechecking, all production builds,
  both WASM ABI checks, Solidity formatting, and 214 tests: 6 shared, 76 Miner,
  17 OutcomeJudge, 100 ProofRoute, and 15 executor tests.
- The frozen artifact was re-hashed after verification. Its size and both
  hashes match the values recorded above; it has zero imports and all required
  Telegraph exports.

This artifact was submitted as registration #2642. It reached 12/15 fixtures
with 12/12 ordering and margin `0.9998477`, but timed out after 10m26s. It is
followed by the score-preserving specialization in `runtime-study-2642.md`.
