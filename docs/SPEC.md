# Weather-Aware Truck Routing — Agreed Spec

Source brief: `docs/fs-assessment-spotter.pdf`. Grading: 40% logic, 40% UI/map/heatmap smoothness, 15% code quality, 5% docs.

## Stack & hosting
- Frontend: Vite + React + TypeScript, MapLibre GL + deck.gl, Radix primitives (unstyled), CSS Modules + CSS custom-property tokens, TanStack Query + Zustand.
- Backend: Django + DRF, Python type hints. No DB models.
- Hosting: single Vercel project (static React + Django as Python serverless function `api/index.py`). No card.
- Repo: `mz-8870/weather-aware-truck-routing`, private first, monorepo `/backend` `/frontend`. No AI attribution in commits.
- Local path: `C:\dev\weather-aware-truck-routing`.

## External APIs
- Routing + geocoding/autosuggest: HERE (truck profile, alternatives). Keys server-side only (`.env`, Vercel env; `.env.example` committed).
- If HERE returns <3 routes: synthesize an alternative via a via-point detour; UI explains it.
- Weather: Open-Meteo hourly, batched multi-coordinate. Sustained `wind_speed_10m` classifies; gusts shown as info. `snowfall` cm/h → in/h.

## Inputs
- Origin, destination (autosuggest), departure (browser TZ; past rejected), weight, sampling interval toggle 10/25/50 mi (default 25).
- Weight mode: **Cargo only** | **Gross (truck + cargo)**; Advanced: empty-truck weight (default 35,000 lb), optional axle count + weight-per-axle (sent to HERE only if set).
  - HERE gets gross. Risk load rules use cargo (gross mode: cargo = max(0, gross − empty)).
  - Validation: weight ≥ 0; warn > 80,000 lb gross.

## Checkpoints & ETA
- Points every N miles along the polyline; ETA interpolated from HERE per-span durations (traffic-aware for departure time). No HOS breaks (future feature).
- Each checkpoint owns half the interval on each side (nearest-checkpoint attribution). Drop zero-length/duplicate endpoints.

## Risk classification (canonical imperial, lower-inclusive / upper-exclusive)
| Level | Wind mph | Rain in/hr | Snow in/hr |
|---|---|---|---|
| Low (0) | <25 | <0.10 | <0.5 |
| Moderate (1) | [25,35) | [0.10,0.25) | [0.5,1.0) |
| High (2) | [35,45) | [0.25,0.50) | [1.0,2.0) |
| Severe (3) | [45,55) | [0.50,1.00] | [2.0,3.0] |
| No Travel (4) | ≥55 | >1.00 | >3.0 |

- Checkpoint level = worst of wind/rain/snow, then load rules can only raise it:
  - wind ≥55 → No Travel; wind [45,55) & cargo >30,000 → No Travel; wind [35,45) & cargo >40,000 → Severe. Thresholds strict (exactly 30,000 not raised).
- Missing/NaN → Unknown (grey, excluded from average, reported as unknown miles). Negative → clamp 0.
- ETA beyond forecast horizon → use last available hour, flag "beyond forecast".

## Recommendation
- Any No Travel mile → route ranked last with banner. All 3 blocked → no recommendation (earliest clear departure = future feature).
- Otherwise strict lexicographic on (Severe mi, High mi, mile-weighted avg risk 0–4, travel time), miles rounded to 0.1.
- UI states the deciding factor.

## API
- `POST /api/plan` → routes, checkpoints, levels, ETAs, summaries, recommendation.
- `POST /api/heatmap` → corridor grid (~25 mi spacing, 50 mi buffer around all routes), hours 0–48, one batched Open-Meteo fetch (chunked). Slider is client-side only.
- `GET /api/geocode?q=` → HERE autosuggest proxy.
- Cache: per-instance in-memory LRU keyed by (lat, lon rounded 2dp, hour).

## UI
- Desktop: left sidebar (form, 3 route cards with risk bar, ★ recommended + why), map with per-segment risk-colored routes (recommended thick, others dimmed), checkpoint popover (ETA, wind/rain/snow, level, triggering rule), bottom 0–48h slider with play, truck markers per route at hour N, heatmap layer toggle Risk/Wind/Rain/Snow + legend.
- Mobile: bottom sheet.
- Units toggle Imperial/Metric (localStorage, default from locale). Backend always imperial; conversion only in frontend formatting; metric shows original threshold too.
- ETAs in user TZ + elapsed time.
- Theme: light default + dark via tokens. Colorblind-safe risk ramp, always paired with icon/label.
- States: skeletons, heatmap loading chip, empty state with example trips, errors (no route, API down + retry, heatmap failed while routes ok, <3 routes note).

## Design (Pencil) — gates before code
- Style via UI/UX Pro Max skill (install to `~/.claude/skills/ui-ux-pro-max`), not AI-slop.
- File: `design/truck-routing.pen`.
- Screens: 1 empty, 2 form states (valid, errors, autosuggest open, advanced weight), 3 loading, 4 results, 5 route expanded, 6 checkpoint popover (+ beyond-forecast, unknown), 7 heatmap active, 8 No Travel (one / all), 9 <3 routes, 10 errors, 11 header units + theme, 12 mobile, 13 design-system page. Desktop 1440; mobile 390 for 1, 4, 6, 7.
- Gate 1: approve design system. Gate 2: approve screens. Then export Pencil variables → `tokens.ts` → CSS vars + deck.gl RGB arrays.

## Quality
- pytest: every classification/load edge case, mile attribution, ranking, contract test with mocked HERE/Open-Meteo.
- Vitest: unit conversion, token generation. Playwright smoke: plan → 3 cards → slider.
- GitHub Actions CI on push. Stylelint bans raw colors/px in components.

## Docs
- README (setup, architecture diagram via diagram-design skill, all assumptions above, API contract), `FUTURE_FEATURES.md`, `LOOM_SCRIPT.md`.
