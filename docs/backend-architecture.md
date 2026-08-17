# Backend Architecture (planning)

## Language / stack

- **Python**, restricted to packages bundled in Esri's ArcGIS Pro 3.5 default `arcgispro-py3` conda environment — no `pip install`, no environment cloning. See "Verifying available packages" below.
- Web framework: **none** — third-party frameworks (Flask, FastAPI, etc.) are not part of the default ArcGIS Pro environment, so the query API is built on the standard library's `http.server` (e.g. subclassing `BaseHTTPRequestHandler` / `ThreadingHTTPServer`), returning JSON responses.
- HTTP client: **`requests`**, expected to be available by default (it's a dependency of the bundled `arcgis`/ArcGIS API for Python package) — used to call the Google Health API. Confirm before relying on it; fall back to `urllib.request` (always in stdlib) if it's not present.
- Storage: a **JSON file** on disk, read/written with the standard library `json` module — no database.
- Scheduling: no background scheduler for v1 — data sync is triggered manually (CLI script) or on demand from the frontend.
- Config/secrets: a local, git-ignored JSON or `.ini` config file (standard library `configparser` or plain `json`) for OAuth client ID/secret and tokens.

## Verifying available packages

Before writing code, confirm the actual package list in the target `arcgispro-py3` environment (this doc's assumptions are based on general knowledge of what ArcGIS Pro bundles, not a direct listing):

```
conda list --prefix "<path-to-arcgispro-py3>"
```

Update this doc with the confirmed list of what's usable (particularly: `requests`, `pandas`, `numpy`, anything HTTP/server related).

## Responsibilities

1. **Auth** — handle the Google Health API's OAuth 2.0 flow, store/refresh access & refresh tokens in the local config file.
2. **Ingestion** — fetch data from the Google Health API for configured data types and date ranges, normalize it, and write it into the JSON data store.
3. **Query API** — a small stdlib HTTP server exposing endpoints for the frontend to query stored data (by metric, date range).
4. **Sync management** — track what's already been pulled (e.g. last-synced timestamp per metric) to avoid redundant calls and respect API rate limits.

## Proposed module layout

```
backend/
├── config.json              # git-ignored: OAuth client id/secret, tokens
├── data/
│   └── health_data.json     # git-ignored (or committed sample data only): the JSON data store
├── auth.py                  # OAuth flow, token storage/refresh
├── google_health_client.py  # thin wrapper over Google Health API calls (via requests/urllib)
├── store.py                 # read/write helpers for the JSON data store
├── sync.py                  # orchestrates pulling data and writing it to the store
├── server.py                # stdlib http.server-based query API
└── cli.py                   # entry point: `python cli.py sync`, `python cli.py serve`
```

## JSON data store shape (draft)

A single top-level JSON object keyed by metric, each holding a list of dated records — simple to reason about and query in pure Python without a database:

```json
{
  "steps": [
    { "date": "2026-08-16", "value": 8421 }
  ],
  "heart_rate": [
    { "date": "2026-08-16", "resting": 58, "zones": { "...": "..." } }
  ],
  "sleep": [
    { "date": "2026-08-16", "duration_minutes": 431, "stages": { "...": "..." } }
  ]
}
```

Revisit (e.g. split into one JSON file per metric) only if a single file becomes unwieldy.

## Data types to target (roughly in priority order)

1. Steps
2. Heart rate (resting + intraday, if the Google Health API's data bundles expose it)
3. Sleep (stages, duration, efficiency)
4. Activity/exercise logs
5. SpO2, HRV, breathing rate, temperature (if available)
6. Body (weight, BMI) if logged

## Open questions

- Exact Google Health API auth flow/scopes for an individual developer (see [`planning.md`](../planning.md)).
- Whether `requests` is actually present in `arcgispro-py3` — if not, use `urllib.request` instead.
- Token refresh: needs to run automatically before expiry.
- Any request signing/quota requirements specific to the Google Health API's REST endpoints.
