// MapLibre's own filter engine (ships with maplibre-gl) evaluates the style's filters the way the map worker does.
import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import type { FilterSpecification } from "maplibre-gl";
import { afterEach, expect, test, vi } from "vitest";
import { mapStyle } from "./mapStyle";

afterEach(() => vi.restoreAllMocks());

const boundary = () => {
  const layer = mapStyle("light").layers.find((l) => l.id === "boundary")!;
  return featureFilter((layer as { filter: FilterSpecification }).filter, "layers[boundary].filter");
};
const feature = (properties: Record<string, unknown>) => ({ type: 2 as const, properties, geometry: [] });

test("boundaries without an admin level are skipped quietly", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(boundary().filter({ zoom: 4 }, feature({ maritime: 0 }))).toBe(false);
  expect(warn).not.toHaveBeenCalled();
});

test("country and state boundaries are drawn, county ones are not", () => {
  expect(boundary().filter({ zoom: 4 }, feature({ admin_level: 2 }))).toBe(true);
  expect(boundary().filter({ zoom: 4 }, feature({ admin_level: 4 }))).toBe(true);
  expect(boundary().filter({ zoom: 4 }, feature({ admin_level: 6 }))).toBe(false);
});
