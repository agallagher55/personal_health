"""Read/write helpers for the local JSON health-data store
(backend/data/health_data.json - see docs/backend-architecture.md).

Stores the raw data points returned by the Google Health API, grouped by
our metric name, plus a last-synced date per metric. Storing the raw
points (rather than remapping into a custom shape) avoids losing or
misrepresenting fields we haven't fully verified the schema of - see the
caveats in google_health_client.py. Any friendlier shaping for the
frontend (docs/api-contract.md) happens in server.py at serve time, not
here.
"""

import json
from pathlib import Path

DATA_PATH = Path(__file__).parent / "data" / "health_data.json"


def load_store():
    if not DATA_PATH.exists():
        return {"metrics": {}, "last_synced": {}}
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_store(store):
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2)


def add_data_points(store, metric, data_points):
    """Merge new raw data points into the store under `metric`, de-duped by
    the Google Health API's own point identifier so re-running sync over
    an overlapping date range doesn't create duplicates.
    """
    existing = store.setdefault("metrics", {}).setdefault(metric, [])
    seen = {_point_key(p) for p in existing}
    for point in data_points:
        key = _point_key(point)
        if key not in seen:
            existing.append(point)
            seen.add(key)


def _point_key(point):
    # `name` is the resource path Google assigns list-read points; points
    # without one (e.g. from a reconcile-style read) fall back to `time`.
    return point.get("name") or point.get("time")
