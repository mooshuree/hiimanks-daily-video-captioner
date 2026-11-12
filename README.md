# FFmpeg text overlay

Step 1 generates PNG labels with `@napi-rs/canvas` from `config.json`. Step 2 runs an **Express** API in the same Docker image as **FFmpeg**: download a video, render a label, burn the PNG on top, save to `./videos`, and return a public URL.

## Requirements

- Node.js 20+
- Docker (optional, recommended for the same environment as production)

## Deploy on Dokploy

1. Push this repo to GitHub/GitLab and install [Dokploy](https://dokploy.com) on your VPS.
2. **Project → Create Service → Compose** → connect the repo, branch `main`, compose file: **`docker-compose.dokploy.yml`**.
3. Commit `config.json` and `.ttf` / `.otf` under `./fonts` — both are **`COPY`’d into the image** at build. Change defaults in Git, then **Deploy** again (no `config.json` bind mount on Dokploy).
4. **Environment** in Dokploy: set `PUBLIC_BASE_URL` to your public URL, e.g. `https://overlay.example.com` (no trailing slash).
5. **Domains** tab: service **`app`**, internal port **`3647`**, enable HTTPS (Let’s Encrypt).
6. **Deploy** — use **Preview Compose** to confirm Traefik labels, then watch deployment logs.

API: `https://overlay.example.com/api/overlay` · videos: `https://overlay.example.com/videos/<file>.mp4`

**Dokploy mount error** (`not a directory` on `config.json`): Docker created a **folder** named `config.json` on the host because the file was missing. This compose file no longer mounts `config.json`. On the VPS you can remove that stray path if it exists:  
`/etc/dokploy/compose/<your-service>/files/config.json` (delete only if it is an empty directory, not a real file).

## Quick start (Docker API)

```bash
docker compose build
docker compose up -d
curl -s http://localhost:3647/health
```

Create an overlay:

```bash
curl -s -X POST http://localhost:3647/api/overlay \
  -H "Content-Type: application/json" \
  -d "{\"videoUrl\":\"https://www.w3schools.com/html/mov_bbb.mp4\",\"text\":\"Hello\",\"style\":{\"fontSizePercent\":4.5,\"marginX\":8,\"marginY\":8,\"paddingX\":10,\"paddingY\":8}}"
```

Response includes `url` (e.g. `http://localhost:3647/videos/<uuid>.mp4`). Output files land in `./videos/` on the host.

Optional style overrides (same fields as `config.defaults`):

```bash
curl -s -X POST http://localhost:3647/api/overlay \
  -H "Content-Type: application/json" \
  -d "{\"videoUrl\":\"https://example.com/clip.mp4\",\"text\":\"Warning\",\"style\":{\"textColor\":\"#FF4444\",\"marginY\":120}}"
```

Batch PNG generation (step 1 only):

```bash
docker compose run --rm app npm run generate
```

Extra test config (long word, multiline, emoji):

```bash
docker compose run --rm -v ./config.extra.json:/app/config.extra.json:ro app npm run generate -- config.extra.json
```

## Environment (API)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3647` | HTTP listen port |
| `PUBLIC_BASE_URL` | `http://localhost:3647` | Base URL used in JSON responses |
| `CONFIG_PATH` | `config.json` | Label defaults and font paths |
| `VIDEOS_DIR` | `./videos` | Rendered MP4 output |
| `TMP_DIR` | `./tmp` | Download / intermediate files |

## Quick start (local)

```bash
npm ci
# Place .ttf/.otf files in ./fonts (e.g. Poppins-Regular.ttf)
npm run generate
```

Optional config path:

```bash
node src/index.js path/to/other-config.json
```

No other CLI flags are supported.

## Config reference

| Field | Description |
| --- | --- |
| `fontsDir` | Directory of `.ttf` / `.otf` files (registered at startup). |
| `outputDir` | Where `<name>.png` files are written. |
| `video.width` / `video.height` | Target video dimensions; width drives wrapping and `fontSizePercent`. |
| `defaults.*` | Default style for every label. |
| `labels[].name` | Output filename (letters, digits, `_`, `-` only); must be unique. |
| `labels[].text` | Label text (1–500 chars); `\n` forces line breaks. |
| `fontFamily` | Must match a family registered from `fontsDir`. |
| `fontSize` | Pixel size when `fontSizePercent` is null (8–500). |
| `fontSizePercent` | If set, `fontSize = round(video.width × percent / 100)` (0.5–20). |
| `textColor` / `backgroundColor` | CSS colors (hex, `rgb`/`rgba`, named). |
| `borderRadius` | Corner radius (clamped to half the label height). |
| `paddingX` / `paddingY` | Inner padding around text. |
| `marginX` / `marginY` | `marginX` caps label width; `marginY` is the overlay distance from the **top** of the video (API). |
| `textAlign` | `left`, `center`, or `right` within the padded area. |
| `lineHeight` | Multiplier on `fontSize` between lines (0.8–3). |

## Glyph and emoji fallback

Fonts are registered with `GlobalFonts.registerFromPath` (see [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas)). Characters missing from the registered family are taken from **installed system fonts** when available; otherwise the canvas may draw **tofu boxes** (missing-glyph placeholders). For predictable output in Docker, ship fonts in `./fonts` and optionally install `fonts-noto-color-emoji` in the image (commented hint in the `Dockerfile`).

Set `ctx.lang = 'en'` during measure and draw so text metrics stay consistent across hosts.

## File ownership (Docker)

The container runs as the `node` user. Files in `./output` may be owned by UID 1000 (`node` on the official image). On Linux, fix with `chown` on the host if needed; on Windows bind mounts this is usually transparent.

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness check |
| `GET` | `/videos/:file` | Static download of rendered videos |
| `POST` | `/api/overlay` | Body: `{ videoUrl, text, style? }` → `{ url, fileName, video, label }` |
| `DELETE` | `/api/video` | Body: `{ name }` or `{ fileName }` — deletes file from `videos/` |

Label width comes from the **probed** source video width; wrapping uses `marginX` / `paddingX` from config (or `style` overrides).

## Project layout

```
config.json
src/
  config.js
  fonts.js
  wrap.js
  label.js
  index.js           # batch PNG generate
  server.js          # Express API
  overlay.js         # download + render + ffmpeg pipeline
  ffmpeg.js
  download.js
fonts/
output/              # batch PNGs
videos/              # API output MP4s
tmp/                 # transient downloads
```
