import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = path.resolve("scripts/check-node-version.cjs");

describe("check-node-version", () => {
  it("passes when the current major version is required", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        SLACK_BEAVER_REQUIRED_NODE_MAJOR: process.versions.node.split(".")[0]
      },
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("fails with actionable nvm guidance when the major version is wrong", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        SLACK_BEAVER_REQUIRED_NODE_MAJOR: "999"
      },
      encoding: "utf8"
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Slack Beaver requires Node.js 999.x");
    expect(result.stderr).toContain("nvm use");
    expect(result.stderr).toContain("npm rebuild better-sqlite3");
  });
});
