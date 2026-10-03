export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 503,
    public retryable = false,
  ) {
    super(message);
  }
}
export function errorCode(e: unknown) {
  return e instanceof AppError ? e.code : "UPSTREAM_ERROR";
}
