# Backend Architecture (planning)

## Language / stack

- **Python** (per project decision)
- Web framework: **FastAPI** — good async support (useful for calling external APIs), automatic OpenAPI docs, easy to pair with any frontend.
- HTTP client: `httpx` for calling the Fitbit Web API.
- DB: start with **SQLite** via **SQLAlchemy** (or `sqlmodel`) — simple, file-based, zero setup, fine for a single-user personal project. Can move to Postgres later if needed.
- Scheduling: start with a simple manual/CLI sync command; consider `APScheduler` or a cron job later for automatic periodic syncs.
- Config/secrets: `.env` file (via `python-dotenv`), never committed.

## Responsibilities

1. **Auth** — handle Fitbit OAuth 2.0 flow (authorization code grant), store/refresh access & refresh tokens.
2. **Ingestion** — fetch data from the Fitbit Web API for configured data types and date ranges, normalize it, and persist it to the local DB.
3. **Query API** — expose our own REST endpoints for the frontend to query stored data (by metric, date range, aggregation).
4. **Sync management** — track what's already been pulled to avoid redundant calls and respect Fitbit's rate limits.

## Proposed module layout

```
backend/
├── app/
│   ├── main.py               # FastAPI app entrypoint
│   ├── config.py             # settings/env loading
│   ├── auth/
│   │   ├── fitbit_oauth.py   # OAuth flow, token storage/refresh
│   ├── clients/
│   │   └── fitbit_client.py  # thin wrapper over Fitbit Web API endpoints
│   ├── ingestion/
│   │   ├── sync.py           # orchestrates pulling + storing data
│   │   └── mappers.py        # Fitbit API responses -> our DB models
│   ├── models/                # SQLAlchemy models (steps, heart_rate, sleep, etc.)
│   ├── api/
│   │   └── routes/           # our query endpoints (e.g. /metrics/steps?from=&to=)
│   └── db.py                  # DB session/engine setup
├── tests/
├── requirements.txt / pyproject.toml
└── .env.example
```

## Data types to target (roughly in priority order)

1. Steps (daily + intraday if scope available)
2. Heart rate (resting + intraday)
3. Sleep (stages, duration, efficiency)
4. Activity/exercise logs
5. SpO2, HRV, breathing rate, temperature (if available on this device/account tier)
6. Body (weight, BMI) if logged

## Open questions

- Intraday data requires a special Fitbit "Personal" app type / access request — confirm this during Fitbit app registration.
- Token refresh: needs to run automatically before expiry (Fitbit access tokens are short-lived, ~8 hours).
- Do we need a background worker process for periodic syncs, or is on-demand sync (triggered by opening the dashboard) good enough for v1? Leaning on-demand for v1, simplest.
