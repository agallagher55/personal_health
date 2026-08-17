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
├── config.json.example      # committed: documents the shape of config.json
├── config.json               # git-ignored: OAuth client id/secret, tokens (implemented)
├── data/
│   └── health_data.json     # git-ignored: the JSON data store
├── config.py                 # load/save config.json (implemented)
├── http_client.py            # requests/urllib abstraction (implemented)
├── auth.py                   # OAuth flow, token storage/refresh (implemented)
├── google_health_client.py  # thin wrapper over Google Health API reads (implemented)
├── store.py                  # read/write helpers for the JSON data store (implemented)
├── sync.py                   # orchestrates pulling data and writing it to the store (implemented)
├── server.py                # stdlib http.server-based query API (not yet built)
└── cli.py                    # entry point: `python cli.py auth|sync|serve`
```

## Calling the Google Health API

The exact REST shape isn't in Google's own docs where we could easily verify it from this environment (`developers.google.com` was unreachable while building this), so `google_health_client.py` is built and tested against the shape used by the open-source [`ghealth` CLI](https://github.com/Google-Health-API/google-health-cli), a third-party client for this same API:

- Base URL: `https://health.googleapis.com/v4`
- Read endpoint: `GET /users/me/dataTypes/{dataTypeId}/dataPoints`, `Authorization: Bearer {access_token}`
- Filtering: an AIP-160-style `filter` query param, e.g. `steps.interval.civil_start_time >= "2026-08-01T00:00:00" AND steps.interval.civil_start_time < "2026-08-08T00:00:00"`. Two time "kinds" matter:
  - **civil** — local calendar time, no UTC suffix (interval/session types like `steps`, `sleep`)
  - **physical** — an absolute UTC instant, `Z`-suffixed (sample types like `heart-rate`)
- Pagination: `pageSize` (capped per data type — 25 for `sleep`/`exercise`, higher for others) and `pageToken` / `nextPageToken`.
- Response: `{"dataPoints": [...], "nextPageToken": "..."}`.

Data type IDs currently mapped in `google_health_client.DATA_TYPES` (our metric name → Google's `dataTypeId` → filter field):

| Our metric | Google data type ID | Filter field | Time kind | Confidence |
|---|---|---|---|---|
| `steps` | `steps` | `steps.interval.civil_start_time` | civil | verified against `ghealth` source |
| `heart_rate` | `heart-rate` | `heart_rate.sample_time.physical_time` | physical | verified against `ghealth` source |
| `sleep` | `sleep` | `sleep.interval.civil_end_time` (note: **end** time, the one exception) | civil | verified against `ghealth` source |
| `activity` | `exercise` | `exercise.interval.civil_start_time` | civil | **unverified** — inferred by pattern, not confirmed |

Before leaning on `activity`/`exercise` for real data, confirm its filter field against the official reference (`developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints`) or by trial against the real API — it's the one entry in this table we haven't confirmed against source, just inferred from the pattern the other types follow.

## JSON data store shape

`store.py` keeps the **raw data points returned by the API**, grouped by our metric name, rather than remapping them into a hand-designed shape — the exact per-field schema for each data type (e.g. what a `sleep` data point's stage breakdown looks like) isn't fully confirmed yet, and guessing at field names risked silently dropping or mislabeling real data. Any friendlier reshaping for the frontend (see [`api-contract.md`](./api-contract.md)) happens in `server.py` at serve time, once we've seen real payloads to shape against.

```json
{
  "metrics": {
    "steps": [
      { "time": "2026-08-16T00:00:00Z", "...": "whatever fields Google returns" }
    ],
    "heart_rate": [
      { "time": "2026-08-16T08:00:00Z", "beatsPerMinute": "58" }
    ]
  },
  "last_synced": {
    "steps": "2026-08-17",
    "heart_rate": "2026-08-17"
  }
}
```

`store.add_data_points()` de-dupes by the point's `name` (Google's resource path for the point) or, if absent, its `time`, so re-syncing an overlapping date range is safe. `sync.sync_all()` resumes each metric from its `last_synced` date, or backfills `DEFAULT_BACKFILL_DAYS` (30) on first run.

Revisit (e.g. split into one JSON file per metric) only if a single file becomes unwieldy.

## Data types to target (roughly in priority order)

1. Steps — implemented
2. Heart rate (resting + intraday, if the Google Health API's data bundles expose it) — implemented
3. Sleep (stages, duration, efficiency) — implemented (data type ID confirmed; per-point field schema not yet confirmed)
4. Activity/exercise logs — implemented, but the data type ID/filter field is unverified (see table above)
5. SpO2, HRV, breathing rate, temperature (if available) — not yet added
6. Body (weight, BMI) if logged — not yet added

## Open questions

- Whether `requests` is actually present in `arcgispro-py3` — if not, `http_client.py` already falls back to `urllib.request` automatically.
- Confirm the `activity`/`exercise` filter field (see table above) against the real API or official docs.
- The exact per-data-type payload schema (what fields come back for `sleep`, `steps`, etc. beyond the one confirmed `heart_rate` example) — needed once `server.py` starts reshaping raw points for the frontend.
- Any request rate limits/quotas specific to the Google Health API's REST endpoints — not yet hit in testing since all client testing so far has been against mocks, not the live API.
