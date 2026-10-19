import styles from "./CheckpointDetails.module.css";
import { RiskBadge } from "./components/RiskBadge";
import { capitalize, dayTime, elapsed } from "./format";
import type { Checkpoint } from "./plan";
import { riskLevel } from "./risk";

// Same precision the classifier saw, so a reading never looks like it crossed a threshold it didn't.
const reading = (value: number | null, unit: string, fraction: [number, number] = [0, 1]) =>
  value === null
    ? "—"
    : `${value.toLocaleString("en-US", { minimumFractionDigits: fraction[0], maximumFractionDigits: fraction[1] })} ${unit}`;

function rule(c: Checkpoint): { title: string; text: string } {
  if (c.level === null) {
    const allMissing = [c.wind_mph, c.gust_mph, c.rain_in_hr, c.snow_in_hr].every((v) => v === null);
    const what = allMissing ? "The weather service returned no data." : `${c.reasons.map(capitalize).join("; ")}.`;
    return {
      title: "No forecast for this point",
      text: `${what} These ${c.owned_mi} mi count as unknown and are left out of the average.`,
    };
  }
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
            ETA {dayTime(c.eta)} · {elapsed(c.offset_s)}
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
      {c.beyond_forecast && c.level !== null && (
        <div className={styles.rule} data-risk="unknown">
          <span className={styles.ruleTitle}>Beyond forecast</span>
          <span>ETA is past the latest forecast hour. Using the last available hour — treat as an estimate.</span>
        </div>
      )}
    </div>
  );
}
