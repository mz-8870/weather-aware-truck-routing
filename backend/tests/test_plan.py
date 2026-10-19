from datetime import datetime, timedelta, timezone

import httpx
import pytest
from django.test import Client

import tomtom

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
        **overrides,
    }


def tomtom_ok(request: httpx.Request) -> httpx.Response:
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
                }
            ]
        },
    )


class FakeTomTom:
    """Stands in for TomTom at the HTTP boundary; records requests, answers with `handler`."""

    def __init__(self) -> None:
        self.sent: list[httpx.Request] = []
        self.handler = tomtom_ok

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.sent.append(request)
        return self.handler(request)


@pytest.fixture
def tomtom_api(monkeypatch: pytest.MonkeyPatch, settings) -> FakeTomTom:
    settings.TOMTOM_API_KEY = "test-key"
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
    assert route["coordinates"] == [[lng, lat] for lat, lng in POLYLINE]

    routing = tomtom_api.sent[-1]
    assert routing.url.path == "/routing/1/calculateRoute/39.7392,-104.9903:41.8781,-87.6298/json"
    assert routing.url.params["travelMode"] == "truck"
    assert routing.url.params["vehicleWeight"] == "31751"  # 70,000 lb in kg
    assert routing.url.params["departAt"].endswith("Z")
    assert routing.url.params["key"] == "test-key"


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
