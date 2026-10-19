# Patterns Review — mistakes log

A running log of mistakes made while building this project, so they are not repeated.
**Read this before starting any ticket.** Add an entry every time a mistake is caught (by the user, CI, a review, or yourself).

Severity: 🔴 critical (breaks trust, data, or a user rule) · 🟠 repeated (happened 2+ times) · 🟡 one-off

## Rules distilled from the log

1. Never add AI attribution (`Co-Authored-By: Claude`, "Generated with Claude Code") to commits or PRs.
2. Never invent product names, copy, or data the user didn't approve — use the spec's wording.
3. Pencil keeps edits in memory: ask the user to **save (Ctrl+S)** before committing a `.pen` file, and check the file size/mtime changed.
4. Never switch branches or edit code in the main checkout (`C:\dev\weather-aware-truck-routing`) — Pencil has the `.pen` open there. Code work happens in the worktree `C:\dev\wtr-issues`.
5. Every ticket follows Matt Pocock `implement` + `tdd`: agree seams first, red → green one test at a time, then a code review before the PR. Subagent prompts must include these rules up front, not mid-run.
6. Pencil text that can wrap needs `textGrowth: "fixed-width"` + `width: "fill_container"`; check long strings (trip summary, banner titles) at the narrowest width.
7. Verify icon names exist in the library before using them (lucide: `circle-dashed` works, `circle-help`/`help-circle` did not).
8. Demo data must be consistent across screens (same checkpoint numbers, miles, ETAs for the same trip).
9. Contrast: light colors (yellow, orange, grey) carry dark text — use `risk-on-warm`, never white.
10. Unit conversions near a threshold must not flip a band through float error (e.g. cm→in giving 0.0999999 instead of 0.10) — round at the conversion boundary and test the exact threshold values. Display at the classifier's precision too (24.6 mph must not show as "25 mph").
12. Before merging, confirm CI ran **on the head commit**: `gh pr checks --watch` returns instantly with "no checks reported" if the run hasn't been created yet — wait for the run (`gh run watch`) instead of merging on that.
14. Check map/render work in a **production build** (`vite build` + `vite preview`), not only the dev server — dev-only config (e.g. `optimizeDeps.exclude`) can hide production failures.
13. Judge a check by its **exit code**, not a grepped summary line: Vitest can print "30 passed" and still exit 1 on an unhandled error.
11. Scripted file edits on Windows: run Python with `PYTHONUTF8=1` (or `encoding="utf-8"`) — the default cp1252 silently fails to match `—`, `·`, `→`.

## Log

| # | Date | Sev | What happened | Root cause | Prevention |
|---|---|---|---|---|---|
| 1 | 2026-10-19 | 🟡 | Design page eyebrow used an invented product name "ROUTEWISE" | Filled a gap with made-up branding | Rule 2 |
| 2 | 2026-10-19 | 🟡 | Ran the UI/UX Pro Max script with `python -I` → `ModuleNotFoundError` | `-I` drops the script dir from `sys.path`; it's for untrusted downloads, not installed skills | Use `-I` only for untrusted code; trusted skill scripts run normally |
| 3 | 2026-10-19 | 🟠 | Lucide icon names not found (`circle-help`, then `help-circle`) | Guessed names | Rule 7 |
| 4 | 2026-10-19 | 🟡 | White text on yellow/orange/grey risk swatches (poor contrast) | Single `risk-on-strong` token for all levels | Rule 9 — added `risk-on-warm` |
| 5 | 2026-10-19 | 🟡 | Spacing bars invisible (width bound to a number variable on a rectangle) | Variable width on a shape didn't render | Use literal sizes for spec-sheet illustrations |
| 6 | 2026-10-19 | 🟡 | `Move(node, parent, 99)` failed (index out of range) | Assumed index clamps | Omit the index to append |
| 7 | 2026-10-19 | 🔴 | Tried to commit the design before it was saved → "nothing to commit" | Pencil edits live in memory until saved | Rule 3 |
| 8 | 2026-10-19 | 🟠 | Text overflow: banner title and trip-summary meta clipped | `textGrowth: auto` in a fixed-width container | Rule 6 |
| 9 | 2026-10-19 | 🟡 | Checkpoint numbering jumped 1,2,3,6,7… and popover said "Checkpoint 3 · mile 175" | Hand-typed sample data | Rule 8 |
| 10 | 2026-10-19 | 🟠 | Subagent skipped strict TDD on #1 and skipped the code-review step | TDD instructions arrived mid-run; review step not in the original prompt | Rule 5 |
| 11 | 2026-10-19 | 🟡 | CI ran twice per PR (`push` + `pull_request` with no branch filter) | Default trigger copy-paste | `push: branches: [main]` + `pull_request` |
| 12 | 2026-10-19 | 🟡 | Pencil MCP reported "no file open" while the user had it open | File opened from the old path / not the active tab | Confirm with `get_app_state` and tell the user exactly which path to open |
| 13 | 2026-10-19 | 🟡 | #6: wrote `/api/plan` validation and 502/422 branches before their tests | Implemented the whole view in one pass after the first red test | Rule 5; when it slips, break each branch on purpose and confirm its test fails (done for #6) |
| 14 | 2026-10-19 | 🟡 | #7: a Python replace on `CheckpointDetails.tsx` didn't match because the file has `—` | Windows Python opens files as cp1252 by default | Rule 11 (assert the match so it fails loudly — it did) |
| 15 | 2026-10-19 | 🟡 | #7: popover showed wind 7.6 as "8 mph" while the rule said 7.6 | Display rounding differed from classifier precision | Rule 10 extended |
| 16 | 2026-10-19 | 🟠 | Merged PR #22 before CI ran on its last (nit-fix) commit | `gh pr checks --watch` printed "no checks reported" (run not yet created) and the chained merge ran anyway | Rule 12; local checks had passed, CI on main confirmed afterwards |
| 17 | 2026-10-19 | 🔴 | #10: `npm test` exited 1 (unhandled error) while I reported "30 passed"; the reviewer caught it | I grepped only the `Tests` line; the test stub reused one `Response`, so a second submit read a consumed body | Rule 13; stub returns `response.clone()` |
| 18 | 2026-10-20 | 🟡 | #12: heatmap Low cells rendered olive (between Low and Moderate) | Assumed deck's `colorDomain` maps min→first color; it maps `value / max` onto texel centers | Read the shader before trusting a color-scale prop; verify colors in a screenshot |
| 19 | 2026-10-20 | 🟡 | #12: interleaved deck overlay threw every frame on MapLibre 6 | deck 9.4 reads `map.transform`, removed in MapLibre 6 | Check the browser console after adding a map library integration, not just tests |
| 20 | 2026-10-20 | 🟡 | #13: a Windows path in a scripted HANDOFF edit (`%LOCALAPPDATA%\npm-cache\…\node_modules`) was written with real newlines | `\n` inside a non-raw Python string became a newline | Rule 11: write Windows paths in scripted edits with raw strings (`r"…"`), then grep the result |
| 21 | 2026-10-20 | 🟡 | #13: plan errors outside the listed statuses (e.g. 429, or no-route after Edit mid-request) showed nothing | Error routing listed the cases to handle instead of defaulting to the visible one | Route errors by exclusion: special states for known codes, everything else falls back to a visible message |
| 22 | 2026-10-20 | 🔴 | Production builds showed a blank map (MapLibre worker 404) since #6; every visual check had used the dev server | `optimizeDeps.exclude` fixed dev only; no check ever ran the built bundle | Rule 14; the e2e smoke test now runs `vite preview` and fails on page errors |
| 23 | 2026-10-20 | 🟡 | First perf profile reported 60 fps scrubbing while the map drew nothing | Measured frames without checking the screenshot/console | Look at the screenshot and console of every profiling run before trusting its numbers |
| 24 | 2026-10-20 | 🟡 | Merged docs PR #35 while its CI run was still in progress | The CI wait looked up the run before GitHub had created it, `gh run watch` got no ID and exited 1, and the merge didn't depend on that exit code | Rule 12: wait until a run for the head SHA exists, and chain the merge with `&&` on the watch's exit code |
