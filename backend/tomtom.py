"""TomTom Search + Routing client. The API key never leaves the backend."""

from datetime import datetime, timezone
from urllib.parse import quote

import httpx
from django.conf import settings

KG_PER_LB = 0.45359237
M_PER_MI = 1609.344
API = "https://api.tomtom.com"


class RoutingError(Exception):
    """TomTom was unreachable or answered with an error."""


class NotFound(Exception):
    """TomTom answered, but found no location or no truck route."""


def http_client() -> httpx.Client:
    return httpx.Client(timeout=15)


def _get(client: httpx.Client, path: str, params: dict) -> dict:
    try:
        response = client.get(API + path, params={**params, "key": settings.TOMTOM_API_KEY})
        if response.status_code == 400 and "NO_ROUTE_FOUND" in response.text:
            raise NotFound("route")
        response.raise_for_status()
    except httpx.HTTPError as e:
        raise RoutingError(str(e)) from e
    return response.json()


def geocode(client: httpx.Client, query: str) -> tuple[float, float]:
    results = _get(client, f"/search/2/search/{quote(query, safe='')}.json", {"limit": 1}).get("results")
    if not results:
        raise NotFound(query)
    return results[0]["position"]["lat"], results[0]["position"]["lon"]


def truck_route(
    client: httpx.Client,
    origin: tuple[float, float],
    destination: tuple[float, float],
    departure: datetime,
    gross_lb: float,
) -> dict:
    body = _get(
        client,
        f"/routing/1/calculateRoute/{origin[0]},{origin[1]}:{destination[0]},{destination[1]}/json",
        {
            "travelMode": "truck",
            "vehicleCommercial": "true",
            "vehicleWeight": round(gross_lb * KG_PER_LB),
            "departAt": departure.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "traffic": "true",
        },
    )
    if not body.get("routes"):
        raise NotFound("route")
    route = body["routes"][0]
    return {
        "coordinates": [[p["longitude"], p["latitude"]] for leg in route["legs"] for p in leg["points"]],
        "distance_mi": round(route["summary"]["lengthInMeters"] / M_PER_MI, 1),
        "duration_s": route["summary"]["travelTimeInSeconds"],
    }
