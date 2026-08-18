"""stdlib http.server-based query API for the frontend (see
docs/api-contract.md and the "Query API" responsibility in
docs/backend-architecture.md).

Serves JSON read from the local data store (backend/data/health_data.json)
- never calls the Google Health API directly, except POST /api/sync, which
delegates to sync.sync_all(). Also serves frontend/ as static files (see
docs/frontend-architecture.md), so `python cli.py serve` is the only thing
that needs to be running for local dev.

Reshaping raw store points into the api-contract.md response shapes is now
confirmed against a real backend/data/health_data.json (synced live
2026-08-18) for all four metrics - see the "Reshaping notes" comments below.
"""

import json
import mimetypes
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import store
import sync

FRONTEND_DIR = (Path(__file__).parent.parent / "frontend").resolve()
DEFAULT_HOST = "localhost"
DEFAULT_PORT = 8000

KNOWN_METRICS = ("steps", "heart_rate", "sleep", "activity")

# Default lookback window, in days (inclusive of `to`), when a request omits
# `from` - per docs/api-contract.md ("last 7 days" for the dashboard summary,
# "last 30 days" for a single-metric detail view).
DEFAULT_SUMMARY_RANGE_DAYS = 7
DEFAULT_DETAIL_RANGE_DAYS = 30


# ---------------------------------------------------------------------------
# Date range helpers
# ---------------------------------------------------------------------------

def _parse_range(query, default_days):
    today = date.today()
    to_str = query.get("to", [None])[0]
    from_str = query.get("from", [None])[0]
    to_d = date.fromisoformat(to_str) if to_str else today
    from_d = date.fromisoformat(from_str) if from_str else to_d - timedelta(days=default_days - 1)
    return from_d, to_d


def _in_range(date_str, from_d, to_d):
    if not date_str:
        return False
    try:
        d = date.fromisoformat(date_str)
    except ValueError:
        return False
    return from_d <= d <= to_d


# ---------------------------------------------------------------------------
# Raw-point field extraction
#
# Reshaping notes: field paths below are confirmed against a real synced
# backend/data/health_data.json (live account, 2026-08-18) for all four
# metrics - see docs/backend-architecture.md. Each metric's payload nests
# its fields under a key named after the Google data type (`heartRate`,
# `sleep`, `exercise`), except `steps`' dailyRollUp points, which are flat.
# ---------------------------------------------------------------------------

def _to_number(value):
    if value is None:
        return None
    try:
        if isinstance(value, str):
            return float(value) if "." in value else int(value)
        return value
    except (TypeError, ValueError):
        return None


def _civil_value_to_date(value):
    """Best-effort YYYY-MM-DD extraction from one of the time-ish shapes the
    API uses: a plain ISO string, or a dailyRollUp-style
    {"date": {"year", "month", "day"}}.
    """
    if isinstance(value, str):
        return value[:10]
    if isinstance(value, dict):
        d = value.get("date")
        if isinstance(d, dict) and {"year", "month", "day"} <= d.keys():
            return f'{d["year"]:04d}-{d["month"]:02d}-{d["day"]:02d}'
    return None


def _local_date_from_utc(iso_str, offset_str):
    """Converts a UTC "Z"-suffixed instant plus its sibling "<seconds>s"
    utcOffset field (e.g. interval.startTime + interval.startUtcOffset) into
    the local calendar date, per api-contract.md's "always local calendar
    dates" convention. Naive [:10] truncation of the UTC string is wrong
    whenever the instant falls near local midnight - see
    docs/backend-architecture.md. Falls back to naive truncation if either
    value isn't in the expected shape.
    """
    if not isinstance(iso_str, str):
        return None
    try:
        instant = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    except ValueError:
        return iso_str[:10] if len(iso_str) >= 10 else None
    offset_seconds = 0
    if isinstance(offset_str, str) and offset_str.endswith("s"):
        offset_seconds = _to_number(offset_str[:-1]) or 0
    return (instant + timedelta(seconds=offset_seconds)).date().isoformat()


def _parse_duration_seconds(value):
    """Parses a duration string like "1813.200s" (as seen on
    exercise.activeDuration) into seconds, or None."""
    if not isinstance(value, str) or not value.endswith("s"):
        return None
    return _to_number(value[:-1])


# ---------------------------------------------------------------------------
# Per-metric reshaping: raw store points -> docs/api-contract.md shapes
# ---------------------------------------------------------------------------

def _reshape_steps(points):
    """dailyRollUp points are flat: civilStartTime/civilEndTime are
    {"date": {year, month, day}, "time": {}} and the count lives at
    steps.countSum."""
    totals = {}
    for p in points:
        d = _civil_value_to_date(p.get("civilStartTime")) or _civil_value_to_date(p.get("civilEndTime"))
        count = _to_number((p.get("steps") or {}).get("countSum"))
        if d is None or count is None:
            continue
        totals[d] = totals.get(d, 0) + count
    return [{"date": d, "value": v} for d, v in sorted(totals.items())]


def _reshape_heart_rate(points):
    """Approximates a daily "resting" value as the minimum bpm sample seen
    that day, since heart_rate is read as intraday samples, not a
    dedicated resting-heart-rate data type. Fields live under
    heartRate.sampleTime.civilTime.date (preferred, already local) or
    heartRate.sampleTime.physicalTime + .utcOffset (converted to local -
    see _local_date_from_utc), and heartRate.beatsPerMinute."""
    by_date = {}
    for p in points:
        heart_rate = p.get("heartRate")
        if not isinstance(heart_rate, dict):
            continue
        sample_time = heart_rate.get("sampleTime")
        if not isinstance(sample_time, dict):
            continue
        d = _civil_value_to_date(sample_time.get("civilTime")) or _local_date_from_utc(
            sample_time.get("physicalTime"), sample_time.get("utcOffset")
        )
        bpm = _to_number(heart_rate.get("beatsPerMinute"))
        if d is None or bpm is None:
            continue
        by_date.setdefault(d, []).append(bpm)
    return [{"date": d, "resting": min(values)} for d, values in sorted(by_date.items())]


def _reshape_sleep(points):
    """One record per sleep session, keyed by the local date the session
    ended on (sleep is fetched by civil_end_time - see
    docs/backend-architecture.md). Fields live under sleep.interval (paired
    with sleep.interval.endUtcOffset/startUtcOffset - see
    _local_date_from_utc), sleep.summary (minutesAsleep), and
    sleep.summary.stagesSummary (a list of {type, minutes, count} - types
    seen live: AWAKE, LIGHT, DEEP, REM). Stage durations default to 0 for
    any stage type absent from stagesSummary."""
    records = []
    for p in points:
        sleep = p.get("sleep")
        if not isinstance(sleep, dict):
            continue
        interval = sleep.get("interval")
        if not isinstance(interval, dict):
            continue
        d = _local_date_from_utc(interval.get("endTime"), interval.get("endUtcOffset")) or _local_date_from_utc(
            interval.get("startTime"), interval.get("startUtcOffset")
        )
        if d is None:
            continue
        summary = sleep.get("summary") or {}
        duration = _to_number(summary.get("minutesAsleep")) or 0
        stages = {"light": 0, "deep": 0, "rem": 0, "awake": 0}
        for stage in summary.get("stagesSummary") or []:
            if not isinstance(stage, dict):
                continue
            key = str(stage.get("type", "")).lower()
            if key in stages:
                stages[key] += _to_number(stage.get("minutes")) or 0
        records.append({"date": d, "duration_minutes": duration, "stages": stages})
    return sorted(records, key=lambda r: r["date"])


def _reshape_activity(points):
    """Fields live under exercise.interval (paired with
    exercise.interval.startUtcOffset/endUtcOffset - see
    _local_date_from_utc), exercise.exerciseType, and
    exercise.metricsSummary (caloriesKcal). Duration comes from
    exercise.activeDuration, a "<seconds>s" string."""
    by_date = {}
    for p in points:
        exercise = p.get("exercise")
        if not isinstance(exercise, dict):
            continue
        interval = exercise.get("interval")
        if not isinstance(interval, dict):
            continue
        d = _local_date_from_utc(interval.get("startTime"), interval.get("startUtcOffset")) or _local_date_from_utc(
            interval.get("endTime"), interval.get("endUtcOffset")
        )
        if d is None:
            continue
        metrics_summary = exercise.get("metricsSummary") or {}
        duration_seconds = _parse_duration_seconds(exercise.get("activeDuration"))
        record = {
            "type": exercise.get("exerciseType") or exercise.get("displayName"),
            "duration_minutes": round(duration_seconds / 60, 1) if duration_seconds is not None else None,
            "calories": _to_number(metrics_summary.get("caloriesKcal")),
        }
        by_date.setdefault(d, []).append(record)
    return [{"date": d, "exercises": ex} for d, ex in sorted(by_date.items())]


_RESHAPERS = {
    "steps": _reshape_steps,
    "heart_rate": _reshape_heart_rate,
    "sleep": _reshape_sleep,
    "activity": _reshape_activity,
}


def _metric_records(data_store, metric, from_d, to_d):
    raw_points = data_store.get("metrics", {}).get(metric, [])
    try:
        records = _RESHAPERS[metric](raw_points)
    except Exception:
        # Defense in depth alongside the reshapers' own isinstance guards: an
        # unforeseen payload shape degrades this metric to an empty list
        # instead of a request-killing 500, per api-contract.md's "present
        # but empty" convention.
        return []
    return [r for r in records if _in_range(r["date"], from_d, to_d)]


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # quiet by default; uncomment for request-level debugging

    # -- helpers --------------------------------------------------------

    def _send_json(self, status, body):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def _send_error_json(self, status, message):
        self._send_json(status, {"error": message})

    def _send_static_file(self):
        rel_path = unquote(urlparse(self.path).path)
        if rel_path == "/":
            rel_path = "/index.html"

        candidate = (FRONTEND_DIR / rel_path.lstrip("/")).resolve()
        if FRONTEND_DIR not in candidate.parents and candidate != FRONTEND_DIR:
            self._send_error_json(404, "not found")
            return
        if not candidate.is_file():
            self._send_error_json(404, "not found")
            return

        content_type, _ = mimetypes.guess_type(str(candidate))
        body = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # -- routes -----------------------------------------------------------

    def _handle_health(self):
        last_modified = None
        if store.DATA_PATH.exists():
            mtime = store.DATA_PATH.stat().st_mtime
            last_modified = datetime.utcfromtimestamp(mtime).strftime("%Y-%m-%dT%H:%M:%SZ")
        self._send_json(200, {"status": "ok", "data_store_last_modified": last_modified})

    def _handle_metrics_summary(self, query):
        from_d, to_d = _parse_range(query, DEFAULT_SUMMARY_RANGE_DAYS)
        data_store = store.load_store()
        metrics = {m: _metric_records(data_store, m, from_d, to_d) for m in KNOWN_METRICS}
        self._send_json(200, {"from": from_d.isoformat(), "to": to_d.isoformat(), "metrics": metrics})

    def _handle_metric_detail(self, metric, query):
        if metric not in KNOWN_METRICS:
            self._send_error_json(404, f"unknown metric: {metric}")
            return
        from_d, to_d = _parse_range(query, DEFAULT_DETAIL_RANGE_DAYS)
        data_store = store.load_store()
        records = _metric_records(data_store, metric, from_d, to_d)
        self._send_json(200, {
            "metric": metric,
            "from": from_d.isoformat(),
            "to": to_d.isoformat(),
            "records": records,
        })

    def _handle_sync(self):
        try:
            results = sync.sync_all()
        except Exception as exc:  # noqa: BLE001 - surfaced to the caller as a 502
            self._send_error_json(502, f"sync failed: {exc}")
            return
        self._send_json(200, {
            "status": "ok",
            "synced": results,
            "synced_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        })

    # -- dispatch -----------------------------------------------------------

    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        if parsed.path == "/api/health":
            self._handle_health()
        elif parsed.path == "/api/metrics":
            self._handle_metrics_summary(query)
        elif parsed.path.startswith("/api/metrics/"):
            metric = parsed.path[len("/api/metrics/"):]
            self._handle_metric_detail(metric, query)
        elif parsed.path.startswith("/api/"):
            self._send_error_json(404, "not found")
        else:
            self._send_static_file()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/sync":
            self._handle_sync()
        else:
            self._send_error_json(404, "not found")

    def do_OPTIONS(self):
        # CORS preflight support, for the frontend-served-separately case
        # described in docs/local-dev-setup.md.
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


def run(host=DEFAULT_HOST, port=DEFAULT_PORT):
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Serving query API (and frontend/, if present) on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
