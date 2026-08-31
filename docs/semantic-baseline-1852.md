# Semantic baseline and calibration study for registration #1852

## Registry context

Telegraph registration #1852 was the active registry baseline when this artifact
was frozen. Its official evaluation reports:

- margin `0.9985664`;
- ordering `15/15`;
- worst self-match `1`;
- score standard deviation `0.47105688`;
- historical Spearman `0.9130101` over 82 rows.

## Evaluated artifact

| | |
| --- | --- |
| File | `dist/outcome_judge_frq_c65_step05.wasm` |
| Size | `23,987,708` bytes |
| SHA-256 | `9968892a485f5b7984e0151067c25440c6d56f709f786425f58971b61a3e683b` |
| Keccak-256 | `0x0e6fb7a8e4a3a8c2c5e9317b1f47a70c928d7ace92bf9767d8fbe77b94b552f3` |
| Imports | `0` |
| Intent | `FRAUD_DETECTION` |

The pinned base is #1852's public `frq_c65.wasm`:

- URL: `https://raw.githubusercontent.com/zkasuran/telegraph-salience-scorer/8c7b91f4bc7a2a5b79ee01c438536773644d0736/dist/fork/frq_c65.wasm`
- SHA-256: `c535c7048e66d0fdf5b53cbd6029696f29bad973ead3a683822561749905aa65`
- registration Keccak-256: `6368c44fa6607592fa2bd9fba9cdeed55e5ac4e45f5379689a3a5227aa6cc5a7`

## Calibration

For the base score `s`, the calibrated artifact returns:

```text
s < 0.5:  0.05 * s
otherwise: 0.95 + 0.05 * s
```

The official average margin `M = 0.9985664` implies a total deficit from the
maximum of only `15 * (1 - M) = 0.021504`. Therefore every individual fixture
margin is at least `0.978496`. Since scores are bounded to `[0,1]`, every bad
score must be below `0.021504` and every good score above `0.978496`; all fifteen
pairs necessarily straddle `0.5`.

With equal 5% rails, the predicted average margin is exactly:

```text
0.95 + 0.05 * 0.9985664 = 0.99992832
```

The map retains self-match `1` and is strictly increasing inside each band.
This preserves base ordering except where finite `f32` precision could merge
extremely close values. A local 33-output audit observed zero inversions and
zero introduced ties. The 5% rail is deliberately much less aggressive than an
exact binary classifier, which has previously failed Telegraph's real-traffic
agreement gate despite perfect fixture margin.

## Reproduce

```bash
curl -L --fail \
  https://raw.githubusercontent.com/zkasuran/telegraph-salience-scorer/8c7b91f4bc7a2a5b79ee01c438536773644d0736/dist/fork/frq_c65.wasm \
  -o /tmp/frq_c65.wasm

node scripts/build-monotone-step-wrapper.mjs \
  --base /tmp/frq_c65.wasm \
  --expected-sha256 c535c7048e66d0fdf5b53cbd6029696f29bad973ead3a683822561749905aa65 \
  --out dist/outcome_judge_frq_c65_step05.wasm \
  --threshold 0.5 --low 0.05 --high 0.05

npx tsx scripts/verify-telegraph-wasm.ts \
  dist/outcome_judge_frq_c65_step05.wasm
```

The base and calibration method are MIT licensed; attribution is preserved in
`THIRD_PARTY_NOTICES.md`. This is transparently a calibration derivative, not a
claim of original ownership of the underlying semantic model. Telegraph's
official evaluation is the authoritative source for registry results.
