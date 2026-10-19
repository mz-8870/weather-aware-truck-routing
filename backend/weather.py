"""Hourly weather at (lat, lon, hour) points from one batched Open-Meteo call, in imperial units."""

from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from time import sleep
from datetime import datetime, timezone
from typing import NamedTuple

import httpx

URL = "https://api.open-meteo.com/v1/forecast"
CHUNK = 50  # locations per request: cold Open-Meteo replies for 100 took 12-23 s
PARALLEL = 4  # chunks in flight at once
TIMEOUT_S = 30  # Open-Meteo is slower than routing; its own budget
RETRY_DELAY_S = 1  # one retry for "service is overloaded" 503s / 429s, which fail fast
CACHE_SIZE = 50_000
MAX_FORECAST_DAYS = 16


class Reading(NamedTuple):
    wind_mph: float | None
    gust_mph: float | None
    rain_in_hr: float | None
    snow_in_hr: float | None
    beyond_forecast: bool


UNKNOWN = Reading(None, None, None, None, False)

Key = tuple[float, float, str]
# shortcut: entries never expire, so a warm instance can serve a forecast that has since been updated;
# add a TTL (~1 h, Open-Meteo's update cadence) if instances live long.
_cache: OrderedDict[Key, Reading] = OrderedDict()  # per serverless instance


def clear_cache() -> None:
    _cache.clear()


def _key(lat: float, lon: float, hour: datetime) -> Key:
    return round(lat, 2), round(lon, 2), hour.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:00")


def _convert(value: float | None, divisor: float) -> float | None:
    # Round at the conversion boundary so thresholds don't flip on float error (PATTERNS rule 10).
    return None if value is None else round(value / divisor, 2)


def _reading(hourly: dict, hour: str) -> Reading:
    times = hourly["time"]
    beyond = hour > times[-1]
    i = times.index(hour) if hour in times else (len(times) - 1 if beyond else 0)
    return Reading(
        wind_mph=hourly["wind_speed_10m"][i],
        gust_mph=hourly["wind_gusts_10m"][i],
        rain_in_hr=_convert(hourly["rain"][i], 25.4),  # mm -> in
        snow_in_hr=_convert(hourly["snowfall"][i], 2.54),  # cm -> in
        beyond_forecast=beyond,
    )


def _fetch_chunk(client: httpx.Client, chunk: list[tuple[float, float]], keys: list[Key], days: int) -> dict[Key, Reading]:
    params = {
        "latitude": ",".join(str(lat) for lat, _ in chunk),
        "longitude": ",".join(str(lon) for _, lon in chunk),
        "hourly": "wind_speed_10m,wind_gusts_10m,rain,snowfall",
        "wind_speed_unit": "mph",
        "timezone": "GMT",
        "forecast_days": days,
    }
    try:
        response = client.get(URL, params=params, timeout=TIMEOUT_S)
        if response.status_code in (429, 503):
            sleep(RETRY_DELAY_S)
            response = client.get(URL, params=params, timeout=TIMEOUT_S)
        response.raise_for_status()
        body = response.json()
        by_coord = dict(zip(chunk, body if isinstance(body, list) else [body]))
        return {k: _reading(by_coord[(k[0], k[1])]["hourly"], k[2]) for k in keys if (k[0], k[1]) in by_coord}
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
        return {}  # these points stay Unknown, and uncached so a later request retries


def _fetch(client: httpx.Client, keys: list[Key]) -> dict[Key, Reading]:
    coords = sorted({(lat, lon) for lat, lon, _ in keys})
    last_day = max(datetime.fromisoformat(h).date() for _, _, h in keys)
    days = min(MAX_FORECAST_DAYS, max(1, (last_day - datetime.now(timezone.utc).date()).days + 1))
    chunks = [coords[i : i + CHUNK] for i in range(0, len(coords), CHUNK)]
    with ThreadPoolExecutor(PARALLEL) as pool:
        parts = pool.map(lambda chunk: _fetch_chunk(client, chunk, keys, days), chunks)
    return {k: r for part in parts for k, r in part.items()}


def readings(client: httpx.Client, points: list[tuple[float, float, datetime]]) -> list[Reading]:
    keys = [_key(*p) for p in points]
    missing = [k for k in dict.fromkeys(keys) if k not in _cache]
    fetched = _fetch(client, missing) if missing else {}
    for key, reading in fetched.items():
        _cache[key] = reading
        if len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)
    for k in keys:
        if k in _cache:
            _cache.move_to_end(k)
    # Read this request's own fetch first: a batch bigger than the cache evicts its earliest keys.
    return [fetched.get(k) or _cache.get(k, UNKNOWN) for k in keys]
