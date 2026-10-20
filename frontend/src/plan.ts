export type Demo = "winter-storm" | "high-wind"; // backend/simulated.py STORMS

export type Trip = {
  origin: string;
  destination: string;
  origin_position?: [number, number]; // [lat, lon] from autosuggest; absent when the text was typed
  destination_position?: [number, number];
  departure: string;
  weight_lb: number;
  weight_mode: "cargo" | "gross";
  empty_truck_lb: number;
  axle_count?: number; // sent to TomTom only when set
  axle_weight_lb?: number;
  interval_mi: number;
  hos: boolean; // US hours-of-service stops in the ETAs; false = non-stop driving
  demo?: Demo; // example trips: a scripted storm instead of the live forecast
};

export type Checkpoint = {
  mile: number;
  lat: number;
  lon: number;
  offset_s: number;
  eta: string;
  level: number | null; // 0 Low … 4 No Travel; null = Unknown
  reasons: string[];
  beyond_forecast: boolean;
  wind_mph: number | null;
  gust_mph: number | null;
  rain_in_hr: number | null;
  snow_in_hr: number | null;
  owned_mi: number;
};

export type Stop = {
  kind: "break" | "rest"; // 30 min break after 8 h of driving, 10 h rest after 11 h
  mile: number;
  lat: number;
  lon: number;
  offset_s: number; // wall-clock seconds after departure
  start: string;
  duration_s: number;
  place: string | null; // nearest town, when TomTom knows one
};

export type Segment = { level: number | null; coordinates: [number, number][] };

export type Summary = { severe_mi: number; high_mi: number; unknown_mi: number; notravel_mi: number; avg_risk: number | null };

export type Route = {
  name: string;
  distance_mi: number;
  duration_s: number;
  synthesized: boolean; // a via-point detour added because TomTom returned fewer than 3 routes
  detour_via: string | null;
  summary: Summary;
  checkpoints: Checkpoint[];
  segments: Segment[];
  trip_s: number; // departure to arrival, including stops
  stops: Stop[]; // empty unless HOS breaks were asked for
  weather_delay_s: number; // driving time added by bad-weather slowdowns (already in duration_s and the ETAs)
};

export type Plan = {
  routes: Route[]; // best first
  recommended: number | null; // null when every route crosses No Travel
  why: string | null;
  // When every route is blocked: the first later departure (1–48 h) with a route clear of No Travel, if any.
  earliest_clear_departure: { hours_later: number; departure: string; route: string } | null;
  routes_found: number; // how many TomTom returned before detours
  cargo_lb: number;
  demo: Demo | null; // the scripted storm used instead of the live forecast, if any
};

export type ApiError = { status: number; body: Record<string, string[] | string> };

export async function planTrip(trip: Trip): Promise<Plan> {
  const res = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(trip),
  }).catch(() => {
    throw { status: 0, body: { detail: "Can't reach the server. Check your connection and try again." } } satisfies ApiError;
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, body } satisfies ApiError;
  return body;
}
