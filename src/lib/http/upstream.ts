import "server-only";
import { config } from "../config";
import { AppError } from "../errors";
const hosts = new Set([
  "displaycatalog.mp.microsoft.com",
  "api.frankfurter.dev",
  "v6.exchangerate-api.com",
]);
let active = 0;
const queue: Array<() => void> = [];
const failures = new Map<string, number>();
async function acquire() {
  if (active >= 4) await new Promise<void>((r) => queue.push(r));
  else active++;
}
function release() {
  const next = queue.shift();
  if (next) next();
  else active--;
}
export async function upstream(url: string): Promise<unknown> {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    !hosts.has(u.hostname) ||
    u.port ||
    u.username ||
    u.password
  )
    throw new AppError("UNSAFE_PROVIDER", "Unsupported provider address.", 500);
  if ((failures.get(url) ?? 0) > Date.now())
    throw new AppError(
      "PROVIDER_COOLDOWN",
      "Provider is temporarily unavailable. Try again shortly.",
      503,
      true,
    );
  await acquire();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(config.UPSTREAM_TIMEOUT_MS),
        });
      } catch {
        if (attempt === 0) continue;
        failures.set(url, Date.now() + 30000);
        throw new AppError(
          "PROVIDER_NETWORK",
          "Could not reach the provider.",
          503,
          true,
        );
      }
      if (response.ok) {
        try {
          return await response.json();
        } catch {
          throw new AppError(
            "PROVIDER_SHAPE",
            "Provider returned invalid JSON.",
            502,
          );
        }
      }
      if ([429, 500, 502, 503, 504].includes(response.status)) {
        const header = response.headers.get("retry-after");
        const wait = header
          ? Number.isFinite(Number(header))
            ? Number(header) * 1000
            : Date.parse(header) - Date.now()
          : 250;
        if (attempt === 0 && wait >= 0 && wait <= 1000) {
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        failures.set(
          url,
          Date.now() + Math.max(30000, Number.isFinite(wait) ? wait : 0),
        );
        throw new AppError(
          "PROVIDER_UNAVAILABLE",
          "Provider is temporarily unavailable.",
          503,
          true,
        );
      }
      throw new AppError(
        "PROVIDER_HTTP",
        `Provider request failed (${response.status}).`,
        502,
      );
    }
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "Provider is unavailable.",
      503,
      true,
    );
  } finally {
    release();
  }
}
