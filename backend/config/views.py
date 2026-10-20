from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import UTC, timedelta

from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

import ranking
from heatmap import corridor_grid
import risk
import tomtom
import weather
from checkpoints import BREAK_S, REST_S, checkpoints, hos_elapsed, hos_stops

EMPTY_TRUCK_LB = 35_000  # SPEC default


@api_view(["GET"])
def health(request: Request) -> Response:
    return Response({"status": "ok"})


# shortcut: counts per instance (LocMem cache) and trusts X-Forwarded-For (NUM_PROXIES unset), so it is
# bypassable; set NUM_PROXIES=1 on Vercel and a shared cache if abuse of the TomTom quota becomes real.
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
    # Cargo only: weight_lb is cargo. Gross: weight_lb is truck + cargo.
    weight_mode = serializers.ChoiceField(choices=["cargo", "gross"], default="cargo")
    empty_truck_lb = serializers.FloatField(min_value=0, default=EMPTY_TRUCK_LB)
    axle_count = serializers.IntegerField(min_value=2, max_value=12, required=False)
    axle_weight_lb = serializers.FloatField(min_value=1, required=False)
    interval_mi = serializers.ChoiceField(choices=[10, 25, 50], default=25)
    hos = serializers.BooleanField(default=False)  # US hours-of-service breaks in the ETAs; off = non-stop driving
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
        # TomTom routes on gross; the risk load rules use cargo (SPEC).
        if data["weight_mode"] == "cargo":
            data["cargo_lb"], data["gross_lb"] = data["weight_lb"], data["weight_lb"] + data["empty_truck_lb"]
        else:
            data["cargo_lb"], data["gross_lb"] = max(0.0, data["weight_lb"] - data["empty_truck_lb"]), data["weight_lb"]
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
            routes = tomtom.truck_routes(client, origin, destination, t["departure"], _vehicle(t))
            found = len(routes)
            routes += _detours(client, routes, origin, destination, t)
            body = _plan_json(client, routes, t)
    except tomtom.NoRoute as e:
        return Response({"detail": str(e), "code": "no_route"}, status=422)
    except tomtom.NotFound as e:
        return Response({"detail": str(e)}, status=422)
    except tomtom.RoutingError:
        return Response({"detail": "Routing service unavailable. Try again."}, status=502)
    return Response({**body, "routes_found": found})


def _vehicle(t: dict) -> tomtom.Vehicle:
    return tomtom.Vehicle(t["gross_lb"], t.get("axle_count"), t.get("axle_weight_lb"))


def _same(a: tomtom.Route, b: tomtom.Route) -> bool:
    return abs(a.distance_mi - b.distance_mi) <= 0.01 * b.distance_mi and abs(a.duration_s - b.duration_s) <= 0.01 * b.duration_s


def _detours(client, routes: list[tomtom.Route], origin, destination, t: dict) -> list[tomtom.Route]:
    """Spec: fewer than 3 routes from TomTom -> synthesize the rest through via-point detours."""
    extra: list[tomtom.Route] = []
    for via in tomtom.detour_vias(origin, destination):
        if len(routes) + len(extra) >= 3:
            break
        try:
            route = tomtom.truck_routes(client, origin, destination, t["departure"], _vehicle(t), via=via)[0]
        except (tomtom.NotFound, tomtom.RoutingError):
            continue  # an unroutable via point just means one less option
        if not any(_same(route, r) for r in routes + extra):
            extra.append(route._replace(synthesized=True, detour_via=tomtom.place_name(client, *via)))
    return extra


def _level(res: risk.RiskResult) -> int | None:
    return None if res.level is None else int(res.level)


def _plan_json(client, routes: list[tomtom.Route], t: dict) -> dict:
    cps = [checkpoints(r.points, r.progress, t["interval_mi"]) for r in routes]
    if t["hos"]:  # offsets become wall-clock time, so ETAs, weather hours and truck positions include the stops
        cps = [[replace(c, offset_s=round(hos_elapsed(c.offset_s))) for c in rc] for rc in cps]
    stops = [hos_stops(r.points, r.progress) if t["hos"] else [] for r in routes]
    flat = [s for rs in stops for s in rs]
    # shortcut: one uncached TomTom reverse geocode per stop (~24 for a coast-to-coast HOS plan, free tier 2,500/day);
    # cache by rounded position if HOS plans become frequent.
    with ThreadPoolExecutor(8) as pool:  # nearest town per stop; a failed lookup just leaves it unnamed
        places = dict(zip(flat, pool.map(lambda s: tomtom.place_name(client, s.lat, s.lon), flat)))
    stops_json = [
        [
            {
                "kind": s.kind,
                "mile": s.mile,
                "lat": s.lat,
                "lon": s.lon,
                "offset_s": round(hos_elapsed(s.drive_s)),  # wall-clock seconds after departure, like checkpoints
                "start": (t["departure"] + timedelta(seconds=hos_elapsed(s.drive_s))).astimezone(UTC).isoformat(),
                "duration_s": BREAK_S if s.kind == "break" else REST_S,
                "place": places[s],
            }
            for s in rs
        ]
        for rs in stops
    ]
    cargo_lb = t["cargo_lb"]
    etas, readings, results, summaries = _classify(client, routes, cps, t["departure"], cargo_lb)
    ranked = ranking.rank(summaries)
    names = {i: f"Route {'ABC'[n]}" for n, i in enumerate(ranked.order)}
    clear = None
    if ranked.recommended is None:  # same routes, later departures; the weather comes from the cache
        later = (_classify(client, routes, cps, t["departure"] + timedelta(hours=h), cargo_lb)[3] for h in range(1, CLEAR_SEARCH_H + 1))
        if found := ranking.earliest_clear(later):
            h, i = found
            clear = {"hours_later": h, "departure": (t["departure"] + timedelta(hours=h)).isoformat(), "route": names[i]}
    return {
        "cargo_lb": cargo_lb,
        "recommended": None if ranked.recommended is None else 0,  # routes are returned best first
        "why": ranked.why,
        "earliest_clear_departure": clear,
        "routes": [
            _route_json(names[i], routes[i], summaries[i], cps[i], etas[i], readings[i], results[i]) | {"stops": stops_json[i]}
            for n, i in enumerate(ranked.order)
        ],
    }


CLEAR_SEARCH_H = 48  # later departures tried when every route is blocked: the slider's forecast window


def _classify(client, routes, cps, departure, cargo_lb):
    """ETAs, readings, risk results and summaries per route for one departure; one weather batch for every route."""
    etas = [[departure + timedelta(seconds=c.offset_s) for c in route_cps] for route_cps in cps]
    flat = weather.readings(client, [(c.lat, c.lon, eta) for rc, re in zip(cps, etas) for c, eta in zip(rc, re)])
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
    return etas, readings, results, summaries


def _route_json(name, route, summary, cps, etas, readings, results) -> dict:
    return {
        "name": name,
        "distance_mi": route.distance_mi,
        "duration_s": route.duration_s,  # driving time
        "trip_s": cps[-1].offset_s,  # departure to arrival, including any HOS stops
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


class HeatmapSerializer(serializers.Serializer):
    points = serializers.ListField(child=PositionField(), min_length=1, max_length=2000)  # route [lat, lon]s
    departure = serializers.DateTimeField()
    cargo_lb = serializers.FloatField(min_value=0)


HEATMAP_HOURS = 49  # 0-48 h after departure (SPEC)
# Open-Meteo's free tier allows ~600 locations a minute, and a long plan's checkpoints have just used up to ~425 of
# them (cached readings cost nothing). Past this many cells, fall back to a 50 mi grid (coast to coast: ~1,150 -> ~300)
# so the heatmap rarely meets the limit; when it does, those cells come back Unknown and draw no heat.
WEATHER_BUDGET = 500


@api_view(["POST"])
def heatmap(request: Request) -> Response:
    """Per-variable risk levels on a corridor grid for every hour 0-48; the slider scrubs these client-side."""
    data = HeatmapSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    d = data.validated_data
    points = [tuple(p) for p in d["points"]]
    spacing = 25
    cells = corridor_grid(points, spacing_mi=spacing)
    if len(cells) > WEATHER_BUDGET:
        spacing = 50
        cells = corridor_grid(points, spacing_mi=spacing)
    if len(cells) > WEATHER_BUDGET:
        return Response({"points": ["Routes cover too large an area for the weather layer."]}, status=400)
    start = d["departure"].astimezone(UTC).replace(minute=0, second=0, microsecond=0)
    hours = [start + timedelta(hours=h) for h in range(HEATMAP_HOURS)]
    with tomtom.http_client() as client:
        flat = weather.readings(client, [(lat, lon, hour) for hour in hours for lat, lon in cells])
    if all(r == weather.UNKNOWN for r in flat):
        return Response({"detail": "Weather layer didn't load."}, status=502)

    def grid(level_of) -> list[list[int | None]]:
        return [[_level(level_of(r)) for r in flat[h * len(cells) : (h + 1) * len(cells)]] for h in range(HEATMAP_HOURS)]

    def one(r: weather.Reading, wind=0.0, rain=0.0, snow=0.0) -> risk.RiskResult:
        return risk.classify(wind, rain, snow, 0, r.beyond_forecast)

    return Response(
        {
            "hours": [h.isoformat() for h in hours],
            "spacing_mi": spacing,
            "cells": [[lon, lat] for lat, lon in cells],
            "levels": {
                "risk": grid(lambda r: risk.classify(r.wind_mph, r.rain_in_hr, r.snow_in_hr, d["cargo_lb"], r.beyond_forecast)),
                "wind": grid(lambda r: one(r, wind=r.wind_mph)),
                "rain": grid(lambda r: one(r, rain=r.rain_in_hr)),
                "snow": grid(lambda r: one(r, snow=r.snow_in_hr)),
            },
        }
    )
