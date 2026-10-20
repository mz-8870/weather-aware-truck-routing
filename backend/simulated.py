"""Scripted storms for the example trips (demo mode). Routes, distances and drive times stay real (TomTom); only the
weather is simulated, so the examples show risky routes on a clear day. The UI labels the weather as simulated."""
import math
from datetime import datetime
from typing import NamedTuple

from weather import Reading


class Storm(NamedTuple):
    lat: float  # center at the start
    lon: float
    east_mph: float  # drift
    sigma_mi: float  # Gaussian falloff from the center
    wind_mph: float  # at the center, full strength
    snow_in_hr: float
    rain_in_hr: float
    fades_h: tuple[float, float]  # full strength until the first hour after the start, gone by the second


CALM_WIND_MPH = 8.0
GUST_RATIO = 1.3

STORMS = {
    # Over I-80 in southern Wyoming: No Travel there for the examples' 32,000 lb load, High on US-40, clear on I-70.
    "winter-storm": Storm(41.35, -107.0, 10, 60, 52, 2.5, 0.0, (18, 30)),
    # Over I-40 near Elk City, OK; the routes north and south of it get Moderate wind.
    "high-wind": Storm(35.3, -99.4, 10, 45, 52, 0.0, 0.1, (18, 30)),
}


def readings(name: str, points: list[tuple[float, float, datetime]], start: datetime) -> list[Reading]:
    """Same shape as `weather.readings`; `start` is when the storm is where `STORMS` puts it."""
    storm, out = STORMS[name], []
    for lat, lon, when in points:
        hours = (when - start).total_seconds() / 3600
        strength = min(1.0, max(0.0, (storm.fades_h[1] - hours) / (storm.fades_h[1] - storm.fades_h[0])))
        north_mi = (lat - storm.lat) * 69.0
        east_mi = (lon - storm.lon) * 69.0 * math.cos(math.radians(lat)) - storm.east_mph * hours
        k = strength * math.exp(-(north_mi**2 + east_mi**2) / (2 * storm.sigma_mi**2))
        wind = round(max(CALM_WIND_MPH, storm.wind_mph * k), 1)
        out.append(Reading(wind, round(wind * GUST_RATIO, 1), round(storm.rain_in_hr * k, 2), round(storm.snow_in_hr * k, 2), False))
    return out
