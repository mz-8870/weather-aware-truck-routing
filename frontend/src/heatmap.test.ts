import { expect, test } from "vitest";
import { truckPosition } from "./heatmap";

const route = {
  checkpoints: [
    { lat: 40, lon: -100, offset_s: 0 },
    { lat: 41, lon: -98, offset_s: 3600 },
    { lat: 43, lon: -98, offset_s: 7200 },
  ],
};

test("truck starts at the origin", () => {
  expect(truckPosition(route, 0)).toEqual([-100, 40]);
});

test("truck sits on a checkpoint at its offset", () => {
  expect(truckPosition(route, 3600)).toEqual([-98, 41]);
});

test("truck is interpolated between checkpoints by time", () => {
  expect(truckPosition(route, 1800)).toEqual([-99, 40.5]);
  expect(truckPosition(route, 5400)).toEqual([-98, 42]);
});

test("truck waits at the destination after arrival", () => {
  expect(truckPosition(route, 48 * 3600)).toEqual([-98, 43]);
});
