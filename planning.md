# Planning

## What we're building

A personal system to pull health/fitness data (originally from a Fitbit device, via Google's APIs) into a local JSON store, and explore it through a vanilla JS dashboard, using only Python libraries bundled with ArcGIS Pro 3.5.

## Data source: Google Health API

The Fitbit Web API and the older Google Fit REST API are both being deprecated/retired (Google Fit sign-ups closed May 2024, shutdown announced for 2026). Google's replacement is the **Google Health API** (`developers.google.com/health`) — described as the next generation of the Fitbit Web API, unifying data from Fitbit, Pixel Watch, and other devices behind Google's OAuth 2.0 framework, with both REST and RPC support.

**Decision:** build against the **Google Health API**, not the legacy Fitbit Web API or Google Fit API.

Open items to confirm once we register a project/app:
- Exact auth flow and required OAuth scopes for a personal/individual developer (not an org).
- What data type bundles are available (Google consolidated ~100+ legacy Fitbit endpoints into a smaller set of "data type bundles" — need to map those to the metrics we want: steps, heart rate, sleep, SpO2, activity).
- Rate limits and any developer approval/waitlist process.
- Migration guide differences vs. the old Fitbit Web API, in case any docs/examples we find online still reference the old endpoints.

## Python library constraint

**All backend Python code must run using only packages already bundled in Esri's ArcGIS Pro 3.5 default `arcgispro-py3` conda environment** — no `pip install`, no cloned/extended environments. This project is intentionally scoped to that deployment.

Practical implications (to verify against an actual `conda list` in `arcgispro-py3` before writing code — see [`docs/backend-architecture.md`](./docs/backend-architecture.md)):
- Common web frameworks (Flask, FastAPI, etc.) are **not** part of the default environment, so we'll build any local API server using Python's standard library (`http.server` or similar) rather than a third-party framework.
- `requests` is expected to be available (it's a dependency of the bundled `arcgis`/ArcGIS API for Python package) — this would be our HTTP client for calling the Google Health API. Needs confirming.
- `json` (standard library) is our data storage format — no database library needed.
- `pandas`/`numpy` are available if we need any data wrangling beyond plain JSON manipulation.

## Storage: JSON file

Instead of SQLite or another database, stored health data lives in a single JSON file (or a small set of JSON files, one per metric type, if that's cleaner) on disk. Simple, no dependencies, easy to inspect by hand. Revisit only if querying/performance becomes a real problem — unlikely at personal-project scale.

## Frontend: vanilla JS

No framework, no build tooling (no React/Vite/TypeScript). Plain HTML/CSS/JS served as static files. Keeps the stack minimal and matches the "explore the APIs" spirit of the project. Revisit later only if the UI genuinely outgrows this.

## Scope for v1

- [ ] Register a Google Health API app/project, get OAuth working
- [ ] Pull a handful of data types to start: steps, heart rate, sleep, activity
- [ ] Store fetched data in a local JSON file
- [ ] Small backend API (stdlib-only) to query stored data by date range / metric
- [ ] Vanilla JS dashboard to view the data
- [ ] Expand to more data types once the pipeline works end-to-end

## Open questions

- **Dashboard vs. multi-page site?** Leaning dashboard — a single view with multiple charts/widgets (today's snapshot, trends over time) feels more natural for health data than separate pages per metric. Could add dedicated pages per metric later if the dashboard gets crowded. See [`docs/frontend-architecture.md`](./docs/frontend-architecture.md).
- **How much history to pull?** Need to check Google Health API rate limits and plan a backfill strategy for historical data vs. ongoing sync.
- **Auth storage:** where/how to store OAuth tokens safely for a personal single-user project (a local, git-ignored JSON/config file, kept separate from the data-store JSON file).
- **JSON file growth:** if the data file grows large over time, may need to split by metric/month rather than one giant file — revisit once we see real data volume.
- **Hosting:** run locally to start, or deploy somewhere? Not needed for v1.

## Next steps

1. Follow [`google_health.md`](./google_health.md) to set up the Google Cloud project, OAuth consent screen, and credentials.
2. Flesh out backend architecture — see [`docs/backend-architecture.md`](./docs/backend-architecture.md)
3. Flesh out frontend architecture — see [`docs/frontend-architecture.md`](./docs/frontend-architecture.md)
4. Confirm the actual `arcgispro-py3` package list (`conda list`) and register a Google Health API app before building anything else out.
