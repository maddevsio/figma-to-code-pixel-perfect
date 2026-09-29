# figma-to-code-pixel-perfect

Check a rendered page against its Figma design, element by element, with numbers instead of eyeballing.

You map Figma node ids to CSS selectors. `pixel-check` opens the page in headless Chrome at the Figma frame width, measures every mapped element and compares position, size, typography and color with the values in a frozen Figma snapshot. Expected values always come from Figma, never from hand-typed numbers.

```
## home-desktop (1440px) — 41 pass, 2 fail, 0 pending, 1 warn, 0 skip
screenshot: tmp/pixel/home-desktop.png
reference:  design/home/frames/home-desktop.png

| status | node | prop | expected | actual | Δ | note |
|---|---|---|---|---|---|---|
| FAIL | 1:11 Subtitle | gapY (from 1:10) | 24 | 32 | 8 |  |
| FAIL | 1:20 Card | w | 328 | 320 | -8 |  |
| WARN | 1:11 Subtitle | fontFile | Brand Text 430 loaded | no file, browser falls back |  |  |
```

Built for coding agents: a snapshot they can read offline, distilled specs they can follow, and a check they cannot argue with. An optional [Claude Code preset](claude/README.md) runs whole pages through plan → build (looping on the check) → review.

## What's inside

| Tool | Does |
|---|---|
| `figma-snapshot` | Freezes Figma frames into your repo: node trees (`nodes.json`) and frame PNGs. Resumable, budget-aware (`--dry-run` shows the API requests first) |
| `figma-distill` | Turns megabytes of `nodes.json` into short per-frame specs: tree, sizes, auto-layout gaps/paddings, text styles, colors as your CSS tokens, `⚠` on off-token and off-grid values |
| `pixel-check` | The check. Also `--tree` to find node ids and `--coverage` to prove every section and text style of a frame is mapped |
| `claude/` | Claude Code workflow + planner/builder/reviewer agents + worktree script |

No npm dependencies: Node ≥ 22 and an installed Chrome/Chromium (DevTools protocol over the built-in WebSocket).

## Step by step

**1. Install** (not on npm yet, so `npx`/`pnpm dlx` without install will not find it):

```bash
npm i -D github:<owner>/figma-to-code-pixel-perfect   # or: pnpm add -D github:<owner>/figma-to-code-pixel-perfect
```

**2. Get a Figma token.** Figma → Settings → Security → Personal access tokens, scopes `file_content:read` and `library_content:read`. Keep it in your shell, never in the repo:

```bash
export FIGMA_TOKEN=<token>
```

**3. Pick frames.** In Figma select a frame (not the page) → right click → Copy link to selection. From `.../design/<fileKey>/...?node-id=1-2` take the file key and the node id `1:2`.

**4. Describe the snapshot** in `design/snapshot.json`:

```json
{
  "fileKey": "<fileKey>",
  "batches": {
    "home": { "home-desktop": "1:2" }
  }
}
```

**5. Fetch it.** Always dry-run first: View/Collab seats get about 20 requests a month.

```bash
npx figma-snapshot --dry-run   # prints the requests
npx figma-snapshot             # design/home/nodes.json + frames/home-desktop.png
npx figma-distill              # design/home/specs/home-desktop.md: readable spec
```

**6. Export vectors** (icons, illustrations, irregular shapes) as SVG: add a batch and run `npx figma-snapshot` again (1 request):

```json
"home-assets": { "fetchData": false, "format": "svg", "nodes": { "logo": "1:3", "hero-art": "1:15" } }
```

**7. Build the page** from the spec and the frame PNG, then run your site (any server):

```bash
npm run dev   # or: python3 -m http.server 3000 -d site
```

**8. Map Figma nodes to DOM** in `pixel-checks/home.json` ([example](examples/pixel-checks/home.json)). Node ids:

```bash
npx pixel-check --tree 1:2 --depth 4
```

```json
{
  "path": "/",
  "screens": [
    {
      "name": "home-desktop", "frame": "1:2", "width": 1440,
      "items": [
        { "node": "1:9", "selector": "h1" },
        { "node": "1:14", "selector": "a.more" }
      ]
    }
  ]
}
```

**9. Check.**

```bash
npx pixel-check pixel-checks/home.json --coverage   # everything mapped? (no browser)
npx pixel-check pixel-checks/home.json              # FAIL rows: expected vs actual; exit 1 on any FAIL
```

Fix, rerun, until `PASSED`.

**10. Look.** Open `tmp/pixel/home-desktop.png` next to `design/home/frames/home-desktop.png`. The check measures boxes, text and colors; image content, SVG shapes and shadows are yours to eyeball.

The full procedure, check-file format, measurement rules and what to map: [docs/workflow.md](docs/workflow.md).

## Config

Optional `pixel.config.json` in the working directory (or `PIXEL_CONFIG=<path>`). Unknown keys are rejected. [Example](examples/pixel.config.json).

| Key | Default | Meaning |
|---|---|---|
| `designDir` | `design` | Snapshot folder (`snapshot.json`, `<batch>/nodes.json`, `frames/`, `specs/`) |
| `baseUrl` | `http://localhost:3000` | Site under test; `--base` and a check file's `base` override it |
| `shotDir` | `tmp/pixel` | Screenshots |
| `siteChrome` | `["Header", "Footer"]` | Instance name prefixes checked on their own screen: excluded from page coverage, collapsed in specs |
| `fontWeights` | `{}` | `{ "<family>": { "<figma weight>": <css weight> } }` when a font file's CSS weight differs from Figma's |
| `tokensCss` | none | CSS file with `--color-<name>: #rrggbb` variables; specs then show token names and flag off-token colors |

Env: `FIGMA_TOKEN` (snapshot only), `CHROME_PATH` (when Chrome is not at a standard path).

## What it is not

Not a pixel diff. It checks mapped elements' geometry, typography, opacity and solid colors within ±1px (text widths ±2). Image content, SVG shapes, borders, shadows and gradients are left to the screenshot review, and the report says so. "0 FAIL" means "mapped Figma checks passed".

## Figma API budget

View and Collab seats get about 20 Tier 1 requests a month; a 429 can lock the token for days. `figma-snapshot` fetches only missing outputs and prints its plan with `--dry-run`. Keep agents off the Figma API and MCP; they read the snapshot.

The snapshot is your design data: commit it to your project, not to public repos.

## Development

```bash
npm test
```

## License

[Apache-2.0](LICENSE). Copyright 2026 Mad Devs.
