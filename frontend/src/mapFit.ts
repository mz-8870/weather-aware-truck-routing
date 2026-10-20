import type { PaddingOptions } from "maplibre-gl";

// Room the map controls take, in px, so fitBounds frames the routes where nothing covers them.
// Keep in step with ForecastControls.module.css (toggle, legend, dock) and App.module.css (sheet heights).
const DESKTOP = { top: 120, right: 320, bottom: 140, left: 48 }; // toggle + loading chip, legend, dock
const PHONE_TOP = 84; // layer chips
const PHONE_SIDE = 24;
const PHONE_DOCK = 108; // slider dock above the sheet, with its gaps
const SHEET_OPEN = 0.45; // of the viewport height, as 45dvh
const SHEET_PEEK = 120;
const PIN = 16; // fitBounds centres a pin on the padding edge; half a 28 px pin, with slack
// When the map is too small for the full padding, keep a box for the routes: half the map, at most 160 px,
// so a narrow tablet still frames the trip instead of MapLibre refusing to fit.
// shortcut: on short phones (~667 px) with the sheet open this shrinks the dock reservation too, so a pin can touch
// the dock's top edge; shrink the top side first if that shows up in use.
const MIN_BOX = 160;

// Scale two opposite sides down together (keeping their ratio) so `size` still leaves the minimum box between them.
function fit(a: number, b: number, size: number): [number, number] {
  const room = Math.max(0, size - Math.min(size / 2, MIN_BOX));
  if (a + b <= room) return [a, b];
  const k = room / (a + b);
  return [Math.floor(a * k), Math.floor(b * k)];
}

export function fitPadding(o: { phone: boolean; sheet: "open" | "peek"; viewportHeight: number; mapWidth: number; mapHeight: number }): PaddingOptions {
  const sheetPx = o.sheet === "open" ? Math.round(o.viewportHeight * SHEET_OPEN) : SHEET_PEEK;
  const base = o.phone ? { top: PHONE_TOP, right: PHONE_SIDE, bottom: sheetPx + PHONE_DOCK, left: PHONE_SIDE } : DESKTOP;
  // Without this, MapLibre refuses to fit ("Map cannot fit within canvas") and the routes are never framed.
  const [left, right] = fit(base.left + PIN, base.right + PIN, o.mapWidth);
  const [top, bottom] = fit(base.top + PIN, base.bottom + PIN, o.mapHeight);
  return { top, right, bottom, left };
}

const LABEL_SPAN = [0.2, 0.8]; // keep tags off the shared ends, where the origin and destination pins sit
const LABEL_CANDIDATES = 200; // points tried per route; enough to find the widest gap, cheap on long trips

/** One [lon, lat] per route for its "Route X" tag. Route i searches its own stretch (the i-th of n slices of the
 *  20-80% window, by distance), so tags never stack where routes run together; within it, the point farthest from
 *  the other routes wins (ties: nearest the stretch's middle). */
export function labelPoints(paths: [number, number][][]): [number, number][] {
  const [lo, hi] = LABEL_SPAN;
  const slice = (hi - lo) / paths.length;
  return paths.map((path, r) => {
    const others = paths.filter((_, o) => o !== r).flat();
    const k = (lat: number) => Math.cos((lat * Math.PI) / 180); // degrees of longitude shrink away from the equator
    const dist = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * k(a[1]), a[1] - b[1]);
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + dist(path[i - 1], path[i]));
    const at = (i: number) => (cum[cum.length - 1] ? cum[i] / cum[cum.length - 1] : 0.5);
    const [from, to] = [lo + r * slice, lo + (r + 1) * slice];
    const mid = (from + to) / 2;
    const inside = path.map((_, i) => i).filter((i) => at(i) >= from - 1e-9 && at(i) <= to + 1e-9);
    // A long straight segment can leave a stretch without vertices: fall back to the vertex nearest its middle.
    const pool = inside.length ? inside : path.map((_, i) => i);
    pool.sort((a, b) => Math.abs(at(a) - mid) - Math.abs(at(b) - mid));
    const candidates = inside.length ? pool.filter((_, j) => j % Math.max(1, Math.floor(pool.length / LABEL_CANDIDATES)) === 0) : pool.slice(0, 1);
    let best = candidates[0];
    let bestGap = -1;
    for (const i of candidates) {
      const gap = Math.min(...others.map((o) => dist(path[i], o)));
      if (gap > bestGap + 1e-9) [best, bestGap] = [i, gap];
    }
    return path[best];
  });
}
