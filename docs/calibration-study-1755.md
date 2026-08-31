# Calibration study around registrations #1733 and #1755

## Decision

The artifact evaluated in this study is:

`dist/outcome_judge_salience_k45_ss2_rail05_cache64.wasm`

It retains registration #1733's complete semantic score and 64-entry embedding
cache. The only score change is a monotonic calibration:

```text
base = k45(rawRp)
ss1 = smoothstep(base)
ss2 = smoothstep(ss1)
score = 0.95 * ss2 + 0.05 * base
```

Exact self-matches and blank answers keep their existing terminal handling. The
5% base rail is deliberate: two pure smoothstep passes increase contrast but can
round clusters near zero and one into identical `f32` values. The rail preserves
more of #1733's proven real-traffic ordering while retaining most of the added
separation.

## Artifact

| | |
| --- | --- |
| Size | `23,993,151` bytes |
| SHA-256 | `134864d8987a4dfcff232bb5321a24047904f7943df4d31bbe3bddbc5730d45b` |
| Keccak-256 | `0xcba612c16e54146e8a71e23351dd75caab5b8bf0d75be0936a2604b18a38818d` |
| Imports | `0` |
| Intent | `FRAUD_DETECTION` |
| Registration state | unregistered |

## Registry context

| Metric | OutcomeJudge #1733 | Registry baseline #1755 |
| --- | ---: | ---: |
| Fixture ordering | 15/15 | 15/15 |
| Margin | 0.87411624 | 0.8785044 |
| Worst self-match | 1 | 1 |
| Standard deviation | 0.44028768 | 0.44812748 |
| Historical Spearman | **0.91513044** | 0.91249865 |
| Historical rows | 83 | 83 |

The margin difference is `0.00438816`. The engineering goal was to increase
separation without discarding #1733's small historical-agreement advantage.

## Local evidence

On `benchmarks/fraud-prose.json`:

| Scorer | Ordering | Average margin | Standard deviation | Minimum margin |
| --- | ---: | ---: | ---: | ---: |
| #1755 public artifact | 13/16 | 0.30984533 | 0.44234627 | -0.00039732 |
| OutcomeJudge calibrated variant | 13/16 | **0.31060981** | **0.44449328** | -0.00240773 |

On `benchmarks/fraud-detection.json`, which targets the independently authored
transaction-firewall rubric rather than Telegraph's hidden salience fixtures:

| Scorer | Ordering | Average margin |
| --- | ---: | ---: |
| #1755 public artifact | 106/120 | **0.67007126** |
| OutcomeJudge calibrated variant | **107/120** | 0.66993568 |

The calibrated variant passed the Telegraph ABI verifier: no imports, required exports,
bounded smoke scores, exact self-match `1`, and blank answer `0`. The authored
corpora are regression evidence, not replicas of Stage 2. Only registration can
establish the hidden margin and historical agreement.

## Reproduce

Prepare the pinned source checkout described in `release-artifact.md`, then run:

```bash
node scripts/build-salience-cache64.mjs \
  /tmp/telegraph-salience-source \
  dist/outcome_judge_salience_k45_ss2_rail05_cache64.wasm \
  k45-ss2-rail05

node --import tsx scripts/verify-telegraph-wasm.ts \
  dist/outcome_judge_salience_k45_ss2_rail05_cache64.wasm
```

This study is retained as an engineering record. Its artifact, measurements,
hashes, and registry outcome should remain associated so later changes can be
evaluated against reproducible evidence rather than informal recollection.
