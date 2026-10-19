# Handoff — Weather-Aware Truck Routing

Give this file to a new Claude Code session. Start the session **in `C:\dev\weather-aware-truck-routing`**.

## Read first (in order)
1. `docs/SPEC.md` — the agreed spec. Every rule, threshold and convention was decided with the user; do not re-litigate.
2. `docs/PATTERNS_REVIEW.md` — mistakes already made and the rules that prevent them. Add to it when you slip.
3. `docs/fs-assessment-spotter.pdf` — the original brief (grading: 40% logic, 40% UI/map/heatmap smoothness, 15% code quality, 5% docs).

## Non-negotiable rules
- **No AI attribution** in commits or PRs (no `Co-Authored-By: Claude`, no "Generated with Claude Code").
- **TDD with Matt Pocock's `implement` + `tdd` skills**: agree seams with the user before writing tests; red → green one test at a time at public interfaces; typecheck + single test files often, full suite at the end; code review before opening the PR; commit to the issue branch.
- **One issue at a time**, in dependency order. Branch `issue-<n>-<slug>`, PR body "Closes #n". Don't merge without the user's OK.
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
| 1 | Walking skeleton | PR #17 open, CI green, reviewed. **Vercel deploy needs the user** (import repo in Vercel; env `SECRET_KEY`, `DEBUG=false`, `ALLOWED_HOSTS=.vercel.app`). Verify the `/api/*` rewrite reaches Django on first deploy. |
| 2 | Design system (Gate 1) | ✅ approved, closed |
| 3 | Screens (Gate 2) | Designs committed; awaiting/confirm user approval, then close |
| 4 | Tokens in code | Next up (blocked by #1 merge or branch from it) |
| 5 | Risk engine | PR #18 open (based on #17), CI green, reviewed. Seams confirmed by user. |
| 6–16 | — | Not started |

## Decisions not obvious from the spec
- **Test seams (confirmed):** #1 → `GET /api/health` via Django test client + rendered App with `fetch` stubbed. #5 → only `classify(wind_mph, rain_in_hr, snow_in_hr, cargo_lb, beyond_forecast=False) -> RiskResult(level, reasons, beyond_forecast)`; Unknown is `level=None`.
- **Design tokens** live as Pencil variables (themes `mode: light|dark`): `color-*`, `risk-*` (+ `-subtle`, `risk-on-strong`, `risk-on-warm`), `map-*`, `font-sans` (IBM Plex Sans), `font-mono` (IBM Plex Mono), `text-*`, `space-*`, `radius-*`, `control-height` (44), `duration-*`. Issue #4 generates `tokens.ts` from these.
- **Risk ramp:** Low sage, Moderate yellow, High orange, Severe red, No Travel deep purple, Unknown grey — each with an icon (shield-check, circle-alert, triangle-alert, octagon-alert, ban, circle-dashed).
- **Convert units at the boundary and round** before classifying (float error at thresholds — see PATTERNS_REVIEW rule 10).
- Stack versions in use: Django 6.1, DRF 3.18, Python 3.12 (CI); Vite 8, React 19, TS 7, Vitest 5, Node 24.

## Open items for the user
- Merge PRs #17 then #18 (or OK to merge).
- Vercel project setup (above).
- An empty frame named "Frame" at 0,0 in the `.pen` — user hasn't said whether to delete it.
- Make the repo public before submission (#16).
