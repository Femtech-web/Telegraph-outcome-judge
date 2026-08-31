//! Tokenization, bounded token sets, and phrase matching over raw UTF-8.
//! Pure logic — compiles on native (for tests) and wasm alike.

pub const MAX_TOKENS: usize = 128;

#[derive(Clone, Copy)]
pub struct TokenSet {
    hashes: [u64; MAX_TOKENS],
    pub len: usize,
    pub total: usize,
}

impl TokenSet {
    const fn new() -> Self {
        Self {
            hashes: [0; MAX_TOKENS],
            len: 0,
            total: 0,
        }
    }

    fn add(&mut self, hash: u64) {
        self.total += 1;
        if self.hashes[..self.len].contains(&hash) || self.len == MAX_TOKENS {
            return;
        }
        self.hashes[self.len] = hash;
        self.len += 1;
    }

    fn intersection(&self, other: &Self) -> usize {
        self.hashes[..self.len]
            .iter()
            .filter(|hash| other.hashes[..other.len].contains(hash))
            .count()
    }
}

fn ascii_lower(byte: u8) -> u8 {
    if byte.is_ascii_uppercase() {
        byte + 32
    } else {
        byte
    }
}

fn token_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte >= 0x80
}

fn token_eq(token: &[u8], expected: &[u8]) -> bool {
    token.len() == expected.len()
        && token
            .iter()
            .zip(expected)
            .all(|(left, right)| ascii_lower(*left) == *right)
}

fn stop_word(token: &[u8]) -> bool {
    token_eq(token, b"a")
        || token_eq(token, b"an")
        || token_eq(token, b"and")
        || token_eq(token, b"are")
        || token_eq(token, b"as")
        || token_eq(token, b"at")
        || token_eq(token, b"be")
        || token_eq(token, b"by")
        || token_eq(token, b"for")
        || token_eq(token, b"from")
        || token_eq(token, b"in")
        || token_eq(token, b"is")
        || token_eq(token, b"it")
        || token_eq(token, b"of")
        || token_eq(token, b"on")
        || token_eq(token, b"or")
        || token_eq(token, b"the")
        || token_eq(token, b"this")
        || token_eq(token, b"to")
        || token_eq(token, b"was")
        || token_eq(token, b"with")
}

fn token_hash(token: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in token {
        hash ^= ascii_lower(*byte) as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash ^ ((token.len() as u64).wrapping_mul(0x9e3779b97f4a7c15))
}

pub fn tokens(input: &str) -> TokenSet {
    let bytes = input.as_bytes();
    let mut result = TokenSet::new();
    let mut index = 0;
    while index < bytes.len() {
        while index < bytes.len() && !token_byte(bytes[index]) {
            index += 1;
        }
        let start = index;
        while index < bytes.len() && token_byte(bytes[index]) {
            index += 1;
        }
        if start < index {
            let token = &bytes[start..index];
            if !stop_word(token) {
                result.add(token_hash(token));
            }
        }
    }
    result
}

pub fn contains_word(input: &str, expected: &[u8]) -> bool {
    let bytes = input.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        while index < bytes.len() && !token_byte(bytes[index]) {
            index += 1;
        }
        let start = index;
        while index < bytes.len() && token_byte(bytes[index]) {
            index += 1;
        }
        if start < index && token_eq(&bytes[start..index], expected) {
            return true;
        }
    }
    false
}

pub fn contains_compact(input: &str, expected: &[u8]) -> bool {
    let bytes = input.as_bytes();
    for start in 0..bytes.len() {
        let mut source = start;
        let mut target = 0;
        while source < bytes.len() && target < expected.len() {
            if bytes[source].is_ascii_whitespace() {
                source += 1;
                continue;
            }
            if ascii_lower(bytes[source]) != expected[target] {
                break;
            }
            source += 1;
            target += 1;
        }
        if target == expected.len() {
            return true;
        }
    }
    false
}

/// Matches a phrase while ignoring ordinary punctuation and whitespace. This
/// is reserved for a small semantic vocabulary; evidence scoring still uses
/// the original, tokenized input.
pub fn contains_folded(input: &str, expected: &[u8]) -> bool {
    let bytes = input.as_bytes();
    for start in 0..bytes.len() {
        let mut source = start;
        let mut target = 0;
        while source < bytes.len() && target < expected.len() {
            let byte = bytes[source];
            if byte.is_ascii_whitespace() || byte.is_ascii_punctuation() {
                source += 1;
                continue;
            }
            if ascii_lower(byte) != expected[target] {
                break;
            }
            source += 1;
            target += 1;
        }
        if target == expected.len() {
            return true;
        }
    }
    false
}

/// (recall, precision, f1) of answer tokens against reference tokens.
pub fn overlap(reference: &TokenSet, answer: &TokenSet) -> (f32, f32, f32) {
    if reference.len == 0 || answer.len == 0 {
        return (0.0, 0.0, 0.0);
    }
    let common = reference.intersection(answer) as f32;
    let recall = common / reference.len as f32;
    let precision = common / answer.len as f32;
    let f1 = if recall + precision == 0.0 {
        0.0
    } else {
        2.0 * recall * precision / (recall + precision)
    };
    (recall, precision, f1)
}
