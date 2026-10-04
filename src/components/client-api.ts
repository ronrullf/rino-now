import type { ApiEnvelope, Comparison } from "@/lib/contracts";
import { BrowserLibrary } from "@/lib/browser-library";
function browserLibrary() {
  if (
    typeof document === "undefined" ||
    document.body.dataset.storage !== "browser"
  )
    return null;
  // Access may itself throw when cookies/site storage are disabled.
  try {
    return new BrowserLibrary(window.localStorage);
  } catch {
    return new BrowserLibrary({
      getItem: () => null,
      setItem: () => {
        throw Error("Storage blocked");
      },
    });
  }
}
async function remote<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  let envelope: ApiEnvelope<T>;
  try {
    envelope = await response.json();
  } catch {
    throw Error("The server could not respond. Please try again shortly.");
  }
  if (!envelope.ok) throw Error(envelope.error.message);
  return envelope.data;
}
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const library = browserLibrary(),
    method = options?.method ?? "GET";
  if (library) {
    if (url === "/api/watchlist" && method === "GET")
      return library.list() as T;
    if (url === "/api/recent" && method === "GET") return library.recent() as T;
    if (
      (url === "/api/watchlist" || url === "/api/recent") &&
      method === "POST"
    ) {
      const id = JSON.parse(String(options?.body)).productId;
      if (typeof id !== "string" || !/^[A-Z0-9]{12}$/.test(id))
        throw Error("Invalid product ID.");
      const c = await remote<Comparison>("/api/products/" + id);
      if (url === "/api/watchlist") library.save(c);
      else library.record(c.product);
      return (
        url === "/api/watchlist" ? { saved: true } : { recorded: true }
      ) as T;
    }
    if (/^\/api\/watchlist\/[A-Z0-9]{12}$/.test(url) && method === "DELETE") {
      library.remove(url.split("/").pop()!);
      return { saved: false } as T;
    }
  }
  const data = await remote<T>(url, options);
  if (
    library &&
    /^\/api\/products\/[A-Z0-9]{12}(?:\/refresh|\?fresh=1)?$/.test(url)
  ) {
    const c = data as Comparison;
    c.saved = library.has(c.product.id);
    if (c.saved) {
      try {
        library.save(c);
      } catch {
        /* Price reads remain usable if storage is full. */
      }
    }
  }
  return data;
}
