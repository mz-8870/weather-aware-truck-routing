import styles from "./CheckpointList.module.css";
import { RiskBadge } from "./components/RiskBadge";
import { capitalize, clock } from "./format";
import type { Checkpoint } from "./plan";

// The reading that drove the level, e.g. "wind 38 mph: High" -> "Wind 38 mph".
function headline(c: Checkpoint) {
  if (c.level === null && c.wind_mph === null && c.rain_in_hr === null && c.snow_in_hr === null) return "No data";
  return capitalize((c.reasons[0] ?? "").replace(/: [A-Za-z ]+$/, ""));
}

export function CheckpointList({ checkpoints, intervalMi }: { checkpoints: Checkpoint[]; intervalMi: number }) {
  return (
    <section className={styles.list} aria-label="Checkpoints">
      <div className={styles.head}>
        <span className={styles.count}>{checkpoints.length} checkpoints</span>
        <span className={styles.every}>every {intervalMi} mi</span>
      </div>
      <ol className={styles.rows}>
        {checkpoints.map((c, i) => (
          <li key={i} className={styles.row}>
            <div className={styles.where}>
              <span className={styles.id}>
                #{i + 1} · mi {c.mile.toLocaleString("en-US", { maximumFractionDigits: 1 })}
              </span>
              <span className={styles.eta}>{clock(c.eta)}</span>
            </div>
            <span className={styles.reading}>{headline(c)}</span>
            <RiskBadge level={c.level} />
          </li>
        ))}
      </ol>
    </section>
  );
}
