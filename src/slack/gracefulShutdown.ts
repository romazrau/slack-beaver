import type { AppConfig } from "../config/config.js";
import type { RuntimeNoticeKind } from "./runtimeStatus.js";

type ShutdownSlackApp = {
  stop(): Promise<unknown>;
};

type ShutdownLogger = {
  log?: (message: string) => void;
  error?: (message: string) => void;
  info?: (message: string) => void;
  warn?: (message: string) => void;
};

type ShutdownRuntimeNoticeSender<TApp extends ShutdownSlackApp> = (input: {
  app: TApp;
  config: AppConfig;
  kind: RuntimeNoticeKind;
  logger?: ShutdownLogger;
}) => Promise<void>;

type ProcessSignalRegistrar = {
  once(signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): unknown;
};

export function registerGracefulShutdownHandlers<TApp extends ShutdownSlackApp>(input: {
  app: TApp;
  config: AppConfig;
  sendRuntimeNotice: ShutdownRuntimeNoticeSender<TApp>;
  logger?: ShutdownLogger;
  processSignals?: ProcessSignalRegistrar;
  exit?: (code: number) => never | void;
}): void {
  let shuttingDown = false;
  const processSignals = input.processSignals ?? process;
  const exit = input.exit ?? process.exit;
  const logger = input.logger ?? console;

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    logger.log?.(`Received ${signal}. Slack Beaver Local Agent is shutting down.`);
    try {
      await input.sendRuntimeNotice({
        app: input.app,
        config: input.config,
        kind: "offline",
        logger
      });
    } catch (error) {
      logger.error?.(`Unable to send Local Agent offline notice: ${formatError(error)}`);
    }

    try {
      await input.app.stop();
    } catch (error) {
      logger.error?.(`Unable to stop Slack app cleanly: ${formatError(error)}`);
    } finally {
      exit(0);
    }
  }

  processSignals.once("SIGINT", (signal) => {
    void shutdown(signal);
  });
  processSignals.once("SIGTERM", (signal) => {
    void shutdown(signal);
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
