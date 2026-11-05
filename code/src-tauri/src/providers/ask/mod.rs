//! "Ask Gemini" from the island: sends the conversation to Google's Gemini
//! API (generateContent) with the user's own API key and shows a short answer.
//!
//! Questions can carry attachments: a screenshot of the window you were using
//! (`capture.rs`) or files dropped on the island. Images and PDFs are sent
//! inline; small text files are included as text.

mod capture;

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Manager};

use super::Provider;
use super::activities::{self, Activity};
use crate::hub::Hub;
use crate::i18n;
use crate::settings::Settings;

pub const ID: &str = "ask";
const DEFAULT_MODEL: &str = "gemini-2.5-flash";
const API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta/models";
/// Gemini accepts inline data up to roughly 20 MB; keep our own part smaller.
const MAX_INLINE_BYTES: u64 = 12_000_000;
/// Text files are pasted into the prompt, so keep only a useful excerpt.
const MAX_TEXT_BYTES: usize = 60_000;
/// Larger images go by path instead (the API takes up to 5 MB per image).
const MAX_IMAGE_BYTES: u64 = 3_500_000;
/// Thumbnails for the attachment chips.
const MAX_THUMB_BYTES: u64 = 6_000_000;
const GEMINI_BLUE: &str = "#4285F4";
const KEY_SETTING: &str = "ask.gemini.apiKey";
const MODEL_SETTING: &str = "ask.gemini.model";

const SYSTEM_PROMPT: &str = "You answer inside Notchly, a small pill at the top of the user's Windows \
screen. Answer in {language}, short and direct: one to three short sentences, or at most three bullets. Avoid \
headings, tables, and long code blocks unless the user explicitly asks. Use only **bold** and `code` as formatting. \
You can see the conversation text and any attached images or text files, but you cannot browse the web, run \
commands, or open files on the computer. If a task needs one of those, say so in one short sentence.";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub path: String,
    pub name: String,
    pub is_image: bool,
    /// "Screen: Chrome"… (the file name when `None`).
    pub label: Option<String>,
    #[serde(default)]
    pub thumb: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Message {
    from_user: bool,
    text: String,
    error: bool,
    attachments: Vec<Attachment>,
}

/// What Gemini is doing right now (worded by the frontend).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    kind: &'static str,
    arg: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct State {
    messages: Vec<Message>,
    running: bool,
    status: Option<Status>,
    /// A finished answer the user hasn't looked at yet.
    unread: bool,
    /// Global shortcut that opens the ask page ("Ctrl+Alt+Space").
    hotkey: Option<String>,
}

struct Ctx {
    hub: Arc<Hub>,
    state: Mutex<State>,
    /// Set when the user stops an answer; the HTTP request's result is ignored.
    cancel: Mutex<Option<Arc<AtomicBool>>>,
    /// The ask page is on screen: no "Gemini answered" alert needed.
    viewing: Mutex<bool>,
}

impl Ctx {
    fn publish(&self) {
        let state = self.state.lock().unwrap().clone();
        self.hub.publish(ID, &state);
    }

    fn update(&self, f: impl FnOnce(&mut State)) {
        f(&mut self.state.lock().unwrap());
        self.publish();
    }
}

#[derive(Default)]
pub struct AskProvider {
    ctx: Mutex<Option<Arc<Ctx>>>,
}

static HOTKEY: Mutex<Option<String>> = Mutex::new(None);

/// Called once the global shortcut is registered.
pub fn set_hotkey(label: Option<String>) {
    *HOTKEY.lock().unwrap() = label;
}

#[derive(Deserialize)]
struct SendRequest {
    text: String,
    #[serde(default)]
    attachments: Vec<Attachment>,
    /// The frontend shows the reply on the island's answer surface; skip the
    /// "Gemini answered" alert (and the activities peek it would trigger).
    #[serde(default)]
    compact: bool,
}

impl Provider for AskProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        let ctx = Arc::new(Ctx {
            hub,
            state: Mutex::new(State::default()),
            cancel: Mutex::default(),
            viewing: Mutex::default(),
        });
        *self.ctx.lock().unwrap() = Some(ctx.clone());
        ctx.publish();
        // The hotkey is registered during setup; pick its label up afterwards.
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(2));
            let hotkey = HOTKEY.lock().unwrap().clone();
            ctx.update(|s| s.hotkey = hotkey);
        });
    }

    fn action(&self, action: &str, payload: Value) -> Result<Value, String> {
        let ctx = self.ctx.lock().unwrap().clone().ok_or("ask not started")?;
        match action {
            "send" => {
                let request: SendRequest =
                    serde_json::from_value(payload).map_err(|e| e.to_string())?;
                send(&ctx, request.text, request.attachments, request.compact);
            }
            "cancel" => cancel(&ctx),
            "new" => {
                cancel(&ctx);
                ctx.update(|s| {
                    s.messages.clear();
                    s.unread = false;
                    s.status = None;
                });
            }
            "viewing" => {
                let viewing = payload.as_bool().unwrap_or(false);
                *ctx.viewing.lock().unwrap() = viewing;
                if viewing {
                    ctx.update(|s| s.unread = false);
                    if let Some(a) = activities::handle() {
                        a.remove("ask.answer");
                    }
                }
            }
            // Screenshot of the window used before coming to the island.
            "screenshot" => {
                let folder = ctx
                    .hub
                    .app()
                    .path()
                    .app_data_dir()
                    .map_err(|e| e.to_string())?
                    .join("attachments");
                let shot = capture::capture(crate::window::last_foreground(), &folder)
                    .ok_or("capture failed")?;
                let app = ctx.hub.app();
                let label = match shot.title {
                    Some(title) => i18n::t(app, "ask.screenOf").replace("{title}", &title),
                    None => i18n::t(app, "ask.wholeScreen"),
                };
                let mut attachment = attachment_for(&shot.path);
                attachment.label = Some(label);
                return serde_json::to_value(attachment).map_err(|e| e.to_string());
            }
            // Files dropped on the island → attachments (with thumbnails).
            "attachments" => {
                let paths: Vec<String> =
                    serde_json::from_value(payload).map_err(|e| e.to_string())?;
                let list: Vec<Attachment> =
                    paths.iter().map(|p| attachment_for(Path::new(p))).collect();
                return serde_json::to_value(list).map_err(|e| e.to_string());
            }
            _ => return Err(format!("{ID}: unknown action '{action}'")),
        }
        Ok(Value::Null)
    }
}

pub fn attachment_for(path: &Path) -> Attachment {
    let media = image_media_type(path);
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(u64::MAX);
    Attachment {
        path: path.to_string_lossy().to_string(),
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        is_image: media.is_some() && size <= MAX_IMAGE_BYTES,
        label: None,
        thumb: media
            .filter(|_| size <= MAX_THUMB_BYTES)
            .and_then(|m| data_url(path, m)),
    }
}

pub fn image_media_type(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => return None,
    })
}

pub fn data_url(path: &Path, media: &str) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    Some(format!(
        "data:{media};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

fn send(ctx: &Arc<Ctx>, text: String, attachments: Vec<Attachment>, compact: bool) {
    let app = ctx.hub.app().clone();
    let mut prompt = text.trim().to_string();
    if prompt.is_empty() && attachments.is_empty() {
        return;
    }
    if ctx.state.lock().unwrap().running {
        return;
    }
    if prompt.is_empty() {
        let key = if attachments.iter().any(|a| a.is_image) {
            "ask.defaultImage"
        } else {
            "ask.defaultFile"
        };
        prompt = i18n::t(&app, key);
    }

    // Keep the old turns for context before adding this question.
    let history = ctx.state.lock().unwrap().messages.clone();
    let api_key = gemini_key(&app);
    let model = gemini_model(&app);
    let language = i18n::t(&app, "language.name");

    ctx.update(|s| {
        s.messages.push(Message {
            from_user: true,
            text: prompt.clone(),
            error: false,
            attachments: attachments.clone(),
        });
        s.messages.push(Message {
            from_user: false,
            text: String::new(),
            error: false,
            attachments: vec![],
        });
        s.unread = false;
    });

    let Some(api_key) = api_key else {
        fail(ctx, i18n::t(&app, "ask.gemini.missing"));
        return;
    };

    let token = Arc::new(AtomicBool::new(false));
    *ctx.cancel.lock().unwrap() = Some(token.clone());
    ctx.update(|s| {
        s.running = true;
        s.status = Some(Status {
            kind: "thinking",
            arg: None,
        });
    });

    let ctx = ctx.clone();
    std::thread::spawn(move || {
        let result = generate(&api_key, &model, &language, &history, &prompt, &attachments);
        if token.load(Ordering::Relaxed) {
            return;
        }
        finish(&ctx, result, compact);
    });
}

fn finish(ctx: &Ctx, result: Result<String, String>, compact: bool) {
    let app = ctx.hub.app().clone();
    let mut answer: Option<String> = None;
    ctx.update(|s| {
        s.running = false;
        s.status = None;
        let Some(reply) = s.messages.last_mut() else {
            return;
        };
        match result {
            Ok(text) => {
                let text = text.trim();
                if text.is_empty() {
                    reply.error = true;
                    reply.text = i18n::t(&app, "ask.gemini.empty");
                } else {
                    reply.text = text.to_string();
                }
            }
            Err(error) => {
                let detail = short(&error, 300);
                reply.error = true;
                reply.text = i18n::t(&app, "ask.gemini.failed").replace("{error}", &detail);
            }
        }
        s.unread = true;
        if !reply.error {
            answer = Some(reply.text.clone());
        }
    });

    // Answered while you were elsewhere: say so (click to read). A compact
    // question unfolds its answer on the island instead.
    if !compact
        && let Some(text) = answer
        && !*ctx.viewing.lock().unwrap()
        && let Some(activities) = activities::handle()
    {
        let flat = text
            .replace("**", "")
            .replace('`', "")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        let mut preview: String = flat.chars().take(140).collect();
        if flat.chars().count() > 140 {
            preview.push('…');
        }
        let mut alert = Activity::alert("ask.answer", "ask", Duration::from_secs(8));
        alert.caption = Some("Gemini".into());
        alert.title = i18n::t(&app, "ask.answered");
        alert.subtitle = Some(preview);
        alert.icon = Some("star".into());
        alert.color = Some(GEMINI_BLUE.into());
        alert.priority = 70;
        alert.expand = true;
        activities.upsert(alert);
    }
}

fn fail(ctx: &Ctx, message: String) {
    ctx.update(|s| {
        if let Some(reply) = s.messages.last_mut() {
            reply.text = message;
            reply.error = true;
        }
    });
}

fn cancel(ctx: &Ctx) {
    if let Some(token) = ctx.cancel.lock().unwrap().take() {
        token.store(true, Ordering::Relaxed);
    }
    let app = ctx.hub.app().clone();
    ctx.update(|s| {
        if !s.running {
            return;
        }
        s.running = false;
        s.status = None;
        if let Some(reply) = s.messages.last_mut()
            && reply.text.is_empty()
        {
            reply.text = i18n::t(&app, "ask.interrupted");
            reply.error = true;
        }
        s.unread = false;
    });
}

fn gemini_key(app: &AppHandle) -> Option<String> {
    app.state::<Settings>()
        .get(KEY_SETTING)
        .and_then(|v| {
            v.as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            std::env::var("GEMINI_API_KEY")
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        })
}

fn gemini_model(app: &AppHandle) -> String {
    app.state::<Settings>()
        .get(MODEL_SETTING)
        .and_then(|v| {
            v.as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
        })
        .unwrap_or_else(|| DEFAULT_MODEL.to_string())
}

fn generate(
    api_key: &str,
    model: &str,
    language: &str,
    history: &[Message],
    prompt: &str,
    attachments: &[Attachment],
) -> Result<String, String> {
    let model: String = model
        .trim()
        .trim_start_matches("models/")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        .collect();
    let model = if model.is_empty() {
        DEFAULT_MODEL
    } else {
        model.as_str()
    };

    let body = build_request(language, history, prompt, attachments)?;
    let url = format!("{API_BASE}/{model}:generateContent");
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(45)))
        .build()
        .into();
    let mut res = agent
        .post(&url)
        .header("Content-Type", "application/json")
        .header("x-goog-api-key", api_key)
        .send(body.to_string())
        .map_err(|e| format!("network: {e}"))?;

    let status = res.status().as_u16();
    let text = res.body_mut().read_to_string().unwrap_or_default();
    let value: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    if !(200..=299).contains(&status) {
        let detail = value["error"]["message"]
            .as_str()
            .unwrap_or("request failed");
        return Err(format!("HTTP {status}: {detail}"));
    }

    let answer = value["candidates"][0]["content"]["parts"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|part| part["text"].as_str())
        .collect::<String>();
    if answer.trim().is_empty() {
        let reason = value["promptFeedback"]["blockReason"]
            .as_str()
            .or_else(|| value["candidates"][0]["finishReason"].as_str());
        return Err(match reason {
            Some(reason) => format!("no answer ({reason})"),
            None => "empty answer".into(),
        });
    }
    Ok(answer)
}

fn build_request(
    language: &str,
    history: &[Message],
    prompt: &str,
    attachments: &[Attachment],
) -> Result<Value, String> {
    let mut contents = Vec::new();
    // A short conversation is enough for a small ask box; this also keeps the
    // request well below Gemini's context limits.
    let start = history.len().saturating_sub(16);
    for message in &history[start..] {
        let text = message.text.trim();
        if message.error || text.is_empty() {
            continue;
        }
        let role = if message.from_user { "user" } else { "model" };
        contents.push(json!({ "role": role, "parts": [{ "text": text }] }));
    }

    let mut parts = Vec::new();
    let mut unavailable = Vec::new();
    for attachment in attachments {
        let path = Path::new(&attachment.path);
        if attachment.is_image {
            let media = image_media_type(path)
                .ok_or_else(|| format!("{}: not an image", attachment.name))?;
            let bytes =
                std::fs::read(path).map_err(|e| format!("attachment {}: {e}", attachment.name))?;
            parts.push(json!({
                "inline_data": {
                    "mime_type": media,
                    "data": base64::engine::general_purpose::STANDARD.encode(bytes)
                }
            }));
        } else if path
            .extension()
            .is_some_and(|ext| ext.to_string_lossy().eq_ignore_ascii_case("pdf"))
        {
            let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(u64::MAX);
            if size > MAX_INLINE_BYTES {
                unavailable.push(format!("{} (too large)", attachment.name));
                continue;
            }
            let bytes =
                std::fs::read(path).map_err(|e| format!("attachment {}: {e}", attachment.name))?;
            parts.push(json!({
                "inline_data": {
                    "mime_type": "application/pdf",
                    "data": base64::engine::general_purpose::STANDARD.encode(bytes)
                }
            }));
        } else if let Some(text) = read_text_attachment(path) {
            parts.push(json!({
                "text": format!("Attached file `{}`:\n\n{}", attachment.name, text)
            }));
        } else {
            unavailable.push(attachment.name.clone());
        }
    }

    let mut text = prompt.to_string();
    if !unavailable.is_empty() {
        text.push_str("\n\nThese attached files could not be read by the API: ");
        text.push_str(&unavailable.join(", "));
    }
    parts.push(json!({ "text": text }));
    contents.push(json!({ "role": "user", "parts": parts }));

    Ok(json!({
        "system_instruction": {
            "parts": [{ "text": SYSTEM_PROMPT.replace("{language}", language) }]
        },
        "contents": contents,
        "generationConfig": {
            "temperature": 0.35,
            "maxOutputTokens": 768
        }
    }))
}

fn read_text_attachment(path: &Path) -> Option<String> {
    const TEXT_EXTENSIONS: &[&str] = &[
        "txt", "md", "markdown", "json", "json5", "csv", "tsv", "log", "rs", "ts", "tsx", "js",
        "jsx", "py", "html", "css", "scss", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf",
        "sh", "ps1", "bat", "cmd", "c", "h", "cpp", "hpp", "java", "kt", "go", "rb", "php", "sql",
        "env",
    ];
    let ext = path.extension()?.to_string_lossy().to_ascii_lowercase();
    if !TEXT_EXTENSIONS.contains(&ext.as_str()) {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    let cut = bytes.len().min(MAX_TEXT_BYTES);
    let mut text = String::from_utf8_lossy(&bytes[..cut]).to_string();
    if bytes.len() > cut {
        text.push_str("\n… (truncated)");
    }
    Some(text)
}

fn short(text: &str, max: usize) -> String {
    let text = text.trim();
    if text.chars().count() <= max {
        return text.to_string();
    }
    let mut result: String = text.chars().take(max.saturating_sub(1)).collect();
    result.push('…');
    result
}
