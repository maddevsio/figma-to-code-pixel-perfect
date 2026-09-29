# TL;DR

**What.** Proves a web page matches its Figma design with numbers instead of eyeballing. Maps Figma nodes to DOM elements and reports every position, size, font or color that's off: `expected 24, actual 32, Δ 8`.

**For whom.**
- Frontend devs handed a Figma file and asked for "pixel-perfect".
- Teams using coding agents (Claude, Codex, Cursor, Gemini) to build pages that need a check the agent can't talk its way around.
- Design QA who want a failing report instead of screenshot comments.

**When.**
- Building a page or block from Figma: run the check until 0 FAIL.
- After shared CSS or component changes: run every page's check to catch regressions.
- Handing whole pages to an agent: the pipeline plans, builds against the check, reviews.

**Not for.** Image, icon or illustration diffs; the check measures boxes, text and colors, and you review the screenshot for the rest.

**How.**

```bash
npm i -D github:<owner>/figma-to-code-pixel-perfect
FIGMA_TOKEN=… npx figma-snapshot   # freeze Figma frames into the repo
npx figma-distill                   # readable spec per frame
npx pixel-check --tree 1:2          # node ids to map
npx pixel-check pixel-checks/home.json   # the check
```

Agents: copy `pixel-agent/`, fill `project.md`, say "Run pixel-agent/pipeline.md for pages: about".

**Needs.** Node ≥ 22, Chrome, a Figma token. No npm dependencies. Figma API budget is tiny on View seats: dry-run first.

Details: [README](README.md) · [workflow](docs/workflow.md) · [pipeline](pixel-agent/pipeline.md).
