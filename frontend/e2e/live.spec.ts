// Real journeys against a deployed site and the real TomTom + Open-Meteo APIs. Not run in CI:
// live weather changes and both APIs are rate-limited. Run with `LIVE_URL=https://… npm run e2e:live`.
import { expect, test } from "@playwright/test";
import { nextHour } from "./fixtures";

test.describe.configure({ mode: "serial" }); // one plan at a time keeps us inside the free tiers

test("autosuggest → plan Denver to Chicago → routes, checkpoints and the weather layer", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("units", "imperial"));
  await page.reload();

  await page.getByRole("combobox", { name: "Origin" }).fill("Denver");
  await page.getByRole("option", { name: /^Denver, CO/ }).first().click();
  await page.getByRole("combobox", { name: "Destination" }).fill("Chicago");
  await page.getByRole("option", { name: /^Chicago, IL/ }).first().click();
  await page.getByLabel("Departure").fill(nextHour(3));
  await page.getByLabel("Cargo weight (lb)").fill("32000");
  const started = Date.now();
  await page.getByRole("button", { name: "Plan routes" }).click();

  await expect(page.getByRole("heading", { name: /routes? · |No safe route/ })).toBeVisible({ timeout: 60_000 });
  const planned = Date.now() - started;
  const cards = page.getByRole("article");
  expect(await cards.count()).toBeGreaterThanOrEqual(1);
  await expect(cards.first()).toContainText(/\d{3,4}(\.\d)? mi · arrives/); // ~1,000 mi by road

  await expect(page.getByRole("heading", { name: "Risk along corridor" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /^Route A$/ }).click();
  await expect(page.getByText(/^\d+ checkpoints$/)).toBeVisible();
  expect(errors).toEqual([]);
  expect(planned, "plan time (ms) must fit the 60 s function limit").toBeLessThan(55_000);
});

test("US hours of service on a long trip lists real stops", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Origin").fill("Denver, CO");
  await page.getByLabel("Destination").fill("Atlanta, GA"); // ~1,400 mi: past one 11 h shift
  await page.getByLabel("Departure").fill(nextHour(3));
  await page.getByLabel("Cargo weight (lb)").fill("32000");
  await page.getByRole("radio", { name: "US hours of service" }).click();
  await page.getByRole("button", { name: "Plan routes" }).click();
  await expect(page.getByRole("heading", { name: /routes? · |No safe route/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("article").first()).toContainText(/\d+ breaks? · \d+ rests?/);
  await page.getByRole("button", { name: /^Route A$/ }).click();
  await expect(page.getByRole("list", { name: "Stops" })).toContainText("10 h rest");
});

test("an unreachable destination shows the no-route state", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Origin").fill("Denver, CO");
  await page.getByLabel("Destination").fill("Honolulu, HI");
  await page.getByLabel("Departure").fill(nextHour(3));
  await page.getByLabel("Cargo weight (lb)").fill("32000");
  await page.getByRole("button", { name: "Plan routes" }).click();
  await expect(page.getByRole("heading", { name: "No drivable route found" })).toBeVisible({ timeout: 60_000 });
});
