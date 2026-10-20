import { expect, test } from "vitest";
import { fitPadding } from "./mapFit";

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
