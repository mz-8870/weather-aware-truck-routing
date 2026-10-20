// Imperial/metric display. The backend is always imperial (SPEC); conversion happens only here.

export type Units = "imperial" | "metric";

const KM_PER_MI = 1.609344;
const KG_PER_LB = 0.45359237;
const MM_PER_IN = 25.4;
const CM_PER_IN = 2.54;
const STORAGE_KEY = "units";

const num = (value: number, max: number, min = 0) =>
  value.toLocaleString("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });

const reading = (value: number | null, text: (v: number) => string) => (value === null ? "—" : text(value));

export function formatter(units: Units) {
  const metric = units === "metric";
  return {
    units,
    distance: (mi: number, digits = 1) => (metric ? `${num(mi * KM_PER_MI, digits)} km` : `${num(mi, digits)} mi`),
    distanceUnit: metric ? "km" : "mi",
    milepost: (mi: number) => num(metric ? mi * KM_PER_MI : mi, 1),
    interval: (mi: number) => (metric ? `${num(mi * KM_PER_MI, 0)} km` : `${mi} mi`),
    wind: (mph: number | null) => reading(mph, (v) => (metric ? `${num(v * KM_PER_MI, 1)} km/h` : `${num(v, 1)} mph`)),
    rain: (inHr: number | null) => reading(inHr, (v) => (metric ? `${num(v * MM_PER_IN, 1, 1)} mm/hr` : `${num(v, 2, 2)} in/hr`)),
    snow: (inHr: number | null) => reading(inHr, (v) => (metric ? `${num(v * CM_PER_IN, 2, 2)} cm/hr` : `${num(v, 2, 2)} in/hr`)),
    weight: (lb: number) => (metric ? `${num(lb * KG_PER_LB, 0)} kg` : `${num(lb, 0)} lb`),
    weightUnit: metric ? "kg" : "lb",
    weightValue: (lb: number) => String(Math.round(metric ? lb * KG_PER_LB : lb)), // input value for a weight in lb
  };
}

export type Formatter = ReturnType<typeof formatter>;

/** A typed weight in the current units -> whole pounds for the backend (rounded at the boundary, PATTERNS rule 10). */
export function lbFromInput(text: string, units: Units): number | undefined {
  if (text.trim() === "") return undefined;
  const value = Number(text);
  return Math.round(units === "metric" ? value / KG_PER_LB : value);
}

// Backend rule and why texts are imperial, e.g. "wind 47 mph + cargo 32,000 lb > 30,000 lb".
// "snow" is captured so its in/hr becomes cm/hr (as in the reading rows) while rain becomes mm/hr.
const QUANTITY = /(snow )?(\d[\d,]*(?:\.\d+)?) (mph|in\/hr|lb|mi)\b/g;

export function convertText(text: string, units: Units, { original = false } = {}): string {
  if (units === "imperial") return text;
  const f = formatter("metric");
  return text
    .replace(QUANTITY, (_match, snow: string | undefined, n: string, unit: string) => {
      const v = Number(n.replace(/,/g, ""));
      const rate = snow ? f.snow(v) : `${num(v * MM_PER_IN, 1, 1)} mm/hr`;
      const metric = { mph: f.wind(v), "in/hr": rate, lb: f.weight(v), mi: f.distance(v) }[unit]!;
      return `${snow ?? ""}${original ? `${metric} (${n} ${unit})` : metric}`;
    })
    .replace(/\bmiles\b/g, "km");
}

const IMPERIAL_REGIONS = ["US", "LR", "MM"]; // where imperial is the everyday default (the app is US-focused)

export const defaultUnits = (locale: string): Units =>
  IMPERIAL_REGIONS.includes(new Intl.Locale(locale).maximize().region ?? "") ? "imperial" : "metric";

export function loadUnits(locale = navigator.language): Units {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "imperial" || saved === "metric") return saved;
  } catch {
    // storage blocked (private mode): fall back to the locale
  }
  return defaultUnits(locale);
}

export function saveUnits(units: Units): void {
  try {
    localStorage.setItem(STORAGE_KEY, units);
  } catch {
    // not remembered this time; the toggle still works
  }
}
