import { AppError } from "../errors";
export function productId(input: string): string {
  const value = input.trim();
  if (/^[a-z0-9]{12}$/i.test(value)) return value.toUpperCase();
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      throw Error();
    let id: string | undefined;
    if (["xbox.com", "www.xbox.com"].includes(u.hostname))
      id = u.pathname.match(
        /^\/[a-z]{2}-[a-z]{2}\/games\/store\/[^/]+\/([a-z0-9]{12})(?:\/[a-z0-9]{4})?\/?$/i,
      )?.[1];
    if (["microsoft.com", "www.microsoft.com"].includes(u.hostname))
      id =
        u.pathname.match(
          /^\/[a-z]{2}-[a-z]{2}\/p\/[^/]+\/([a-z0-9]{12})\/?$/i,
        )?.[1] ??
        u.pathname.match(
          /^\/[a-z]{2}-[a-z]{2}\/store\/apps\/([a-z0-9]{12})\/?$/i,
        )?.[1];
    if (!id) throw Error();
    return id.toUpperCase();
  } catch {
    throw new AppError(
      "INVALID_PRODUCT",
      "Enter a 12-character product ID or a supported Xbox/Microsoft product URL.",
      400,
    );
  }
}
export function searchQuery(q: string | null) {
  const v = (q ?? "").trim();
  if (v.length < 2 || v.length > 120)
    throw new AppError(
      "INVALID_QUERY",
      "Search must contain 2–120 characters.",
      400,
    );
  return v;
}
