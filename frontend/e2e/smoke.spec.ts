import type { ConsoleMessage } from "@playwright/test";
import { expect, test } from "./fixtures";

test("plan a trip → three ranked cards → scrub the forecast without refetching", async ({ page, api }) => {
  // Stricter than the fixture: here no resource may fail at all (e.g. MapLibre's worker 404 in a production build).
  const errors: string[] = [];
  const blockedTiles = (m: ConsoleMessage) => `${m.location().url} ${m.text()}`.includes("tiles.openfreemap.org");
  page.on("console", (m) => m.type() === "error" && !blockedTiles(m) && errors.push(m.text()));
  await page.addInitScript(() => {
    const w = window as unknown as { cls: number };
    w.cls = 0;
    new PerformanceObserver((list) => {
      // Every shift counts: results and the heatmap arrive within 500 ms of the click and key presses that
      // request them, so the usual hadRecentInput filter would discard exactly the shifts this test is about.
      for (const e of list.getEntries() as unknown as { value: number }[]) w.cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Denver → Salt Lake City · winter storm" }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "3 routes · Route A recommended" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Risk" })).toBeVisible();
  await expect.poll(() => api.sent.heatmap.length).toBe(1);

  const slider = page.getByRole("slider", { name: "Forecast hour" });
  await slider.focus();
  for (let i = 0; i < 12; i++) await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", /^\+12 h, /);
  expect([api.sent.plan.length, api.sent.heatmap.length]).toEqual([1, 1]); // scrubbing is client-side only

  // Results and the heatmap arriving must not shove the layout around.
  expect(await page.evaluate(() => (window as unknown as { cls: number }).cls)).toBeLessThan(0.1);
  expect(errors).toEqual([]); // the map's worker and layers came up in the production build
  // No horizontal scroll at any width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});
