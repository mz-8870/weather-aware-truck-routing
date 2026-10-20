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
