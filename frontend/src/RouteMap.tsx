import type { FeatureCollection } from "geojson";
import {
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  type ExpressionSpecification,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { CheckpointDetails } from "./CheckpointDetails";
import { Popover } from "./components/Popover";
import { mapStyle } from "./mapStyle";
import type { Route } from "./plan";
import { riskLevel } from "./risk";
import type { Mode } from "./tokens/theme";
import { tokens } from "./tokens/tokens";

type Props = { routes?: Route[]; selected: number; onSelect: (index: number) => void };

const CONTINENTAL_US: [number, number, number, number] = [-125, 24, -66, 50];
const UNKNOWN = -1; // GeoJSON properties can't hold null usefully in match expressions

function routeData(routes: Route[] = [], selected = 0): FeatureCollection {
  const level = (l: number | null) => l ?? UNKNOWN;
  return {
    type: "FeatureCollection",
    features: routes.flatMap((route, r) => [
      ...route.segments.map((s) => ({
        type: "Feature" as const,
        properties: { level: level(s.level), route: r, selected: r === selected },
        geometry: { type: "LineString" as const, coordinates: s.coordinates },
      })),
      ...(r === selected ? route.checkpoints : []).map((c, index) => ({
        type: "Feature" as const,
        properties: { level: level(c.level), index },
        geometry: { type: "Point" as const, coordinates: [c.lon, c.lat] },
      })),
    ]),
  };
}

function whenLoaded(m: MapLibreMap, fn: () => void) {
  if (m.getSource("route")) fn();
  else m.once("load", fn);
}

export function RouteMap({ routes, selected, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const [popup, setPopup] = useState<{ index: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const mode: Mode = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const c = (name: keyof typeof tokens.color) => tokens.color[name][mode];
    const riskColor = [
      "match",
      ["get", "level"],
      ...[0, 1, 2, 3, 4].flatMap((l) => [l, c(`risk-${riskLevel(l).key}`)]),
      c("risk-unknown"),
    ] as unknown as ExpressionSpecification; // spread args defeat maplibre's tuple typing
    const emphasis = (on: number, off: number) => ["case", ["get", "selected"], on, off] as ExpressionSpecification;
    const m = new MapLibreMap({ container: container.current!, style: mapStyle(mode), bounds: CONTINENTAL_US });
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("route", { type: "geojson", data: routeData() });
      const line = ["==", ["geometry-type"], "LineString"] as ExpressionSpecification;
      const point = ["==", ["geometry-type"], "Point"] as ExpressionSpecification;
      // Selected route draws on top; alternatives are thinner and faded.
      const layout = { "line-join": "round", "line-cap": "round", "line-sort-key": emphasis(1, 0) } as const;
      m.addLayer({ id: "route-casing", type: "line", source: "route", filter: line, layout, paint: { "line-color": c("map-route-casing"), "line-width": emphasis(9, 6), "line-opacity": emphasis(1, 0.6) } });
      m.addLayer({ id: "route-line", type: "line", source: "route", filter: line, layout, paint: { "line-color": riskColor, "line-width": emphasis(5, 3), "line-opacity": emphasis(1, 0.4) } });
      m.addLayer({ id: "checkpoints", type: "circle", source: "route", filter: point, paint: { "circle-radius": 5, "circle-color": c("color-surface"), "circle-stroke-color": riskColor, "circle-stroke-width": 3 } });
      m.on("click", "checkpoints", (e) => {
        const index = e.features?.[0]?.properties.index;
        if (typeof index === "number") setPopup({ index, x: e.point.x, y: e.point.y });
      });
      m.on("click", "route-line", (e) => {
        const route = e.features?.[0]?.properties.route;
        if (typeof route === "number") select.current(route);
      });
      for (const layer of ["checkpoints", "route-line"]) {
        m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
      }
      m.on("movestart", () => setPopup(null));
    });
    map.current = m;
    return () => m.remove();
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    setPopup(null);
    whenLoaded(m, () => (m.getSource("route") as GeoJSONSource).setData(routeData(routes, selected)));
  }, [routes, selected]);

  useEffect(() => {
    const m = map.current;
    const coords = routes?.flatMap((r) => r.segments.flatMap((s) => s.coordinates)) ?? [];
    if (!m || !coords.length) return;
    whenLoaded(m, () => {
      const bounds = coords.reduce((b, p) => b.extend(p), new LngLatBounds(coords[0], coords[0]));
      m.fitBounds(bounds, { padding: 64, duration: 600 });
    });
  }, [routes]);

  const checkpoint = popup && routes?.[selected]?.checkpoints[popup.index];
  return (
    <div ref={container} style={{ position: "absolute", inset: 0 }}>
      {checkpoint && (
        <Popover
          open
          onOpenChange={(open) => !open && setPopup(null)}
          anchor={<div style={{ position: "absolute", left: popup.x, top: popup.y }} />}
        >
          <CheckpointDetails checkpoint={checkpoint} number={popup.index + 1} />
        </Popover>
      )}
    </div>
  );
}
