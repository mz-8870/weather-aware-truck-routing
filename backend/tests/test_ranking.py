from ranking import Summary, rank, summarize

LOW, MOD, HIGH, SEVERE, NO_TRAVEL = range(5)


def s(severe=0.0, high=0.0, avg=0.5, duration=3600, notravel=0.0) -> Summary:
    return Summary(severe_mi=severe, high_mi=high, unknown_mi=0.0, notravel_mi=notravel, avg_risk=avg, duration_s=duration)


def test_summarize_attributes_owned_miles_by_level() -> None:
    summary = summarize([(12.5, LOW), (25, HIGH), (25, SEVERE), (25, None), (12.5, NO_TRAVEL)], duration_s=3600)
    assert summary == Summary(severe_mi=25, high_mi=25, unknown_mi=25, notravel_mi=12.5, avg_risk=2.33, duration_s=3600)


def test_summarize_rounds_miles_to_a_tenth() -> None:
    assert summarize([(0.04, HIGH), (10, LOW)], 60).high_mi == 0.0


def test_fewest_severe_miles_wins() -> None:
    ranking = rank([s(severe=10), s(severe=2, high=99, avg=3.9, duration=99999)])  # severe outranks everything after it
    assert ranking.order == [1, 0] and ranking.recommended == 1
    assert ranking.why == "Wins on severe miles: 2.0 mi vs 10.0 mi on Route B."


def test_high_miles_break_a_severe_tie() -> None:
    ranking = rank([s(high=48, avg=0.1), s(high=12.5, avg=0.9)])  # high outranks avg risk
    assert ranking.order == [1, 0]
    assert ranking.why == "Wins on high miles: 12.5 mi vs 48.0 mi on Route B (both 0 severe)."


def test_average_risk_breaks_a_high_tie() -> None:
    ranking = rank([s(avg=0.65, duration=3600), s(avg=0.42, duration=7200)])  # avg risk outranks time
    assert ranking.order == [1, 0]
    assert ranking.why == "Wins on average risk: 0.42 vs 0.65 on Route B (same severe and high miles)."


def test_travel_time_breaks_a_full_risk_tie() -> None:
    ranking = rank([s(duration=9 * 3600), s(duration=8 * 3600 + 15 * 60)])
    assert ranking.order == [1, 0]
    assert ranking.why == "Fastest of equally safe routes: 8h 15m vs 9h 00m on Route B."


def test_miles_within_rounding_are_a_tie() -> None:
    # 2.04 vs 2.0 severe mi both round to 2.0, so the faster route wins despite slightly more severe miles
    a = summarize([(2.04, SEVERE)], duration_s=50)
    b = summarize([(2.0, SEVERE)], duration_s=100)
    assert rank([a, b]).order == [0, 1]


def test_no_travel_route_ranks_last_even_if_otherwise_best() -> None:
    ranking = rank([s(notravel=5, severe=0), s(severe=30), s(severe=40)])
    assert ranking.order == [1, 2, 0]


def test_only_route_without_no_travel_says_so() -> None:
    ranking = rank([s(notravel=5), s(severe=30)])
    assert ranking.recommended == 1
    assert ranking.why == "The only route without a No Travel zone."


def test_all_blocked_means_no_recommendation() -> None:
    ranking = rank([s(notravel=5), s(notravel=1)])
    assert ranking.recommended is None and ranking.why is None
    assert ranking.order == [1, 0]  # still ordered, least No Travel first


def test_single_route_is_recommended_without_a_comparison() -> None:
    ranking = rank([s()])
    assert ranking.recommended == 0 and ranking.why == "The only route found."


def test_unknown_only_route_does_not_win_on_average() -> None:
    ranking = rank([s(avg=None), s(avg=1.0)])  # type: ignore[arg-type]
    assert ranking.order == [1, 0]
