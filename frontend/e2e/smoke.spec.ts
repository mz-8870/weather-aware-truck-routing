import { expect, test } from "@playwright/test";

// A small but complete /api/plan answer: three routes Denver → Salt Lake City, five checkpoints each.
function route(name: string, offsetLat: number, minutes: number) {
  const points = [0, 1, 2, 3, 4].map((i) => ({ lat: 39.74 + offsetLat * Math.sin((i * Math.PI) / 4) + i * 0.2, lon: -104.99 - i * 1.73 }));
  const checkpoints = points.map((p, i) => ({
    mile: i * 130,
    lat: p.lat,
    lon: p.lon,
    offset_s: i * minutes * 15,
    eta: new Date(Date.now() + 3600_000 + i * minutes * 15_000).toISOString(),
    level: i === 2 && name === "Route B" ? 2 : 0,
    reasons: [i === 2 && name === "Route B" ? "wind 38 mph: High" : "wind 12 mph: Low"],
    beyond_forecast: false,
    wind_mph: 12,
    gust_mph: 20,
    rain_in_hr: 0,
    snow_in_hr: 0,
    owned_mi: 130,
  }));
  return {
    name,
    distance_mi: 520,
    duration_s: minutes * 60,
    synthesized: false,
    detour_via: null,
    summary: { severe_mi: 0, high_mi: name === "Route B" ? 130 : 0, unknown_mi: 0, notravel_mi: 0, avg_risk: 0 },
    checkpoints,
    segments: points.slice(1).map((p, i) => ({ level: checkpoints[i + 1].level, coordinates: [[points[i].lon, points[i].lat], [p.lon, p.lat]] })),
  };
}

const PLAN = {
  routes: [route("Route A", 0, 470), route("Route B", 0.6, 495), route("Route C", -0.6, 540)],
  recommended: 0,
  why: "Wins on high miles: 0.0 mi vs 130.0 mi on Route B (both 0 severe).",
  routes_found: 3,
  cargo_lb: 32000,
};

const CELLS = PLAN.routes[0].checkpoints.map((c) => [c.lon, c.lat]);
const HEATMAP = {
  hours: Array.from({ length: 49 }, (_, h) => new Date(Date.now() + h * 3600_000).toISOString()),
  cells: CELLS,
  levels: Object.fromEntries(["risk", "wind", "rain", "snow"].map((v) => [v, Array.from({ length: 49 }, (_, h) => CELLS.map((_, i) => (h + i) % 5))])),
};

test("plan a trip → three ranked cards → scrub the forecast without refetching", async ({ page }) => {
  const calls = { plan: 0, heatmap: 0 };
  await page.route("**/tiles.openfreemap.org/**", (r) => r.abort()); // hermetic: no basemap tiles needed
  await page.route("**/api/plan", (r) => (calls.plan++, r.fulfill({ json: PLAN })));
  await page.route("**/api/heatmap", (r) => (calls.heatmap++, r.fulfill({ json: HEATMAP })));
  await page.addInitScript(() => {
    localStorage.setItem("units", "imperial");
    const w = window as unknown as { cls: number };
    w.cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Denver → Salt Lake City · winter storm" }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "3 routes · Route A recommended" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Risk" })).toBeVisible();
  await expect.poll(() => calls.heatmap).toBe(1);

  const slider = page.getByRole("slider", { name: "Forecast hour" });
  await slider.focus();
  for (let i = 0; i < 12; i++) await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", /^\+12 h, /);
  expect(calls).toEqual({ plan: 1, heatmap: 1 }); // scrubbing is client-side only

  // Results and the heatmap arriving must not shove the layout around.
  expect(await page.evaluate(() => (window as unknown as { cls: number }).cls)).toBeLessThan(0.1);
  // No horizontal scroll at any width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});
