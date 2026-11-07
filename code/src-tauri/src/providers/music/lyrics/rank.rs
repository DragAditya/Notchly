//! Candidate filtering and ranking.

use std::cmp::Reverse;

use super::{Candidate, TrackQuery};

const STRICT_TOLERANCE_MS: u64 = 10_000;
const LOOSE_TOLERANCE_MS: u64 = 20_000;

/// Picks the best candidate, preferring English, then synced lyrics.
pub fn choose(candidates: Vec<Candidate>, query: &TrackQuery) -> Option<Candidate> {
    let mut pool = filter(&candidates, query, STRICT_TOLERANCE_MS, true);
    if pool.is_empty() {
        // Some providers return a slightly different title, or omit the
        // artist. Give those a second chance, but still require a title match.
        pool = filter(&candidates, query, LOOSE_TOLERANCE_MS, false);
    }
    pool.into_iter().min_by_key(|c| {
        (
            c.language.rank(),
            !c.synced,
            c.provider.priority(),
            c.duration_delta_ms,
            Reverse(c.lyrics.lines.len()),
        )
    })
}

fn filter(
    candidates: &[Candidate],
    query: &TrackQuery,
    tolerance_ms: u64,
    require_artist: bool,
) -> Vec<Candidate> {
    let title = normalize(&query.title);
    let artist = normalize(&query.artist);
    candidates
        .iter()
        .filter(|candidate| {
            if !title_matches(&title, &normalize(&candidate.title)) {
                return false;
            }
            if require_artist
                && !artist.is_empty()
                && !title_matches(&artist, &normalize(&candidate.artist))
            {
                return false;
            }
            candidate.duration_delta_ms <= tolerance_ms
        })
        .cloned()
        .collect()
}

fn title_matches(query: &str, candidate: &str) -> bool {
    if query.is_empty() || candidate.is_empty() {
        return false;
    }
    if query.len() <= 2 || candidate.len() <= 2 {
        return query == candidate;
    }
    query == candidate || query.contains(candidate) || candidate.contains(query)
}

/// Lowercase, drop bracketed suffixes, featured artists and common edition
/// suffixes, then keep only words.
pub(crate) fn normalize(value: &str) -> String {
    let mut text = String::with_capacity(value.len());
    let mut depth = 0usize;
    for ch in value.to_lowercase().chars() {
        match ch {
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => depth = depth.saturating_sub(1),
            _ if depth == 0 => text.push(ch),
            _ => {}
        }
    }
    for marker in [" feat. ", " feat ", " ft. ", " ft ", " featuring "] {
        if let Some(index) = text.find(marker) {
            text.truncate(index);
        }
    }
    if let Some((head, tail)) = text.rsplit_once(" - ") {
        let tail = tail.trim();
        if matches!(
            tail,
            "live" | "remaster" | "remastered" | "edit" | "radio edit" | "acoustic" | "version"
        ) {
            text = head.to_string();
        }
    }
    let cleaned: String = text
        .chars()
        .map(|ch| if ch.is_alphanumeric() { ch } else { ' ' })
        .collect();
    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::music::lyrics::{Language, Line, Lyrics, Provider};

    fn query() -> TrackQuery {
        TrackQuery {
            artist: "Artist".into(),
            title: "Song".into(),
            album: String::new(),
            duration_ms: 200_000,
        }
    }

    fn candidate(
        language: Language,
        synced: bool,
        provider: Provider,
        duration_delta_ms: u64,
        lines: usize,
    ) -> Candidate {
        Candidate {
            lyrics: Lyrics {
                lines: (0..lines)
                    .map(|i| Line {
                        time_ms: i as u64,
                        text: "x".into(),
                    })
                    .collect(),
                synced,
                provider: Some(provider.name().into()),
                language: Some(language.code().into()),
            },
            provider,
            language,
            synced,
            duration_delta_ms,
            title: "Song".into(),
            artist: "Artist".into(),
        }
    }

    #[test]
    fn normalizes_editions_and_features() {
        assert_eq!(normalize("Yellow (Live) [Remastered]"), "yellow");
        assert_eq!(normalize("Coldplay feat. Someone"), "coldplay");
        assert_eq!(normalize("Song - Live"), "song");
        assert_eq!(normalize("Hello, World!"), "hello world");
    }

    #[test]
    fn english_plain_beats_non_english_synced() {
        let chosen = choose(
            vec![
                candidate(Language::English, false, Provider::Lrclib, 0, 20),
                candidate(Language::Other, true, Provider::Lrclib, 0, 40),
            ],
            &query(),
        )
        .unwrap();
        assert_eq!(chosen.language, Language::English);
        assert!(!chosen.synced);
    }

    #[test]
    fn english_synced_beats_english_plain() {
        let chosen = choose(
            vec![
                candidate(Language::English, false, Provider::Lrclib, 0, 20),
                candidate(Language::English, true, Provider::Lrclib, 0, 40),
            ],
            &query(),
        )
        .unwrap();
        assert!(chosen.synced);
    }

    #[test]
    fn provider_priority_breaks_ties() {
        let chosen = choose(
            vec![
                candidate(Language::English, true, Provider::LyricsOvh, 0, 20),
                candidate(Language::English, true, Provider::Lrclib, 0, 20),
            ],
            &query(),
        )
        .unwrap();
        assert_eq!(chosen.provider, Provider::Lrclib);
    }

    #[test]
    fn closest_duration_breaks_ties() {
        let chosen = choose(
            vec![
                candidate(Language::English, true, Provider::Lrclib, 5_000, 20),
                candidate(Language::English, true, Provider::Lrclib, 1_000, 20),
            ],
            &query(),
        )
        .unwrap();
        assert_eq!(chosen.duration_delta_ms, 1_000);
    }
}
