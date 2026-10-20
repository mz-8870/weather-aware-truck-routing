import { expect, test } from "vitest";
import { fitPadding, labelPoints } from "./mapFit";

const desktop = { phone: false, sheet: "open" as const, viewportHeight: 900, mapWidth: 1000, mapHeight: 844 };
const phone = { phone: true, sheet: "open" as const, viewportHeight: 800, mapWidth: 390, mapHeight: 748 };

// fitBounds puts a pin's centre on the padding edge; the pins are 28 px, so every side adds half a pin (16 with slack).
test("desktop keeps the routes and their pins clear of the layer toggle, legend and slider dock", () => {
  expect(fitPadding(desktop)).toEqual({ top: 136, right: 336, bottom: 156, left: 64 });
});

test("phone keeps the routes above the open sheet and its dock, below the chips", () => {
  // sheet 45% of 800 = 360, dock with its gaps 108, half a pin 16
  expect(fitPadding(phone)).toEqual({ top: 100, right: 40, bottom: 360 + 108 + 16, left: 40 });
});

test("a collapsed phone sheet frees the map down to the peek height", () => {
  expect(fitPadding({ ...phone, sheet: "peek" }).bottom).toBe(120 + 108 + 16);
});

test("a roomy map keeps the full padding", () => {
  expect(fitPadding({ ...desktop, mapWidth: 1440 }).right).toBe(336);
});

test("a map too narrow for the desktop padding still leaves a box to frame the routes in", () => {
  const p = fitPadding({ ...desktop, mapWidth: 327 }); // iPad portrait: 768 px minus the sidebar
  expect(327 - p.left! - p.right!).toBeGreaterThanOrEqual(160); // a real frame for the routes, not a sliver
  expect(p.right).toBeGreaterThan(p.left!); // still leans away from the legend
});

test("a short map shrinks the top and bottom padding the same way", () => {
  const p = fitPadding({ ...phone, viewportHeight: 360, mapHeight: 308 }); // landscape phone
  expect(308 - p.top! - p.bottom!).toBeGreaterThanOrEqual(308 / 2);
});

const line = (lat: number, lons: number[]) => lons.map((lon) => [lon, lat] as [number, number]);
const lons = Array.from({ length: 21 }, (_, i) => i); // 0..20

test("each route's tag goes in its own stretch of the trip, so tags never stack even where routes run together", () => {
  const [a, b, c] = labelPoints([line(40, lons), line(40.01, lons), line(39.99, lons)]);
  // Routes this close tie everywhere; each takes the middle of its third of the 20-80% window.
  expect([a[0], b[0], c[0]]).toEqual([6, 10, 14]);
});

test("within its stretch, a tag sits where its route is farthest from the others", () => {
  // B bows south in its own stretch (the second half of the window, miles 10-16): its tag goes to the bow.
  const a = line(40, lons);
  const b: [number, number][] = lons.map((lon) => [lon, lon === 15 ? 38 : lon === 14 || lon === 16 ? 39 : 40]);
  expect(labelPoints([a, b])[1]).toEqual([15, 38]);
});

test("tags keep off the shared ends where the origin and destination pins are", () => {
  for (const [lon] of labelPoints([line(40, lons), line(41, lons)])) expect(lon >= 4 && lon <= 16).toBe(true);
});

test("a single route is tagged at its middle", () => {
  expect(labelPoints([line(40, [0, 1, 2, 3, 4])])).toEqual([[2, 40]]);
});
