import { Ban, CircleAlert, CircleDashed, OctagonAlert, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import type { RiskLevel } from "./tokens/theme";

type Level = { key: RiskLevel; label: string; Icon: LucideIcon };

// Index = backend level 0–4; Unknown (null) last.
const LEVELS: Level[] = [
  { key: "low", label: "Low", Icon: ShieldCheck },
  { key: "moderate", label: "Moderate", Icon: CircleAlert },
  { key: "high", label: "High", Icon: TriangleAlert },
  { key: "severe", label: "Severe", Icon: OctagonAlert },
  { key: "notravel", label: "No Travel", Icon: Ban },
];
const UNKNOWN: Level = { key: "unknown", label: "Unknown", Icon: CircleDashed };

export const riskLevel = (level: number | null): Level => (level === null ? UNKNOWN : LEVELS[level]);
