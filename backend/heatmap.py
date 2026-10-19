"""Weather grid around the planned routes for the 0-48 h heatmap (SPEC: ~25 mi spacing, 50 mi buffer)."""

from math import asin, ceil, cos, radians, sin, sqrt

EARTH_MI = 3958.8
MI_PER_DEG_LAT = 69.0


def _miles(a: tuple[float, float], b: tuple[float, float]) -> float:
    (lat1, lon1), (lat2, lon2) = map(radians, a), map(radians, b)
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_MI * asin(sqrt(h))


def corridor_grid(points: list[tuple[float, float]], spacing_mi: float = 25, buffer_mi: float = 50) -> list[tuple[float, float]]:
    """Cells (lat, lon) of a fixed global lattice that lie within `buffer_mi` of any route point.

    Rows are `spacing_mi` apart in latitude; within a row, cells are `spacing_mi` apart along the parallel.
    A fixed lattice means overlapping routes share cells instead of duplicating them.
    """
    lat_step = spacing_mi / MI_PER_DEG_LAT
    reach = ceil(buffer_mi / spacing_mi) + 1
    cells: set[tuple[int, int]] = set()
    for lat, lon in points:
        row = round(lat / lat_step)
        for i in range(row - reach, row + reach + 1):
            cell_lat = i * lat_step
            lon_step = lat_step / cos(radians(cell_lat))
            col = round(lon / lon_step)
            for j in range(col - reach, col + reach + 1):
                if (i, j) not in cells and _miles((lat, lon), (cell_lat, j * lon_step)) <= buffer_mi:
                    cells.add((i, j))
    return sorted(
        (round(i * lat_step, 4), round(j * lat_step / cos(radians(i * lat_step)), 4)) for i, j in cells
    )
