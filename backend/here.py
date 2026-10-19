"""HERE Geocoding + Routing v8 client. The API key never leaves the backend."""

from datetime import datetime

import flexpolyline
import httpx
from django.conf import settings

KG_PER_LB = 0.45359237
M_PER_MI = 1609.344


class HereError(Exception):
    """HERE was unreachable or answered with an error."""


class NotFound(Exception):
    """HERE answered, but found no location or no truck route."""


def http_client() -> httpx.Client:
    return httpx.Client(timeout=15)


def _get(client: httpx.Client, url: str, params: dict) -> dict:
    try:
        response = client.get(url, params={**params, "apiKey": settings.HERE_API_KEY})
        response.raise_for_status()
    except httpx.HTTPError as e:
        raise HereError(str(e)) from e
    return response.json()


def geocode(client: httpx.Client, query: str) -> tuple[float, float]:
    items = _get(client, "https://geocode.search.hereapi.com/v1/geocode", {"q": query, "limit": 1}).get("items")
    if not items:
        raise NotFound(query)
    return items[0]["position"]["lat"], items[0]["position"]["lng"]


def truck_route(
    client: httpx.Client,
    origin: tuple[float, float],
    destination: tuple[float, float],
    departure: datetime,
    gross_lb: float,
) -> dict:
    body = _get(
        client,
        "https://router.hereapi.com/v8/routes",
        {
            "transportMode": "truck",
            "origin": f"{origin[0]},{origin[1]}",
            "destination": f"{destination[0]},{destination[1]}",
            "departureTime": departure.isoformat(),
            "vehicle[grossWeight]": round(gross_lb * KG_PER_LB),
            "return": "polyline,summary",
        },
    )
    if not body.get("routes"):
        raise NotFound("route")
    sections = body["routes"][0]["sections"]
    coordinates = [[lng, lat] for s in sections for lat, lng in flexpolyline.decode(s["polyline"])]
    return {
        "coordinates": coordinates,
        "distance_mi": round(sum(s["summary"]["length"] for s in sections) / M_PER_MI, 1),
        "duration_s": sum(s["summary"]["duration"] for s in sections),
    }
