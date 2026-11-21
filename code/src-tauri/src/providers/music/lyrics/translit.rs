//! Devanagari → Hinglish romanization.
//!
//! Used when the only sheet a provider has is in Devanagari and the user asked
//! for Hinglish. This is a lightweight transliteration, not a dictionary: it
//! keeps Devanagari word order and produces the Latin spelling most Indian
//! listeners type ("mujhko itna bataye koi"). Providers that already ship a
//! romanized sheet always win, so this is only a fallback.

use super::Line;

/// True when enough of the text is Devanagari to be worth romanizing.
pub(crate) fn is_indic(text: &str) -> bool {
    let mut letters = 0usize;
    let mut devanagari = 0usize;
    for ch in text.chars().filter(|ch| ch.is_alphabetic()) {
        letters += 1;
        if matches!(ch as u32, 0x0900..=0x097F) {
            devanagari += 1;
        }
    }
    letters > 0 && devanagari * 100 / letters >= 20
}

pub(crate) fn lyric_text(lines: &[Line]) -> String {
    lines
        .iter()
        .map(|line| line.text.as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

pub(crate) fn romanize(lines: &mut [Line]) {
    for line in lines {
        if !line.words.is_empty() {
            for word in &mut line.words {
                word.text = romanize_text(&word.text);
            }
            line.text = line
                .words
                .iter()
                .map(|word| word.text.as_str())
                .collect::<Vec<_>>()
                .join(" ");
        } else {
            line.text = romanize_text(&line.text);
        }
    }
}

/// Converts one line; Latin-only text is left untouched.
pub(crate) fn romanize_text(input: &str) -> String {
    if !is_indic(input) {
        return input.to_string();
    }

    let chars: Vec<char> = input.chars().collect();
    let mut out = String::with_capacity(input.len());
    let mut i = 0usize;
    while i < chars.len() {
        let ch = chars[i];

        if let Some(vowel) = independent_vowel(ch) {
            out.push_str(vowel);
            i += 1;
            continue;
        }

        if let Some(consonant) = consonant(ch) {
            let mut next = i + 1;
            let mut base = consonant;
            // A nukta changes the consonant (क़ → q, ज़ → z…).
            if next < chars.len() && chars[next] == '\u{093C}' {
                base = nukta(consonant);
                next += 1;
            }
            out.push_str(base);

            // Consume the vowel sign / virama that follows the consonant.
            if next < chars.len() {
                match chars[next] {
                    '\u{094D}' => {
                        // Virama: no inherent vowel, the next consonant joins.
                        next += 1;
                    }
                    '\u{200C}' | '\u{200D}' => {
                        next += 1;
                        if next < chars.len()
                            && let Some(vowel) = matra(chars[next])
                        {
                            out.push_str(vowel);
                            next += 1;
                        }
                    }
                    _ => {
                        if let Some(vowel) = matra(chars[next]) {
                            out.push_str(vowel);
                            next += 1;
                        } else if is_word_end(chars.get(next).copied()) {
                            // Hindi drops the final inherent `a` (दिल → dil).
                        } else {
                            out.push('a');
                        }
                    }
                }
            }
            // At the end of a word the inherent `a` is silent.
            i = next;
            continue;
        }

        match ch {
            '\u{0902}' | '\u{0901}' => out.push('n'),
            '\u{0903}' => out.push('h'),
            '\u{0950}' => out.push_str("om"),
            '\u{0964}' | '\u{0965}' | '\u{0970}' => out.push('.'),
            '0'..='9' => out.push(ch),
            '\u{0966}'..='\u{096F}' => {
                let digit = ch as u32 - 0x0966;
                out.push(char::from(b'0' + digit as u8));
            }
            '\u{200C}' | '\u{200D}' => {}
            '\u{093C}' => {}
            _ => out.push(ch),
        }
        i += 1;
    }

    let cleaned = out.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut chars = cleaned.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => cleaned,
    }
}

fn is_word_end(next: Option<char>) -> bool {
    next.is_none_or(|ch| {
        ch.is_whitespace()
            || !(ch.is_alphanumeric()
                || matches!(ch as u32, 0x0900..=0x097F | 0x200C | 0x200D))
    })
}

fn independent_vowel(ch: char) -> Option<&'static str> {
    Some(match ch {
        'अ' => "a",
        'आ' => "aa",
        'इ' => "i",
        'ई' => "ee",
        'उ' => "u",
        'ऊ' => "oo",
        'ऋ' => "ri",
        'ॠ' => "ri",
        'ऌ' => "li",
        'ॡ' => "li",
        'ऍ' | 'ऎ' => "e",
        'ए' => "e",
        'ऐ' => "ai",
        'ऑ' | 'ऒ' => "o",
        'ओ' => "o",
        'औ' => "au",
        _ => return None,
    })
}

fn matra(ch: char) -> Option<&'static str> {
    Some(match ch {
        'ा' => "a",
        'ि' => "i",
        'ी' => "ee",
        'ु' => "u",
        'ू' => "oo",
        'ृ' => "ri",
        'ॄ' => "ri",
        'ॢ' => "li",
        'ॣ' => "li",
        'ॅ' | 'ॆ' => "e",
        'े' => "e",
        'ै' => "ai",
        'ॉ' | 'ॊ' => "o",
        'ो' => "o",
        'ौ' => "au",
        _ => return None,
    })
}

fn consonant(ch: char) -> Option<&'static str> {
    Some(match ch {
        'क' => "k",
        'ख' => "kh",
        'ग' => "g",
        'घ' => "gh",
        'ङ' => "ng",
        'च' => "ch",
        'छ' => "chh",
        'ज' => "j",
        'झ' => "jh",
        'ञ' => "ny",
        'ट' => "t",
        'ठ' => "th",
        'ड' => "d",
        'ढ' => "dh",
        'ण' => "n",
        'त' => "t",
        'थ' => "th",
        'द' => "d",
        'ध' => "dh",
        'न' => "n",
        'प' => "p",
        'फ' => "ph",
        'ब' => "b",
        'भ' => "bh",
        'म' => "m",
        'य' => "y",
        'र' => "r",
        'ल' => "l",
        'व' => "v",
        'श' => "sh",
        'ष' => "sh",
        'स' => "s",
        'ह' => "h",
        'ळ' => "l",
        'ऱ' => "r",
        'ऴ' => "zh",
        _ => return None,
    })
}

/// The nukta forms used for loanwords (क़, ख़, ज़, ड़, ढ़, फ़…).
fn nukta(base: &str) -> &'static str {
    match base {
        "k" => "q",
        "kh" => "kh",
        "g" => "g",
        "j" => "z",
        "d" => "r",
        "dh" => "rh",
        "ph" => "f",
        "y" => "y",
        _ => "n",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn romanizes_common_lines() {
        assert_eq!(
            romanize_text("मुझको इतना बताए कोई"),
            "Mujhko itna batae koi"
        );
        assert_eq!(
            romanize_text("कैसे तुझसे दिल ना लगाए कोई"),
            "Kaise tujhse dil na lagae koi"
        );
        assert_eq!(romanize_text("क्या प्यार है"), "Kya pyar hai");
        assert_eq!(romanize_text("इश्क़"), "Ishq");
        assert_eq!(romanize_text("गीत"), "Geet");
    }

    #[test]
    fn leaves_latin_alone() {
        assert_eq!(romanize_text("Mujhko itna bataye"), "Mujhko itna bataye");
    }

    #[test]
    fn detects_devanagari() {
        assert!(is_indic("मुझको इतना बताए कोई"));
        assert!(!is_indic("Mujhko itna bataye koi"));
    }
}
