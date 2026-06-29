export type CenterServerConfig = {
  host: string;
  port: number;
  dbPath: string;
};

type Env = Record<string, string | undefined>;

const DEFAULT_CENTER_HOST = "127.0.0.1";
const DEFAULT_CENTER_PORT = 4318;
const DEFAULT_CENTER_DB_PATH = "./data/slack-beaver-center.sqlite";

export function loadCenterServerConfig(env: Env = process.env): CenterServerConfig {
  return {
    host: env.CENTER_SERVER_HOST?.trim() || DEFAULT_CENTER_HOST,
    port: parsePort(env.CENTER_SERVER_PORT, DEFAULT_CENTER_PORT),
    dbPath: env.CENTER_DB_PATH?.trim() || DEFAULT_CENTER_DB_PATH
  };
}

function parsePort(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error("CENTER_SERVER_PORT must be an integer between 1 and 65535.");
  }

  return parsed;
}
