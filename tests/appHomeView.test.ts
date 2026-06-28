import { describe, expect, it } from "vitest";
import { buildAppHomeView } from "../src/appHomeView.js";
import type { AppConfig } from "../src/config.js";

describe("buildAppHomeView", () => {
  it("shows local agent status without secrets or folder paths", () => {
    const config: AppConfig = {
      slack: {
        socketModeEnabled: true,
        botToken: "xoxb-secret",
        appToken: "xapp-secret"
      },
      localFiles: {
        watchedFolders: ["/Users/example/Documents"],
        denylistFolders: ["/Users/example/.ssh"],
        maxFileBytes: 1024,
        maxResults: 5
      },
      auditLogPath: "./logs/audit.jsonl"
    };

    const view = buildAppHomeView(config);
    const serialized = JSON.stringify(view);

    expect(view.type).toBe("home");
    expect(serialized).toContain("Slack Beaver Local Agent");
    expect(serialized).toContain("find <query>");
    expect(serialized).toContain("Watched folders");
    expect(serialized).not.toContain("xoxb-secret");
    expect(serialized).not.toContain("xapp-secret");
    expect(serialized).not.toContain("/Users/example/Documents");
    expect(serialized).not.toContain("/Users/example/.ssh");
  });
});
