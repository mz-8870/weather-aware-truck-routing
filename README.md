# Weather-Aware Truck Routing

Monorepo: `backend/` (Django + DRF) and `frontend/` (Vite + React + TypeScript). Spec: [docs/SPEC.md](docs/SPEC.md).

## Run locally

Backend (first time: `cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt && cp .env.example .env`; on macOS/Linux use `.venv/bin/`):

```sh
cd backend && .venv/Scripts/python manage.py runserver
```

Frontend (first time: `cd frontend && npm install`); Vite proxies `/api` to `http://127.0.0.1:8000`:

```sh
cd frontend && npm run dev
```

Tests: `cd backend && .venv/Scripts/pytest` and `cd frontend && npm test`.

## Deploy

One Vercel project from the repo root: `vercel.json` builds `frontend/` as static files and serves Django from the Python function `api/index.py`; `/api/*` goes to Django, everything else to the SPA. Set `SECRET_KEY`, `DEBUG=false` and `ALLOWED_HOSTS` (e.g. `.vercel.app`) as Vercel environment variables.
