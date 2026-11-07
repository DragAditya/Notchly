//! Small language classifier used to prefer English lyric versions.

use whatlang::Lang;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Language {
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
            Self::English => "en",
            Self::Unknown => "unknown",
            Self::Other => "other",
        }
    }
}

/// Detects the language of a full lyric. Short or low-confidence text is
/// `Unknown`, which still ranks above a confidently non-English result.
pub fn detect(text: &str) -> (Language, String) {
    let text = text.trim();
    if text.chars().count() < 12 {
        return (Language::Unknown, Language::Unknown.code().into());
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
    fn cjk_is_not_english() {
        let text = "我曾经跨过山和大海 也穿过人山人海 我曾经拥有着的一切 转眼都飘散如烟";
        assert_ne!(detect(text).0, Language::English);
    }

    #[test]
    fn spanish_is_not_english() {
        let text = "Cuando era joven nunca necesitaba a nadie y el amor era solo por diversion";
        assert_ne!(detect(text).0, Language::English);
    }
}
