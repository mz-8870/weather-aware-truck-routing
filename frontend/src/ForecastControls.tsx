import { CloudRain, EyeOff, Gauge, LoaderCircle, Pause, Play, Snowflake, Wind } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./components/Button";
import { SegmentedControl } from "./components/SegmentedControl";
import { Slider } from "./components/Slider";
import styles from "./ForecastControls.module.css";
import { dayTime, capitalize } from "./format";
import type { Variable } from "./heatmap";
import { riskLevel } from "./risk";
import { formatter, type Formatter } from "./units";
import { useUnits } from "./useUnits";

export const MAX_HOUR = 48;
const PLAY_STEP_MS = 600;
const TICKS = [0, 12, 24, 36, 48];
const LAYERS = [
  { value: "risk", label: "Risk", icon: Gauge },
  { value: "wind", label: "Wind", icon: Wind },
  { value: "rain", label: "Rain", icon: CloudRain },
  { value: "snow", label: "Snow", icon: Snowflake },
  { value: "off", label: "Off", icon: EyeOff },
] as const;
const SCALE = ["Low", "Mod", "High", "Sev", "No Travel"]; // Pencil legend labels

// Same bands as backend/risk.py: Moderate, High, Severe lower bounds, then the No Travel bound.
const BANDS: Record<Exclude<Variable, "risk">, { bounds: number[]; noTravel: string; format: (f: Formatter, v: number) => string }> = {
  wind: { bounds: [25, 35, 45, 55], noTravel: "≥", format: (f, v) => f.wind(v) },
  rain: { bounds: [0.1, 0.25, 0.5, 1], noTravel: ">", format: (f, v) => f.rain(v) },
  snow: { bounds: [0.5, 1, 2, 3], noTravel: ">", format: (f, v) => f.snow(v) },
};

function bandLabels(variable: Variable, f: Formatter): string[] | undefined {
  if (variable === "risk") return undefined;
  const { bounds, noTravel, format } = BANDS[variable];
  // SPEC: metric shows the original threshold too.
  const value = (v: number) => format(f, v) + (f.units === "metric" ? ` (${format(formatter("imperial"), v)})` : "");
  return [`< ${value(bounds[0])}`, ...bounds.slice(0, 3).map((b) => `≥ ${value(b)}`), `${noTravel} ${value(bounds[3])}`];
}

type Props = {
  layer: Variable | "off";
  onLayer: (layer: Variable | "off") => void;
  hour: number;
  onHour: (hour: number) => void;
  departure: string;
  status: "pending" | "error" | "success";
  onRetry: () => void;
};

export function ForecastControls({ layer, onLayer, hour, onHour, departure, status, onRetry }: Props) {
  const f = useUnits();
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (hour >= MAX_HOUR) return setPlaying(false);
    const id = setTimeout(() => onHour(hour + 1), PLAY_STEP_MS);
    return () => clearTimeout(id);
  }, [playing, hour, onHour]);

  const at = new Date(new Date(departure).getTime() + hour * 3600_000).toISOString();
  const bands = layer === "off" ? undefined : bandLabels(layer, f);

  return (
    <>
      <div className={styles.layers}>
        <div className={styles.toggle}>
          <span className={styles.caption} aria-hidden>
            Heatmap
          </span>
          <SegmentedControl label="Heatmap" hideLabel value={layer} options={[...LAYERS]} onChange={onLayer} />
        </div>
        {status === "pending" && layer !== "off" && (
          <p className={styles.chip} role="status">
            <LoaderCircle aria-hidden className={styles.spin} />
            Loading weather layer…
          </p>
        )}
        {status === "error" && (
          <p className={`${styles.chip} ${styles.error}`} role="alert">
            Weather layer didn't load
            <Button variant="ghost" type="button" className={styles.retry} onClick={onRetry}>
              Retry
            </Button>
          </p>
        )}
      </div>

      {layer !== "off" && status === "success" && (
        <section className={styles.legend} aria-label="Legend">
          <h2 className={styles.legendTitle}>{capitalize(layer)} Along Corridor</h2>
          <div className={styles.scale} role="img" aria-label="Low, Moderate, High, Severe, No Travel">
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} style={{ background: `var(--risk-${riskLevel(l).key})` }} />
            ))}
          </div>
          <div className={styles.scaleLabels} aria-hidden>
            {SCALE.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
          {bands && (
            <ul className={styles.bands}>
              {[0, 1, 2, 3, 4].map((l) => (
                <li key={l} className={styles.band}>
                  <span className={styles.swatch} style={{ background: `var(--risk-${riskLevel(l).key})` }} aria-hidden />
                  <span>{riskLevel(l).label}</span>
                  <span className={styles.bound}>{bands[l]}</span>
                </li>
              ))}
            </ul>
          )}
          <ul className={styles.lines}>
            <li className={styles.band}>
              <span className={`${styles.line} ${styles.selectedLine}`} aria-hidden />
              Selected Route
            </li>
            <li className={styles.band}>
              <span className={styles.line} aria-hidden />
              Alternative
            </li>
          </ul>
        </section>
      )}

      <div className={styles.dock}>
        <Button
          variant="secondary"
          type="button"
          className={styles.play}
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            if (!playing && hour >= MAX_HOUR) onHour(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </Button>
        <div className={styles.scrub}>
          <div className={styles.readoutRow}>
            <span className={styles.label}>Forecast Hour</span>
            <span className={styles.readout}>
              +{hour} h · {dayTime(at)}
            </span>
          </div>
          <Slider label="Forecast Hour" value={hour} min={0} max={MAX_HOUR} valueText={`+${hour} h, ${dayTime(at)}`} onChange={onHour} />
          <div className={styles.ticks} aria-hidden>
            {TICKS.map((t) => (
              <span key={t}>{t} h</span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
