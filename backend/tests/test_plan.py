from datetime import datetime, timedelta, timezone

import httpx
import pytest
from django.test import Client

import tomtom
import weather

DENVER = {"lat": 39.7392, "lon": -104.9903}
CHICAGO = {"lat": 41.8781, "lon": -87.6298}
POLYLINE = [(39.7392, -104.9903), (40.5, -100.0), (41.8781, -87.6298)]


def future(hours: int = 2) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def trip(**overrides: object) -> dict:
    return {
        "origin": "Denver, CO",
        "destination": "Chicago, IL",
        "departure": future(),
        "weight_lb": 70000,
        "weight_mode": "gross",
        **overrides,
    }


def open_meteo(request: httpx.Request, wind_mph: float = 47.0) -> httpx.Response:
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    times = [(start + timedelta(hours=h)).strftime("%Y-%m-%dT%H:00") for h in range(72)]
    hourly = {"time": times, "wind_speed_10m": [wind_mph] * 72, "wind_gusts_10m": [60.0] * 72, "rain": [0.0] * 72, "snowfall": [0.0] * 72}
    n = len(request.url.params["latitude"].split(","))
    return httpx.Response(200, json=[{"hourly": hourly}] * n)


def tomtom_ok(request: httpx.Request) -> httpx.Response:
    if request.url.host == "api.open-meteo.com":
        return open_meteo(request)
    if request.url.path.startswith("/search/"):
        position = DENVER if "Denver" in request.url.path else CHICAGO
        return httpx.Response(200, json={"results": [{"position": position}]})
    return httpx.Response(
        200,
        json={
            "routes": [
                {
                    "summary": {"lengthInMeters": 1609344, "travelTimeInSeconds": 54000},
                    "legs": [{"points": [{"latitude": lat, "longitude": lon} for lat, lon in POLYLINE]}],
                    "progress": [
                        {"pointIndex": 0, "distanceInMeters": 0, "travelTimeInSeconds": 0},
                        {"pointIndex": 2, "distanceInMeters": 1609344, "travelTimeInSeconds": 54000},
                    ],
                }
            ]
        },
    )


class FakeTomTom:
    """Stands in for TomTom and Open-Meteo at the HTTP boundary; records requests, answers with `handler`."""

    def __init__(self) -> None:
        self.sent: list[httpx.Request] = []
        self.handler = tomtom_ok

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.sent.append(request)
        return self.handler(request)


@pytest.fixture
def tomtom_api(monkeypatch: pytest.MonkeyPatch, settings) -> FakeTomTom:
    settings.TOMTOM_API_KEY = "test-key"
    weather.clear_cache()
    fake = FakeTomTom()
    monkeypatch.setattr(tomtom, "http_client", lambda: httpx.Client(transport=httpx.MockTransport(fake)))
    return fake


def post(client: Client, body: dict):
    return client.post("/api/plan", body, content_type="application/json")


def test_plan_returns_truck_route(client: Client, tomtom_api: FakeTomTom) -> None:
    response = post(client, trip())

    assert response.status_code == 200
    (route,) = response.json()["routes"]
    assert route["distance_mi"] == 1000.0
    assert route["duration_s"] == 54000

    routing = next(r for r in tomtom_api.sent if r.url.path.startswith("/routing/"))
    assert routing.url.path == "/routing/1/calculateRoute/39.7392,-104.9903:41.8781,-87.6298/json"
    assert routing.url.params["travelMode"] == "truck"
    assert routing.url.params["vehicleWeight"] == "31751"  # 70,000 lb in kg
    assert routing.url.params["departAt"].endswith("Z")
    assert routing.url.params["key"] == "test-key"
    assert routing.url.params.get_list("extendedRouteRepresentation") == ["distance", "travelTime"]


def test_plan_returns_classified_checkpoints_every_interval(client: Client, tomtom_api: FakeTomTom) -> None:
    (route,) = post(client, trip(interval_mi=50)).json()["routes"]

    cps = route["checkpoints"]
    assert [c["mile"] for c in cps] == [50 * k for k in range(21)]
    assert cps[-1]["offset_s"] == 54000
    weather_calls = [r for r in tomtom_api.sent if r.url.host == "api.open-meteo.com"]
    assert len(weather_calls) == 1
    # wind 47 mph is Severe; cargo = 70,000 gross - 35,000 empty = 35,000 > 30,000 raises it to No Travel
    assert cps[3]["level"] == 4
    assert cps[3]["reasons"] == ["wind 47 mph + cargo 35,000 lb > 30,000"]
    assert cps[3]["wind_mph"] == 47.0 and cps[3]["gust_mph"] == 60.0 and cps[3]["beyond_forecast"] is False
    assert cps[3]["eta"] == (datetime.fromisoformat(cps[0]["eta"]) + timedelta(seconds=cps[3]["offset_s"])).isoformat()


def test_route_segments_follow_checkpoint_levels(client: Client, tomtom_api: FakeTomTom) -> None:
    (route,) = post(client, trip()).json()["routes"]
    assert len(route["segments"]) == len(route["checkpoints"])
    assert route["segments"][0]["coordinates"][0] == [POLYLINE[0][1], POLYLINE[0][0]]
    assert {s["level"] for s in route["segments"]} == {4}


def test_interval_defaults_to_25_and_rejects_others(client: Client, tomtom_api: FakeTomTom) -> None:
    (route,) = post(client, trip()).json()["routes"]
    assert route["checkpoints"][1]["mile"] == 25
    assert post(client, trip(interval_mi=30)).status_code == 400


def test_weather_outage_leaves_checkpoints_unknown(client: Client, tomtom_api: FakeTomTom) -> None:
    tomtom_api.handler = lambda request: (
        httpx.Response(500) if request.url.host == "api.open-meteo.com" else tomtom_ok(request)
    )
    response = post(client, trip())
    assert response.status_code == 200
    cp = response.json()["routes"][0]["checkpoints"][0]
    assert cp["level"] is None and "wind missing" in cp["reasons"]


def test_past_departure_is_rejected(client: Client, tomtom_api: FakeTomTom) -> None:
    response = post(client, trip(departure=future(hours=-1)))
    assert response.status_code == 400
    assert "departure" in response.json()
    assert tomtom_api.sent == []


def test_same_origin_and_destination_is_rejected(client: Client, tomtom_api: FakeTomTom) -> None:
    response = post(client, trip(destination=" denver, co "))
    assert response.status_code == 400
    assert "destination" in response.json()


def test_negative_weight_is_rejected(client: Client, tomtom_api: FakeTomTom) -> None:
    response = post(client, trip(weight_lb=-1))
    assert response.status_code == 400
    assert "weight_lb" in response.json()


def test_routing_failure_returns_502(client: Client, tomtom_api: FakeTomTom) -> None:
    tomtom_api.handler = lambda request: httpx.Response(503)
    assert post(client, trip()).status_code == 502


def test_no_route_returns_422(client: Client, tomtom_api: FakeTomTom) -> None:
    tomtom_api.handler = lambda request: (
        tomtom_ok(request) if request.url.path.startswith("/search/") else httpx.Response(200, json={"routes": []})
    )
    assert post(client, trip()).status_code == 422


def test_unknown_place_returns_422(client: Client, tomtom_api: FakeTomTom) -> None:
    tomtom_api.handler = lambda request: httpx.Response(200, json={"results": []})
    assert post(client, trip()).status_code == 422


def test_tomtom_no_route_error_returns_422(client: Client, tomtom_api: FakeTomTom) -> None:
    no_route = {"detailedError": {"code": "NO_ROUTE_FOUND", "message": "No valid route found"}}
    tomtom_api.handler = lambda request: (
        tomtom_ok(request) if request.url.path.startswith("/search/") else httpx.Response(400, json=no_route)
    )
    assert post(client, trip()).status_code == 422


def test_other_tomtom_400_returns_502(client: Client, tomtom_api: FakeTomTom) -> None:
    tomtom_api.handler = lambda request: httpx.Response(400, json={"detailedError": {"code": "INVALID_REQUEST"}})
    assert post(client, trip()).status_code == 502


def test_unknown_place_names_the_place(client: Client, tomtom_api: FakeTomTom) -> None:
    tomtom_api.handler = lambda request: httpx.Response(200, json={"results": []})
    assert post(client, trip()).json()["detail"] == "Couldn't find 'Denver, CO'."


def test_geocoding_is_limited_to_the_us(client: Client, tomtom_api: FakeTomTom) -> None:
    post(client, trip())
    assert tomtom_api.sent[0].url.params["countrySet"] == "US"


def test_non_json_reply_returns_502(client: Client, tomtom_api: FakeTomTom) -> None:
    tomtom_api.handler = lambda request: httpx.Response(200, text="<html>proxy</html>")
    assert post(client, trip()).status_code == 502


def test_routing_error_does_not_carry_the_api_key() -> None:
    def fail(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    with httpx.Client(transport=httpx.MockTransport(fail)) as c, pytest.raises(tomtom.RoutingError) as e:
        tomtom.geocode(c, "Denver")
    assert "key=" not in str(e.value)


def test_same_place_by_different_names_returns_422(client: Client, tomtom_api: FakeTomTom) -> None:
    def zero_length(request: httpx.Request) -> httpx.Response:
        if request.url.path.startswith("/routing/"):
            point = {"latitude": 39.7392, "longitude": -104.9903}
            zero = {"pointIndex": 0, "distanceInMeters": 0, "travelTimeInSeconds": 0}
            route = {"summary": {"lengthInMeters": 0, "travelTimeInSeconds": 0}, "legs": [{"points": [point, point]}], "progress": [zero]}
            return httpx.Response(200, json={"routes": [route]})
        return tomtom_ok(request)

    tomtom_api.handler = zero_length
    response = post(client, trip(destination="Denver Colorado"))
    assert response.status_code == 422
    assert response.json()["detail"] == "Origin and destination are the same place."


# --- three routes and the recommendation (#8) ---

MIDDLE = [(39.7392, -104.9903), (40.5, -100.0), (41.8781, -87.6298)]
SOUTH = [(39.7392, -104.9903), (38.0, -96.0), (41.8781, -87.6298)]
NORTH = [(39.7392, -104.9903), (43.5, -96.0), (41.8781, -87.6298)]


def tt_route(points: list[tuple[float, float]], seconds: int) -> dict:
    last = {"pointIndex": len(points) - 1, "distanceInMeters": 1609344, "travelTimeInSeconds": seconds}
    return {
        "summary": {"lengthInMeters": 1609344, "travelTimeInSeconds": seconds},
        "legs": [{"points": [{"latitude": lat, "longitude": lon} for lat, lon in points]}],
        "progress": [{"pointIndex": 0, "distanceInMeters": 0, "travelTimeInSeconds": 0}, last],
    }


def windy_north(request: httpx.Request) -> httpx.Response:
    """Open-Meteo where only latitudes above 42.5 are windy (47 mph -> No Travel for 35,000 lb cargo)."""
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    times = [(start + timedelta(hours=h)).strftime("%Y-%m-%dT%H:00") for h in range(72)]
    lats = [float(x) for x in request.url.params["latitude"].split(",")]

    def at(lat: float) -> dict:
        wind = 47.0 if lat > 42.5 else 5.0
        return {"hourly": {"time": times, "wind_speed_10m": [wind] * 72, "wind_gusts_10m": [wind] * 72, "rain": [0.0] * 72, "snowfall": [0.0] * 72}}

    return httpx.Response(200, json=[at(lat) for lat in lats])


def three_routes(direct: list[dict], detour: dict | None = None):
    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.open-meteo.com":
            return windy_north(request)
        if request.url.path.startswith("/search/2/reverseGeocode/"):
            return httpx.Response(200, json={"addresses": [{"address": {"municipality": "Topeka", "countrySubdivision": "KS"}}]})
        if request.url.path.startswith("/routing/") and request.url.path.count(":") == 2:  # origin:via:destination
            return httpx.Response(200, json={"routes": [detour]}) if detour else httpx.Response(500)
        if request.url.path.startswith("/routing/"):
            return httpx.Response(200, json={"routes": direct})
        return tomtom_ok(request)

    return handle


def test_three_alternatives_are_ranked_named_and_recommended(client: Client, tomtom_api: FakeTomTom) -> None:
    tomtom_api.handler = three_routes([tt_route(NORTH, 50000), tt_route(SOUTH, 60000), tt_route(MIDDLE, 54000)])
    body = post(client, trip()).json()

    names = [(r["name"], r["duration_s"]) for r in body["routes"]]
    assert names == [("Route A", 54000), ("Route B", 60000), ("Route C", 50000)]  # No Travel north route last
    assert body["recommended"] == 0
    assert body["cargo_lb"] == 35000
    assert body["why"] == "Fastest of equally safe routes: 15h 00m vs 16h 40m on Route B."
    assert body["routes"][2]["summary"]["notravel_mi"] > 0
    assert body["routes"][0]["summary"] == {"severe_mi": 0, "high_mi": 0, "unknown_mi": 0, "notravel_mi": 0, "avg_risk": 0}
    assert not any(r.url.path.count(":") == 2 for r in tomtom_api.sent)  # no detour needed
    routing = next(r for r in tomtom_api.sent if r.url.path.startswith("/routing/"))
    assert routing.url.params["maxAlternatives"] == "2"


def test_missing_alternative_is_synthesized_with_a_detour(client: Client, tomtom_api: FakeTomTom) -> None:
    tomtom_api.handler = three_routes([tt_route(MIDDLE, 54000), tt_route(NORTH, 50000)], detour=tt_route(SOUTH, 60000))
    body = post(client, trip()).json()

    assert body["routes_found"] == 2
    assert [r["synthesized"] for r in body["routes"]] == [False, True, False]
    assert body["routes"][1]["detour_via"] == "Topeka, KS"


def test_failed_detours_leave_fewer_routes_not_an_error(client: Client, tomtom_api: FakeTomTom) -> None:
    tomtom_api.handler = three_routes([tt_route(MIDDLE, 54000), tt_route(NORTH, 50000)], detour=None)
    response = post(client, trip())
    assert response.status_code == 200
    assert len(response.json()["routes"]) == 2


def test_detour_that_duplicates_a_route_is_dropped(client: Client, tomtom_api: FakeTomTom) -> None:
    tomtom_api.handler = three_routes([tt_route(MIDDLE, 54000), tt_route(NORTH, 50000)], detour=tt_route(MIDDLE, 54000))
    assert len(post(client, trip()).json()["routes"]) == 2


def test_all_routes_blocked_means_no_recommendation(client: Client, tomtom_api: FakeTomTom) -> None:
    def everywhere_windy(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.open-meteo.com":
            return open_meteo(request, wind_mph=47.0)
        return three_routes([tt_route(MIDDLE, 54000), tt_route(SOUTH, 60000), tt_route(NORTH, 50000)])(request)

    tomtom_api.handler = everywhere_windy
    body = post(client, trip()).json()
    assert body["recommended"] is None and body["why"] is None
    assert len(body["routes"]) == 3


def test_route_of_identical_points_is_the_same_place(client: Client, tomtom_api: FakeTomTom) -> None:
    same = tt_route([(39.7392, -104.9903), (39.7392, -104.9903)], 10)  # TomTom says 1,609 km but every point is equal
    tomtom_api.handler = three_routes([same])
    assert post(client, trip()).json()["detail"] == "Origin and destination are the same place."



# --- weight modes and truck parameters (#10) ---


def routing_params(api: FakeTomTom) -> httpx.QueryParams:
    return next(r for r in api.sent if r.url.path.startswith("/routing/")).url.params


def test_cargo_is_the_default_mode_and_routing_gets_gross(client: Client, tomtom_api: FakeTomTom) -> None:
    body = {k: v for k, v in trip(weight_lb=32000).items() if k != "weight_mode"}
    response = post(client, body).json()
    assert response["cargo_lb"] == 32000
    assert routing_params(tomtom_api)["vehicleWeight"] == "30391"  # 32,000 + 35,000 empty = 67,000 lb


def test_same_trip_in_both_modes_gives_identical_risk(client: Client, tomtom_api: FakeTomTom) -> None:
    cargo = post(client, trip(weight_mode="cargo", weight_lb=32000)).json()
    gross = post(client, trip(weight_mode="gross", weight_lb=67000)).json()
    strip = lambda plan: [[(c["level"], c["reasons"]) for c in r["checkpoints"]] for r in plan["routes"]]  # noqa: E731
    assert cargo["cargo_lb"] == gross["cargo_lb"] == 32000
    assert strip(cargo) == strip(gross)


def test_gross_below_the_empty_truck_means_zero_cargo(client: Client, tomtom_api: FakeTomTom) -> None:
    assert post(client, trip(weight_mode="gross", weight_lb=20000)).json()["cargo_lb"] == 0


def test_empty_truck_weight_is_configurable(client: Client, tomtom_api: FakeTomTom) -> None:
    post(client, trip(weight_mode="cargo", weight_lb=32000, empty_truck_lb=30000))
    assert routing_params(tomtom_api)["vehicleWeight"] == "28123"  # 62,000 lb


def test_axle_params_are_sent_only_when_set(client: Client, tomtom_api: FakeTomTom) -> None:
    post(client, trip())
    assert "vehicleNumberOfAxles" not in routing_params(tomtom_api)
    assert "vehicleAxleWeight" not in routing_params(tomtom_api)

    tomtom_api.sent.clear()
    post(client, trip(axle_count=5, axle_weight_lb=20000))
    params = routing_params(tomtom_api)
    assert params["vehicleNumberOfAxles"] == "5"
    assert params["vehicleAxleWeight"] == "9072"


@pytest.mark.parametrize(
    "bad", [{"weight_mode": "tons"}, {"empty_truck_lb": -1}, {"axle_count": 1}, {"axle_count": 2.5}, {"axle_weight_lb": 0}]
)
def test_bad_truck_parameters_are_rejected(client: Client, tomtom_api: FakeTomTom, bad: dict) -> None:
    response = post(client, trip(**bad))
    assert response.status_code == 400
    assert set(bad) <= set(response.json())
