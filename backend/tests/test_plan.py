from datetime import datetime, timedelta, timezone

import flexpolyline
import httpx
import pytest
from django.test import Client

import here

DENVER = {"lat": 39.7392, "lng": -104.9903}
CHICAGO = {"lat": 41.8781, "lng": -87.6298}
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


def here_ok(request: httpx.Request) -> httpx.Response:
    if request.url.host == "geocode.search.hereapi.com":
        position = DENVER if request.url.params["q"] == "Denver, CO" else CHICAGO
        return httpx.Response(200, json={"items": [{"position": position}]})
    return httpx.Response(
        200,
        json={
            "routes": [
                {
                    "sections": [
                        {
                            "polyline": flexpolyline.encode(POLYLINE),
                            "summary": {"length": 1609344, "duration": 54000},
                        }
                    ]
                }
            ]
        },
    )


class FakeHere:
    """Stands in for HERE at the HTTP boundary; records requests, answers with `handler`."""

    def __init__(self) -> None:
        self.sent: list[httpx.Request] = []
        self.handler = here_ok

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.sent.append(request)
        return self.handler(request)


@pytest.fixture
def here_api(monkeypatch: pytest.MonkeyPatch, settings) -> FakeHere:
    settings.HERE_API_KEY = "test-key"
    fake = FakeHere()
    monkeypatch.setattr(here, "http_client", lambda: httpx.Client(transport=httpx.MockTransport(fake)))
    return fake


def post(client: Client, body: dict):
    return client.post("/api/plan", body, content_type="application/json")


def test_plan_returns_truck_route(client: Client, here_api: FakeHere) -> None:
    response = post(client, trip())

    assert response.status_code == 200
    (route,) = response.json()["routes"]
    assert route["distance_mi"] == 1000.0
    assert route["duration_s"] == 54000
    assert route["coordinates"] == [[lng, lat] for lat, lng in POLYLINE]

    routing = here_api.sent[-1]
    assert routing.url.host == "router.hereapi.com"
    assert routing.url.params["transportMode"] == "truck"
    assert routing.url.params["origin"] == "39.7392,-104.9903"
    assert routing.url.params["destination"] == "41.8781,-87.6298"
    assert routing.url.params["vehicle[grossWeight]"] == "31751"  # 70,000 lb in kg
    assert routing.url.params["apiKey"] == "test-key"


def test_past_departure_is_rejected(client: Client, here_api: FakeHere) -> None:
    response = post(client, trip(departure=future(hours=-1)))
    assert response.status_code == 400
    assert "departure" in response.json()
    assert here_api.sent == []


def test_same_origin_and_destination_is_rejected(client: Client, here_api: FakeHere) -> None:
    response = post(client, trip(destination=" denver, co "))
    assert response.status_code == 400
    assert "destination" in response.json()


def test_negative_weight_is_rejected(client: Client, here_api: FakeHere) -> None:
    response = post(client, trip(weight_lb=-1))
    assert response.status_code == 400
    assert "weight_lb" in response.json()


def test_here_failure_returns_502(client: Client, here_api: FakeHere) -> None:
    here_api.handler = lambda request: httpx.Response(503)
    assert post(client, trip()).status_code == 502


def test_no_route_returns_422(client: Client, here_api: FakeHere) -> None:
    here_api.handler = lambda request: (
        here_ok(request) if request.url.host == "geocode.search.hereapi.com" else httpx.Response(200, json={"routes": []})
    )
    assert post(client, trip()).status_code == 422


def test_unknown_place_returns_422(client: Client, here_api: FakeHere) -> None:
    here_api.handler = lambda request: httpx.Response(200, json={"items": []})
    assert post(client, trip()).status_code == 422
