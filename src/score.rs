//! Composite scoring. Verdict correctness is the dominant gate; within the
//! verdict-agree range a bounded token-overlap quality term (recall/precision/
//! f1) breaks ties — the deterministic analogue of the semantic baseline's
//! quality signal, with no embeddings and no host calls.

use crate::text::{overlap, tokens, TokenSet};
use crate::verdict::{verdict, Verdict};

/// True when the ground truth is a knowledge/research description rather than a
/// short verdict decision. Verdict ground truths are short and lead with a
/// canonical label ("BLOCK: ...", "ALLOW - ..."); knowledge ground truths are
/// long factual prose. We gate on both: not led by a verdict label, and long
/// enough to be a description (>= 24 content tokens).
fn is_knowledge_truth(truth: &str, truth_tokens: &TokenSet) -> bool {
    let leads_with_label = {
        let trimmed = truth.trim_start();
        let end = trimmed
            .find(|c: char| !c.is_ascii_alphabetic())
            .unwrap_or(trimmed.len());
        let label = &trimmed[..end];
        label.eq_ignore_ascii_case("block")
            || label.eq_ignore_ascii_case("allow")
            || label.eq_ignore_ascii_case("recheck")
            || label.eq_ignore_ascii_case("fraud")
            || label.eq_ignore_ascii_case("safe")
    };
    !leads_with_label && truth_tokens.len >= 24
}

/// Verdict correctness dominates. Bounded token overlap rewards evidence
/// fidelity without requiring every Miner to use one JSON schema.
pub fn fraud_score(question: &str, ground_truth: &str, miner_answer: &str) -> f32 {
    let answer = miner_answer.trim();
    let truth = ground_truth.trim();
    if answer.is_empty() || truth.is_empty() {
        return 0.0;
    }
    if answer.eq_ignore_ascii_case(truth) {
        return 1.0;
    }

    let truth_tokens = tokens(truth);
    let answer_tokens = tokens(answer);
    let question_tokens = tokens(question);
    let (recall, precision, f1) = overlap(&truth_tokens, &answer_tokens);
    let (_, question_precision, _) = overlap(&question_tokens, &answer_tokens);

    // Knowledge-question gate. A FRAUD_DETECTION case is either a verdict case
    // ("BLOCK: phishing spender") or a knowledge/research case ("What was the
    // BitConnect fraud?" -> a long factual description). For knowledge cases the
    // ground truth is descriptive prose that mentions fraud/scam words, so the
    // verdict classifier wrongly reads it as BLOCK — and then a vague answer that
    // merely says "scam" lands in the (Block,Block) branch at 0.94 while a rich
    // factual paraphrase without a trigger word lands in (Block,Unknown) near 0.
    // That inverts good vs vague. Detect a knowledge ground truth (long prose not
    // led by a canonical verdict label) and score it purely on factual coverage,
    // so ordering follows how much of the ground truth the answer actually covers.
    if is_knowledge_truth(truth, &truth_tokens) {
        // Coverage of the ground-truth facts, rewarded super-linearly so a
        // thorough answer separates from a shallow one.
        let coverage = recall * recall;
        // F1 balances coverage against precision, so an answer cannot win on
        // recall alone by echoing ground-truth keywords — a keyword-stuffed
        // answer has recall but poor precision and repetition, so its f1 is low.
        let mut score = 0.55 * coverage + 0.35 * f1 + 0.10 * precision;

        // Repetition penalty: a keyword-stuffed answer repeats tokens, so its
        // unique-to-total ratio is low. Scale the penalty by how repetitive the
        // answer is rather than a hard length threshold, so short stuffed
        // answers are caught too. ratio 1.0 (no repetition) -> no penalty;
        // ratio 0.5 (each token twice) -> heavy penalty.
        if answer_tokens.total > answer_tokens.len {
            let unique_ratio = answer_tokens.len as f32 / answer_tokens.total as f32;
            // Map ratio [0.5,1.0] -> multiplier [0.5,1.0]; below 0.5 clamps.
            let penalty = ((unique_ratio - 0.5) / 0.5).clamp(0.0, 1.0);
            score *= 0.5 + 0.5 * penalty;
        }
        return score.clamp(0.0, 1.0);
    }

    // A correct verdict is the dominant signal and scores high on its own;
    // token overlap is a small bonus, not a large fraction. This widens the
    // good-vs-bad separation margin: correct answers sit near 1.0 and
    // wrong-verdict answers stay near 0.
    let mut score = match (verdict(truth), verdict(answer)) {
        (Verdict::Block, Verdict::Allow) => 0.0,
        (Verdict::Allow, Verdict::Block) => 0.01 + 0.02 * f1,
        (Verdict::Block, Verdict::Block) | (Verdict::Allow, Verdict::Allow) => {
            0.94 + 0.04 * recall + 0.02 * precision
        }
        (Verdict::Recheck, Verdict::Recheck) => 0.93 + 0.05 * recall + 0.02 * precision,
        (Verdict::Block, Verdict::Recheck) => 0.12 + 0.08 * recall,
        (Verdict::Allow, Verdict::Recheck) => 0.15 + 0.07 * recall,
        (Verdict::Recheck, Verdict::Block) | (Verdict::Recheck, Verdict::Allow) => 0.05 + 0.06 * f1,
        (Verdict::Unknown, Verdict::Unknown) => {
            // Knowledge-prose branch: neither side is a canonical verdict, so
            // this is factual recall of the ground truth. A good answer covers
            // most of the ground-truth facts; a vague one covers a little. Plain
            // linear recall leaves those two nearly tied (both land ~0.43), so
            // good answers do not separate from vague ones. Reward coverage
            // super-linearly (recall*recall) so high coverage pulls decisively
            // above shallow coverage, while low coverage (wrong/off-topic) stays
            // near zero. Keyword-space only; no embeddings.
            let coverage = recall * recall;
            0.80 * coverage + 0.15 * precision + 0.05 * question_precision
        }
        (Verdict::Unknown, _) => 0.55 * recall + 0.25 * precision + 0.05 * question_precision,
        (_, Verdict::Unknown) => 0.10 + 0.30 * recall + 0.10 * precision,
    };
    if answer_tokens.total > 32 && answer_tokens.total > answer_tokens.len.saturating_mul(8) {
        score *= 0.8;
    }
    if answer.len() > truth.len().saturating_mul(16).saturating_add(4096) {
        score *= 0.85;
    }
    score.clamp(0.0, 1.0)
}

/// Per-signal breakdown mirroring the semantic baseline's [relevance, correctness,
/// lexical, length, composite] layout, so a caller can compare signal-by-signal.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
pub fn score_breakdown(question: &str, ground_truth: &str, miner_answer: &str) -> [f32; 5] {
    let truth_tokens = tokens(ground_truth);
    let answer_tokens = tokens(miner_answer);
    let question_tokens = tokens(question);
    let (_, _, lexical) = overlap(&truth_tokens, &answer_tokens);
    let (_, _, relevance) = overlap(&question_tokens, &answer_tokens);
    let correctness = match (verdict(ground_truth), verdict(miner_answer)) {
        (Verdict::Block, Verdict::Block)
        | (Verdict::Allow, Verdict::Allow)
        | (Verdict::Recheck, Verdict::Recheck) => 1.0,
        (Verdict::Unknown, Verdict::Unknown) => lexical,
        (Verdict::Block, Verdict::Recheck) | (Verdict::Allow, Verdict::Recheck) => 0.35,
        (Verdict::Recheck, Verdict::Block) | (Verdict::Recheck, Verdict::Allow) => 0.2,
        _ => 0.0,
    };
    let answer_len = miner_answer.trim().len();
    let truth_len = ground_truth.trim().len();
    let length_quality = if answer_len == 0 || truth_len == 0 {
        0.0
    } else if answer_len <= truth_len.saturating_mul(16).saturating_add(4096) {
        1.0
    } else {
        0.5
    };
    let composite = fraud_score(question, ground_truth, miner_answer);
    [relevance, correctness, lexical, length_quality, composite]
}
