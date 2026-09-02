/**
 * Structured JSON logging for the Vector → ClickHouse pipeline.
 *
 * Replaces ad-hoc `console.error("foo:", err)` calls with single-line JSON
 * records that Vector can parse without regex. Levels map to stderr (error,
 * warn) and stdout (info, debug).
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogFields {
  [key: string]: unknown;
}

function emit(level: LogLevel, context: string, fields: LogFields): void {
  const record = { level, context, ...fields };
  const line = JSON.stringify(record);
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

function serializeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

/** Log an error with serialized exception details. */
export function logError(
  context: string,
  err: unknown,
  fields: LogFields = {},
): void {
  emit("error", context, { ...fields, error: serializeError(err) });
}

/** Log a warning. */
export function logWarn(context: string, fields: LogFields = {}): void {
  emit("warn", context, fields);
}

/** Log an informational event. */
export function logInfo(context: string, fields: LogFields = {}): void {
  emit("info", context, fields);
}
