//! lyrics.ovh provider: plain lyrics only.

use serde::Deserialize;

use super::super::lang::detect;
use super::super::lrc::{lyric_text, parse_plain};
use super::super::{Candidate, Lyrics, Provider, TrackQuery};

#[derive(Debug, Deserialize)]
struct Response {
    lyrics: Option<String>,
}

pub fn fetch(agent: &ureq::Agent, query: &TrackQuery) -> Vec<Candidate> {
    if query.artist.trim().is_empty() || query.title.trim().is_empty() {
        return Vec::new();
    }

    let Ok(mut url) = url::Url::parse("https://api.lyrics.ovh/v1") else {
        return Vec::new();
    };
    let Ok(mut segments) = url.path_segments_mut() else {
        return Vec::new();
    };
    segments.push(&query.artist).push(&query.title);
    drop(segments);

    let Ok(mut response) = agent.get(url.as_str()).call() else {
        return Vec::new();
    };
    let Ok(body) = response.body_mut().read_to_string() else {
        return Vec::new();
    };
    parse_response(&body, query).into_iter().collect()
}

fn parse_response(body: &str, query: &TrackQuery) -> Option<Candidate> {
    let payload: Response = serde_json::from_str(body).ok()?;
    let lines = parse_plain(payload.lyrics.as_deref()?);
    if lines.is_empty() {
        return None;
    }
    let text = lyric_text(&lines);
    let (language, language_code) = detect(&text);
    Some(Candidate {
        lyrics: Lyrics {
            lines,
            synced: false,
            provider: Some(Provider::LyricsOvh.name().into()),
            language: Some(language_code),
        },
        provider: Provider::LyricsOvh,
        language,
        synced: false,
        duration_delta_ms: 0,
        title: query.title.clone(),
        artist: query.artist.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_response() {
        let query = TrackQuery {
            artist: "Artist".into(),
            title: "Song".into(),
            album: String::new(),
            duration_ms: 200_000,
        };
        let body = r#"{"lyrics":"First line\r\n\r\nSecond line"}"#;
        let candidate = parse_response(body, &query).unwrap();
        assert!(!candidate.synced);
        assert_eq!(candidate.lyrics.lines.len(), 2);
        assert_eq!(candidate.lyrics.provider.as_deref(), Some("lyrics.ovh"));
    }
}
