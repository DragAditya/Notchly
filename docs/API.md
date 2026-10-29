# Notchly Local API

Notchly exposes a small HTTP API on localhost so scripts, build tools and desktop apps can push alerts and live activities into the island.

- Base URL: `http://127.0.0.1:5199`
- Bind address: loopback only (`127.0.0.1`)
- Content type: `application/json; charset=utf-8`
- Override port: set `NOTCHLY_PORT` before launching Notchly. The legacy `DYNAMIC_ISLAND_PORT` and `WINDOWS_ISLAND_PORT` names are still read as fallbacks.
- CORS: `OPTIONS` is answered with `204` for local web tools.

## Endpoints

### `POST /notify`

Shows a transient alert. The island expands and closes automatically after `duration` (default 5 seconds).

```json
{
  "title": "Deploy complete",
  "subtitle": "api v2.3 is live",
  "icon": "check",
  "color": "#30D158",
  "duration": 5,
  "action": "https://example.com/deploy/123"
}
```

Response:

```json
{ "id": "..." }
```

### `POST /activity`

Creates or updates a live activity. Send the same `id` again to update it in place.

```json
{
  "id": "build-42",
  "title": "Building Notchly",
  "subtitle": "release / windows-x64",
  "icon": "code",
  "progress": 0.64,
  "priority": 70,
  "duration": 600,
  "expand": true
}
```

Set `duration` to `0` or omit it for an activity that stays until it is removed. The maximum accepted duration is 86400 seconds (24 hours).

Response:

```json
{ "id": "build-42" }
```

### `DELETE /activity/{id}`

Removes an activity. The ID is URL-decoded.

```json
{ "removed": "build-42" }
```

Returns `404` if the activity does not exist.

### `GET /status`

Returns the current non-private activities and the current media session.

```json
{
  "name": "Notchly",
  "version": "1.0.0",
  "activities": [
    {
      "id": "build-42",
      "title": "Building Notchly",
      "subtitle": "release / windows-x64",
      "icon": "code",
      "progress": 0.64,
      "priority": 70,
      "source": "api"
    }
  ],
  "media": {
    "title": "Midnight City",
    "artist": "M83",
    "isPlaying": true,
    "youtube": false,
    "source": "Spotify"
  }
}
```

`media` is `null` when no Windows media session is active. Mirrored notification text is deliberately excluded from `/status`; local apps cannot read private messages through the API.

### `POST /claude/hook`

Accepts Claude Code hook payloads and answers `204`. This route is used by the optional Claude Code integration and is intentionally silent so hook output is never added to an agent's context.

## Request fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable activity ID. Reuse it to update. |
| `title` | string | Required unless `progress` is present. |
| `subtitle` | string | Secondary line. |
| `icon` | string | Named icon or one character. See below. |
| `color` | string | `#RRGGBB`. Invalid colors are rejected. |
| `progress` | number | `0.0`–`1.0`. Renders a progress bar. |
| `duration` | number | Seconds. `5` default for `/notify`; no expiry for `/activity`. |
| `priority` | integer | `0`–`99`, default `50`. Higher priority wins when activities compete. |
| `action` | string | `https://` link opened when the activity is clicked. Other schemes are rejected. |
| `style` | string | Use `"level"` for a level bar. |
| `expand` | boolean | Whether the island opens when the activity arrives. Defaults to `true` for `/notify`. |
| `source` | string | Short source label, default `api`. |

At least one of `title` or `progress` is required. Requests larger than 8 MiB are rejected.

## Icons

Use one of these names, or a single character/emoji:

`bell`, `chat`, `mail`, `call`, `download`, `upload`, `timer`, `clock`, `calendar`, `check`, `error`, `warning`, `info`, `code`, `sync`, `heart`, `star`, `mic`, `camera`, `location`, `wifi`, `bluetooth`, `music`, `volume`, `battery`, `charging`, `headphones`, `folder`.

## Examples

### curl (Windows)

```bat
curl -X POST http://127.0.0.1:5199/notify ^
  -H "Content-Type: application/json" ^
  -d "{\"title\":\"Build finished\",\"subtitle\":\"notchly.exe is ready\",\"icon\":\"check\",\"color\":\"#30D158\"}"
```

### PowerShell

```powershell
$body = @{
  title    = 'Build finished'
  subtitle = 'notchly.exe is ready'
  icon     = 'check'
  color    = '#30D158'
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:5199/notify' `
  -ContentType 'application/json' -Body $body
```

### JavaScript (Node 18+)

```js
await fetch("http://127.0.0.1:5199/notify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: "Build finished",
    subtitle: "notchly.exe is ready",
    icon: "check",
    color: "#30D158",
  }),
});
```

Client helpers are available in [`examples/`](../examples/).

## Error responses

| Status | Meaning |
|---|---|
| `200` | Request accepted |
| `204` | No content (`OPTIONS`, Claude hooks) |
| `400` | Invalid JSON, invalid color/link, or missing title/progress |
| `404` | Activity not found or unknown route |

Errors use `{ "error": "..." }`.

## Security

The API is local-only by design. It never accepts file paths or protocol links, and only `https` actions are opened. Do not expose port 5199 to a network or the internet.
