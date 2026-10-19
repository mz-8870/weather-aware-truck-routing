import styles from "./CheckpointDetails.module.css";
import { RiskBadge } from "./components/RiskBadge";
import { capitalize, dayTime, elapsed } from "./format";
import type { Checkpoint } from "./plan";
import { riskLevel } from "./risk";
import { convertText, type Formatter } from "./units";
import { useUnits } from "./useUnits";

// Rules are imperial thresholds; in metric they show the converted value with the original rule beside it.
const ruleText = (reasons: string[], f: Formatter) =>
  reasons.map((r) => capitalize(convertText(r, f.units, { original: true }))).join("; ");

function rule(c: Checkpoint, f: Formatter): { title: string; text: string } {
  if (c.level === null) {
    const allMissing = [c.wind_mph, c.gust_mph, c.rain_in_hr, c.snow_in_hr].every((v) => v === null);
    const what = allMissing ? "The weather service returned no data." : `${ruleText(c.reasons, f)}.`;
    return {
      title: "No forecast for this point",
      text: `${what} These ${f.distance(c.owned_mi)} count as unknown and are left out of the average.`,
    };
  }
  return { title: `Why ${riskLevel(c.level).label}`, text: ruleText(c.reasons, f) };
}

export function CheckpointDetails({ checkpoint: c, number }: { checkpoint: Checkpoint; number: number }) {
  const f = useUnits();
  const { title, text } = rule(c, f);
  // Same precision the classifier saw, so a reading never looks like it crossed a threshold it didn't.
  const rows: [string, string][] = [
    ["Wind", f.wind(c.wind_mph)],
    ["Gusts (info)", f.wind(c.gust_mph)],
    ["Rain", f.rain(c.rain_in_hr)],
    ["Snow", f.snow(c.snow_in_hr)],
  ];
  return (
    <div className={styles.details}>
      <div className={styles.head}>
        <div className={styles.titles}>
          <span className={styles.title}>
            Checkpoint {number} · {f.units === "metric" ? "km" : "mile"} {f.milepost(c.mile)}
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
