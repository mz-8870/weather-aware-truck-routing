import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import styles from "./App.module.css";
import { Button } from "./components/Button";
import { Field } from "./components/Field";
import { SegmentedControl } from "./components/SegmentedControl";
import { planTrip, type ApiError, type Route, type Trip } from "./plan";
import { RouteMap } from "./RouteMap";

const SPACINGS = [10, 25, 50].map((mi) => ({ value: String(mi), label: `${mi} mi` }));

const FIELDS = ["origin", "destination", "departure", "weight_lb"];

const miles = (mi: number) => `${mi.toLocaleString("en-US", { maximumFractionDigits: 1 })} mi`;

function duration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export default function App() {
  const [form, setForm] = useState({ origin: "", destination: "", departure: "", weight: "", interval: "25" });
  const plan = useMutation<{ routes: Route[] }, ApiError, Trip>({ mutationFn: planTrip });
  const route = plan.data?.routes[0];
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
            <Field label="Origin" required {...bind("origin")} error={fieldError("origin")} />
            <Field label="Destination" required {...bind("destination")} error={fieldError("destination")} />
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
          {route && (
            <div className={styles.summary}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Distance</span>
                <span className={styles.statValue}>{miles(route.distance_mi)}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Drive time</span>
                <span className={styles.statValue}>{duration(route.duration_s)}</span>
              </div>
            </div>
          )}
        </aside>
        <main className={styles.map}>
          <RouteMap route={route} />
        </main>
      </div>
    </div>
  );
}
