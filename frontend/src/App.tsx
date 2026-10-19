import { useMutation } from "@tanstack/react-query";
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

const FIELDS = ["origin", "destination", "origin_position", "destination_position", "departure", "weight_lb"];

export default function App() {
  const [form, setForm] = useState({ origin: "", destination: "", departure: "", weight: "", interval: "25" });
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
            <Field label="Weight (lb)" type="number" min={0} required {...bind("weight")} error={fieldError("weight_lb")} />
            <SegmentedControl
              label="Checkpoint spacing"
              value={form.interval}
              options={SPACINGS}
              onChange={(interval) => setForm({ ...form, interval })}
            />
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
