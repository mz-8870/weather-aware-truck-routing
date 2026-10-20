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
- **Merge only on green CI for the PR head**: wait until a run for the head SHA exists, then gate the merge on `gh run watch --exit-status` with `&&` (PATTERNS rule 12, entry 24).
- **Reviewer subagents work in temporary worktrees** (another session may hold `C:\dev\wtr-issues`). If one links `node_modules` by junction, remove the junction first (`cmd /c rmdir <link>`, never `/s`): `git worktree remove --force` deletes through it (PATTERNS rule 15).
- **Commit author:** this repo's git config uses `muhammadzeeshan7c@gmail.com` (the mz-8870 GitHub account). Vercel (Hobby) only builds previews for commits by the project owner. Don't change it; the global email stays as is.
- **Don't touch the main checkout's branch** — the user keeps `design/truck-routing.pen` open in Pencil there. Code work happens in the git worktree **`C:\dev\wtr-issues`**.
- **Pencil**: the user must **save (Ctrl+S)** before a `.pen` commit. Read the pen-dev skill (`mcp__pencil__read_skill`) before editing designs.
- Simplest complete change; no speculative features (user's global CLAUDE.md: Karpathy guidelines + "ponytail" lazy-senior style).
- Diagrams → `diagram-design` skill. HTML docs → html-anything `docs-page` layout.

## Where things are
| What | Where |
|---|---|
| Repo | `github.com/mz-8870/weather-aware-truck-routing` (private; `gh` logged in as **mz-8870**) |
| Issues | #1–#16 (original plan), #31 (HOS), #37 (e2e journeys), #39–#42 (production fixes), #49/#50/#52/#53 (features + casing, 2026-10-20); label `ready-for-agent` |
| Live | https://weather-aware-truck-routing-gamma.vercel.app (Vercel project `mz-8870/weather-aware-truck-routing`, connected to GitHub) |
| Live e2e | `cd frontend && LIVE_URL=https://weather-aware-truck-routing-gamma.vercel.app npm run e2e:live` (not in CI) |
| Designs | `design/truck-routing.pen` — Design System (Light, Dark) + screens 01–12 |
| Code worktree | `C:\dev\wtr-issues` |
| UI/UX Pro Max skill | `~/.claude/skills/ui-ux-pro-max` (run scripts without `python -I`) |

## Resume here (2026-10-20, end of day)
**Every planned ticket is done and live**, including #49, #50, #52 and #53 (merged as PRs #55–#58). Nothing is in progress; there are no open PRs. Two items wait on the user (see Open items).

1. **Needs the user:** make the repo public when they say so (`gh repo edit --visibility public --accept-visibility-change-consequences`).
2. **Deploys:** every merge to `main` deploys to production; every PR gets a Vercel preview. Manual: `npx vercel deploy --prod --yes` from the worktree root (linked via `.vercel/`).
3. **Production was tested by hand** (Playwright MCP, 2026-10-20) and its 4 findings were fixed (#39–#42), then re-verified live.
4. **Ideas if the user wants more** (FUTURE_FEATURES.md, by value): NWS severe-weather alerts on the corridor; HOS stops at real truck stops; a shared Redis weather cache (Open-Meteo quota under real load).
5. **Known small gaps:**
   - Audit leftovers: checkpoint details by keyboard (the active checkpoint ring is done, #50), the "Why Low" copy, and dark-mode severe vs high hue distance (1.36:1).
   - On short phones (~667 px) a pin can touch the dock (`shortcut:` in `mapFit.ts`).
   - The weather cache never expires (`shortcut:` in `weather.py`).
6. **Local dev servers are off** (stopped for memory); start them only when needed.
   - Django: `backend/.venv/Scripts/python manage.py runserver 127.0.0.1:8000`.
   - Vite: `npm run dev` in `frontend` (port 5173 by default; earlier sessions used `--port 5179`).
   - Stop Vite before `npm ci` there (it locks `node_modules`); `npm install` repairs around locks.
7. **Headless visual checks:** `@playwright/test` is a dev dependency, so scripts can `import { chromium } from "@playwright/test"` (see `frontend/scripts/profile.mjs`). Pass `--use-angle=swiftshader` for WebGL when headless.

## Status (2026-10-20)
| # | Ticket | State |
|---|---|---|
| 1 | Walking skeleton | ✅ merged (#17) |
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
| 16 | Docs + release | ✅ merged (#33); deployed (#34), auto-deploy from GitHub |
| 37 | E2E user journeys + live tests | ✅ merged (#38) |
| 39 | Weather gaps on re-plan (cache by place) | ✅ merged (#46), verified live |
| 40 | Map overlays hiding routes (fit padding) | ✅ merged (#45), verified live |
| 41 | Phone chip scrollbar | ✅ merged (#44), verified live |
| 42 | Basemap boundary-filter warning | ✅ merged (#43), verified live |
| 49 | Earliest clear departure | ✅ merged (#55) |
| 50 | Route tags on the map + active checkpoint ring | ✅ merged (#56) |
| 52 | Weather-adjusted speed | ✅ merged (#57) |
| 53 | Casing pass (rule 16) | ✅ merged (#58); `.pen` text updated in Pencil, not committed until the user saves |

## Decisions not obvious from the spec
- **Test seams (confirmed):** #1 → `GET /api/health` via Django test client + rendered App with `fetch` stubbed. #5 → only `classify(wind_mph, rain_in_hr, snow_in_hr, cargo_lb, beyond_forecast=False) -> RiskResult(level, reasons, beyond_forecast)`; Unknown is `level=None`.
- **Design tokens** live as Pencil variables (themes `mode: light|dark`): `color-*`, `risk-*` (+ `-subtle`, `risk-on-strong`, `risk-on-warm`), `map-*`, `font-sans` (IBM Plex Sans), `font-mono` (IBM Plex Mono), `text-*`, `space-*`, `radius-*`, `control-height` (44), `duration-*`. Issue #4 generates `tokens.ts` from these.
- **Risk ramp:** Low sage, Moderate yellow, High orange, Severe red, No Travel deep purple, Unknown grey — each with an icon (shield-check, circle-alert, triangle-alert, octagon-alert, ban, circle-dashed).
- **Convert units at the boundary and round** before classifying (float error at thresholds — see PATTERNS_REVIEW rule 10).
- **Routing vendor is TomTom**, not HERE (HERE signup needed a card; user declined). Key lives in `backend/.env` as `TOMTOM_API_KEY` (gitignored). Free tier ~2,500 req/day. No route → TomTom 400 `NO_ROUTE_FOUND` → our 422. Denver→Chicago returns only 2 routes, so the spec’s via-point fallback for <3 routes will be needed in #8.
- **`/api/plan` (as of #8):** `POST {origin, destination, departure ISO, weight_lb, interval_mi 10|25|50 (default 25)}` → `{routes (best first, named Route A/B/C), recommended: 0|null, why, routes_found, cargo_lb}`; each route `{name, distance_mi, duration_s, synthesized, detour_via, summary:{severe_mi, high_mi, unknown_mi, notravel_mi, avg_risk}, checkpoints:[{mile, lat, lon, offset_s, eta, level 0–4|null, reasons, beyond_forecast, wind_mph, gust_mph, rain_in_hr, snow_in_hr, owned_mi}], segments:[{level, coordinates}]}`. 400 field errors, 422 `{detail}` (place not found / no route), 502 TomTom down. Optional `origin_position` / `destination_position` `[lat, lon]` (from autosuggest) skip text geocoding; typed text still falls back to US-only fuzzy geocoding. `GET /api/geocode?q=` → `{suggestions:[{label, kind, lat, lon}]}` (TomTom typeahead, US, 5 results; <3 chars → [] without calling TomTom; 502 on TomTom failure). Weight: `weight_lb` + `weight_mode` cargo (default) | gross, `empty_truck_lb` (default 35,000), optional `axle_count` (2–12) / `axle_weight_lb`. Serializer derives `gross_lb` (sent to TomTom as `vehicleWeight` kg) and `cargo_lb` (risk load rules; gross mode floors at 0). Axle params go to TomTom (`vehicleNumberOfAxles`, `vehicleAxleWeight` kg — names verified live: TomTom 400s unknown params) only when set. Frontend warns (amber, non-blocking) above 80,000 lb gross.
- **Map:** MapLibre + OpenFreeMap tiles (no key), style in `frontend/src/mapStyle.ts` from `map-*` tokens. MapLibre's worker: `setWorkerUrl` with the `?url` asset in `RouteMap.tsx` (production builds were blank without it); `optimizeDeps.exclude: ["maplibre-gl"]` stays in the Vite config for dev. The boundary filter coalesces a missing `admin_level` (#42).
- **Backend modules:** `tomtom.py` (geocode; `truck_routes` with `maxAlternatives=2`, or one route through a `via`; `detour_vias` = points off the midpoint ±15%/±30% perpendicular; `place_name` reverse geocode), `ranking.py` (pure: `summarize` owned miles per level → `Summary`; `rank` = No Travel last, then severe mi, high mi, avg risk, time; `why` text names the deciding factor vs Route B), `checkpoints.py` (pure: sampling, ETA interpolation, owned miles, paths), `weather.py` (batched Open-Meteo, chunks of 50 × 4 in parallel, own 30 s timeout — cold replies for 100 locations took 12–23 s, LRU cache of whole hourly series per place (lat 2dp, lon 2dp), see Weather cache (#39); outage → Unknown readings, not cached), `risk.py`. One httpx client per request is shared by TomTom + Open-Meteo, so tests mock both via one `MockTransport`.
- **Stacked branches:** while CI was down, each issue branch was cut from the previous unmerged one (#10 ← #9, #11 ← #10, #12 ← #11) so work could continue. PR bodies say which commit is theirs; once the base merges, the diff narrows on its own (merge commits, no rebase needed).
- **Units (#11):** `units.ts` `formatter(units)` (distance/interval/wind/rain/snow/weight, metric = km, km/h, mm/hr, cm/hr, kg), `convertText` (rewrites backend imperial text; `{original: true}` keeps "(47 mph)" beside the metric value — used for rules), `lbFromInput` (whole lb). `UnitsContext`/`useUnits()` provides the formatter. Form keeps weights in **pounds** and only displays kg, so toggling never re-rounds. Units remembered in localStorage (`units`), default from locale region (US/LR/MM → imperial). Load-rule reasons now say "> 30,000 lb" so they convert.
- **Frontend:** `LocationField` (ARIA combobox: 250 ms debounce, TanStack Query cache 5 min, ↑↓/Enter/Esc, mousedown pick; picking stores coordinates, typing drops them), `Results` (title/note, No Travel / detour / fewer-routes banners, `RouteCard`s; selecting a card expands to `CheckpointList` + emphasizes that route on the map; clicking a faded route on the map selects it), `format.ts` (shared display formatters), `plan.ts` (API types + `planTrip`), `risk.ts` (level → key/label/lucide icon), `CheckpointDetails` (popover body; copy from Pencil screen 06b), `RouteMap` (risk-colored segments + checkpoint circles; click → Radix popover anchored at the click point; closes on map move).
- **TomTom timing:** `extendedRouteRepresentation=distance&extendedRouteRepresentation=travelTime` returns ~90 sparse `progress` keyframes `{pointIndex, distanceInMeters, travelTimeInSeconds}` per route (not per point) — interpolate checkpoint ETAs between them. Open-Meteo batch (comma lists) returns a list; rain is mm, snowfall cm, wind in mph when `wind_speed_unit=mph`.
- **Local dev:** Django `backend/.venv/Scripts/python manage.py runserver 127.0.0.1:8000`; Vite `npm run dev` in `frontend` (proxies `/api`).
- **Open-Meteo overload (2026-10-19):** it intermittently answers 503 "service is overloaded" or takes ~38 s per 50 locations. 503/429 are now retried after 1 s and 3 s, and the per-place cache (#39) avoids most repeat calls. `vercel.json` sets `maxDuration: 60` for `api/index.py`.
- **Detours:** each via attempt is a sequential TomTom call (up to 4) + one reverse geocode; duplicates (distance and time within 1%) and failures are skipped, so <3 routes is possible and the UI says so.
- **Heatmap (#12):** `POST /api/heatmap {points [[lat, lon]…] 1–2000, departure, cargo_lb}` (25 mi grid; past 500 cells it widens to 50 mi, and over 500 even then → 400 on `points`; coast to coast is about 300 cells at 50 mi) → `{hours[49], spacing_mi, cells [[lon, lat]], levels {risk|wind|rain|snow: [hour][cell] 0–4|null}}` (`heatmap.corridor_grid`: fixed global ~25 mi lattice, cells ≤50 mi from any route point; all-Unknown → 502 "Weather layer didn't load."). Frontend: `useQuery(["heatmap", plan.submittedAt])` after a plan (retry off, staleTime ∞), so scrubbing only indexes `levels[layer][hour]`. `ForecastControls` (layer pill, legend with band bounds in current units, play/slider dock, loading/error chips) lives outside `RouteMap` so App tests cover it; `truckPosition(route, seconds)` interpolates by checkpoint `offset_s`. Trucks are MapLibre DOM `Marker`s with a portaled lucide `Truck`.
- **deck.gl + MapLibre 6:** deck 9.4's interleaved mode reads `map.transform.height`, which MapLibre 6 removed; `RouteMap` shims `map.transform` (`shortcut:` comment) so the heatmap renders interleaved under the routes (`beforeId: "route-casing"`). HeatmapLayer colors by `weight / colorDomain[1]` sampled at texel centers — level k needs weight `k + 0.5`, `colorDomain [0.5, 5]`; `colorDomain[0]` only fades alpha. Per-level alpha rides in `colorRange` (Low faint, hazards strong). Its Gaussian is ~1% at half the radius, so `radiusPixels` ≈ 4 grid cells, recomputed on zoom.
- **Design-system change (2026-10-20, user-approved):** light `risk-moderate` #D9A514→#AD8200 (3.5:1 on white), `risk-high` #D86A12→#E06A10, `risk-severe` #B8241C→#961A22 (High vs Severe 1.81→2.53). Dark values unchanged. Set in the `.pen` variables and `tokens.ts`.
- **Design audit (PR #27):** global `box-sizing: border-box`; route card is an `<article>` with a "Route X" button (`aria-pressed`, `aria-describedby` = badges + duration + distance + stats); zero-risk cards say "No severe, high or unknown miles" (never on a No Travel route); hover states; tabular nums; 24px slider thumb.
- **States (#13):** after submit the form collapses to `TripSummary` (trip · meta · Edit); `Planning` skeletons while pending; `/api/plan` 422 with `code: "no_route"` (`tomtom.NoRoute`) → `NoRoute` state + Edit trip; 5xx or network → `Outage` + Try again (re-sends only `/api/plan` with the same body); other 400/422 reopen the form with the field error / alert. Empty state: `FormHead`, two example chips (32,000 lb cargo, next full hour, 25 mi) and the map message. Copy is verbatim from Pencil screens 01/03/10a/10b. The #27 results scroll-into-view was removed — the collapsed form makes results start at the top. Not built: the loading chip "Step 1 of 2 · Getting routes" (one request, no step progress to report).
- **Theme (#14):** `loadTheme`/`saveTheme` in `tokens/theme.ts` (localStorage `theme`, light default per SPEC); `main.tsx` applies it before first paint; header button "Switch to dark/light theme" (moon/sun). `RouteMap` is keyed by theme so the basemap style and heat colors rebuild. MapLibre controls are themed in `global.css`. Dark `color-text-tertiary` → #939A97 (≥4.77:1 on every dark surface).
- **Phones (#14, ≤40em):** header "Truck Routing" + a Settings popover holding units + theme; the sidebar is a bottom sheet (`.body[data-sheet]` sets `--sheet-h`: 45dvh open (Pencil 12a, since #40) / ~120px peek; handle button "Trip panel" with aria-expanded); slider dock sits at `--sheet-h` + gap; legend + caption + ticks hidden; layer chips scroll horizontally; checkpoint details open as a fixed bottom sheet (`role=dialog`, Close) instead of the popover; attribution compact top-right, folded. Coarse pointers get 44px segmented items and slider row. Planning resets the sidebar scroll to the top.
- **E2E (#15):** `@playwright/test` 1.63.0 (exact; newer releases were < 2 weeks old). `frontend/playwright.config.ts` builds and serves `vite preview` on :4173; `e2e/smoke.spec.ts` answers `/api/plan` + `/api/heatmap` from fixtures and blocks basemap tiles (no backend, no upstreams), runs desktop 1440 + phone 390, and asserts 3 cards, slider scrub with no refetch, CLS < 0.1, no horizontal scroll, and no page/console errors (this caught the production worker bug). Vitest is scoped to `src/`. CI job `e2e` installs Chromium with deps.
- **Perf (#15, docs/PERF.md):** `frontend/scripts/profile.mjs` profiles Seattle→Miami on the production build (headed, real GPU). Fixes: `setWorkerUrl` (production map was blank), Douglas–Peucker display paths (~15 m; plan 3.0 → 0.49 MB), heatmap `weightsTextureSize: 512` (scrub 24 → 60 fps), heatmap grid widens to 50 mi past 500 cells (Open-Meteo ~600 locations/min) and returns `spacing_mi`.
- **Accuracy:** distance and drive time are TomTom's truck-profile figures (truck weight, departure-time historical traffic). ETAs are non-stop unless the HOS toggle is on.
- **HOS (#31):** form "Rest Breaks: Non-Stop | US Hours of Service" (default off) → `/api/plan` `hos`. `checkpoints.hos_elapsed(drive_s)` adds a 30 min break once a shift's driving passes 8 h and a 10 h rest after 11 h (no 14 h window / weekly limits / split sleeper). With HOS on, checkpoint `offset_s` become wall-clock (so ETAs, weather hours and truck positions include stops); route `trip_s` = arrival offset; `stops` = `hos_stops()` (break at 8 h into each shift, rest at 11 h, none at arrival) with `place` from TomTom reverse geocode (parallel; rural stops can be unnamed) and `offset_s`/`start`/`duration_s`. UI: summary "· HOS breaks", note under results, "N breaks · N rests" on cards, `StopList` in the expanded route, coffee/bed markers for the selected route; `truckPosition` parks the truck through a stop.
- **E2E journeys (#37):** `e2e/fixtures.ts` has the `api` fixture (**auto**: every test is mocked, even ones that don't name it, after tests without it silently hit the real backend), reply queues per endpoint, recorded requests, and failure on page errors. `journeys.spec.ts` has 18 journeys × desktop/phone. `live.spec.ts` runs only when `LIVE_URL` is set (`npm run e2e:live`), serially, outside CI. On phones the Settings popover stays open after a choice: close it with a tap outside, not Escape (Escape closes the Undo toast first).
- **Weather cache (#39):** `weather._cache` is keyed by place (lat, lon to 2 dp) and holds the whole hourly `Series(days, fetched_on, hourly)`, fetched with `forecast_days` ≥ `MIN_FORECAST_DAYS` (4).
  - `_covers()` decides reuse. An hour past a series' end is refetched unless today's fetch already went that far, because a series from an earlier UTC day ends a day short.
  - 429/503 are retried after 1 s and 3 s (`RETRY_DELAYS_S`). `CACHE_SIZE` is 2,000 places (≤ ~150 MB).
  - Live: an HOS re-plan right after a plan went from 36.5 s with 229 mi Unknown to 2.9 s with none.
- **Map framing (#40):** `mapFit.fitPadding({phone, sheet, viewportHeight, mapWidth, mapHeight})` reserves room for what covers the map, plus half a pin on every side.
  - Desktop: the layer toggle, legend and slider dock. Phone: the chips, dock and sheet.
  - On maps too small for that padding, it scales opposite sides down to keep a `min(size/2, 160)` px box; MapLibre otherwise refuses to fit.
  - `RouteMap` re-fits when `sheet` changes.
  - E2E: pins must not sit under any overlay (northeast fixture route), and a 768 px tablet journey must frame the trip.
- **Earliest clear departure (#49):** `/api/plan` adds `earliest_clear_departure` (`{hours_later, departure, route}` or `null`). Only when every route is blocked, one `weather.readings` batch covers departures +1…+48 h (`CLEAR_SEARCH_H`) on the same checkpoints, `views._classify` classifies each hour's slice, and `ranking.earliest_clear` stops at the first hour `rank` recommends; the weather cache answers it, so no routing calls and no repeat Open-Meteo fetches. The traffic-dependent TomTom drive time is not recomputed for the later hour. UI: the all-blocked banner body names the time and route, and a "Leave N h Later" button re-plans with that departure (the form's Departure updates too).
- **Route tags (#50):** `mapFit.labelPoints(paths)` gives one `[lon, lat]` per route: route i searches the i-th of n slices of the 20–80% window (by distance), so tags never stack where routes run together, and takes the point farthest from the other routes. `RouteMap` draws them as DOM `Marker`s (anchor bottom, 14 px up to clear the ring; `pointer-events: none`; `aria-hidden`, the cards carry the names), styled from Pencil 04 (selected = brand fill). The open checkpoint gets a ring from the `checkpoint-active` circle layer, whose filter follows `popup.index`. E2E: tags must not sit under any overlay (`markersHiddenBy(page, "tags")`).
- **Weather speed (#52):** `views.SPEED_FACTOR` by level; `checkpoints.slowed(cps, factors)` stretches each span by the factors of the two checkpoints owning its halves. `_plan_json` classifies once at TomTom's ETAs (pass 1), slows the drive offsets, swaps `route.duration_s` for the slowed time (ranking uses it), applies HOS, then classifies again at the slowed ETAs; when nothing slowed, pass 2 reuses pass 1's readings. `hos_stops(..., keys=(miles, seconds))` places stops on the slowed timing. Response: route `weather_delay_s`; cards show "+42 min weather"; a results note lists the factors. The #49 departure search shifts the plan's slowed ETAs as they are (no re-slowing per hour).
- **Casing (#53, PATTERNS rule 16):** labels (buttons, field labels, headings, options, legend items, aria-labels) are Title Case; banners, empty states, status chips, notes, errors and metadata captions ("every 25 mi", "arrives …") stay sentence case. "No Travel" is a level name, capitalized everywhere. The HOS stop tooltip lowercases the Title Case stop label. TomTom place kinds use `str.title()`.
- **Phone chips (#41):** `scrollbar-width: none` plus `::-webkit-scrollbar` on the chip row; it still scrolls.
- **E2E infra:** `reuseExistingServer: false`. A concurrent run's preview on :4173 made tests silently run against another build; a clash now fails loudly. Run e2e one at a time.
- **Deploy (#34):**
  - `vercel.json` needs `"framework": null`; otherwise Vercel treats it as a Python framework app and skips the Python install.
  - Runtime deps live in the root `requirements.txt` (Vercel can't follow `-r`), and `backend/requirements.txt` includes it.
  - `.vercelignore` keeps `backend/.env` and virtualenvs out of uploads.
- Stack versions in use: Django 6.1, DRF 3.18, Python 3.12 (CI); Vite 8, React 19, TS 7, Vitest 5, Node 24.

## Open items for the user
- Make the repo public when ready (only the user can decide).
- **Speed factors (#52):** confirm or change Moderate 0.90 / High 0.75 / Severe 0.60 (`views.SPEED_FACTOR`, SPEC marks them pending).
- **`.pen` casing edits (#53):** 131 labels were updated in the open design. The user must save (Ctrl+S); the main checkout's `.pen` already had uncommitted edits from before, so ask whether to commit them together.
- An empty frame named "Frame" at 0,0 in the `.pen`: the user hasn't said whether to delete it.
