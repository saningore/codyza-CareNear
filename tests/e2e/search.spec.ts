import { expect, test } from "@playwright/test";

test.describe("CareNear in the browser", () => {
  test("starts empty, explains the sources, and rejects a bad ZIP", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("If this is an emergency, call 911.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Find care that is published in public records." })).toBeVisible();
    await expect(page.getByText("Search a place to see healthcare locations. The map stays empty until you do.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Codyza" })).toHaveAttribute("href", "https://codyza.com");
    await expect(page.getByText("does not rank a provider as medically best")).toBeVisible();

    await page.getByLabel("ZIP code, city, or street address").fill("1234");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Enter a 5-digit U.S. ZIP code." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nearby listings" })).toHaveCount(0);

    await page.getByRole("link", { name: "Sources" }).click();
    await expect(page.getByRole("heading", { name: "Where the information comes from" })).toBeVisible();
    await expect(page.getByRole("link", { name: "HRSA health center sites" })).toHaveAttribute("href", /data\.hrsa\.gov/);
    await expect(page.getByRole("link", { name: "SAMHSA FindTreatment.gov" })).toBeVisible();
    await expect(page.getByRole("link", { name: "CMS NPPES" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Codyza" })).toBeVisible();

    await page.getByRole("link", { name: "About" }).click();
    await expect(page.getByRole("heading", { name: "About CareNear" })).toBeVisible();
    await expect(page.getByText("Information unavailable")).toBeVisible();
  });

  test("opens a published HRSA record without filling in missing fields", async ({ page }) => {
    await page.goto("/facility/hrsa/021630-5-10001");
    await expect(page.getByRole("heading", { name: "Chelsea Mobile Unit" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Call (212) 545-2495" })).toHaveAttribute("href", "tel:+12125452495");
    await expect(page.getByText("Website: Information unavailable")).toBeVisible();
    await expect(page.getByText("40 hours per week reported by HRSA")).toBeVisible();
    await expect(page.getByText("303 9th Ave, New York, NY")).toBeVisible();
    await expect(page.getByRole("link", { name: "Get directions" })).toHaveAttribute("href", /google\.com\/maps/);
    await expect(page.getByRole("link", { name: "Open the original record" })).toHaveAttribute("href", /findahealthcenter\.hrsa\.gov/);
    await expect(page.getByText("does not diagnose conditions or recommend a provider as medically best")).toBeVisible();
    await expect(page.getByRole("link", { name: "Codyza" })).toHaveAttribute("href", "https://codyza.com");
  });

  test("shows the not-found page for an unknown record", async ({ page }) => {
    const response = await page.goto("/facility/hrsa/not-a-real-site");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("link", { name: "Codyza" })).toBeVisible();
  });

  test("searches ZIP 10001 and opens a live listing", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Search radius").selectOption("10");
    await page.getByLabel("ZIP code, city, or street address").fill("10001");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("Searching public health records…")).toBeVisible();
    await expect(page.getByText(/listings within 10 miles of ZIP code 10001/)).toBeVisible({ timeout: 150_000 });
    await expect(page.getByText("Distances are measured from the center of this ZIP code.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nearby listings" })).toBeVisible();
    await expect(page.getByText("Map tiles © OpenStreetMap contributors")).toBeVisible();
    await expect(page.locator("[data-map-ready='true']")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("list", { name: "Map legend" })).toContainText("Center of ZIP code 10001");
    const pinned = page.locator("article[data-pinned='true']").first();
    await expect(pinned).toBeVisible();
    const pinName = await pinned.getByRole("heading").innerText();
    await pinned.hover();
    await expect(pinned).toHaveAttribute("data-active", "true");
    await expect(page.locator(".maplibregl-popup")).toContainText(pinName);
    const cards = page.getByRole("article");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(3);

    await page.getByRole("button", { name: /Community health centers/ }).click();
    await expect(page.getByRole("button", { name: /Community health centers/ })).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("link", { name: "View record" }).first().click();
    await expect(page).toHaveURL(/\/facility\/(hrsa|samhsa|nppes)\//);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/Source:/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Codyza" })).toBeVisible();
  });

  test("pins the device location on the map", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 40.7506, longitude: -73.9971 });
    await page.goto("/");
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByText(/listings within 25 miles of Your current location/)).toBeVisible({ timeout: 150_000 });
    await expect(page.locator("[data-map-ready='true']")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("list", { name: "Map legend" })).toContainText("Your current location");
  });

  test("asks for a ZIP when location permission is denied", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Location permission was not granted. Enter a ZIP code or address." })).toBeVisible();
  });

  test("keeps the mobile search usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Find care that is published in public records." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Find care" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sources" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Codyza" })).toBeVisible();
    const search = page.getByRole("button", { name: "Search", exact: true });
    const box = await search.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(280);
  });
});
