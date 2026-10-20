import { expect, test } from "vitest";
import { fitPadding } from "./mapFit";

test("desktop keeps the routes clear of the layer toggle, legend and slider dock", () => {
  expect(fitPadding({ phone: false, sheet: "open", viewportHeight: 900 })).toEqual({ top: 120, right: 320, bottom: 140, left: 48 });
});

test("phone keeps the routes above the open sheet and its dock, below the chips", () => {
  // sheet 45% of 800 = 360, dock 68 + gaps above it
  expect(fitPadding({ phone: true, sheet: "open", viewportHeight: 800 })).toEqual({ top: 84, right: 24, bottom: 360 + 108, left: 24 });
});

test("a collapsed phone sheet frees the map down to the peek height", () => {
  expect(fitPadding({ phone: true, sheet: "peek", viewportHeight: 800 }).bottom).toBe(120 + 108);
});
