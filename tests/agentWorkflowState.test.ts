import { describe, expect, it } from "vitest";
import {
  buildPendingMutationWorkflowState,
  buildRetrievalWorkflowState
} from "../src/agent/agentWorkflowState.js";
import type { AgentToolCallResult } from "../src/agent/toolRegistry.js";

describe("agent workflow state", () => {
  it("summarizes retrieval evidence and candidate sources", () => {
    const toolOutputs: AgentToolCallResult[] = [
      {
        callId: "search_1",
        name: "local_search",
        output: JSON.stringify({
          results: [{ path: "/allowed/article.md", title: "AI transformation notes" }]
        }),
        resultCount: 1
      },
      {
        callId: "read_1",
        name: "local_file_read",
        output: JSON.stringify({
          file: {
            path: "/allowed/article.md",
            filename: "article.md",
            content: "AI transformation notes",
            truncated: false
          }
        }),
        resultCount: 1
      },
      {
        callId: "read_2",
        name: "gmail_read_message",
        output: JSON.stringify({
          message: {
            messageId: "gmail-1",
            subject: "AI transformation notes",
            sender: "writer@example.com",
            date: "2026-06-30",
            snippet: "AI transformation notes",
            bodyText: "AI transformation notes"
          }
        }),
        resultCount: 1
      },
      {
        callId: "read_3",
        name: "google_drive_file_read",
        output: JSON.stringify({
          document: {
            documentId: "drive-1",
            title: "AI transformation notes",
            mimeType: "application/vnd.google-apps.document",
            content: "AI transformation notes"
          }
        }),
        resultCount: 1
      }
    ];

    const state = buildRetrievalWorkflowState({
      workflowId: "trace-1",
      status: "completed",
      userGoal: "Find an AI article",
      toolOutputs
    });

    expect(state).toMatchObject({
      workflowId: "trace-1",
      taskKind: "retrieve_answer",
      status: "completed",
      sourcesSearched: ["local_files (1 result(s))"],
      candidateSources: ["local_files: AI transformation notes"],
      selectedCandidateIds: ["/allowed/article.md", "gmail-1", "drive-1"],
      evidenceSummary: "4 tool result(s) returned configured-source evidence."
    });
  });

  it("represents future file mutations as awaiting confirmation", () => {
    const state = buildPendingMutationWorkflowState({
      workflowId: "trace-2",
      taskKind: "write_file",
      userGoal: "Create a research note",
      pendingAction: "Write docs/research/ai-impact.md"
    });

    expect(state).toMatchObject({
      workflowId: "trace-2",
      taskKind: "write_file",
      status: "awaiting_confirmation",
      pendingAction: "Write docs/research/ai-impact.md",
      nextUserActions: ["Confirm the proposed file action before execution."]
    });
  });
});
