import pytest

from risk import RiskLevel, classify


def test_calm_conditions_are_low() -> None:
    assert classify(10, 0, 0, 20_000).level == RiskLevel.LOW


@pytest.mark.parametrize(
    ("wind", "expected"),
    [
        (24.9, RiskLevel.LOW),
        (25, RiskLevel.MODERATE),
        (34.9, RiskLevel.MODERATE),
        (35, RiskLevel.HIGH),
        (44.9, RiskLevel.HIGH),
        (45, RiskLevel.SEVERE),
        (54.9, RiskLevel.SEVERE),
        (55, RiskLevel.NO_TRAVEL),
    ],
)
def test_wind_bands_are_lower_inclusive(wind: float, expected: RiskLevel) -> None:
    assert classify(wind, 0, 0, 0).level == expected


@pytest.mark.parametrize(
    ("rain", "expected"),
    [
        (0.09, RiskLevel.LOW),
        (0.10, RiskLevel.MODERATE),
        (0.24, RiskLevel.MODERATE),
        (0.25, RiskLevel.HIGH),
        (0.49, RiskLevel.HIGH),
        (0.50, RiskLevel.SEVERE),
        (1.00, RiskLevel.SEVERE),
        (1.01, RiskLevel.NO_TRAVEL),
    ],
)
def test_rain_bands_with_severe_including_one_inch(rain: float, expected: RiskLevel) -> None:
    assert classify(0, rain, 0, 0).level == expected


@pytest.mark.parametrize(
    ("snow", "expected"),
    [
        (0.49, RiskLevel.LOW),
        (0.5, RiskLevel.MODERATE),
        (0.99, RiskLevel.MODERATE),
        (1.0, RiskLevel.HIGH),
        (1.99, RiskLevel.HIGH),
        (2.0, RiskLevel.SEVERE),
        (3.0, RiskLevel.SEVERE),
        (3.01, RiskLevel.NO_TRAVEL),
    ],
)
def test_snow_bands_with_severe_including_three_inches(snow: float, expected: RiskLevel) -> None:
    assert classify(0, 0, snow, 0).level == expected


def test_overall_level_is_worst_of_wind_rain_snow() -> None:
    # wind Moderate, rain High, snow Low
    assert classify(30, 0.30, 0.1, 0).level == RiskLevel.HIGH


@pytest.mark.parametrize(
    ("wind", "cargo", "expected"),
    [
        (55, 0, RiskLevel.NO_TRAVEL),
        (47, 30_000, RiskLevel.SEVERE),
        (47, 30_001, RiskLevel.NO_TRAVEL),
        (45, 30_001, RiskLevel.NO_TRAVEL),
        (54.9, 30_001, RiskLevel.NO_TRAVEL),
        (44.9, 30_001, RiskLevel.HIGH),
        (40, 40_000, RiskLevel.HIGH),
        (40, 40_001, RiskLevel.SEVERE),
        (35, 40_001, RiskLevel.SEVERE),
        (34.9, 40_001, RiskLevel.MODERATE),
        (50, 40_001, RiskLevel.NO_TRAVEL),  # both cargo rules apply; the wind 45-55 rule wins
    ],
)
def test_load_rules_raise_level_with_strict_cargo_thresholds(
    wind: float, cargo: float, expected: RiskLevel
) -> None:
    assert classify(wind, 0, 0, cargo).level == expected


def test_load_rule_never_lowers_a_worse_weather_level() -> None:
    # wind 40 + heavy cargo would be Severe, but rain 1.5 in/hr is already No Travel
    assert classify(40, 1.5, 0, 45_000).level == RiskLevel.NO_TRAVEL


def test_result_reports_the_load_rule_that_fired() -> None:
    assert classify(47, 0, 0, 32_000).reasons == ("wind 47 mph + cargo 32,000 lb > 30,000",)


def test_result_reports_every_condition_at_the_worst_level() -> None:
    assert classify(30, 0.30, 1.5, 0).reasons == ("rain 0.3 in/hr: High", "snow 1.5 in/hr: High")


@pytest.mark.parametrize(
    ("inputs", "reason"),
    [
        ((None, 0, 0, 0), "wind missing"),
        ((0, float("nan"), 0, 0), "rain missing"),
        ((0, 0, None, 0), "snow missing"),
        ((60, 0, 0, float("nan")), "cargo missing"),
    ],
)
def test_missing_or_nan_input_is_unknown(
    inputs: tuple[float | None, float | None, float | None, float | None], reason: str
) -> None:
    result = classify(*inputs)
    assert result.level is None
    assert result.reasons == (reason,)


def test_negative_values_clamp_to_zero() -> None:
    result = classify(-5, -0.2, -1, -100)
    assert result.level == RiskLevel.LOW
    assert result.reasons == ("wind 0 mph: Low", "rain 0 in/hr: Low", "snow 0 in/hr: Low")


def test_beyond_forecast_flag_passes_through() -> None:
    assert classify(30, 0, 0, 0, beyond_forecast=True).beyond_forecast is True
    assert classify(30, 0, 0, 0).beyond_forecast is False
    assert classify(None, 0, 0, 0, beyond_forecast=True).beyond_forecast is True


def test_fractional_cargo_just_over_threshold_is_reported_exactly() -> None:
    assert classify(47, 0, 0, 30_000.5).reasons == ("wind 47 mph + cargo 30,000.5 lb > 30,000",)
