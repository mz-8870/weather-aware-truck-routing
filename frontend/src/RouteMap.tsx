import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { FeatureCollection } from "geojson";
import { Truck } from "lucide-react";
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type ExpressionSpecification,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckpointDetails } from "./CheckpointDetails";
import { Popover } from "./components/Popover";
import { mapStyle } from "./mapStyle";
import type { Route } from "./plan";
import { riskLevel } from "./risk";
import styles from "./RouteMap.module.css";
import { riskRgba, type Mode } from "./tokens/theme";
import { tokens } from "./tokens/tokens";

type Props = {
  routes?: Route[];
  selected: number;
  onSelect: (index: number) => void;
  heat?: { cells: [number, number][]; levels: (number | null)[] }; // one forecast hour of one variable
  trucks?: [number, number][]; // [lon, lat] per route at the slider hour
};

type Cell = { position: [number, number]; level: number };

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

const currentMode = (): Mode => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function whenLoaded(m: MapLibreMap, fn: () => void) {
  if (m.getSource("route")) fn();
  else m.once("load", fn);
}

export function RouteMap({ routes, selected, onSelect, heat, trucks }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const [popup, setPopup] = useState<{ index: number; x: number; y: number } | null>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const markers = useRef<Marker[]>([]);
  const [truckEls, setTruckEls] = useState<HTMLElement[]>([]);

  useEffect(() => {
    const mode = currentMode();
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
      // shortcut: deck 9.4's interleaved mode reads map.transform, which MapLibre 6 no longer exposes, so the
      // heatmap draws as an overlay above the routes; switch to interleaved + beforeId once deck supports MapLibre 6.
      overlay.current = new MapboxOverlay({ interleaved: false, layers: [] });
      m.addControl(overlay.current);
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

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const colorRange = Object.values(riskRgba(currentMode())).slice(0, 5); // low … notravel, Unknown cells are dropped
    const data: Cell[] = heat
      ? heat.cells.flatMap((position, i) => (heat.levels[i] === null ? [] : [{ position, level: heat.levels[i] as number }]))
      : [];
    whenLoaded(m, () =>
      overlay.current?.setProps({
        layers: [
          new HeatmapLayer<Cell>({
            id: "heat",
            data,
            visible: !!heat,
            getPosition: (d) => d.position,
            // deck colors by weight / colorDomain[1] across texel centers (k + 0.5) / 5, so level k needs weight k + 0.5;
            // colorDomain[0] only fades alpha, and 0.5 keeps every level opaque (Low must not read as "no data").
            getWeight: (d) => d.level + 0.5,
            aggregation: "MEAN",
            colorDomain: [0.5, 5],
            colorRange,
            radiusPixels: 48,
            opacity: 0.45,
          }),
        ],
      }),
    );
  }, [heat]);

  const truckCount = trucks?.length ?? 0;
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const els = Array.from({ length: truckCount }, () => document.createElement("div"));
    markers.current = els.map((el) => new Marker({ element: el }).setLngLat([0, 0]));
    setTruckEls(els);
    return () => markers.current.forEach((mk) => mk.remove());
  }, [truckCount]);

  useEffect(() => {
    const m = map.current;
    if (!m || !trucks) return;
    whenLoaded(m, () => trucks.forEach((t, i) => markers.current[i]?.setLngLat(t).addTo(m)));
  }, [trucks]);

  const checkpoint = popup && routes?.[selected]?.checkpoints[popup.index];
  return (
    <div ref={container} style={{ position: "absolute", inset: 0 }}>
      {truckEls.map((el, i) =>
        createPortal(
          <div className={`${styles.truck} ${i === selected ? styles.selected : ""}`} aria-hidden>
            <Truck />
          </div>,
          el,
        ),
      )}
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
