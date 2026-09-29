// Project settings from pixel.config.json in the working directory (or $PIXEL_CONFIG). Every key is optional.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const DEFAULTS = {
  designDir: "design",
  baseUrl: "http://localhost:3000",
  shotDir: "tmp/pixel",
  siteChrome: ["Header", "Footer"],
  fontWeights: {},
  tokensCss: null,
};

const KIND = { designDir: "string", baseUrl: "string", shotDir: "string", siteChrome: "array", fontWeights: "object", tokensCss: "string" };

export async function loadConfig(path = process.env.PIXEL_CONFIG ?? "pixel.config.json") {
  const file = resolve(path);
  if (!existsSync(file)) return { ...DEFAULTS };
  return parseConfig(JSON.parse(await readFile(file, "utf8")), path);
}

export function parseConfig(raw, source = "config") {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${source}: expected a JSON object`);
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in KIND)) throw new Error(`${source}: unknown key "${key}" (known: ${Object.keys(KIND).join(", ")})`);
    if (kindOf(value) !== KIND[key]) throw new Error(`${source}: "${key}" must be of type ${KIND[key]}`);
  }
  return { ...DEFAULTS, ...raw };
}

function kindOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}
