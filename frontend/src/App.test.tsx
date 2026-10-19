import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";

// MapLibre needs WebGL, which jsdom lacks; the map is checked in the browser instead.
vi.mock("./RouteMap", () => ({
  RouteMap: ({ coordinates }: { coordinates?: number[][] }) => <div>map: {coordinates?.length ?? 0} points</div>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ROUTE = { coordinates: [[-104.99, 39.74], [-100, 40.5], [-87.63, 41.88]], distance_mi: 1003.4, duration_s: 54900 };

function renderApp(planResponse: Response | Error) {
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
  fireEvent.click(screen.getByRole("button", { name: "Plan routes" }));
  return fetchMock;
}

test("planning a trip draws the route and shows distance and duration", async () => {
  const fetchMock = renderApp(Response.json({ routes: [ROUTE] }));

  expect(await screen.findByText("1,003.4 mi")).toBeTruthy();
  expect(screen.getByText("15 h 15 min")).toBeTruthy();
  expect(screen.getByText("map: 3 points")).toBeTruthy();

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/plan");
  expect(JSON.parse(String(init?.body))).toEqual({
    origin: "Denver, CO",
    destination: "Chicago, IL",
    departure: new Date("2030-01-15T08:00").toISOString(),
    weight_lb: 70000,
  });
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
