import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";

// MapLibre needs WebGL, which jsdom lacks; the map is checked in the browser instead.
vi.mock("./RouteMap", () => ({
  RouteMap: ({ routes, selected }: { routes?: unknown[]; selected: number }) => (
    <div>
      map: {routes?.length ?? 0} routes, selected {selected}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const cp = (mile: number, level: number | null, reason: string, eta = "2030-01-15T16:20:00Z") => ({
  mile,
  lat: 41,
  lon: -100,
  offset_s: mile * 54,
  eta,
  level,
  reasons: level === null ? ["wind missing", "rain missing", "snow missing"] : [reason],
  beyond_forecast: false,
  wind_mph: level === null ? null : 10,
  gust_mph: null,
  rain_in_hr: level === null ? null : 0,
  snow_in_hr: level === null ? null : 0,
  owned_mi: 25,
});

const summary = (over = {}) => ({ severe_mi: 0, high_mi: 0, unknown_mi: 0, notravel_mi: 0, avg_risk: 0, ...over });

const route = (name: string, over = {}) => ({
  name,
  distance_mi: 1003.4,
  duration_s: 54900,
  synthesized: false,
  detour_via: null,
  summary: summary(),
  checkpoints: [cp(0, 0, "wind 12 mph: Low"), cp(25, 2, "wind 38 mph: High"), cp(50, null, "")],
  segments: [],
  ...over,
});

const PLAN = {
  routes: [route("Route A", { summary: summary({ high_mi: 12.5 }) }), route("Route B", { summary: summary({ high_mi: 48 }) }), route("Route C")],
  recommended: 0,
  why: "Wins on high miles: 12.5 mi vs 48.0 mi on Route B (both 0 severe).",
  routes_found: 3,
  cargo_lb: 35000,
};

function renderApp(planResponse: Response | Error, spacing?: string) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    if (planResponse instanceof Error) throw planResponse;
    return planResponse;
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Origin"), { target: { value: "Denver, CO" } });
  fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Chicago, IL" } });
  fireEvent.change(screen.getByLabelText("Departure"), { target: { value: "2030-01-15T08:00" } });
  fireEvent.change(screen.getByLabelText("Weight (lb)"), { target: { value: "70000" } });
  if (spacing) fireEvent.click(screen.getByRole("radio", { name: spacing }));
  fireEvent.click(screen.getByRole("button", { name: "Plan routes" }));
  return fetchMock;
}

test("planning a trip shows three ranked route cards with the recommendation", async () => {
  const fetchMock = renderApp(Response.json(PLAN));

  expect(await screen.findByText("3 routes · Route A recommended")).toBeTruthy();
  expect(screen.getByText("Ranked by severe miles, then high miles, average risk, travel time.")).toBeTruthy();
  const a = screen.getByRole("button", { name: /^Route A/ });
  expect(a.textContent).toContain("Recommended");
  expect(a.textContent).toContain("15h 15m");
  expect(a.textContent).toContain("1,003.4 mi · arrives");
  expect(a.textContent).toContain("12.5 mi");
  expect(a.textContent).toContain(PLAN.why);
  expect(screen.getByRole("button", { name: /^Route B/ }).textContent).not.toContain("Recommended");
  expect(a.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: /^Route B/ }).getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByText("map: 3 routes, selected 0")).toBeTruthy();

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/plan");
  expect(JSON.parse(String(init?.body))).toEqual({
    origin: "Denver, CO",
    destination: "Chicago, IL",
    departure: new Date("2030-01-15T08:00").toISOString(),
    weight_lb: 70000,
    interval_mi: 25,
  });
});

test("selecting a card emphasizes its route and lists its checkpoints", async () => {
  renderApp(Response.json(PLAN));
  fireEvent.click(await screen.findByRole("button", { name: /^Route B/ }));

  expect(screen.getByText("map: 3 routes, selected 1")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Route B/ })).toBeNull(); // expanded card is not a dead button
  expect(screen.getByText("3 checkpoints")).toBeTruthy();
  expect(screen.getByText("#2 · mi 25")).toBeTruthy();
  expect(screen.getByText("Wind 38 mph")).toBeTruthy();
  expect(screen.getByText("No data")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "All routes" }));
  expect(screen.getByRole("button", { name: /^Route C/ })).toBeTruthy();
});

test("a route with No Travel gets a banner and ranks last", async () => {
  const blocked = route("Route C", {
    summary: summary({ notravel_mi: 12 }),
    checkpoints: [cp(0, 0, "wind 5 mph: Low"), cp(25, 4, "wind 58 mph: No Travel", "2030-01-15T05:00:00")],
  });
  renderApp(Response.json({ ...PLAN, routes: [PLAN.routes[0], PLAN.routes[1], blocked] }));

  expect(await screen.findByText("Route C crosses a No Travel zone")).toBeTruthy();
  expect(screen.getByText(/^12 mi around .+ — wind 58 mph\. Ranked last\.$/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Route C/ }).textContent).toContain("No Travel");
});

test("when every route is blocked there is no recommendation", async () => {
  const blocked = (name: string) => route(name, { summary: summary({ notravel_mi: 5 }) });
  renderApp(Response.json({ ...PLAN, routes: ["Route A", "Route B", "Route C"].map(blocked), recommended: null, why: null }));

  expect(await screen.findByText("No safe route in this window")).toBeTruthy();
  expect(screen.getByText("Every route crosses a No Travel zone for a 35,000 lb load. No route is recommended.")).toBeTruthy();
  expect(screen.queryByText("Recommended")).toBeNull();
});

test("a synthesized detour is explained", async () => {
  const detour = route("Route B", { synthesized: true, detour_via: "Topeka, KS" });
  renderApp(Response.json({ ...PLAN, routes: [PLAN.routes[0], detour, PLAN.routes[2]], routes_found: 2 }));

  expect(await screen.findByText("Only 2 routes found — added a detour")).toBeTruthy();
  expect(screen.getByText("Route B goes via Topeka, KS so you can compare 3 options.")).toBeTruthy();
  expect(screen.getByText("via Topeka, KS · added detour")).toBeTruthy();
});

test("two detours are announced in the plural", async () => {
  const d = (name: string) => route(name, { synthesized: true, detour_via: null });
  renderApp(Response.json({ ...PLAN, routes: [PLAN.routes[0], d("Route B"), d("Route C")], routes_found: 1 }));
  expect(await screen.findByText("Only 1 route found — added 2 detours")).toBeTruthy();
});

test("fewer than three routes says why", async () => {
  renderApp(Response.json({ ...PLAN, routes: [PLAN.routes[0]], routes_found: 1 }));
  expect(await screen.findByText("1 route · Route A recommended")).toBeTruthy();
  expect(screen.getByText("Only 1 route found")).toBeTruthy();
});

test("checkpoint spacing toggle changes the requested interval", async () => {
  const fetchMock = renderApp(Response.json(PLAN), "10 mi");
  await screen.findByText("3 routes · Route A recommended");
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).interval_mi).toBe(10);
});

test("server validation errors show inline under their fields", async () => {
  renderApp(
    Response.json(
      { departure: ["Departure must be in the future."], destination: ["Destination must differ from origin."] },
      { status: 400 },
    ),
  );

  expect(await screen.findByText("Departure must be in the future.")).toBeTruthy();
  expect(screen.getByLabelText("Destination").getAttribute("aria-invalid")).toBe("true");
});

test("a routing failure shows the server message", async () => {
  renderApp(Response.json({ detail: "Routing service unavailable. Try again." }, { status: 502 }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Routing service unavailable. Try again.");
});

test("a network failure shows an alert instead of crashing", async () => {
  renderApp(new TypeError("Failed to fetch"));
  expect((await screen.findByRole("alert")).textContent).toBe("Can't reach the server. Check your connection and try again.");
});

test("a 400 without a field error still shows an alert", async () => {
  renderApp(Response.json({ detail: "JSON parse error" }, { status: 400 }));
  expect((await screen.findByRole("alert")).textContent).toBe("JSON parse error");
});
