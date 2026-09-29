# Pixel-perfect workflow

How to build a page or block from a frozen Figma snapshot and prove it matches. Works for any stack that renders HTML in Chrome.

## Design data

The snapshot lives in the project repo (`designDir`, default `design/`) so developers and agents read Figma data offline. Never let agents call the Figma API or a Figma MCP: refresh the snapshot only as described below.

| File | Content |
|---|---|
| `snapshot.json` | Figma file key and the frames/components to fetch, per batch (input of `figma-snapshot`) |
| `<batch>/nodes.json` | Raw Figma node trees (source of every expected value) |
| `<batch>/frames/*.png` | Frame renders (reference images for the screenshot review) |
| `<batch>/specs/*.md` | Distilled frames from `figma-distill`: tree, sizes, gaps, paddings, text styles, colors as tokens; `⚠` marks off-token values, off-grid values and style overrides |
| `styles.json`, `components.json` | Library styles and components |
| `decisions.md` (recommended) | Design questions already answered. Agents follow them without asking and add new choices there |
| `blocks.md` (recommended) | Block/component → spec file, Figma node ids, code component |

### Refreshing the snapshot

Figma's REST API budget is small on View/Collab seats (Tier 1 ≈ 20 requests/month per user; a 429 can block the token for days). The script fetches only outputs that are missing, so a failed run resumes.

```bash
npx figma-snapshot --dry-run                       # prints the requests it would make; always run first
FIGMA_TOKEN=<personal token> npx figma-snapshot    # fetches missing nodes.json and frame renders
npx figma-distill                                  # offline: nodes.json → <batch>/specs/*.md
```

Both take an optional spec path (default `<designDir>/snapshot.json`). Add frames to `snapshot.json` (batch → name → node id, from the node id in the Figma URL, `-` replaced by `:`) before fetching. A batch can be `{ "fetchData": true, "render": false, "nodes": { … } }` to skip renders, or set `"format": "svg"` for icons. Never commit the token.

The snapshot is your client's design: keep it in the project repo, not in public ones.

## Per block

1. Read the desktop and mobile specs for the block's frames, the component specs, and `decisions.md`.
2. Map values: Figma text style → your type style, color → token, size/gap → spacing scale. A value that does not map is a `⚠` in the spec: check `decisions.md`, otherwise pick the nearest token and record the choice there.
3. Build with your existing primitives and tokens.
4. Tests next to the component (behavior, a11y roles).
5. Pixel check (below): write `pixel-checks/<page>.json`, run it, fix until 0 FAIL at every width and state, then review the screenshots against the Figma PNGs.
6. Before commit: new design choices are in `decisions.md`; every PENDING/SKIP/WARN is explained in the PR or trace, worded as "mapped Figma checks passed", not "pixel-perfect".

## Pixel check

`pixel-check` opens the page in headless Chrome (the installed Chrome over the DevTools protocol, no npm dependencies), sets the exact viewport width with scrollbars hidden, waits for fonts, images and DOM quiet, fails on broken images, and compares each mapped DOM element with its Figma node. **Expected values are read from `nodes.json`**, never typed by hand.

Needs the site running (default `baseUrl` `http://localhost:3000`, override with `--base` or `base` in the check file). Chrome is found at the usual Linux/macOS paths; set `CHROME_PATH` otherwise.

```bash
npx pixel-check --tree <frameId> --depth 4                         # node ids + geometry to map
npx pixel-check pixel-checks/<page>.json                           # all screens, prints non-PASS rows
npx pixel-check pixel-checks/<page>.json --screen <name> --all     # one screen, every row
npx pixel-check pixel-checks/*.json                                # every page (regression after shared changes)
npx pixel-check pixel-checks/<page>.json --coverage                # static, no browser: unmapped sections and text styles
```

Exit code 1 on any FAIL (`--strict`: also on PENDING and WARN — use it for final acceptance once assets and content are in place); exit code 2 on an invalid check file or unknown `--screen`. Screenshots go to `<shotDir>/<screen>.png`; the report prints the matching Figma PNG path. Look at both side by side for anything the map does not cover.

### Check file

Example: [`examples/pixel-checks/home.json`](../examples/pixel-checks/home.json).

```jsonc
{
  "path": "/en/<page>",
  "screens": [
    {
      "name": "downloads-desktop",           // one screen per tab/state per width
      "frame": "10:100",                   // Figma frame (desktop or mobile)
      "width": 1440,                         // viewport width = the Figma frame width
      "height": 832,                         // optional viewport height (default 900); set it for fixed overlays
      "path": "/en/other",                   // optional; overrides the file's path for this screen
      "query": "?tab=downloads",              // optional; a "#hash" works too
      "actions": [{ "click": "[role=tab]" }, { "hover": "[data-slot=file-row]" }],  // optional; also { "wait": ms }, { "type": { "selector", "value" } }, { "select": { "selector", "value" } }
      "items": [
        { "node": "10:120", "selector": "[role=tablist]" },
        { "node": "10:141", "selector": "[data-slot=file-row]", "anchor": "10:140", "props": ["gapY", "x", "w", "h"] },
        { "node": "10:121", "selector": "[role=tab]", "index": 0, "skip": { "w": "decisions.md: third tab hidden" } }
      ]
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `node` | Figma node id from `--tree` (text nodes too) |
| `selector`, `index` | DOM element. Prefer roles/semantics; otherwise add `data-slot="<name>"` to the component root. Never select by utility classes that may change |
| `anchor` | Another item's node id. `x`/`y` become offsets from it. Use it for everything inside a block, so a difference higher up the page does not fail every row |
| `props` | Override the default props. Defaults: boxes `x y w h opacity background`; text `x y w h opacity fontFamily fontSize lineHeight letterSpacing fontWeight fontFile textCase color`. `opacity` is the effective value up the DOM tree, so hover overlays that stay hidden fail |
| `gapY` | Vertical gap from the anchor's bottom edge to this item's top. Use it for spacing between blocks and between rows whose content height comes from a CMS |
| `skip` | `{ prop: reason }`. Only for accepted deviations recorded in `decisions.md` or your tech-debt log. The reason is printed in the report |
| `pending` | `{ prop: reason }`. Known mismatch waiting for content or assets (CMS setting, font file). Reported as PENDING while it differs, PASS once fixed (then remove the entry); fails under `--strict` |
| `optional` | Missing element is SKIP, not FAIL (content that may be absent) |
| `ignore` (screen) | `{ sectionNodeId: reason }`: Figma section that is not part of this screen's check (another block's frame, a band not on the page). Used by `--coverage` |

Measurement rules: tolerance ±1px (text widths ±2). Hug-width and left-aligned text are measured by their glyph box, other elements by their border box. Figma strokes do not add size, CSS borders do: use an inset box-shadow or outline when a stroke must not change height. WARN `fontFile` means no loaded web font (`@font-face`) covers the Figma family and weight, so the browser falls back (a locally installed system font also reports WARN); on those items x/w differences within max(4px, 8% of the width) become WARN, larger ones still FAIL. When a font file's CSS weight differs from the Figma weight (a "Regular" file drawn at 430), map it in `fontWeights` of `pixel.config.json`.

What the script does not check: image content and crop, SVG shapes, borders/shadows/gradients, anything unmapped. 0 FAIL means "mapped Figma checks passed"; the screenshot review is still required.

### What to map (minimum per screen)

`--coverage` enforces the floor: every section of the frame that holds text (instances named in `siteChrome` excluded, repeated siblings covered by one) and every text style must be mapped with its typography, or the section listed in `ignore`.

- Page title, block root/tab bar (absolute), every block's first element (`gapY` from the previous block), the next section/footer (`gapY`).
- Per repeated item (row, card, photo): the first one fully (box + every text node inside), the second one `gapY` from the first (pitch), columns' x/w.
- Every distinct text style on the screen at least once.
- Interactive states that Figma draws (hover, active tab, open lightbox) as separate screens with `actions`.
- CMS content differs from Figma sample text: do not map total page height or item counts; skip `h` of wrapped text only with that reason.

### Reading the report

For every FAIL: find the cause in code or content (expected → actual → cause), then fix code, or record a decision and add `skip` with its reason. Never add a `skip` to make a new FAIL pass without a recorded reason. Keep the three kinds apart: implementation defects (fixed), accepted deviations (skip + reason), missing assets/content (WARN, PENDING or a content action).

### Agent brief (paste when handing a page to a coding agent)

> Implement `<block/page>` pixel-perfect. Follow `docs/workflow.md` end to end. Design data only from the snapshot in `<designDir>` (never the Figma API or MCP). Before claiming done: write `pixel-checks/<page>.json` covering every tab/state at every width per "What to map", run `npx pixel-check pixel-checks/<page>.json` against the running site, reach 0 FAIL, and open the screenshots next to the Figma PNGs. Report the summary lines, every PENDING/SKIP with its reason and every WARN. Say "mapped Figma checks passed + screenshots reviewed", never "pixel-perfect". Unit tests passing is not visual verification.
