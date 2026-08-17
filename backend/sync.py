"""Orchestrates pulling data from the Google Health API into the local
JSON store (see docs/backend-architecture.md).
"""

from datetime import date, timedelta

import google_health_client
import store
from auth import get_valid_access_token

# How far back to pull the first time a given metric has never been synced.
DEFAULT_BACKFILL_DAYS = 30


def sync_all(metrics=None):
    """Sync each metric from its last-synced date (or DEFAULT_BACKFILL_DAYS
    ago, if never synced) through today. Returns {metric: points_fetched}.
    """
    metrics = metrics or list(google_health_client.DATA_TYPES.keys())
    access_token = get_valid_access_token()
    data_store = store.load_store()
    today = date.today()

    results = {}
    for metric in metrics:
        last_synced = data_store.get("last_synced", {}).get(metric)
        from_date = (
            date.fromisoformat(last_synced)
            if last_synced
            else today - timedelta(days=DEFAULT_BACKFILL_DAYS)
        )

        points = google_health_client.list_data_points(
            metric, from_date.isoformat(), today.isoformat(), access_token
        )
        store.add_data_points(data_store, metric, points)
        data_store.setdefault("last_synced", {})[metric] = today.isoformat()
        results[metric] = len(points)

    store.save_store(data_store)
    return results
