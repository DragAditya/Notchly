//! Small script classifier used to prefer Latin-script (English/Hinglish)
//! lyric versions. Devanagari and other scripts are romanized later.

use whatlang::Lang;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Language {
    /// Latin script: English or romanized Indic (Hinglish).
    English,
    Unknown,
    Other,
}

impl Language {
    pub fn rank(self) -> u8 {
        match self {
            Self::English => 0,
            Self::Unknown => 1,
            Self::Other => 2,
        }
    }

    pub fn code(self) -> &'static str {
        match self {
            Self::English => "latin",
            Self::Unknown => "unknown",
            Self::Other => "other",
        }
    }
}

/// Detects the script of a full lyric. Latin text wins even when a language
/// detector isn't sure it is English: Hinglish is written in Latin letters and
/// is far easier to read than Devanagari for most Notchly users.
pub fn detect(text: &str) -> (Language, String) {
    let text = text.trim();
    if text.chars().count() < 12 {
        return (Language::Unknown, Language::Unknown.code().into());
    }

    let mut letters = 0usize;
    let mut latin = 0usize;
    let mut devanagari = 0usize;
    for ch in text.chars().filter(|ch| ch.is_alphabetic()) {
        letters += 1;
        if ch.is_ascii_alphabetic()
            || matches!(ch as u32, 0x00C0..=0x024F | 0x1E00..=0x1EFF)
        {
            latin += 1;
        }
        if matches!(ch as u32, 0x0900..=0x097F) {
            devanagari += 1;
        }
    }

    if letters > 0 && latin * 100 / letters >= 70 {
        return (Language::English, Language::English.code().into());
    }
    if letters > 0 && devanagari * 100 / letters >= 70 {
        return (Language::Other, "hi".into());
    }

    let Some(info) = whatlang::detect(text) else {
        return (Language::Unknown, Language::Unknown.code().into());
    };
    if info.confidence() < 0.5 {
        return (Language::Unknown, Language::Unknown.code().into());
    }
    if info.lang() == Lang::Eng {
        (Language::English, Language::English.code().into())
    } else {
        (Language::Other, format!("{:?}", info.lang()).to_lowercase())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_text_is_unknown() {
        assert_eq!(detect("hi").0, Language::Unknown);
    }

    #[test]
    fn english_is_detected() {
        let text = "When I was young I never needed anyone and making love was just for fun";
        assert_eq!(detect(text).0, Language::English);
    }

    #[test]
    fn hinglish_counts_as_latin() {
        let text = "Mujhko itna bataye koi kaise tujhse dil na lagaye koi";
        assert_eq!(detect(text).0, Language::English);
        assert_eq!(detect(text).1, "latin");
    }

    #[test]
    fn latin_script_is_preferred() {
        let text = "Cuando era joven nunca necesitaba a nadie y el amor era solo por diversion";
        assert_eq!(detect(text).0, Language::English);
    }

    #[test]
    fn devanagari_is_not_latin() {
        let text = "मुझको इतना बताए कोई कैसे तुझसे दिल ना लगाए कोई";
        assert_eq!(detect(text).0, Language::Other);
        assert_eq!(detect(text).1, "hi");
    }

    #[test]
    fn cjk_is_not_latin() {
        let text = "我曾经跨过山和大海 也穿过人山人海 我曾经拥有着的一切 转眼都飘散如烟";
        assert_ne!(detect(text).0, Language::English);
    }
}
