import { describe, expect, it } from "vitest";
import { validateAgentPlan } from "../src/agent/agentPlan.js";

describe("validateAgentPlan", () => {
  it("accepts a bounded search and read plan", () => {
    expect(
      validateAgentPlan({
        intent: "answer_from_sources",
        requiresClarification: false,
        clarifyingQuestion: null,
        sources: ["local_files"],
        searches: [{ tool: "local_search", query: "deployment checklist" }],
        reads: [{ tool: "local_file_read", fromSearchIndex: 0 }],
        readPolicy: { maxReads: 1, reason: "Need bounded source content." }
      })
    ).toMatchObject({
      ok: true,
      plan: {
        searches: [{ tool: "local_search", query: "deployment checklist" }],
        reads: [{ tool: "local_file_read", fromSearchIndex: 0 }]
      }
    });
  });

  it("accepts Google Drive search followed by Google Drive file read", () => {
    expect(
      validateAgentPlan({
        intent: "answer_from_sources",
        requiresClarification: false,
        clarifyingQuestion: null,
        sources: ["google_docs"],
        searches: [{ tool: "google_drive_search", query: "置身钉内 14.34.50.pdf" }],
        reads: [{ tool: "google_drive_file_read", fromSearchIndex: 0 }],
        readPolicy: { maxReads: 1, reason: "Need PDF or Doc content from Drive." }
      })
    ).toMatchObject({
      ok: true,
      plan: {
        searches: [{ tool: "google_drive_search", query: "置身钉内 14.34.50.pdf" }],
        reads: [{ tool: "google_drive_file_read", fromSearchIndex: 0 }]
      }
    });
  });

  it("rejects unknown plan fields and read steps that do not match the search tool", () => {
    expect(
      validateAgentPlan({
        intent: "answer_from_sources",
        requiresClarification: false,
        sources: ["local_files"],
        searches: [{ tool: "local_search", query: "deployment checklist" }],
        reads: [{ tool: "gmail_read_message", fromSearchIndex: 0 }],
        readPolicy: { maxReads: 1 },
        shell: "rm -rf"
      })
    ).toMatchObject({
      ok: false,
      reason: "unexpected plan fields: shell"
    });

    expect(
      validateAgentPlan({
        intent: "answer_from_sources",
        requiresClarification: false,
        sources: ["local_files"],
        searches: [{ tool: "local_search", query: "deployment checklist" }],
        reads: [{ tool: "gmail_read_message", fromSearchIndex: 0 }],
        readPolicy: { maxReads: 1 }
      })
    ).toMatchObject({
      ok: false,
      reason: "read tool does not match referenced search tool"
    });
  });

  it("requires a clarifying question for clarification plans", () => {
    expect(
      validateAgentPlan({
        intent: "ask_user",
        requiresClarification: true,
        sources: [],
        searches: [],
        reads: [],
        readPolicy: { maxReads: 0 }
      })
    ).toMatchObject({
      ok: false,
      reason: "clarifyingQuestion is required for clarification plans"
    });
  });
});
