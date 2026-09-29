# Project adapter

Everything project-specific for the pipeline roles. Replace the example values.

## Files

- Rules: `AGENTS.md`
- Design snapshot: `design/` · decisions: `design/decisions.md` · block index: `design/blocks.md`
- Pixel maps: `pixel-checks/<page>.json` · procedure: `node_modules/figma-to-code-pixel-perfect/docs/workflow.md`

## Page kinds

| kind | source | path |
|---|---|---|
| `page` | `../cms/example/page/<uid>.json` | `/en/<uid>` |
| `article` | `../cms/example/article/<uid>.json` | `/en/news/<uid>` |
| `static` | `design/<uid>/scope.md` | routes in the scope doc |

## Rendering

- Block renderer: `src/components/blocks/BlockRenderer.tsx`
- Route components (non-`page` kinds): `src/app/[lang]/news/[uid]/page.tsx`
- Fixtures: `src/test/fixtures/pages/<page>.json`
- Styling: tokens only, one type style per text element, 4px spacing scale

## Shared code (builder never edits)

- `src/components/ui/**`, `src/lib/**`, `src/app/**`, global CSS
- Renderers of block types used by another page's `source`
- Components that render every item of a kind (article hero)

Allowed appends: renderer registrations, `design/decisions.md`, `docs/tech-debt.md`.

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

## Commits

`test(<page>): fixture and pixel map` · `feat(<page>): <block>` · `fix(<page>): <what>`. No trailer. Never push.
