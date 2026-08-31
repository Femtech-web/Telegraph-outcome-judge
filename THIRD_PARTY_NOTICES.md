# Third-party notices

`dist/outcome_judge_salience_k45.wasm`,
`dist/outcome_judge_salience_k45_cache64.wasm`, and
`dist/outcome_judge_salience_k45_ss2_rail05_cache64.wasm` are derived from the public
Telegraph salience scorer by zkasuran. The optimized build uses model source and
weights from commit `f334d30` and scoring source/configuration published around
commit `d30bd4f7e346a44bd6099222b4a5f7f22f85c88a`.

`dist/outcome_judge_salience_k40_t088_rail_l001_h01_cache64.wasm` uses the
same MIT-licensed k40 scoring surface with a runtime-only cache expansion and a
transparent two-band calibration at `0.88`.

`dist/outcome_judge_salience_k40_t088_rail_l001_h01_t64_cache64.wasm` is the
same derivative with fresh transformer inputs deterministically bounded to the
first 64 WordPiece tokens so Stage 2 can complete within its time budget.

`dist/outcome_judge_salience_k40_t088_rail_l001_h01_t64_noq_cache64.wasm`
retains those exact scores while omitting the unused question embedding pass;
the configured question weight, no-ground-truth fallback, and exact-match
tie-break are all zero.

`dist/outcome_judge_frq_c65_step05.wasm` is a monotone calibration derivative
of zkasuran's public `frq_c65.wasm` at commit
`8c7b91f4bc7a2a5b79ee01c438536773644d0736`. The binary wrapper builder is an
independent adaptation of the step-calibration method and MIT-licensed builder
published by Harsh Yadav at commit
`6a3e01c75674359c0d4b1a66a9107f8277c1446e`. The copyright and permission below
apply to the upstream scorer and substantial portions of that method.

`dist/outcome_judge_frq_c65_cap_q128_t320_a320.wasm` and
`dist/outcome_judge_frq_c65_cap_q128_t320_a320_step05.wasm` use that same pinned
MIT-era `frq_c65.wasm`. An independently authored wrapper bounds the byte lengths
passed to the unchanged scorer; the final artifact then applies the documented
5% two-band calibration.

MIT License

Copyright (c) 2026 zkasuran

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
