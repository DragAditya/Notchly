//! LRC and plain-text lyric parsing.

use super::{Line, Word};

/// `[mm:ss.xx]` (and `[hh:mm:ss.xx]`) timestamps, one line per stamp.
pub(crate) fn parse_lrc(text: &str) -> Vec<Line> {
    let mut lines = Vec::new();
    for raw in text.lines() {
        let raw = raw.trim();
        if raw.is_empty() {
            continue;
        }
        let mut rest = raw;
        let mut stamps = Vec::new();
        let mut metadata = false;
        while let Some(after) = rest.strip_prefix('[') {
            let Some(end) = after.find(']') else { break };
            let tag = &after[..end];
            if let Some(ms) = parse_stamp(tag) {
                stamps.push(ms);
                rest = &after[end + 1..];
            } else {
                // `[ar:...]`, `[ti:...]`…: not a lyric line.
                metadata = stamps.is_empty();
                break;
            }
        }
        if metadata || stamps.is_empty() {
            continue;
        }
        let (text, words) = parse_words(rest, stamps[0]);
        if text.is_empty() {
            continue;
        }
        for ms in stamps {
            // Word tags carry absolute times; anchor them to the line stamp
            // when providers only tag the first word or omit the tag entirely.
            let words = words
                .iter()
                .map(|word| Word {
                    time_ms: ms + word.time_ms,
                    text: word.text.clone(),
                })
                .collect();
            lines.push(Line {
                time_ms: ms,
                text: text.clone(),
                words,
            });
        }
    }
    lines.sort_by_key(|l| l.time_ms);
    lines.dedup_by(|a, b| a.time_ms == b.time_ms && a.text == b.text);
    lines
}

/// Splits enhanced-LRC word tags (`<mm:ss.xx>word`) from a line.
///
/// Returns the plain line text and word timings *relative* to the line start.
fn parse_words(text: &str, line_start: u64) -> (String, Vec<Word>) {
    if !text.contains('<') {
        return (text.trim().to_string(), Vec::new());
    }

    // Text chunks paired with the timestamp that introduced them.
    let mut chunks: Vec<(Option<u64>, String)> = Vec::new();
    let mut rest = text;
    let mut current: Option<u64> = None;
    let mut buffer = String::new();

    loop {
        let Some(start) = rest.find('<') else {
            buffer.push_str(rest);
            break;
        };
        let Some(relative_end) = rest[start..].find('>') else {
            buffer.push_str(rest);
            break;
        };
        let tag = &rest[start + 1..start + relative_end];
        let Some(ms) = parse_stamp(tag) else {
            // A literal `<` that isn't a timestamp.
            buffer.push_str(&rest[..start + relative_end + 1]);
            rest = &rest[start + relative_end + 1..];
            continue;
        };
        buffer.push_str(&rest[..start]);
        if !buffer.is_empty() {
            chunks.push((current, std::mem::take(&mut buffer)));
        }
        current = Some(ms);
        rest = &rest[start + relative_end + 1..];
    }
    if !buffer.is_empty() {
        chunks.push((current, buffer));
    }

    let mut plain = String::new();
    let mut words = Vec::new();
    for (time, chunk) in chunks {
        let clean = strip_word_tags(chunk.trim());
        if clean.is_empty() {
            continue;
        }
        if !plain.is_empty() {
            plain.push(' ');
        }
        plain.push_str(&clean);
        if let Some(time_ms) = time {
            words.push(Word {
                time_ms: time_ms.saturating_sub(line_start),
                text: clean,
            });
        }
    }

    (plain, words)
}

/// Plain text has no timestamps; every line starts at zero.
pub(crate) fn parse_plain(text: &str) -> Vec<Line> {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|text| Line {
            time_ms: 0,
            text: text.to_string(),
            words: Vec::new(),
        })
        .collect()
}

pub(crate) fn lyric_text(lines: &[Line]) -> String {
    lines
        .iter()
        .map(|line| line.text.as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

fn parse_stamp(tag: &str) -> Option<u64> {
    let parts: Vec<&str> = tag.split(':').collect();
    if !(2..=3).contains(&parts.len()) {
        return None;
    }
    let mut secs = 0f64;
    for (i, part) in parts.iter().enumerate() {
        let value: f64 = part.trim().parse().ok()?;
        if value < 0.0 {
            return None;
        }
        // Last part is `ss.xxx`, the ones before are whole minutes/hours.
        secs = if i + 1 == parts.len() {
            secs * 60.0 + value
        } else {
            secs * 60.0 + value.floor()
        };
    }
    Some((secs * 1000.0).round() as u64)
}

/// Enhanced LRC carries `<mm:ss.xx>` word tags inside the text.
fn strip_word_tags(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find('<') {
        let Some(end) = rest[start..].find('>') else {
            break;
        };
        let tag = &rest[start + 1..start + end];
        if parse_stamp(tag).is_some() {
            out.push_str(&rest[..start]);
        } else {
            out.push_str(&rest[..start + end + 1]);
        }
        rest = &rest[start + end + 1..];
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_timestamps_and_metadata() {
        let lrc = "[ar:Test]\n[00:12.50] Hello world\n[00:20.00][00:30.00] Again";
        let lines = parse_lrc(lrc);
        assert_eq!(
            lines,
            vec![
                Line {
                    time_ms: 12_500,
                    text: "Hello world".into(),
                    words: Vec::new(),
                },
                Line {
                    time_ms: 20_000,
                    text: "Again".into(),
                    words: Vec::new(),
                },
                Line {
                    time_ms: 30_000,
                    text: "Again".into(),
                    words: Vec::new(),
                },
            ]
        );
    }

    #[test]
    fn parses_enhanced_word_tags() {
        let lrc = "[00:12.00]<00:12.00>Hello <00:12.60>big <00:13.20>world";
        let lines = parse_lrc(lrc);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].text, "Hello big world");
        // Word times are absolute (the line stamp plus the word-tag offset),
        // matching `LyricWordSpan.timeMs` in the frontend.
        assert_eq!(
            lines[0].words,
            vec![
                Word {
                    time_ms: 12_000,
                    text: "Hello".into()
                },
                Word {
                    time_ms: 12_600,
                    text: "big".into()
                },
                Word {
                    time_ms: 13_200,
                    text: "world".into()
                },
            ]
        );
    }

    #[test]
    fn strips_word_tags() {
        assert_eq!(strip_word_tags("<00:01.00>Hi <00:02.00>there"), "Hi there");
        assert_eq!(strip_word_tags("a < b"), "a < b");
    }

    #[test]
    fn parses_plain_text() {
        let lines = parse_plain("First line\r\n\r\n  Second line  \n");
        assert_eq!(
            lines,
            vec![
                Line {
                    time_ms: 0,
                    text: "First line".into(),
                    words: Vec::new(),
                },
                Line {
                    time_ms: 0,
                    text: "Second line".into(),
                    words: Vec::new(),
                },
            ]
        );
    }
}
