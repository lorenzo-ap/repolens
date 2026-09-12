import type { ErrorCode } from "@repolens/shared";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Sign in to continue") {
    super("unauthorized", 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super("forbidden", 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Resource") {
    super("not_found", 404, `${what} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super("conflict", 409, message, details);
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown, message = "Request validation failed") {
    super("validation_failed", 400, message, details);
  }
}

export class LimitExceededError extends AppError {
  constructor(message: string) {
    super("limit_exceeded", 422, message);
  }
}

export class GitHubApiError extends AppError {
  constructor(
    message: string,
    public readonly githubStatus: number,
  ) {
    super(
      "github_error",
      githubStatus === 401 ? 401 : githubStatus === 403 ? 403 : githubStatus === 404 ? 404 : 502,
      message,
    );
  }
}
