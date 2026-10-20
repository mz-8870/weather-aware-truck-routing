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

## Resume here (2026-10-20)
1. **Deployed (2026-10-20):** https://weather-aware-truck-routing-gamma.vercel.app (Vercel project `mz-8870/weather-aware-truck-routing`, linked from `C:\dev\wtr-issues`; production env vars set). Connected to GitHub (2026-10-20): every push to `main` deploys to production, every PR gets a preview URL. Manual redeploy: `npx vercel deploy --prod --yes` from the worktree root.
2. **Needs the user:** make the repo public when they say so.
3. Audit findings still open (from the impeccable pass, PR #27 merged): checkpoint details keyboard access + active checkpoint marker (map), "Why Low" copy, dark-mode severe vs high hue distance (1.36:1).
4. Dev servers: Django :8000 (autoreload) and Vite :5179, both from `C:\dev\wtr-issues`. Stop Vite before `npm ci` there (it locks `node_modules`).
5. Headless visual checks without the Playwright MCP: `node <script> <playwright-core path> <outdir> <chrome.exe>` — playwright-core lives in `%LOCALAPPDATA%\npm-cache\_npx\*\node_modules\playwright-core`, Chromium in `%LOCALAPPDATA%\ms-playwright\chromium-1248`. Pass `--use-angle=swiftshader` for WebGL.

## Status (2026-10-20)
| # | Ticket | State |
|---|---|---|
| 1 | Walking skeleton | ✅ merged (#17). **Vercel deploy still needs the user** (import repo; env `SECRET_KEY`, `DEBUG=false`, `ALLOWED_HOSTS=.vercel.app`, `TOMTOM_API_KEY`). Verify `/api/*` reaches Django on first deploy. |
| 2 | Design system (Gate 1) | ✅ closed |
| 3 | Screens (Gate 2) | ✅ approved, closed |
| 4 | Tokens in code | ✅ merged (#19) |
| 5 | Risk engine | ✅ merged (#18) |
| 6 | Tracer route | ✅ merged (#20) |
| 7 | Checkpoints + weather risk | ✅ merged (#21) |
| 8 | Three routes + recommendation | ✅ merged (#22) |
| 9 | Location autosuggest | ✅ merged (#23) |
| 10 | Weight modes + truck params | ✅ merged (#24) |
| 11 | Units + time display | ✅ merged (#25) |
| 12 | Heatmap + slider + trucks | ✅ merged (#26) |
| 13 | Loading, empty, error states | ✅ merged (#28) |
| 14 | Mobile layout + dark mode | ✅ merged (#29) |
| 15 | E2E + performance | ✅ merged (#30) |
| 31 | HOS rest breaks (toggle) | ✅ merged (#32) |
| 16 | Docs + release | ✅ merged (#33); deployed |

## Decisions not obvious from the spec
- **Test seams (confirmed):** #1 → `GET /api/health` via Django test client + rendered App with `fetch` stubbed. #5 → only `classify(wind_mph, rain_in_hr, snow_in_hr, cargo_lb, beyond_forecast=False) -> RiskResult(level, reasons, beyond_forecast)`; Unknown is `level=None`.
- **Design tokens** live as Pencil variables (themes `mode: light|dark`): `color-*`, `risk-*` (+ `-subtle`, `risk-on-strong`, `risk-on-warm`), `map-*`, `font-sans` (IBM Plex Sans), `font-mono` (IBM Plex Mono), `text-*`, `space-*`, `radius-*`, `control-height` (44), `duration-*`. Issue #4 generates `tokens.ts` from these.
- **Risk ramp:** Low sage, Moderate yellow, High orange, Severe red, No Travel deep purple, Unknown grey — each with an icon (shield-check, circle-alert, triangle-alert, octagon-alert, ban, circle-dashed).
- **Convert units at the boundary and round** before classifying (float error at thresholds — see PATTERNS_REVIEW rule 10).
- **Routing vendor is TomTom**, not HERE (HERE signup needed a card; user declined). Key lives in `backend/.env` as `TOMTOM_API_KEY` (gitignored). Free tier ~2,500 req/day. No route → TomTom 400 `NO_ROUTE_FOUND` → our 422. Denver→Chicago returns only 2 routes, so the spec’s via-point fallback for <3 routes will be needed in #8.
- **`/api/plan` (as of #8):** `POST {origin, destination, departure ISO, weight_lb, interval_mi 10|25|50 (default 25)}` → `{routes (best first, named Route A/B/C), recommended: 0|null, why, routes_found, cargo_lb}`; each route `{name, distance_mi, duration_s, synthesized, detour_via, summary:{severe_mi, high_mi, unknown_mi, notravel_mi, avg_risk}, checkpoints:[{mile, lat, lon, offset_s, eta, level 0–4|null, reasons, beyond_forecast, wind_mph, gust_mph, rain_in_hr, snow_in_hr, owned_mi}], segments:[{level, coordinates}]}`. 400 field errors, 422 `{detail}` (place not found / no route), 502 TomTom down. Optional `origin_position` / `destination_position` `[lat, lon]` (from autosuggest) skip text geocoding; typed text still falls back to US-only fuzzy geocoding. `GET /api/geocode?q=` → `{suggestions:[{label, kind, lat, lon}]}` (TomTom typeahead, US, 5 results; <3 chars → [] without calling TomTom; 502 on TomTom failure). Weight: `weight_lb` + `weight_mode` cargo (default) | gross, `empty_truck_lb` (default 35,000), optional `axle_count` (2–12) / `axle_weight_lb`. Serializer derives `gross_lb` (sent to TomTom as `vehicleWeight` kg) and `cargo_lb` (risk load rules; gross mode floors at 0). Axle params go to TomTom (`vehicleNumberOfAxles`, `vehicleAxleWeight` kg — names verified live: TomTom 400s unknown params) only when set. Frontend warns (amber, non-blocking) above 80,000 lb gross.
- **Map:** MapLibre + OpenFreeMap tiles (no key), style in `frontend/src/mapStyle.ts` from `map-*` tokens. Vite needs `optimizeDeps.exclude: ["maplibre-gl"]` or the worker 404s in dev.
- **Backend modules:** `tomtom.py` (geocode; `truck_routes` with `maxAlternatives=2`, or one route through a `via`; `detour_vias` = points off the midpoint ±15%/±30% perpendicular; `place_name` reverse geocode), `ranking.py` (pure: `summarize` owned miles per level → `Summary`; `rank` = No Travel last, then severe mi, high mi, avg risk, time; `why` text names the deciding factor vs Route B), `checkpoints.py` (pure: sampling, ETA interpolation, owned miles, paths), `weather.py` (batched Open-Meteo, chunks of 50 × 4 in parallel, own 30 s timeout — cold replies for 100 locations took 12–23 s, LRU cache keyed (lat 2dp, lon 2dp, UTC hour); outage → Unknown readings, not cached), `risk.py`. One httpx client per request is shared by TomTom + Open-Meteo, so tests mock both via one `MockTransport`.
- **Stacked branches:** while CI was down, each issue branch was cut from the previous unmerged one (#10 ← #9, #11 ← #10, #12 ← #11) so work could continue. PR bodies say which commit is theirs; once the base merges, the diff narrows on its own (merge commits, no rebase needed).
- **Units (#11):** `units.ts` `formatter(units)` (distance/interval/wind/rain/snow/weight, metric = km, km/h, mm/hr, cm/hr, kg), `convertText` (rewrites backend imperial text; `{original: true}` keeps "(47 mph)" beside the metric value — used for rules), `lbFromInput` (whole lb). `UnitsContext`/`useUnits()` provides the formatter. Form keeps weights in **pounds** and only displays kg, so toggling never re-rounds. Units remembered in localStorage (`units`), default from locale region (US/LR/MM → imperial). Load-rule reasons now say "> 30,000 lb" so they convert.
- **Frontend:** `LocationField` (ARIA combobox: 250 ms debounce, TanStack Query cache 5 min, ↑↓/Enter/Esc, mousedown pick; picking stores coordinates, typing drops them), `Results` (title/note, No Travel / detour / fewer-routes banners, `RouteCard`s; selecting a card expands to `CheckpointList` + emphasizes that route on the map; clicking a faded route on the map selects it), `format.ts` (shared display formatters), `plan.ts` (API types + `planTrip`), `risk.ts` (level → key/label/lucide icon), `CheckpointDetails` (popover body; copy from Pencil screen 06b), `RouteMap` (risk-colored segments + checkpoint circles; click → Radix popover anchored at the click point; closes on map move).
- **TomTom timing:** `extendedRouteRepresentation=distance&extendedRouteRepresentation=travelTime` returns ~90 sparse `progress` keyframes `{pointIndex, distanceInMeters, travelTimeInSeconds}` per route (not per point) — interpolate checkpoint ETAs between them. Open-Meteo batch (comma lists) returns a list; rain is mm, snowfall cm, wind in mph when `wind_speed_unit=mph`.
- **Local dev:** Django `backend/.venv/Scripts/python manage.py runserver 127.0.0.1:8000`; Vite `npm run dev` in `frontend` (proxies `/api`).
- **Open-Meteo overload (2026-10-19):** it intermittently answers 503 "service is overloaded" or takes ~38 s per 50 locations. We retry a 503/429 once after 1 s; a 3-route plan took ~40 s live. **Vercel risk for deploy:** Python functions default to a short max duration — set `maxDuration` (≥60) in `vercel.json` for `api/index.py` or plans will time out.
- **Detours:** each via attempt is a sequential TomTom call (up to 4) + one reverse geocode; duplicates (distance and time within 1%) and failures are skipped, so <3 routes is possible and the UI says so.
- **Perf note for #15:** Seattle→Miami at 10 mi = 336 checkpoints, ~1 MB JSON (almost all TomTom geometry, 42k points), 4–6 s. Simplify segment geometry for display if 3 routes make it too heavy.
- **Heatmap (#12):** `POST /api/heatmap {points [[lat, lon]…] 1–2000, departure, cargo_lb}` (corridor >1,500 cells → 400 on `points`; coast to coast with detours ≈ 1,150) → `{hours[49], cells [[lon, lat]], levels {risk|wind|rain|snow: [hour][cell] 0–4|null}}` (`heatmap.corridor_grid`: fixed global ~25 mi lattice, cells ≤50 mi from any route point; all-Unknown → 502 "Weather layer didn't load."). Frontend: `useQuery(["heatmap", plan.submittedAt])` after a plan (retry off, staleTime ∞), so scrubbing only indexes `levels[layer][hour]`. `ForecastControls` (layer pill, legend with band bounds in current units, play/slider dock, loading/error chips) lives outside `RouteMap` so App tests cover it; `truckPosition(route, seconds)` interpolates by checkpoint `offset_s`. Trucks are MapLibre DOM `Marker`s with a portaled lucide `Truck`.
- **deck.gl + MapLibre 6:** deck 9.4's interleaved mode reads `map.transform.height`, which MapLibre 6 removed; `RouteMap` shims `map.transform` (`shortcut:` comment) so the heatmap renders interleaved under the routes (`beforeId: "route-casing"`). HeatmapLayer colors by `weight / colorDomain[1]` sampled at texel centers — level k needs weight `k + 0.5`, `colorDomain [0.5, 5]`; `colorDomain[0]` only fades alpha. Per-level alpha rides in `colorRange` (Low faint, hazards strong). Its Gaussian is ~1% at half the radius, so `radiusPixels` ≈ 4 grid cells, recomputed on zoom.
- **Design-system change (2026-10-20, user-approved):** light `risk-moderate` #D9A514→#AD8200 (3.5:1 on white), `risk-high` #D86A12→#E06A10, `risk-severe` #B8241C→#961A22 (High vs Severe 1.81→2.53). Dark values unchanged. Set in the `.pen` variables and `tokens.ts`.
- **Perf note for #15 (heatmap):** cells grow with route length (~1,100 for coast-to-coast) and Open-Meteo cost is per location (50/request, 4 parallel) — long trips can take a minute+. Consider 50 mi spacing for long routes if it's too slow.
- **Design audit (PR #27):** global `box-sizing: border-box`; route card is an `<article>` with a "Route X" button (`aria-pressed`, `aria-describedby` = badges + duration + distance + stats); zero-risk cards say "No severe, high or unknown miles" (never on a No Travel route); hover states; tabular nums; 24px slider thumb.
- **States (#13):** after submit the form collapses to `TripSummary` (trip · meta · Edit); `Planning` skeletons while pending; `/api/plan` 422 with `code: "no_route"` (`tomtom.NoRoute`) → `NoRoute` state + Edit trip; 5xx or network → `Outage` + Try again (re-sends only `/api/plan` with the same body); other 400/422 reopen the form with the field error / alert. Empty state: `FormHead`, two example chips (32,000 lb cargo, next full hour, 25 mi) and the map message. Copy is verbatim from Pencil screens 01/03/10a/10b. The #27 results scroll-into-view was removed — the collapsed form makes results start at the top. Not built: the loading chip "Step 1 of 2 · Getting routes" (one request, no step progress to report).
- **Theme (#14):** `loadTheme`/`saveTheme` in `tokens/theme.ts` (localStorage `theme`, light default per SPEC); `main.tsx` applies it before first paint; header button "Switch to dark/light theme" (moon/sun). `RouteMap` is keyed by theme so the basemap style and heat colors rebuild. MapLibre controls are themed in `global.css`. Dark `color-text-tertiary` → #939A97 (≥4.77:1 on every dark surface).
- **Phones (#14, ≤40em):** header "Truck Routing" + a Settings popover holding units + theme; the sidebar is a bottom sheet (`.body[data-sheet]` sets `--sheet-h`: 62dvh open / ~120px peek; handle button "Trip panel" with aria-expanded); slider dock sits at `--sheet-h` + gap; legend + caption + ticks hidden; layer chips scroll horizontally; checkpoint details open as a fixed bottom sheet (`role=dialog`, Close) instead of the popover; attribution compact top-right, folded. Coarse pointers get 44px segmented items and slider row. Planning resets the sidebar scroll to the top.
- **E2E (#15):** `@playwright/test` 1.63.0 (exact; newer releases were < 2 weeks old). `frontend/playwright.config.ts` builds and serves `vite preview` on :4173; `e2e/smoke.spec.ts` answers `/api/plan` + `/api/heatmap` from fixtures and blocks basemap tiles (no backend, no upstreams), runs desktop 1440 + phone 390, and asserts 3 cards, slider scrub with no refetch, CLS < 0.1, no horizontal scroll, and no page/console errors (this caught the production worker bug). Vitest is scoped to `src/`. CI job `e2e` installs Chromium with deps.
- **Perf (#15, docs/PERF.md):** `frontend/scripts/profile.mjs` profiles Seattle→Miami on the production build (headed, real GPU). Fixes: `setWorkerUrl` (production map was blank), Douglas–Peucker display paths (~15 m; plan 3.0 → 0.49 MB), heatmap `weightsTextureSize: 512` (scrub 24 → 60 fps), heatmap grid widens to 50 mi past 500 cells (Open-Meteo ~600 locations/min) and returns `spacing_mi`.
- **Accuracy:** distance and drive time are TomTom's truck-profile figures (truck weight, departure-time historical traffic). ETAs are non-stop unless the HOS toggle is on.
- **HOS (#31):** form "Rest breaks: Non-stop | US hours of service" (default off) → `/api/plan` `hos`. `checkpoints.hos_elapsed(drive_s)` adds a 30 min break once a shift's driving passes 8 h and a 10 h rest after 11 h (no 14 h window / weekly limits / split sleeper). With HOS on, checkpoint `offset_s` become wall-clock (so ETAs, weather hours and truck positions include stops); route `trip_s` = arrival offset; `stops` = `hos_stops()` (break at 8 h into each shift, rest at 11 h, none at arrival) with `place` from TomTom reverse geocode (parallel; rural stops can be unnamed) and `offset_s`/`start`/`duration_s`. UI: summary "· HOS breaks", note under results, "N breaks · N rests" on cards, `StopList` in the expanded route, coffee/bed markers for the selected route; `truckPosition` parks the truck through a stop.
- **E2E journeys (#37):** `e2e/fixtures.ts` has the `api` fixture (**auto**: every test is mocked, even ones that don't name it, after tests without it silently hit the real backend), reply queues per endpoint, recorded requests, and failure on page errors. `journeys.spec.ts` has 18 journeys × desktop/phone. `live.spec.ts` runs only when `LIVE_URL` is set (`npm run e2e:live`), serially, outside CI. On phones the Settings popover stays open after a choice: close it with a tap outside, not Escape (Escape closes the Undo toast first).
- **Weather cache (#39):** `weather._cache` is keyed by place (lat, lon to 2 dp) and holds the whole hourly `Series` fetched with `forecast_days` ≥ `MIN_FORECAST_DAYS` (4). A later hour past the cached days refetches once with more days. 429/503 are retried after 1 s and 3 s (`RETRY_DELAYS_S`). Real-API check: re-reading 110 places 10 h later made 0 requests (it was ~10 Unknown checkpoints on production).
- Stack versions in use: Django 6.1, DRF 3.18, Python 3.12 (CI); Vite 8, React 19, TS 7, Vitest 5, Node 24.

## Open items for the user
- GitHub Actions incident on 2026-10-19/20: runs queued for hours; nothing can merge until CI runs (PATTERNS rule 12). A CI watcher also once died with "error connecting to api.github.com" — that is the watcher, not a CI failure.
- Vercel project setup (above).
- An empty frame named "Frame" at 0,0 in the `.pen` — user hasn't said whether to delete it.
- Make the repo public before submission (#16).
