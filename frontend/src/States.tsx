// Trip states from the Gate 2 designs (screens 01, 03, 10a, 10b): copy is the Pencil wording.
import { MapPinOff, Pencil, RotateCw, Route as RouteIcon, ServerCrash, Snowflake, Wind, type LucideIcon } from "lucide-react";
import { Button } from "./components/Button";
import { dayTime } from "./format";
import type { Trip } from "./plan";
import styles from "./States.module.css";
import { useUnits } from "./useUnits";

export type Example = { label: string; icon: LucideIcon; origin: string; destination: string };

export const EXAMPLES: Example[] = [
  { label: "Denver → Salt Lake City · winter storm", icon: Snowflake, origin: "Denver, CO", destination: "Salt Lake City, UT" },
  { label: "Amarillo → Oklahoma City · high wind", icon: Wind, origin: "Amarillo, TX", destination: "Oklahoma City, OK" },
];

export function FormHead() {
  return (
    <div className={styles.formHead}>
      <h2 className={styles.formTitle}>Plan a trip</h2>
      <p className={styles.lede}>We'll compare 3 routes and check the weather where your truck will be, when it gets there.</p>
    </div>
  );
}

export function Examples({ onPick }: { onPick: (example: Example) => void }) {
  return (
    <div className={styles.examples}>
      <span className={styles.examplesTitle}>Or try an example</span>
      {EXAMPLES.map((e) => (
        <Button key={e.label} variant="secondary" type="button" className={styles.example} onClick={() => onPick(e)}>
          <e.icon aria-hidden className={styles.icon} />
          {e.label}
        </Button>
      ))}
    </div>
  );
}

export function TripSummary({ trip, onEdit }: { trip: Trip; onEdit: () => void }) {
  const f = useUnits();
  return (
    <div className={styles.summary}>
      <div className={styles.summaryText}>
        <span className={styles.trip}>
          {trip.origin} → {trip.destination}
        </span>
        <span className={styles.meta}>
          {dayTime(trip.departure)} · {f.weight(trip.weight_lb)} · every {f.interval(trip.interval_mi)}
        </span>
      </div>
      <Button variant="ghost" type="button" className={styles.edit} onClick={onEdit}>
        <Pencil aria-hidden className={styles.icon} />
        Edit
      </Button>
    </div>
  );
}

export function Planning() {
  return (
    <section className={styles.planning} aria-busy>
      <div>
        <h2 className={styles.title}>Finding routes…</h2>
        <p className={styles.note}>Getting 3 truck routes, then checking the weather at each checkpoint.</p>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.skeleton} aria-hidden>
          <span />
          <span />
          <span />
        </div>
      ))}
    </section>
  );
}

export function NoRoute({ onEdit }: { onEdit: () => void }) {
  return (
    <section className={styles.noRoute} role="alert">
      <MapPinOff aria-hidden className={styles.stateIcon} />
      <h2 className={styles.title}>No drivable route found</h2>
      <p className={styles.note}>
        There's no road connection between these places for a truck. Check the destination, or pick a point on the mainland.
      </p>
      <Button variant="secondary" type="button" onClick={onEdit}>
        <Pencil aria-hidden className={styles.icon} />
        Edit trip
      </Button>
    </section>
  );
}

export function Outage({ onRetry }: { onRetry: () => void }) {
  return (
    <section className={styles.outageWrap} role="alert">
      <div className={styles.outage}>
        <ServerCrash aria-hidden className={styles.icon} />
        <div>
          <h2 className={styles.outageTitle}>Couldn't reach the routing service</h2>
          <p className={styles.outageBody}>Nothing was lost — your trip details are kept. This is usually temporary.</p>
        </div>
      </div>
      <Button type="button" onClick={onRetry}>
        <RotateCw aria-hidden className={styles.icon} />
        Try again
      </Button>
    </section>
  );
}

export function MapEmpty() {
  return (
    <div className={styles.mapEmpty}>
      <RouteIcon aria-hidden className={styles.mapEmptyIcon} />
      <h2 className={styles.mapEmptyTitle}>Your routes will appear here</h2>
      <p className={styles.mapEmptyBody}>
        Each route is colored by the weather risk at the time your truck reaches it. Drag the forecast slider to see conditions change over 48
        hours.
      </p>
    </div>
  );
}
