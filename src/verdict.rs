//! Verdict detection: maps a plain-text or JSON answer to BLOCK / ALLOW /
//! RECHECK / UNKNOWN. Handles canonical labels, common structured schemas,
//! epistemic uncertainty, negation, and concluding verdict phrases.

use crate::text::{contains_compact, contains_folded, contains_word};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Verdict {
    Block,
    Allow,
    Recheck,
    Unknown,
}

// A canonical verdict label at the very start of the answer, optionally
// followed by a separator (":", "-", whitespace). Returns None when the answer
// does not lead with one of the three labels.
fn verdict_prefix(trimmed: &str) -> Option<Verdict> {
    let label_end = trimmed
        .find(|c: char| !c.is_ascii_alphabetic())
        .unwrap_or(trimmed.len());
    let label = &trimmed[..label_end];
    if label.eq_ignore_ascii_case("block") {
        Some(Verdict::Block)
    } else if label.eq_ignore_ascii_case("allow") {
        Some(Verdict::Allow)
    } else if label.eq_ignore_ascii_case("recheck") {
        Some(Verdict::Recheck)
    } else {
        None
    }
}

pub fn verdict(input: &str) -> Verdict {
    let trimmed = input.trim();
    if trimmed.eq_ignore_ascii_case("block")
        || trimmed.eq_ignore_ascii_case("fraud")
        || trimmed == "true"
        || trimmed == "1"
    {
        return Verdict::Block;
    }
    if trimmed.eq_ignore_ascii_case("allow")
        || trimmed.eq_ignore_ascii_case("safe")
        || trimmed == "false"
        || trimmed == "0"
    {
        return Verdict::Allow;
    }
    if trimmed.eq_ignore_ascii_case("recheck")
        || trimmed.eq_ignore_ascii_case("unknown")
        || trimmed.eq_ignore_ascii_case("abstain")
    {
        return Verdict::Recheck;
    }

    // A leading canonical verdict label ("BLOCK: ...", "ALLOW - ...",
    // "RECHECK ...") is the strongest signal and overrides keyword heuristics.
    if let Some(prefix) = verdict_prefix(trimmed) {
        return prefix;
    }

    let explicit_block = contains_compact(input, b"\"verdict\":\"block\"")
        || contains_compact(input, b"\"decision\":\"block\"")
        || contains_compact(input, b"\"recommendation\":\"block\"")
        || contains_compact(input, b"\"action\":\"block\"")
        || contains_compact(input, b"\"classification\":\"fraud\"")
        || contains_compact(input, b"\"classification\":\"fraudulent\"")
        || contains_compact(input, b"\"classification\":\"malicious\"")
        || contains_compact(input, b"\"is_fraud\":true")
        || contains_compact(input, b"\"fraud\":true")
        || contains_compact(input, b"\"malicious\":true")
        || contains_compact(input, b"\"risk\":\"high\"")
        || contains_compact(input, b"\"risk\":\"critical\"");
    let explicit_allow = contains_compact(input, b"\"verdict\":\"allow\"")
        || contains_compact(input, b"\"decision\":\"allow\"")
        || contains_compact(input, b"\"recommendation\":\"allow\"")
        || contains_compact(input, b"\"action\":\"allow\"")
        || contains_compact(input, b"\"classification\":\"safe\"")
        || contains_compact(input, b"\"classification\":\"benign\"")
        || contains_compact(input, b"\"classification\":\"legitimate\"")
        || contains_compact(input, b"\"is_fraud\":false")
        || contains_compact(input, b"\"fraud\":false")
        || contains_compact(input, b"\"malicious\":false")
        || contains_compact(input, b"\"risk\":\"low\"")
        || contains_compact(input, b"\"risk\":\"minimal\"");
    let explicit_recheck = contains_compact(input, b"\"verdict\":\"recheck\"")
        || contains_compact(input, b"\"decision\":\"recheck\"")
        || contains_compact(input, b"\"recommendation\":\"recheck\"")
        || contains_compact(input, b"\"classification\":\"unknown\"")
        || contains_compact(input, b"\"verdict\":\"unknown\"")
        || contains_compact(input, b"\"risk\":\"medium\"");
    if explicit_block && !explicit_allow {
        return Verdict::Block;
    }
    if explicit_allow && !explicit_block {
        return Verdict::Allow;
    }
    if explicit_recheck && !explicit_block && !explicit_allow {
        return Verdict::Recheck;
    }

    // Resolve uncertainty before individual danger words: "cannot determine
    // fraud" is an abstention, not a positive fraud verdict.
    let epistemic_uncertainty = contains_folded(input, b"cannotdetermine")
        || contains_folded(input, b"unabletodetermine")
        || contains_folded(input, b"unabletoverify")
        || contains_folded(input, b"cannotverify")
        || contains_folded(input, b"inconclusive")
        || contains_folded(input, b"insufficientdata")
        || contains_folded(input, b"insufficientevidence")
        || contains_folded(input, b"requiresmanualreview")
        || contains_folded(input, b"needsmanualreview")
        || contains_folded(input, b"notconclusive")
        || contains_folded(input, b"notconclusively")
        || contains_folded(input, b"butnotconclusive")
        || contains_word(input, b"defer")
        || contains_folded(input, b"noevidencetoruleoutfraud");
    if epistemic_uncertainty && !explicit_block && !explicit_allow {
        return Verdict::Recheck;
    }

    let negated_fraud = contains_folded(input, b"notfraud")
        || contains_folded(input, b"notfraudulent")
        || contains_folded(input, b"notafraud")
        || contains_folded(input, b"notafraudrisk")
        || contains_folded(input, b"notariskoffraud")
        || contains_folded(input, b"notmalicious")
        || contains_folded(input, b"notphishing")
        || contains_folded(input, b"notascam")
        || contains_folded(input, b"isntascam")
        || contains_folded(input, b"notscam")
        || contains_folded(input, b"grantsnonewauthority")
        || contains_folded(input, b"nonewauthority")
        || contains_folded(input, b"nofraud")
        || contains_folded(input, b"nofraudevidence")
        || contains_folded(input, b"noevidenceoffraud")
        || contains_folded(input, b"noindicationoffraud")
        || contains_folded(input, b"nomalicious")
        || contains_folded(input, b"nomaliciousactivity")
        || contains_folded(input, b"nophishing")
        || contains_folded(input, b"noscam")
        || contains_folded(input, b"nosuspiciousactivity")
        || contains_folded(input, b"withoutfraud")
        || contains_folded(input, b"withoutmalicious");
    let negated_safe = contains_folded(input, b"notsafe")
        || contains_folded(input, b"isntsafe")
        || contains_folded(input, b"notbenign")
        || contains_folded(input, b"notlegitimate")
        || contains_folded(input, b"notclean")
        || contains_folded(input, b"cannotbeconsideredsafe");
    if negated_fraud && !negated_safe {
        return Verdict::Allow;
    }
    if negated_safe && !negated_fraud {
        return Verdict::Block;
    }

    // Concluding verdict phrases override incidental danger/safe words that only
    // describe what was reviewed (e.g. "...phishing and fraud risk factors, this
    // transaction is safe to allow" concludes ALLOW).
    let concludes_allow = contains_folded(input, b"safetoallow")
        || contains_folded(input, b"shouldbeallowed")
        || contains_folded(input, b"safetoproceed")
        || contains_folded(input, b"safetoexecute")
        || contains_folded(input, b"issafeandlegitimate")
        || contains_folded(input, b"nopoisoningorscam")
        || contains_folded(input, b"noscamorfraud")
        || contains_folded(input, b"nofraudorscam")
        || contains_word(input, b"harmless")
        || contains_folded(input, b"nodraining")
        || contains_folded(input, b"nodrainoccurs")
        || contains_folded(input, b"isbenign")
        || contains_folded(input, b"appearsbenign");
    let concludes_block = contains_folded(input, b"shouldbeblocked")
        || contains_folded(input, b"mustbeblocked")
        || contains_folded(input, b"blockthetransaction")
        || contains_folded(input, b"blockthetransfer");
    if concludes_allow && !concludes_block {
        return Verdict::Allow;
    }
    if concludes_block && !concludes_allow {
        return Verdict::Block;
    }

    let positive = contains_word(input, b"block")
        || contains_word(input, b"fraud")
        || contains_word(input, b"fraudulent")
        || contains_word(input, b"malicious")
        || contains_word(input, b"phishing")
        || contains_word(input, b"scam")
        || contains_word(input, b"drainer")
        || contains_word(input, b"drain")
        || contains_word(input, b"drains")
        || contains_word(input, b"draining")
        || contains_word(input, b"dangerous")
        || contains_word(input, b"danger")
        || contains_word(input, b"steal")
        || contains_word(input, b"steals")
        || contains_word(input, b"stolen")
        || contains_word(input, b"stealing")
        || contains_word(input, b"critical")
        || contains_word(input, b"unsafe")
        || contains_compact(input, b"highrisk");
    let negative = contains_word(input, b"allow")
        || contains_word(input, b"safe")
        || contains_word(input, b"benign")
        || contains_word(input, b"legitimate")
        || contains_word(input, b"clean")
        || contains_word(input, b"verified")
        || contains_word(input, b"reputable")
        || contains_word(input, b"trusted")
        || contains_word(input, b"trustworthy")
        || contains_word(input, b"established")
        || contains_word(input, b"normal")
        || contains_compact(input, b"noredflags")
        || contains_compact(input, b"nothingtoflag")
        || contains_compact(input, b"lowrisk");
    let uncertain = contains_word(input, b"recheck")
        || contains_word(input, b"unknown")
        || contains_word(input, b"uncertain")
        || contains_word(input, b"abstain")
        || contains_word(input, b"insufficient");
    let explicit_danger = contains_word(input, b"block")
        || contains_word(input, b"malicious")
        || contains_word(input, b"phishing")
        || contains_word(input, b"scam")
        || contains_word(input, b"drainer")
        || contains_word(input, b"unsafe")
        || contains_compact(input, b"highrisk");
    if uncertain && !negative && !explicit_danger {
        return Verdict::Recheck;
    }
    match (positive, negative, uncertain) {
        (true, false, _) => Verdict::Block,
        (false, true, _) => Verdict::Allow,
        (false, false, true) => Verdict::Recheck,
        _ => Verdict::Unknown,
    }
}
