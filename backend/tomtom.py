"""TomTom Search + Routing client. The API key never leaves the backend."""

from datetime import datetime, timezone
from math import cos, radians
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
    synthesized: bool = False  # built from a via-point detour because TomTom returned < 3 routes
    detour_via: str | None = None  # place name of the via point, when known


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


def truck_routes(
    client: httpx.Client,
    origin: tuple[float, float],
    destination: tuple[float, float],
    departure: datetime,
    gross_lb: float,
    via: tuple[float, float] | None = None,
) -> list[Route]:
    """TomTom's route plus up to two alternatives; with `via`, the single route through that point."""
    stops = [origin, *([via] if via else []), destination]
    body = _get(
        client,
        f"/routing/1/calculateRoute/{':'.join(f'{lat},{lon}' for lat, lon in stops)}/json",
        {
            "travelMode": "truck",
            "vehicleCommercial": "true",
            "vehicleWeight": round(gross_lb * KG_PER_LB),
            "departAt": departure.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "traffic": "true",
            "extendedRouteRepresentation": ["distance", "travelTime"],
            "maxAlternatives": 0 if via else 2,
        },
    )
    if not body.get("routes"):
        raise NotFound("No truck route found for this trip.")
    routes = [
        Route(
            points=[(p["latitude"], p["longitude"]) for leg in r["legs"] for p in leg["points"]],
            progress=[(p["pointIndex"], p["distanceInMeters"], p["travelTimeInSeconds"]) for p in r["progress"]],
            distance_mi=round(r["summary"]["lengthInMeters"] / M_PER_MI, 1),
            duration_s=r["summary"]["travelTimeInSeconds"],
        )
        for r in body["routes"]
    ]
    # e.g. "Denver, CO" -> "Denver Colorado": TomTom returns a zero-length route
    if body["routes"][0]["summary"]["lengthInMeters"] == 0 or len(set(routes[0].points)) < 2:
        raise NotFound("Origin and destination are the same place.")
    return routes


def detour_vias(origin: tuple[float, float], destination: tuple[float, float]) -> list[tuple[float, float]]:
    """Via points off the midpoint, perpendicular to the straight line, alternating sides, nearest first."""
    (lat1, lon1), (lat2, lon2) = origin, destination
    k = cos(radians((lat1 + lat2) / 2))  # degrees of longitude shrink with latitude
    dx, dy = (lon2 - lon1) * k, lat2 - lat1
    mid_lat, mid_lon = (lat1 + lat2) / 2, (lon1 + lon2) / 2
    return [(round(mid_lat + f * dx, 5), round(mid_lon - f * dy / k, 5)) for f in (0.15, -0.15, 0.3, -0.3)]


def place_name(client: httpx.Client, lat: float, lon: float) -> str | None:
    try:
        addresses = _get(client, f"/search/2/reverseGeocode/{lat},{lon}.json", {}).get("addresses") or []
        address = addresses[0]["address"]
        return f"{address['municipality']}, {address['countrySubdivision']}"
    except (RoutingError, NotFound, IndexError, KeyError):
        return None
