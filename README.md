# figma-to-code-pixel-perfect

Checks a rendered page against Figma, element by element. Map Figma node ids to CSS selectors; `pixel-check` renders the page in headless Chrome and compares position, size, typography and color with a frozen Figma snapshot.

```
## home-desktop (1440px) — 41 pass, 2 fail, 0 pending, 1 warn, 0 skip
| status | node | prop | expected | actual | Δ |
|---|---|---|---|---|---|
| FAIL | 1:11 Subtitle | gapY (from 1:10) | 24 | 32 | 8 |
| FAIL | 1:20 Card | w | 328 | 320 | -8 |
| WARN | 1:11 Subtitle | fontFile | Inter 500 loaded | no file, browser falls back | |
```

| Tool | Does |
|---|---|
| `figma-snapshot` | Figma → `nodes.json` + frame PNG/SVG in your repo. Resumable, `--dry-run` |
| `figma-distill` | `nodes.json` → short readable spec per frame |
| `pixel-check` | The check. `--tree` lists node ids, `--coverage` finds unmapped parts |
| [`pixel-agent/`](pixel-agent/pipeline.md) | Plan → build → review pipeline for any coding agent |

Node ≥ 22 and Chrome. No npm dependencies.

## Step by step

**1. Install.** Not on npm yet, so `npx`/`pnpm dlx` alone won't find it.

```bash
npm i -D github:<owner>/figma-to-code-pixel-perfect
```

**2. Token.** Figma → Settings → Security → Personal access tokens, scopes `file_content:read`, `library_content:read`.

```bash
export FIGMA_TOKEN=<token>
```

**3. Frame id.** Select a frame (not the page) → Copy link to selection. `…/design/<fileKey>/…?node-id=1-2` → file key + node `1:2`.

**4. `design/snapshot.json`**

```json
{ "fileKey": "<fileKey>", "batches": { "home": { "home-desktop": "1:2" } } }
```

**5. Fetch.** View/Collab seats get ~20 requests a month: dry-run first.

```bash
npx figma-snapshot --dry-run
npx figma-snapshot       # design/home/nodes.json, frames/home-desktop.png
npx figma-distill        # design/home/specs/home-desktop.md
```

**6. Vectors** (icons, illustrations, odd shapes) as SVG: add a batch, fetch again.

```json
"home-assets": { "fetchData": false, "format": "svg", "nodes": { "logo": "1:3" } }
```

**7. Build the page** from the spec and PNG. Run it.

```bash
npm run dev    # or: python3 -m http.server 3000 -d site
```

**8. Map** nodes to selectors in `pixel-checks/home.json` ([example](examples/pixel-checks/home.json)).

```bash
npx pixel-check --tree 1:2
```

```json
{ "path": "/", "screens": [{ "name": "home-desktop", "frame": "1:2", "width": 1440,
  "items": [{ "node": "1:9", "selector": "h1" }, { "node": "1:14", "selector": "a.more" }] }] }
```

**9. Check** until `PASSED`.

```bash
npx pixel-check pixel-checks/home.json --coverage
npx pixel-check pixel-checks/home.json
```

**10. Look** at `tmp/pixel/home-desktop.png` next to `design/home/frames/home-desktop.png`: images, SVG shapes and shadows aren't measured.

Check-file format and rules: [docs/workflow.md](docs/workflow.md).

## Config

Optional `pixel.config.json` (or `PIXEL_CONFIG=<path>`). [Example](examples/pixel.config.json).

| Key | Default | |
|---|---|---|
| `designDir` | `design` | snapshot folder |
| `baseUrl` | `http://localhost:3000` | `--base` overrides |
| `shotDir` | `tmp/pixel` | screenshots |
| `siteChrome` | `["Header", "Footer"]` | instances excluded from page coverage |
| `fontWeights` | `{}` | `{ "Family": { "430": 400 } }` when font file weight ≠ Figma |
| `tokensCss` | — | CSS with `--color-*`; specs show token names |

Env: `FIGMA_TOKEN`, `CHROME_PATH`.

## Limits

- Not a pixel diff: measured boxes, text, opacity, solid colors, ±1px. Rest is the screenshot review.
- Keep agents off the Figma API; they read the snapshot.
- The snapshot is your client's design: keep it out of public repos.

## License

[Apache-2.0](LICENSE). Copyright 2026 Mad Devs LLC.
