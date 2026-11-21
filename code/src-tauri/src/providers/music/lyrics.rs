//! Lyrics from several free providers, ranked toward Latin-script versions.
//!
//! LRCLIB is the primary source (synced and plain), Megalobiz adds synced
//! sheets (often the Hinglish version of Indian songs) and lyrics.ovh is the
//! plain fallback. Providers are queried concurrently, then a single candidate
//! is chosen and cached on disk so a song only costs one round of requests.

mod lang;
mod lrc;
mod providers;
mod rank;
mod translit;

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

pub use lang::Language;

const USER_AGENT: &str = concat!("notchly/", env!("CARGO_PKG_VERSION"), " (Windows)");

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Word {
    /// Start of the word, in ms.
    pub time_ms: u64,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Line {
    /// Start of the line, in ms.
    pub time_ms: u64,
    pub text: String,
    /// Word timings from enhanced LRC (`<mm:ss.xx>` tags), when present.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub words: Vec<Word>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    pub lines: Vec<Line>,
    /// False when the provider only had plain text (no timestamps).
    pub synced: bool,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub language: Option<String>,
}

impl Lyrics {
    fn is_empty(&self) -> bool {
        self.lines.is_empty()
    }
}

#[derive(Debug, Clone)]
pub struct TrackQuery {
    pub artist: String,
    pub title: String,
    pub album: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Provider {
    Lrclib,
    Megalobiz,
    LyricsOvh,
}

impl Provider {
    pub fn name(self) -> &'static str {
        match self {
            Self::Lrclib => "lrclib",
            Self::Megalobiz => "megalobiz",
            Self::LyricsOvh => "lyrics.ovh",
        }
    }

    pub fn priority(self) -> u8 {
        match self {
            Self::Lrclib => 0,
            Self::Megalobiz => 1,
            Self::LyricsOvh => 2,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Candidate {
    pub lyrics: Lyrics,
    pub provider: Provider,
    pub language: Language,
    pub synced: bool,
    pub duration_delta_ms: u64,
    pub title: String,
    pub artist: String,
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

fn track_key(artist: &str, title: &str, album: &str, duration_ms: u64, hinglish: bool) -> String {
    format!(
        "v3|{}|{}|{}|{}|{}",
        artist.trim().to_lowercase(),
        title.trim().to_lowercase(),
        album.trim().to_lowercase(),
        duration_ms / 1000,
        if hinglish { "hi" } else { "orig" }
    )
}

fn cache_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?.join("lyrics").join("v3");
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
pub fn fetch(
    app: &AppHandle,
    artist: &str,
    title: &str,
    album: &str,
    duration_ms: u64,
    hinglish: bool,
) -> Lyrics {
    if title.trim().is_empty() {
        return Lyrics::default();
    }
    let key = track_key(artist, title, album, duration_ms, hinglish);
    if let Some(hit) = lock(memory()).get(&key) {
        return hit.clone();
    }

    let lyrics = load_disk(app, &key)
        .filter(|l| !l.is_empty())
        .unwrap_or_else(|| query(artist, title, album, duration_ms, hinglish));

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
            .timeout_global(Some(Duration::from_secs(6)))
            .build(),
    )
}

fn query(artist: &str, title: &str, album: &str, duration_ms: u64, hinglish: bool) -> Lyrics {
    // Search engines are happier with plain words: drop `(Official Video)`,
    // featured artists and edition suffixes before asking.
    let query = TrackQuery {
        artist: rank::normalize(artist),
        title: rank::normalize(title),
        album: album.to_string(),
        duration_ms,
    };
    if query.title.is_empty() {
        return Lyrics::default();
    }

    // Query the providers on their own threads and take the first usable
    // result: LRCLIB and Megalobiz are both asked (the latter is where the
    // Hinglish sheets usually live), and lyrics.ovh is only awaited when
    // neither produces anything. A slow source no longer delays a good one.
    let (sender, receiver) = std::sync::mpsc::channel::<(Provider, Vec<Candidate>)>();
    for source in [Provider::Lrclib, Provider::Megalobiz, Provider::LyricsOvh] {
        let sender = sender.clone();
        let query = query.clone();
        std::thread::spawn(move || {
            let agent = agent();
            let found = match source {
                Provider::Lrclib => providers::lrclib::fetch(&agent, &query),
                Provider::Megalobiz => providers::megalobiz::fetch(&agent, &query),
                Provider::LyricsOvh => providers::lyrics_ovh::fetch(&agent, &query),
            };
            let _ = sender.send((source, found));
        });
    }
    drop(sender);

    let mut candidates = Vec::new();
    let mut lrclib_done = false;
    let mut megalobiz_done = false;
    while !(lrclib_done && megalobiz_done) {
        match receiver.recv_timeout(Duration::from_secs(8)) {
            Ok((source, mut found)) => {
                candidates.append(&mut found);
                match source {
                    Provider::Lrclib => lrclib_done = true,
                    Provider::Megalobiz => megalobiz_done = true,
                    Provider::LyricsOvh => {}
                }
            }
            Err(_) => break,
        }
    }
    // The synced providers came back empty; give the plain fallback its turn.
    if candidates.is_empty() {
        while let Ok((_, mut found)) = receiver.recv_timeout(Duration::from_secs(8)) {
            candidates.append(&mut found);
        }
    }

    rank::choose(candidates, &query)
        .map(|mut candidate| {
            // The user asked for Hinglish: when the only sheet is Devanagari
            // (or another Indic script) romanize it line by line.
            if hinglish && translit::is_indic(&translit::lyric_text(&candidate.lyrics.lines)) {
                translit::romanize(&mut candidate.lyrics.lines);
                candidate.lyrics.language = Some("hi-Latn".into());
            }
            candidate.lyrics
        })
        .unwrap_or_default()
}

/// Called by the frontend whenever the track changes. Runs off the main
/// thread so a slow provider never freezes the island.
#[tauri::command]
pub async fn get_lyrics(
    app: AppHandle,
    artist: String,
    title: String,
    album: String,
    duration_ms: u64,
    prefer_hinglish: Option<bool>,
) -> Result<Lyrics, String> {
    let hinglish = prefer_hinglish.unwrap_or(true);
    tauri::async_runtime::spawn_blocking(move || {
        fetch(&app, &artist, &title, &album, duration_ms, hinglish)
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_key_is_stable_and_versioned() {
        assert_eq!(
            track_key(" Artist ", "Song", " Album ", 200_999, true),
            "v3|artist|song|album|200|hi"
        );
        assert_eq!(
            track_key("Artist", "Song", "Album", 200_999, false),
            "v3|artist|song|album|200|orig"
        );
    }

    #[test]
    #[ignore = "hits lyrics providers"]
    fn fetches_a_known_song() {
        let lyrics = query(
            "The Weeknd",
            "Blinding Lights",
            "After Hours",
            200_000,
            false,
        );
        assert!(lyrics.synced, "expected synced lyrics");
        assert!(lyrics.lines.len() > 10, "expected a full lyric");
        assert!(
            lyrics.lines.iter().any(|l| l.text.contains("tryna call")),
            "expected the first verse"
        );
    }
}
