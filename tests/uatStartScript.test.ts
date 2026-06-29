import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const nodeBin = process.execPath;
const scriptPath = path.join(repoRoot, "scripts", "uat-start.cjs");

describe("UAT startup script", () => {
  it("prints usage for an unknown mode", () => {
    const result = spawnSync(nodeBin, [scriptPath, "unknown"], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage: node scripts/uat-start.cjs <first|resume|reset>");
  });

  it("supports a dry-run resume path without starting the Local Agent", () => {
    const result = spawnSync(nodeBin, [scriptPath, "resume"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        UAT_DRY_RUN: "true"
      }
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Slack Beaver UAT startup: resume");
    expect(result.stdout).toContain("Dry run: would start Local Agent");
  });
});
