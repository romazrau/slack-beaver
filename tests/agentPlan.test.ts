import { describe, expect, it } from "vitest";
import { validateAgentPlan, type AgentPlan } from "../src/agent/agentPlan.js";
import { buildSupplementalReadToolCalls } from "../src/agent/agentPlanExecutor.js";
import type { AgentToolCallResult } from "../src/agent/toolRegistry.js";

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

describe("buildSupplementalReadToolCalls", () => {
  it("uses an explicit reviewer supplemental cap independent of planner read policy", () => {
    const plan: AgentPlan = {
      intent: "answer_from_sources",
      requiresClarification: false,
      sources: ["local_files"],
      searches: [{ tool: "local_search", query: "TODO owner Priya" }],
      reads: [],
      readPolicy: { maxReads: 0, reason: "Search first." }
    };
    const toolOutputs: AgentToolCallResult[] = [
      {
        callId: "plan_search_1",
        name: "local_search",
        output: JSON.stringify({
          results: [
            { path: "one.md", filename: "one.md", snippet: "TODO owner Priya one" },
            { path: "two.md", filename: "two.md", snippet: "TODO owner Priya two" }
          ]
        }),
        resultCount: 2
      }
    ];

    expect(
      buildSupplementalReadToolCalls({
        plan,
        toolOutputs,
        maxSupplementalReads: 1
      })
    ).toEqual([{ id: "supplemental_read_1", name: "local_file_read", input: { path: "one.md" } }]);
  });

  it("dedupes legacy google_doc_read and google_drive_file_read by Drive file identity", () => {
    const plan: AgentPlan = {
      intent: "answer_from_sources",
      requiresClarification: false,
      sources: ["google_docs"],
      searches: [{ tool: "google_drive_search", query: "planning pdf" }],
      reads: [],
      readPolicy: { maxReads: 0 }
    };
    const toolOutputs: AgentToolCallResult[] = [
      {
        callId: "plan_search_1",
        name: "google_drive_search",
        output: JSON.stringify({
          results: [{ documentId: "drive_pdf_123", name: "Planning PDF", mimeType: "application/pdf" }]
        }),
        resultCount: 1
      },
      {
        callId: "plan_read_1",
        name: "google_doc_read",
        output: JSON.stringify({
          document: { documentId: "drive_pdf_123", title: "Planning PDF", content: "PDF body detail" }
        }),
        resultCount: 1
      }
    ];

    expect(
      buildSupplementalReadToolCalls({
        plan,
        toolOutputs,
        maxSupplementalReads: 3
      })
    ).toEqual([]);
  });
});
