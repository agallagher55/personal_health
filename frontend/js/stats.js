// Rolling-window + distribution statistics for a metric detail page's
// sidebar (see issue #39): 7/14/30-day trailing averages plus the
// average, median, min, and max over whatever range is currently loaded.

export function average(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function addDays(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * `dateFor`/`valueFor` extract the date string and numeric value from each
 * record - records are shaped differently per metric (see pages/*.js).
 * Trailing windows are relative to the latest date present in `records`
 * rather than today, so a narrowed date-range selection still produces
 * sensible windows instead of always looking past the loaded data.
 */
export function computeMetricStats(records, { dateFor = (r) => r.date, valueFor = (r) => r.value } = {}) {
  const points = records
    .map((r) => ({ date: dateFor(r), value: valueFor(r) }))
    .filter((p) => typeof p.value === "number" && !Number.isNaN(p.value));

  if (points.length === 0) return null;

  const latestDate = points.reduce((max, p) => (p.date > max ? p.date : max), points[0].date);

  function windowAverage(days) {
    const cutoff = addDays(latestDate, -(days - 1));
    return average(points.filter((p) => p.date >= cutoff).map((p) => p.value));
  }

  const allValues = points.map((p) => p.value);

  return {
    week: windowAverage(7),
    twoWeek: windowAverage(14),
    month: windowAverage(30),
    average: average(allValues),
    median: median(allValues),
    min: Math.min(...allValues),
    max: Math.max(...allValues),
  };
}
