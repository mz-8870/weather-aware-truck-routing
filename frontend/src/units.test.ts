import { afterEach, expect, test } from "vitest";
import { convertText, defaultUnits, formatter, lbFromInput, loadUnits, saveUnits } from "./units";

afterEach(() => localStorage.clear());

const imperial = formatter("imperial");
const metric = formatter("metric");

test("distances: imperial as given, metric in km", () => {
  expect(imperial.distance(1003.4)).toBe("1,003.4 mi");
  expect(metric.distance(1003.4)).toBe("1,614.8 km");
  expect(metric.distance(521, 0)).toBe("838 km");
  expect(metric.distance(0)).toBe("0 km");
});

test("readings: wind km/h, rain mm/hr, snow cm/hr at the classifier's precision", () => {
  expect(imperial.wind(24.6)).toBe("24.6 mph");
  expect(metric.wind(47)).toBe("75.6 km/h");
  expect(imperial.rain(0.04)).toBe("0.04 in/hr");
  expect(metric.rain(0.1)).toBe("2.5 mm/hr");
  expect(imperial.snow(0.5)).toBe("0.50 in/hr");
  expect(metric.snow(0.5)).toBe("1.27 cm/hr");
  expect(metric.wind(null)).toBe("—");
});

test("metric readings stay distinct on both sides of every band edge (PATTERNS rule 10)", () => {
  const edges = { wind: [25, 35, 45, 55], rain: [0.1, 0.25, 0.5, 1], snow: [0.5, 1, 2, 3] } as const;
  const step = { wind: 0.1, rain: 0.01, snow: 0.01 }; // backend precision
  for (const [kind, values] of Object.entries(edges) as [keyof typeof edges, readonly number[]][])
    for (const edge of values) expect(metric[kind](edge - step[kind])).not.toBe(metric[kind](edge));
});

test("weights: lb or kg, whole numbers", () => {
  expect(imperial.weight(32000)).toBe("32,000 lb");
  expect(metric.weight(32000)).toBe("14,515 kg");
});

test("interval labels follow units; the value stays miles", () => {
  expect([10, 25, 50].map((mi) => metric.interval(mi))).toEqual(["16 km", "40 km", "80 km"]);
  expect(imperial.interval(25)).toBe("25 mi");
});

test("metric weight input converts to whole pounds, so a threshold value can't flip on float error", () => {
  expect(lbFromInput("13607.77", "metric")).toBe(30000); // exactly 30,000 lb: must not become 30,000.0001 (> 30,000)
  expect(lbFromInput("13608", "metric")).toBe(30001); // 13,608 kg really is over 30,000 lb
  expect(lbFromInput("14515", "metric")).toBe(32000);
  expect(lbFromInput("32000", "imperial")).toBe(32000);
  expect(lbFromInput("", "metric")).toBeUndefined();
});

test("weights are kept in pounds and shown in the current units, stable for whole-kg typing", () => {
  expect(metric.weightValue(35000)).toBe("15876");
  expect(imperial.weightValue(35000)).toBe("35000");
  for (const kg of [1, 14, 999, 14515, 36287]) expect(metric.weightValue(lbFromInput(String(kg), "metric")!)).toBe(String(kg));
});

test("backend rule text converts numbers with units, keeping the imperial original when asked", () => {
  const rule = "wind 47 mph + cargo 32,000 lb > 30,000 lb";
  expect(convertText(rule, "imperial")).toBe(rule);
  expect(convertText(rule, "metric", { original: true })).toBe(
    "wind 75.6 km/h (47 mph) + cargo 14,515 kg (32,000 lb) > 13,608 kg (30,000 lb)",
  );
  expect(convertText("rain 0.3 in/hr: High", "metric", { original: true })).toBe("rain 7.6 mm/hr (0.3 in/hr): High");
  expect(convertText("snow 1 in/hr: High", "metric", { original: true })).toBe("snow 2.54 cm/hr (1 in/hr): High"); // same unit as the reading row
});

test("the ranking note converts too", () => {
  expect(convertText("Ranked by severe miles, then high miles, average risk, travel time.", "metric")).toBe(
    "Ranked by severe km, then high km, average risk, travel time.",
  );
});

test("why text converts miles to km without originals", () => {
  expect(convertText("Wins on high miles: 12.5 mi vs 48.0 mi on Route B (both 0 severe).", "metric")).toBe(
    "Wins on high km: 20.1 km vs 77.2 km on Route B (both 0 severe).",
  );
});

test("units default from the browser locale and are remembered", () => {
  expect(defaultUnits("en-US")).toBe("imperial");
  expect(defaultUnits("en-GB")).toBe("metric");
  expect(defaultUnits("de-DE")).toBe("metric");
  expect(loadUnits("en-US")).toBe("imperial");
  saveUnits("metric");
  expect(loadUnits("en-US")).toBe("metric");
});
