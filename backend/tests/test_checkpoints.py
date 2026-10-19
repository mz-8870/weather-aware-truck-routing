import pytest

from checkpoints import checkpoints

M_PER_MI = 1609.344


def straight_route(miles: float, n: int = 101):
    """Points due north along a meridian; progress at constant speed (60 mph)."""
    deg = miles * M_PER_MI / 111_195  # metres per degree of latitude on TomTom's sphere
    points = [(deg * i / (n - 1), 0.0) for i in range(n)]
    progress = [(0, 0.0, 0.0), (n - 1, miles * M_PER_MI, miles * 60.0)]
    return points, progress


@pytest.mark.parametrize(("interval", "count"), [(10, 11), (25, 5), (50, 3)])
def test_interval_sets_checkpoint_count(interval: int, count: int) -> None:
    assert len(checkpoints(*straight_route(100), interval)) == count


def test_checkpoints_every_interval_plus_the_end() -> None:
    cps = checkpoints(*straight_route(110), 25)
    assert [c.mile for c in cps] == [0, 25, 50, 75, 100, 110]


def test_end_near_a_sample_is_not_duplicated() -> None:
    cps = checkpoints(*straight_route(100.05), 25)
    assert [c.mile for c in cps] == [0, 25, 50, 75, 100.05]


def test_each_checkpoint_owns_half_the_interval_each_side() -> None:
    cps = checkpoints(*straight_route(110), 25)
    assert [c.owned_mi for c in cps] == [12.5, 25, 25, 25, 17.5, 5]
    assert sum(c.owned_mi for c in cps) == pytest.approx(110)


def test_eta_is_interpolated_between_progress_keyframes() -> None:
    points, _ = straight_route(100)
    # first 50 mi in 1 h, last 50 mi in 30 min
    progress = [(0, 0.0, 0.0), (50, 50 * M_PER_MI, 3600.0), (100, 100 * M_PER_MI, 5400.0)]
    cps = checkpoints(points, progress, 25)
    assert [c.offset_s for c in cps] == [0, 1800, 3600, 4500, 5400]


def test_etas_increase_and_end_at_route_duration() -> None:
    points, progress = straight_route(333)
    offsets = [c.offset_s for c in checkpoints(points, progress, 10)]
    assert offsets == sorted(offsets) and len(set(offsets)) == len(offsets)
    assert offsets[-1] == progress[-1][2]


def test_duplicate_points_are_ignored() -> None:
    points, progress = straight_route(100)
    doubled = [p for p in points for _ in (0, 1)]
    progress = [(0, 0.0, 0.0), (len(doubled) - 1, progress[-1][1], progress[-1][2])]
    assert [c.mile for c in checkpoints(doubled, progress, 25)] == [0, 25, 50, 75, 100]


def test_paths_cover_the_route_end_to_end() -> None:
    points, progress = straight_route(110)
    cps = checkpoints(points, progress, 25)
    assert cps[0].path[0] == [points[0][1], points[0][0]]
    assert cps[-1].path[-1] == [points[-1][1], points[-1][0]]
    for a, b in zip(cps, cps[1:]):
        assert a.path[-1] == b.path[0]
