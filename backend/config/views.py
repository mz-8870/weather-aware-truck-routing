from datetime import UTC, timedelta

from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

import ranking
import risk
import tomtom
import weather
from checkpoints import checkpoints

# shortcut: until #10 adds weight modes, weight_lb is gross and cargo = gross - the spec's default empty truck.
EMPTY_TRUCK_LB = 35_000


@api_view(["GET"])
def health(request: Request) -> Response:
    return Response({"status": "ok"})


class GeocodeThrottle(AnonRateThrottle):
    rate = "30/min"  # per IP: plenty for debounced typing, protects the TomTom free tier


@api_view(["GET"])
@throttle_classes([GeocodeThrottle])
def geocode(request: Request) -> Response:
    query = request.query_params.get("q", "").strip()[:200]
    if len(query) < 3:
        return Response({"suggestions": []})
    try:
        with tomtom.http_client() as client:
            return Response({"suggestions": tomtom.suggest(client, query)})
    except tomtom.RoutingError:
        return Response({"detail": "Place search unavailable. Try again."}, status=502)


class PositionField(serializers.ListField):
    """[lat, lon] picked from autosuggest."""

    def __init__(self, **kwargs):
        super().__init__(child=serializers.FloatField(), min_length=2, max_length=2, required=False, **kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        # Length is checked by the min/max validators after this runs.
        if len(value) == 2 and not (-90 <= value[0] <= 90 and -180 <= value[1] <= 180):
            raise serializers.ValidationError("Latitude must be within ±90 and longitude within ±180.")
        return value


class TripSerializer(serializers.Serializer):
    origin = serializers.CharField(max_length=200)
    destination = serializers.CharField(max_length=200)
    departure = serializers.DateTimeField()
    weight_lb = serializers.FloatField(min_value=0)
    interval_mi = serializers.ChoiceField(choices=[10, 25, 50], default=25)
    origin_position = PositionField()
    destination_position = PositionField()

    def validate_departure(self, value):
        if value < timezone.now():
            raise serializers.ValidationError("Departure must be in the future.")
        return value

    def validate(self, data):
        op, dp = data.get("origin_position"), data.get("destination_position")
        # Two picked places can share a name ("Pilot Travel Center"), so positions decide when both exist.
        same = op == dp if op is not None and dp is not None else data["origin"].strip().lower() == data["destination"].strip().lower()
        if same:
            raise serializers.ValidationError({"destination": ["Destination must differ from origin."]})
        return data


@api_view(["POST"])
def plan(request: Request) -> Response:
    trip = TripSerializer(data=request.data)
    trip.is_valid(raise_exception=True)
    t = trip.validated_data
    try:
        with tomtom.http_client() as client:
            origin = t.get("origin_position") or tomtom.geocode(client, t["origin"])
            destination = t.get("destination_position") or tomtom.geocode(client, t["destination"])
            routes = tomtom.truck_routes(client, origin, destination, t["departure"], t["weight_lb"])
            found = len(routes)
            routes += _detours(client, routes, origin, destination, t)
            body = _plan_json(client, routes, t)
    except tomtom.NotFound as e:
        return Response({"detail": str(e)}, status=422)
    except tomtom.RoutingError:
        return Response({"detail": "Routing service unavailable. Try again."}, status=502)
    return Response({**body, "routes_found": found})


def _same(a: tomtom.Route, b: tomtom.Route) -> bool:
    return abs(a.distance_mi - b.distance_mi) <= 0.01 * b.distance_mi and abs(a.duration_s - b.duration_s) <= 0.01 * b.duration_s


def _detours(client, routes: list[tomtom.Route], origin, destination, t: dict) -> list[tomtom.Route]:
    """Spec: fewer than 3 routes from TomTom -> synthesize the rest through via-point detours."""
    extra: list[tomtom.Route] = []
    for via in tomtom.detour_vias(origin, destination):
        if len(routes) + len(extra) >= 3:
            break
        try:
            route = tomtom.truck_routes(client, origin, destination, t["departure"], t["weight_lb"], via=via)[0]
        except (tomtom.NotFound, tomtom.RoutingError):
            continue  # an unroutable via point just means one less option
        if not any(_same(route, r) for r in routes + extra):
            extra.append(route._replace(synthesized=True, detour_via=tomtom.place_name(client, *via)))
    return extra


def _level(res: risk.RiskResult) -> int | None:
    return None if res.level is None else int(res.level)


def _plan_json(client, routes: list[tomtom.Route], t: dict) -> dict:
    cps = [checkpoints(r.points, r.progress, t["interval_mi"]) for r in routes]
    etas = [[t["departure"] + timedelta(seconds=c.offset_s) for c in route_cps] for route_cps in cps]
    # One weather batch for every route's checkpoints.
    flat = weather.readings(client, [(c.lat, c.lon, eta) for rc, re in zip(cps, etas) for c, eta in zip(rc, re)])
    cargo_lb = max(0.0, t["weight_lb"] - EMPTY_TRUCK_LB)
    readings, results, start = [], [], 0
    for route_cps in cps:
        rs = flat[start : start + len(route_cps)]
        start += len(route_cps)
        readings.append(rs)
        results.append([risk.classify(r.wind_mph, r.rain_in_hr, r.snow_in_hr, cargo_lb, r.beyond_forecast) for r in rs])
    summaries = [
        ranking.summarize([(c.owned_mi, _level(res)) for c, res in zip(rc, rr)], route.duration_s)
        for route, rc, rr in zip(routes, cps, results)
    ]
    ranked = ranking.rank(summaries)
    return {
        "cargo_lb": cargo_lb,
        "recommended": None if ranked.recommended is None else 0,  # routes are returned best first
        "why": ranked.why,
        "routes": [
            _route_json(f"Route {'ABC'[n]}", routes[i], summaries[i], cps[i], etas[i], readings[i], results[i])
            for n, i in enumerate(ranked.order)
        ],
    }


def _route_json(name, route, summary, cps, etas, readings, results) -> dict:
    return {
        "name": name,
        "distance_mi": route.distance_mi,
        "duration_s": route.duration_s,
        "synthesized": route.synthesized,
        "detour_via": route.detour_via,
        "summary": {k: v for k, v in summary._asdict().items() if k != "duration_s"},
        "checkpoints": [
            {
                "mile": c.mile,
                "lat": c.lat,
                "lon": c.lon,
                "offset_s": c.offset_s,
                "eta": eta.astimezone(UTC).isoformat(),
                "level": _level(res),
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
        "segments": [{"level": _level(res), "coordinates": c.path} for c, res in zip(cps, results)],
    }
