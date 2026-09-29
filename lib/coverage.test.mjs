import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { coverageFor } from "./coverage.mjs";

const ink = { r: 20 / 255, g: 17 / 255, b: 15 / 255, a: 1 };
const siteChrome = ["Header", "Footer"];

function text(id, fontSize = 16) {
  return {
    id,
    type: "TEXT",
    name: id,
    characters: `text ${id}`,
    fills: [{ type: "SOLID", color: ink }],
    style: { fontFamily: "Inter", fontWeight: 500, fontSize, lineHeightPx: 28 },
  };
}

function box(id, name, width, children) {
  return { id, type: "FRAME", name, absoluteBoundingBox: { x: 0, y: 0, width, height: 10 }, children };
}

const frame = {
  id: "0:1",
  type: "FRAME",
  name: "Page",
  children: [
    { id: "0:2", type: "INSTANCE", name: "Header", children: [text("h:1", 14)] },
    box("1:0", "Title", 1015, [text("1:1", 80)]),
    box("2:0", "Card", 328, [text("2:1")]),
    box("3:0", "Card", 328, [text("3:1")]),
    box("4:0", "Photo", 328, []),
  ],
};

const index = new Map();
(function walk(node) {
  index.set(node.id, { node, frame });
  for (const child of node.children ?? []) walk(child);
})(frame);
const lookup = (id) => index.get(id);

describe("coverageFor", () => {
  it("reports unmapped text sections and text styles, ignoring site chrome and image-only sections", () => {
    const coverage = coverageFor({ frame: "0:1", items: [{ node: "2:1" }] }, lookup, siteChrome);
    assert.deepEqual(coverage.sections.missing.map((section) => section.id), ["1:0"]);
    assert.deepEqual(coverage.styles.missing.map((style) => style.example), ["1:1"]);
  });

  it("requires site chrome to be mapped when it is not configured as chrome", () => {
    const coverage = coverageFor({ frame: "0:1", items: [{ node: "1:1" }, { node: "2:1" }] }, lookup, []);
    assert.deepEqual(coverage.sections.missing.map((section) => section.id), ["0:2"]);
  });

  it("covers repeated siblings with the same name and width through one mapped item", () => {
    const coverage = coverageFor({ frame: "0:1", items: [{ node: "1:1" }, { node: "2:1" }] }, lookup, siteChrome);
    assert.deepEqual(coverage.sections.missing, []);
    assert.deepEqual(coverage.styles.missing, []);
  });

  it("does not count a style as covered when the item skips typography", () => {
    const coverage = coverageFor({ frame: "0:1", items: [{ node: "1:1", props: ["y"] }, { node: "2:1" }] }, lookup, siteChrome);
    assert.deepEqual(coverage.styles.missing.map((style) => style.example), ["1:1"]);
  });

  it("drops ignored sections from sections and styles", () => {
    const coverage = coverageFor({ frame: "0:1", items: [{ node: "2:1" }], ignore: { "1:0": "checked on another screen" } }, lookup, siteChrome);
    assert.deepEqual(coverage.sections.missing, []);
    assert.deepEqual(coverage.styles.missing, []);
  });

  it("skips component-set screens", () => {
    const set = { id: "9:0", type: "COMPONENT_SET", name: "List", children: [] };
    assert.equal(coverageFor({ frame: "9:0", items: [{ node: "9:0" }] }, () => ({ node: set, frame: set })), null);
  });
});
