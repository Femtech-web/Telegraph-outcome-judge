# OutcomeJudge registration history

This history records the measured engineering path. Each official result
narrowed the viable design space and informed the next controlled change.

| Registration | CID | Architecture | Submitted margin | Registry baseline margin | Result |
| --- | --- | --- | ---: | ---: | --- |
| #562 | `bafkreihxbhwzwlc4dl6rsod267ytoxctmf2fyb36tl4t5nvimo562gyqaq` | deterministic verdict + overlap | 0.7028 | 0.7796 | separation gate not met |
| #594 | `bafkreiex5olskvisnp5xt76lqg4vpoyb55cw4mrfgvg4xibnzewh6iyj6a` | reweighted deterministic scorer | **0.7413** | 0.7796 | separation gate not met; strongest deterministic result |
| #621 | `bafkreiazuqazmv4mispxgbewxszujwhhbim72xpsergy7uw7gwlotlrc6a` | #594 plus concept collapsing and broader parsing | 0.6730 | 0.7796 | separation gate not met |
| #629 | `bafybeiggwc5nrmw7zw72yfrbxhd2ydcnz5hwqpy5pdz3je2a5ehwl3cdqe` | MiniLM semantic scorer with verdict gate | 0.4463 | 0.7796 | separation gate not met |
| #672 | `bafybeibvo7zwq5uiynbzfduzlc3sy4bdayezkjwom52bim6nrdtfou4h4q` | MiniLM plus verdict adjustment | 0.4344 | 0.7796 | separation gate not met |
| #903 | `bafkreidxgpc6zmpkwjwe3q7tftv6o3piqbdo3nlhl7luu22wxj6ry3n4fe` | keyword scorer (verdict-broadened, build-tagged) | 0.7125 | 0.7796 | separation gate not met |
| #943 | `bafybeiayr7xqsvyytqeui3i3mmgss576cistnslimduejnar5jh7biqjoy` | MiniLM embedding + semantic contradiction + off-topic gates | 0.4689 | 0.7796 | separation gate not met |
| #1078 | `bafkreia6edqpvotvd43y7c2elhzxvm5bzr7izzurwouhuw3e6uxotuuzpu` | deterministic verdict + knowledge-prose gate | 0.6800 | 0.8719 | ordering gate not met, 14/15 vs 15/15 |
| #1608 | `bafybeic3ygelouleh6frdaf7gqntg4pzjtz4oqh3f4ci3ix7e3pua7zbga` | rawRp semantic surface, logistic k45, four-entry cache | — | 0.8719 | timed out before fixture gate completed (10m52s) |
| #1733 | `bafybeiamon6ecby2rx2gg5buhwbx4uxw7yyv7b343zh5hny6mv5tknhr5y` | salience rawRp, logistic k45, 64-entry cache | **0.8741** | 0.8719 | activated; 15/15 ordering, self-match 1 |
| #1833 | `bafybeibujpxc5nj6ki65fgcmxo6xodnszozfdqru2iaqenteqxn4zetk4y` | #1733 plus two contrast passes and 5% ordering rail | 0.8782 | 0.9329 | separation gate not met; 15/15 ordering, self-match 1 |
| #2151 | `bafybeigmix5kirp5fm32ufvetyy2tauamauemdwjgpx2tmkzkfbbwbakym` | #1852 plus a 5% two-band calibration | 0.9999452 (partial) | 0.9989056 (partial) | timed out after 13m31s; 11/11 fixtures completed |
| #2225 | `bafybeiaa7ekzeqn7phrhx5bf7ygtji2675he6zezfqos7gx4bifh26ps2a` | k40/cache64 plus 0.88 two-band calibration | 0.9999633 (partial) | 0.99903214 (partial) | timed out after 11m20s; 10/10 fixtures completed |
| #2642 | `bafybeigeiyttqrd2xdi3lemercsoodemoizxntcq4qlhwzxvfsho3chbme` | #2225 calibration, cache64, first 64 WordPieces | 0.9998477 (partial) | 0.9988592 (partial) | timed out after 10m26s; 12/12 fixtures completed |
| #2651 | `bafybeicmpqehqkqujbcgjfjge7s24aiifzgpzttkvbigp3r4zs3nsurwwe` | #2642 scorer with unused question pass removed | 0.9333 | 0.9986 | completed; separation gate not met |
| #2670 | `bafybeighobr3ibgnwdcyw3w6uztsrimtis54xa5fuiiky6rijw37664kta` | #1852 question-aware core, bounded 128/320/320-byte inputs, 5% rails | **0.9999497** | 0.9985664 | **activated**, 15/15 ordering, self-match 1 |

## Current registered artifact

Registration #2670 is active for `FRAUD_DETECTION`. It reports margin
`0.9999497`, 15/15 ordering, self-match `1`, standard deviation `0.471392`, and
historical Spearman `0.7765984` over 81 rows. It retains #1852's question-aware
semantic core and `c65` calibration, bounds inputs to 128 question bytes and 320
ground-truth/answer bytes, and applies a conservative 5% two-band map. The local
long-input stress runtime was 66.9% lower than #1852's artifact, and the official
evaluation completed within its time budget.

**Engineering lesson:** the generic MiniLM variants did not reproduce the
question-aware semantic behavior needed for this evaluation surface, while the
deterministic line peaked at margin `0.7413` and later reached 14/15 ordering.
Public registration #997 established a reproducible semantic reference with
15/15 ordering, margin `0.8718595`, self-match `1`, and historical Spearman
`0.6964227`. Subsequent work therefore used measured, monotonic calibration of
that public MIT-licensed line rather than adding more keyword heuristics.

## Evidence-led conclusion

#594 and #562 have the same 22,327-byte size and differ by only 60 binary bytes.
Observed scoring confirms that #594 preserved #562's unclassified prose path and
changed the explicit-verdict weights. #621 then changed parsing and token
semantics together, while #629/#672 replaced the proven deterministic surface
with a semantic-heavy one. Those later architectures regressed materially.

The compact deterministic implementation remains preserved as an auditable
transaction-verdict scorer. Registration #1733 showed that the semantic line
could complete Telegraph's full evaluation. Registrations #2151, #2225, and #2642
isolated runtime as the immediate blocker. #2651 then completed and proved the
question-free k40 surface has insufficient fixture geometry: its best global
separation was about 14/15 (`0.9333`). The final design therefore returns to the
question-aware #1852 core and bounds its work instead of applying another
threshold to a question-free surface.
Registration #2670 confirmed that this combination solved both constraints:
question-aware separation was retained while bounded work completed the full
fixture and historical-row evaluation.
