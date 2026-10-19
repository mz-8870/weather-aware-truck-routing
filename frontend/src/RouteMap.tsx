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

type Props = { route?: Route };

const CONTINENTAL_US: [number, number, number, number] = [-125, 24, -66, 50];
const UNKNOWN = -1; // GeoJSON properties can't hold null usefully in match expressions

function routeData(route?: Route): FeatureCollection {
  if (!route) return { type: "FeatureCollection", features: [] };
  const level = (l: number | null) => l ?? UNKNOWN;
  return {
    type: "FeatureCollection",
    features: [
      ...route.segments.map((s) => ({
        type: "Feature" as const,
        properties: { level: level(s.level) },
        geometry: { type: "LineString" as const, coordinates: s.coordinates },
      })),
      ...route.checkpoints.map((c, index) => ({
        type: "Feature" as const,
        properties: { level: level(c.level), index },
        geometry: { type: "Point" as const, coordinates: [c.lon, c.lat] },
      })),
    ],
  };
}

export function RouteMap({ route }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [selected, setSelected] = useState<{ index: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const mode: Mode = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const c = (name: keyof typeof tokens.color) => tokens.color[name][mode];
    const riskColor = [
      "match",
      ["get", "level"],
      ...[0, 1, 2, 3, 4].flatMap((l) => [l, c(`risk-${riskLevel(l).key}`)]),
      c("risk-unknown"),
    ] as unknown as ExpressionSpecification; // spread args defeat maplibre's tuple typing
    const m = new MapLibreMap({ container: container.current!, style: mapStyle(mode), bounds: CONTINENTAL_US });
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("route", { type: "geojson", data: routeData() });
      const line = ["==", ["geometry-type"], "LineString"] as ExpressionSpecification;
      const point = ["==", ["geometry-type"], "Point"] as ExpressionSpecification;
      const round = { "line-join": "round", "line-cap": "round" } as const;
      m.addLayer({ id: "route-casing", type: "line", source: "route", filter: line, layout: round, paint: { "line-color": c("map-route-casing"), "line-width": 9 } });
      m.addLayer({ id: "route-line", type: "line", source: "route", filter: line, layout: round, paint: { "line-color": riskColor, "line-width": 5 } });
      m.addLayer({ id: "checkpoints", type: "circle", source: "route", filter: point, paint: { "circle-radius": 5, "circle-color": c("color-surface"), "circle-stroke-color": riskColor, "circle-stroke-width": 3 } });
      m.on("click", "checkpoints", (e) => {
        const index = e.features?.[0]?.properties.index;
        if (typeof index === "number") setSelected({ index, x: e.point.x, y: e.point.y });
      });
      m.on("mouseenter", "checkpoints", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "checkpoints", () => (m.getCanvas().style.cursor = ""));
      m.on("movestart", () => setSelected(null));
    });
    map.current = m;
    return () => m.remove();
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    setSelected(null);
    const draw = () => {
      (m.getSource("route") as GeoJSONSource).setData(routeData(route));
      const coords = route?.segments.flatMap((s) => s.coordinates) ?? [];
      if (!coords.length) return;
      const bounds = coords.reduce((b, p) => b.extend(p), new LngLatBounds(coords[0], coords[0]));
      m.fitBounds(bounds, { padding: 64, duration: 600 });
    };
    if (m.getSource("route")) draw();
    else m.once("load", draw);
  }, [route]);

  const checkpoint = selected && route?.checkpoints[selected.index];
  return (
    <div ref={container} style={{ position: "absolute", inset: 0 }}>
      {checkpoint && (
        <Popover
          open
          onOpenChange={(open) => !open && setSelected(null)}
          anchor={<div style={{ position: "absolute", left: selected.x, top: selected.y }} />}
        >
          <CheckpointDetails checkpoint={checkpoint} number={selected.index + 1} />
        </Popover>
      )}
    </div>
  );
}
