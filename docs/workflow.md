# Pixel-perfect workflow

## Design data (`designDir`)

| File | Content |
|---|---|
| `snapshot.json` | file key + frames per batch |
| `<batch>/nodes.json` | raw Figma trees: source of every expected value |
| `<batch>/frames/*` | renders: PNG for review, SVG for assets |
| `<batch>/specs/*.md` | distilled: tree, sizes, gaps, paddings, text styles, colors; `⚠` = off-token, off 4px grid, override |
| `decisions.md` | answered design questions; agents follow and extend it |
| `blocks.md` | block → spec, node ids, component |

Batch options: `{ "fetchData": false, "render": true, "format": "svg", "scale": 2, "nodes": {…} }`. Never call the Figma API from agents.

## Per block

1. Read desktop + mobile specs and `decisions.md`.
2. Map: text style → type style, color → token, size → spacing scale. `⚠` with no decision: nearest token, record it.
3. Build from existing primitives. Tests next to the component.
4. Pixel map → `pixel-check` → 0 FAIL at every width and state.
5. Screenshot next to the Figma PNG.
6. Report "mapped Figma checks passed + screenshots reviewed", with every PENDING/SKIP/WARN and its reason. Never "pixel-perfect".

## pixel-check

```bash
npx pixel-check --tree <frameId> [--depth 4]            # node ids + geometry
npx pixel-check <check.json>... [--screen name] [--all] # all rows with --all
npx pixel-check <check.json> --coverage                 # no browser
npx pixel-check <check.json> --strict                   # PENDING, WARN fail too
```

Exit 1 = FAIL, 2 = invalid check file. Screenshots: `<shotDir>/<screen>.png`.

### Check file

```jsonc
{
  "path": "/en/page",
  "screens": [{
    "name": "downloads-desktop",      // one per tab/state/width
    "frame": "10:100",
    "width": 1440,                    // = Figma frame width
    "height": 832,                    // default 900; set for fixed overlays
    "path": "/en/other",              // per-screen override
    "query": "?tab=downloads",        // or "#hash"
    "actions": [{ "click": "[role=tab]" }, { "hover": ".row" }, { "wait": 300 },
                { "type": { "selector": "input", "value": "x" } }, { "select": { "selector": "select", "value": "a" } }],
    "items": [
      { "node": "10:120", "selector": "[role=tablist]" },
      { "node": "10:141", "selector": "[data-slot=row]", "anchor": "10:140", "props": ["gapY", "x", "w", "h"] },
      { "node": "10:121", "selector": "[role=tab]", "index": 0, "skip": { "w": "decisions.md: tab hidden" } }
    ],
    "ignore": { "10:150": "checked on another screen" }
  }]
}
```

| Field | Meaning |
|---|---|
| `selector`, `index` | roles/semantics or `data-slot`; never utility classes |
| `anchor` | `x`/`y` relative to another item: one upstream shift doesn't fail everything |
| `props` | defaults: box `x y w h opacity background`; text adds `fontFamily fontSize lineHeight letterSpacing fontWeight fontFile textCase color` |
| `gapY` | anchor bottom → item top |
| `skip` | `{ prop: reason }`, accepted deviation with a recorded decision |
| `pending` | `{ prop: reason }`, waiting for content/assets; fails only `--strict` |
| `optional` | missing element = SKIP |
| `ignore` | frame sections outside this screen (coverage) |

### Rules

- Tolerance ±1px, hug text width ±2. Hug and left-aligned text measured by glyph box, the rest by border box.
- Figma strokes don't add size, CSS borders do: use inset shadow/outline.
- `fontFile` WARN: no `@font-face` covers the family + weight (system fonts too). Then small x/w drift of hug text is WARN, big stays FAIL.
- Vectors with a shadow export larger than their node: wrap in a node-sized box, check the box with `props` without `background`.
- Not checked: image content, SVG shapes, borders, shadows, gradients, anything unmapped.

### What to map

`--coverage` requires every text section of the frame (minus `siteChrome`, repeats count once) and every text style, or an `ignore` entry. Also:

- page title, block roots, each block's first element (`gapY` from the previous one);
- first repeated item fully, second by `gapY` (pitch);
- every Figma state (hover, active tab, open dialog) as its own screen with `actions`;
- CMS text ≠ Figma sample: no page height, no item counts.

### FAIL rows

Expected → actual → cause. Fix code, or record a decision and `skip` with that reason. Never `skip` without one.
