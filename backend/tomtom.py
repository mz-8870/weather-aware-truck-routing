"""TomTom Search + Routing client. The API key never leaves the backend."""

from datetime import datetime, timezone
from typing import NamedTuple
from urllib.parse import quote

import httpx
from django.conf import settings

KG_PER_LB = 0.45359237
M_PER_MI = 1609.344
API = "https://api.tomtom.com"


class Route(NamedTuple):
    points: list[tuple[float, float]]  # (lat, lon)
    progress: list[tuple[int, float, float]]  # sparse (point_index, distance_m, travel_time_s)
    distance_mi: float
    duration_s: int


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
            raise NotFound("No truck route found for this trip.")
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as e:
        # Not str(e): httpx messages include the request URL, which carries the key.
        raise RoutingError(type(e).__name__) from e


def geocode(client: httpx.Client, query: str) -> tuple[float, float]:
    # shortcut: US-only fuzzy search until #9 autosuggest sends picked coordinates.
    results = _get(client, f"/search/2/search/{quote(query, safe='')}.json", {"limit": 1, "countrySet": "US"}).get("results")
    if not results:
        raise NotFound(f"Couldn't find '{query}'.")
    return results[0]["position"]["lat"], results[0]["position"]["lon"]


def truck_route(
    client: httpx.Client,
    origin: tuple[float, float],
    destination: tuple[float, float],
    departure: datetime,
    gross_lb: float,
) -> Route:
    body = _get(
        client,
        f"/routing/1/calculateRoute/{origin[0]},{origin[1]}:{destination[0]},{destination[1]}/json",
        {
            "travelMode": "truck",
            "vehicleCommercial": "true",
            "vehicleWeight": round(gross_lb * KG_PER_LB),
            "departAt": departure.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "traffic": "true",
            "extendedRouteRepresentation": ["distance", "travelTime"],
        },
    )
    if not body.get("routes"):
        raise NotFound("No truck route found for this trip.")
    route = body["routes"][0]
    if route["summary"]["lengthInMeters"] == 0:  # e.g. "Denver, CO" -> "Denver Colorado"
        raise NotFound("Origin and destination are the same place.")
    return Route(
        points=[(p["latitude"], p["longitude"]) for leg in route["legs"] for p in leg["points"]],
        progress=[(p["pointIndex"], p["distanceInMeters"], p["travelTimeInSeconds"]) for p in route["progress"]],
        distance_mi=round(route["summary"]["lengthInMeters"] / M_PER_MI, 1),
        duration_s=route["summary"]["travelTimeInSeconds"],
    )
