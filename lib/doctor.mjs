// Decides whether a project is ready to build pages from Figma. Pure: facts in, findings out.
// Order is the order to fix things in; `who` says whether the agent can fix it alone or must ask the user.

/**
 * @typedef {{
 *   nodeMajor: number,
 *   chromePath: string | null,
 *   isGitRepo: boolean,
 *   hasCommit: boolean,
 *   hasDevScript: boolean,
 *   hasFigmaToken: boolean,
 *   envFileState: "absent" | "ignored" | "tracked-or-unignored",
 *   snapshotSpec: "missing" | "invalid" | "placeholder" | "ready",
 *   snapshotFetched: boolean,
 *   adapterState: "missing" | "template" | "filled",
 *   hasWorktreeScript: boolean,
 *   rulesMentionPipeline: boolean,
 * }} Facts
 * @typedef {{ id: string, ok: boolean, who: "agent" | "user", problem: string, fix: string }} Finding
 */

/** @param {Facts} f @returns {Finding[]} */
export function diagnose(f) {
  const rules = [
    ["node", f.nodeMajor >= 22, "agent", `Node ${f.nodeMajor} is too old (need 22+)`, "Install Node 22 or newer, then rerun."],
    ["chrome", f.chromePath !== null, "agent", "Chrome not found", "Install Google Chrome or Chromium, or set CHROME_PATH."],
    ["git", f.isGitRepo && f.hasCommit, "agent", "project is not a git repo with at least one commit (pages are built on separate branches)", "git init and commit the current state, after telling the user."],
    ["dev-script", f.hasDevScript, "user", "package.json has no \"dev\" script, so there is no web app to build pages into", "Stop. Tell the user a web project with a dev server is required first."],
    ["figma-token", f.hasFigmaToken || f.snapshotFetched,"user", "FIGMA_TOKEN is not set (env or .env)", "User creates a Figma personal access token (Settings > Security, scopes file_content:read + library_content:read) and saves it as FIGMA_TOKEN=... in .env themselves."],
    ["env-ignored", f.envFileState !== "tracked-or-unignored", "agent", ".env is not git-ignored; the token could be committed", "Add .env to .gitignore."],
    ["snapshot-spec", f.snapshotSpec === "ready", f.snapshotSpec === "missing" || f.snapshotSpec === "placeholder" ? "user" : "agent", `design/snapshot.json is ${f.snapshotSpec}`, "Ask the user for Figma frame links (desktop + mobile), then write design/snapshot.json from them."],
    ["snapshot-fetched", f.snapshotFetched, "agent", "Figma data listed in snapshot.json is not downloaded", "npx figma-snapshot --dry-run, report the request count, then npx figma-snapshot and npx figma-distill."],
    ["adapter", f.adapterState === "filled", "agent", `pixel-agent/project.md is ${f.adapterState}`, "Copy pixel-agent/ from the library if missing, then fill project.md from this project's real files and commands."],
    ["worktree-script", f.hasWorktreeScript, "agent", "pixel-agent/worktree.sh missing", "Copy pixel-agent/ from node_modules/figma-to-code-pixel-perfect and set install/dev commands at the top."],
    ["rules-point-to-pipeline", f.rulesMentionPipeline, "agent", "AGENTS.md/CLAUDE.md does not mention pixel-agent/pipeline.md", "Add the line: Build pages with pixel-agent/pipeline.md."],
  ];
  return rules.map(([id, ok, who, problem, fix]) => ({ id, ok, who, problem, fix }));
}

/** @param {Finding[]} findings */
export function isReady(findings) {
  return findings.every((finding) => finding.ok);
}
