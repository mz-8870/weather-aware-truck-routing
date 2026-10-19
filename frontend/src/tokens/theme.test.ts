import { expect, test } from "vitest";
import { riskRgba, setTheme, tokensToCss } from "./theme";
import { tokens } from "./tokens";

const sample = {
  color: { "risk-low": { light: "#5F8A72", dark: "#8DB89F" } },
  px: { "space-4": 16 },
  ms: { "duration-fast": 150 },
  font: { "font-sans": "IBM Plex Sans" },
};

test("tokensToCss writes light vars on :root and dark vars under data-theme=dark", () => {
  expect(tokensToCss(sample)).toBe(
    ':root,[data-theme="light"]{--risk-low:#5F8A72;--space-4:16px;--duration-fast:150ms;--font-sans:"IBM Plex Sans";}\n' +
      '[data-theme="dark"]{--risk-low:#8DB89F;}',
  );
});

test("riskRgba gives deck.gl RGBA arrays per risk level from the same token source", () => {
  expect(riskRgba("light")).toEqual({
    low: [95, 138, 114, 255],
    moderate: [217, 165, 20, 255],
    high: [216, 106, 18, 255],
    severe: [184, 36, 28, 255],
    notravel: [74, 24, 87, 255],
    unknown: [141, 142, 136, 255],
  });
  expect(riskRgba("dark").low).toEqual([141, 184, 159, 255]);
});

test("riskRgba reads alpha from 8-digit hex", () => {
  const t = { color: { ...tokens.color, "risk-low": { light: "#5F8A7280", dark: "#8DB89F" } } };
  expect(riskRgba("light", t).low).toEqual([95, 138, 114, 128]);
});

test("setTheme flips data-theme on <html> without a reload", () => {
  setTheme("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  setTheme("light");
  expect(document.documentElement.dataset.theme).toBe("light");
});
