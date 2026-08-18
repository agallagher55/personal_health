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
├── server.py                # stdlib http.server-based query API (implemented)
└── cli.py                    # entry point: `python cli.py auth|sync|serve` (implemented)
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

**Some data types don't populate the plain list endpoint at all.** Confirmed live (OAuth Playground, real account, real Fitbit Air device) on 2026-08-17: `GET .../dataTypes/steps/dataPoints` and `.../dataPoints:reconcile` both returned zero results for a week with confirmed real activity (steps visible in the Google Health app and via `users.pairedDevices`). `POST .../dataTypes/steps/dataPoints:dailyRollUp` returned real daily totals for the same range. This particular device apparently only emits `steps` as rolled-up daily totals, never as raw per-interval samples — `heart-rate` on the same device/account *did* return real data from the plain list endpoint, so this isn't a blanket account/auth issue, just a per-data-type quirk. `google_health_client.py` now routes `steps` through `dailyRollUp` (`_list_via_daily_rollup`) instead of the plain list endpoint; other data types marked `"read_method": "daily_rollup"` in `DATA_TYPES` would get the same treatment if they turn out to need it.

`dailyRollUp` shape (`POST .../dataTypes/{dataTypeId}/dataPoints:dailyRollUp`, verified against `ghealth`'s `buildDailyRollupBody` and its test fixtures, not just the REST reference — the reference's field names for the request body didn't match the live API):
```json
{
  "range": {
    "start": {"date": {"year": 2026, "month": 8, "day": 10}},
    "end": {"date": {"year": 2026, "month": 8, "day": 18}}
  },
  "windowSizeDays": 1
}
```
`windowSizeDays` is documented as optional (default 1) but the live API 400s if it's omitted — always send it explicitly. Response: `{"rollupDataPoints": [{"civilStartTime": {...}, "civilEndTime": {...}, "steps": {"countSum": "13850"}}, ...], "nextPageToken": "..."}` — no `name` or `time` field, so `store._point_key` falls back to `civilStartTime` for dedup on these points.

Data type IDs currently mapped in `google_health_client.DATA_TYPES` (our metric name → Google's `dataTypeId` → filter field):

| Our metric | Google data type ID | Filter field | Time kind | Read method | Confidence |
|---|---|---|---|---|---|
| `steps` | `steps` | `steps.interval.civil_start_time` | civil | `daily_rollup` | verified live (see above) |
| `heart_rate` | `heart-rate` | `heart_rate.sample_time.physical_time` | physical | list | verified live |
| `sleep` | `sleep` | `sleep.interval.civil_end_time` (note: **end** time, the one exception) | civil | list | verified live — real sleep sessions returned |
| `activity` | `exercise` | `exercise.interval.civil_start_time` | civil | list | verified live — a real logged workout returned |

Both confirmed live (same 2026-08-17 session as the `steps` diagnosis above) — the plain list endpoint returns real records for both on this account/device, so neither needs the `daily_rollup` workaround `steps` does.

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

`store.add_data_points()` de-dupes by the point's `name` (Google's resource path for the point) or, if absent, its `time` — or, for `dailyRollUp`-sourced points which have neither, its `civilStartTime` — so re-syncing an overlapping date range is safe. `sync.sync_all()` resumes each metric from its `last_synced` date, or backfills `DEFAULT_BACKFILL_DAYS` (30) on first run.

Revisit (e.g. split into one JSON file per metric) only if a single file becomes unwieldy.

## Data types to target (roughly in priority order)

1. Steps — implemented (verified live, via `daily_rollup` — see table above)
2. Heart rate (resting + intraday, if the Google Health API's data bundles expose it) — implemented, verified live
3. Sleep (stages, duration, efficiency) — implemented, verified live (real sessions with `shortAwakenings`, `startTime`/`endTime`, `type`, UTC offsets)
4. Activity/exercise logs — implemented, verified live (real workout returned with `exerciseType`, `metricsSummary`, `heartRateZoneDurations`)
5. SpO2, HRV, breathing rate, temperature (if available) — not yet added
6. Body (weight, BMI) if logged — not yet added

## Query API (`server.py`)

Implements `docs/api-contract.md` exactly: `GET /api/health`, `GET /api/metrics`,
`GET /api/metrics/{metric}`, `POST /api/sync`, plus serving `frontend/` as
static files (so `python cli.py serve` is the only process needed for local
dev — see `docs/local-dev-setup.md`). Built on `ThreadingHTTPServer` /
`BaseHTTPRequestHandler`, no third-party framework. CORS is wide open
(`Access-Control-Allow-Origin: *`) since this only ever runs on localhost.

**Reshaping raw store points into the contract's per-metric shapes is now
verified for all four metrics** against a real `backend/data/health_data.json`
from a live sync (2026-08-18). Confirmed field paths:
- `steps`: flat dailyRollUp points — `civilStartTime`/`civilEndTime` are
  `{"date": {"year", "month", "day"}}`, count at `steps.countSum`.
- `heart_rate`: nested under `heartRate` — date from
  `heartRate.sampleTime.civilTime.date` (local calendar date; falls back to
  truncating `sampleTime.physicalTime`), bpm from
  `heartRate.beatsPerMinute`. Daily "resting" value is still approximated as
  the **minimum bpm sample seen that day** — the API's `heart-rate` data type
  is intraday samples, not a dedicated resting-heart-rate metric. Revisit if
  a real resting-heart-rate data type/bundle turns out to exist.
- `sleep`: nested under `sleep` — session date from `sleep.interval.endTime`
  (falls back to `startTime`), duration from `sleep.summary.minutesAsleep`,
  and stage minutes summed from `sleep.summary.stagesSummary` (a list of
  `{"type": "AWAKE"|"LIGHT"|"DEEP"|"REM", "minutes": "...", "count": "..."}`)
  rather than the per-segment `sleep.stages` list. A stage type absent from
  `stagesSummary` defaults to `0`.
- `activity`: nested under `exercise` — date from `exercise.interval.startTime`,
  type from `exercise.exerciseType`, calories from
  `exercise.metricsSummary.caloriesKcal`, duration from
  `exercise.activeDuration` (a `"<seconds>s"` string, converted to minutes).

`server.py`'s `_extract_*`/`_reshape_*` helpers still skip points they can't
parse rather than raising, so a future account/device with a differently
shaped payload degrades to "fewer/empty records" instead of a 500 — but the
field paths themselves are no longer guesses.

## Open questions

- Whether `requests` is actually present in `arcgispro-py3` — if not, `http_client.py` already falls back to `urllib.request` automatically.
- The exact per-data-type payload schema for `heart_rate`/`sleep`/`activity` reshaping in `server.py` — see "Query API" above.
- Whether other data types beyond `steps` (SpO2, HRV, body/weight, once added) also need the `daily_rollup` read path instead of plain list — check the same way `steps` was diagnosed rather than assuming list works.
- Any request rate limits/quotas specific to the Google Health API's REST endpoints — not yet hit in testing since all client testing so far has been against mocks except for the one-off live diagnosis above, not a full sync.
