import { tokens } from "./tokens";

export type Mode = "light" | "dark";
export type RiskLevel = "low" | "moderate" | "high" | "severe" | "notravel" | "unknown";
export type Rgba = [number, number, number, number];

type Colors = Record<string, Record<Mode, string>>;
type TokenShape = {
  color: Colors;
  px: Record<string, number>;
  ms: Record<string, number>;
  font: Record<string, string>;
};

const RISK_LEVELS: RiskLevel[] = ["low", "moderate", "high", "severe", "notravel", "unknown"];

const vars = (entries: [string, string][]) => entries.map(([k, v]) => `--${k}:${v};`).join("");

export function tokensToCss(t: TokenShape): string {
  const light = vars([
    ...Object.entries(t.color).map(([k, v]): [string, string] => [k, v.light]),
    ...Object.entries(t.px).map(([k, v]): [string, string] => [k, `${v}px`]),
    ...Object.entries(t.ms).map(([k, v]): [string, string] => [k, `${v}ms`]),
    ...Object.entries(t.font).map(([k, v]): [string, string] => [k, `"${v}"`]),
  ]);
  const dark = vars(Object.entries(t.color).map(([k, v]) => [k, v.dark]));
  return `:root,[data-theme="light"]{${light}}\n[data-theme="dark"]{${dark}}`;
}

function hexToRgba(hex: string): Rgba {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return [n(1), n(3), n(5), hex.length === 9 ? n(7) : 255];
}

// deck.gl takes colors as RGBA arrays, not CSS vars, so it reads the same token source directly.
export function riskRgba(mode: Mode, t: { color: Colors } = tokens): Record<RiskLevel, Rgba> {
  return Object.fromEntries(
    RISK_LEVELS.map((level) => [level, hexToRgba(t.color[`risk-${level}`][mode])]),
  ) as Record<RiskLevel, Rgba>;
}

export function setTheme(mode: Mode): void {
  document.documentElement.dataset.theme = mode;
}

const THEME_KEY = "theme";

/** SPEC: light by default; dark only once chosen. */
export function loadTheme(): Mode {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light"; // storage blocked (private mode)
  }
}

export function saveTheme(mode: Mode): void {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    // not remembered this time; the toggle still works
  }
}
