import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { FeatureCollection } from "geojson";
import { CircleDot, Flag, Truck, X } from "lucide-react";
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckpointDetails } from "./CheckpointDetails";
import { Popover } from "./components/Popover";
import { mapStyle } from "./mapStyle";
import type { Route } from "./plan";
import { riskLevel } from "./risk";
import styles from "./RouteMap.module.css";
import { riskRgba, type Mode, type Rgba } from "./tokens/theme";
import { tokens } from "./tokens/tokens";

type Props = {
  routes?: Route[];
  selected: number;
  onSelect: (index: number) => void;
  heat?: { cells: [number, number][]; levels: (number | null)[] }; // one forecast hour of one variable
  trucks?: [number, number][]; // [lon, lat] per route at the slider hour
};

type Cell = { position: [number, number]; level: number };

// MapLibre looks for its worker next to its own module, which bundling moves; point it at the emitted file.
setWorkerUrl(workerUrl);

const PHONE = "(max-width: 40em)"; // matches the CSS breakpoint: details open as a bottom sheet there

const CELL_M = 25 * 1609.344; // backend grid spacing
const EARTH_M = 40_075_016.686;
// Low is a faint tint so hazards stand out; alpha rides in the color ramp because the heatmap has one opacity.
const HEAT_ALPHA = [70, 150, 185, 215, 230];

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
  const [pinEls, setPinEls] = useState<HTMLElement[]>([]);
  const [cellPx, setCellPx] = useState(0); // one grid cell on screen, so the blur follows zoom

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
    const m = new MapLibreMap({ container: container.current!, style: mapStyle(mode), bounds: CONTINENTAL_US, attributionControl: false });
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    // On phones the bottom of the map is under the trip sheet, so the (required) credit goes top-right.
    const phone = window.matchMedia(PHONE).matches;
    m.addControl(new AttributionControl({ compact: true }), phone ? "top-right" : "bottom-right");
    // Compact attribution opens expanded; on phones start it folded to its (i) button so it doesn't cover the chips.
    if (phone) m.once("load", () => container.current?.querySelector(".maplibregl-compact-show")?.classList.remove("maplibregl-compact-show"));
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
      const measure = () => setCellPx(CELL_M / ((EARTH_M * Math.cos((m.getCenter().lat * Math.PI) / 180)) / (512 * 2 ** m.getZoom())));
      m.on("zoom", measure);
      measure();
      // shortcut: deck 9.4's interleaved mode reads map.transform.height, which MapLibre 6 no longer exposes;
      // drop this shim once deck supports MapLibre 6. Interleaved lets the heatmap sit under the routes.
      if (!(m as unknown as { transform?: unknown }).transform) {
        Object.defineProperty(m, "transform", { get: () => ({ height: m.getCanvas().clientHeight }) });
      }
      overlay.current = new MapboxOverlay({ interleaved: true, layers: [] });
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
    // low … notravel; Unknown cells are dropped
    const colorRange = Object.values(riskRgba(currentMode()))
      .slice(0, 5)
      .map(([r, g, b], i): Rgba => [r, g, b, HEAT_ALPHA[i]]);
    const data: Cell[] = heat
      ? heat.cells.flatMap((position, i) => (heat.levels[i] === null ? [] : [{ position, level: heat.levels[i] as number }]))
      : [];
    whenLoaded(m, () =>
      overlay.current?.setProps({
        layers: [
          new HeatmapLayer<Cell, { beforeId: string }>({
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
            // deck's Gaussian is ~1% by half the radius, so ~4 cells of radius blends neighbours into one field.
            radiusPixels: Math.min(250, Math.max(16, cellPx * 4)),
            opacity: 0.8,
            beforeId: "route-casing", // read by MapboxOverlay: heat under the route lines
          }),
        ],
      }),
    );
  }, [heat, cellPx]);

  const truckCount = trucks?.length ?? 0;
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const els = Array.from({ length: truckCount }, () => Object.assign(document.createElement("div"), { style: "z-index: 1" })); // above the pins
    markers.current = els.map((el) => new Marker({ element: el }).setLngLat([0, 0]).addTo(m));
    setTruckEls(els);
    return () => markers.current.forEach((mk) => mk.remove());
  }, [truckCount]);

  useEffect(() => {
    const m = map.current;
    if (!m || !trucks) return;
    trucks.forEach((t, i) => markers.current[i]?.setLngLat(t));
  }, [trucks]);

  useEffect(() => {
    const m = map.current;
    const cps = routes?.[0]?.checkpoints;
    if (!m || !cps?.length) return;
    const ends = [cps[0], cps[cps.length - 1]];
    const els = ends.map(() => document.createElement("div"));
    const pins = els.map((el, i) => new Marker({ element: el }).setLngLat([ends[i].lon, ends[i].lat]).addTo(m));
    setPinEls(els);
    return () => {
      pins.forEach((p) => p.remove());
      setPinEls([]);
    };
  }, [routes]);

  const checkpoint = popup && routes?.[selected]?.checkpoints[popup.index];
  const phone = !!checkpoint && window.matchMedia(PHONE).matches;
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
      {pinEls.map((el, i) =>
        createPortal(
          <div className={styles.pin} aria-hidden>
            {i === 0 ? <CircleDot /> : <Flag />}
          </div>,
          el,
        ),
      )}
      {checkpoint && phone && (
        <div className={styles.sheet} role="dialog" aria-label={`Checkpoint ${popup.index + 1}`}>
          <button type="button" className={styles.close} aria-label="Close" onClick={() => setPopup(null)}>
            <X aria-hidden />
          </button>
          <CheckpointDetails checkpoint={checkpoint} number={popup.index + 1} />
        </div>
      )}
      {checkpoint && !phone && (
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
