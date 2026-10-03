import "server-only";
import { config } from "../config";
import { AppError } from "../errors";
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const expected = new URL(config.APP_ORIGIN);
  if (origin !== expected.origin || host !== expected.host)
    throw new AppError(
      "INVALID_ORIGIN",
      "This action must be made from the application.",
      403,
    );
}
