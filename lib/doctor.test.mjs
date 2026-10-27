import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { diagnose, isReady } from "./doctor.mjs";

const READY = {
  nodeMajor: 22,
  chromePath: "/usr/bin/google-chrome",
  isGitRepo: true,
  hasCommit: true,
  hasDevScript: true,
  hasFigmaToken: true,
  envFileState: "ignored",
  snapshotSpec: "ready",
  snapshotFetched: true,
  adapterState: "filled",
  hasWorktreeScript: true,
  rulesMentionPipeline: true,
};

const missing = (facts) => diagnose({ ...READY, ...facts }).filter((finding) => !finding.ok).map((finding) => finding.id);

describe("diagnose", () => {
  it("is ready when every prerequisite is met", () => {
    assert.equal(isReady(diagnose(READY)), true);
  });

  it("does not need the Figma token once the design is already downloaded", () => {
    assert.deepEqual(missing({ hasFigmaToken: false, snapshotFetched: true }), []);
  });

  it("needs the token from the user while the design is not downloaded", () => {
    const [finding] = diagnose({ ...READY, hasFigmaToken: false, snapshotFetched: false }).filter((f) => !f.ok);
    assert.deepEqual([finding.id, finding.who], ["figma-token", "user"]);
  });

  it("flags a token file that git would commit", () => {
    assert.deepEqual(missing({ envFileState: "tracked-or-unignored" }), ["env-ignored"]);
  });

  it("asks the user for frame links while snapshot.json is absent or still the placeholder", () => {
    for (const snapshotSpec of ["missing", "placeholder"]) {
      const finding = diagnose({ ...READY, snapshotSpec }).find((f) => f.id === "snapshot-spec");
      assert.equal(finding.who, "user");
    }
  });

  it("reports problems in the order they should be fixed", () => {
    const ids = diagnose({ ...READY, nodeMajor: 18, adapterState: "template" }).filter((f) => !f.ok).map((f) => f.id);
    assert.deepEqual(ids, ["node", "adapter"]);
  });
});
