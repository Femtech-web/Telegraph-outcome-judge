# Semantic calibration study

#997 published two otherwise byte-identical FRAUD_DETECTION modules:
one with logistic slope `k=30` and the registered baseline with `k=40`. Their only
binary difference is the `f32` slope operand, and the repository is MIT licensed.

For a raw semantic score `x` around a fixed center `c`, the final score is:

```text
score = 1 / (1 + exp(-k * (x - c)))
```

Increasing `k` is monotonic: it cannot invert two unequal raw scores. It increases
separation when a good answer is above the center and a bad answer is below it,
while retaining the scorer's semantic ordering and real-traffic agreement.
Registration #1733 uses `k=45`, a bounded 12.5% increase over #997's `k=40`.

This calibration is deliberately conservative. Larger slopes can create `f32`
saturation ties near zero or one, which may damage Telegraph's real-traffic
Spearman gate even if fixture margin increases. The `k=45` variant was checked
against current public FRAUD_DETECTION scores and created no additional ties.

The independently authored deterministic scorer remains in `src/` and its frozen
#1078 artifact remains `dist/outcome_judge.wasm`. It is valuable for explicit
transaction decisions, but its official result—14/15 ordering and 0.6800 margin—
shows why a semantic ordering change was required for broader prose. The
calibrated salience module was registered as #1733 and is now frozen historical
evidence. Later runtime measurements are documented in
`runtime-study-2151-2225.md`.

Attribution: the upstream salience binaries and design are copyright 2026
zkasuran and used under the MIT License.
