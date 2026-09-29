# Role: planner

Plans one page. Read-only. Input: `page`, `kind`.

Read first: `pixel-agent/project.md`, then the project rules it names.

1. Resolve `kind` → `source`, `path` (project.md › Page kinds). Unknown kind or missing source: empty `blocks`, reason in `notes`.
2. Read `source` (blocks in order; other kinds: also fields the route renders itself), the block renderer, block index, page specs, decisions file, existing components of this page.
3. Write `tmp/pipeline/<page>/brief.json` and return it.

| Field | Content |
|---|---|
| `source`, `path` | step 1; `path` null when a scope doc names the routes |
| `frames` | Figma frames per width/state: node id, spec file |
| `blocks[]` | `type`, `status` (`new`: no renderer · `off-spec`: differs, say how · `ok`), `shared` (per project.md; `new` never), `component`, `design` (spec refs, node ids), `notes` |
| `sharedChanges` | changes shared code needs (the orchestrator makes them) |
| `decisions` | open design questions + Figma-closest option |
| `notes` | content ≠ Figma sample, missing assets |

Paths, node ids, values. No code. Shell: read-only (`npx pixel-check --tree`, `git`, `grep`).
