# Backend Query API Contract

The contract between the vanilla JS frontend and the Python backend's stdlib `http.server`-based query API (see [`backend-architecture.md`](./backend-architecture.md)). Defines this up front so frontend and backend can be built against a shared shape without waiting on each other.

All endpoints are served locally (e.g. `http://localhost:8000`), return `Content-Type: application/json`, and read from the JSON data store — none of them call the Google Health API directly (that only happens during `sync`).

## Conventions

- Dates are `YYYY-MM-DD` strings, always local calendar dates (no timezone conversion in v1 — assume single-user, single-timezone).
- Date range params: `from` and `to`, both inclusive. If omitted, defaults are endpoint-specific (noted below).
- All successful responses are `200` with a JSON body. No pagination in v1 — ranges are expected to be small (days/weeks), not years.
- Errors return a non-2xx status and a JSON body: `{ "error": "message" }`.

## `GET /api/health`

Basic liveness check — confirms the server is up and can read the data store.

**Response `200`:**
```json
{ "status": "ok", "data_store_last_modified": "2026-08-17T09:12:00Z" }
```

## `GET /api/metrics`

Dashboard-level summary across all metrics for a date range — the single call the dashboard page makes on load. Default range: last 7 days if `from`/`to` omitted.

**Request:** `GET /api/metrics?from=2026-08-11&to=2026-08-17`

**Response `200`:**
```json
{
  "from": "2026-08-11",
  "to": "2026-08-17",
  "metrics": {
    "steps": [
      { "date": "2026-08-11", "value": 8421 },
      { "date": "2026-08-12", "value": 6310 }
    ],
    "heart_rate": [
      { "date": "2026-08-11", "resting": 58 },
      { "date": "2026-08-12", "resting": 60 }
    ],
    "sleep": [
      { "date": "2026-08-11", "duration_minutes": 431, "stages": { "light": 210, "deep": 90, "rem": 100, "awake": 31 } }
    ],
    "activity": [
      { "date": "2026-08-11", "exercises": [ { "type": "walk", "duration_minutes": 32, "calories": 140 } ] }
    ],
    "spo2": [ { "date": "2026-08-11", "value": 97.0 } ],
    "hrv": [ { "date": "2026-08-11", "value": 45.0 } ],
    "breathing_rate": [ { "date": "2026-08-11", "value": 15.2 } ],
    "temperature": [ { "date": "2026-08-11", "value": 36.8 } ],
    "weight": [ { "date": "2026-08-11", "value": 81.5 } ]
  }
}
```

`spo2`/`hrv`/`breathing_rate`/`temperature`/`weight` share one `{ date, value }` shape (a same-day average, except `weight`, which takes the last same-day reading). **Field-shape UNVERIFIED as of 2026-08-18** — added without a live sync to confirm the raw payload against, unlike the other four metrics; see `docs/backend-architecture.md`'s reshaping notes. `value` may come back `null`/inconsistent, or the array may stay empty even with real data, until confirmed.

Any metric with no records in range is present as an empty array (`"heart_rate": []`), not omitted — keeps the frontend's widget code from having to check for missing keys.

## `GET /api/metrics/{metric}`

Single-metric detail, for per-metric pages (e.g. `heart-rate.html`) that want more than the dashboard summary gives. Default range: last 30 days if omitted.

`{metric}` is one of: `steps`, `heart_rate`, `sleep`, `activity`, `spo2`, `hrv`, `breathing_rate`, `temperature`, `weight` (extend this list as new data types are added — keep it in sync with `backend/server.py`'s `KNOWN_METRICS`).

**Request:** `GET /api/metrics/heart_rate?from=2026-07-18&to=2026-08-17`

**Response `200`:**
```json
{
  "metric": "heart_rate",
  "from": "2026-07-18",
  "to": "2026-08-17",
  "records": [
    { "date": "2026-08-11", "resting": 58 },
    { "date": "2026-08-12", "resting": 60 }
  ]
}
```

**Response `404`** (unknown metric name):
```json
{ "error": "unknown metric: heartrate" }
```

## `POST /api/sync`

Triggers an on-demand pull from the Google Health API into the JSON data store (the "sync now" button noted as an open question in `frontend-architecture.md`). Synchronous for v1 — the request blocks until the sync finishes, since syncs are expected to be quick for a personal account's data volume. Revisit as async/background if that stops being true.

**Request:** `POST /api/sync` (empty body)

**Response `200`:**
```json
{
  "status": "ok",
  "synced": { "steps": 7, "heart_rate": 7, "sleep": 6, "activity": 3 },
  "synced_at": "2026-08-17T09:12:00Z"
}
```

**Response `200`, one or more metrics failed** (e.g. a data type whose read method turns out to be wrong for this account — see `docs/backend-architecture.md`'s per-metric "Confidence" notes): the metrics that succeeded were genuinely synced and saved, so this is still `200`, not an error — `errors` names which metrics didn't and why. That metric's `last_synced` isn't advanced, so the same range is retried on the next sync.
```json
{
  "status": "ok",
  "synced": { "steps": 7, "heart_rate": 7, "sleep": 6, "activity": 3, "spo2": 5 },
  "errors": { "breathing_rate": "400 Client Error: Bad Request for url: ..." },
  "synced_at": "2026-08-17T09:12:00Z"
}
```

**Response `502`** (the sync couldn't start at all — e.g. token expired and refresh failed):
```json
{ "error": "sync failed: <reason>" }
```

## Not in v1

- Write endpoints (this project only reads from Google Health API and re-serves locally; no editing stored data through the API).
- Auth on the query API itself — it's local-only, single-user, not exposed beyond localhost. Revisit if that changes.
- Pagination/streaming for large ranges.
