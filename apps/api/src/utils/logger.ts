import { redactMetadata, redactSecrets } from "./security.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

class StructuredLogger {
  private write(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (process.env.NODE_ENV === "test" && level !== "error") {
      return;
    }
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: redactSecrets(message),
      ...(context ? { context: redactMetadata(context) } : {}),
    };
    const serialized = JSON.stringify(entry);
    if (level === "error") {
      console.error(serialized);
    } else if (level === "warn") {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.write("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>) {
    this.write("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.write("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>) {
    this.write("error", message, context);
  }
}

export const logger = new StructuredLogger();
