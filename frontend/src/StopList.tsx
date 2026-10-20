import { BedDouble, Coffee } from "lucide-react";
import { dayTime } from "./format";
import type { Stop } from "./plan";
import styles from "./StopList.module.css";
import { useUnits } from "./useUnits";

export const STOP = {
  break: { label: "30 min Break", Icon: Coffee },
  rest: { label: "10 h Rest", Icon: BedDouble },
};

/** Where and when the driver stops under US hours of service. */
export function StopList({ stops }: { stops: Stop[] }) {
  const f = useUnits();
  return (
    <ul className={styles.list} aria-label="Stops">
      {stops.map((s) => {
        const { label, Icon } = STOP[s.kind];
        const end = new Date(new Date(s.start).getTime() + s.duration_s * 1000).toISOString();
        return (
          <li key={s.offset_s} className={styles.row}>
            <Icon aria-hidden className={styles.icon} />
            <span className={styles.what}>
              <span className={styles.label}>{label}</span>
              <span className={styles.where}>
                {f.distanceUnit} {f.milepost(s.mile)}
                {s.place && ` · near ${s.place}`}
              </span>
            </span>
            <span className={styles.when}>
              {dayTime(s.start)}
              {s.kind === "rest" && ` – ${dayTime(end)}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
