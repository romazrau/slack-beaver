import "dotenv/config";
import { CenterTaskRepository } from "../center-db/tasks.js";
import { createCenterHttpServer } from "./httpServer.js";
import { loadCenterServerConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadCenterServerConfig();
  const repository = new CenterTaskRepository(config.dbPath);
  const server = createCenterHttpServer({ repository });

  server.listen(config.port, config.host, () => {
    console.log(`Slack Beaver Center Server is running at http://${config.host}:${config.port}`);
  });

  const shutdown = (): void => {
    server.close(() => {
      repository.close();
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
