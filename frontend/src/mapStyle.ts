import type { StyleSpecification } from "maplibre-gl";
import type { Mode } from "./tokens/theme";
import { tokens } from "./tokens/tokens";

// OpenFreeMap: free OpenMapTiles-schema vector tiles, no key. Colors come from the map-* tokens.
export function mapStyle(mode: Mode): StyleSpecification {
  const c = (name: keyof typeof tokens.color) => tokens.color[name][mode];
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: { omt: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
    layers: [
      { id: "land", type: "background", paint: { "background-color": c("map-land") } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": c("map-water") } },
      {
        id: "boundary",
        type: "line",
        source: "omt",
        "source-layer": "boundary",
        // Some boundary features have no admin_level; coalesce so they are skipped instead of warning.
        filter: ["<=", ["coalesce", ["get", "admin_level"], 99], 4],
        paint: { "line-color": c("map-border"), "line-width": 1, "line-dasharray": [3, 2] },
      },
      {
        id: "roads",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        filter: ["match", ["get", "class"], ["motorway", "trunk", "primary"], true, false],
        paint: { "line-color": c("map-road"), "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 10, 2] },
      },
      {
        id: "places",
        type: "symbol",
        source: "omt",
        "source-layer": "place",
        filter: ["match", ["get", "class"], ["state", "city"], true, false],
        layout: {
          "text-field": ["get", "name:latin"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["match", ["get", "class"], "state", 11, 12],
          "text-transform": ["match", ["get", "class"], "state", "uppercase", "none"],
        },
        paint: { "text-color": c("map-label"), "text-halo-color": c("map-land"), "text-halo-width": 1 },
      },
    ],
  };
}
