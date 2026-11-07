//! Lyrics from several free providers, ranked toward the English original.
//!
//! LRCLIB is the primary source (synced and plain). lyrics.ovh is the plain
//! fallback. Providers are queried concurrently, then a single candidate is
//! chosen and cached on disk so a song only costs one round of requests.

mod lang;
mod lrc;
mod providers;
mod rank;

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
pub struct Line {
    /// Start of the line, in ms.
    pub time_ms: u64,
    pub text: String,
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
    LyricsOvh,
}

impl Provider {
    pub fn name(self) -> &'static str {
        match self {
            Self::Lrclib => "lrclib",
            Self::LyricsOvh => "lyrics.ovh",
        }
    }

    pub fn priority(self) -> u8 {
        match self {
            Self::Lrclib => 0,
            Self::LyricsOvh => 1,
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

fn track_key(artist: &str, title: &str, album: &str, duration_ms: u64) -> String {
    format!(
        "v2|{}|{}|{}|{}",
        artist.trim().to_lowercase(),
        title.trim().to_lowercase(),
        album.trim().to_lowercase(),
        duration_ms / 1000
    )
}

fn cache_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?.join("lyrics").join("v2");
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
            .timeout_global(Some(Duration::from_secs(5)))
            .build(),
    )
}

fn query(artist: &str, title: &str, album: &str, duration_ms: u64) -> Lyrics {
    let query = TrackQuery {
        artist: artist.to_string(),
        title: title.to_string(),
        album: album.to_string(),
        duration_ms,
    };

    let candidates = std::thread::scope(|scope| {
        let lrclib = scope.spawn(|| providers::lrclib::fetch(&agent(), &query));
        let lyrics_ovh = scope.spawn(|| providers::lyrics_ovh::fetch(&agent(), &query));

        let mut all = Vec::new();
        if let Ok(mut found) = lrclib.join() {
            all.append(&mut found);
        }
        if let Ok(mut found) = lyrics_ovh.join() {
            all.append(&mut found);
        }
        all
    });

    rank::choose(candidates, &query)
        .map(|candidate| candidate.lyrics)
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
) -> Result<Lyrics, String> {
    tauri::async_runtime::spawn_blocking(move || fetch(&app, &artist, &title, &album, duration_ms))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_key_is_stable_and_versioned() {
        assert_eq!(
            track_key(" Artist ", "Song", " Album ", 200_999),
            "v2|artist|song|album|200"
        );
    }

    #[test]
    #[ignore = "hits lyrics providers"]
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
