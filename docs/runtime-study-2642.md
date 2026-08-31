# Score-preserving runtime study after registration #2642

## Official evidence

Registration #2642 retained the intended scoring behavior on every fixture it
reached: margin `0.9998477` versus the recomputed registry baseline's `0.9988592`, 12/12
ordering, and self-match `1`. It timed out after 10m26s before the remaining
three fixtures and historical rows ran.

## Evaluated artifact

| | |
| --- | --- |
| File | `dist/outcome_judge_salience_k40_t088_rail_l001_h01_t64_noq_cache64.wasm` |
| Size | `23,992,826` bytes |
| SHA-256 | `65d10e18ba9cd4c8aaa7e2cb0dc69ff0d1948541a2c65ec5996801cedf696470` |
| Keccak-256 | `0x231a116940078f33121404a8e45e81d9763d1074b68681d5586ef7c1abe10f79` |
| Imports | `0` |
| Intent | `FRAUD_DETECTION` |

The artifact retains #2642's k40 scorer, first-64-WordPiece bound, 64-entry
cache, `0.88` threshold, and 0.1%/1% rails. It changes no scoring parameter.

## Why the score is unchanged

This build has `W_QA = 0`, `NOGT_Q = 0`, and `EXACT_TIE = 0`. Normal rows
therefore compare the ground truth and answer only; missing-ground-truth rows
return zero before embedding, and exact matches return one before embedding.
The previous binary nevertheless encoded the question during normal rows. The
new build passes an empty question into that internal embedding function, which
skips the unused transformer pass while leaving the ground-truth and answer
paths unchanged.

The old and new artifacts returned exactly identical `f32` values on all 48
self/good/bad calls in `fraud-prose.json`; maximum absolute difference was zero.
Because the removed vector had a zero coefficient and is bypassed in the other
two branches, this is a score-preserving specialization, not a calibration.

## Runtime evidence

On the same sequential six-call long-answer stress run, #2642's artifact took
10.65s and the specialized artifact took 8.01s, a 24.8% reduction. This affects short and
long inputs because it removes one complete unique transformer encoding rather
than lowering the token cap. The measurement is not a guarantee of Telegraph
node time.

The 48-token experiment was rejected despite better speed: it stayed exact on
the prose and transaction corpora but caused substantial ordering drift on the
long-form fraud-knowledge corpus. The 32-token experiment also introduced nine
inversions in the smaller prose audit. Neither was retained as a release artifact.

## Reproduce

```bash
node scripts/build-salience-cache64.mjs \
  /path/to/pinned-public-checkout /tmp/k40-cache64-t64-noq.wasm k40 64 1

node scripts/build-monotone-step-wrapper.mjs \
  --base /tmp/k40-cache64-t64-noq.wasm \
  --expected-sha256 7bd310a946bf1640d6b31ec0b34abf77930fe55eef8960abc110443df6c26692 \
  --out dist/outcome_judge_salience_k40_t088_rail_l001_h01_t64_noq_cache64.wasm \
  --threshold 0.88 --low 0.001 --high 0.01

npx tsx scripts/verify-telegraph-wasm.ts \
  dist/outcome_judge_salience_k40_t088_rail_l001_h01_t64_noq_cache64.wasm
```

Only Telegraph's official evaluation can establish completion, the three unseen
fixtures, historical agreement, and activation.

## Final release verification

`npm run verify:release` passed against the exact artifact above: strict
typechecking, all production builds, both WASM ABI checks, Solidity formatting,
and 214 tests (6 shared, 76 Miner, 17 OutcomeJudge, 100 ProofRoute, and 15
executor tests). The post-verification hashes match this document.
