import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("keyboard search, exact edition, regional links, saving, refreshing and theme persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByText(/Demo data/)).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/home-desktop.png",
    fullPage: true,
  });
  const input = page.getByRole("searchbox");
  await input.fill("Forza");
  const product = page
    .getByRole("link")
    .filter({ hasText: "Forza Horizon 5 Standard Edition" });
  await expect(product).toBeVisible();
  await product.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", {
      name: "Forza Horizon 5 Standard Edition",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(4);
  for (const market of ["US", "TR", "IN", "JP"]) {
    const a = page.getByRole("link", {
      name: new RegExp(`Open ${market} store`),
    });
    await expect(a).toHaveAttribute("target", "_blank");
    await expect(a).toHaveAttribute("href", /9NKX70BBCDRN$/i);
  }
  const save = page.getByRole("button", {
    name: "Save to watchlist",
    exact: true,
  });
  if (await save.isVisible()) await save.click();
  await expect(
    page.getByRole("button", { name: "Saved to watchlist" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh prices", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Refresh in/ })).toBeDisabled();
  await page.screenshot({
    path: "docs/screenshots/comparison-desktop.png",
    fullPage: true,
  });
  const a11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("link", { name: "Watchlist", exact: true }).click();
  await expect(
    page
      .getByRole("link")
      .filter({ hasText: "Forza Horizon 5 Standard Edition" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByRole("button", { name: "Remove Forza Horizon 5 Standard Edition" })
      .filter({ visible: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/watchlist-dark.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("responsive layouts and mobile watchlist preserve controls without overflow", async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/product/9NKX70BBCDRN");
    await expect(page.getByRole("article")).toHaveCount(4);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const cards = await page
      .getByRole("article")
      .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().top));
    expect(new Set(cards).size).toBe(width < 640 ? 4 : width < 1024 ? 2 : 1);
    if (width === 390)
      await page.screenshot({
        path: "docs/screenshots/comparison-mobile.png",
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/watchlist");
  await expect(
    page.getByRole("heading", { name: "Watchlist", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const a11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);
});
test("empty search, unavailable product, and origin validation", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("searchbox").fill("nonexistent game");
  await expect(
    page.getByText(
      "No matching products found. Try another title or a product URL.",
    ),
  ).toBeVisible();
  await page.goto("/product/000000000000");
  await expect(page.getByText("Could not load this product")).toBeVisible();
  const unsafe = await request.post("/api/watchlist", {
    data: { productId: "9NKX70BBCDRN" },
    headers: { Origin: "https://evil.example" },
  });
  expect(unsafe.status()).toBe(403);
  const malformed = await request.get("/api/search?q=x");
  expect(malformed.status()).toBe(400);
});
