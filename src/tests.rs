use crate::fraud_score;

const QUESTION: &str = "Assess transaction 0xabc on Base for fraud risk";

#[test]
fn self_match_is_one() {
    let value = "{\"verdict\":\"BLOCK\",\"reason\":\"phishing\"}";
    assert_eq!(fraud_score(QUESTION, value, value), 1.0);
}

#[test]
fn blank_or_missing_reference_scores_zero() {
    assert_eq!(fraud_score(QUESTION, "BLOCK", "   "), 0.0);
    assert_eq!(fraud_score(QUESTION, "", "BLOCK"), 0.0);
}

#[test]
fn structured_and_plain_block_answers_agree() {
    let score = fraud_score(
        QUESTION,
        "{\"is_fraud\":true,\"reason\":\"phishing\"}",
        "BLOCK: phishing evidence detected",
    );
    assert!(score > 0.75);
}

#[test]
fn dangerous_false_negative_scores_zero() {
    assert_eq!(
        fraud_score(
            QUESTION,
            "BLOCK",
            "This transaction is safe and should be allowed"
        ),
        0.0
    );
}

#[test]
fn false_positive_is_heavily_penalized() {
    assert!(fraud_score(QUESTION, "ALLOW", "BLOCK: malicious") < 0.1);
}

#[test]
fn abstention_beats_a_dangerous_false_negative() {
    assert!(
        fraud_score(QUESTION, "BLOCK", "RECHECK: insufficient evidence")
            > fraud_score(QUESTION, "BLOCK", "ALLOW: safe")
    );
}

#[test]
fn matching_evidence_improves_same_verdict() {
    let truth = "BLOCK phishing unlimited approval spender 0xabc";
    assert!(
        fraud_score(
            QUESTION,
            truth,
            "BLOCK phishing unlimited approval at spender 0xabc"
        ) > fraud_score(QUESTION, truth, "BLOCK")
    );
}

#[test]
fn handles_negation() {
    assert!(fraud_score(QUESTION, "ALLOW", "not fraudulent; no malicious activity found") > 0.68);
    assert!(fraud_score(QUESTION, "BLOCK", "not safe for execution") > 0.68);
    assert!(fraud_score(QUESTION, "ALLOW", "no scam indicators or phishing found") > 0.68);
    assert!(fraud_score(QUESTION, "BLOCK", "this cannot be considered safe") > 0.68);
    assert!(fraud_score(QUESTION, "ALLOW", "This isn't a scam.") > 0.68);
    assert!(fraud_score(QUESTION, "BLOCK", "This isn't safe for execution.") > 0.68);
    assert!(fraud_score(QUESTION, "ALLOW", "No indication of fraud was observed.") > 0.68);
}

#[test]
fn uncertainty_with_danger_words_remains_an_abstention() {
    for answer in [
        "Inconclusive: fraud cannot be determined from the available evidence.",
        "There is no evidence to rule out fraud; manual review is required.",
        "Unable to verify whether this target is malicious.",
    ] {
        assert!(fraud_score(QUESTION, "RECHECK", answer) > 0.6, "{answer}");
        assert!(fraud_score(QUESTION, "BLOCK", answer) < 0.5, "{answer}");
    }
}

#[test]
fn recognizes_common_structured_classifications() {
    assert!(
        fraud_score(
            QUESTION,
            "BLOCK",
            "{\"classification\":\"fraudulent\",\"risk\":\"critical\"}"
        ) > 0.68
    );
    assert!(
        fraud_score(
            QUESTION,
            "ALLOW",
            "{\"classification\":\"benign\",\"risk\":\"minimal\"}"
        ) > 0.68
    );
    assert!(fraud_score(QUESTION, "RECHECK", "{\"risk\":\"medium\"}") > 0.6);
}

#[test]
fn recognizes_recheck_json() {
    assert!(
        fraud_score(
            QUESTION,
            "RECHECK",
            "{\"verdict\":\"recheck\",\"reason\":\"unknown target\"}"
        ) > 0.65
    );
    assert!(fraud_score(QUESTION, "BLOCK", "Unknown; obtain another fraud signal") < 0.5);
}

#[test]
fn unicode_and_long_inputs_are_finite() {
    let long = "evidence ".repeat(8_000);
    let score = fraud_score("取引を確認 🔎", "BLOCK 詐欺", &format!("BLOCK 詐欺 {long}"));
    assert!(score.is_finite());
    assert!((0.0..=1.0).contains(&score));
}

// ── New coverage for the verdict-prefix and conclusion-phrase fixes ──────────

#[test]
fn leading_verdict_label_overrides_keywords() {
    // A RECHECK abstention that also mentions a benign word ("legitimate") must
    // still read as RECHECK, not ALLOW, when GT is BLOCK.
    let recheck = "RECHECK: compare against prior legitimate recipient";
    assert!(fraud_score(QUESTION, "BLOCK", recheck) > fraud_score(QUESTION, "BLOCK", "ALLOW: safe"));
    // Leading ALLOW label with incidental danger words stays ALLOW vs ALLOW GT.
    assert!(fraud_score(QUESTION, "ALLOW", "ALLOW: no phishing or fraud detected") > 0.68);
}

#[test]
fn verbose_keyword_stuffed_wrong_allow_is_not_rewarded() {
    // A long ALLOW answer padded with danger keywords must score below a safe
    // abstention when the ground truth is BLOCK.
    let stuffed = "After a very thorough review of the approval, the setApprovalForAll call, \
        and all associated phishing and fraud risk factors, this transaction is safe to allow.";
    let abstain = "RECHECK: operator reputation not yet resolved.";
    assert!(fraud_score(QUESTION, "BLOCK", abstain) > fraud_score(QUESTION, "BLOCK", stuffed));
}

#[test]
fn allow_leaning_negation_without_prefix_reads_allow() {
    // "grants no new authority and is not a fraud risk" concludes ALLOW.
    let ans = "This grants no new authority and is not a fraud risk.";
    assert!(fraud_score(QUESTION, "ALLOW", ans) > 0.68);
    assert!(fraud_score(QUESTION, "BLOCK", ans) < 0.1);
}

#[test]
fn no_x_or_y_negation_reads_allow() {
    let ans = "No poisoning or scam; this is a known self-address.";
    assert!(fraud_score(QUESTION, "ALLOW", ans) > 0.5);
}

#[test]
fn recognizes_precise_prose_without_collapsing_concepts() {
    for answer in [
        "The transfer is harmless.",
        "No draining occurs and the recipient appears benign.",
    ] {
        assert!(fraud_score(QUESTION, "ALLOW", answer) > 0.68, "{answer}");
    }
    for answer in [
        "The evidence is not conclusive.",
        "Defer the decision pending another source.",
    ] {
        assert!(fraud_score(QUESTION, "RECHECK", answer) > 0.6, "{answer}");
    }
    assert!(fraud_score(QUESTION, "BLOCK", "A known drainer receives the approval") > 0.68);
}
