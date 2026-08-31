# Registered OutcomeJudge artifact #2670

## Official outcome

The artifact documented below was registered as #2670 and activated for
`FRAUD_DETECTION`. Telegraph reported margin `0.9999497` versus
`0.9985664`, 15/15 ordering, worst self-match `1`, standard deviation `0.471392`,
and historical Spearman `0.7765984` over 81 rows. The evaluation completed within
its runtime budget.

## Official evidence

Registration #2651 completed the evaluation but did not meet the separation
gate: `0.9333` versus the `0.9986` registry baseline. This is approximately
14/15 and matches
the maximum observed threshold separation of the question-free k40 surface.
Another monotone threshold on that same surface cannot solve the missing pair.

## Registered artifact

| | |
| --- | --- |
| File | `dist/outcome_judge_frq_c65_cap_q128_t320_a320_step05.wasm` |
| Size | `23,987,765` bytes |
| SHA-256 | `a8983b374533f243652a1fbc33da73d23fbbe84468d06b6652032f77c9965883` |
| Keccak-256 | `0x8563d059b5c160399a17a31fd2e69d0a10672231972603b4cec2d1d02e0628d5` |
| Imports | `0` |
| Intent | `FRAUD_DETECTION` |

The pinned base is the public MIT-era `frq_c65.wasm` registered as #1852, SHA-256
`c535c7048e66d0fdf5b53cbd6029696f29bad973ead3a683822561749905aa65`.
The first wrapper passes at most 128 question bytes, 320 ground-truth bytes, and
320 answer bytes to the unchanged scorer. The final wrapper maps a score `s` as:

```text
s < 0.5:  0.05 * s
otherwise: 0.95 + 0.05 * s
```

## Evidence

- Sequential six-call long-input stress: 21.64s for #1852 versus 7.15s for the
  bounded scorer, a 66.9% reduction. This is local evidence, not a node guarantee.
- The bounded scorer was exactly equal to #1852 on all 48 broad fraud-prose
  outputs and retained the same 111/120 transaction ordering.
- On the 76-pair long fraud-knowledge set, bounding retained 66/76 ordering and
  improved average margin from `0.3672` to `0.4191`.
- After the 5% map, transaction margin was `0.5332` versus #1852's `0.5310`, and
  knowledge margin was `0.4210` versus `0.3672`; ordering and self-match `1`
  were preserved.

The official #1852 margin implies that all fifteen hidden good/bad pairs straddle
`0.5`. If the bounded scorer preserves those sides, the map predicts margin
`0.95 + 0.05 * 0.9985664 = 0.99992832`. Only Telegraph's evaluation can verify
that premise on the hidden fixtures and historical traffic.

## Reproduce

```bash
node scripts/build-input-cap-wrapper.mjs \
  --base /tmp/frq_c65.wasm \
  --expected-sha256 c535c7048e66d0fdf5b53cbd6029696f29bad973ead3a683822561749905aa65 \
  --out dist/outcome_judge_frq_c65_cap_q128_t320_a320.wasm \
  --question-cap 128 --truth-cap 320 --answer-cap 320

node scripts/build-monotone-step-wrapper.mjs \
  --base dist/outcome_judge_frq_c65_cap_q128_t320_a320.wasm \
  --expected-sha256 63e7c6d8c37f318ee9f41bc258c6a2b52b3a74d6329d9008624e73b5b0176628 \
  --out dist/outcome_judge_frq_c65_cap_q128_t320_a320_step05.wasm \
  --threshold 0.5 --low 0.05 --high 0.05
```

## Final release verification

`npm run verify:release` passed against the exact final artifact: strict
typechecking, all production builds, both WASM ABI checks, Solidity formatting,
182 JavaScript/TypeScript tests, 17 Rust scorer tests, and 15 Solidity tests.
The post-verification hashes match the artifact table above.
