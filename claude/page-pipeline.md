# Page pipeline: project adapter

The page-* agents read this file before anything else. It holds everything project-specific; the agents and the workflow stay generic. Replace every example value below with your project's.

## Repo

- Folder: `my-site`. When a session starts in a parent folder, agents `cd my-site` first.
- Project rules: `AGENTS.md` (or `CLAUDE.md`).
- Pixel tooling: `npx pixel-check`, config `pixel.config.json`, design data `design/`, pixel maps `pixel-checks/<page>.json`, procedure `docs/workflow.md` of figma-to-code-pixel-perfect (copy it into your docs and link it here).
- Design decisions: `design/decisions.md`. Block index: `design/blocks.md`.

## Page kinds

`kind` in the workflow args picks a row. `source` is where the page's content lives, `path` the route that renders it.

| kind | source | path |
|---|---|---|
| `page` | `../my-cms/example/page/<uid>.json` | `/en/<uid>` |
| `article` | `../my-cms/example/article/<uid>.json` | `/en/news/<uid>` |
| `static` | `design/<uid>/scope.md` | routes named in the scope doc (a `path` per screen in the pixel map) |

A `static` scope doc is written by the main agent next to the Figma batch `<uid>`: routes, frames, data source, trigger, the files the builder may create or edit.

## Rendering

- Block renderer (content block type → component): `src/components/blocks/BlockRenderer.tsx`.
- Route components for non-`page` kinds (fields outside the content blocks, e.g. title, date, hero): `src/app/[lang]/news/[uid]/page.tsx`.
- Test fixtures: `src/test/fixtures/pages/<page>.json`, copied from `source`.
- Styling rules: tokens only, one type style (`typo-*`) per text element, spacing on the 4px scale; see `AGENTS.md`.

## Shared code

Code already on the base branch that another page uses. The builder never edits it; it returns `needs-shared` with proposals instead.

- `src/components/ui/**`, `src/lib/**`, `src/app/**`, global CSS.
- The renderer of a block type that also appears in another page's `source` (search all sources, every kind).
- A component that renders every item of a kind (the article hero).

A block type with no renderer yet is new: the builder creates it even if other pages will use it later.

Allowed appends: registrations in the block renderer, entries in `design/decisions.md` and `docs/tech-debt.md`, and for `static` the edits its scope doc allows.

## Commands

| Gate | Command |
|---|---|
| lint | `npm run lint` |
| tsc | `npx tsc --noEmit` |
| test | `npm test` |
| build | `npm run build` |
| coverage | `npx pixel-check pixel-checks/<page>.json --coverage` |
| pixel | `npx pixel-check pixel-checks/<page>.json --base $BASE_URL` |
| otherPages | `npx pixel-check pixel-checks/*.json --base $BASE_URL` |

A gate the project does not have: report it as `skipped`.

Dev server per worktree: `scripts/worktree.sh serve` / `stop` (install, dev command and health path are set at the top of the script).

Prerequisites: `.env` in the main checkout when the dev server needs one (copied into each worktree), content for the page available to the dev server, its frames in the design snapshot.

## Commits

Semantic commits on the page branch: `test(<page>): fixture and pixel map`, `feat(<page>): <block>`, `fix(<page>): <what>`. Trailer: none. Never push.
