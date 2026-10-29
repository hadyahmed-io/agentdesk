import type { Request, Response, NextFunction } from "express";
import { ZodError, type z, type ZodTypeAny } from "zod";
import { logger } from "../utils/logger.js";
import { redactSecrets } from "../utils/security.js";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BAD_REQUEST"
  | "PROVIDER_ERROR"
  | "FORBIDDEN_WORKSPACE"
  | "INVALID_STATE_TRANSITION"
  | "INTERNAL_ERROR";

export interface ErrorDetail {
  field: string;
  message: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: ErrorDetail[];

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: ErrorDetail[]
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function validateBody<S extends ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw formatZodError(parsed.error);
  }
  return parsed.data;
}

export function validateQuery<S extends ZodTypeAny>(schema: S, query: unknown): z.output<S> {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw formatZodError(parsed.error, "Invalid query parameters.");
  }
  return parsed.data;
}

export function formatZodError(
  error: ZodError,
  message = "The request contains invalid fields."
): AppError {
  const details: ErrorDetail[] = error.issues.map((issue) => ({
    field: issue.path.join(".") || "root",
    message: issue.message,
  }));
  return new AppError(400, "VALIDATION_ERROR", message, details);
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route '${req.method} ${req.originalUrl}' was not found.`,
    },
  });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: redactSecrets(err.message),
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    const formatted = formatZodError(err);
    res.status(formatted.statusCode).json({
      error: {
        code: formatted.code,
        message: formatted.message,
        details: formatted.details,
      },
    });
    return;
  }

  logger.error("Unhandled API exception", {
    method: req.method,
    url: req.originalUrl,
    error: err instanceof Error ? err.message : String(err),
  });

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected internal server error occurred.",
    },
  });
}
