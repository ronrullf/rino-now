import "server-only";
import { ZodError, z } from "zod";
import { AppError } from "./errors";
import { checkOrigin } from "./security/origin";
import { productId } from "./security/inputs";
export async function respond<T>(run: () => Promise<T> | T) {
  try {
    const data = await run();
    return Response.json(
      {
        ok: true,
        data,
        warnings:
          typeof data === "object" && data !== null && "warnings" in data
            ? data.warnings
            : [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const error =
      e instanceof AppError
        ? e
        : e instanceof ZodError || e instanceof SyntaxError
          ? new AppError("INVALID_INPUT", "The request is invalid.", 400)
          : new AppError(
              "INTERNAL_ERROR",
              "The request could not be completed.",
              500,
            );
    return Response.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
      },
      {
        status: error.status,
        headers: {
          "Cache-Control": "no-store",
          ...(error.status === 429 ? { "Retry-After": "30" } : {}),
        },
      },
    );
  }
}
export async function bodyId(request: Request) {
  checkOrigin(request);
  const text = await request.text();
  if (text.length > 2048)
    throw new AppError("INVALID_INPUT", "Request is too large.", 400);
  const body = z
    .object({ productId: z.string().max(500) })
    .strict()
    .parse(JSON.parse(text));
  return productId(body.productId);
}
