// fetch() wrappers for the backend query API (see docs/api-contract.md).
// Same-origin relative paths - assumes the frontend is served by the
// backend itself (`python cli.py serve`), per docs/local-dev-setup.md.

async function getJSON(path) {
  const res = await fetch(path);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((body && body.error) || `${res.status} ${res.statusText}`);
  }
  return body;
}

function rangeQuery(from, to) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function getHealth() {
  return getJSON("/api/health");
}

export function getMetrics(from, to) {
  return getJSON(`/api/metrics${rangeQuery(from, to)}`);
}

export function getMetricDetail(metric, from, to) {
  return getJSON(`/api/metrics/${encodeURIComponent(metric)}${rangeQuery(from, to)}`);
}

// `from`/`to` here are full ISO 8601 UTC instants (e.g. an activity's own
// start_time/end_time), not the bare dates rangeQuery() builds elsewhere -
// see docs/api-contract.md's GET /api/metrics/{metric}/samples.
export function getMetricSamples(metric, fromInstant, toInstant) {
  const params = new URLSearchParams({ from: fromInstant, to: toInstant });
  return getJSON(`/api/metrics/${encodeURIComponent(metric)}/samples?${params.toString()}`);
}

export async function triggerSync() {
  const res = await fetch("/api/sync", { method: "POST" });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((body && body.error) || `${res.status} ${res.statusText}`);
  }
  return body;
}
