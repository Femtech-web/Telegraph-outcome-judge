# OutcomeJudge — benchmark evidence

OutcomeJudge keeps two scorer lines because they solve different evaluation
surfaces. The 23 KB deterministic scorer is strong on explicit transaction
verdicts. The question-aware semantic line is the active #2670 registration.

## Registry and benchmark summary

| Scorer | Margin | Ordering | Historical Spearman | Result |
| --- | ---: | ---: | ---: | --- |
| OutcomeJudge #1733 | 0.87411624 | 15/15 | **0.91513044** | activated at evaluation time |
| OutcomeJudge #1833 | 0.8781732 | 15/15 | not evaluated | below the `0.93289727` registry baseline |
| Public baseline #1852 | 0.9985664 | 15/15 | **0.9130101** | comparison baseline for #2670 |
| OutcomeJudge #2151 | 0.9999452 (partial) | 11/11 (partial) | not reached | timed out after 13m31s |
| OutcomeJudge #2225 | **0.9999633** (partial) | **10/10** (partial) | not reached | timed out after 11m20s |
| OutcomeJudge #2642 | **0.9998477** (partial) | **12/12** (partial) | not reached | timed out after 10m26s |
| **OutcomeJudge #2670** | **0.9999497** | **15/15** | 0.7765984 over 81 rows | **active registration** |

The registered artifact is
`outcome_judge_frq_c65_cap_q128_t320_a320_step05.wasm`. It restores #1852's
question-aware semantic geometry, bounds inputs to 128/320/320 bytes, and applies
5% ranking-preserving rails. See `registered-artifact-2670.md` for hashes,
runtime measurements, official results, and limitations.

## Official evidence

| Registration | Architecture | Margin | Ordering | Result |
| --- | --- | ---: | ---: | --- |
| #594 | deterministic verdict + overlap | 0.7413 | not published | below the `0.7796` registry baseline |
| #943 | generic MiniLM + contradiction gates | 0.4689 | not published | below the `0.7796` registry baseline |
| #1078 | deterministic + knowledge-prose gate | 0.6800 | 14/15 | ordering gate not met |
| #997 | salience transformer, logistic `k=40` | **0.8719** | **15/15** | public semantic baseline |
| #1733 | salience transformer, logistic `k=45`, cache64 | **0.8741** | **15/15** | activated at evaluation time |
| #1833 | #1733 plus contrast and 5% rail | 0.8782 | 15/15 | below the `0.9329` registry baseline |
| #1852 | question-aware salience calibration | **0.9986** | **15/15** | public comparison baseline |
| #2151 | #1852 plus 5% two-band calibration | **0.9999452** (partial) | **11/11** (partial) | timed out after 13m31s |
| #2225 | k40/cache64 plus 0.88 two-band calibration | **0.9999633** (partial) | **10/10** (partial) | timed out after 11m20s |
| #2642 | #2225 calibration plus first-64-token bound | **0.9998477** (partial) | **12/12** (partial) | timed out after 10m26s |
| #2651 | first-64-token question-free runtime specialization | 0.9333 | not published | completed; separation gate not met |
| **#2670** | question-aware #1852 core, 128/320/320-byte bounds, 5% rails | **0.9999497** | **15/15** | **activated** |

#2670 reports self-match `1.0`, score standard deviation `0.471392`, historical
Spearman `0.7765984`, and 81 historical rows evaluated. #1852 retained higher
historical Spearman (`0.9130101` over 82 rows), an explicit tradeoff reported in
the project README.

## Historical #1733 evidence

`dist/outcome_judge_salience_k45_cache64.wasm` retains the k45 score surface
submitted in #1608 and increases the transformer embedding cache from 4 to 64
entries. Registration #1608 timed out after 10m52s before its fixture gate
completed, so it produced no ordering or margin result.

On eight current public FRAUD_DETECTION question groups with both a high- and a
low-scoring non-empty answer:

| Scorer | Correct orderings | Average margin | Minimum margin | Self-match |
| --- | ---: | ---: | ---: | ---: |
| Public #997 baseline (`k=40`) | 8/8 | 0.9421 | 0.7659 | 1.0 |
| OutcomeJudge `k=45` variant | **8/8** | **0.9529** | **0.7975** | 1.0 |

The public sample contained 88 non-terminal scores. Reapplying the `k=45`
transform created no additional `f32` ties, so the observed ranking and Spearman
ordering are preserved. The artifact has no imports, stays below Telegraph's
32 MB limit, and passes the generic ABI verifier.

The cache64 rebuild returned exactly the same `f32` values as #1608's artifact
on all 48 self/good/bad rows in the 16-case fraud-prose equivalence run. A
non-adjacent good-then-bad access pattern fell from 40.75s to 27.96s locally
(`1.46x`), which projects #1608's 10m52s run to roughly 7m27s if the node has a
similar call pattern. That projection is evidence, not a guarantee of node time.

## Registered artifact evidence

- Built from the exact public MIT-era #1852 `frq_c65.wasm` semantic scorer.
- Preserves question-aware scoring while bounding question input to 128 bytes and
  ground-truth/answer input to 320 bytes.
- Applies a strictly increasing 5% rail inside each side of a `0.5` boundary.
- No imports; required Telegraph exports and `FRAUD_DETECTION` intent pass the
  generic ABI verifier.
- Exact self-match remains `1`; blank answer remains `0`.
- The bounded core returned exactly the same 48 broad fraud-prose scores as
  #1852 before the final output map.
- Transaction ordering remained 111/120 while average margin improved from
  `0.5310` to `0.5332` after the final map.
- Long fraud-knowledge ordering remained 66/76 while average margin improved
  from `0.3672` to `0.4210`.
- The sequential six-call stress run fell from 21.64s to 7.15s (66.9%).
- Official registration #2670 completed with 15/15 ordering, margin `0.9999497`,
  self-match `1`, standard deviation `0.471392`, and Spearman `0.7765984` over
  81 historical Miner rows.

## Deterministic regression corpus

The compact scorer remains independently tested:

- 17/17 Rust tests pass.
- 120/120 high-vs-low comparisons pass on the 50-case labelled transaction
  corpus, average margin `0.9345`, self-match `1.0`.
- It scored 13/16 on the authored fraud-prose corpus and 72/76 on the authored
  fraud-knowledge corpus.

The semantic scorer intentionally does not correctly order every authored
transaction-verdict pair. Those corpora test the compact firewall rubric; they
are not presented as replicas of Telegraph's hidden benchmark.

## Reproduce

```bash
# Compact deterministic regression suite
cargo test --manifest-path Cargo.toml
node scripts/compare-scorers.mjs \
  benchmarks/fraud-detection.json \
  deterministic=dist/outcome_judge.wasm

# Generic ABI verification for the registered artifact
node --import tsx scripts/verify-telegraph-wasm.ts \
  dist/outcome_judge_frq_c65_cap_q128_t320_a320_step05.wasm
```

See [registered-artifact-2670.md](registered-artifact-2670.md) for current
provenance, exact hashes, and official results;
[release-artifact.md](release-artifact.md) for the frozen #1733 release; and
[registration-history.md](registration-history.md) for every official result.

## Honest limits

- Aggregate official metrics do not reveal the hidden fixture texts.
- Monotonicity preserves mathematical ordering, but finite `f32` rounding can
  create ties; the observed audits and official ordering found no regression.
- #2670's historical Spearman `0.7765984` is lower than #1852's `0.9130101`.
- Registry activation can change as new scripts register; #2670's immutable
  metrics and artifact hashes remain the reproducible result.
