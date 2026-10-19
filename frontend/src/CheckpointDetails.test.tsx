import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { CheckpointDetails } from "./CheckpointDetails";
import type { Checkpoint } from "./plan";

afterEach(cleanup);

const base: Checkpoint = {
  mile: 350,
  lat: 41,
  lon: -100,
  offset_s: 5 * 3600 + 20 * 60,
  eta: "2030-01-15T13:20:00+00:00",
  level: 4,
  reasons: ["wind 47 mph + cargo 32,000 lb > 30,000 lb"],
  beyond_forecast: false,
  wind_mph: 47,
  gust_mph: 61,
  rain_in_hr: 0.04,
  snow_in_hr: 0,
  owned_mi: 25,
};

test("shows ETA, readings, level and the rule that set it", () => {
  render(<CheckpointDetails checkpoint={base} number={14} />);
  expect(screen.getByText("Checkpoint 14 · mile 350")).toBeTruthy();
  expect(screen.getByText(/\+5h 20m$/)).toBeTruthy();
  expect(screen.getByText("No Travel")).toBeTruthy();
  expect(screen.getByText("47 mph")).toBeTruthy();
  expect(screen.getByText("Gusts (info)")).toBeTruthy();
  expect(screen.getByText("61 mph")).toBeTruthy();
  expect(screen.getByText("0.04 in/hr")).toBeTruthy();
  expect(screen.getByText("0.00 in/hr")).toBeTruthy();
  expect(screen.getByText("Why No Travel")).toBeTruthy();
  expect(screen.getByText("Wind 47 mph + cargo 32,000 lb > 30,000 lb")).toBeTruthy();
});

test("wind just under a threshold is not rounded up to it", () => {
  render(<CheckpointDetails checkpoint={{ ...base, level: 0, wind_mph: 24.6 }} number={1} />);
  expect(screen.getByText("24.6 mph")).toBeTruthy();
});

test("unknown checkpoint shows dashes and explains the missing data", () => {
  const unknown = { ...base, level: null, wind_mph: null, gust_mph: null, rain_in_hr: null, snow_in_hr: null };
  render(<CheckpointDetails checkpoint={unknown} number={9} />);
  expect(screen.getByText("Unknown")).toBeTruthy();
  expect(screen.getAllByText("—")).toHaveLength(4);
  expect(screen.getByText("No forecast for this point")).toBeTruthy();
  expect(screen.getByText(/These 25 mi count as unknown/)).toBeTruthy();
});

test("beyond-forecast checkpoint keeps its rule and says it is an estimate", () => {
  const beyond = { ...base, level: 1, beyond_forecast: true, reasons: ["wind 28 mph: Moderate"] };
  render(<CheckpointDetails checkpoint={beyond} number={61} />);
  expect(screen.getByText("Moderate")).toBeTruthy();
  expect(screen.getByText("Why Moderate")).toBeTruthy();
  expect(screen.getByText("Wind 28 mph: Moderate")).toBeTruthy();
  expect(screen.getByText("Beyond forecast")).toBeTruthy();
  expect(screen.getByText(/treat as an estimate/)).toBeTruthy();
});

test("partly missing data names what is missing", () => {
  const partial = { ...base, level: null, rain_in_hr: null, reasons: ["rain missing"] };
  render(<CheckpointDetails checkpoint={partial} number={3} />);
  expect(screen.getByText("No forecast for this point")).toBeTruthy();
  expect(screen.getByText(/^Rain missing\. These 25 mi count as unknown/)).toBeTruthy();
});
