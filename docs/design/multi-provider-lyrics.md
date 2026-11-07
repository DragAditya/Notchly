# Multi-provider lyrics with English preference

Status: proposed  
Date: 2026-11-05

## Goal

Replace the single LRCLIB lookup with a small provider registry, so a track can
come from more than one lyrics source. When more than one version exists, prefer
the English original; if no English version is available, use the original
language.

The visible behaviour stays the same for synced lyrics. Plain lyrics become
visible in the expanded music panel instead of being discarded.

## Non-goals

- Automatic translation of non-English lyrics.
- Word-level timing beyond what a provider supplies.
- Local `.lrc` sidecar files.
- User-editable provider order.
- Chinese lyrics providers.
- A version bump. Notchly stays at `1.1.0`.

## Provider set

| Provider | Sync | Auth | Status |
| --- | --- | --- | --- |
| LRCLIB | synced + plain | none | primary |
| lyrics.ovh | plain | none | fallback |

Both are free and need no API key.

These were tested from this machine and both work:

- `lrclib.net`
- `api.lyrics.ovh`

NetEase and QQ Music were tested and are unreachable on this network, so they
are not part of this change. The provider boundary stays small so another source
can be added later without touching the cache, ranking or UI code.

## Backend structure

Keep `providers/music/lyrics.rs` as the public module, and add submodules:

```text
providers/music/lyrics.rs          public types, cache, fetch, command
providers/music/lyrics/lrc.rs      LRC parsing
providers/music/lyrics/lang.rs     language detection
providers/music/lyrics/rank.rs     candidate ranking
providers/music/lyrics/providers/
  lrclib.rs
  lyrics_ovh.rs
```

## Types

```rust
pub struct Lyrics {
    pub lines: Vec<Line>,
    pub synced: bool,
    pub provider: Option<String>,
    pub language: Option<String>,
}

struct TrackQuery {
    artist: String,
    title: String,
    album: String,
    duration_ms: u64,
}

struct Candidate {
    lyrics: Lyrics,
    provider: Provider,
    language: Language,
    synced: bool,
    duration_delta_ms: u64,
    provider_rank: u8,
}

enum Language {
    English,
    Unknown,
    Other,
}
```

`Lyrics.provider` and `Lyrics.language` are optional and default to `None` when
reading older cache files. The frontend can ignore them.

## Fetch flow

```text
get_lyrics(artist, title, album, duration_ms)
  -> track key
  -> memory cache
  -> disk cache
  -> query both providers concurrently
  -> filter + rank candidates
  -> persist selected lyrics
  -> return
```

### Providers

Each provider is a plain function:

```rust
fn fetch(agent: &ureq::Agent, query: &TrackQuery) -> Vec<Candidate>
```

A provider may make more than one request. Errors, 404s, timeouts and malformed
responses return an empty list.

- **LRCLIB** keeps the current exact `/api/get` then `/api/search` strategy.
  Ignore `instrumental: true`. Parse `syncedLyrics` first, then `plainLyrics`.
- **lyrics.ovh** calls `/v1/{artist}/{title}` and turns the plain text into
  lines.

### Concurrency and timeouts

Providers run concurrently with `std::thread::scope`.

- One `ureq` agent per provider.
- 5 second timeout per request.
- No retries.
- A failed search stops that provider before it makes a follow-up request.
- Expected worst case: about 5–6 seconds. Cached tracks return immediately.

## Matching and ranking

Provider search results are noisy, so obvious mismatches are rejected before
ranking.

Normalize title/artist by lowercasing, removing punctuation, collapsing spaces,
and stripping common suffixes such as `(feat. ...)`, `[remastered]`, `- live`.

Reject a candidate when:

- normalized title neither equals nor contains the requested title, or
- normalized artist neither equals nor contains the requested artist, or
- a provider reports a duration more than 10 seconds away.

If no candidate survives the strict filter, retry with a 20 second tolerance
and title-only matching. If that also fails, return no lyrics.

Sort surviving candidates by:

1. English language first
2. synced before plain
3. provider priority: LRCLIB, then lyrics.ovh
4. closest duration
5. most lines

This means an English plain result wins over a non-English synced result, as
requested. Synced wins only within the same language class.

## English preference

Language detection runs on the full lyric text, not individual lines.

- Use `whatlang` with a confidence threshold.
- Treat `Lang::Eng` with confidence `>= 0.5` as `English`.
- Treat a confident non-English result as `Other`.
- Short or low-confidence text becomes `Unknown`.

Ranking order is `English` → `Unknown` → `Other`. This avoids punishing a very
short English lyric that the detector cannot identify confidently, while still
putting confidently non-English results last.

Provider language metadata is used when available; otherwise detection is used.

## Plain lyrics in the UI

The backend already returns plain lyrics with `synced: false`; today the UI
throws them away.

Changes:

- `MusicPanel` shows the lyrics column when `lyrics.lines.length > 0`, not only
  when `lyrics.synced`.
- `MusicLyricsColumn` renders a static scrollable column when `synced` is false.
  No active line, no word highlighting, no click-to-seek.
- Compact lyrics remain synced-only. A plain result never replaces the compact
  pill.
- `useLyricLine` returns `-1` for unsynced lyrics.
- `useLyrics` fetches when lyrics are enabled, title is present and duration is
  greater than zero, as before.

## Settings

No new toggle is needed. Update the lyrics description to mention both sources:

- English: “Shows the current line in the island, in time with the music. Lyrics
  come from LRCLIB and lyrics.ovh.”
- Portuguese: the equivalent translation.

## Cache

Use a new namespace so old LRCLIB-only cache files are not treated as ranked
results:

```text
%APPDATA%\com.notchly.desktop\lyrics\v2\<sha256>.json
```

Key:

```text
v2|artist|title|album|duration-seconds
```

Behaviour:

- Memory cache keeps hits and misses for the session.
- Disk cache stores only non-empty selected lyrics.
- Cache stores `provider` and `language` for debugging and future ranking.
- Old `lyrics/*.json` files are left untouched and ignored.

## Privacy

The track title, artist, album and duration are sent to LRCLIB and lyrics.ovh.
No API keys or accounts are added. Update the privacy docs to list both
providers.

## Tests

Unit tests, no network:

- Existing LRC parser tests stay.
- Plain-text parser test.
- Language detection: English, Chinese/Japanese, Spanish, short unknown.
- Ranking:
  - English plain beats non-English synced.
  - English synced beats English plain.
  - Provider priority breaks ties.
  - Closer duration breaks ties.
- Cache key is stable for the same track.
- lyrics.ovh response parsing with a fixture.
- LRCLIB `instrumental` handling.

Network tests stay `#[ignore]`.

## Future providers

Possible additions, not part of this change:

- Musixmatch — needs an API key; free tier may only return a preview.
- Genius — needs a token; lyrics pages are Cloudflare-protected.
- Spotify or YouTube Music — unofficial, uses existing account/session data.

## Verification

After implementation:

```text
cargo fmt --check
cargo clippy -- -D warnings
cargo test --lib
bun run build
```

Then build the release artifact, verify checksums, and swap the running
portable build if requested.
