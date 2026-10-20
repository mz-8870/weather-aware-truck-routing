"""Hourly weather at (lat, lon, hour) points from one batched Open-Meteo call, in imperial units."""

from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from time import sleep
from datetime import date, datetime, timezone
from typing import NamedTuple

import httpx

URL = "https://api.open-meteo.com/v1/forecast"
CHUNK = 50  # locations per request: cold Open-Meteo replies for 100 took 12-23 s
PARALLEL = 4  # chunks in flight at once
TIMEOUT_S = 30  # Open-Meteo is slower than routing; its own budget
# 429 (free tier is ~600 locations a minute) and 503 "overloaded" fail fast; two short waits stay inside the 60 s
# function. They mostly help with 503s - the per-minute 429 is avoided by the whole-series cache, not by waiting.
RETRY_DELAYS_S = (1, 3)
CACHE_SIZE = 2_000  # places; a whole series is ~19 KB (4 days) to ~74 KB (16 days) parsed, so <= ~150 MB
MIN_FORECAST_DAYS = 4  # one fetch per place covers a coast-to-coast trip with HOS stops, so re-plans reuse it
MAX_FORECAST_DAYS = 16


class Reading(NamedTuple):
    wind_mph: float | None
    gust_mph: float | None
    rain_in_hr: float | None
    snow_in_hr: float | None
    beyond_forecast: bool


UNKNOWN = Reading(None, None, None, None, False)

Place = tuple[float, float]  # lat, lon to 2 dp (~1 km)


class Series(NamedTuple):
    days: int  # forecast_days it was fetched with, counted from fetched_on
    fetched_on: date  # UTC day of the fetch: after midnight the same days reach one day less far
    hourly: dict  # Open-Meteo's hourly block: every hour of those days


# shortcut: entries never expire, so a warm instance can serve a forecast that has since been updated;
# add a TTL (~1 h, Open-Meteo's update cadence) if instances live long.
_cache: OrderedDict[Place, Series] = OrderedDict()  # per serverless instance


def clear_cache() -> None:
    _cache.clear()


def _hour(hour: datetime) -> str:
    return hour.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:00")


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _days_for(hour: str) -> int:
    ahead = (datetime.fromisoformat(hour).date() - _today()).days + 1
    return min(MAX_FORECAST_DAYS, max(MIN_FORECAST_DAYS, ahead))


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


def _get(client: httpx.Client, params: dict) -> httpx.Response:
    response = client.get(URL, params=params, timeout=TIMEOUT_S)
    for delay in RETRY_DELAYS_S:
        if response.status_code not in (429, 503):
            break
        sleep(delay)
        response = client.get(URL, params=params, timeout=TIMEOUT_S)
    return response


def _fetch_chunk(client: httpx.Client, chunk: list[Place], days: int) -> dict[Place, Series]:
    params = {
        "latitude": ",".join(str(lat) for lat, _ in chunk),
        "longitude": ",".join(str(lon) for _, lon in chunk),
        "hourly": "wind_speed_10m,wind_gusts_10m,rain,snowfall",
        "wind_speed_unit": "mph",
        "timezone": "GMT",
        "forecast_days": days,
    }
    try:
        response = _get(client, params)
        response.raise_for_status()
        body = response.json()
        replies = body if isinstance(body, list) else [body]
        return {place: Series(days, _today(), reply["hourly"]) for place, reply in zip(chunk, replies) if "hourly" in reply}
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
        return {}  # these places stay Unknown, and uncached so a later request retries


def _fetch(client: httpx.Client, need: dict[Place, int]) -> dict[Place, Series]:
    places = sorted(need)
    chunks = [places[i : i + CHUNK] for i in range(0, len(places), CHUNK)]
    with ThreadPoolExecutor(PARALLEL) as pool:
        parts = pool.map(lambda chunk: _fetch_chunk(client, chunk, max(need[p] for p in chunk)), chunks)
    return {place: series for part in parts for place, series in part.items()}


def _covers(series: Series, hour: str, days: int) -> bool:
    """Whether a cached series answers `hour`: it contains it, or today's fetch already went as far as Open-Meteo would."""
    try:
        if hour <= series.hourly["time"][-1]:
            return True
    except (KeyError, IndexError, TypeError):
        return False
    return series.fetched_on == _today() and series.days >= days  # past its end on purpose: beyond the forecast


def readings(client: httpx.Client, points: list[tuple[float, float, datetime]], fetch: bool = True) -> list[Reading]:
    """`fetch=False` reads the cache only: uncached places read Unknown, and an hour past a cached series is beyond
    the forecast. For re-reading places just asked for, so one that failed isn't tried again in the same request."""
    wants = [((round(lat, 2), round(lon, 2)), _hour(hour)) for lat, lon, hour in points]
    need: dict[Place, int] = {}  # places to fetch, with the forecast days that cover every hour asked of them
    for place, hour in wants if fetch else []:
        days, cached = _days_for(hour), _cache.get(place)
        if cached is None or not _covers(cached, hour, days):
            need[place] = max(need.get(place, 0), days)
    fetched = _fetch(client, need) if need else {}
    for place, series in fetched.items():
        _cache[place] = series
        if len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)
    for place, _ in wants:
        if place in _cache:
            _cache.move_to_end(place)
    # Read this request's own fetch first: a batch bigger than the cache evicts its earliest places.
    series = [fetched.get(place) or _cache.get(place) for place, _ in wants]
    return [_safe_reading(s, hour) for s, (_, hour) in zip(series, wants)]


def _safe_reading(series: Series | None, hour: str) -> Reading:
    try:
        return _reading(series.hourly, hour) if series else UNKNOWN
    except (KeyError, IndexError, ValueError, TypeError):  # a malformed series reads as Unknown, never a 500
        return UNKNOWN
