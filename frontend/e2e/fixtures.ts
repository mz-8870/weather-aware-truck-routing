// Shared e2e fixtures: realistic /api answers and an `api` mock that records what the app sends.
import { expect, test as base, type ConsoleMessage, type Page } from "@playwright/test";

const H = 3600;

type RouteOptions = {
  offsetLat?: number; // bends the route so the three don't overlap on the map
  minutes?: number; // drive time
  levels?: (number | null)[]; // per checkpoint, 0 Low … 4 No Travel, null Unknown
  reasons?: string[];
  synthesized?: boolean;
  detourVia?: string | null;
  stops?: unknown[];
  tripS?: number;
  step?: [number, number]; // [dLat, dLon] between checkpoints; default heads west like Denver → Salt Lake City
};

/** One route Denver → Salt Lake City-ish with five checkpoints 130 mi apart. */
export function route(name: string, o: RouteOptions = {}) {
  const { offsetLat = 0, minutes = 470, levels = [0, 0, 0, 0, 0], reasons = [] } = o;
  const [dLat, dLon] = o.step ?? [0.2, -1.73];
  const points = levels.map((_, i) => ({ lat: 39.74 + offsetLat * Math.sin((i * Math.PI) / 4) + i * dLat, lon: -104.99 + i * dLon }));
  const checkpoints = points.map((p, i) => ({
    mile: i * 130,
    lat: p.lat,
    lon: p.lon,
    offset_s: (i * minutes * 60) / (levels.length - 1),
    eta: new Date(Date.now() + H * 1000 + (i * minutes * 60_000) / (levels.length - 1)).toISOString(),
    level: levels[i],
    reasons: levels[i] === null ? ["wind missing", "rain missing", "snow missing"] : [reasons[i] ?? "wind 12 mph: Low"],
    beyond_forecast: false,
    wind_mph: levels[i] === null ? null : 12,
    gust_mph: levels[i] === null ? null : 20,
    rain_in_hr: levels[i] === null ? null : 0,
    snow_in_hr: levels[i] === null ? null : 0,
    owned_mi: i === 0 || i === levels.length - 1 ? 65 : 130,
  }));
  const owned = (lvl: number | null) => checkpoints.filter((c) => c.level === lvl).reduce((s, c) => s + c.owned_mi, 0);
  return {
    name,
    distance_mi: 520,
    duration_s: minutes * 60,
    trip_s: o.tripS ?? minutes * 60,
    synthesized: o.synthesized ?? false,
    detour_via: o.detourVia ?? null,
    summary: { severe_mi: owned(3), high_mi: owned(2), unknown_mi: owned(null), notravel_mi: owned(4), avg_risk: 0.2 },
    checkpoints,
    stops: o.stops ?? [],
    segments: points.slice(1).map((p, i) => ({ level: checkpoints[i + 1].level, coordinates: [[points[i].lon, points[i].lat], [p.lon, p.lat]] })),
  };
}

export const PLAN = {
  routes: [
    route("Route A", { minutes: 470 }),
    route("Route B", { offsetLat: 0.6, minutes: 495, levels: [0, 0, 2, 0, 0], reasons: ["", "", "wind 38 mph: High"] }),
    route("Route C", { offsetLat: -0.6, minutes: 540 }),
  ],
  recommended: 0,
  why: "Wins on high miles: 0.0 mi vs 130.0 mi on Route B (both 0 severe).",
  routes_found: 3,
  cargo_lb: 32000,
};

export function heatmap(cells = PLAN.routes[0].checkpoints.map((c) => [c.lon, c.lat])) {
  return {
    spacing_mi: 25,
    hours: Array.from({ length: 49 }, (_, h) => new Date(Date.now() + h * H * 1000).toISOString()),
    cells,
    levels: Object.fromEntries(["risk", "wind", "rain", "snow"].map((v) => [v, Array.from({ length: 49 }, (_, h) => cells.map((_, i) => (h + i) % 5))])),
  };
}

const PLACES: Record<string, { label: string; kind: string; lat: number; lon: number }[]> = {
  den: [
    { label: "Denver, CO", kind: "City", lat: 39.7392, lon: -104.9903 },
    { label: "Denver International Airport, CO", kind: "Airport", lat: 39.8561, lon: -104.6737 },
  ],
  sal: [{ label: "Salt Lake City, UT", kind: "City", lat: 40.7608, lon: -111.891 }],
  chi: [{ label: "Chicago, IL", kind: "City", lat: 41.8781, lon: -87.6298 }],
  hon: [{ label: "Honolulu, HI", kind: "City", lat: 21.3099, lon: -157.8581 }],
};

type Reply = { status?: number; json: unknown };

/** Mocks our own /api at the browser; each endpoint answers from a queue (the last reply repeats). */
export class Api {
  readonly sent = { plan: [] as Record<string, unknown>[], heatmap: [] as Record<string, unknown>[], geocode: [] as string[] };
  private replies: { plan: Reply[]; heatmap: Reply[] } = { plan: [{ json: PLAN }], heatmap: [{ json: heatmap() }] };

  constructor(private page: Page) {}

  plan(...replies: Reply[]) {
    this.replies.plan = replies;
  }

  heatmap(...replies: Reply[]) {
    this.replies.heatmap = replies;
  }

  async install() {
    const answer = (kind: "plan" | "heatmap") => async (r: import("@playwright/test").Route) => {
      this.sent[kind].push(r.request().postDataJSON());
      const queue = this.replies[kind];
      const reply = queue.length > 1 ? queue.shift()! : queue[0];
      await r.fulfill({ status: reply.status ?? 200, json: reply.json });
    };
    await this.page.route("**/tiles.openfreemap.org/**", (r) => r.abort()); // hermetic: no basemap needed
    await this.page.route("**/api/plan", answer("plan"));
    await this.page.route("**/api/heatmap", answer("heatmap"));
    await this.page.route("**/api/geocode?**", (r) => {
      const q = new URL(r.request().url()).searchParams.get("q") ?? "";
      this.sent.geocode.push(q);
      return r.fulfill({ json: { suggestions: q.length < 3 ? [] : (PLACES[q.slice(0, 3).toLowerCase()] ?? []) } });
    });
  }
}

/** `api` mocks /api for every test (auto: even tests that don't name it must never reach a real backend);
 *  every test also fails on page or console errors (blocked tiles excepted). */
export const test = base.extend<{ api: Api }>({
  api: [
    async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const blocked = (m: ConsoleMessage) => `${m.location().url} ${m.text()}`.includes("tiles.openfreemap.org");
    // 4xx/5xx our own mocks return on purpose log "Failed to load resource"; those are asserted on screen instead.
    page.on("console", (m) => m.type() === "error" && !blocked(m) && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
    await page.addInitScript(() => localStorage.setItem("units", localStorage.getItem("units") ?? "imperial"));
    const api = new Api(page);
    await api.install();
    await use(api);
    expect(errors, "page errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** A datetime-local value for the next full hour, in the browser's zone. */
export function nextHour(hoursAhead = 2) {
  const d = new Date(Date.now() + hoursAhead * H * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

/** Fill the trip form the way a user would (typed places, no autosuggest pick). */
export async function fillTrip(page: Page, { origin = "Denver, CO", destination = "Salt Lake City, UT", weight = "32000" } = {}) {
  await page.getByLabel("Origin").fill(origin);
  await page.getByLabel("Destination").fill(destination);
  await page.getByLabel("Departure").fill(nextHour());
  await page.getByLabel(/^(Cargo|Gross) weight/).fill(weight);
}
