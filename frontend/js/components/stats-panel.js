// Renders the sidebar stats panel next to a detail page's chart (issue
// #39), from the stats object produced by js/stats.js's computeMetricStats.
export function renderStatsPanel(container, stats, { format = (v) => v.toFixed(1) } = {}) {
  if (!container) return;
  container.innerHTML = "";

  if (!stats) {
    const p = document.createElement("p");
    p.className = "stats-empty";
    p.textContent = "No data for this range.";
    container.appendChild(p);
    return;
  }

  const rows = [
    ["7-day avg", stats.week],
    ["14-day avg", stats.twoWeek],
    ["30-day avg", stats.month],
    ["Average", stats.average],
    ["Median", stats.median],
    ["Min", stats.min],
    ["Max", stats.max],
  ];

  const dl = document.createElement("dl");
  dl.className = "stats-list";
  for (const [label, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value == null ? "--" : format(value);
    dl.append(dt, dd);
  }
  container.appendChild(dl);
}
