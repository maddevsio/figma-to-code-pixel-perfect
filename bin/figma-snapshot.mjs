#!/usr/bin/env node
// Freezes Figma frames into the repo so agents never call the Figma API.
// Tier 1 budget (View/Collab seat: up to 20/month) is spent only on missing outputs, so re-runs resume instead of re-fetching.
// Usage: FIGMA_TOKEN=... figma-snapshot [spec.json] [--dry-run]   (spec defaults to <designDir>/snapshot.json)
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { loadConfig } from "../lib/config.mjs";

const argv = process.argv.slice(2);
const isDryRun = argv.includes("--dry-run");
const specPath = argv.find((arg) => !arg.startsWith("--")) ?? join((await loadConfig()).designDir, "snapshot.json");
const token = process.env.FIGMA_TOKEN;
if (!token && !isDryRun) {
  console.error("Usage: FIGMA_TOKEN=... figma-snapshot [spec.json] [--dry-run]");
  process.exit(1);
}

const spec = JSON.parse(await readFile(specPath, "utf8"));
const rootDir = resolve(dirname(specPath));

const exists = (path) => access(path).then(() => true, () => false);

async function figma(path) {
  const res = await fetch(`https://api.figma.com/v1${path}`, { headers: { "X-Figma-Token": token } });
  if (!res.ok) {
    const info = ["retry-after", "x-figma-plan-tier", "x-figma-rate-limit-type"]
      .map((h) => `${h}=${res.headers.get(h)}`)
      .join(" ");
    throw new Error(`${res.status} ${path} ${info}`);
  }
  return res.json();
}

async function download(url, path) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} downloading ${path}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}

const plan = [];
for (const [batch, entry] of Object.entries(spec.batches)) {
  const { nodes, fetchData = true, render = true, format = "png", scale = spec.scale ?? 1 } = "nodes" in entry ? entry : { nodes: entry };
  const dir = join(rootDir, batch);
  const ids = Object.values(nodes).join(",");
  const missingFrames = [];
  for (const name of Object.keys(nodes)) {
    if (!(await exists(join(dir, "frames", `${name}.${format}`)))) missingFrames.push(name);
  }
  if (fetchData && !(await exists(join(dir, "nodes.json")))) plan.push({ kind: "nodes", batch, dir, ids });
  if (render && missingFrames.length) plan.push({ kind: "images", batch, dir, nodes, format, scale, missingFrames });
}
const needsLibrary = !(await exists(join(rootDir, "styles.json"))) || !(await exists(join(rootDir, "components.json")));

console.log(`Tier 1 requests planned: ${plan.length}`);
for (const step of plan) console.log(`  ${step.kind} ${step.batch}${step.missingFrames ? ` (${step.missingFrames.join(", ")})` : ""}`);
console.log(`Tier 3 requests planned: ${needsLibrary ? 2 : 0}`);
if (isDryRun) process.exit(0);

for (const step of plan) {
  await mkdir(join(step.dir, "frames"), { recursive: true });
  if (step.kind === "nodes") {
    const data = await figma(`/files/${spec.fileKey}/nodes?ids=${step.ids}`);
    for (const [id, node] of Object.entries(data.nodes)) if (!node) console.warn(`node not found: ${id}`);
    await writeFile(join(step.dir, "nodes.json"), JSON.stringify(data, null, 2));
    console.log(`${step.batch}/nodes.json`);
    continue;
  }
  const ids = step.missingFrames.map((name) => step.nodes[name]).join(",");
  const { images } = await figma(`/images/${spec.fileKey}?ids=${ids}&format=${step.format}&scale=${step.scale}`);
  for (const name of step.missingFrames) {
    const url = images[step.nodes[name]];
    if (!url) {
      console.warn(`render failed: ${step.batch}/${name}; re-run to retry`);
      continue;
    }
    await download(url, join(step.dir, "frames", `${name}.${step.format}`));
    console.log(`${step.batch}/frames/${name}.${step.format}`);
  }
}

if (needsLibrary) {
  for (const kind of ["styles", "components"]) {
    await writeFile(join(rootDir, `${kind}.json`), JSON.stringify(await figma(`/files/${spec.fileKey}/${kind}`), null, 2));
    console.log(`${kind}.json`);
  }
}
