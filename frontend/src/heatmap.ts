import type { Checkpoint, Route, Stop } from "./plan";

export const VARIABLES = ["risk", "wind", "rain", "snow"] as const;
export type Variable = (typeof VARIABLES)[number];

export type Heatmap = {
  hours: string[]; // 49 ISO hours from the departure hour
  cells: [number, number][]; // [lon, lat]
  spacing_mi: number; // grid spacing: 25, or 50 for long corridors (Open-Meteo's per-minute budget)
  levels: Record<Variable, (number | null)[][]>; // [hour][cell] -> 0–4, null = Unknown
};

export type HeatmapQuery = { points: [number, number][]; departure: string; cargo_lb: number; demo?: string };

export async function fetchHeatmap(query: HeatmapQuery): Promise<Heatmap> {
  const res = await fetch("/api/heatmap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });
  if (!res.ok) throw new Error(`heatmap ${res.status}`);
  return res.json();
}

type Keyframe = Pick<Checkpoint, "lat" | "lon" | "offset_s">;

/** [lon, lat] of a truck `seconds` after departure, interpolated between checkpoints by their offsets; parked during HOS stops. */
export function truckPosition(
  route: { checkpoints: Keyframe[]; stops?: Pick<Stop, "lat" | "lon" | "offset_s" | "duration_s">[] },
  seconds: number,
): [number, number] {
  const parked = (route.stops ?? []).flatMap((s) => [s, { ...s, offset_s: s.offset_s + s.duration_s }]);
  const cps: Keyframe[] = parked.length ? [...route.checkpoints, ...parked].sort((a, b) => a.offset_s - b.offset_s) : route.checkpoints;
  const next = cps.findIndex((c) => c.offset_s > seconds);
  if (next === -1) return [cps[cps.length - 1].lon, cps[cps.length - 1].lat];
  if (next === 0) return [cps[0].lon, cps[0].lat];
  const a = cps[next - 1];
  const b = cps[next];
  const t = (seconds - a.offset_s) / (b.offset_s - a.offset_s);
  return [a.lon + (b.lon - a.lon) * t, a.lat + (b.lat - a.lat) * t];
}

export const heatmapQuery = (routes: Route[], departure: string, cargo_lb: number, demo?: string): HeatmapQuery => ({
  points: routes.flatMap((r) => r.checkpoints.map((c): [number, number] => [c.lat, c.lon])),
  departure,
  cargo_lb,
  demo,
});
