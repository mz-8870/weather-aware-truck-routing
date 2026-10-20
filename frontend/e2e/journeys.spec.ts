// What users actually do, in a real browser against the production build; /api answers come from fixtures.
import { expect, fillTrip, heatmap, PLAN, route, test } from "./fixtures";

const results = (n = 3) => new RegExp(`^${n} routes? · Route A recommended$`);

test.describe("planning a trip", () => {
  test("pick both places from autosuggest with the keyboard and plan", async ({ page, api }) => {
    await page.goto("/");
    const origin = page.getByRole("combobox", { name: "Origin" });
    await origin.fill("Denv");
    await expect(page.getByRole("option", { name: /Denver, CO/ })).toBeVisible();
    await origin.press("ArrowDown");
    await origin.press("Enter");
    await expect(origin).toHaveValue("Denver, CO");

    const destination = page.getByRole("combobox", { name: "Destination" });
    await destination.fill("Salt");
    await page.getByRole("option", { name: /Salt Lake City, UT/ }).click();
    await page.getByLabel("Departure").fill("2030-01-15T08:00");
    await page.getByLabel("Cargo weight (lb)").fill("32000");
    await page.getByRole("button", { name: "Plan routes" }).click();

    await expect(page.getByRole("heading", { name: results() })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(3);
    expect(api.sent.plan[0]).toMatchObject({
      origin: "Denver, CO",
      origin_position: [39.7392, -104.9903], // picked suggestions skip text geocoding
      destination: "Salt Lake City, UT",
      destination_position: [40.7608, -111.891],
      weight_lb: 32000,
      weight_mode: "cargo",
      interval_mi: 25,
      hos: false,
    });
    expect(api.sent.geocode.some((q) => q.length < 3)).toBe(false); // no lookups for 1–2 characters
  });

  test("an example trip plans in one click and collapses the form to a summary", async ({ page, api, isMobile }) => {
    await page.goto("/");
    if (!isMobile) await expect(page.getByText("Your routes will appear here")).toBeVisible(); // phones: under the sheet, hidden
    await page.getByRole("button", { name: "Amarillo → Oklahoma City · high wind" }).click();
    await expect(page.getByRole("heading", { name: results() })).toBeVisible();
    await expect(page.getByText("Amarillo, TX → Oklahoma City, OK")).toBeVisible();
    await expect(page.getByLabel("Origin")).toHaveCount(0);
    expect(api.sent.plan).toHaveLength(1);
    expect(api.sent.plan[0]).toMatchObject({ origin: "Amarillo, TX", destination: "Oklahoma City, OK", weight_lb: 32000 });
  });

  test("Edit reopens the filled-in form and a re-plan sends the change", async ({ page, api }) => {
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect(page.getByRole("heading", { name: results() })).toBeVisible();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByLabel("Origin")).toHaveValue("Denver, CO");
    await page.getByRole("radio", { name: "10 mi" }).click();
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect.poll(() => api.sent.plan.length).toBe(2);
    expect(api.sent.plan[1].interval_mi).toBe(10);
  });

  test("a gross weight over 80,000 lb warns but still plans", async ({ page, api }) => {
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("radio", { name: "Gross (truck + cargo)" }).click();
    await page.getByLabel("Gross weight (lb)").fill("85000");
    await expect(page.getByText("Over 80,000 lb gross")).toBeVisible();
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect(page.getByRole("heading", { name: results() })).toBeVisible();
    expect(api.sent.plan[0]).toMatchObject({ weight_lb: 85000, weight_mode: "gross" });
  });

  test("a server validation error shows under its field, and fixing it plans", async ({ page, api }) => {
    api.plan({ status: 400, json: { departure: ["Departure must be in the future."] } }, { json: PLAN });
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect(page.getByText("Departure must be in the future.")).toBeVisible();
    await expect(page.getByLabel("Departure")).toHaveAttribute("aria-invalid", "true");
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect(page.getByRole("heading", { name: results() })).toBeVisible();
  });
});

test.describe("reading the results", () => {
  test("open a route to see its checkpoints, then go back to all routes", async ({ page }) => {
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect(page.getByRole("article", { name: "Route A" })).toContainText("Recommended");
    await expect(page.getByRole("article", { name: "Route B" })).toContainText("High");

    await page.getByRole("button", { name: "Route B" }).click();
    await expect(page.getByText("5 checkpoints")).toBeVisible();
    await expect(page.getByText("#3 · mi 260")).toBeVisible();
    await expect(page.getByText("Wind 38 mph")).toBeVisible();
    await page.getByRole("button", { name: "All routes" }).click();
    await expect(page.getByRole("article")).toHaveCount(3);
  });

  test("a route through No Travel gets a banner and a No Travel badge", async ({ page, api }) => {
    const blocked = route("Route C", { offsetLat: -0.6, minutes: 540, levels: [0, 0, 4, 0, 0], reasons: ["", "", "wind 58 mph: No Travel"] });
    api.plan({ json: { ...PLAN, routes: [PLAN.routes[0], PLAN.routes[1], blocked] } });
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect(page.getByText("Route C crosses a No Travel zone")).toBeVisible();
    await expect(page.getByRole("article", { name: "Route C" })).toContainText("No Travel"); // ranking itself: backend tests
  });

  test("when every route is blocked nothing is recommended", async ({ page, api }) => {
    const blocked = (name: string) => route(name, { levels: [0, 4, 0, 0, 0], reasons: ["", "wind 58 mph: No Travel"] });
    api.plan({ json: { ...PLAN, routes: ["Route A", "Route B", "Route C"].map(blocked), recommended: null, why: null } });
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect(page.getByRole("heading", { name: "No safe route in this window" })).toBeVisible();
    await expect(page.getByText("Recommended", { exact: true })).toHaveCount(0);
  });

  test("a blocked trip offers the earliest clear departure and re-plans with it", async ({ page, api }) => {
    const blocked = (name: string) => route(name, { levels: [0, 4, 0, 0, 0], reasons: ["", "wind 58 mph: No Travel"] });
    const later = "2030-01-15T16:00:00+00:00";
    api.plan(
      { json: { ...PLAN, routes: ["Route A", "Route B", "Route C"].map(blocked), recommended: null, why: null, earliest_clear_departure: { hours_later: 8, departure: later, route: "Route B" } } },
      { json: PLAN },
    );
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect(page.getByText(/to avoid No Travel on Route B\.$/)).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("earliest-clear.png") });
    await page.getByRole("button", { name: "Leave 8 h Later" }).click();
    await expect.poll(() => api.sent.plan.length).toBe(2);
    expect(api.sent.plan[1]).toEqual({ ...api.sent.plan[0], departure: later });
    await expect(page.getByRole("heading", { name: /Route A recommended/ })).toBeVisible();
  });

  test("an added detour is explained", async ({ page, api }) => {
    const detour = route("Route B", { offsetLat: 0.6, synthesized: true, detourVia: "Laramie, WY" });
    api.plan({ json: { ...PLAN, routes: [PLAN.routes[0], detour, PLAN.routes[2]], routes_found: 2 } });
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect(page.getByText("Only 2 routes found — added a detour")).toBeVisible();
    await expect(page.getByText("via Laramie, WY · added detour")).toBeVisible();
  });

  test("with rest breaks on, the request asks for HOS and the route lists where the driver stops", async ({ page, api }) => {
    const stops = [
      { kind: "break", mile: 480, lat: 41, lon: -110, offset_s: 28800, start: new Date(Date.now() + 9 * 3600_000).toISOString(), duration_s: 1800, place: "Rock Springs, WY" },
    ];
    api.plan({ json: { ...PLAN, routes: [route("Route A", { minutes: 560, stops, tripS: 35400 }), PLAN.routes[1], PLAN.routes[2]] } });
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("radio", { name: "US hours of service" }).click();
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect(page.getByText(/· HOS breaks$/)).toBeVisible();
    await expect(page.getByRole("article", { name: "Route A" })).toContainText("1 break");
    expect(api.sent.plan[0].hos).toBe(true);
    await page.getByRole("button", { name: "Route A" }).click();
    await expect(page.getByRole("list", { name: "Stops" })).toContainText("mi 480 · near Rock Springs, WY");
  });
});

test.describe("the forecast map", () => {
  // The pins mark both ends of the trip, and tags name the routes; nothing the app draws over the map may hide them.
  async function markersHiddenBy(page: import("@playwright/test").Page, kind: "pins" | "tags" = "pins") {
    const pins = await page.locator(".maplibregl-marker").evaluateAll(
      (els, kind) =>
        els
          .filter((e) => (kind === "pins" ? e.querySelector("svg.lucide-circle-dot, svg.lucide-flag") : /^Route [ABC]$/.test(e.textContent ?? "")))
          .map((e) => e.getBoundingClientRect().toJSON()),
      kind,
    );
    const covers = await page.evaluate(() =>
      [...document.querySelectorAll("main > *:not(:first-child), aside")]
        .filter((e) => getComputedStyle(e).display !== "none")
        .map((e) => ({ name: e.className, ...e.getBoundingClientRect().toJSON() })),
    );
    const map = await page.locator("main").boundingBox();
    type Box = { x: number; y: number; width: number; height: number };
    const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const inside = (a: Box, b: Box) => a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
    if (pins.length !== (kind === "pins" ? 2 : 3)) return [`${kind} missing`];
    // A pin outside the map (e.g. a fit that never ran) is as hidden as one under a control.
    return pins.flatMap((p) => [...(inside(p, map!) ? [] : ["outside the map"]), ...covers.filter((c) => overlap(p, c)).map((c) => c.name)]);
  }

  test("after planning, both ends of the trip are in view, not under the controls", async ({ page, api, isMobile }) => {
    // Northeast like Denver → Minneapolis: the destination lands in the top-right corner, where the legend sits.
    const ne = (name: string, offsetLat: number) => route(name, { offsetLat, step: [1.35, 3] });
    api.plan({ json: { ...PLAN, routes: [ne("Route A", 0), ne("Route B", 0.6), ne("Route C", -0.6)] } });
    api.heatmap({ json: heatmap(ne("Route A", 0).checkpoints.map((c) => [c.lon, c.lat])) });
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("button", { name: "Plan routes" }).click();
    if (!isMobile) await expect(page.getByRole("heading", { name: "Risk along corridor" })).toBeVisible();
    // The fit animates; wait until it settles clear. On desktop the sidebar sits beside the map, not over it.
    await expect.poll(() => markersHiddenBy(page), { timeout: 5000 }).toEqual([]);
    await expect.poll(() => markersHiddenBy(page, "tags"), { timeout: 5000 }).toEqual([]);
    if (isMobile) {
      await page.getByRole("button", { name: "Trip panel" }).click(); // collapse: the map re-fits into the larger space
      await expect.poll(() => markersHiddenBy(page), { timeout: 5000 }).toEqual([]);
      await expect.poll(() => markersHiddenBy(page, "tags"), { timeout: 5000 }).toEqual([]);
    }
  });

  test("tags name each route on the map; the selected one is filled and its open checkpoint ringed", async ({ page, api, isMobile }) => {
    const ne = (name: string, offsetLat: number) => route(name, { offsetLat, step: [1.35, 3] });
    api.plan({ json: { ...PLAN, routes: [ne("Route A", 0), ne("Route B", 0.6), ne("Route C", -0.6)] } });
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("button", { name: "Plan routes" }).click();
    const tag = (name: string) => page.locator(".maplibregl-marker", { hasText: new RegExp(`^${name}$`) });
    for (const name of ["Route A", "Route B", "Route C"]) await expect(tag(name)).toBeVisible();
    const fill = (name: string) => tag(name).locator("div").evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(await fill("Route A")).not.toBe(await fill("Route B")); // Route A is selected first
    if (isMobile) await page.getByRole("button", { name: "Trip panel" }).click(); // the sheet covers the cards' map area otherwise
    await page.getByRole("button", { name: "Route B" }).click({ force: isMobile });
    const filled = async () => [await fill("Route A"), await fill("Route B"), await fill("Route C")];
    await expect.poll(async () => { const [a, b, c] = await filled(); return a === c && b !== c; }).toBe(true); // now Route B
    await page.waitForTimeout(1200); // the selection doesn't move the map, but the plan's fit may still be easing
    // The tag's anchor is a vertex of Route B's path, which in these fixtures is a checkpoint, 14 px under the tag.
    const box = (await tag("Route B").boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height + 14);
    await expect(page.getByText(/^Checkpoint \d+/).first()).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("active-checkpoint.png") });
  });

  test("on a tablet in portrait the map still frames both ends of the trip", async ({ page, api, isMobile }) => {
    test.skip(isMobile, "desktop layout at a mid width");
    await page.setViewportSize({ width: 768, height: 1024 }); // map ~327 px wide beside the sidebar
    const ne = (name: string, offsetLat: number) => route(name, { offsetLat, step: [1.35, 3] });
    api.plan({ json: { ...PLAN, routes: [ne("Route A", 0), ne("Route B", 0.6), ne("Route C", -0.6)] } });
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect(page.getByRole("heading", { name: results() })).toBeVisible();
    // The full desktop padding is wider than this map; without scaling it down MapLibre skips the fit entirely and
    // the map stays on the continental view, where this trip spans only ~20% of the width.
    const framed = async () => {
      const xs = await page.locator(".maplibregl-marker").evaluateAll((els) =>
        els.filter((e) => e.querySelector("svg.lucide-circle-dot, svg.lucide-flag")).map((e) => e.getBoundingClientRect().x),
      );
      const width = (await page.locator("main").boundingBox())!.width;
      return xs.length === 2 && Math.abs(xs[1] - xs[0]) / width > 0.3;
    };
    await expect.poll(framed, { timeout: 5000 }).toBe(true);
    expect((await markersHiddenBy(page)).filter((r) => r === "outside the map")).toEqual([]);
  });

  test("switch heatmap layers and scrub 0–48 h without new requests", async ({ page, api, isMobile }) => {
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect.poll(() => api.sent.heatmap.length).toBe(1);
    expect(api.sent.heatmap[0].points).toHaveLength(15); // every route's checkpoints
    if (!isMobile) await expect(page.getByRole("heading", { name: "Risk along corridor" })).toBeVisible();

    await page.getByRole("radio", { name: "Wind" }).click();
    if (!isMobile) await expect(page.getByRole("heading", { name: "Wind along corridor" })).toBeVisible();
    const slider = page.getByRole("slider", { name: "Forecast hour" });
    await slider.focus();
    await slider.press("End");
    await expect(slider).toHaveAttribute("aria-valuetext", /^\+48 h, /);
    await slider.press("Home");
    await expect(slider).toHaveAttribute("aria-valuetext", /^\+0 h, /);
    await page.getByRole("radio", { name: "Off" }).click();
    expect(api.sent.heatmap).toHaveLength(1);
    expect(api.sent.plan).toHaveLength(1);
  });

  test("Play advances the forecast hour and Pause stops it", async ({ page }) => {
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("button", { name: "Plan routes" }).click();
    const slider = page.getByRole("slider", { name: "Forecast hour" });
    await page.getByRole("button", { name: "Play" }).click();
    await expect(slider).toHaveAttribute("aria-valuetext", /^\+[2-9]\d* h, /, { timeout: 5000 });
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
    await page.waitForTimeout(700); // let any step already scheduled land
    const paused = await slider.getAttribute("aria-valuetext");
    await page.waitForTimeout(1500);
    await expect(slider).toHaveAttribute("aria-valuetext", paused!);
  });
});

test.describe("when things go wrong", () => {
  test("no drivable route → Edit trip → a fixed destination plans", async ({ page, api }) => {
    api.plan({ status: 422, json: { detail: "No truck route found for this trip.", code: "no_route" } }, { json: PLAN });
    await page.goto("/");
    await fillTrip(page, { destination: "Honolulu, HI" });
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect(page.getByRole("heading", { name: "No drivable route found" })).toBeVisible();
    await page.getByRole("button", { name: "Edit trip" }).click();
    await page.getByLabel("Destination").fill("Salt Lake City, UT");
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect(page.getByRole("heading", { name: results() })).toBeVisible();
    expect(api.sent.plan.map((b) => b.destination)).toEqual(["Honolulu, HI", "Salt Lake City, UT"]);
  });

  test("a routing outage keeps the trip, and Try again re-sends the same request", async ({ page, api }) => {
    api.plan({ status: 502, json: { detail: "Routing service unavailable. Try again." } }, { json: PLAN });
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect(page.getByRole("heading", { name: "Couldn't reach the routing service" })).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: results() })).toBeVisible();
    expect(api.sent.plan).toHaveLength(2);
    expect(api.sent.plan[1]).toEqual(api.sent.plan[0]);
  });

  test("a failed weather layer keeps the routes, and Retry loads it", async ({ page, api }) => {
    api.heatmap({ status: 502, json: { detail: "Weather layer didn't load." } }, { json: heatmap() });
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect(page.getByText("Weather layer didn't load")).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(3);
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("Weather layer didn't load")).toHaveCount(0);
    expect(api.sent.heatmap).toHaveLength(2);
    expect(api.sent.plan).toHaveLength(1); // only the failed request was retried
  });
});

test.describe("preferences", () => {
  test("metric units convert the results, Undo restores, and the choice survives a reload", async ({ page, isMobile }) => {
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("button", { name: "Plan routes" }).click();
    const card = page.getByRole("article", { name: "Route A" });
    await expect(card).toContainText("520 mi");
    if (isMobile) await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("radio", { name: "Metric" }).click();
    if (isMobile) await page.getByRole("heading", { level: 1 }).click(); // tap outside to dismiss the settings panel
    await expect(card).toContainText("836.9 km");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(card).toContainText("520 mi");

    if (isMobile) await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("radio", { name: "Metric" }).click();
    await page.reload();
    await expect(page.getByLabel("Cargo weight (kg)")).toBeVisible();
  });

  test("dark theme applies to the page and is remembered", async ({ page, isMobile }) => {
    await page.goto("/");
    if (isMobile) await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    if (isMobile) await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});

test.describe("on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone layout only");

  test("the heatmap layer chips scroll sideways without showing a scrollbar", async ({ page }) => {
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("button", { name: "Plan routes" }).click();
    const row = await page.getByRole("radiogroup", { name: "Heatmap" }).evaluate((el) => {
      let s = el as HTMLElement | null;
      while (s && getComputedStyle(s).overflowX !== "auto") s = s.parentElement;
      // Phone emulation uses overlay scrollbars (no layout space), so check what decides it: the bar is switched off.
      return s && { scrollbarWidth: getComputedStyle(s).scrollbarWidth, scrollable: s.scrollWidth > s.clientWidth };
    });
    expect(row).toEqual({ scrollbarWidth: "none", scrollable: true });
  });

  test("the trip sheet collapses to show the map and expands again", async ({ page }) => {
    await page.goto("/");
    await fillTrip(page);
    await page.getByRole("button", { name: "Plan routes" }).click();
    await expect(page.getByRole("heading", { name: results() })).toBeVisible(); // measure the sheet once it has content
    const handle = page.getByRole("button", { name: "Trip panel" });
    const sheet = page.getByRole("complementary");
    const open = (await sheet.boundingBox())!.height;
    await handle.click();
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    await expect.poll(async () => (await sheet.boundingBox())!.height).toBeLessThan(open / 2);
    await handle.click();
    await expect(handle).toHaveAttribute("aria-expanded", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });
});
