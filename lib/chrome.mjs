import { existsSync } from "node:fs";

const KNOWN_PATHS = ["/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];

export function findChrome() {
  return process.env.CHROME_PATH ?? KNOWN_PATHS.find(existsSync) ?? null;
}
