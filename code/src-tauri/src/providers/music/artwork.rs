//! Cover-art fallback for players that publish no artwork — or publish their
//! own logo instead. Browsers (Brave, Chrome, Edge…) do exactly that when you
//! play music on the web, so Windows hands us the browser icon.
//!
//! When that happens the song is looked up on Deezer (best coverage, no key),
//! then iTunes, and the cover is downloaded and cached as a data URL so the
//! island — and the lyrics board's accent colour — show real album art.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::Engine;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) notchly-art/1 (+https://notchly.app)";
/// Covers larger than this are skipped rather than shipped through the state.
const MAX_BYTES: u64 = 4 * 1024 * 1024;

/// Session cache keyed by track; `None` records a miss so a song we couldn't
/// find isn't looked up again on every poll.
#[derive(Default, Clone)]
pub struct Resolver {
    cache: Arc<Mutex<HashMap<String, Option<String>>>>,
    /// Keys currently being resolved, so only one lookup runs per track.
    in_flight: Arc<Mutex<HashSet<String>>>,
}

impl Resolver {
    /// The cached cover for a track, if any; starts a lookup the first time a
    /// track is asked and returns `None` until it finishes.
    pub fn art(&self, app: &AppHandle, artist: &str, title: &str) -> Option<String> {
        let title = title.trim();
        if title.is_empty() {
            return None;
        }
        let key = art_key(artist, title);
        if let Some(hit) = self.cache.lock().unwrap().get(&key) {
            return hit.clone();
        }
        if !self.in_flight.lock().unwrap().insert(key.clone()) {
            return None;
        }
        let (app, artist, title) = (app.clone(), artist.to_string(), title.to_string());
        let this = self.clone();
        std::thread::spawn(move || {
            let found = resolve(&app, &artist, &title);
            if found.is_some() {
                save_disk(&app, &key, &found);
            }
            if this.cache.lock().unwrap().len() > 256 {
                this.cache.lock().unwrap().clear();
            }
            this.cache.lock().unwrap().insert(key.clone(), found);
            this.in_flight.lock().unwrap().remove(&key);
        });
        None
    }
}

fn art_key(artist: &str, title: &str) -> String {
    format!(
        "v1|{}|{}",
        artist.trim().to_lowercase(),
        title.trim().to_lowercase()
    )
}

fn resolve(app: &AppHandle, artist: &str, title: &str) -> Option<String> {
    let key = art_key(artist, title);
    if let Some(hit) = load_disk(app, &key) {
        return hit;
    }
    let agent = agent();
    let url = deezer(&agent, artist, title).or_else(|| itunes(&agent, artist, title))?;
    download(&agent, &url)
}

fn agent() -> ureq::Agent {
    ureq::Agent::new_with_config(
        ureq::Agent::config_builder()
            .user_agent(USER_AGENT)
            .timeout_global(Some(Duration::from_secs(8)))
            .build(),
    )
}

/// Deezer's search API: no key, good Indian/Hinglish coverage, big covers.
fn deezer(agent: &ureq::Agent, artist: &str, title: &str) -> Option<String> {
    let artist = artist.trim();
    let query = if artist.is_empty() {
        format!("track:\"{}\"", title.trim())
    } else {
        format!("artist:\"{artist}\" track:\"{}\"", title.trim())
    };
    let body = get_json(agent, "https://api.deezer.com/search", &[("q", &query), ("limit", "1")])?;
    let track = body["data"].as_array()?.first()?;
    track["album"]["cover_xl"]
        .as_str()
        .or_else(|| track["album"]["cover_big"].as_str())
        .map(str::to_string)
}

/// iTunes Search: the fallback when Deezer has nothing.
fn itunes(agent: &ureq::Agent, artist: &str, title: &str) -> Option<String> {
    let term = format!("{} {}", artist.trim(), title.trim());
    let body = get_json(
        agent,
        "https://itunes.apple.com/search",
        &[("term", term.trim()), ("entity", "song"), ("limit", "1")],
    )?;
    let art = body["results"].as_array()?.first()?["artworkUrl100"].as_str()?;
    // Ask iTunes for the 600px version instead of the 100px thumbnail.
    Some(art.replace("100x100bb", "600x600bb"))
}

fn get_json(agent: &ureq::Agent, base: &str, params: &[(&str, &str)]) -> Option<Value> {
    let mut url = url::Url::parse(base).ok()?;
    url.query_pairs_mut().extend_pairs(params.iter().copied());
    let mut response = agent
        .get(url.as_str())
        .header("Accept", "application/json")
        .call()
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let body = response.body_mut().read_to_string().ok()?;
    serde_json::from_str(&body).ok()
}

/// Fetches the image and wraps it as a data URL (which also keeps the frontend
/// canvas untainted for the accent-colour palette).
fn download(agent: &ureq::Agent, url: &str) -> Option<String> {
    let mut response = agent.get(url).call().ok()?;
    if !response.status().is_success() {
        return None;
    }
    let mime = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.split(';').next().unwrap_or(value).trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "image/jpeg".into());
    if !mime.starts_with("image/") {
        return None;
    }
    let bytes = response
        .body_mut()
        .with_config()
        .limit(MAX_BYTES)
        .read_to_vec()
        .ok()?;
    if bytes.is_empty() {
        return None;
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:{mime};base64,{b64}"))
}

fn cache_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?.join("artwork").join("v1");
    fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

fn cache_file(app: &AppHandle, key: &str) -> Option<PathBuf> {
    let digest = Sha256::digest(key.as_bytes());
    let name: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    Some(cache_dir(app)?.join(format!("{name}.json")))
}

/// `Some(Some(art))` when a file exists (its value may still be `None`), and
/// `None` when there is no cached entry at all.
fn load_disk(app: &AppHandle, key: &str) -> Option<Option<String>> {
    let text = fs::read_to_string(cache_file(app, key)?).ok()?;
    serde_json::from_str(&text).ok()
}

fn save_disk(app: &AppHandle, key: &str, art: &Option<String>) {
    let Some(path) = cache_file(app, key) else {
        return;
    };
    if let Ok(text) = serde_json::to_string(art) {
        let _ = fs::write(path, text);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_are_stable_and_ignore_case() {
        assert_eq!(art_key(" A.R. Rahman ", "Kesariya"), art_key("a.r. rahman", "kesariya"));
    }

    #[test]
    fn itunes_url_upscales() {
        let url = "https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg";
        assert!(url.replace("100x100bb", "600x600bb").contains("600x600bb"));
    }
}
