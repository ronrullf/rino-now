import { afterEach, it, expect, vi } from "vitest";
import { upstream } from "../src/lib/http/upstream";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("rejects arbitrary upstream hosts before making a request", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(upstream("https://evil.example/catalog")).rejects.toMatchObject({
    code: "UNSAFE_PROVIDER",
  });
  expect(fetch).not.toHaveBeenCalled();
});
it("retries a transient failure once and blocks redirects", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(Error("network"))
    .mockResolvedValueOnce(Response.json({ Products: [] }));
  vi.stubGlobal("fetch", fetch);
  expect(
    await upstream("https://displaycatalog.mp.microsoft.com/test-retry"),
  ).toEqual({ Products: [] });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][1].redirect).toBe("error");
});
it("does not retry normal not-found responses", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
  vi.stubGlobal("fetch", fetch);
  await expect(
    upstream("https://displaycatalog.mp.microsoft.com/test-404"),
  ).rejects.toMatchObject({ code: "PROVIDER_HTTP" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("honors long Retry-After across subsequent requests without sleeping past the request budget", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response("", { status: 429, headers: { "Retry-After": "60" } }),
    );
  vi.stubGlobal("fetch", fetch);
  const url = "https://displaycatalog.mp.microsoft.com/test-429";
  await expect(upstream(url)).rejects.toMatchObject({ retryable: true });
  vi.advanceTimersByTime(31000);
  await expect(upstream(url)).rejects.toMatchObject({
    code: "PROVIDER_COOLDOWN",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("limits concurrent provider fetches to four", async () => {
  let active = 0,
    max = 0;
  const fetch = vi.fn(async () => {
    active++;
    max = Math.max(max, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetch);
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      upstream(`https://displaycatalog.mp.microsoft.com/concurrent-${i}`),
    ),
  );
  expect(max).toBe(4);
});
