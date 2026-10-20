from datetime import datetime, timedelta, timezone

from django.test import Client

import simulated
from risk import RiskLevel, classify
from tests.test_plan import FakeTomTom, future, post, tomtom_api, trip  # noqa: F401 (fixture)

START = datetime(2026, 1, 10, 12, tzinfo=timezone.utc)
STORM = simulated.STORMS["winter-storm"]


def at(lat: float, lon: float, hours: float = 0):
    (reading,) = simulated.readings("winter-storm", [(lat, lon, START + timedelta(hours=hours))], START)
    return reading


def test_storm_center_is_no_travel_for_an_example_load() -> None:
    r = at(STORM.lat, STORM.lon)
    assert classify(r.wind_mph, r.rain_in_hr, r.snow_in_hr, 32_000).level == RiskLevel.NO_TRAVEL
    assert r.beyond_forecast is False


def test_far_from_the_storm_is_calm() -> None:
    r = at(STORM.lat - 3, STORM.lon)  # ~200 mi south
    assert classify(r.wind_mph, r.rain_in_hr, r.snow_in_hr, 32_000).level == RiskLevel.LOW


def test_storm_drifts_east_and_fades() -> None:
    later = STORM.east_mph * 6 / 69 / 0.75  # degrees of longitude covered in 6 h at ~41°N
    assert at(STORM.lat, STORM.lon + later, hours=6).snow_in_hr > at(STORM.lat, STORM.lon, hours=6).snow_in_hr
    assert at(STORM.lat, STORM.lon, hours=STORM.fades_h[1]).snow_in_hr == 0


def test_demo_plan_uses_the_simulated_storm_not_open_meteo(client: Client, tomtom_api: FakeTomTom) -> None:
    body = post(client, trip(demo="winter-storm")).json()

    assert body["demo"] == "winter-storm"
    assert not [r for r in tomtom_api.sent if r.url.host == "api.open-meteo.com"]
    assert all(c["level"] is not None for c in body["routes"][0]["checkpoints"])


def test_live_plan_says_it_is_not_a_demo(client: Client, tomtom_api: FakeTomTom) -> None:
    assert post(client, trip()).json()["demo"] is None


def test_unknown_demo_is_rejected(client: Client, tomtom_api: FakeTomTom) -> None:
    assert post(client, trip(demo="hurricane")).status_code == 400


def test_demo_heatmap_skips_open_meteo(client: Client, tomtom_api: FakeTomTom) -> None:
    body = {"points": [[STORM.lat, STORM.lon]], "departure": future(), "cargo_lb": 32_000, "demo": "winter-storm"}
    response = client.post("/api/heatmap", body, content_type="application/json")

    assert response.status_code == 200
    assert not tomtom_api.sent
    assert max(response.json()["levels"]["snow"][0]) >= RiskLevel.SEVERE
