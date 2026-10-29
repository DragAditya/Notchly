//! Synced lyrics from [LRCLIB](https://lrclib.net), fetched on demand by the
//! frontend and cached on disk so a song only costs one request.
//!
//! LRCLIB is free and needs no account. Its timestamps are per line; the UI
//! spreads each line's words by character count so the karaoke still follows
//! the voice closely.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

const API: &str = "https://lrclib.net/api";
const USER_AGENT: &str = concat!(
    "notchly/",
    env!("CARGO_PKG_VERSION"),
    " (https://github.com/DragAditya/Notchly)"
);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Line {
    /// Start of the line, in ms.
    pub time_ms: u64,
    pub text: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    pub lines: Vec<Line>,
    /// False when LRCLIB only had plain text (no timestamps).
    pub synced: bool,
}

impl Lyrics {
    fn is_empty(&self) -> bool {
        self.lines.is_empty()
    }
}

/// Session cache: keyed by track, including misses so a song without lyrics
/// doesn't get requested again on every re-render.
fn memory() -> &'static Mutex<HashMap<String, Lyrics>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Lyrics>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn track_key(artist: &str, title: &str, album: &str, duration_ms: u64) -> String {
    format!(
        "{}|{}|{}|{}",
        artist.trim().to_lowercase(),
        title.trim().to_lowercase(),
        album.trim().to_lowercase(),
        duration_ms / 1000
    )
}

fn cache_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?.join("lyrics");
    fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

fn cache_file(app: &AppHandle, key: &str) -> Option<PathBuf> {
    let digest = Sha256::digest(key.as_bytes());
    let name: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    Some(cache_dir(app)?.join(format!("{name}.json")))
}

fn load_disk(app: &AppHandle, key: &str) -> Option<Lyrics> {
    let path = cache_file(app, key)?;
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn save_disk(app: &AppHandle, key: &str, lyrics: &Lyrics) {
    let Some(path) = cache_file(app, key) else {
        return;
    };
    if let Ok(text) = serde_json::to_string(lyrics) {
        let _ = fs::write(path, text);
    }
}

/// Fetch a track's lyrics, from the cache when possible.
pub fn fetch(app: &AppHandle, artist: &str, title: &str, album: &str, duration_ms: u64) -> Lyrics {
    if title.trim().is_empty() {
        return Lyrics::default();
    }
    let key = track_key(artist, title, album, duration_ms);
    if let Some(hit) = lock(memory()).get(&key) {
        return hit.clone();
    }

    let lyrics = load_disk(app, &key)
        .filter(|l| !l.is_empty())
        .unwrap_or_else(|| query(artist, title, album, duration_ms));

    if !lyrics.is_empty() {
        save_disk(app, &key, &lyrics);
    }
    lock(memory()).insert(key, lyrics.clone());
    lyrics
}

fn agent() -> ureq::Agent {
    ureq::Agent::new_with_config(
        ureq::Agent::config_builder()
            .user_agent(USER_AGENT)
            .timeout_global(Some(Duration::from_secs(12)))
            .build(),
    )
}

#[derive(Debug, Deserialize)]
struct Record {
    #[serde(rename = "syncedLyrics")]
    synced: Option<String>,
    #[serde(rename = "plainLyrics")]
    plain: Option<String>,
    duration: Option<f64>,
}

fn query(artist: &str, title: &str, album: &str, duration_ms: u64) -> Lyrics {
    let agent = agent();
    let duration = duration_ms / 1000;
    // Exact matches sometimes only carry plain text; keep it as a last resort
    // and search for a synced version below.
    let mut fallback = None;

    // Exact match first (LRCLIB wants artist + title + album + duration).
    let exact = agent
        .get(format!("{API}/get"))
        .query("artist_name", artist)
        .query("track_name", title)
        .query("album_name", album)
        .query("duration", duration.to_string())
        .call();

    if let Ok(mut res) = exact
        && let Ok(body) = res.body_mut().read_to_string()
        && let Ok(record) = serde_json::from_str::<Record>(&body)
        && let Some(lyrics) = from_record(record)
    {
        if lyrics.synced {
            return lyrics;
        }
        fallback = Some(lyrics);
    }

    // Otherwise search: synced results first, then the closest length.
    let search = agent
        .get(format!("{API}/search"))
        .query("track_name", title)
        .query("artist_name", artist)
        .call();

    let Ok(mut res) = search else {
        return fallback.unwrap_or_default();
    };
    let Ok(body) = res.body_mut().read_to_string() else {
        return fallback.unwrap_or_default();
    };
    let Ok(mut records) = serde_json::from_str::<Vec<Record>>(&body) else {
        return fallback.unwrap_or_default();
    };

    let target = duration_ms as f64;
    records.sort_by_key(|r| {
        let synced = r.synced.as_deref().is_some_and(|s| !s.trim().is_empty());
        let delta = (r.duration.unwrap_or(target) - target).abs();
        (!synced, delta.round() as u64)
    });
    records
        .into_iter()
        .find_map(from_record)
        .or(fallback)
        .unwrap_or_default()
}

fn from_record(record: Record) -> Option<Lyrics> {
    if let Some(synced) = record.synced.as_deref() {
        let lines = parse_lrc(synced);
        if !lines.is_empty() {
            return Some(Lyrics {
                lines,
                synced: true,
            });
        }
    }
    let plain = record.plain?;
    let lines: Vec<Line> = plain
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(|text| Line {
            time_ms: 0,
            text: text.to_string(),
        })
        .collect();
    (!lines.is_empty()).then_some(Lyrics {
        lines,
        synced: false,
    })
}

/// `[mm:ss.xx]` (and `[hh:mm:ss.xx]`) timestamps, one line per stamp.
fn parse_lrc(text: &str) -> Vec<Line> {
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
        let text = strip_word_tags(rest).trim().to_string();
        if text.is_empty() {
            continue;
        }
        for ms in stamps {
            lines.push(Line {
                time_ms: ms,
                text: text.clone(),
            });
        }
    }
    lines.sort_by_key(|l| l.time_ms);
    lines.dedup_by(|a, b| a.time_ms == b.time_ms && a.text == b.text);
    lines
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

/// Called by the frontend whenever the track changes. Runs off the main
/// thread so a slow LRCLIB response never freezes the island.
#[tauri::command]
pub async fn get_lyrics(
    app: AppHandle,
    artist: String,
    title: String,
    album: String,
    duration_ms: u64,
) -> Result<Lyrics, String> {
    tauri::async_runtime::spawn_blocking(move || fetch(&app, &artist, &title, &album, duration_ms))
        .await
        .map_err(|e| e.to_string())
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
                    text: "Hello world".into()
                },
                Line {
                    time_ms: 20_000,
                    text: "Again".into()
                },
                Line {
                    time_ms: 30_000,
                    text: "Again".into()
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
    #[ignore = "hits LRCLIB"]
    fn fetches_a_known_song() {
        let lyrics = query("The Weeknd", "Blinding Lights", "After Hours", 200_000);
        assert!(lyrics.synced, "expected synced lyrics");
        assert!(lyrics.lines.len() > 10, "expected a full lyric");
        assert!(
            lyrics.lines.iter().any(|l| l.text.contains("tryna call")),
            "expected the first verse"
        );
    }
}
