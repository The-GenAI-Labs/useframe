type Fields = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", msg: string, fields: Fields): void {
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, fields: Fields = {}) => emit("info", msg, fields),
  warn: (msg: string, fields: Fields = {}) => emit("warn", msg, fields),
  error: (msg: string, fields: Fields = {}) => emit("error", msg, fields),
};

// The repo has no metrics library; metrics are structured log lines that the
// log pipeline can turn into counters/histograms.
export function metric(name: string, value: number, tags: Fields = {}): void {
  emit("info", "metric", { metric: name, value, ...tags });
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
