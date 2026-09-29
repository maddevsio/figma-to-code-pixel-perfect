# TL;DR

**What:** lets an AI agent build pages that match Figma, and prove it.

**Who:** you, if an agent (Claude, Codex, Cursor, Gemini) turns your Figma designs into pages.

**Why:** agents say "done, pixel-perfect" without checking. Here they can't: the agent measures its page against Figma and fixes it until every element is within 1px.

**How:**

1. Save Figma frames into the repo: `npx figma-snapshot`
2. Tell the agent: `Run pixel-agent/pipeline.md for page home`
3. Get a branch with the page, a passing check and screenshots next to Figma.

Setup: [README](README.md).
