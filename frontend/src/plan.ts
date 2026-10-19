export type Trip = { origin: string; destination: string; departure: string; weight_lb: number; interval_mi: number };

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
};

export type Plan = {
  routes: Route[]; // best first
  recommended: number | null; // null when every route crosses No Travel
  why: string | null;
  routes_found: number; // how many TomTom returned before detours
  cargo_lb: number;
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
