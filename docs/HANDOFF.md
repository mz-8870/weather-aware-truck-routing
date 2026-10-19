# Handoff — Weather-Aware Truck Routing

Give this file to a new Claude Code session. Start the session **in `C:\dev\weather-aware-truck-routing`**.

## Read first (in order)
1. `docs/SPEC.md` — the agreed spec. Every rule, threshold and convention was decided with the user; do not re-litigate.
2. `docs/PATTERNS_REVIEW.md` — mistakes already made and the rules that prevent them. Add to it when you slip.
3. `docs/fs-assessment-spotter.pdf` — the original brief (grading: 40% logic, 40% UI/map/heatmap smoothness, 15% code quality, 5% docs).

## Non-negotiable rules
- **No AI attribution** in commits or PRs (no `Co-Authored-By: Claude`, no "Generated with Claude Code").
- **TDD with Matt Pocock's `implement` + `tdd` skills**: pick the seams yourself (user delegated, 2026-10-19) and state them in the PR; red → green one test at a time at public interfaces; typecheck + single test files often, full suite at the end; code review before opening the PR; commit to the issue branch.
- **One issue at a time**, in dependency order. Branch `issue-<n>-<slug>`, PR body "Closes #n".
- **Work autonomously** (user, 2026-10-19): don't ask the user unless truly blocked (accounts, keys, payment). Each PR is reviewed by a **reviewer subagent** (runs all checks + reads diff vs issue/spec); fix its BLOCKING findings, then merge yourself and start the next issue.
- **Update this file at the end of every issue**, on the issue branch, so it merges with the PR.
- **Don't touch the main checkout's branch** — the user keeps `design/truck-routing.pen` open in Pencil there. Code work happens in the git worktree **`C:\dev\wtr-issues`**.
- **Pencil**: the user must **save (Ctrl+S)** before a `.pen` commit. Read the pen-dev skill (`mcp__pencil__read_skill`) before editing designs.
- Simplest complete change; no speculative features (user's global CLAUDE.md: Karpathy guidelines + "ponytail" lazy-senior style).
- Diagrams → `diagram-design` skill. HTML docs → html-anything `docs-page` layout.

## Where things are
| What | Where |
|---|---|
| Repo | `github.com/mz-8870/weather-aware-truck-routing` (private; `gh` logged in as **mz-8870**) |
| Issues | #1–#16, label `ready-for-agent`, native "blocked by" links |
| Designs | `design/truck-routing.pen` — Design System (Light, Dark) + screens 01–12 |
| Code worktree | `C:\dev\wtr-issues` |
| UI/UX Pro Max skill | `~/.claude/skills/ui-ux-pro-max` (run scripts without `python -I`) |

## Status (2026-10-19)
| # | Ticket | State |
|---|---|---|
| 1 | Walking skeleton | ✅ merged (#17). **Vercel deploy still needs the user** (import repo; env `SECRET_KEY`, `DEBUG=false`, `ALLOWED_HOSTS=.vercel.app`, `TOMTOM_API_KEY`). Verify `/api/*` reaches Django on first deploy. |
| 2 | Design system (Gate 1) | ✅ closed |
| 3 | Screens (Gate 2) | ✅ approved, closed |
| 4 | Tokens in code | ✅ merged (#19) |
| 5 | Risk engine | ✅ merged (#18) |
| 6 | Tracer route | ✅ merged (#20) |
| 7 | Checkpoints + weather risk | PR open (branch `issue-7-checkpoints`) |
| 8–16 | — | Not started; #8 next |

## Decisions not obvious from the spec
- **Test seams (confirmed):** #1 → `GET /api/health` via Django test client + rendered App with `fetch` stubbed. #5 → only `classify(wind_mph, rain_in_hr, snow_in_hr, cargo_lb, beyond_forecast=False) -> RiskResult(level, reasons, beyond_forecast)`; Unknown is `level=None`.
- **Design tokens** live as Pencil variables (themes `mode: light|dark`): `color-*`, `risk-*` (+ `-subtle`, `risk-on-strong`, `risk-on-warm`), `map-*`, `font-sans` (IBM Plex Sans), `font-mono` (IBM Plex Mono), `text-*`, `space-*`, `radius-*`, `control-height` (44), `duration-*`. Issue #4 generates `tokens.ts` from these.
- **Risk ramp:** Low sage, Moderate yellow, High orange, Severe red, No Travel deep purple, Unknown grey — each with an icon (shield-check, circle-alert, triangle-alert, octagon-alert, ban, circle-dashed).
- **Convert units at the boundary and round** before classifying (float error at thresholds — see PATTERNS_REVIEW rule 10).
- **Routing vendor is TomTom**, not HERE (HERE signup needed a card; user declined). Key lives in `backend/.env` as `TOMTOM_API_KEY` (gitignored). Free tier ~2,500 req/day. No route → TomTom 400 `NO_ROUTE_FOUND` → our 422. Denver→Chicago returns only 2 routes, so the spec’s via-point fallback for <3 routes will be needed in #8.
- **`/api/plan` (as of #7):** `POST {origin, destination, departure ISO, weight_lb, interval_mi 10|25|50 (default 25)}` → `{routes:[{distance_mi, duration_s, checkpoints:[{mile, lat, lon, offset_s, eta, level 0–4|null, reasons, beyond_forecast, wind_mph, gust_mph, rain_in_hr, snow_in_hr, owned_mi}], segments:[{level, coordinates}]}]}` (segments = each checkpoint's owned stretch; no separate `coordinates`); 400 field errors, 422 `{detail}` (place not found / no route), 502 TomTom down. Geocoding is US-only fuzzy text (`countrySet=US`) until #9 sends coordinates. `weight_lb` is sent to TomTom as gross; risk cargo = max(0, weight − 35,000) (`EMPTY_TRUCK_LB` in `views.py`, a `shortcut:`) until #10 adds modes.
- **Map:** MapLibre + OpenFreeMap tiles (no key), style in `frontend/src/mapStyle.ts` from `map-*` tokens. Vite needs `optimizeDeps.exclude: ["maplibre-gl"]` or the worker 404s in dev.
- **Backend modules:** `tomtom.py` (geocode + truck route → `Route(points, progress, …)`), `checkpoints.py` (pure: sampling, ETA interpolation, owned miles, paths), `weather.py` (batched Open-Meteo, chunks of 100, LRU cache keyed (lat 2dp, lon 2dp, UTC hour); outage → Unknown readings, not cached), `risk.py`. One httpx client per request is shared by TomTom + Open-Meteo, so tests mock both via one `MockTransport`.
- **Frontend:** `plan.ts` (API types + `planTrip`), `risk.ts` (level → key/label/lucide icon), `CheckpointDetails` (popover body; copy from Pencil screen 06b), `RouteMap` (risk-colored segments + checkpoint circles; click → Radix popover anchored at the click point; closes on map move).
- **TomTom timing:** `extendedRouteRepresentation=distance&extendedRouteRepresentation=travelTime` returns ~90 sparse `progress` keyframes `{pointIndex, distanceInMeters, travelTimeInSeconds}` per route (not per point) — interpolate checkpoint ETAs between them. Open-Meteo batch (comma lists) returns a list; rain is mm, snowfall cm, wind in mph when `wind_speed_unit=mph`.
- **Local dev:** Django `backend/.venv/Scripts/python manage.py runserver 127.0.0.1:8000`; Vite `npm run dev` in `frontend` (proxies `/api`).
- Stack versions in use: Django 6.1, DRF 3.18, Python 3.12 (CI); Vite 8, React 19, TS 7, Vitest 5, Node 24.

## Open items for the user
- Vercel project setup (above).
- An empty frame named "Frame" at 0,0 in the `.pen` — user hasn't said whether to delete it.
- Make the repo public before submission (#16).
