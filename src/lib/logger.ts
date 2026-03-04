type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const minLevel: Level =
  (process.env.LOG_LEVEL as Level | undefined) ?? "info";

function log(level: Level, msg: string, data?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[minLevel]) return;

  const ts = new Date().toISOString();
  const prefix = `[${ts}] ${level.toUpperCase().padEnd(5)}`;
  const line = data
    ? `${prefix} ${msg} ${JSON.stringify(data)}`
    : `${prefix} ${msg}`;

  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) =>
    log("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) =>
    log("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) =>
    log("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) =>
    log("error", msg, data),
};
