"""Checkpoints every N miles along a route, with ETAs and the miles each one owns."""

from bisect import bisect_left, bisect_right
from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt

M_PER_MI = 1609.344
EARTH_M = 6_371_000
END_EPS_MI = 0.1  # a sample this close to the end would duplicate the end checkpoint


@dataclass(frozen=True)
class Checkpoint:
    mile: float
    lat: float
    lon: float
    offset_s: int  # seconds after departure
    owned_mi: float  # half the gap to each neighbour (nearest-checkpoint attribution)
    path: list[list[float]]  # [lon, lat] points along the owned miles


def _haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    (lat1, lon1), (lat2, lon2) = (map(radians, a)), (map(radians, b))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_M * asin(sqrt(h))


def _locate(cum: list[float], d: float) -> tuple[int, float]:
    """Segment index j and fraction f such that distance d lies at cum[j] + f * (cum[j+1] - cum[j])."""
    i = min(max(bisect_right(cum, d), 1), len(cum) - 1)
    seg = cum[i] - cum[i - 1]
    return i - 1, (d - cum[i - 1]) / seg if seg else 0.0


def _interp(xs: list[float], ys: list[float], x: float) -> float:
    j, f = _locate(xs, x)
    return ys[j] + f * (ys[j + 1] - ys[j])


PATH_TOLERANCE_DEG = 0.00015  # ~15 m: below a pixel at route zooms; long trips shrink ~3 MB -> well under Vercel's 4.5 MB


def _simplify(path: list[list[float]], tol: float = PATH_TOLERANCE_DEG) -> list[list[float]]:
    """Douglas-Peucker on [lon, lat] points (display only: ETAs and miles use the full geometry)."""
    keep = [False] * len(path)
    keep[0] = keep[-1] = True
    stack = [(0, len(path) - 1)]
    while stack:
        i, j = stack.pop()
        (x1, y1), (x2, y2) = path[i], path[j]
        dx, dy = x2 - x1, y2 - y1
        norm = (dx * dx + dy * dy) ** 0.5
        far, far_k = 0.0, -1
        for k in range(i + 1, j):
            x, y = path[k]
            d = abs(dy * (x - x1) - dx * (y - y1)) / norm if norm else ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
            if d > far:
                far, far_k = d, k
        if far > tol:
            keep[far_k] = True
            stack += [(i, far_k), (far_k, j)]
    return [p for p, kept in zip(path, keep) if kept]


def checkpoints(
    points: list[tuple[float, float]],
    progress: list[tuple[int, float, float]],
    interval_mi: int,
) -> list[Checkpoint]:
    """`points` are (lat, lon); `progress` is TomTom's sparse (point_index, distance_m, travel_time_s) keyframes."""
    cum = [0.0]
    for a, b in zip(points, points[1:]):
        cum.append(cum[-1] + _haversine_m(a, b))
    # Scale geometry to TomTom's own length so the last checkpoint lands on the route's mileage.
    scale = progress[-1][1] / M_PER_MI / cum[-1]
    cum_mi = [d * scale for d in cum]
    total = cum_mi[-1]
    key_mi = [cum_mi[i] for i, _, _ in progress]
    key_s = [t for _, _, t in progress]

    miles = [k * interval_mi for k in range(int(total // interval_mi) + 1) if k * interval_mi < total - END_EPS_MI]
    miles.append(total)
    bounds = [0.0] + [(a + b) / 2 for a, b in zip(miles, miles[1:])] + [total]

    def at(d: float) -> list[float]:
        j, f = _locate(cum_mi, d)
        (lat1, lon1), (lat2, lon2) = points[j], points[j + 1]
        return [round(lon1 + f * (lon2 - lon1), 5), round(lat1 + f * (lat2 - lat1), 5)]  # TomTom's precision

    result = []
    for k, mile in enumerate(miles):
        lo, hi = bounds[k], bounds[k + 1]
        inner = [[lon, lat] for lat, lon in points[bisect_right(cum_mi, lo) : bisect_left(cum_mi, hi)]]
        lon, lat = at(mile)
        result.append(
            Checkpoint(
                mile=round(mile, 2),
                lat=lat,
                lon=lon,
                offset_s=round(_interp(key_mi, key_s, mile)),
                owned_mi=round(hi - lo, 2),
                path=_simplify([at(lo), *inner, at(hi)]),
            )
        )
    return result
