#!/usr/bin/env node
// Checks whether this project is ready to build pages from Figma. Changes nothing, prints no secrets.
// Usage: pixel-doctor        exit 0 = ready, 1 = something to fix (first MISSING line is the next step)
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import { findChrome } from "../lib/chrome.mjs";
import { loadConfig } from "../lib/config.mjs";
import { diagnose, isReady } from "../lib/doctor.mjs";

const config = await loadConfig();
const findings = diagnose(gatherFacts(config));

for (const finding of findings) {
  console.log(finding.ok ? `OK       ${finding.id}` : `MISSING  ${finding.id} [${finding.who}]: ${finding.problem}\n         FIX: ${finding.fix}`);
}
console.log(isReady(findings) ? "\nREADY: all prerequisites met." : "\nNOT READY: fix the first MISSING item, then rerun pixel-doctor.");
process.exit(isReady(findings) ? 0 : 1);

function gatherFacts(config) {
  const read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : "");
  const git = (...args) => spawnSync("git", args, { encoding: "utf8" });
  const packageJson = parseJson(read("package.json"));
  const snapshotPath = join(config.designDir, "snapshot.json");
  return {
    nodeMajor: Number(process.versions.node.split(".")[0]),
    chromePath: findChrome(),
    isGitRepo: git("rev-parse", "--is-inside-work-tree").status === 0,
    hasCommit: git("rev-parse", "--verify", "HEAD").status === 0,
    hasDevScript: Boolean(packageJson?.scripts?.dev),
    hasFigmaToken: Boolean(process.env.FIGMA_TOKEN || parseEnv(read(".env")).FIGMA_TOKEN),
    envFileState: !existsSync(".env") ? "absent" : git("check-ignore", "-q", ".env").status === 0 ? "ignored" : "tracked-or-unignored",
    snapshotSpec: snapshotSpecState(read(snapshotPath)),
    snapshotFetched: snapshotFetched(snapshotPath),
    adapterState: !existsSync("pixel-agent/project.md") ? "missing" : read("pixel-agent/project.md").includes("TEMPLATE:") ? "template" : "filled",
    hasWorktreeScript: existsSync("pixel-agent/worktree.sh"),
    rulesMentionPipeline: ["AGENTS.md", "CLAUDE.md", ".cursorrules"].some((file) => read(file).includes("pixel-agent/pipeline.md")),
  };
}

function snapshotSpecState(text) {
  if (!text) return "missing";
  const spec = parseJson(text);
  if (!spec || typeof spec.fileKey !== "string" || !spec.batches || Object.keys(spec.batches).length === 0) return "invalid";
  return spec.fileKey.includes("<") ? "placeholder" : "ready";
}

// Reuses figma-snapshot's own plan so "what is missing" has one definition.
function snapshotFetched(snapshotPath) {
  if (!existsSync(snapshotPath)) return false;
  const snapshotBin = fileURLToPath(new URL("./figma-snapshot.mjs", import.meta.url));
  const run = spawnSync(process.execPath, [snapshotBin, resolve(snapshotPath), "--dry-run"], { encoding: "utf8" });
  return run.status === 0 && /Tier 1 requests planned: 0\b/.test(run.stdout);
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
