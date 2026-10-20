import { Ban, Info, Star } from "lucide-react";
import { useId } from "react";
import { dayTime, duration } from "./format";
import type { Route } from "./plan";
import { riskLevel } from "./risk";
import styles from "./RouteCard.module.css";
import { convertText } from "./units";
import { useUnits } from "./useUnits";

// Without onSelect (the expanded view) the card is static content with no select button.
type Props = { route: Route; recommended: boolean; why: string | null; selected: boolean; onSelect?: () => void };

const BAR_ORDER = [0, 1, 2, 3, 4, null];

const stopCount = (stops: Route["stops"]) =>
  (["break", "rest"] as const)
    .map((kind) => [kind, stops.filter((s) => s.kind === kind).length] as const)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${n} ${kind}${n === 1 ? "" : "s"}`)
    .join(" · ");

const weatherDelay = (s: number) => `+${Math.round(s / 60) < 60 ? `${Math.round(s / 60)} min` : duration(s)} weather`;

export function RouteCard({ route, recommended, why, selected, onSelect }: Props) {
  const f = useUnits();
  const id = useId();
  const blocked = route.summary.notravel_mi > 0;
  const arrival = route.checkpoints.at(-1)?.eta;
  const total = route.checkpoints.reduce((sum, c) => sum + c.owned_mi, 0) || 1;
  const bar = BAR_ORDER.map((level) => ({
    level,
    mi: route.checkpoints.filter((c) => c.level === level).reduce((sum, c) => sum + c.owned_mi, 0),
  })).filter((b) => b.mi > 0);
  const stats: [string, number | null, number][] = [
    ["Severe", 3, route.summary.severe_mi],
    ["High", 2, route.summary.high_mi],
    ["Unknown", null, route.summary.unknown_mi],
  ];
  const clear = !blocked && stats.every(([, , mi]) => mi === 0); // never an all-clear line on a No Travel route

  return (
    <article className={styles.card} data-selected={selected} aria-labelledby={`${id}-name`}>
      <div className={styles.head}>
        <div className={styles.titles}>
          {onSelect ? (
            <button
              id={`${id}-name`}
              type="button"
              className={`${styles.name} ${styles.select}`}
              aria-pressed={selected}
              aria-describedby={`${id}-tags ${id}-duration ${id}-distance ${id}-stats`}
              onClick={onSelect}
            >
              {route.name}
            </button>
          ) : (
            <span id={`${id}-name`} className={styles.name}>
              {route.name}
            </span>
          )}
          {route.synthesized && (
            <span className={styles.via}>{route.detour_via ? `via ${route.detour_via} · added detour` : "added detour"}</span>
          )}
        </div>
        <span id={`${id}-tags`} className={styles.tags}>
          {recommended && (
            <span className={styles.tag}>
              <Star className={styles.tagIcon} aria-hidden />
              Recommended
            </span>
          )}
          {blocked && (
            <span className={styles.tag} data-tone="notravel">
              <Ban className={styles.tagIcon} aria-hidden />
              No Travel
            </span>
          )}
        </span>
      </div>
      <div className={styles.meta}>
        <span id={`${id}-duration`} className={styles.duration}>
          {duration(route.duration_s)}
        </span>
        <span id={`${id}-distance`} className={styles.distance}>
          {f.distance(route.distance_mi)}
          {arrival && ` · arrives ${dayTime(arrival)}`}
        </span>
      </div>
      {route.stops.length > 0 && <span className={styles.distance}>{stopCount(route.stops)}</span>}
      {route.weather_delay_s >= 60 && <span className={styles.distance}>{weatherDelay(route.weather_delay_s)}</span>}
      <div className={styles.bar} aria-hidden>
        {bar.map((b) => (
          <span key={String(b.level)} data-risk={riskLevel(b.level).key} style={{ flexGrow: b.mi / total }} />
        ))}
      </div>
      {clear ? (
        <p id={`${id}-stats`} className={styles.clear}>
          {convertText("No severe, high or unknown miles", f.units)}
        </p>
      ) : (
        <dl id={`${id}-stats`} className={styles.stats}>
          {stats.map(([label, level, mi]) => (
            <div key={label} className={styles.stat}>
              <dt>
                <span className={styles.dot} data-risk={riskLevel(level).key} />
                {label}
              </dt>
              <dd>{f.distance(mi)}</dd>
            </div>
          ))}
        </dl>
      )}
      {recommended && why && (
        <p className={styles.why}>
          <Info className={styles.whyIcon} aria-hidden />
          {convertText(why, f.units)}
        </p>
      )}
    </article>
  );
}
