#!/usr/bin/env node
// Mapped Figma check: renders a page in headless Chrome and compares geometry, typography and colors
// of mapped DOM elements with the frozen Figma snapshot (<designDir>/*/nodes.json). Expected values are
// read from Figma, never typed by hand; a check file only maps Figma node ids to CSS selectors.
// Not a pixel diff: images, SVG shapes, shadows and unmapped elements need the screenshot review.
// Usage:
//   pixel-check <check.json>... [--screen <name>] [--all] [--strict] [--base http://localhost:3000]
//   pixel-check <check.json>... --coverage          static: unmapped sections / text styles, no browser
//   pixel-check --tree <frameOrNodeId> [--depth 4]     list node ids to map
// Format and procedure: docs/workflow.md
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { compareScreen, expectedFor, isFailing, round, validateCheck } from "../lib/compare.mjs";
import { loadConfig } from "../lib/config.mjs";
import { coverageFor } from "../lib/coverage.mjs";

// Headless Chrome reports no hover-capable pointer, so styles behind @media (hover: hover) (Tailwind v4 hover:) never apply.
const HOVER_POINTER = "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4";

const args = parseArgs(process.argv.slice(2));
const config = await loadConfig();
const designDir = resolve(config.designDir);
const nodes = await indexNodes(designDir);

if (args.tree) {
  printTree(args.tree, Number(args.depth ?? 4));
  process.exit(0);
}
if (args._.length === 0) {
  console.error("Usage: pixel-check <check.json>... [--screen name] [--all] [--strict] [--coverage] [--base url] | --tree <nodeId>");
  process.exit(2);
}

const strict = Boolean(args.strict);
const runs = [];
try {
  for (const file of args._) {
    const check = JSON.parse(await readFile(file, "utf8"));
    const hasScreen = !args.screen || check.screens?.some((screen) => screen.name === args.screen);
    if (hasScreen) runs.push({ file, check, screens: validateCheck(check, { screenName: args.screen, hasNode: (id) => nodes.has(id) }) });
  }
  if (runs.length === 0) throw new Error(`No screen named "${args.screen}" in ${args._.join(", ")}`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

if (args.coverage) process.exit(reportCoverage(runs) > 0 ? 1 : 0);

const chrome = await launchChrome();
let failed = 0;

try {
  for (const { file, check, screens } of runs) {
    console.log(`\n# ${file}`);
    for (const screen of screens) {
      const rows = await runScreen(chrome.page, check, screen);
      failed += rows.filter((row) => isFailing(row, { strict })).length;
      report(screen, rows);
    }
  }
} finally {
  await chrome.close();
}
console.log(
  `\n${failed > 0 ? "FAILED" : "PASSED"}: mapped Figma checks${strict ? " (strict: PENDING and WARN fail)" : ""}. ` +
    "Not a pixel diff — compare the screenshots with the Figma PNGs.",
);
process.exit(failed > 0 ? 1 : 0);

// ---------- Figma snapshot ----------

async function indexNodes(dir) {
  const index = new Map();
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name, "nodes.json");
    if (!entry.isDirectory() || !existsSync(file)) continue;
    const snapshot = JSON.parse(await readFile(file, "utf8"));
    for (const { document } of Object.values(snapshot.nodes ?? {})) {
      if (document) walk(document, document, index);
    }
  }
  if (index.size === 0) throw new Error(`No Figma nodes found in ${dir}`);
  return index;
}

function walk(node, frame, index) {
  if (!index.has(node.id)) index.set(node.id, { node, frame });
  for (const child of node.children ?? []) walk(child, frame, index);
}

function lookup(id) {
  const entry = nodes.get(id);
  if (!entry) throw new Error(`Figma node ${id} not in snapshot (${designDir})`);
  return entry;
}

function printTree(id, depth) {
  const { node, frame } = lookup(id);
  const origin = frame.absoluteBoundingBox;
  const lines = [];
  (function print(current, level) {
    if (current.visible === false || level > depth) return;
    const box = current.absoluteBoundingBox;
    const geometry = box ? `${round(box.width)}×${round(box.height)} @${round(box.x - origin.x)},${round(box.y - origin.y)}` : "";
    const text = current.type === "TEXT" ? ` ${current.style.fontSize}/${current.style.lineHeightPx} "${current.characters.slice(0, 50)}"` : "";
    lines.push(`${"  ".repeat(level)}${current.id} ${current.type} "${current.name}" ${geometry}${text}`);
    for (const child of current.children ?? []) print(child, level + 1);
  })(node, 0);
  console.log(`frame ${frame.id} "${frame.name}"\n${lines.join("\n")}`);
}

async function referencePng(frameId) {
  for (const batch of await readdir(designDir, { withFileTypes: true })) {
    const specDir = join(designDir, batch.name, "specs");
    if (!batch.isDirectory() || !existsSync(specDir)) continue;
    for (const spec of await readdir(specDir)) {
      const head = (await readFile(join(specDir, spec), "utf8")).split("\n", 1)[0];
      const png = join(designDir, batch.name, "frames", `${basename(spec, ".md")}.png`);
      if (head.includes(`#${frameId})`) && existsSync(png)) return png;
    }
  }
  return null;
}

// ---------- Browser ----------

async function launchChrome() {
  const binary = process.env.CHROME_PATH ?? ["/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
  if (!binary) throw new Error("Chrome not found; set CHROME_PATH");
  const profile = await mkdtemp(join(tmpdir(), "pixel-check-"));
  const proc = spawn(binary, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-port=0", `--user-data-dir=${profile}`, HOVER_POINTER, "about:blank"], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  const browserUrl = await new Promise((resolveUrl, reject) => {
    let log = "";
    proc.stderr.on("data", (chunk) => {
      log += chunk;
      const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) resolveUrl(match[1]);
    });
    proc.on("exit", (code) => reject(new Error(`Chrome exited (${code}): ${log.slice(-500)}`)));
    setTimeout(() => reject(new Error("Chrome did not start in 15s")), 15000);
  });
  const target = await (await fetch(`http://127.0.0.1:${new URL(browserUrl).port}/json/new?about:blank`, { method: "PUT" })).json();
  const page = await connect(target.webSocketDebuggerUrl);
  await page.send("Page.enable");
  return {
    page,
    close: async () => {
      page.close();
      const exited = new Promise((done) => proc.once("exit", done));
      proc.kill();
      await exited;
      await rm(profile, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}

function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const waiters = new Map();
  let lastId = 0;
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const call = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) call.reject(new Error(`${call.method}: ${message.error.message}`));
      else call.resolve(message.result);
      return;
    }
    const resolvers = waiters.get(message.method) ?? [];
    waiters.delete(message.method);
    for (const resolveEvent of resolvers) resolveEvent(message.params);
  };
  const send = (method, params = {}) =>
    new Promise((resolveCall, reject) => {
      lastId += 1;
      pending.set(lastId, { method, resolve: resolveCall, reject });
      socket.send(JSON.stringify({ id: lastId, method, params }));
    });
  const next = (method) => new Promise((resolveEvent) => waiters.set(method, [...(waiters.get(method) ?? []), resolveEvent]));
  return new Promise((resolveSocket, reject) => {
    socket.onopen = () => resolveSocket({ send, next, close: () => socket.close() });
    socket.onerror = () => reject(new Error(`Cannot connect to Chrome at ${url}`));
  });
}

async function evaluate(page, expression) {
  const result = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function runScreen(page, check, screen) {
  const base = args.base ?? check.base ?? config.baseUrl;
  await page.send("Emulation.setDeviceMetricsOverride", { width: screen.width, height: screen.height ?? 900, deviceScaleFactor: 1, mobile: false });
  await page.send("Emulation.setScrollbarsHidden", { hidden: true });
  const url = new URL((screen.path ?? check.path) + (screen.query ?? ""), base).href;
  // A hash-only change is a same-document navigation that never fires a load event.
  if (url.includes("#")) {
    const blank = page.next("Page.loadEventFired");
    await page.send("Page.navigate", { url: "about:blank" });
    await blank;
  }
  const loaded = page.next("Page.loadEventFired");
  await page.send("Page.navigate", { url });
  await loaded;
  const loadedPage = await evaluate(page, `(${settlePage})(true)`);
  if (loadedPage.width !== screen.width) throw new Error(`${screen.name}: layout width ${loadedPage.width}, expected ${screen.width}`);
  let brokenImages = loadedPage.brokenImages;
  if (screen.actions?.length) {
    for (const action of screen.actions) await act(page, action);
    ({ brokenImages } = await evaluate(page, `(${settlePage})(false)`));
  }

  const items = screen.items.map((item) => ({ ...item, expected: expectedFor(lookup(item.node), config.fontWeights) }));
  const measured = await evaluate(page, `(${measureInPage})(${JSON.stringify(items.map(({ selector, index }) => ({ selector, index })))})`);
  const rows = compareScreen(items, { ...measured, brokenImages });
  await screenshot(page, screen);
  return rows;
}

async function settlePage(isFirstLoad) {
  await document.fonts.ready;
  if (isFirstLoad) {
    for (const image of document.images) image.loading = "eager";
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((done) => setTimeout(done, 300));
    window.scrollTo(0, 0);
  }
  await Promise.all(
    [...document.images].map((image) =>
      image.complete ? null : new Promise((done) => (image.addEventListener("load", done), image.addEventListener("error", done), setTimeout(done, 10000))),
    ),
  );
  // Client components (URL-driven tabs, hydration) keep changing the DOM after load: wait for 500ms of quiet.
  await new Promise((done) => {
    let timer = setTimeout(finish, 500);
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(finish, 500);
    });
    const deadline = setTimeout(finish, 10000);
    function finish() {
      observer.disconnect();
      clearTimeout(deadline);
      done();
    }
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  const brokenImages = [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.currentSrc || image.src);
  return { width: document.documentElement.clientWidth, brokenImages };
}

function measureInPage(targets) {
  // Computed colors can be oklab()/color-mix() (Tailwind v4 opacity); a 1×1 canvas normalises any CSS color to rgba.
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const toRgba = (css) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "rgba(0, 0, 0, 0)";
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 100) / 100})`;
  };
  const faces = [...document.fonts].map((face) => ({ family: face.family.replace(/["']/g, ""), weight: face.weight, status: face.status }));
  const results = targets.map(({ selector, index = 0 }) => {
    const element = document.querySelectorAll(selector)[index];
    if (!element) return null;
    const box = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const glyphs = range.getBoundingClientRect();
    const text = glyphs.width || glyphs.height ? glyphs : box;
    const style = getComputedStyle(element);
    let opacity = style.visibility === "hidden" ? 0 : 1;
    for (let node = element; node instanceof Element; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    return {
      opacity,
      x: box.left + scrollX,
      y: box.top + scrollY,
      w: box.width,
      h: box.height,
      textX: text.left + scrollX,
      textW: text.width,
      fontFamily: style.fontFamily,
      fontSize: parseFloat(style.fontSize),
      lineHeight: style.lineHeight === "normal" ? null : parseFloat(style.lineHeight),
      letterSpacing: style.letterSpacing === "normal" ? 0 : parseFloat(style.letterSpacing),
      fontWeight: Number(style.fontWeight),
      textTransform: style.textTransform,
      text: element.innerText,
      color: toRgba(style.color),
      background: toRgba(style.backgroundColor),
    };
  });
  return { faces, results };
}

async function act(page, action) {
  if (action.wait) return new Promise((done) => setTimeout(done, action.wait));
  if (action.type) return setFieldValue(page, action.type, "input");
  if (action.select) return setFieldValue(page, action.select, "select");
  const selector = action.click ?? action.hover;
  const point = await evaluate(
    page,
    `(async () => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const before = el.getBoundingClientRect();
      if (before.top < 0 || before.bottom > innerHeight) el.scrollIntoView({ block: "center" });
      await new Promise((done) => setTimeout(done, 500)); // smooth-scroll libraries move the page after scrollIntoView
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`,
  );
  if (!point) throw new Error(`Action target not found: ${selector}`);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  if (action.click) {
    for (const type of ["mousePressed", "mouseReleased"]) await page.send("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 });
  }
  await new Promise((done) => setTimeout(done, 300));
}

// Types into an input/textarea or picks a <select> option, through React's tracked value setter so a
// controlled field's onChange fires (setting .value directly does not). Used by form "filled" screens.
async function setFieldValue(page, { selector, value }, eventType) {
  const ok = await evaluate(
    page,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), "value")?.set;
      if (setter) setter.call(el, ${JSON.stringify(value)});
      else el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event(${JSON.stringify(eventType === "select" ? "change" : "input")}, { bubbles: true }));
      return true;
    })()`,
  );
  if (!ok) throw new Error(`Action target not found: ${selector}`);
  await new Promise((done) => setTimeout(done, 100));
}

async function screenshot(page, screen) {
  const height = await evaluate(page, "document.documentElement.scrollHeight");
  const { data } = await page.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: screen.width, height, scale: 1 },
  });
  await mkdir(config.shotDir, { recursive: true });
  screen.shot = join(config.shotDir, `${screen.name}.png`);
  screen.reference = await referencePng(screen.frame ?? lookup(screen.items[0].node).frame.id);
  await writeFile(screen.shot, Buffer.from(data, "base64"));
}

// ---------- Output ----------

function reportCoverage(runs) {
  let gaps = 0;
  for (const { file, screens } of runs) {
    console.log(`\n# ${file}`);
    for (const screen of screens) {
      const coverage = coverageFor(screen, lookup, config.siteChrome);
      if (!coverage) {
        console.log(`## ${screen.name} — state screen (component), no page coverage`);
        continue;
      }
      const { sections, styles } = coverage;
      gaps += sections.missing.length + styles.missing.length;
      console.log(`## ${screen.name} — sections ${sections.total - sections.missing.length}/${sections.total}, text styles ${styles.total - styles.missing.length}/${styles.total}`);
      for (const section of sections.missing) console.log(`- unmapped section ${section.id} "${section.name}" (map a node inside it, or add it to "ignore" with a reason)`);
      for (const style of styles.missing) console.log(`- unmapped text style ${style.style}, e.g. ${style.example} "${style.text}"`);
    }
  }
  console.log(`\n${gaps > 0 ? "FAILED" : "PASSED"}: coverage${gaps > 0 ? `, ${gaps} gap(s)` : ""}.`);
  return gaps;
}

function report(screen, rows) {
  const count = (status) => rows.filter((row) => row.status === status).length;
  const counts = ["PASS", "FAIL", "PENDING", "WARN", "SKIP"].map((status) => `${count(status)} ${status.toLowerCase()}`).join(", ");
  console.log(`\n## ${screen.name} (${screen.width}px) — ${counts}`);
  console.log(`screenshot: ${screen.shot}${screen.reference ? `\nreference:  ${screen.reference}` : ""}`);
  const shown = args.all ? rows : rows.filter((row) => row.status !== "PASS");
  if (shown.length === 0) return;
  console.log("\n| status | node | prop | expected | actual | Δ | note |\n|---|---|---|---|---|---|---|");
  for (const row of shown) {
    console.log(`| ${row.status} | ${row.label} | ${row.prop} | ${row.expected ?? ""} | ${row.actual ?? ""} | ${row.delta ?? ""} | ${row.note ?? ""} |`);
  }
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) parsed._.push(argv[i]);
    else if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) parsed[argv[i].slice(2)] = true;
    else parsed[argv[i].slice(2)] = argv[(i += 1)];
  }
  return parsed;
}
