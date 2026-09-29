// Static coverage of a check screen against its Figma frame, no browser needed: every content section that
// holds text and every text style of the frame must be mapped at least once, or ignored with a reason.
// Image-only sections (photos, illustrations) are content, not layout, and are left to the screenshot review.

// screen: { frame?, items: [{ node }], ignore?: { [nodeId]: reason } }
// lookup(id) → { node, frame } from the Figma snapshot
// siteChrome: instance name prefixes (Header, Footer) checked on their own screen, not by every page
export function coverageFor(screen, lookup, siteChrome = []) {
  const isChrome = (node) => node.type === "INSTANCE" && siteChrome.some((name) => node.name.startsWith(name));
  const frame = lookup(screen.frame ?? screen.items[0].node).frame;
  if (frame.type !== "FRAME") return null; // component sets (hover/states) have no page sections
  const ignored = new Set(Object.keys(screen.ignore ?? {}));
  const mapped = new Set(screen.items.map((item) => item.node));
  const sections = (frame.children ?? []).filter((child) => child.visible !== false && !isChrome(child) && !ignored.has(child.id));

  const isMapped = (section) => someNode(section, (node) => mapped.has(node.id));
  // Repeated items (cards, rows laid out as siblings) are covered by mapping one of them.
  const isRepeatOfMapped = (section) =>
    sections.some((other) => other !== section && other.name === section.name && sameWidth(other, section) && isMapped(other));
  const missingSections = sections
    .filter((section) => textNodes(section, ignored, isChrome).length > 0)
    .filter((section) => !isMapped(section) && !isRepeatOfMapped(section))
    .map((section) => ({ id: section.id, name: section.name }));

  // A style counts as covered only where its typography is compared (default props or an explicit fontSize).
  const mappedStyles = new Set(
    screen.items
      .filter((item) => !item.props || item.props.includes("fontSize"))
      .map((item) => lookup(item.node).node)
      .filter((node) => node.type === "TEXT")
      .map(styleKey),
  );
  const frameStyles = new Map();
  for (const text of sections.flatMap((section) => textNodes(section, ignored, isChrome))) {
    if (!frameStyles.has(styleKey(text))) frameStyles.set(styleKey(text), text);
  }
  const missingStyles = [...frameStyles]
    .filter(([key]) => !mappedStyles.has(key))
    .map(([key, example]) => ({ style: key, example: example.id, text: example.characters.slice(0, 40) }));

  return {
    frame: frame.id,
    sections: { total: sections.length, missing: missingSections },
    styles: { total: frameStyles.size, missing: missingStyles },
  };
}

function sameWidth(a, b) {
  return Math.abs(a.absoluteBoundingBox.width - b.absoluteBoundingBox.width) <= 1;
}

function textNodes(node, ignored, isChrome) {
  if (node.visible === false || ignored.has(node.id) || isChrome(node)) return [];
  if (node.type === "TEXT") return [node];
  return (node.children ?? []).flatMap((child) => textNodes(child, ignored, isChrome));
}

function someNode(node, predicate) {
  return predicate(node) || (node.children ?? []).some((child) => someNode(child, predicate));
}

function styleKey(text) {
  const style = text.style;
  const paint = (text.fills ?? []).find((fill) => fill.visible !== false && fill.type === "SOLID");
  const color = paint ? "#" + ["r", "g", "b"].map((c) => Math.round(paint.color[c] * 255).toString(16).padStart(2, "0")).join("") : "none";
  return `${style.fontFamily} ${style.fontWeight} ${style.fontSize}/${style.lineHeightPx} ${style.textCase ?? "ORIGINAL"} ${color}`;
}
