# Performance profile (#15)

Recorded 2026-10-20 with `frontend/scripts/profile.mjs` on a production build (`vite preview`) with the real backend, in headed Chromium on integrated graphics (Intel UHD, ANGLE/D3D11) at 1440×900.

**Trip:** Seattle, WA → Miami, FL. Three routes of about 3,340–3,620 mi, 425 checkpoints at 25 mi spacing, 32,000 lb cargo.

| Measure | Result |
|---|---|
| Plan (routes + checkpoint weather) | 12.7 s, 0.49 MB |
| Heatmap (49 h × 314 cells, 50 mi grid) | ready 14 s after submit, 0.13 MB |
| Slider scrub (drag 0 → 48 h → 0, ~8 s) | **60.1 fps**, p95 16.8 ms, max 16.9 ms, 0 frames > 50 ms |
| Map pan (90 drag steps) | **58–60 fps**, p95 16.8 ms, at most 1 frame > 50 ms |
| Layout shift when results and heatmap load | CLS < 0.1, asserted by the e2e smoke test |

![Seattle → Miami](perf-seattle-miami.png)

## What the profile found and fixed

1. **Blank map in production builds.** MapLibre 6 looks for `maplibre-gl-worker.mjs` next to its own module, and bundling moves that module. The worker 404'd, so no tiles or routes drew; only the DOM markers did. Dev worked because of `optimizeDeps.exclude`. Fix: `setWorkerUrl` with the `?url` asset. The smoke test now fails on page errors.
2. **Plan payload 3.0 MB → 0.49 MB.** TomTom returns tens of thousands of geometry points. Each checkpoint's display path is now simplified with Douglas–Peucker at ~15 m tolerance. ETAs and mileage still use the full geometry. This keeps long trips well under Vercel's 4.5 MB response limit.
3. **Scrub 24 fps → 60 fps.** Every slider step re-aggregates the heatmap on the GPU, and the main thread was ~88% idle. deck's default 2048² float weights texture was the cost. The field is blurred anyway, so `weightsTextureSize: 512` looks the same at 1/16 of the work.
4. **Unknown holes on long corridors.** A 25 mi grid needs ~1,150 locations coast to coast. That exceeds Open-Meteo's free tier (~600 locations/min, shared with the plan's checkpoint weather), so the overflow came back Unknown. Past 500 cells the grid widens to 50 mi (~300 cells); the response carries `spacing_mi`, and the blur radius scales with it.

## Not addressed

- The plan takes ~13 s cross-country. Most of it is TomTom plus up to four detour calls and Open-Meteo for 425 checkpoints. Caching makes repeats fast.
- Repeated long trips within a minute can still exhaust Open-Meteo's quota. The affected cells show no heat; they are not drawn as Low.
