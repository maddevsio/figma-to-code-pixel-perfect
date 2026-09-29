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

## Quick start

```bash
npm i -D github:<owner>/figma-to-code-pixel-perfect
```

1. **Snapshot.** Copy [`examples/design/snapshot.json`](examples/design/snapshot.json) to `design/snapshot.json`, set your Figma file key and the frame node ids (from the Figma URL, `node-id=1-2` → `"1:2"`).

   ```bash
   npx figma-snapshot --dry-run                      # shows the requests it would make
   FIGMA_TOKEN=<personal access token> npx figma-snapshot
   npx figma-distill                                 # design/<batch>/specs/*.md
   ```

2. **Map.** List the node ids of a frame and write a check file ([example](examples/pixel-checks/home.json)):

   ```bash
   npx pixel-check --tree 1:2 --depth 4
   ```

3. **Check.** Start your site, then:

   ```bash
   npx pixel-check pixel-checks/home.json              # exit 1 on any FAIL
   npx pixel-check pixel-checks/home.json --coverage   # no browser: what is not mapped yet
   ```

   Look at `tmp/pixel/<screen>.png` next to the Figma PNG for what the map does not cover.

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
