import "dotenv/config";
import { CenterTaskRepository, TaskValidationError } from "../center-db/tasks.js";
import { loadCenterServerConfig } from "../center-server/config.js";

async function main(argv: string[]): Promise<void> {
  const [command, ...args] = argv;
  const options = parseOptions(args);
  const config = loadCenterServerConfig();
  const repository = new CenterTaskRepository(config.dbPath);

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

    throw new Error(formatUsage());
  } finally {
    repository.close();
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

function formatUsage(): string {
  return [
    "Usage:",
    "  npm run center:tasks:list",
    "  npm run center:tasks:create -- --title \"Follow up\" --created-by U123 --owner U456",
    "  npm run center:tasks:update -- --id 1 --status done"
  ].join("\n");
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof TaskValidationError || error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
