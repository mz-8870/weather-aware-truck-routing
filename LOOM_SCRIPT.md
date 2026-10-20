# Loom walkthrough script (about 8 minutes)

The script is mapped to the brief's grading: **40% logic, 40% UI/map/heatmap smoothness, 15% code quality, 5% docs**. Timings are targets. Have the app open with the backend running, a dev-tools tab ready, and the repo open in an editor.

## 0:00 – 0:30 · What it is
- "Truck drivers don't drive through today's weather. They drive through the weather at mile 400, eight hours from now. This app plans truck routes and checks the forecast where the truck will be, when it gets there."
- Show the empty state: the "Plan a trip" form, the map message and the example trips.

## 0:30 – 3:30 · Logic (40%)
1. **Plan.** Click the **Denver → Salt Lake City · winter storm** example.
   - "TomTom truck routing gives up to three routes. If it returns fewer, I add a via-point detour and say so."
   - Point at the **Simulated weather** banner. "To be clear about what's real: the routes, distances and drive times are live TomTom results. The weather in this example is a scripted storm over I-80, so you can see a bad day on any day. Your own trips use the live Open-Meteo forecast."
2. **Checkpoints and ETAs.** Expand Route A.
   - Checkpoints run every 25 mi. "Each ETA is interpolated from TomTom's own distance and time keyframes, so it uses the truck profile and historical traffic for the departure."
   - Open a checkpoint: wind, gusts, rain, snow, the level, and **the rule that set it**.
3. **Rules.** Walk through the README table:
   - the worst of wind, rain and snow
   - the load rules (wind 45–55 mph with cargo over 30,000 lb is No Travel; 35–45 mph with over 40,000 lb is Severe)
   - Unknown when data is missing
   - "Units are converted and rounded at the boundary, so 0.1 in/hr never becomes 0.0999 and drops a band. There are tests at every threshold."
4. **Weight.** Switch to Gross and open Advanced.
   - "TomTom routes on gross weight. The risk rules use cargo." Mention the warning over 80,000 lb.
5. **Recommendation.** Return to all routes. Read the No Travel banner on the I-80 route, the High miles and weather delay on US-40, and the "why" line on the recommended I-70 route.
   - "Ranking is No Travel last, then severe miles, then high miles, then average risk, then time. The UI names the deciding factor."
6. **Hours of service.** Click Edit, set **Rest Breaks: US Hours of Service** and re-plan.
   - "Arrival moves by the breaks, and the weather is re-checked at the new hours."
   - Show the stops list (break and rest, milepost, nearest town, time) and the markers on the map.
7. **Errors.** Plan Denver → Honolulu to show "No drivable route found". Mention the outage state with Try Again, and that Retry re-sends only the failed request.

## 3:30 – 6:30 · UI, map and heatmap smoothness (40%)
1. **Heatmap.** Switch Risk → Wind → Snow; the legend and the band limits follow.
   - "One request fetches 49 hours for the whole corridor. The slider only indexes into it."
2. **Scrub.** Drag the slider and press Play. The trucks move along their routes and park at HOS stops.
   - Show the dev-tools Network tab: **no requests while scrubbing**.
3. **Cross-country.** Plan Seattle → Miami.
   - "It holds 60 fps scrubbing on integrated graphics. The heatmap was GPU-bound, and shrinking deck's weights texture fixed it."
   - Pan the map. "The grid widens to 50 mi on long corridors, to stay inside Open-Meteo's rate limit."
   - Point at [docs/PERF.md](docs/PERF.md).
4. **Map polish.**
   - The heatmap sits under the route lines.
   - The selected route is emphasized; clicking a faded one selects it.
   - Origin and destination pins are shown.
5. **Units and theme.** Toggle Metric (with Undo) and dark mode. The basemap follows the theme.
6. **Phone.** Resize to 390 px:
   - the bottom sheet with its handle
   - the slider docked above it
   - checkpoint details as a sheet
   - the settings menu
7. **Design.** Briefly show the Pencil file: the design system (tokens with a colorblind-safe risk ramp, each level paired with an icon) and screens 01–12, built before any UI code.

## 6:30 – 7:45 · Code quality (15%)
- **Structure:**
  - Pure domain modules (`checkpoints`, `risk`, `ranking`, `heatmap`) with no Django in them.
  - Thin views.
  - One httpx client per request, mocked at the HTTP boundary in tests.
- **Tests:**
  - about 190 pytest tests and 80 Vitest tests
  - a Playwright smoke test on the **production build** (desktop and phone) that fails on page errors, layout shift or refetching
  - all in GitHub Actions
- **Process:**
  - test-first per ticket
  - a reviewer pass on every PR before merging
  - [docs/PATTERNS_REVIEW.md](docs/PATTERNS_REVIEW.md) logs every mistake and the rule it produced. One example: a blank map in production builds that only a production-build check could catch.
- **Design tokens** flow from Pencil to `tokens.ts` to CSS variables and deck.gl colors. Stylelint bans raw colors and px.

## 7:45 – 8:15 · Docs (5%) and close
- The README: setup, the architecture diagram, every rule and assumption, and the API contract. [FUTURE_FEATURES.md](FUTURE_FEATURES.md) covers earliest clear departure, the full HOS model, alerts, and a shared cache.
- "Thanks for watching."
