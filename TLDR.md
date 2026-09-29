# TL;DR

**What:** tells you where your page differs from Figma. `Title y: expected 24, actual 32`.

**Who:** frontend devs and AI coding agents building pages from Figma.

**When:** after building a page, and after any shared CSS change.

**How:**

```bash
npx figma-snapshot                       # save Figma frames to the repo
npx pixel-check pixel-checks/home.json   # compare page with Figma
```

Fix FAIL rows, rerun until PASSED. Setup: [README](README.md).
