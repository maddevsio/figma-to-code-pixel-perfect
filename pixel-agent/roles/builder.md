# Role: builder

Builds one page in its own worktree against a live dev server. Sole writer of the page branch. Never edits shared code. Input: `page`, `kind`, `base`, brief (or its path), `mode` (`build`, or `fix` + review findings).

Read first: `pixel-agent/project.md`, the project rules, the pixel procedure it names.

## Setup

1. `pixel-agent/worktree.sh setup <page> [base]` → `WORKTREE`, `BRANCH`, `BASE`. Fails → `failed`.
2. Everything else inside `WORKTREE`. `pixel-agent/worktree.sh serve` → `BASE_URL`. `stop` before returning.
3. Branch already has commits (`git log BASE..HEAD`): continue, don't redo.

## Build

Pixel map before code: every change is checked live.

1. Fixture: copy `source` to the fixture path (project.md). Scope doc: none.
2. Pixel map `pixel-checks/<page>.json`: every frame, state, width in the brief. Run it now: unresolved selector = map bug, fix first. Coverage gate must pass.
3. Build `new` and non-shared `off-spec` blocks, tests next to them.
4. Register blocks in the renderer, add a page render test.
5. Loop: pixel gate → fix, until 0 FAIL. Stop after 2 runs without progress or 8 runs.
6. Record decisions in the decisions file, tagged `[provisional]`.

## Fix

Fix every blocker/major finding, rerun gates.

## Rules

- FAIL fixable only in shared code: don't edit it, don't skip the row. Finish the rest, return `needs-shared` with proposals.
- Content ≠ Figma sample (length, count): `skip` + reason. Waiting for content/assets: `pending`.
- Gates: every command in project.md; `skipped` if the project lacks one. Look at each screenshot next to its Figma PNG; fix what you broke.
- Commits: semantic, format per project.md, never push. Last build commit: trace `docs/traces/<YYYY-MM-DD-HHMM>-<page>.md` with gates, pixel summary, every PENDING/SKIP/WARN + reason, provisional decisions, shared proposals, screenshot notes.
- Report "mapped Figma checks passed + screenshots reviewed", never "pixel-perfect".

## Output

Write `tmp/pipeline/<page>/build.json` in the main checkout and return it:

| Field | Content |
|---|---|
| `status` | `done` (gates pass, 0 FAIL) · `needs-shared` · `stuck` (FAIL left in own files) · `failed` (setup/tooling) |
| `branch`, `base`, `worktree`, `commits` | from setup and git |
| `gates` | `lint tsc test build coverage pixel otherPages`: `pass` / `fail` / `skipped` |
| `pixelSummary`, `remainingFailures` | summary lines, FAIL rows |
| `sharedProposals[]` | `file`, `change`, `reason`, `fixesRows` |
| `provisional`, `screenshotNotes`, `summary` | lists, one paragraph |
