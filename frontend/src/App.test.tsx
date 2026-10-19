import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";

// MapLibre needs WebGL, which jsdom lacks; the map is checked in the browser instead.
vi.mock("./RouteMap", () => ({
  RouteMap: ({ routes, selected, heat, trucks }: { routes?: unknown[]; selected: number; heat?: { levels: unknown[] }; trucks?: number[][] }) => (
    <div>
      <div>
        map: {routes?.length ?? 0} routes, selected {selected}
      </div>
      <div>heat: {heat ? heat.levels.join(",") : "none"}</div>
      <div>trucks: {trucks?.map((t) => t.join(" ")).join(" | ")}</div>
    </div>
  ),
}));

// Radix Slider measures its thumb; jsdom has no ResizeObserver.
class NoResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
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

const SUGGESTIONS = {
  suggestions: [
    { label: "Salt Lake City, UT", kind: "City", lat: 40.758478, lon: -111.888142 },
    { label: "Salt Lake City International Airport", kind: "Airport", lat: 40.7884, lon: -111.9778 },
  ],
};

// Two cells; hour h has risk levels [h, null] so the slider position is visible in the mocked map.
const HEATMAP = {
  hours: Array.from({ length: 49 }, (_, h) => new Date(Date.UTC(2030, 0, 15, 15 + h)).toISOString()),
  cells: [
    [-100, 41],
    [-99, 41],
  ],
  levels: Object.fromEntries(["risk", "wind", "rain", "snow"].map((v, i) => [v, Array.from({ length: 49 }, (_, h) => [Math.min(4, h + i), null])])),
};

function stubFetch(planResponse: Response | Error | Promise<Response>, heatmapResponse: Response = Response.json(HEATMAP)) {
  vi.stubGlobal("ResizeObserver", NoResizeObserver);
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === "/api/heatmap") return heatmapResponse.clone();
    if (url.startsWith("/api/geocode")) {
      if (url.includes("q=Salt+Lak")) return Response.json({ suggestions: SUGGESTIONS.suggestions.slice(0, 1) });
      return Response.json(url.includes("q=Salt") ? SUGGESTIONS : { suggestions: [] });
    }
    if (planResponse instanceof Error) throw planResponse;
    if (planResponse instanceof Promise) return planResponse;
    return planResponse.clone(); // a body can be read once; tests may submit more than once
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const planCall = (fetchMock: ReturnType<typeof stubFetch>) => fetchMock.mock.calls.find(([url]) => url === "/api/plan");
const geocodeCalls = (fetchMock: ReturnType<typeof stubFetch>) => fetchMock.mock.calls.filter(([url]) => url.startsWith("/api/geocode"));

const card = (name: string) => screen.getByRole("article", { name });

function renderApp(planResponse: Response | Error | Promise<Response>, spacing?: string, heatmapResponse?: Response) {
  const fetchMock = stubFetch(planResponse, heatmapResponse);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Origin"), { target: { value: "Denver, CO" } });
  fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Chicago, IL" } });
  fireEvent.change(screen.getByLabelText("Departure"), { target: { value: "2030-01-15T08:00" } });
  fireEvent.change(screen.getByLabelText("Cargo weight (lb)"), { target: { value: "70000" } });
  if (spacing) fireEvent.click(screen.getByRole("radio", { name: spacing }));
  fireEvent.click(screen.getByRole("button", { name: "Plan routes" }));
  return fetchMock;
}

test("planning a trip shows three ranked route cards with the recommendation", async () => {
  const fetchMock = renderApp(Response.json(PLAN));

  expect(await screen.findByText("3 routes · Route A recommended")).toBeTruthy();
  expect(screen.getByText("Ranked by severe miles, then high miles, average risk, travel time.")).toBeTruthy();
  const a = card("Route A");
  expect(a.textContent).toContain("Recommended");
  expect(a.textContent).toContain("15h 15m");
  expect(a.textContent).toContain("1,003.4 mi · arrives");
  expect(a.textContent).toContain("12.5 mi");
  expect(a.textContent).toContain(PLAN.why);
  expect(card("Route B").textContent).not.toContain("Recommended");
  expect(screen.getByRole("button", { name: "Route A", description: /^Recommended 15h 15m 1,003\.4 mi · arrives/ }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Route B" }).getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByText("map: 3 routes, selected 0")).toBeTruthy();

  const [, init] = planCall(fetchMock)!;
  expect(JSON.parse(String(init?.body))).toEqual({
    origin: "Denver, CO",
    destination: "Chicago, IL",
    departure: new Date("2030-01-15T08:00").toISOString(),
    weight_lb: 70000,
    weight_mode: "cargo",
    empty_truck_lb: 35000,
    interval_mi: 25,
  });
});

test("a route with no severe, high or unknown miles says so once instead of three zeros", async () => {
  renderApp(Response.json(PLAN));
  await screen.findByText("3 routes · Route A recommended");
  expect(card("Route C").textContent).toContain("No severe, high or unknown miles");
  expect(card("Route C").textContent).not.toContain("Severe");
  expect(card("Route A").textContent).not.toContain("No severe, high or unknown miles");
});

test("selecting a card emphasizes its route and lists its checkpoints", async () => {
  renderApp(Response.json(PLAN));
  fireEvent.click(await screen.findByRole("button", { name: "Route B" }));

  expect(screen.getByText("map: 3 routes, selected 1")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Route B" })).toBeNull(); // expanded card is not a dead button
  expect(card("Route B")).toBeTruthy();
  expect(screen.getByText("3 checkpoints")).toBeTruthy();
  expect(screen.getByText("#2 · mi 25")).toBeTruthy();
  expect(screen.getByText("Wind 38 mph")).toBeTruthy();
  expect(screen.getByText("No data")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "All routes" }));
  expect(screen.getByRole("button", { name: "Route C" })).toBeTruthy();
});

test("a route with No Travel gets a banner and ranks last", async () => {
  const blocked = route("Route C", {
    summary: summary({ notravel_mi: 12 }),
    checkpoints: [cp(0, 0, "wind 5 mph: Low"), cp(25, 4, "wind 58 mph: No Travel", "2030-01-15T05:00:00")],
  });
  renderApp(Response.json({ ...PLAN, routes: [PLAN.routes[0], PLAN.routes[1], blocked] }));

  expect(await screen.findByText("Route C crosses a No Travel zone")).toBeTruthy();
  expect(screen.getByText(/^12 mi around .+ — wind 58 mph\. Ranked last\.$/)).toBeTruthy();
  expect(card("Route C").textContent).toContain("No Travel");
  expect(card("Route C").textContent).not.toContain("No severe, high or unknown miles"); // no all-clear on a blocked route
  const described = screen.getByRole("button", { name: "Route C" }).getAttribute("aria-describedby")!.split(" ");
  expect(described.map((id) => document.getElementById(id)?.textContent).join(" ")).toContain("No Travel"); // heard on focus
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
  expect(JSON.parse(String(planCall(fetchMock)![1]?.body)).interval_mi).toBe(10);
});

const heatmapCalls = (fetchMock: ReturnType<typeof stubFetch>) => fetchMock.mock.calls.filter(([url]) => url === "/api/heatmap");

test("after routes appear the heatmap loads for every route's checkpoints; scrubbing never refetches", async () => {
  const fetchMock = renderApp(Response.json(PLAN));
  expect(await screen.findByText("heat: 0,")).toBeTruthy();
  expect(JSON.parse(String(heatmapCalls(fetchMock)[0][1]?.body))).toEqual({
    points: Array(9).fill([41, -100]),
    departure: new Date("2030-01-15T08:00").toISOString(),
    cargo_lb: 35000,
  });
  expect(screen.getByText("Risk along corridor")).toBeTruthy();
  expect(screen.getByText("+0 h · Tue 08:00")).toBeTruthy();

  const slider = screen.getByRole("slider", { name: "Forecast hour" });
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(screen.getByText("+2 h · Tue 10:00")).toBeTruthy();
  expect(slider.getAttribute("aria-valuetext")).toBe("+2 h, Tue 10:00");
  expect(screen.getByText("heat: 2,")).toBeTruthy();
  // offset_s = mile * 54, so 2 h in all three trucks have passed the last checkpoint (mile 50).
  expect(screen.getByText("trucks: -100 41 | -100 41 | -100 41")).toBeTruthy();
  expect(heatmapCalls(fetchMock)).toHaveLength(1);
});

test("play advances the forecast hour", async () => {
  renderApp(Response.json(PLAN));
  await screen.findByText("heat: 0,");
  fireEvent.click(screen.getByRole("button", { name: "Play" }));
  expect(await screen.findByText("+1 h · Tue 09:00", {}, { timeout: 2000 })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
});

test("the layer toggle switches the heatmap variable and its legend; Off hides both", async () => {
  renderApp(Response.json(PLAN));
  await screen.findByText("heat: 0,");
  expect(within(screen.getByRole("region", { name: "Legend" })).getByText("Sev")).toBeTruthy();

  fireEvent.click(screen.getByRole("radio", { name: "Wind" }));
  expect(screen.getByText("heat: 1,")).toBeTruthy();
  expect(screen.getByText("Wind along corridor")).toBeTruthy();
  expect(screen.getByText("≥ 45 mph")).toBeTruthy();

  fireEvent.click(screen.getByRole("radio", { name: "Rain" }));
  expect(screen.getByText("> 1.00 in/hr")).toBeTruthy();

  fireEvent.click(screen.getByRole("radio", { name: "Off" }));
  expect(screen.getByText("heat: none")).toBeTruthy();
  expect(screen.queryByText("Rain along corridor")).toBeNull();
});

test("a heatmap failure leaves the routes usable and offers a retry", async () => {
  const fetchMock = renderApp(Response.json(PLAN), undefined, Response.json({ detail: "Weather layer didn't load." }, { status: 502 }));
  expect(await screen.findByText("Weather layer didn't load")).toBeTruthy();
  expect(screen.getByText("3 routes · Route A recommended")).toBeTruthy();
  expect(screen.getByText("heat: none")).toBeTruthy();
  expect(screen.getByRole("slider", { name: "Forecast hour" })).toBeTruthy(); // trucks still scrub

  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(heatmapCalls(fetchMock)).toHaveLength(2));
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

test("a routing outage keeps the trip, and Try again re-sends only the plan request", async () => {
  const fetchMock = renderApp(Response.json({ detail: "Routing service unavailable. Try again." }, { status: 502 }));
  expect(await screen.findByText("Couldn't reach the routing service")).toBeTruthy();
  expect(screen.getByText("Nothing was lost — your trip details are kept. This is usually temporary.")).toBeTruthy();
  const others = fetchMock.mock.calls.length - 1;

  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === "/api/plan")).toHaveLength(2));
  const plans = fetchMock.mock.calls.filter(([url]) => url === "/api/plan");
  expect(plans[1][1]?.body).toBe(plans[0][1]?.body);
  expect(fetchMock.mock.calls.length - 2).toBe(others); // nothing but the plan was re-sent
});

test("a network failure shows the outage state instead of crashing", async () => {
  renderApp(new TypeError("Failed to fetch"));
  expect(await screen.findByText("Couldn't reach the routing service")).toBeTruthy();
});

test("no drivable route has its own state, and Edit trip reopens the form", async () => {
  renderApp(Response.json({ detail: "No truck route found for this trip.", code: "no_route" }, { status: 422 }));
  expect(await screen.findByText("No drivable route found")).toBeTruthy();
  expect(
    screen.getByText("There's no road connection between these places for a truck. Check the destination, or pick a point on the mainland."),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Edit trip" }));
  expect((screen.getByLabelText("Destination") as HTMLInputElement).value).toBe("Chicago, IL");
});

test("a place that can't be found reopens the form with the message", async () => {
  renderApp(Response.json({ detail: "Couldn't find 'Chicagoo'." }, { status: 422 }));
  expect((await screen.findByRole("alert")).textContent).toBe("Couldn't find 'Chicagoo'.");
  expect(screen.getByLabelText("Origin")).toBeTruthy();
});

test("the empty state explains the map and offers example trips that plan in one click", async () => {
  const fetchMock = stubFetch(Response.json(PLAN));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("heading", { name: "Plan a trip" })).toBeTruthy();
  expect(screen.getByText("Your routes will appear here")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Amarillo → Oklahoma City · high wind" }));
  expect(await screen.findByText("3 routes · Route A recommended")).toBeTruthy();
  const body = JSON.parse(String(planCall(fetchMock)![1]?.body));
  expect(body).toMatchObject({ origin: "Amarillo, TX", destination: "Oklahoma City, OK", weight_lb: 32000, interval_mi: 25 });
  expect(new Date(body.departure).getTime()).toBeGreaterThan(Date.now());
  expect(screen.queryByText("Your routes will appear here")).toBeNull();
});

test("while planning, the form collapses to a trip summary above skeleton cards", async () => {
  renderApp(new Promise<Response>(() => {}));
  expect(await screen.findByRole("heading", { name: "Finding routes…" })).toBeTruthy();
  expect(screen.getByText("Getting 3 truck routes, then checking the weather at each checkpoint.")).toBeTruthy();
  expect(screen.getByText("Denver, CO → Chicago, IL")).toBeTruthy();
  expect(screen.getByText("Tue 08:00 · 70,000 lb · every 25 mi")).toBeTruthy();
  expect(screen.queryByLabelText("Origin")).toBeNull();
});

test("Edit reopens the form with the trip filled in", async () => {
  renderApp(Response.json(PLAN));
  await screen.findByText("3 routes · Route A recommended");
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect((screen.getByLabelText("Origin") as HTMLInputElement).value).toBe("Denver, CO");
  expect(screen.getByText("3 routes · Route A recommended")).toBeTruthy(); // results stay under the form
});

test("a 400 without a field error still shows an alert", async () => {
  renderApp(Response.json({ detail: "JSON parse error" }, { status: 400 }));
  expect((await screen.findByRole("alert")).textContent).toBe("JSON parse error");
});

test("typing 3+ characters suggests places; arrows + Enter pick one and planning uses its coordinates", async () => {
  const fetchMock = stubFetch(Response.json(PLAN));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
  const destination = screen.getByRole("combobox", { name: "Destination" });
  fireEvent.change(destination, { target: { value: "Sal" } });
  fireEvent.change(destination, { target: { value: "Salt La" } });

  expect(await screen.findByRole("option", { name: /Salt Lake City International Airport/ })).toBeTruthy();
  expect(geocodeCalls(fetchMock).map(([url]) => url)).toEqual(["/api/geocode?q=Salt+La"]); // debounced; "Sal" never sent
  fireEvent.keyDown(destination, { key: "ArrowUp" }); // wraps to the last option
  expect(destination.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[1].id);
  fireEvent.keyDown(destination, { key: "ArrowDown" });
  fireEvent.keyDown(destination, { key: "ArrowDown" });
  expect(destination.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[1].id);
  fireEvent.keyDown(destination, { key: "Enter" });

  expect((destination as HTMLInputElement).value).toBe("Salt Lake City International Airport");
  expect(screen.queryByRole("listbox")).toBeNull();
  fireEvent.change(screen.getByLabelText("Origin"), { target: { value: "Denver, CO" } });
  fireEvent.change(screen.getByLabelText("Departure"), { target: { value: "2030-01-15T08:00" } });
  fireEvent.change(screen.getByLabelText("Cargo weight (lb)"), { target: { value: "70000" } });
  fireEvent.click(screen.getByRole("button", { name: "Plan routes" }));

  await screen.findByText("3 routes · Route A recommended");
  const body = JSON.parse(String(planCall(fetchMock)![1]?.body));
  expect(body.destination).toBe("Salt Lake City International Airport");
  expect(body.destination_position).toEqual([40.7884, -111.9778]);
  expect(body.origin_position).toBeUndefined(); // typed, never picked
});

test("a refreshed suggestion list resets the highlighted option", async () => {
  stubFetch(Response.json(PLAN));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
  const destination = screen.getByRole("combobox", { name: "Destination" });
  fireEvent.change(destination, { target: { value: "Salt La" } });
  await screen.findAllByRole("option");
  fireEvent.change(destination, { target: { value: "Salt Lak" } });
  // Within the debounce the old 2-option list is still shown: highlight its second option…
  fireEvent.keyDown(destination, { key: "ArrowDown" });
  fireEvent.keyDown(destination, { key: "ArrowDown" });
  // …then the new 1-option list arrives; the highlight must not point past it.
  await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
  expect(destination.getAttribute("aria-activedescendant")).toBeNull();
  fireEvent.keyDown(destination, { key: "Enter" }); // nothing active: must not throw
});

test("editing a picked place drops its coordinates; Escape closes the list", async () => {
  const fetchMock = stubFetch(Response.json(PLAN));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
  const origin = screen.getByRole("combobox", { name: "Origin" });
  fireEvent.change(origin, { target: { value: "Salt La" } });
  fireEvent.click(await screen.findByRole("option", { name: /Salt Lake City, UT/ }));
  fireEvent.change(origin, { target: { value: "Salt Lake City, UT!" } });
  fireEvent.keyDown(origin, { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull();

  fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Chicago, IL" } });
  fireEvent.change(screen.getByLabelText("Departure"), { target: { value: "2030-01-15T08:00" } });
  fireEvent.change(screen.getByLabelText("Cargo weight (lb)"), { target: { value: "70000" } });
  fireEvent.click(screen.getByRole("button", { name: "Plan routes" }));
  await screen.findByText("3 routes · Route A recommended");
  expect(JSON.parse(String(planCall(fetchMock)![1]?.body)).origin_position).toBeUndefined();
});

function fillTrip(weight: string) {
  fireEvent.change(screen.getByLabelText("Origin"), { target: { value: "Denver, CO" } });
  fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Chicago, IL" } });
  fireEvent.change(screen.getByLabelText("Departure"), { target: { value: "2030-01-15T08:00" } });
  fireEvent.change(screen.getByLabelText(/^(Cargo|Gross) weight \((lb|kg)\)$/), { target: { value: weight } });
}

async function submittedBody(fetchMock: ReturnType<typeof stubFetch>) {
  fireEvent.click(screen.getByRole("button", { name: "Plan routes" }));
  await screen.findByText("3 routes · Route A recommended");
  return JSON.parse(String(planCall(fetchMock)![1]?.body));
}

function renderBare() {
  const fetchMock = stubFetch(Response.json(PLAN));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
  return fetchMock;
}

test("weight can be entered as gross; the label follows the mode", async () => {
  const fetchMock = renderBare();
  fireEvent.click(screen.getByRole("radio", { name: "Gross (truck + cargo)" }));
  expect(screen.getByLabelText("Gross weight (lb)")).toBeTruthy();
  fillTrip("67000");
  const body = await submittedBody(fetchMock);
  expect(body.weight_mode).toBe("gross");
  expect(body.weight_lb).toBe(67000);
});

test("over 80,000 lb gross warns but still plans", async () => {
  const fetchMock = renderBare();
  fillTrip("50000"); // cargo 50,000 + empty 35,000 = 85,000 gross
  expect(screen.getByText("Over 80,000 lb gross")).toBeTruthy();
  expect(screen.getByLabelText("Cargo weight (lb)").getAttribute("aria-invalid")).toBeNull();
  expect((await submittedBody(fetchMock)).weight_lb).toBe(50000);
});

test("advanced options send empty-truck weight, and axle params only when filled", async () => {
  const fetchMock = renderBare();
  const toggle = screen.getByRole("button", { name: "Advanced: empty-truck weight, axles" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  fireEvent.change(screen.getByLabelText("Empty truck weight (lb)"), { target: { value: "30000" } });
  fireEvent.change(screen.getByLabelText("Axles (optional)"), { target: { value: "5" } });
  fillTrip("32000");
  let body = await submittedBody(fetchMock);
  expect(body.empty_truck_lb).toBe(30000);
  expect(body.axle_count).toBe(5);
  expect(body).not.toHaveProperty("axle_weight_lb");

  fireEvent.click(screen.getByRole("button", { name: "Edit" })); // the form collapses to a summary after planning
  fireEvent.change(screen.getByLabelText("Weight per axle (lb)"), { target: { value: "20000" } });
  fetchMock.mockClear();
  body = await submittedBody(fetchMock);
  expect(body.axle_weight_lb).toBe(20000);
});

test("a server error on a collapsed advanced field opens the section to show it", async () => {
  stubFetch(Response.json({ axle_count: ["Ensure this value is greater than or equal to 2."] }, { status: 400 }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
  fillTrip("32000");
  fireEvent.click(screen.getByRole("button", { name: "Plan routes" }));
  expect(await screen.findByText("Ensure this value is greater than or equal to 2.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Advanced: empty-truck weight, axles" }).getAttribute("aria-expanded")).toBe("true");
});

test("toggling units converts every number on screen without a new request; Undo restores", async () => {
  const fetchMock = renderApp(Response.json(PLAN));
  await screen.findByText("3 routes · Route A recommended");
  fireEvent.click(screen.getByRole("radio", { name: "Metric" }));

  const a = card("Route A");
  expect(a.textContent).toContain("1,614.8 km · arrives");
  expect(a.textContent).toContain("20.1 km"); // 12.5 high mi
  expect(a.textContent).toContain("Wins on high km: 20.1 km vs 77.2 km on Route B (both 0 severe).");
  expect(screen.getByText(/· every 40 km$/)).toBeTruthy(); // the trip summary follows; value stays 25 mi
  expect(fetchMock.mock.calls.filter(([url]) => url === "/api/plan")).toHaveLength(1);
  expect(localStorage.getItem("units")).toBe("metric");

  expect(screen.getAllByText("Units switched to metric").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(card("Route A").textContent).toContain("1,003.4 mi · arrives");
});

test("a metric weight plans with the same pounds as the imperial one", async () => {
  const fetchMock = stubFetch(Response.json(PLAN));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Metric" }));
  expect(screen.getByText("Max 36,287 kg gross")).toBeTruthy();
  expect(screen.getByLabelText("Cargo weight (kg)")).toBeTruthy();
  fillTrip("14515");
  const body = await submittedBody(fetchMock);
  expect(body.weight_lb).toBe(32000);
  expect(body.empty_truck_lb).toBe(35000); // untouched default stays exact
});

test("departure shows the user's time zone", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
  expect(screen.getByText(/^Your time zone \(.+\)$/)).toBeTruthy();
});
