# Claude Code page pipeline

Builds site pages from the frozen Figma snapshot with no human input between steps, then hands the result back to the main agent. It runs on Claude Code's Workflow tool and sub-agents; the pixel tooling in this repo works without it.

## Install into your project

```bash
mkdir -p .claude/agents .claude/workflows scripts
cp claude/agents/page-*.md .claude/agents/
cp claude/workflows/page-pipeline.js .claude/workflows/
cp claude/page-pipeline.md .claude/page-pipeline.md    # then fill it in
cp claude/scripts/worktree.sh scripts/worktree.sh      # set install/dev/health at the top, or via PIPELINE_* env
```

`.claude/page-pipeline.md` is the only project-specific file: repo, page kinds (content source and route per kind), renderer, shared code, gate commands, commit format. The agents and the workflow read everything project-specific from it.

Agent definitions load at session start from the folder the session opens in. If you start sessions in a parent folder, link them there once:

```bash
mkdir -p ../.claude && ln -sfn ../<repo>/.claude/agents ../.claude/agents && ln -sfn ../<repo>/.claude/workflows ../.claude/workflows
```

## Run

```
Workflow({ name: "page-pipeline", args: { page: "about" } })
Workflow({ name: "page-pipeline", args: { pages: ["faq", "contact"], concurrency: 2, kind: "page" } })
```

Args: `page` / `pages` (uids; for a scope-doc kind, the Figma batch name), `kind` (default `page`, one per run), `base` (branch the page branches start from and rebase onto; default: the main checkout's current branch), `briefs` (`{ "<uid>": "<saved brief JSON path>" }`: skip the planner on reruns after shared-code changes), `concurrency` (default 2; each page runs its own install, dev server and Chrome, so keep it at 2–3).

Result per page: branch `page/<page>` in the worktree `<repo>-pages/<page>` with semantic commits and a trace, plus the workflow result (status, gates, remaining FAIL rows, shared-code proposals, review findings). Nothing is pushed or merged.

## Roles

| Role | Model | Owns | Never |
|---|---|---|---|
| `page-planner` | opus | build brief: `source`/`path`, frames, blocks (`new`/`off-spec`/`ok`, `shared`), needed shared changes, open design questions | edits |
| `page-builder` | sonnet | the page branch: fixture, pixel map, blocks, wiring, `[provisional]` decisions, trace; the live dev server and the pixel loop; gates | shared code |
| `page-reviewer` | opus | one static review of the whole page diff | edits, live runs |
| main agent | session | shared-code changes, merging pages into `base`, conflicts, anything the pipeline returns unfinished | — |

The workflow (`page-pipeline.js`) owns control flow only: the page pool, plan → build → review → one fix round.

## Flow per page

1. **Plan**: the planner resolves `kind` to `source` and `path`, reads the content, the block renderer, the specs and decisions, and returns the brief.
2. **Build**: the builder runs `scripts/worktree.sh setup <page> [base]` (create, or reuse and rebase) and `serve`, writes the fixture and the pixel map first and checks the map live, builds blocks, registers them, then loops on the pixel check until 0 FAIL (stops after two runs without progress or 8 runs). Gates from the adapter, including every other page's pixel map. Result status: `done`, `needs-shared`, `stuck` or `failed`.
3. **Review**: the reviewer checks `git diff <base>...page/<page>` once. Blocker/major findings → one builder fix run → one more review.
4. The workflow returns; the main agent takes over.

## Shared code

The builder never changes code other pages use (the adapter defines it). It finishes the page-local work and returns `needs-shared` with proposals and the pixel rows each one fixes. The main agent makes the change once on `base`, runs every pixel map, and re-runs the pipeline for the page: `setup` rebases the page branch onto `base` and the builder continues from the existing commits.

## Several pages at once

Pages run in parallel up to `concurrency`, each in its own worktree with its own dev server port. Shared-code changes never happen in page branches, so pages only meet in files that grow by appending (renderer registrations, decisions, tech debt). The main agent merges finished pages into `base` one at a time and resolves those conflicts.

Do not build two pages at once that both need the same new block type: both builders would create it. Build one first, merge it into `base`, then the others.

## Decisions without a human

- Design question with no answer in the decisions file: the Figma-closest option, recorded `[provisional]` by the builder.
- Waiting for content or assets: `pending` entry in the pixel map (visible, fails only `--strict`).
- Content that differs from the Figma sample (text length, item count): `skip` with that reason.
- Everything provisional, pending or skipped is listed in the page trace for the human review of the branch.

## Limits

- The pixel check is a mapped geometry/style check, not a pixel diff; the builder's screenshot review covers images, icons and unmapped elements, and needs Figma frame PNGs in the snapshot.
- Review is static; the builder is the only role that runs the site.
