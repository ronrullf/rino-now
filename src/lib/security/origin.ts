import "server-only";
import { config, serverless, deploymentOrigins } from "../config";
import { AppError } from "../errors";
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const allowed = [
    new URL(config.APP_ORIGIN).origin,
    ...(serverless ? deploymentOrigins : []),
  ];
  if (!origin || !allowed.includes(origin) || host !== new URL(origin).host)
    throw new AppError(
      "INVALID_ORIGIN",
      "This action must be made from the application.",
      403,
    );
}
