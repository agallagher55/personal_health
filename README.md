# Personal Health

A personal project for exploring health data APIs — starting with the **Google Health API** (the successor to the Fitbit Web API / Google Fit) and a Fitbit-tracked account — and building a system to pull, store, and visualize as much of that data as possible.

## Goals

- Learn the Google Health API ecosystem hands-on.
- Pull personal health data (steps, heart rate, sleep, SpO2, activity, etc.) from a connected Fitbit account via the Google Health API.
- Build a Python backend that authenticates with the API, fetches data on demand, and exposes it through a small query API of our own.
- Build a vanilla JS front end to explore and visualize that data (dashboard-first, with room for per-metric detail pages — see [`planning.md`](./planning.md)).

## Constraints (by design)

- **Backend Python libraries are limited to what ships with Esri's ArcGIS Pro 3.5 default `arcgispro-py3` environment.** No `pip install`/conda env cloning for this project — if it's not already in that environment, we don't use it. See [`docs/backend-architecture.md`](./docs/backend-architecture.md) for what that means in practice and how we're verifying the package list.
- **Storage:** a local JSON file instead of a database (SQLite included) — simple, human-readable, fine for a single-user personal project.
- **Frontend:** vanilla JavaScript/HTML/CSS — no framework, no build step, to start.

## Project Structure (planned)

```
personal_health/
├── README.md
├── planning.md              # high-level planning and open questions
├── docs/
│   ├── backend-architecture.md
│   ├── frontend-architecture.md
│   ├── api-contract.md      # endpoints/shapes between backend and frontend
│   ├── local-dev-setup.md   # day-to-day: activate env, sync, serve, view dashboard
│   └── privacy-and-data-handling.md  # what data is touched, where it lives, how it's protected
├── google_health.md          # setup guide: Google Cloud project + OAuth credentials
├── backend/                 # Python backend (API client, JSON storage, query API)
└── frontend/                # vanilla JS front end
```

## Tech Stack (planned)

- **Backend:** Python, restricted to ArcGIS Pro 3.5's bundled `arcgispro-py3` packages
- **Storage:** a JSON file on disk (no database)
- **Frontend:** vanilla JavaScript, HTML, CSS — no framework
- **Data source:** Google Health API (`developers.google.com/health`)

## Status

Early planning stage. See [`planning.md`](./planning.md) for current thinking and open decisions, and [`google_health.md`](./google_health.md) for the Google Cloud/OAuth setup required before running the backend.
