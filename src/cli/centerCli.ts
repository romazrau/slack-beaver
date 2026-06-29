import "dotenv/config";
import { AgentTaskRepository, AgentTaskValidationError } from "../center-db/agentTasks.js";
import { CenterTaskRepository, TaskValidationError } from "../center-db/tasks.js";
import { loadCenterServerConfig } from "../center-server/config.js";

async function main(argv: string[]): Promise<void> {
  const [command, ...args] = argv;
  const options = parseOptions(args);
  const config = loadCenterServerConfig();
  const repository = new CenterTaskRepository(config.dbPath);
  const agentTaskRepository = new AgentTaskRepository(config.dbPath);

  try {
    if (command === "tasks:list") {
      console.log(JSON.stringify({ tasks: repository.listTasks() }, null, 2));
      return;
    }

    if (command === "tasks:create") {
      const task = repository.createTask({
        title: requireOption(options, "title"),
        description: options.description,
        createdBy: requireOption(options, "created-by"),
        primaryOwner: requireOption(options, "owner"),
        status: options.status as never
      });
      console.log(JSON.stringify({ task }, null, 2));
      return;
    }

    if (command === "tasks:update") {
      const id = Number(requireOption(options, "id"));
      const task = repository.updateTask(id, {
        title: options.title,
        description: options.description,
        status: options.status as never,
        primaryOwner: options.owner
      });

      if (!task) {
        throw new Error(`Task not found: ${id}`);
      }

      console.log(JSON.stringify({ task }, null, 2));
      return;
    }

    if (command === "agents:register") {
      const agent = agentTaskRepository.registerAgent({
        agentId: requireOption(options, "agent-id"),
        ownerSlackUserId: requireOption(options, "owner"),
        displayName: options.name,
        capabilities: parseCsvOption(options.capabilities ?? "answer_question")
      });
      console.log(JSON.stringify({ agent }, null, 2));
      return;
    }

    if (command === "agent-tasks:list") {
      console.log(JSON.stringify({ tasks: agentTaskRepository.listTasks() }, null, 2));
      return;
    }

    if (command === "agent-tasks:create") {
      const task = agentTaskRepository.createTask({
        type: "answer_question",
        createdBy: requireOption(options, "created-by"),
        targetOwner: options.owner,
        input: {
          question: requireOption(options, "question")
        }
      });
      console.log(JSON.stringify({ task }, null, 2));
      return;
    }

    if (command === "agent-tasks:claim") {
      const task = agentTaskRepository.claimNextTask({
        agentId: requireOption(options, "agent-id"),
        leaseSeconds: options["lease-seconds"] ? Number(options["lease-seconds"]) : undefined
      });
      console.log(JSON.stringify({ task: task ?? null }, null, 2));
      return;
    }

    throw new Error(formatUsage());
  } finally {
    repository.close();
    agentTaskRepository.close();
  }
}

function parseOptions(args: string[]): Record<string, string> {
  const options: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${key}`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    options[key.slice(2)] = value;
    index += 1;
  }

  return options;
}

function requireOption(options: Record<string, string>, name: string): string {
  const value = options[name];
  if (!value) {
    throw new Error(`--${name} is required.`);
  }
  return value;
}

function parseCsvOption(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatUsage(): string {
  return [
    "Usage:",
    "  npm run center:tasks:list",
    "  npm run center:tasks:create -- --title \"Follow up\" --created-by U123 --owner U456",
    "  npm run center:tasks:update -- --id 1 --status done",
    "  npm run center:agents:register -- --agent-id local-1 --owner U123",
    "  npm run center:agent-tasks:create -- --question \"What changed?\" --created-by U123 --owner U123",
    "  npm run center:agent-tasks:list",
    "  npm run center:agent-tasks:claim -- --agent-id local-1"
  ].join("\n");
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message =
    error instanceof TaskValidationError || error instanceof AgentTaskValidationError || error instanceof Error
      ? error.message
      : String(error);
  console.error(message);
  process.exitCode = 1;
});
