import styles from "./CheckpointDetails.module.css";
import { RiskBadge } from "./components/RiskBadge";
import type { Checkpoint } from "./plan";
import { riskLevel } from "./risk";

const time = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(",", "");

function elapsed(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return `+${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// Same precision the classifier saw, so a reading never looks like it crossed a threshold it didn't.
const reading = (value: number | null, unit: string, fraction: [number, number] = [0, 1]) =>
  value === null
    ? "—"
    : `${value.toLocaleString("en-US", { minimumFractionDigits: fraction[0], maximumFractionDigits: fraction[1] })} ${unit}`;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function rule(c: Checkpoint): { title: string; text: string } {
  if (c.level === null)
    return {
      title: "No forecast for this point",
      text: `The weather service returned no data. These ${c.owned_mi} mi count as unknown and are left out of the average.`,
    };
  if (c.beyond_forecast)
    return {
      title: "Beyond forecast",
      text: "ETA is past the latest forecast hour. Using the last available hour — treat as an estimate.",
    };
  return { title: `Why ${riskLevel(c.level).label}`, text: c.reasons.map(capitalize).join("; ") };
}

export function CheckpointDetails({ checkpoint: c, number }: { checkpoint: Checkpoint; number: number }) {
  const { title, text } = rule(c);
  const rows: [string, string][] = [
    ["Wind", reading(c.wind_mph, "mph")],
    ["Gusts (info)", reading(c.gust_mph, "mph")],
    ["Rain", reading(c.rain_in_hr, "in/hr", [2, 2])],
    ["Snow", reading(c.snow_in_hr, "in/hr", [2, 2])],
  ];
  return (
    <div className={styles.details}>
      <div className={styles.head}>
        <div className={styles.titles}>
          <span className={styles.title}>
            Checkpoint {number} · mile {c.mile.toLocaleString("en-US", { maximumFractionDigits: 1 })}
          </span>
          <span className={styles.eta}>
            ETA {time(c.eta)} · {elapsed(c.offset_s)}
          </span>
        </div>
        <RiskBadge level={c.level} />
      </div>
      <dl className={styles.readings}>
        {rows.map(([key, value]) => (
          <div key={key} className={styles.row}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.rule} data-risk={riskLevel(c.level).key}>
        <span className={styles.ruleTitle}>{title}</span>
        <span>{text}</span>
      </div>
    </div>
  );
}
