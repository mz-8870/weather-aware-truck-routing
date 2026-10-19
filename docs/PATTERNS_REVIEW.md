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
10. Unit conversions near a threshold must not flip a band through float error (e.g. cm→in giving 0.0999999 instead of 0.10) — round at the conversion boundary and test the exact threshold values.

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
