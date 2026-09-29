// Pure part of the pixel check: Figma node → expected values, measured DOM → report rows.
// No browser or file access here, so the rules are unit-tested (compare.test.mjs).

export const TOLERANCE = { px: 1, textWidth: 2, letterSpacing: 0.05, font: 0.5, channel: 2 };

// A fallback font changes glyph widths by a few percent; anything larger is a layout defect.
const FALLBACK_FONT_SLACK = { px: 4, ratio: 0.08 };

export function validateCheck(check, { screenName, hasNode }) {
  if (!Array.isArray(check.screens) || check.screens.length === 0) throw new Error("Check file has no screens");
  const screens = check.screens.filter((screen) => !screenName || screen.name === screenName);
  if (screens.length === 0) throw new Error(`No screen named "${screenName}"`);
  for (const screen of screens) {
    if (!screen.name || !screen.width) throw new Error(`Screen needs name and width: ${JSON.stringify(screen).slice(0, 80)}`);
    if (!Array.isArray(screen.items) || screen.items.length === 0) throw new Error(`${screen.name}: no items to check`);
    const itemNodes = new Set(screen.items.map((item) => item.node));
    for (const item of screen.items) {
      if (!item.node || !item.selector) throw new Error(`${screen.name}: item needs node and selector`);
      if (!hasNode(item.node)) throw new Error(`${screen.name}: Figma node ${item.node} not in snapshot`);
      if (item.anchor && !itemNodes.has(item.anchor)) throw new Error(`${screen.name}: anchor ${item.anchor} of ${item.node} is not an item of this screen`);
      if (item.props?.length === 0) throw new Error(`${screen.name}: ${item.node} has empty props`);
    }
  }
  return screens;
}

// fontWeights: { [fontFamily]: { [figmaWeight]: cssWeight } } for font files whose weight differs from Figma's.
export function expectedFor({ node, frame }, fontWeights = {}) {
  const box = node.absoluteBoundingBox;
  const origin = frame.absoluteBoundingBox;
  const expected = { name: node.name, type: node.type, x: box.x - origin.x, y: box.y - origin.y, w: box.width, h: box.height, opacity: node.opacity ?? 1 };
  const fill = solidFill(node.fills);
  if (node.type !== "TEXT") return fill ? { ...expected, background: fill } : expected;
  const style = node.style;
  return {
    ...expected,
    isHug: node.layoutSizingHorizontal === "HUG" || style.textAutoResize === "WIDTH_AND_HEIGHT",
    isLeftAligned: style.textAlignHorizontal === "LEFT",
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    lineHeight: style.lineHeightPx,
    letterSpacing: style.letterSpacing ?? 0,
    fontWeight: fontWeights[style.fontFamily]?.[style.fontWeight] ?? style.fontWeight,
    textCase: style.textCase ?? "ORIGINAL",
    isTypedUpper: node.characters === node.characters.toUpperCase(),
    color: fill,
  };
}

function solidFill(fills) {
  const paint = (fills ?? []).find((fill) => fill.visible !== false && fill.type === "SOLID");
  if (!paint) return null;
  const { r, g, b, a = 1 } = paint.color;
  return { r: r * 255, g: g * 255, b: b * 255, a: a * (paint.opacity ?? 1) };
}

// items: [{ node, selector, expected, anchor?, props?, skip?, pending?, optional? }]
// measured: { faces, results (same order as items, null when not found), brokenImages }
export function compareScreen(items, { faces, results, brokenImages = [] }) {
  const byNode = new Map(items.map((item, i) => [item.node, { expected: item.expected, actual: results[i] }]));
  const imageRows = brokenImages.map((src) => ({ label: "page", prop: "image", expected: "loaded", actual: `broken: ${src}`, status: "FAIL" }));
  return imageRows.concat(
    items.flatMap((item, i) => {
      const actual = results[i];
      const label = `${item.node} ${item.expected.name}`.slice(0, 48);
      if (!actual) return [{ label, prop: "selector", expected: item.selector, actual: "not found", status: item.optional ? "SKIP" : "FAIL" }];
      const anchor = item.anchor ? byNode.get(item.anchor) : null;
      if (anchor && !anchor.actual) return [{ label, prop: "anchor", expected: item.anchor, actual: "anchor element not found", status: "FAIL" }];
      const hasFontFile = item.expected.type !== "TEXT" || compareProp("fontFile", item.expected, actual, null, faces).status === "PASS";
      return propsFor(item).map((prop) => {
        let row = compareProp(prop, item.expected, actual, anchor, faces);
        if (!hasFontFile && row.status === "FAIL" && dependsOnGlyphWidths(prop, item.expected) && isWithinFallbackSlack(row, item.expected)) {
          row = { ...row, status: "WARN", note: "font file missing: glyph widths differ" };
        }
        const shown = anchor && ["x", "y", "gapY"].includes(prop) ? `${prop} (from ${item.anchor})` : prop;
        if (item.skip?.[prop]) return { label, prop: shown, ...row, status: "SKIP", note: item.skip[prop] };
        if (item.pending?.[prop] && row.status !== "PASS") return { label, prop: shown, ...row, status: "PENDING", note: item.pending[prop] };
        return { label, prop: shown, ...row };
      });
    }),
  );
}

export function isFailing(row, { strict }) {
  return row.status === "FAIL" || (strict && (row.status === "PENDING" || row.status === "WARN"));
}

// Only hug-width text changes size with the font: its width, and its x when it is centred or right-aligned.
// Fixed boxes and left edges do not move with glyph widths, so they keep failing.
function dependsOnGlyphWidths(prop, expected) {
  if (expected.type !== "TEXT" || !expected.isHug) return false;
  return prop === "w" || (prop === "x" && !expected.isLeftAligned);
}

function isWithinFallbackSlack(row, expected) {
  return Math.abs(row.delta) <= Math.max(FALLBACK_FONT_SLACK.px, expected.w * FALLBACK_FONT_SLACK.ratio);
}

function propsFor({ expected, props }) {
  if (props) return props;
  if (expected.type !== "TEXT") return ["x", "y", "w", "h", "opacity", ...(expected.background ? ["background"] : [])];
  return ["x", "y", "w", "h", "opacity", "fontFamily", "fontSize", "lineHeight", "letterSpacing", "fontWeight", "fontFile", "textCase", ...(expected.color ? ["color"] : [])];
}

// Hug-width and left-aligned text are measured by their glyph box (padding counts), other elements by their border box.
function measuresGlyphs(expected) {
  return expected.type === "TEXT" && (expected.isHug || expected.isLeftAligned);
}

function compareProp(prop, expected, actual, anchor, faces) {
  switch (prop) {
    case "x":
    case "y": {
      const measure = (e, a) => (prop === "x" && measuresGlyphs(e) ? a.textX : a[prop]);
      const want = expected[prop] - (anchor ? anchor.expected[prop] : 0);
      const got = measure(expected, actual) - (anchor ? measure(anchor.expected, anchor.actual) : 0);
      return numeric(want, got, TOLERANCE.px);
    }
    case "gapY": {
      if (!anchor) throw new Error("gapY needs an anchor");
      return numeric(expected.y - (anchor.expected.y + anchor.expected.h), actual.y - (anchor.actual.y + anchor.actual.h), TOLERANCE.px);
    }
    case "w":
      // CSS letter-spacing also follows the last glyph; Figma's hug width stops at it.
      return expected.type === "TEXT" && expected.isHug
        ? numeric(expected.w, actual.textW - actual.letterSpacing, TOLERANCE.textWidth)
        : numeric(expected.w, actual.w, TOLERANCE.px);
    case "h":
      return numeric(expected.h, actual.h, TOLERANCE.px);
    case "opacity":
      return numeric(expected.opacity, actual.opacity, 0.02);
    case "fontSize":
    case "lineHeight":
      return numeric(expected[prop], actual[prop], TOLERANCE.font);
    case "letterSpacing":
      return numeric(expected.letterSpacing, actual.letterSpacing, TOLERANCE.letterSpacing);
    case "fontWeight":
      return numeric(expected.fontWeight, actual.fontWeight, 0);
    case "fontFamily": {
      const rendered = actual.fontFamily.split(",")[0];
      return { expected: expected.fontFamily, actual: rendered, status: squash(rendered).includes(squash(expected.fontFamily)) ? "PASS" : "FAIL" };
    }
    case "fontFile": {
      const hasFile = faces.some(
        (face) => face.status === "loaded" && squash(face.family).includes(squash(expected.fontFamily)) && weightCovers(face.weight, expected.fontWeight),
      );
      return { expected: `${expected.fontFamily} ${expected.fontWeight} loaded`, actual: hasFile ? "loaded" : "no file, browser falls back", status: hasFile ? "PASS" : "WARN" };
    }
    case "textCase": {
      const isUpper = actual.textTransform === "uppercase" || actual.text === actual.text.toUpperCase();
      const ok =
        expected.textCase === "UPPER" ? isUpper : expected.textCase === "ORIGINAL" ? actual.textTransform === "none" || (expected.isTypedUpper && isUpper) : true;
      return { expected: expected.textCase, actual: actual.textTransform, status: ok ? "PASS" : "FAIL" };
    }
    case "color":
      return colorRow(expected.color, actual.color);
    case "background":
      return colorRow(expected.background, actual.background);
    default:
      throw new Error(`Unknown prop ${prop}`);
  }
}

function numeric(want, got, tolerance) {
  const delta = got - want;
  return { expected: round(want), actual: round(got), delta: round(delta), status: Math.abs(delta) <= tolerance ? "PASS" : "FAIL" };
}

function colorRow(want, gotCss) {
  if (!want) return { expected: "none", actual: gotCss, status: "FAIL" };
  const got = parseCssColor(gotCss);
  const ok = got && ["r", "g", "b"].every((c) => Math.abs(got[c] - want[c]) <= TOLERANCE.channel) && Math.abs(got.a - want.a) <= 0.02;
  return { expected: formatColor(want), actual: got ? formatColor(got) : gotCss, status: ok ? "PASS" : "FAIL" };
}

function parseCssColor(value) {
  const match = value.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
  return match ? { r: +match[1], g: +match[2], b: +match[3], a: match[4] === undefined ? 1 : +match[4] } : null;
}

function formatColor({ r, g, b, a }) {
  const hex = "#" + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
  return a < 1 ? `${hex}/${Math.round(a * 100)}%` : hex;
}

function weightCovers(faceWeight, weight) {
  const [min, max = min] = String(faceWeight).split(" ").map(Number);
  return weight >= min && weight <= max;
}

function squash(value) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

export function round(value) {
  return Math.round(value * 100) / 100;
}
