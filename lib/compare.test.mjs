import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compareScreen, expectedFor, isFailing, validateCheck } from "./compare.mjs";

const frame = { absoluteBoundingBox: { x: 1000, y: 0, width: 1440, height: 900 } };
const ink = { r: 20 / 255, g: 17 / 255, b: 15 / 255, a: 1 };

function textNode(overrides = {}) {
  return {
    id: "1:1",
    name: "Title",
    type: "TEXT",
    characters: "Latest news",
    absoluteBoundingBox: { x: 1064, y: 100, width: 516, height: 28 },
    fills: [{ type: "SOLID", color: ink }],
    layoutSizingHorizontal: "FIXED",
    style: { fontFamily: "Inter", fontWeight: 500, fontSize: 16, lineHeightPx: 28, letterSpacing: 0, textAlignHorizontal: "LEFT", textCase: "ORIGINAL" },
    ...overrides,
  };
}

function renderedText(overrides = {}) {
  return {
    x: 64,
    y: 100,
    w: 516,
    h: 28,
    textX: 64,
    textW: 300,
    opacity: 1,
    fontFamily: "Inter, Arial",
    fontSize: 16,
    lineHeight: 28,
    letterSpacing: 0,
    fontWeight: 500,
    textTransform: "none",
    text: "Latest news",
    color: "rgba(20, 17, 15, 1)",
    background: "rgba(0, 0, 0, 0)",
    ...overrides,
  };
}

function rowsFor(node, rendered, { faces = [], item = {}, brokenImages, fontWeights } = {}) {
  const items = [{ node: node.id, selector: "h2", expected: expectedFor({ node, frame }, fontWeights), ...item }];
  return compareScreen(items, { faces, results: [rendered], brokenImages });
}

const status = (rows, prop) => rows.find((row) => row.prop === prop)?.status;
const interLoaded = [{ family: "Inter", weight: "500", status: "loaded" }];

describe("validateCheck", () => {
  const check = { screens: [{ name: "desktop", width: 1440, items: [{ node: "1:1", selector: "h2" }] }] };
  const hasNode = (id) => id === "1:1";

  it("rejects an unknown screen instead of passing with nothing checked", () => {
    assert.throws(() => validateCheck(check, { screenName: "nope", hasNode }), /No screen named "nope"/);
  });

  it("rejects screens without items and unknown Figma nodes", () => {
    assert.throws(() => validateCheck({ screens: [{ name: "a", width: 390, items: [] }] }, { hasNode }), /no items/);
    assert.throws(() => validateCheck({ screens: [{ name: "a", width: 390, items: [{ node: "9:9", selector: "p" }] }] }, { hasNode }), /not in snapshot/);
  });

  it("rejects an anchor that is not an item of the same screen", () => {
    const withAnchor = { screens: [{ name: "a", width: 390, items: [{ node: "1:1", selector: "p", anchor: "2:2" }] }] };
    assert.throws(() => validateCheck(withAnchor, { hasNode }), /anchor 2:2/);
  });
});

describe("compareScreen", () => {
  it("passes a matching text node", () => {
    const rows = rowsFor(textNode(), renderedText(), { faces: interLoaded });
    assert.deepEqual(rows.filter((row) => row.status !== "PASS"), []);
  });

  it("keeps layout defects failing when the font file is missing", () => {
    const rows = rowsFor(textNode(), renderedText({ textX: 164, w: 216 }));
    assert.equal(status(rows, "x"), "FAIL");
    assert.equal(status(rows, "w"), "FAIL");
    assert.equal(status(rows, "fontFile"), "WARN");
  });

  it("keeps small fixed-box and left-edge errors failing when the font file is missing", () => {
    const rows = rowsFor(textNode(), renderedText({ textX: 84, w: 496 }));
    assert.equal(status(rows, "x"), "FAIL");
    assert.equal(status(rows, "w"), "FAIL");
  });

  it("downgrades small glyph-width drift to WARN only when the font file is missing", () => {
    const hug = textNode({
      layoutSizingHorizontal: "HUG",
      absoluteBoundingBox: { x: 1322, y: 100, width: 499, height: 28 },
      style: { ...textNode().style, textAlignHorizontal: "CENTER" },
    });
    assert.equal(status(rowsFor(hug, renderedText({ textX: 330, textW: 482 })), "w"), "WARN");
    assert.equal(status(rowsFor(hug, renderedText({ textX: 330, textW: 482 })), "x"), "WARN");
    assert.equal(status(rowsFor(hug, renderedText({ textX: 330, textW: 482 }), { faces: interLoaded }), "w"), "FAIL");
  });

  it("measures hug text without the letter-spacing CSS adds after the last glyph", () => {
    const spaced = textNode({ layoutSizingHorizontal: "HUG", absoluteBoundingBox: { x: 1064, y: 100, width: 115, height: 28 }, style: { ...textNode().style, letterSpacing: 2.7 } });
    assert.equal(status(rowsFor(spaced, renderedText({ textW: 117.7, letterSpacing: 2.7 }), { faces: interLoaded }), "w"), "PASS");
    assert.equal(status(rowsFor(spaced, renderedText({ textW: 122, letterSpacing: 2.7 }), { faces: interLoaded }), "w"), "FAIL");
  });

  it("fails hidden content", () => {
    assert.equal(status(rowsFor(textNode(), renderedText({ opacity: 0 }), { faces: interLoaded }), "opacity"), "FAIL");
  });

  it("fails the screen when an image did not load", () => {
    const rows = rowsFor(textNode(), renderedText(), { faces: interLoaded, brokenImages: ["https://example.com/x.jpg"] });
    assert.equal(rows[0].prop, "image");
    assert.equal(rows[0].status, "FAIL");
  });

  it("reports a pending mismatch as PENDING, failing only in strict mode", () => {
    const rows = rowsFor(textNode(), renderedText({ y: 140 }), { faces: interLoaded, item: { pending: { y: "CMS spacing" } } });
    const row = rows.find((candidate) => candidate.prop === "y");
    assert.equal(row.status, "PENDING");
    assert.equal(isFailing(row, { strict: false }), false);
    assert.equal(isFailing(row, { strict: true }), true);
  });

  it("applies a configured Figma → CSS font weight mapping", () => {
    const display = textNode({ style: { ...textNode().style, fontFamily: "Brand Display", fontWeight: 430 } });
    const rendered = renderedText({ fontFamily: "brandDisplay", fontWeight: 400 });
    const faces = [{ family: "brandDisplay", weight: "400", status: "loaded" }];
    assert.equal(status(rowsFor(display, rendered, { faces }), "fontWeight"), "FAIL");
    const rows = rowsFor(display, rendered, { faces, fontWeights: { "Brand Display": { 430: 400 } } });
    assert.equal(status(rows, "fontWeight"), "PASS");
    assert.equal(status(rows, "fontFile"), "PASS");
  });

  it("accepts CSS uppercase for text typed in capitals in Figma", () => {
    const typedUpper = textNode({ characters: "LATEST NEWS" });
    const rows = rowsFor(typedUpper, renderedText({ textTransform: "uppercase" }), { faces: interLoaded });
    assert.equal(status(rows, "textCase"), "PASS");
  });
});
