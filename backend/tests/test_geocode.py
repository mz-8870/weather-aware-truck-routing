import httpx
import pytest
from django.core.cache import cache
from django.test import Client

import tomtom
from tests.test_plan import FakeTomTom, post, tomtom_ok, trip

RESULTS = {
    "results": [
        {"type": "Geography", "entityType": "Municipality", "address": {"freeformAddress": "Salt Lake City, UT"}, "position": {"lat": 40.758478, "lon": -111.888142}},
        {
            "type": "POI",
            "poi": {"name": "Salt Lake City International Airport", "classifications": [{"names": [{"name": "airport"}]}]},
            "address": {"freeformAddress": "776 N Terminal Dr, Salt Lake City, UT 84122", "municipality": "Salt Lake City", "countrySubdivision": "UT"},
            "position": {"lat": 40.7884, "lon": -111.9778},
        },
        {"type": "Street", "address": {"freeformAddress": "Salt Lake Ave, Memphis, TN"}, "position": {"lat": 35.1, "lon": -90.0}},
        {"type": "Point Address", "address": {"freeformAddress": "1 Salt Lake Rd, Austin, TX"}, "position": {"lat": 30.2, "lon": -97.7}},
    ]
}


@pytest.fixture
def api(monkeypatch: pytest.MonkeyPatch, settings) -> FakeTomTom:
    settings.TOMTOM_API_KEY = "test-key"
    cache.clear()  # the geocode throttle counts requests in the default cache
    fake = FakeTomTom()
    fake.handler = lambda request: httpx.Response(200, json=RESULTS)
    monkeypatch.setattr(tomtom, "http_client", lambda: httpx.Client(transport=httpx.MockTransport(fake)))
    return fake


def test_suggestions_come_from_tomtom_typeahead(client: Client, api: FakeTomTom) -> None:
    response = client.get("/api/geocode", {"q": "Salt La"})

    assert response.status_code == 200
    assert response.json() == {
        "suggestions": [
            {"label": "Salt Lake City, UT", "kind": "City", "lat": 40.758478, "lon": -111.888142},
            {"label": "Salt Lake City International Airport, Salt Lake City, UT", "kind": "Airport", "lat": 40.7884, "lon": -111.9778},
            {"label": "Salt Lake Ave, Memphis, TN", "kind": "Street", "lat": 35.1, "lon": -90.0},
            {"label": "1 Salt Lake Rd, Austin, TX", "kind": "Address", "lat": 30.2, "lon": -97.7},
        ]
    }
    (sent,) = api.sent
    assert sent.url.raw_path.startswith(b"/search/2/search/Salt%20La.json")
    assert sent.url.params["typeahead"] == "true"
    assert sent.url.params["countrySet"] == "US"
    assert b"test-key" not in response.content


def test_fewer_than_three_characters_asks_nothing(client: Client, api: FakeTomTom) -> None:
    assert client.get("/api/geocode", {"q": " Sa "}).json() == {"suggestions": []}
    assert api.sent == []


def test_tomtom_failure_is_a_502(client: Client, api: FakeTomTom) -> None:
    api.handler = lambda request: httpx.Response(503)
    response = client.get("/api/geocode", {"q": "Salt La"})
    assert response.status_code == 502
    assert b"test-key" not in response.content


def test_plan_uses_picked_positions_instead_of_geocoding(client: Client, api: FakeTomTom) -> None:
    api.handler = tomtom_ok
    response = post(client, trip(origin_position=[39.7392, -104.9903], destination_position=[41.8781, -87.6298]))
    assert response.status_code == 200
    assert not any(r.url.path.startswith("/search/") for r in api.sent)


@pytest.mark.parametrize("position", [[91, 0], [0, 181], [1], "39,-104"])
def test_plan_rejects_bad_positions(client: Client, api: FakeTomTom, position) -> None:
    response = post(client, trip(origin_position=position))
    assert response.status_code == 400
    assert "origin_position" in response.json()


def test_same_picked_position_is_rejected(client: Client, api: FakeTomTom) -> None:
    response = post(client, trip(origin_position=[39.74, -104.99], destination_position=[39.74, -104.99]))
    assert response.status_code == 400
    assert "destination" in response.json()


def test_two_picked_places_with_the_same_name_are_different_places(client: Client, api: FakeTomTom) -> None:
    api.handler = tomtom_ok
    pilot = "Pilot Travel Center"
    response = post(client, trip(origin=pilot, destination=pilot, origin_position=[41.45, -88.19], destination_position=[39.14, -88.52]))
    assert response.status_code == 200


def test_geocode_is_throttled_per_client(client: Client, api: FakeTomTom) -> None:
    statuses = [client.get("/api/geocode", {"q": f"Place {i}"}).status_code for i in range(31)]
    assert statuses[:30] == [200] * 30 and statuses[30] == 429
