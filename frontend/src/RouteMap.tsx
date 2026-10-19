import type { FeatureCollection } from "geojson";
import { LngLatBounds, Map as MapLibreMap, NavigationControl, type FilterSpecification, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { mapStyle } from "./mapStyle";
import type { Mode } from "./tokens/theme";
import { tokens } from "./tokens/tokens";

type Props = { coordinates?: [number, number][] };

const CONTINENTAL_US: [number, number, number, number] = [-125, 24, -66, 50];

function routeData(coordinates: [number, number][] = []): FeatureCollection {
  const ends = coordinates.length ? [coordinates[0], coordinates[coordinates.length - 1]] : [];
  return {
    type: "FeatureCollection",
    features: [
      ...(coordinates.length
        ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates } }]
        : []),
      ...ends.map((p) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: p } })),
    ],
  };
}

export function RouteMap({ coordinates }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    const mode: Mode = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const c = (name: keyof typeof tokens.color) => tokens.color[name][mode];
    const m = new MapLibreMap({ container: container.current!, style: mapStyle(mode), bounds: CONTINENTAL_US });
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("route", { type: "geojson", data: routeData() });
      const line = ["==", ["geometry-type"], "LineString"] as FilterSpecification;
      const point = ["==", ["geometry-type"], "Point"] as FilterSpecification;
      m.addLayer({ id: "route-casing", type: "line", source: "route", filter: line, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": c("map-route-casing"), "line-width": 8 } });
      m.addLayer({ id: "route-line", type: "line", source: "route", filter: line, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": c("color-brand"), "line-width": 5 } });
      m.addLayer({ id: "route-ends", type: "circle", source: "route", filter: point, paint: { "circle-radius": 7, "circle-color": c("color-brand"), "circle-stroke-color": c("map-route-casing"), "circle-stroke-width": 3 } });
    });
    map.current = m;
    return () => m.remove();
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const draw = () => {
      (m.getSource("route") as GeoJSONSource).setData(routeData(coordinates));
      if (!coordinates?.length) return;
      const bounds = coordinates.reduce((b, p) => b.extend(p), new LngLatBounds(coordinates[0], coordinates[0]));
      m.fitBounds(bounds, { padding: 64, duration: 600 });
    };
    if (m.getSource("route")) draw();
    else m.once("load", draw);
  }, [coordinates]);

  return <div ref={container} style={{ position: "absolute", inset: 0 }} />;
}
