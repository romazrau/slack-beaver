import type { AgentTask, RegisteredAgent } from "../center-db/agentTasks.js";

export type CenterAgentTaskClient = {
  registerAgent(input: RegisterAgentRequest): Promise<RegisteredAgent>;
  heartbeat(agentId: string): Promise<RegisteredAgent>;
  claimTask(input: ClaimTaskRequest): Promise<AgentTask | null>;
  updateTask(id: number, input: UpdateTaskRequest): Promise<AgentTask>;
};

export type RegisterAgentRequest = {
  agentId: string;
  ownerSlackUserId: string;
  displayName?: string;
  capabilities: string[];
};

export type ClaimTaskRequest = {
  agentId: string;
  leaseSeconds?: number;
};

export type UpdateTaskRequest = {
  status: "completed" | "failed";
  resultSummary?: string;
  errorSummary?: string;
  agentId: string;
};

export class HttpCenterAgentTaskClient implements CenterAgentTaskClient {
  constructor(private readonly baseUrl: string) {}

  async registerAgent(input: RegisterAgentRequest): Promise<RegisteredAgent> {
    const response = await this.post<{ agent: RegisteredAgent }>("/agents/register", input);
    return response.agent;
  }

  async heartbeat(agentId: string): Promise<RegisteredAgent> {
    const response = await this.post<{ agent: RegisteredAgent }>(
      `/agents/${encodeURIComponent(agentId)}/heartbeat`,
      {}
    );
    return response.agent;
  }

  async claimTask(input: ClaimTaskRequest): Promise<AgentTask | null> {
    const response = await this.post<{ task: AgentTask | null }>("/agent-tasks/claim", input);
    return response.task;
  }

  async updateTask(id: number, input: UpdateTaskRequest): Promise<AgentTask> {
    const response = await this.patch<{ task: AgentTask }>(`/agent-tasks/${id}`, input);
    return response.task;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  private async request<T>(method: string, path: string, body: unknown): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      method,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as unknown) : null;
    if (!response.ok) {
      const message = getErrorMessage(parsed) ?? `Center Server request failed with ${response.status}.`;
      throw new Error(message);
    }
    return parsed as T;
  }
}

function getErrorMessage(value: unknown): string | undefined {
  if (value && typeof value === "object" && "error" in value && typeof value.error === "string") {
    return value.error;
  }
  return undefined;
}
