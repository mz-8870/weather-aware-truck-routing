"""Checkpoint risk classification (docs/SPEC.md, "Risk classification"). Pure Python, no Django."""
import math
from dataclasses import dataclass
from enum import IntEnum


class RiskLevel(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        return self.name.replace("_", " ").title()


@dataclass(frozen=True)
class RiskResult:
    level: RiskLevel | None  # None = Unknown (missing/NaN input)
    reasons: tuple[str, ...]  # every rule that produced `level`
    beyond_forecast: bool  # weather came from the last available forecast hour


@dataclass(frozen=True)
class _Bands:
    lower_bounds: tuple[float, float, float]  # Moderate, High, Severe (inclusive)
    no_travel: float
    no_travel_inclusive: bool  # wind: >= 55; rain/snow: strictly above (Severe includes the bound)

    def level(self, value: float) -> RiskLevel:
        if value > self.no_travel or (self.no_travel_inclusive and value == self.no_travel):
            return RiskLevel.NO_TRAVEL
        return RiskLevel(sum(value >= bound for bound in self.lower_bounds))


WIND_MPH = _Bands((25, 35, 45), 55, no_travel_inclusive=True)
RAIN_IN_HR = _Bands((0.10, 0.25, 0.50), 1.00, no_travel_inclusive=False)
SNOW_IN_HR = _Bands((0.5, 1.0, 2.0), 3.0, no_travel_inclusive=False)


def _load_rule(wind_mph: float, cargo_lb: float) -> tuple[RiskLevel, str] | None:
    # wind >= 55 at any load is already No Travel via the wind band.
    if 45 <= wind_mph < 55 and cargo_lb > 30_000:
        return RiskLevel.NO_TRAVEL, f"wind {wind_mph:g} mph + cargo {cargo_lb:,g} lb > 30,000"
    if 35 <= wind_mph < 45 and cargo_lb > 40_000:
        return RiskLevel.SEVERE, f"wind {wind_mph:g} mph + cargo {cargo_lb:,g} lb > 40,000"
    return None


def classify(
    wind_mph: float | None,
    rain_in_hr: float | None,
    snow_in_hr: float | None,
    cargo_lb: float | None,
    beyond_forecast: bool = False,
) -> RiskResult:
    inputs = {"wind": wind_mph, "rain": rain_in_hr, "snow": snow_in_hr, "cargo": cargo_lb}
    missing = tuple(f"{name} missing" for name, value in inputs.items() if value is None or math.isnan(value))
    if missing:
        return RiskResult(None, missing, beyond_forecast)
    wind, rain, snow, cargo = (max(0.0, value or 0.0) for value in inputs.values())

    rules = [
        (WIND_MPH.level(wind), f"wind {wind:g} mph"),
        (RAIN_IN_HR.level(rain), f"rain {rain:g} in/hr"),
        (SNOW_IN_HR.level(snow), f"snow {snow:g} in/hr"),
    ]
    rules = [(level, f"{text}: {level.label}") for level, text in rules]
    if load := _load_rule(wind, cargo):
        rules.append(load)
    level = max(rule_level for rule_level, _ in rules)
    return RiskResult(level, tuple(text for rule_level, text in rules if rule_level == level), beyond_forecast)
