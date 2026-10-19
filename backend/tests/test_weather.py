from datetime import datetime, timedelta, timezone

import httpx
import pytest

import weather

NOW = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
HOURS = [NOW + timedelta(hours=h) for h in range(3)]


def location(rain_mm: float | None = 2.54, snow_cm: float | None = 1.27, wind: float | None = 30.0) -> dict:
    return {
        "hourly": {
            "time": [h.strftime("%Y-%m-%dT%H:00") for h in HOURS],
            "wind_speed_10m": [wind, wind, 5.0],
            "wind_gusts_10m": [40.0, 40.0, 9.0],
            "rain": [rain_mm, rain_mm, 0.0],
            "snowfall": [snow_cm, snow_cm, 0.0],
        }
    }


class FakeOpenMeteo:
    def __init__(self, body=None, status: int = 200) -> None:
        self.sent: list[httpx.Request] = []
        self.body, self.status = body, status

    def client(self, fail_first_lat: float | None = None) -> httpx.Client:
        def handle(request: httpx.Request) -> httpx.Response:
            self.sent.append(request)
            if fail_first_lat is not None and request.url.params["latitude"].startswith(str(fail_first_lat)):
                raise httpx.ReadTimeout("slow", request=request)
            n = len(request.url.params["latitude"].split(","))
            body = self.body if self.body is not None else [location() for _ in range(n)]
            return httpx.Response(self.status, json=body)

        return httpx.Client(transport=httpx.MockTransport(handle))


@pytest.fixture(autouse=True)
def empty_cache() -> None:
    weather.clear_cache()


def test_one_batched_call_converts_units_at_the_eta_hour() -> None:
    api = FakeOpenMeteo()
    r = weather.readings(api.client(), [(39.74, -104.99, HOURS[0]), (41.88, -87.63, HOURS[1])])

    assert len(api.sent) == 1
    assert api.sent[0].url.params["latitude"] == "39.74,41.88"
    assert api.sent[0].url.params["wind_speed_unit"] == "mph"
    # 2.54 mm and 1.27 cm sit exactly on the 0.10 in rain and 0.5 in snow thresholds
    assert r[0] == weather.Reading(wind_mph=30.0, gust_mph=40.0, rain_in_hr=0.10, snow_in_hr=0.5, beyond_forecast=False)
    assert r[1] == r[0]


def test_eta_past_the_last_forecast_hour_uses_the_last_hour() -> None:
    late = HOURS[-1] + timedelta(days=30)
    (r,) = weather.readings(FakeOpenMeteo().client(), [(39.74, -104.99, late)])
    assert r.beyond_forecast and r.wind_mph == 5.0


def test_missing_values_stay_missing() -> None:
    api = FakeOpenMeteo(body=[location(rain_mm=None, wind=None)])
    (r,) = weather.readings(api.client(), [(39.74, -104.99, HOURS[0])])
    assert r.rain_in_hr is None and r.wind_mph is None and r.snow_in_hr == 0.5


def test_single_location_reply_is_an_object_not_a_list() -> None:
    (r,) = weather.readings(FakeOpenMeteo(body=location()).client(), [(39.74, -104.99, HOURS[0])])
    assert r.wind_mph == 30.0


def test_cached_points_are_not_fetched_again() -> None:
    api = FakeOpenMeteo()
    weather.readings(api.client(), [(39.741, -104.991, HOURS[0])])
    weather.readings(api.client(), [(39.738, -104.989, HOURS[0])])  # same at 2 dp
    assert len(api.sent) == 1


def test_large_batches_are_chunked() -> None:
    api = FakeOpenMeteo()
    points = [(30 + i / 10, -100.0, HOURS[0]) for i in range(150)]
    assert len(weather.readings(api.client(), points)) == 150
    assert sorted(len(r.url.params["latitude"].split(",")) for r in api.sent) == [50, 50, 50]


def test_a_slow_chunk_only_loses_its_own_points() -> None:
    api = FakeOpenMeteo()
    points = [(30 + i / 10, -100.0, HOURS[0]) for i in range(100)]
    r = weather.readings(api.client(fail_first_lat=30.0), points)
    assert [x.wind_mph for x in r] == [None] * 50 + [30.0] * 50


def test_open_meteo_gets_a_longer_timeout_than_routing() -> None:
    seen = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request.extensions["timeout"]["read"])
        return httpx.Response(200, json=[location()])

    weather.readings(httpx.Client(transport=httpx.MockTransport(handle)), [(39.74, -104.99, HOURS[0])])
    assert seen == [weather.TIMEOUT_S]


def test_malformed_reply_gives_unknown_not_an_error() -> None:
    (r,) = weather.readings(FakeOpenMeteo(body=[{"nope": 1}]).client(), [(39.74, -104.99, HOURS[0])])
    assert r == weather.UNKNOWN


def test_weather_outage_gives_unknown_readings() -> None:
    (r,) = weather.readings(FakeOpenMeteo(status=500).client(), [(39.74, -104.99, HOURS[0])])
    assert r == weather.Reading(None, None, None, None, False)


def test_overloaded_reply_is_retried_once(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(weather, "RETRY_DELAY_S", 0)
    replies = [httpx.Response(503, json={"reason": "The service is overloaded", "error": True}), httpx.Response(200, json=[location()])]
    client = httpx.Client(transport=httpx.MockTransport(lambda request: replies.pop(0)))
    (r,) = weather.readings(client, [(39.74, -104.99, HOURS[0])])
    assert r.wind_mph == 30.0


def test_a_request_larger_than_the_cache_still_gets_all_its_readings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(weather, "CACHE_SIZE", 2)
    points = [(39.0 + i / 10, -104.9, HOURS[0]) for i in range(5)]
    assert weather.UNKNOWN not in weather.readings(FakeOpenMeteo().client(), points)
