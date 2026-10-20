import type { PaddingOptions } from "maplibre-gl";

// Room the map controls take, in px, so fitBounds frames the routes where nothing covers them.
// Keep in step with ForecastControls.module.css (toggle, legend, dock) and App.module.css (sheet heights).
const DESKTOP: PaddingOptions = { top: 120, right: 320, bottom: 140, left: 48 }; // toggle + loading chip, legend, dock
const PHONE_TOP = 84; // layer chips
const PHONE_SIDE = 24;
const PHONE_DOCK = 108; // slider dock above the sheet, with its gaps
const SHEET_OPEN = 0.45; // of the viewport height, as 45dvh
const SHEET_PEEK = 120;

export function fitPadding({ phone, sheet, viewportHeight }: { phone: boolean; sheet: "open" | "peek"; viewportHeight: number }): PaddingOptions {
  if (!phone) return DESKTOP;
  const sheetPx = sheet === "open" ? Math.round(viewportHeight * SHEET_OPEN) : SHEET_PEEK;
  return { top: PHONE_TOP, right: PHONE_SIDE, bottom: sheetPx + PHONE_DOCK, left: PHONE_SIDE };
}
