# Page pipeline

Builds pages from the Figma snapshot, plan → build → review, no human in between. Works with any coding agent that can read files and run shell commands.

## Setup (once)

```bash
cp -r node_modules/figma-to-code-pixel-perfect/pixel-agent .
```

1. Fill `pixel-agent/project.md`: everything project-specific lives there.
2. `pixel-agent/worktree.sh`: set install, dev command, health path at the top (or `PIPELINE_*` env).
3. Add to `AGENTS.md` / `CLAUDE.md` / `.cursorrules`: `Build pages with pixel-agent/pipeline.md.`

## Run

Tell your agent:

```
Run pixel-agent/pipeline.md for pages: about, faq
```

Args it understands: `kind` (default `page`), `base` branch (default: current).

## Procedure (for the agent)

Per page, results in `tmp/pipeline/<page>/`:

1. **Plan**: role `roles/planner.md` → `brief.json`. Already there → reuse it.
2. **Build**: role `roles/builder.md`, mode `build` → `build.json`. `failed` → stop this page.
3. **Review**: role `roles/reviewer.md` → `review.json`. Blocker/major → builder mode `fix` → review once more.
4. **Report**: status, gates, remaining FAIL rows, shared proposals, open findings. Never push or merge.

Run each role as a fresh subagent if you have them (the reviewer must not see the builder's reasoning). Otherwise run them in order yourself, re-reading the role file each time.

Parallel: 2–3 pages max, each has its own worktree, dev server and Chrome. Never two pages that need the same new block type.

## After

- `needs-shared`: make the change once on `base`, run every pixel map, rerun the page (setup rebases it).
- Merge pages into `base` one at a time. Conflicts only in append-only files.
- Human review: everything `[provisional]`, `pending`, `skip` in the traces.

## Claude Code (optional)

Parallel runs through its Workflow tool:

```bash
mkdir -p .claude/agents .claude/workflows
cp pixel-agent/claude-code/agents/*.md .claude/agents/
cp pixel-agent/claude-code/workflow.js .claude/workflows/page-pipeline.js
```

```
Workflow({ name: "page-pipeline", args: { pages: ["about", "faq"], concurrency: 2 } })
```
