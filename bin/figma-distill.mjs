#!/usr/bin/env node
// Turns raw Figma snapshots (nodes.json, megabytes) into compact per-frame specs agents can read.
// With tokensCss set, colors resolve to its --color-* variables and anything off-token is flagged with ⚠; off-4px-grid values are always flagged.
// Usage: figma-distill [spec.json]   (spec defaults to <designDir>/snapshot.json)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { loadConfig } from "../lib/config.mjs";

const config = await loadConfig();
const specPath = process.argv[2] ?? join(config.designDir, "snapshot.json");
const spec = JSON.parse(await readFile(specPath, "utf8"));
const rootDir = resolve(dirname(specPath));
const css = config.tokensCss ? await readFile(config.tokensCss, "utf8") : null;
const tokenByHex = new Map(
  [...(css ?? "").matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(([, name, hex]) => [hex.toUpperCase(), name]),
);
const isSiteChrome = (n) => n.type === "INSTANCE" && config.siteChrome.some((name) => n.name.startsWith(name));

const MAX_TEXT = 90;

const hex = ({ r, g, b }) => "#" + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
const round = (n) => Math.round(n * 100) / 100;
const px = (n) => (n % 4 === 0 ? `${round(n)}` : `${round(n)}⚠`);

function color(c, opacity = 1) {
  const value = hex(c);
  const alpha = round((c.a ?? 1) * opacity);
  const name = !css ? value : value === "#FFFFFF" ? "white" : (tokenByHex.get(value) ?? `⚠${value}`);
  return alpha < 1 ? `${name}/${Math.round(alpha * 100)}%` : name;
}

function paints(list) {
  return (list ?? [])
    .filter((p) => p.visible !== false)
    .map((p) => {
      if (p.type === "SOLID") return color(p.color, p.opacity ?? 1);
      if (p.type === "IMAGE") return `image(${p.scaleMode?.toLowerCase()})`;
      if (p.type.startsWith("GRADIENT")) return `${p.type.toLowerCase()}(${p.gradientStops.map((s) => color(s.color)).join("→")})`;
      return p.type.toLowerCase();
    })
    .join("+");
}

function layout(n) {
  if (!n.layoutMode || n.layoutMode === "NONE") return "";
  const parts = [n.layoutMode === "VERTICAL" ? "col" : "row"];
  if (n.layoutWrap === "WRAP") parts.push("wrap", `rowgap:${px(n.counterAxisSpacing ?? 0)}`);
  if (n.itemSpacing) parts.push(`gap:${px(n.itemSpacing)}`);
  const pad = [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft].map((v) => v ?? 0);
  if (pad.some(Boolean)) parts.push(`pad:${pad.map(px).join("/")}`);
  if (n.primaryAxisAlignItems && n.primaryAxisAlignItems !== "MIN") parts.push(`main:${n.primaryAxisAlignItems.toLowerCase()}`);
  if (n.counterAxisAlignItems && n.counterAxisAlignItems !== "MIN") parts.push(`cross:${n.counterAxisAlignItems.toLowerCase()}`);
  return parts.join(" ");
}

function box(n, parent) {
  const b = n.absoluteBoundingBox;
  if (!b) return "";
  const size = `${round(b.width)}×${round(b.height)}`;
  const sizing = [n.layoutSizingHorizontal, n.layoutSizingVertical].map((s) => ({ FIXED: "x", HUG: "h", FILL: "f" })[s] ?? "-").join("");
  const isAbsolute = n.layoutPositioning === "ABSOLUTE" || !parent?.layoutMode || parent.layoutMode === "NONE";
  const pb = parent?.absoluteBoundingBox;
  const at = isAbsolute && pb ? ` @${round(b.x - pb.x)},${round(b.y - pb.y)}` : "";
  return `${size}${sizing === "--" ? "" : ` [${sizing}]`}${at}`;
}

function decoration(n) {
  const parts = [];
  const fill = paints(n.fills);
  if (fill && n.type !== "TEXT") parts.push(`bg:${fill}`);
  const stroke = paints(n.strokes);
  if (stroke) {
    const w = n.individualStrokeWeights;
    const weight = w ? `${w.top}/${w.right}/${w.bottom}/${w.left}` : n.strokeWeight;
    parts.push(`border:${weight} ${stroke}`);
  }
  const radius = n.rectangleCornerRadii?.join("/") ?? n.cornerRadius;
  if (radius) parts.push(`radius:${radius}`);
  if (n.opacity !== undefined && n.opacity < 1) parts.push(`opacity:${round(n.opacity)}`);
  for (const e of (n.effects ?? []).filter((e) => e.visible !== false)) {
    parts.push(`${e.type.toLowerCase()}(${e.offset ? `${e.offset.x},${e.offset.y} ` : ""}${e.radius}${e.color ? " " + color(e.color) : ""})`);
  }
  if (n.rotation) parts.push(`rotate:${Math.round((-n.rotation * 180) / Math.PI)}deg`);
  if (n.clipsContent) parts.push("clip");
  return parts.join(" ");
}

function textStyleKey(s) {
  const lh = s.lineHeightPx ? round(s.lineHeightPx) : "auto";
  const ls = s.letterSpacing ? round(s.letterSpacing) : 0;
  return `${s.fontFamily} ${s.fontWeight} ${round(s.fontSize)}/${lh} ls:${ls}${s.textCase && s.textCase !== "ORIGINAL" ? " " + s.textCase.toLowerCase() : ""}`;
}

function distillFrame(root, styleNames, componentNames, legend) {
  const lines = [];
  function walk(n, parent, depth) {
    if (n.visible === false) return;
    const indent = "  ".repeat(depth);
    const name = n.name.replace(/\s+/g, " ").trim();
    if (n.type === "TEXT") {
      const styleName = styleNames[n.styles?.text] ?? "⚠unstyled";
      const key = textStyleKey(n.style);
      if (!legend.has(styleName)) legend.set(styleName, key);
      const override = legend.get(styleName) === key ? "" : ` ⚠override(${key})`;
      const text = n.characters.replace(/\s+/g, " ").trim();
      const shown = text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + "…" : text;
      const align = n.style.textAlignHorizontal !== "LEFT" ? ` align:${n.style.textAlignHorizontal.toLowerCase()}` : "";
      lines.push(`${indent}- text ${styleName} ${paints(n.fills)}${align}${override} ${box(n, parent)} "${shown}"`);
      return;
    }
    const component = n.componentId ? componentNames[n.componentId] : undefined;
    const label = component ? `<${component}>` : "";
    const head = `${indent}- ${n.type.toLowerCase()} "${name}" #${n.id} ${label}`.trimEnd();
    const details = [box(n, parent), layout(n), decoration(n)].filter(Boolean).join(" | ");
    const isIcon = /^icons?\b/i.test(component ?? name);
    if (isIcon || isSiteChrome(n) || ["VECTOR", "BOOLEAN_OPERATION", "LINE", "ELLIPSE", "STAR"].includes(n.type)) {
      lines.push(`${head} ${details}${isIcon ? " (icon)" : ""}`);
      return;
    }
    lines.push(`${head} ${details}`);
    for (const child of n.children ?? []) walk(child, n, depth + 1);
  }
  walk(root, undefined, 0);
  return lines;
}

for (const [batch, entry] of Object.entries(spec.batches)) {
  const { nodes, fetchData = true } = "nodes" in entry ? entry : { nodes: entry };
  if (!fetchData) continue;
  const raw = JSON.parse(await readFile(join(rootDir, batch, "nodes.json"), "utf8"));
  const outDir = join(rootDir, batch, "specs");
  await mkdir(outDir, { recursive: true });
  for (const [key, id] of Object.entries(nodes)) {
    const node = raw.nodes[id];
    if (!node) {
      console.warn(`missing ${batch}/${key} (${id})`);
      continue;
    }
    const styleNames = Object.fromEntries(Object.entries(node.styles ?? {}).map(([sid, s]) => [sid, s.name]));
    const componentNames = Object.fromEntries(Object.entries(node.components ?? {}).map(([cid, c]) => [cid, c.name]));
    const legend = new Map();
    const body = distillFrame(node.document, styleNames, componentNames, legend);
    const header = [
      `# ${node.document.name} (${key}, #${id})`,
      "",
      `Legend: size W×H [sizing h/v: x=fixed h=hug f=fill], @x,y = absolute position in parent, layout col/row gap pad(t/r/b/l), ${css ? `colors = ${config.tokensCss} tokens, ⚠ = off-token / off 4px grid / override` : "⚠ = off 4px grid / override"}.`,
      "",
      "## Text styles",
      ...[...legend].map(([name, key]) => `- ${name}: ${key}`),
      "",
      "## Tree",
    ];
    await writeFile(join(outDir, `${key}.md`), [...header, ...body, ""].join("\n"));
    console.log(`${batch}/specs/${key}.md (${body.length} lines)`);
  }
}
