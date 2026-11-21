//! Megalobiz provider: a free synced-lyrics API.
//!
//! Its catalog is especially good for Indian songs, and many sheets are the
//! romanized (Hinglish) version — which is what Notchly prefers. One search
//! plus one LRC download per track keeps us far inside the anonymous quota.

use serde::Deserialize;

use super::super::lang::detect;
use super::super::lrc::{lyric_text, parse_lrc};
use super::super::{Candidate, Lyrics, Provider, TrackQuery};

const API: &str = "https://api.megalobiz.com/api/public/v1";

#[derive(Debug, Deserialize)]
struct Search {
    #[serde(default)]
    results: Vec<Hit>,
}

#[derive(Debug, Clone, Deserialize)]
struct Hit {
    id: u64,
    #[serde(default)]
    title: String,
    #[serde(default)]
    artist: String,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    duration_diff: Option<f64>,
}

pub fn fetch(agent: &ureq::Agent, query: &TrackQuery) -> Vec<Candidate> {
    if query.title.trim().is_empty() {
        return Vec::new();
    }

    let mut hits = search(agent, query, false);
    if hits.is_empty() {
        hits = search(agent, query, true);
    }
    // The API already ranks by match quality; two attempts is plenty and keeps
    // the request count low.
    hits.truncate(2);

    let mut candidates = Vec::new();
    for hit in hits {
        if let Some(candidate) = download(agent, &hit, query) {
            candidates.push(candidate);
        }
    }
    candidates
}

fn search(agent: &ureq::Agent, query: &TrackQuery, free_text: bool) -> Vec<Hit> {
    let mut request = agent.get(format!("{API}/search")).query("limit", "5");
    if free_text {
        let text = format!("{} {}", query.artist, query.title);
        request = request.query("q", text.trim());
    } else {
        request = request.query("title", &query.title);
        if !query.artist.trim().is_empty() {
            request = request.query("artist", &query.artist);
        }
        if query.duration_ms > 0 {
            request = request.query("duration", (query.duration_ms / 1000).to_string());
        }
    }

    let Ok(mut response) = request.call() else {
        return Vec::new();
    };
    let Ok(body) = response.body_mut().read_to_string() else {
        return Vec::new();
    };
    serde_json::from_str::<Search>(&body)
        .map(|payload| payload.results)
        .unwrap_or_default()
}

fn download(agent: &ureq::Agent, hit: &Hit, query: &TrackQuery) -> Option<Candidate> {
    let Ok(mut response) = agent.get(format!("{API}/lrc/{}", hit.id)).query("format", "lrc").call() else {
        return None;
    };
    let Ok(body) = response.body_mut().read_to_string() else {
        return None;
    };
    let lines = parse_lrc(&body);
    if lines.is_empty() {
        return None;
    }

    let text = lyric_text(&lines);
    let (language, language_code) = detect(&text);
    let duration_delta_ms = hit
        .duration_diff
        .map(|diff| (diff * 1000.0).abs().round() as u64)
        .or_else(|| {
            hit.duration.map(|seconds| {
                (seconds * 1000.0 - query.duration_ms as f64).abs().round() as u64
            })
        })
        .unwrap_or(0);

    Some(Candidate {
        lyrics: Lyrics {
            lines,
            synced: true,
            provider: Some(Provider::Megalobiz.name().into()),
            language: Some(language_code),
        },
        provider: Provider::Megalobiz,
        language,
        synced: true,
        duration_delta_ms,
        title: if hit.title.trim().is_empty() {
            query.title.clone()
        } else {
            hit.title.clone()
        },
        artist: if hit.artist.trim().is_empty() {
            query.artist.clone()
        } else {
            hit.artist.clone()
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_search_results() {
        let body = r#"{"count":1,"results":[{"id":42,"title":"Song","artist":"Artist","duration":212.6,"duration_diff":0.4,"score":0.99}]}"#;
        let payload: Search = serde_json::from_str(body).unwrap();
        assert_eq!(payload.results.len(), 1);
        assert_eq!(payload.results[0].id, 42);
        assert_eq!(payload.results[0].duration, Some(212.6));
    }
}
