import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULTS, parseConfig } from "./config.mjs";

describe("parseConfig", () => {
  it("fills missing keys with defaults", () => {
    assert.deepEqual(parseConfig({ designDir: "docs/design" }), { ...DEFAULTS, designDir: "docs/design" });
  });

  it("rejects unknown keys so a typo does not silently fall back to a default", () => {
    assert.throws(() => parseConfig({ designdir: "x" }), /unknown key "designdir"/);
  });

  it("rejects wrongly typed values", () => {
    assert.throws(() => parseConfig({ siteChrome: "Header" }), /"siteChrome" must be of type array/);
    assert.throws(() => parseConfig({ fontWeights: [] }), /"fontWeights" must be of type object/);
  });
});
