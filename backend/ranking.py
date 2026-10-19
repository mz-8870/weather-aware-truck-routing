"""Route summaries and the spec's strict ranking: No Travel last, then severe mi, high mi, avg risk, time."""

from math import inf
from typing import NamedTuple

SEVERE, NO_TRAVEL, HIGH = 3, 4, 2


class Summary(NamedTuple):
    severe_mi: float
    high_mi: float
    unknown_mi: float
    notravel_mi: float
    avg_risk: float | None  # mile-weighted 0–4 over known miles; None when every mile is Unknown
    duration_s: int


class Ranking(NamedTuple):
    order: list[int]  # indexes into the input, best first
    recommended: int | None  # None when every route crosses No Travel
    why: str | None  # the deciding factor, comparing the winner to the runner-up


def summarize(checkpoints: list[tuple[float, int | None]], duration_s: int) -> Summary:
    """`checkpoints` are (owned_mi, level) pairs; level None = Unknown."""

    def miles(level: int | None) -> float:
        return round(sum(mi for mi, lv in checkpoints if lv == level), 1)

    known = [(mi, lv) for mi, lv in checkpoints if lv is not None]
    known_mi = sum(mi for mi, _ in known)
    return Summary(
        severe_mi=miles(SEVERE),
        high_mi=miles(HIGH),
        unknown_mi=miles(None),
        notravel_mi=miles(NO_TRAVEL),
        avg_risk=round(sum(mi * lv for mi, lv in known) / known_mi, 2) if known_mi else None,
        duration_s=duration_s,
    )


def _key(s: Summary) -> tuple:
    return (s.notravel_mi > 0, s.notravel_mi, s.severe_mi, s.high_mi, inf if s.avg_risk is None else s.avg_risk, s.duration_s)


def _hm(seconds: int) -> str:
    minutes = round(seconds / 60)
    return f"{minutes // 60}h {minutes % 60:02d}m"


def _why(best: Summary, runner: Summary) -> str:
    other = "Route B"  # routes are named A, B, C in ranked order
    if runner.notravel_mi > 0:
        return "The only route without a No Travel zone."
    if best.severe_mi != runner.severe_mi:
        return f"Wins on severe miles: {best.severe_mi:.1f} mi vs {runner.severe_mi:.1f} mi on {other}."
    if best.high_mi != runner.high_mi:
        return f"Wins on high miles: {best.high_mi:.1f} mi vs {runner.high_mi:.1f} mi on {other} (both {best.severe_mi:g} severe)."
    if best.avg_risk != runner.avg_risk and best.avg_risk is not None:
        runner_avg = "unknown" if runner.avg_risk is None else f"{runner.avg_risk:.2f}"
        return f"Wins on average risk: {best.avg_risk:.2f} vs {runner_avg} on {other} (same severe and high miles)."
    if best.duration_s != runner.duration_s:
        return f"Fastest of equally safe routes: {_hm(best.duration_s)} vs {_hm(runner.duration_s)} on {other}."
    return f"Ties {other} on every factor."


def rank(summaries: list[Summary]) -> Ranking:
    order = sorted(range(len(summaries)), key=lambda i: _key(summaries[i]))
    best = summaries[order[0]]
    if best.notravel_mi > 0:
        return Ranking(order, None, None)
    why = _why(best, summaries[order[1]]) if len(order) > 1 else "The only route found."
    return Ranking(order, order[0], why)
