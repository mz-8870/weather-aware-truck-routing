import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Moon, SlidersHorizontal, Sun, Truck } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import styles from "./App.module.css";
import { Button } from "./components/Button";
import { Field } from "./components/Field";
import { Popover } from "./components/Popover";
import { ForecastControls } from "./ForecastControls";
import { fetchHeatmap, heatmapQuery, truckPosition, type Variable } from "./heatmap";
import { SegmentedControl } from "./components/SegmentedControl";
import { Toast, ToastProvider } from "./components/Toast";
import { LocationField, type Place } from "./LocationField";
import { planTrip, type ApiError, type Plan, type Trip } from "./plan";
import { Results } from "./Results";
import { RouteMap } from "./RouteMap";
import { Examples, FormHead, MapEmpty, NoRoute, Outage, Planning, TripSummary, type Example } from "./States";
import { formatter, lbFromInput, loadUnits, saveUnits, type Units } from "./units";
import { UnitsContext } from "./useUnits";
import { loadTheme, saveTheme, setTheme, type Mode } from "./tokens/theme";

const UNITS = [
  { value: "imperial", label: "Imperial" },
  { value: "metric", label: "Metric" },
] as const;

const MODES = [
  { value: "cargo", label: "Cargo only" },
  { value: "gross", label: "Gross (truck + cargo)" },
] as const;
const RESTS = [
  { value: "off", label: "Non-stop" },
  { value: "on", label: "US hours of service" },
] as const;
const MAX_GROSS_LB = 80_000; // SPEC: warn, don't block

const FIELDS = ["origin", "destination", "origin_position", "destination_position", "departure", "weight_lb", "empty_truck_lb", "axle_count", "axle_weight_lb"];

const optionalNumber = (text: string) => (text.trim() === "" ? undefined : Number(text));

const EXAMPLE_CARGO_LB = 32_000; // Pencil screen 01's example weight

// The next full hour for a datetime-local input.
function nextHourInput() {
  const d = new Date(Date.now() + 3600_000);
  d.setMinutes(0);
  return toInput(d);
}

// "YYYY-MM-DDTHH:MM" in the browser's zone, for a datetime-local input.
function toInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TIME_ZONE = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value;

export default function App() {
  const [units, setUnitsState] = useState<Units>(() => loadUnits());
  const [theme, setThemeState] = useState<Mode>(() => loadTheme());
  const [sheetOpen, setSheetOpen] = useState(true); // phones: the sidebar is a bottom sheet
  const sidebar = useRef<HTMLElement>(null);
  const [unitsToast, setUnitsToast] = useState<{ open: boolean; previous: Units }>({ open: false, previous: units });
  const f = formatter(units);
  const [form, setForm] = useState({
    origin: "",
    destination: "",
    departure: "",
    mode: "cargo" as "cargo" | "gross",
    axles: "",
    interval: "25",
    hos: "off" as "off" | "on",
  });
  // Weights are kept in pounds (what the backend takes) and only shown in the current units,
  // so flipping units never re-rounds them.
  const [weights, setWeights] = useState<{ weight?: number; emptyTruck?: number; axleWeight?: number }>({ emptyTruck: 35_000 });
  const [advanced, setAdvanced] = useState(false);
  const gross = form.mode === "cargo" ? (weights.weight ?? 0) + (weights.emptyTruck ?? 0) : (weights.weight ?? 0);
  const [picked, setPicked] = useState<{ origin?: Place; destination?: Place }>({});
  const [selected, setSelected] = useState(0); // routes come best first, so 0 is the recommendation
  const [expanded, setExpanded] = useState(false);
  const [layer, setLayer] = useState<Variable | "off">("risk");
  const [hour, setHour] = useState(0);
  const [editing, setEditing] = useState(true); // the form, or its one-line summary once a trip is submitted
  const plan = useMutation<Plan, ApiError, Trip>({
    mutationFn: planTrip,
    onSuccess: () => {
      setSelected(0);
      setExpanded(false);
      setHour(0);
    },
    // Outages and "no route" get their own states; any other error reopens the form with its message.
    onError: (e) => !(e.status === 0 || e.status >= 500 || e.body.code === "no_route") && setEditing(true),
  });
  // Loads after the routes so it never blocks them; the slider then only indexes into this one response.
  const heatmap = useQuery({
    queryKey: ["heatmap", plan.submittedAt],
    queryFn: () => fetchHeatmap(heatmapQuery(plan.data!.routes, plan.variables!.departure, plan.data!.cargo_lb)),
    enabled: !!plan.data,
    retry: false, // the backend already retries Open-Meteo; show the error and offer Retry
    staleTime: Infinity,
  });
  // Memoized so typing in the form doesn't rebuild the map layers.
  const heat = useMemo(
    () =>
      layer !== "off" && heatmap.data
        ? { cells: heatmap.data.cells, spacingMi: heatmap.data.spacing_mi, levels: heatmap.data.levels[layer][hour] }
        : undefined,
    [heatmap.data, layer, hour],
  );
  const trucks = useMemo(() => plan.data?.routes.map((r) => truckPosition(r, hour * 3600)), [plan.data, hour]);
  const fieldError = (name: string) => {
    const e = plan.error?.status === 400 ? plan.error.body[name] : undefined;
    return Array.isArray(e) ? e[0] : undefined;
  };
  const hasFieldError = FIELDS.some((name) => fieldError(name));
  // A server error on a collapsed field would otherwise be invisible.
  const showAdvanced = advanced || ["empty_truck_lb", "axle_count", "axle_weight_lb"].some((name) => fieldError(name));
  const outage = plan.error && (plan.error.status === 0 || plan.error.status >= 500);
  const noRoute = plan.error?.status === 422 && plan.error.body.code === "no_route";
  // No route while the form is open (Edit clicked mid-request) falls back to the alert under the form.
  const alert = plan.error && !hasFieldError && !outage && !(noRoute && !editing) ? String(plan.error.body.detail ?? "Something went wrong. Try again.") : undefined;

  useEffect(() => setTheme(theme), [theme]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setThemeState(next);
    saveTheme(next);
  }

  function setUnits(next: Units, toast = true) {
    setUnitsState(next);
    saveUnits(next);
    setUnitsToast({ open: toast, previous: units });
  }

  function run(trip: Trip) {
    setEditing(false);
    if (sidebar.current) sidebar.current.scrollTop = 0; // the form collapses above whatever was scrolled to
    plan.mutate(trip);
  }

  function tryExample(example: Example) {
    const departure = nextHourInput();
    setForm({ ...form, origin: example.origin, destination: example.destination, departure, mode: "cargo", interval: "25" });
    setPicked({});
    setWeights({ ...weights, weight: EXAMPLE_CARGO_LB });
    run({
      origin: example.origin,
      destination: example.destination,
      departure: new Date(departure).toISOString(),
      weight_lb: EXAMPLE_CARGO_LB,
      weight_mode: "cargo",
      empty_truck_lb: weights.emptyTruck ?? 0,
      axle_count: optionalNumber(form.axles),
      axle_weight_lb: weights.axleWeight,
      interval_mi: 25,
      hos: form.hos === "on",
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    run({
      origin: form.origin,
      destination: form.destination,
      origin_position: picked.origin && [picked.origin.lat, picked.origin.lon],
      destination_position: picked.destination && [picked.destination.lat, picked.destination.lon],
      // datetime-local has no zone; the browser's zone is the user's (SPEC: departure in browser TZ).
      departure: new Date(form.departure).toISOString(),
      weight_lb: weights.weight ?? 0,
      weight_mode: form.mode,
      empty_truck_lb: weights.emptyTruck ?? 0,
      axle_count: optionalNumber(form.axles),
      axle_weight_lb: weights.axleWeight,
      interval_mi: Number(form.interval),
      hos: form.hos === "on",
    });
  }

  const bind = (name: "origin" | "destination" | "departure" | "axles") => ({
    value: form[name],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [name]: e.target.value }),
  });

  const bindWeight = (name: keyof typeof weights) => ({
    type: "number",
    min: 0,
    step: 1,
    value: weights[name] === undefined ? "" : f.weightValue(weights[name]),
    onChange: (e: { target: { value: string } }) => setWeights({ ...weights, [name]: lbFromInput(e.target.value, units) }),
  });

  const tools = (
    <>
      <SegmentedControl label="Units" hideLabel value={units} options={[...UNITS]} onChange={(next) => setUnits(next)} />
      <Button variant="secondary" type="button" className={styles.iconButton} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} onClick={toggleTheme}>
        {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
      </Button>
    </>
  );

  return (
    <UnitsContext.Provider value={f}>
      <ToastProvider>
        <div className={styles.app}>
          <header className={styles.header}>
            <div className={styles.mark} aria-hidden>
              <Truck />
            </div>
            <h1 className={styles.title}>
              <span className={styles.titleFull}>Weather-Aware Truck Routing</span>
              <span className={styles.titleShort} aria-hidden>
                Truck Routing
              </span>
            </h1>
            <div className={styles.tools}>{tools}</div>
            <div className={styles.settings}>
              <Popover
                trigger={
                  <Button variant="secondary" type="button" className={styles.iconButton} aria-label="Settings">
                    <SlidersHorizontal aria-hidden />
                  </Button>
                }
              >
                <div className={styles.settingsPanel}>{tools}</div>
              </Popover>
            </div>
          </header>
          <div className={styles.body} data-sheet={sheetOpen ? "open" : "peek"}>
            <aside ref={sidebar} className={styles.sidebar}>
              <button type="button" className={styles.handle} aria-label="Trip panel" aria-expanded={sheetOpen} onClick={() => setSheetOpen(!sheetOpen)}>
                <span aria-hidden />
              </button>
              {!editing && plan.variables && <TripSummary trip={plan.variables} onEdit={() => setEditing(true)} />}
              {editing && (
                <form className={styles.form} onSubmit={submit}>
                  <FormHead />
                  {(["origin", "destination"] as const).map((name) => (
                    <LocationField
                      key={name}
                      label={name === "origin" ? "Origin" : "Destination"}
                      value={form[name]}
                      error={fieldError(name) ?? fieldError(`${name}_position`)}
                      onChange={(text) => {
                        setForm({ ...form, [name]: text });
                        setPicked({ ...picked, [name]: undefined });
                      }}
                      onPick={(place) => {
                        setForm({ ...form, [name]: place.label });
                        setPicked({ ...picked, [name]: place });
                      }}
                    />
                  ))}
                  <Field
                    label="Departure"
                    type="datetime-local"
                    required
                    {...bind("departure")}
                    error={fieldError("departure")}
                    helper={TIME_ZONE && `Your time zone (${TIME_ZONE})`}
                  />
                  <Field
                    label={`${form.mode === "cargo" ? "Cargo" : "Gross"} weight (${f.weightUnit})`}
                    required
                    {...bindWeight("weight")}
                    error={fieldError("weight_lb")}
                    warning={weights.weight !== undefined && gross > MAX_GROSS_LB ? `Over ${f.weight(MAX_GROSS_LB)} gross` : undefined}
                    helper={`Max ${f.weight(MAX_GROSS_LB)} gross`}
                  />
                  <SegmentedControl label="Weight entered as" value={form.mode} options={[...MODES]} onChange={(mode) => setForm({ ...form, mode })} />
                  <SegmentedControl
                    label="Check weather every"
                    value={form.interval}
                    options={[10, 25, 50].map((mi) => ({ value: String(mi), label: f.interval(mi) }))}
                    onChange={(interval) => setForm({ ...form, interval })}
                  />
                  <SegmentedControl label="Rest breaks" value={form.hos} options={[...RESTS]} onChange={(hos) => setForm({ ...form, hos })} />
                  <Button variant="ghost" type="button" className={styles.advanced} aria-expanded={showAdvanced} onClick={() => setAdvanced(!showAdvanced)}>
                    {showAdvanced ? <ChevronDown aria-hidden className={styles.chevron} /> : <ChevronRight aria-hidden className={styles.chevron} />}
                    Advanced: empty-truck weight, axles
                  </Button>
                  {showAdvanced && (
                    <div className={styles.advancedFields}>
                      <Field
                        label={`Empty truck weight (${f.weightUnit})`}
                        required
                        {...bindWeight("emptyTruck")}
                        error={fieldError("empty_truck_lb")}
                        helper="Added to cargo for routing. Risk rules use cargo only."
                      />
                      <div className={styles.row}>
                        <Field label="Axles (optional)" type="number" min={2} max={12} step={1} {...bind("axles")} error={fieldError("axle_count")} />
                        <Field label={`Weight per axle (${f.weightUnit})`} {...bindWeight("axleWeight")} min={1} error={fieldError("axle_weight_lb")} />
                      </div>
                    </div>
                  )}
                  <Button type="submit" disabled={plan.isPending}>
                    Plan routes
                  </Button>
                  {plan.isIdle && <Examples onPick={tryExample} />}
                </form>
              )}
              {editing && alert && (
                <p role="alert" className={styles.alert}>
                  {alert}
                </p>
              )}
              {plan.isPending && <Planning />}
              {noRoute && !editing && <NoRoute onEdit={() => setEditing(true)} />}
              {outage && <Outage onRetry={() => plan.mutate(plan.variables!)} />}
              {plan.data && plan.variables && (
                <Results
                  plan={plan.data}
                  intervalMi={plan.variables.interval_mi}
                  hos={plan.variables.hos}
                  selected={selected}
                  expanded={expanded}
                  onSelect={(i) => {
                    setSelected(i);
                    setExpanded(true);
                  }}
                  onBack={() => setExpanded(false)}
                  onDepart={(departure) => {
                    setForm({ ...form, departure: toInput(new Date(departure)) }); // Edit then shows the new time
                    run({ ...plan.variables!, departure });
                  }}
                />
              )}
            </aside>
            <main className={styles.map}>
              {/* Remount on theme change: the basemap style and heat colors are built from the theme at mount. */}
              <RouteMap key={theme} mode={theme} sheet={sheetOpen ? "open" : "peek"} routes={plan.data?.routes} selected={selected} onSelect={setSelected} heat={heat} trucks={trucks} />
              {plan.isIdle && <MapEmpty />}
              {plan.data && plan.variables && (
                <ForecastControls
                  layer={layer}
                  onLayer={setLayer}
                  hour={hour}
                  onHour={setHour}
                  departure={plan.variables.departure}
                  status={heatmap.status}
                  onRetry={() => heatmap.refetch()}
                />
              )}
            </main>
          </div>
        </div>
        <Toast
          message={`Units switched to ${units}`}
          open={unitsToast.open}
          onOpenChange={(open) => setUnitsToast({ ...unitsToast, open })}
          action={{ label: "Undo", onClick: () => setUnits(unitsToast.previous, false) }}
        />
      </ToastProvider>
    </UnitsContext.Provider>
  );
}
