import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import styles from "./App.module.css";
import { Button } from "./components/Button";
import { Field } from "./components/Field";
import { LocationField, type Place } from "./LocationField";
import { SegmentedControl } from "./components/SegmentedControl";
import { planTrip, type ApiError, type Plan, type Trip } from "./plan";
import { Results } from "./Results";
import { RouteMap } from "./RouteMap";

const SPACINGS = [10, 25, 50].map((mi) => ({ value: String(mi), label: `${mi} mi` }));

const MODES = [
  { value: "cargo", label: "Cargo only" },
  { value: "gross", label: "Gross (truck + cargo)" },
] as const;
const MAX_GROSS_LB = 80_000; // SPEC: warn, don't block

const FIELDS = ["origin", "destination", "origin_position", "destination_position", "departure", "weight_lb", "empty_truck_lb", "axle_count", "axle_weight_lb"];

const optionalNumber = (text: string) => (text.trim() === "" ? undefined : Number(text));

export default function App() {
  const [form, setForm] = useState({
    origin: "",
    destination: "",
    departure: "",
    weight: "",
    mode: "cargo" as "cargo" | "gross",
    emptyTruck: "35000",
    axles: "",
    axleWeight: "",
    interval: "25",
  });
  const [advanced, setAdvanced] = useState(false);
  const gross = form.mode === "cargo" ? Number(form.weight) + Number(form.emptyTruck) : Number(form.weight);
  const [picked, setPicked] = useState<{ origin?: Place; destination?: Place }>({});
  const [selected, setSelected] = useState(0); // routes come best first, so 0 is the recommendation
  const [expanded, setExpanded] = useState(false);
  const plan = useMutation<Plan, ApiError, Trip>({
    mutationFn: planTrip,
    onSuccess: () => {
      setSelected(0);
      setExpanded(false);
    },
  });
  const fieldError = (name: string) => {
    const e = plan.error?.status === 400 ? plan.error.body[name] : undefined;
    return Array.isArray(e) ? e[0] : undefined;
  };
  const hasFieldError = FIELDS.some((f) => fieldError(f));
  // A server error on a collapsed field would otherwise be invisible.
  const showAdvanced = advanced || ["empty_truck_lb", "axle_count", "axle_weight_lb"].some((f) => fieldError(f));
  const alert = plan.error && !hasFieldError ? String(plan.error.body.detail ?? "Something went wrong. Try again.") : undefined;

  function submit(e: FormEvent) {
    e.preventDefault();
    plan.mutate({
      origin: form.origin,
      destination: form.destination,
      origin_position: picked.origin && [picked.origin.lat, picked.origin.lon],
      destination_position: picked.destination && [picked.destination.lat, picked.destination.lon],
      // datetime-local has no zone; the browser's zone is the user's (SPEC: departure in browser TZ).
      departure: new Date(form.departure).toISOString(),
      weight_lb: Number(form.weight),
      weight_mode: form.mode,
      empty_truck_lb: Number(form.emptyTruck),
      axle_count: optionalNumber(form.axles),
      axle_weight_lb: optionalNumber(form.axleWeight),
      interval_mi: Number(form.interval),
    });
  }

  const bind = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [name]: e.target.value }),
  });

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.mark} aria-hidden />
        <h1 className={styles.title}>Weather-Aware Truck Routing</h1>
      </header>
      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <form className={styles.form} onSubmit={submit}>
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
            <Field label="Departure" type="datetime-local" required {...bind("departure")} error={fieldError("departure")} />
            <Field
              label={form.mode === "cargo" ? "Cargo weight" : "Gross weight"}
              type="number"
              min={0}
              required
              {...bind("weight")}
              error={fieldError("weight_lb")}
              warning={form.weight && gross > MAX_GROSS_LB ? "Over 80,000 lb gross" : undefined}
              helper="Max 80,000 lb gross"
            />
            <SegmentedControl label="Weight entered as" value={form.mode} options={[...MODES]} onChange={(mode) => setForm({ ...form, mode })} />
            <SegmentedControl
              label="Check weather every"
              value={form.interval}
              options={SPACINGS}
              onChange={(interval) => setForm({ ...form, interval })}
            />
            <Button variant="ghost" type="button" className={styles.advanced} aria-expanded={showAdvanced} onClick={() => setAdvanced(!showAdvanced)}>
              {showAdvanced ? <ChevronDown aria-hidden className={styles.chevron} /> : <ChevronRight aria-hidden className={styles.chevron} />}
              Advanced: empty-truck weight, axles
            </Button>
            {showAdvanced && (
              <div className={styles.advancedFields}>
                <Field
                  label="Empty truck weight"
                  type="number"
                  min={0}
                  required
                  {...bind("emptyTruck")}
                  error={fieldError("empty_truck_lb")}
                  helper="Added to cargo for routing. Risk rules use cargo only."
                />
                <div className={styles.row}>
                  <Field label="Axles (optional)" type="number" min={2} max={12} step={1} {...bind("axles")} error={fieldError("axle_count")} />
                  <Field label="Weight per axle" type="number" min={1} {...bind("axleWeight")} error={fieldError("axle_weight_lb")} />
                </div>
              </div>
            )}
            <Button type="submit" disabled={plan.isPending}>
              Plan routes
            </Button>
          </form>
          {alert && (
            <p role="alert" className={styles.alert}>
              {alert}
            </p>
          )}
          {plan.data && plan.variables && (
            <Results
              plan={plan.data}
              intervalMi={plan.variables.interval_mi}
              selected={selected}
              expanded={expanded}
              onSelect={(i) => {
                setSelected(i);
                setExpanded(true);
              }}
              onBack={() => setExpanded(false)}
            />
          )}
        </aside>
        <main className={styles.map}>
          <RouteMap routes={plan.data?.routes} selected={selected} onSelect={setSelected} />
        </main>
      </div>
    </div>
  );
}
