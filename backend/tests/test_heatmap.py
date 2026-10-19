from datetime import datetime, timedelta, timezone
from math import asin, cos, radians, sin, sqrt

import httpx
import pytest
from django.test import Client

import tomtom
import weather
from heatmap import corridor_grid
from tests.test_plan import FakeTomTom, future

DENVER = (39.7392, -104.9903)
CHEYENNE = (41.14, -104.82)


def miles(a: tuple[float, float], b: tuple[float, float]) -> float:
    (lat1, lon1), (lat2, lon2) = map(radians, a), map(radians, b)
    return 2 * 3958.8 * asin(sqrt(sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2))


def line(a: tuple[float, float], b: tuple[float, float], n: int = 20) -> list[tuple[float, float]]:
    return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]


def test_grid_covers_the_corridor_and_nothing_far_from_it() -> None:
    route = line(DENVER, CHEYENNE)
    cells = corridor_grid(route)
    nearest = [min(miles(c, p) for p in route) for c in cells]
    assert max(nearest) <= 50
    # every route point has a cell within half a grid diagonal (~18 mi at 25 mi spacing)
    assert all(min(miles(p, c) for c in cells) <= 18 for p in route)


def test_grid_spacing_is_about_25_miles() -> None:
    cells = corridor_grid(line(DENVER, CHEYENNE))
    gaps = [min(miles(a, b) for b in cells if b != a) for a in cells]
    assert 23 <= min(gaps) and max(gaps) <= 27


def test_overlapping_routes_do_not_duplicate_cells() -> None:
    route = line(DENVER, CHEYENNE)
    assert len(corridor_grid(route + route)) == len(corridor_grid(route))


# --- POST /api/heatmap ---


def windy(request: httpx.Request) -> httpx.Response:
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    times = [(start + timedelta(hours=h)).strftime("%Y-%m-%dT%H:00") for h in range(96)]
    hourly = {
        "time": times,
        "wind_speed_10m": [47.0] * 96,  # Severe; with cargo > 30,000 lb, No Travel
        "wind_gusts_10m": [50.0] * 96,
        "rain": [7.62] * 96,  # 0.30 in/hr: High
        "snowfall": [0.0] * 96,
    }
    return httpx.Response(200, json=[{"hourly": hourly}] * len(request.url.params["latitude"].split(",")))


@pytest.fixture
def open_meteo(monkeypatch: pytest.MonkeyPatch) -> FakeTomTom:
    weather.clear_cache()
    fake = FakeTomTom()
    fake.handler = windy
    monkeypatch.setattr(tomtom, "http_client", lambda: httpx.Client(transport=httpx.MockTransport(fake)))
    return fake


def heatmap(client: Client, **overrides):
    body = {"points": [list(p) for p in line(DENVER, CHEYENNE)], "departure": future(), "cargo_lb": 32000, **overrides}
    return client.post("/api/heatmap", body, content_type="application/json")


def test_heatmap_returns_49_hours_of_levels_per_variable(client: Client, open_meteo: FakeTomTom) -> None:
    response = heatmap(client)
    assert response.status_code == 200
    body = response.json()

    assert len(body["hours"]) == 49
    first, last = datetime.fromisoformat(body["hours"][0]), datetime.fromisoformat(body["hours"][-1])
    assert last - first == timedelta(hours=48)
    n = len(body["cells"])
    assert n > 0 and all(len(c) == 2 for c in body["cells"])  # [lon, lat]
    for variable, level in {"risk": 4, "wind": 3, "rain": 2, "snow": 0}.items():
        grid = body["levels"][variable]
        assert len(grid) == 49 and all(len(hour) == n for hour in grid)
        assert grid[0][0] == level


def test_heatmap_is_one_chunked_weather_batch(client: Client, open_meteo: FakeTomTom) -> None:
    body = heatmap(client).json()
    expected_requests = -(-len(body["cells"]) // weather.CHUNK)  # ceil
    assert len(open_meteo.sent) == expected_requests


def test_light_cargo_lowers_risk_but_not_the_wind_layer(client: Client, open_meteo: FakeTomTom) -> None:
    levels = heatmap(client, cargo_lb=10000).json()["levels"]
    assert levels["risk"][0][0] == 3 and levels["wind"][0][0] == 3


def test_weather_outage_is_a_502(client: Client, open_meteo: FakeTomTom) -> None:
    open_meteo.handler = lambda request: httpx.Response(500)
    response = heatmap(client)
    assert response.status_code == 502
    assert response.json() == {"detail": "Weather layer didn't load."}


@pytest.mark.parametrize(
    "bad",
    [{"points": []}, {"points": [[91, 0]]}, {"points": [[39.7, -104.9]] * 2001}, {"cargo_lb": -1}, {"departure": "soon"}],
)
def test_bad_heatmap_requests_are_rejected(client: Client, open_meteo: FakeTomTom, bad: dict) -> None:
    response = heatmap(client, **bad)
    assert response.status_code == 400
    assert set(bad) <= set(response.json())


def test_too_large_a_corridor_is_rejected_before_fetching_weather(client: Client, open_meteo: FakeTomTom) -> None:
    scattered = [[25 + i % 24, -124 + i // 24 * 2] for i in range(24 * 28)]  # points all over the US
    response = heatmap(client, points=scattered)
    assert response.status_code == 400
    assert "points" in response.json()
    assert open_meteo.sent == []
