from datetime import UTC, timedelta

from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

import risk
import tomtom
import weather
from checkpoints import checkpoints

# shortcut: until #10 adds weight modes, weight_lb is gross and cargo = gross - the spec's default empty truck.
EMPTY_TRUCK_LB = 35_000


@api_view(["GET"])
def health(request: Request) -> Response:
    return Response({"status": "ok"})


class TripSerializer(serializers.Serializer):
    origin = serializers.CharField(max_length=200)
    destination = serializers.CharField(max_length=200)
    departure = serializers.DateTimeField()
    weight_lb = serializers.FloatField(min_value=0)
    interval_mi = serializers.ChoiceField(choices=[10, 25, 50], default=25)

    def validate_departure(self, value):
        if value < timezone.now():
            raise serializers.ValidationError("Departure must be in the future.")
        return value

    def validate(self, data):
        if data["origin"].strip().lower() == data["destination"].strip().lower():
            raise serializers.ValidationError({"destination": ["Destination must differ from origin."]})
        return data


@api_view(["POST"])
def plan(request: Request) -> Response:
    trip = TripSerializer(data=request.data)
    trip.is_valid(raise_exception=True)
    t = trip.validated_data
    try:
        with tomtom.http_client() as client:
            origin = tomtom.geocode(client, t["origin"])
            destination = tomtom.geocode(client, t["destination"])
            route = tomtom.truck_route(client, origin, destination, t["departure"], t["weight_lb"])
            body = _route_json(client, route, t)
    except tomtom.NotFound as e:
        return Response({"detail": str(e)}, status=422)
    except tomtom.RoutingError:
        return Response({"detail": "Routing service unavailable. Try again."}, status=502)
    return Response({"routes": [body]})


def _route_json(client, route: tomtom.Route, t: dict) -> dict:
    cps = checkpoints(route.points, route.progress, t["interval_mi"])
    etas = [t["departure"] + timedelta(seconds=c.offset_s) for c in cps]
    readings = weather.readings(client, [(c.lat, c.lon, eta) for c, eta in zip(cps, etas)])
    cargo_lb = max(0.0, t["weight_lb"] - EMPTY_TRUCK_LB)
    results = [risk.classify(r.wind_mph, r.rain_in_hr, r.snow_in_hr, cargo_lb, r.beyond_forecast) for r in readings]
    return {
        "distance_mi": route.distance_mi,
        "duration_s": route.duration_s,
        "checkpoints": [
            {
                "mile": c.mile,
                "lat": c.lat,
                "lon": c.lon,
                "offset_s": c.offset_s,
                "eta": eta.astimezone(UTC).isoformat(),
                "level": None if res.level is None else int(res.level),
                "reasons": list(res.reasons),
                "beyond_forecast": res.beyond_forecast,
                "wind_mph": r.wind_mph,
                "gust_mph": r.gust_mph,
                "rain_in_hr": r.rain_in_hr,
                "snow_in_hr": r.snow_in_hr,
                "owned_mi": c.owned_mi,
            }
            for c, eta, r, res in zip(cps, etas, readings, results)
        ],
        "segments": [
            {"level": None if res.level is None else int(res.level), "coordinates": c.path}
            for c, res in zip(cps, results)
        ],
    }
