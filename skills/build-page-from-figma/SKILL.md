---
name: build-page-from-figma
description: Use when a user, in plain words, asks to build, recreate, or match a page or screen from a Figma design or Figma link, in a project that uses figma-to-code-pixel-perfect (pixel-check, pixel-agent/, design/snapshot.json). The user may not know code, JSON, or the command line.
---

# Build a page from Figma, for non-technical users

User says what they want ("build the home page from this Figma link"). You do the rest. They never edit JSON or run commands. Ask only what only they know: Figma links, Figma token, page content decisions.

## Start: run the doctor

```bash
npx pixel-doctor
```

Not found → `npm i -D github:maddevsio/figma-to-code-pixel-perfect`, tell the user in one line, rerun.

Fix every `[agent]` item you can now, in order, rerunning after each; skip ones that need the user's Figma data (`snapshot-fetched`). Then ask for all `[user]` items in one message (below), and rerun after the answer. Repeat until `READY`. Build nothing while anything is MISSING. `dev-script` MISSING is a hard stop: tell the user a web project with a dev server is needed first.

## Asking the user

One message, only what the doctor needs.

- Frames: "In Figma, click the desktop version of the page (the frame, not the whole canvas), right-click, Copy link to selection, paste it here. Same for mobile, if it exists." No mobile frame → build desktop only, say responsive was not checked.
- Token: "Figma → avatar → Settings → Security → Personal access tokens → create one with read access to file content and library content. Save it in a file named `.env` in the project as `FIGMA_TOKEN=<token>`. Don't paste it here." Never print, log, or commit it.

## `design/snapshot.json` from links

`…/design/<fileKey>/…?node-id=1-2` → `fileKey`, node `1:2` (dash → colon). Branch link `…/branch/<branchKey>/…` → `branchKey`. Different file keys → ask which; one spec holds one file.

```json
{ "fileKey": "<fileKey>", "batches": { "<page>": { "<page>-desktop": "1:2", "<page>-mobile": "1:3" } } }
```

`<page>` = short lowercase slug of the user's page name.

## Fetch

```bash
npx figma-snapshot --dry-run   # tell the user the request count
npx figma-snapshot
npx figma-distill
```

Seats without edit rights get ~20 Figma requests a month: fetch only what the dry run lists. HTTP 429/403 → stop, report in plain words with `retry-after`, no retry loop.

## Fill `pixel-agent/project.md`

Copy `pixel-agent/` from `node_modules/figma-to-code-pixel-perfect/` if missing. Replace every example value with what the project really has: commands from `package.json`, paths from the source tree. No CMS → kind `static`: write `design/<page>/scope.md` (route, sections in order, copy from the Figma spec) yourself. Gate command the project lacks (lint, tsc, test, build) → write `none`; the builder reports it as skipped. Create empty `design/decisions.md` and `design/blocks.md` if missing. Set install/dev commands atop `pixel-agent/worktree.sh`; install must leave `node_modules/.bin/pixel-check` in each worktree. Delete the `TEMPLATE:` line last. `.gitignore` needs `.env`, `node_modules` (no trailing slash), `tmp/`.

## Build, then report

Commit the setup files (`design/`, `pixel-agent/`, `AGENTS.md`, `.gitignore`) on the base branch first: page worktrees branch from it and won't see uncommitted files.

On `READY`, follow `pixel-agent/pipeline.md` for the page. Never push or merge. Couldn't run planner, builder and reviewer as separate fresh subagents → say in the report that the review was not independent.

Report in plain language, no file dumps:

- Done or not, and the branch name.
- "N of M measured elements match Figma within 1px." Never "pixel-perfect": images, icons, shadows, gradients are not measured.
- Screenshots: `tmp/pixel/<screen>.png` (built) beside `design/<page>/frames/<screen>.png` (Figma); ask the user to look.
- Each place Figma and the project disagreed, as a yes/no question.
- Font WARNs → ask the user for the font files. Vector shapes (icons, illustrations) are not downloaded by default → offer to fetch them as SVG, with the request count from a dry run.
- What still fails and why.

## Red flags

| Thought | Reality |
|---|---|
| "Skip the doctor" | Skipped prerequisites fail later and burn Figma quota. |
| "Ask the user to run it" | They can't. Run it, or state the blocker. |
| "Token in chat is easier" | It leaks. Use `.env`. |
| "Checks pass, so pixel-perfect" | Only mapped elements are measured. |
| "Fetch again to be safe" | Quota is monthly and low. |
