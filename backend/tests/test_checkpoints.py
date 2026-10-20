import pytest

from checkpoints import checkpoints, hos_elapsed, hos_stops, slowed

M_PER_MI = 1609.344


def straight_route(miles: float, n: int = 101):
    """Points due north along a meridian; progress at constant speed (60 mph)."""
    deg = miles * M_PER_MI / 111_195  # metres per degree of latitude on TomTom's sphere
    points = [(round(deg * i / (n - 1), 5), 0.0) for i in range(n)]  # TomTom sends 5 dp
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


def test_display_paths_drop_points_that_add_no_shape() -> None:
    points, progress = straight_route(100, n=2001)  # dense samples on a straight line
    cps = checkpoints(points, progress, 25)
    assert all(len(c.path) == 2 for c in cps)  # a straight piece needs only its ends
    assert cps[0].path[0] == [0.0, 0.0] and cps[-1].path[-1] == [points[-1][1], points[-1][0]]


def test_display_paths_keep_bends() -> None:
    corner = [(0.0, 0.0), (0.05, 0.0), (0.1, 0.0), (0.1, 0.05), (0.1, 0.1)]  # north, then east: a ~7 mi bend
    progress = [(0, 0.0, 0.0), (4, 22_239.0, 1000.0)]
    (cp,) = [c for c in checkpoints(corner, progress, 50)][:1]
    assert [0.0, 0.1] in cp.path  # the corner survives simplification


H = 3600


@pytest.mark.parametrize(
    ("drive_h", "wall_h"),
    [
        (0, 0),
        (8, 8),  # the 30 min break comes after 8 h of driving, not at it
        (9, 9.5),
        (11, 11.5),  # end of the first shift: no rest needed yet
        (12, 22.5),  # 11 h + 0.5 h break + 10 h rest + 1 h
        (19, 29.5),  # second shift's 8 h mark: break not yet taken
        (20, 31),  # ... and now it has
        (33, 54.5),  # three full shifts: 2 rests + 3 breaks
    ],
)
def test_hos_elapsed_adds_breaks_and_rests(drive_h: float, wall_h: float) -> None:
    assert hos_elapsed(drive_h * H) == wall_h * H


def test_hos_stops_are_placed_where_the_driving_clock_runs_out() -> None:
    points, progress = straight_route(1000)  # 60 mph: 16.7 h of driving
    stops = hos_stops(points, progress)
    assert [(s.kind, round(s.mile), s.drive_s) for s in stops] == [("break", 480, 8 * H), ("rest", 660, 11 * H)]
    deg_per_mi = points[-1][0] / 1000
    assert stops[1].lat == pytest.approx(660 * deg_per_mi, abs=1e-4) and stops[1].lon == 0.0


def test_a_short_trip_has_no_stops() -> None:
    assert hos_stops(*straight_route(400)) == []  # under 8 h at 60 mph


def test_a_trip_ending_exactly_at_a_break_or_rest_needs_no_stop_on_arrival() -> None:
    assert hos_stops(*straight_route(480)) == []  # exactly 8 h at 60 mph: arrives as the break would start
    assert [s.kind for s in hos_stops(*straight_route(660))] == ["break"]  # exactly 11 h: no rest at the door


def test_slowed_stretches_each_span_by_the_factors_of_the_checkpoints_owning_its_halves() -> None:
    points, progress = straight_route(100)  # 60 mph: a checkpoint every 1,500 s at 25 mi
    cps = checkpoints(points, progress, 25)
    # Checkpoint 2 drives at 75%: the 750 s on each side of it become 1,000 s.
    assert [c.offset_s for c in slowed(cps, [1, 1, 0.75, 1, 1])] == [0, 1500, 3250, 5000, 6500]
    assert [c.mile for c in slowed(cps, [1, 1, 0.75, 1, 1])] == [c.mile for c in cps]  # only time changes


def test_slowed_at_full_speed_changes_nothing() -> None:
    points, progress = straight_route(100)
    cps = checkpoints(points, progress, 25)
    assert slowed(cps, [1.0] * len(cps)) == cps


def test_stops_follow_slowed_timing_when_given() -> None:
    points, progress = straight_route(1000)  # 60 mph
    cps = slowed(checkpoints(points, progress, 25), [0.5] * 41)  # half speed all the way: 30 mph
    (first, *_) = hos_stops(points, progress, keys=([c.mile for c in cps], [c.offset_s for c in cps]))
    assert first.kind == "break" and first.mile == 240.0  # 8 h at 30 mph, not 480 mi
