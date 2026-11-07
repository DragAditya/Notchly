//! LRCLIB provider: exact lookup, then search.

use serde::Deserialize;

use super::super::lang::detect;
use super::super::lrc::{lyric_text, parse_lrc, parse_plain};
use super::super::{Candidate, Lyrics, Provider, TrackQuery};

const API: &str = "https://lrclib.net/api";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Record {
    track_name: Option<String>,
    artist_name: Option<String>,
    duration: Option<f64>,
    instrumental: Option<bool>,
    plain_lyrics: Option<String>,
    synced_lyrics: Option<String>,
}

pub fn fetch(agent: &ureq::Agent, query: &TrackQuery) -> Vec<Candidate> {
    let mut candidates = Vec::new();

    if let Some(record) = exact(agent, query)
        && let Some(candidate) = to_candidate(record, query)
    {
        candidates.push(candidate);
    }

    for record in search(agent, query) {
        if let Some(candidate) = to_candidate(record, query) {
            candidates.push(candidate);
        }
    }

    candidates
}

fn exact(agent: &ureq::Agent, query: &TrackQuery) -> Option<Record> {
    let mut response = agent
        .get(format!("{API}/get"))
        .query("artist_name", &query.artist)
        .query("track_name", &query.title)
        .query("album_name", &query.album)
        .query("duration", (query.duration_ms / 1000).to_string())
        .call()
        .ok()?;
    let body = response.body_mut().read_to_string().ok()?;
    serde_json::from_str(&body).ok()
}

fn search(agent: &ureq::Agent, query: &TrackQuery) -> Vec<Record> {
    let mut request = agent
        .get(format!("{API}/search"))
        .query("track_name", &query.title);
    if !query.artist.trim().is_empty() {
        request = request.query("artist_name", &query.artist);
    }
    let Ok(mut response) = request.call() else {
        return Vec::new();
    };
    let Ok(body) = response.body_mut().read_to_string() else {
        return Vec::new();
    };
    serde_json::from_str(&body).unwrap_or_default()
}

fn to_candidate(record: Record, query: &TrackQuery) -> Option<Candidate> {
    if record.instrumental.unwrap_or(false) {
        return None;
    }

    let synced_lines = record
        .synced_lyrics
        .as_deref()
        .map(parse_lrc)
        .unwrap_or_default();
    let (lines, synced) = if synced_lines.is_empty() {
        let plain = record
            .plain_lyrics
            .as_deref()
            .map(parse_plain)
            .unwrap_or_default();
        (plain, false)
    } else {
        (synced_lines, true)
    };
    if lines.is_empty() {
        return None;
    }

    let text = lyric_text(&lines);
    let (language, language_code) = detect(&text);
    let duration_delta_ms = record
        .duration
        .map(|seconds| (seconds * 1000.0 - query.duration_ms as f64).abs().round() as u64)
        .unwrap_or(0);

    Some(Candidate {
        lyrics: Lyrics {
            lines,
            synced,
            provider: Some(Provider::Lrclib.name().into()),
            language: Some(language_code),
        },
        provider: Provider::Lrclib,
        language,
        synced,
        duration_delta_ms,
        title: record.track_name.unwrap_or_else(|| query.title.clone()),
        artist: record.artist_name.unwrap_or_else(|| query.artist.clone()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query() -> TrackQuery {
        TrackQuery {
            artist: "Artist".into(),
            title: "Song".into(),
            album: "Album".into(),
            duration_ms: 200_000,
        }
    }

    #[test]
    fn ignores_instrumentals() {
        let record = Record {
            track_name: Some("Song".into()),
            artist_name: Some("Artist".into()),
            duration: Some(200.0),
            instrumental: Some(true),
            plain_lyrics: Some("word".into()),
            synced_lyrics: None,
        };
        assert!(to_candidate(record, &query()).is_none());
    }

    #[test]
    fn keeps_plain_lyrics() {
        let record = Record {
            track_name: Some("Song".into()),
            artist_name: Some("Artist".into()),
            duration: Some(200.0),
            instrumental: Some(false),
            plain_lyrics: Some("one\ntwo".into()),
            synced_lyrics: None,
        };
        let candidate = to_candidate(record, &query()).unwrap();
        assert!(!candidate.synced);
        assert_eq!(candidate.lyrics.lines.len(), 2);
        assert_eq!(candidate.lyrics.provider.as_deref(), Some("lrclib"));
    }
}
