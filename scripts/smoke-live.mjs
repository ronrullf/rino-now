import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:3000";
const results = [];
async function get(path) {
  const response = await fetch(origin + path);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  return body.data;
}
assert.equal((await get("/api/health")).ready, true);
const search = await get("/api/search?q=forza");
assert.ok(search.products.length > 0);
assert.notEqual(search.source, "fixture");
results.push({
  capability: "title search",
  source: search.source,
  count: search.products.length,
});
for (const id of ["9NKX70BBCDRN", "9PNSZ7GMWCQZ", "9N16XHX3MB1R", "9NCJB85WM01G", "9NNZSNHLR63L", "9PJGM0T0827V", "C22JNR2SLS6T"]) {
  const data = await get(`/api/products/${id}`);
  assert.equal(data.product.id, id);
  assert.equal(data.demo, false);
  assert.deepEqual(
    data.regions.map((r) => r.currency),
    ["USD", "TRY", "INR", "JPY"],
  );
  assert.ok(data.regions.some((r) => r.rankEligible));
  for (const r of data.regions) {
    if (r.currentAmount !== null) assert.ok(Number(r.currentAmount) >= 0);
    if (r.fx) assert.ok(Number(r.fx.usdPerLocalUnit) > 0);
  }
  const warm = await get(`/api/products/${id}`);
  assert.deepEqual(
    warm.regions.map((r) => r.fetchedAt),
    data.regions.map((r) => r.fetchedAt),
  );
  results.push({
    capability: "lookup and warm cache",
    id,
    title: data.product.title,
    regions: data.regions.map((r) => ({
      market: r.market,
      status: r.status,
      rankEligible: r.rankEligible,
      currency: r.currency,
      fxProvider: r.fx?.provider,
      fxDate: r.fx?.effectiveDate,
    })),
    winners: data.winners,
  });
}
const empty = await get("/api/search?q=zzqqnonexistent9876");
assert.equal(empty.products.length, 0);
await writeFile(
  "docs/live-smoke-results.json",
  JSON.stringify({ executedAt: new Date().toISOString(), results }, null, 2),
);
console.log(
  "Live health, title search, game, DLC, currencies, FX, warm cache and empty search verified.",
);
