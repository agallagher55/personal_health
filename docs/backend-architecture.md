# Backend Architecture

## Language / stack

- **Python**, restricted to packages bundled in Esri's ArcGIS Pro 3.5 default `arcgispro-py3` conda environment, no `pip install`, no environment cloning. See "Verifying available packages" below.
- Web framework: **none**. Third-party frameworks (Flask, FastAPI, etc.) are not part of the default ArcGIS Pro environment, so the query API is built on the standard library's `http.server` (e.g. subclassing `BaseHTTPRequestHandler` / `ThreadingHTTPServer`), returning JSON responses.
- HTTP client: **`requests`**, expected to be available by default (it's a dependency of the bundled `arcgis`/ArcGIS API for Python package), used to call the Google Health API. Confirm before relying on it; fall back to `urllib.request` (always in stdlib) if it's not present.
- Storage: a **JSON file** on disk, read/written with the standard library `json` module, no database.
- Scheduling: no background scheduler for v1, data sync is triggered manually (CLI script) or on demand from the frontend.
- Config/secrets: a local, git-ignored JSON or `.ini` config file (standard library `configparser` or plain `json`) for OAuth client ID/secret and tokens.

## Verifying available packages

Before writing code, confirm the actual package list in the target `arcgispro-py3` environment (this doc's assumptions are based on general knowledge of what ArcGIS Pro bundles, not a direct listing):

```
conda list --prefix "<path-to-arcgispro-py3>"
```

Update this doc with the confirmed list of what's usable (particularly: `requests`, `pandas`, `numpy`, anything HTTP/server related).

## Responsibilities

1. **Auth**: handle the Google Health API's OAuth 2.0 flow, store/refresh access & refresh tokens in the local config file.
2. **Ingestion**: fetch data from the Google Health API for configured data types and date ranges, normalize it, and write it into the JSON data store.
3. **Query API**: a small stdlib HTTP server exposing endpoints for the frontend to query stored data (by metric, date range).
4. **Sync management**: track what's already been pulled (e.g. last-synced timestamp per metric) to avoid redundant calls and respect API rate limits.

## Module layout

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
├── cli.py                    # entry point: `python cli.py auth|sync|serve` (implemented)
├── start-server.bat          # Windows convenience script
└── start-sync.bat            # Windows convenience script: runs `python cli.py sync` in arcgispro-py3
```

Note: as of this review, `start-server.bat` actually runs `python cli.py auth`, not `serve`, despite its name. Worth a fix or a rename in `backend/`, flagged here since the mismatch isn't obvious from the filename alone.

## Calling the Google Health API

The exact REST shape isn't in Google's own docs where we could easily verify it from this environment (`developers.google.com` was unreachable while building this), so `google_health_client.py` is built and tested against the shape used by the open-source [`ghealth` CLI](https://github.com/Google-Health-API/google-health-cli), a third-party client for this same API:

- Base URL: `https://health.googleapis.com/v4`
- Read endpoint: `GET /users/me/dataTypes/{dataTypeId}/dataPoints`, `Authorization: Bearer {access_token}`
- Filtering: an AIP-160-style `filter` query param, e.g. `steps.interval.civil_start_time >= "2026-08-01T00:00:00" AND steps.interval.civil_start_time < "2026-08-08T00:00:00"`. Two time "kinds" matter:
  - **civil**, local calendar time, no UTC suffix (interval/session types like `steps`, `sleep`)
  - **physical**, an absolute UTC instant, `Z`-suffixed (sample types like `heart-rate`)
- Pagination: `pageSize` (capped per data type, 25 for `sleep`/`exercise`, higher for others) and `pageToken` / `nextPageToken`.
- Response: `{"dataPoints": [...], "nextPageToken": "..."}`.

**Some data types don't populate the plain list endpoint at all.** Confirmed live (OAuth Playground, real account, real Fitbit Air device) on 2026-08-17: `GET .../dataTypes/steps/dataPoints` and `.../dataPoints:reconcile` both returned zero results for a week with confirmed real activity (steps visible in the Google Health app and via `users.pairedDevices`). `POST .../dataTypes/steps/dataPoints:dailyRollUp` returned real daily totals for the same range. This particular device apparently only emits `steps` as rolled-up daily totals, never as raw per-interval samples. `heart-rate` on the same device/account *did* return real data from the plain list endpoint, so this isn't a blanket account/auth issue, just a per-data-type quirk. `google_health_client.py` now routes `steps` through `dailyRollUp` (`_list_via_daily_rollup`) instead of the plain list endpoint; other data types marked `"read_method": "daily_rollup"` in `DATA_TYPES` would get the same treatment if they turn out to need it.

`dailyRollUp` shape (`POST .../dataTypes/{dataTypeId}/dataPoints:dailyRollUp`, verified against `ghealth`'s `buildDailyRollupBody` and its test fixtures, not just the REST reference; the reference's field names for the request body didn't match the live API):
```json
{
  "range": {
    "start": {"date": {"year": 2026, "month": 8, "day": 10}},
    "end": {"date": {"year": 2026, "month": 8, "day": 18}}
  },
  "windowSizeDays": 1
}
```
`windowSizeDays` is documented as optional (default 1) but the live API 400s if it's omitted; always send it explicitly. Response: `{"rollupDataPoints": [{"civilStartTime": {...}, "civilEndTime": {...}, "steps": {"countSum": "13850"}}, ...], "nextPageToken": "..."}`. No `name` or `time` field, so `store._point_key` falls back to `civilStartTime` for dedup on these points.

Data type IDs currently mapped in `google_health_client.DATA_TYPES` (our metric name → Google's `dataTypeId` → filter field):

| Our metric | Google data type ID | Filter field | Time kind | Read method | Confidence |
|---|---|---|---|---|---|
| `steps` | `steps` | `steps.interval.civil_start_time` | civil | `daily_rollup` | verified live (see above) |
| `heart_rate` | `heart-rate` | `heart_rate.sample_time.physical_time` | physical | list | verified live |
| `sleep` | `sleep` | `sleep.interval.civil_end_time` (note: **end** time, the one exception) | civil | list | verified live, real sleep sessions returned |
| `activity` | `exercise` | `exercise.interval.civil_start_time` | civil | list | verified live, a real logged workout returned |
| `spo2` | `oxygen-saturation` | `oxygen_saturation.sample_time.physical_time` | physical | list | verified live, real values rendering correctly (2026-08-19) |
| `hrv` | `heart-rate-variability` | `heart_rate_variability.sample_time.physical_time` | physical | list | verified live, see reshaping note below (the value field name needed a fix) |
| `breathing_rate` | `daily-respiratory-rate` | `daily_respiratory_rate.date` | `civil_date` (bare date, no time) | list | verified live, 3rd attempt on the filter field, but real data now syncing and rendering correctly |
| `temperature` | `daily-sleep-temperature-derivations` | `daily_sleep_temperature_derivations.date` | `civil_date` (bare date, no time) | list | verified live (2026-08-20, see issue #30 note below) |
| `weight` | `weight` | `weight.sample_time.physical_time` | physical | list | verified live, real values rendering correctly (2026-08-19) |

Both `sleep`/`activity` confirmed live (same 2026-08-17 session as the `steps` diagnosis above). The plain list endpoint returns real records for both on this account/device, so neither needs the `daily_rollup` workaround `steps` does.

`spo2`, `hrv`, `breathing_rate`, and `weight` are now confirmed live (2026-08-19), real data synced and rendered correctly on the dashboard. `breathing_rate` took three attempts to even get a data type ID/filter Google would accept a request for at all (see its confidence note above), plus one more fix once real points arrived: the date was nested inside `dailyRespiratoryRate.date` (a `{year, month, day}` dict, like `steps`' dailyRollUp shape), not a sibling top-level field the way the fix first guessed - the value field name (`breathsPerMinute`) was right from the start.

**`temperature` (issue #30, 2026-08-20):** a live sync against the original `core-body-temperature` guess returned **0 data points** while every other metric returned real data that same run - not an error, so the request was valid, but this device never emits raw core-body-temperature samples. Switched to `daily-sleep-temperature-derivations`, the ghealth CLI registry's separate entry for Fitbit's actual nightly "skin temperature variation" feature (`TimeField: daily`, same bare-`.date` filter pattern `breathing_rate` uses) - confirmed live the same day, 1 real point synced. The frontend labels were updated to "Temperature Variation" since the metric is a delta from baseline and can be negative - see the reshaping note below for how that delta is actually computed (it needed a second fix once the real payload could be inspected).

## JSON data store shape

`store.py` keeps the **raw data points returned by the API**, grouped by our metric name, rather than remapping them into a hand-designed shape. The exact per-field schema for each data type (e.g. what a `sleep` data point's stage breakdown looks like) isn't fully confirmed yet, and guessing at field names risked silently dropping or mislabeling real data. Any friendlier reshaping for the frontend (see [`api-contract.md`](./api-contract.md)) happens in `server.py` at serve time, once we've seen real payloads to shape against.

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

`store.add_data_points()` keys each point by its `name` (Google's resource path for the point); if absent, its `time`; for `dailyRollUp`-sourced points which have neither, its `civilStartTime`; or, failing all three (heart_rate's payload has none of them), a hash of its full content. It **upserts** by that key rather than skip-if-seen: a repeat key overwrites the stored point's content instead of being discarded, since a repeat key doesn't always mean identical content. `steps`' dailyRollUp points are keyed by calendar day, and "today"'s total legitimately increases through the day, so a later sync's updated total must win over an earlier sync's stale one. `sync.sync_all()` resumes each metric from its `last_synced` date, or backfills `DEFAULT_BACKFILL_DAYS` (30) on first run.

Revisit (e.g. split into one JSON file per metric) only if a single file becomes unwieldy.

## Data types to target (roughly in priority order)

1. Steps, implemented (verified live, via `daily_rollup`, see table above)
2. Heart rate (resting + intraday, if the Google Health API's data bundles expose it), implemented, verified live
3. Sleep (stages, duration, efficiency), implemented, verified live (real sessions with `shortAwakenings`, `startTime`/`endTime`, `type`, UTC offsets)
4. Activity/exercise logs, implemented, verified live (real workout returned with `exerciseType`, `metricsSummary`, `heartRateZoneDurations`)
5. SpO2, HRV, breathing rate, added 2026-08-18, **verified live** (2026-08-19, see the data type table above); temperature added the same day, found to be pulling the wrong data type (issue #30, 2026-08-20 - see the data type table above), now points at `daily-sleep-temperature-derivations` and is **verified live** (2026-08-20)
6. Body weight, added 2026-08-18, **verified live** (2026-08-19, BMI not separately mapped; not confirmed to be its own data type)

## Query API (`server.py`)

Implements `docs/api-contract.md` exactly: `GET /api/health`, `GET /api/metrics`,
`GET /api/metrics/{metric}`, `GET /api/metrics/{metric}/samples`, `POST
/api/sync`, plus serving `frontend/` as static files (so `python cli.py
serve` is the only process needed for local dev, see
`docs/local-dev-setup.md`). Built on `ThreadingHTTPServer` /
`BaseHTTPRequestHandler`, no third-party framework. CORS is wide open
(`Access-Control-Allow-Origin: *`) since this only ever runs on localhost.

**`GET /api/metrics/{metric}/samples`** (added for the activity detail
view, see `docs/frontend-architecture.md`) is dispatched in `do_GET`
*before* the generic `/api/metrics/{metric}` prefix match, since its path
also starts with `/api/metrics/` - matched by an `endswith("/samples")`
check instead. It re-walks the raw store points for `metric` (currently
only `heart_rate`, see `SAMPLE_METRICS`) filtering by `sampleTime.physicalTime`
against the request's `from`/`to` instants, rather than going through
`_metric_records()`'s date-bucketed `_RESHAPERS` path - the whole point is
to get readings finer than a calendar day.

**Reshaping raw store points into the contract's per-metric shapes is now
verified for all four metrics** against a real `backend/data/health_data.json`
from a live sync (2026-08-18). Confirmed field paths:
- `steps`: flat dailyRollUp points, `civilStartTime`/`civilEndTime` are
  `{"date": {"year", "month", "day"}}`, count at `steps.countSum`.
- `heart_rate`: nested under `heartRate`, date from
  `heartRate.sampleTime.civilTime.date` (local calendar date; falls back to
  truncating `sampleTime.physicalTime`), bpm from
  `heartRate.beatsPerMinute`. Daily "resting" value is still approximated as
  the **minimum bpm sample seen that day**. The API's `heart-rate` data type
  is intraday samples, not a dedicated resting-heart-rate metric. Revisit if
  a real resting-heart-rate data type/bundle turns out to exist.
- `sleep`: nested under `sleep`, session date from `sleep.interval.endTime`
  (falls back to `startTime`), duration from `sleep.summary.minutesAsleep`,
  and stage minutes summed from `sleep.summary.stagesSummary` (a list of
  `{"type": "AWAKE"|"LIGHT"|"DEEP"|"REM", "minutes": "...", "count": "..."}`)
  rather than the per-segment `sleep.stages` list. A stage type absent from
  `stagesSummary` defaults to `0`.
- `activity`: nested under `exercise`, date from `exercise.interval.startTime`,
  type from `exercise.exerciseType`, calories from
  `exercise.metricsSummary.caloriesKcal`, duration from
  `exercise.activeDuration` (a `"<seconds>s"` string, converted to minutes).

`server.py`'s `_extract_*`/`_reshape_*` helpers still skip points they can't
parse rather than raising, so a future account/device with a differently
shaped payload degrades to "fewer/empty records" instead of a 500, but the
field paths themselves are no longer guesses.

**`spo2`, `hrv`, `breathing_rate`, and `weight` were the same kind of guess**
(added 2026-08-18) that `heart_rate`/`sleep`/`activity` started as, and are
now similarly confirmed live (2026-08-19): `_reshape_sample_series()`'s
nested-key/`sampleTime` guess was right for all three sample-based ones out
of the box, for `spo2` and `weight`. `hrv` needed one fix: the value field
is `rootMeanSquareOfSuccessiveDifferencesMilliseconds`, not the
`rmssdMillis`/`rmssd`/`value` guesses it started with (those stayed as
trailing fallbacks). `breathing_rate` (civil/daily, so a separate
`_reshape_breathing_rate()` rather than `_reshape_sample_series()`) had its
value field name (`breathsPerMinute`) right immediately but needed one fix
to its date lookup: the date is nested *inside* the `dailyRespiratoryRate`
payload as a `{year, month, day}` dict, not a sibling top-level field.

**`temperature` (issue #30), confirmed live 2026-08-20 - two fixes:** the
original guess (`core-body-temperature`, handled by
`_reshape_sample_series()`) synced 0 points live - not a reshaping bug, the
device just never emits that data type. Switched to
`daily-sleep-temperature-derivations` instead (see the data type table
above), which fixed the sync but not the display: the new
`_reshape_temperature()` got the date lookup right on the first try
(nested inside the payload as a `{year, month, day}` dict, matching
`_reshape_breathing_rate()`'s confirmed shape), but every guessed value
field name (`temperatureDeltaCelsius` etc.) was wrong, so the point was
silently dropped and the dashboard still showed no data despite the sync
reporting 1 point. The real payload has no single delta field at all - it
carries the night's absolute reading (`nightlyTemperatureCelsius`) and the
personal baseline it's compared against (`baselineTemperatureCelsius`)
separately (plus `relativeNightlyStddev30dCelsius`, unused). `_reshape_temperature()`
now computes `nightlyTemperatureCelsius - baselineTemperatureCelsius`
itself rather than reading a single field - this is the last metric to get
confirmed live, all nine now verified.

## Open questions

- Whether `requests` is actually present in `arcgispro-py3` (if not, `http_client.py` already falls back to `urllib.request` automatically).
- (Resolved 2026-08-20) The exact per-data-type payload schema for `temperature` reshaping in `server.py` - see the reshaping note above; all nine metrics are now confirmed live.
- Any request rate limits/quotas specific to the Google Health API's REST endpoints: not yet hit in testing, since all client testing so far has been against mocks except for the one-off live diagnosis above, not a full sync.
