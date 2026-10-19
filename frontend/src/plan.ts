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

export type Route = { distance_mi: number; duration_s: number; checkpoints: Checkpoint[]; segments: Segment[] };

export type ApiError = { status: number; body: Record<string, string[] | string> };

export async function planTrip(trip: Trip): Promise<{ routes: Route[] }> {
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
