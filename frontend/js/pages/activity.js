import { initMetricDetailPage } from "./metric-detail.js";
import { drawSparkline } from "../charts.js";

function formatType(type) {
  if (!type) return "Activity";
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// One record per day with multiple exercises - chart the day's total active
// minutes, since a per-exercise sparkline wouldn't have a single y-value.
function renderChart(canvas, records) {
  const totals = records.map((r) =>
    r.exercises.reduce((sum, ex) => sum + (typeof ex.duration_minutes === "number" ? ex.duration_minutes : 0), 0)
  );
  drawSparkline(canvas, totals, {
    color: "#16a34a",
    labels: records.map((r) => r.date),
  });
}

function renderTable(tbody, records) {
  tbody.innerHTML = "";
  const flattened = [];
  for (const day of records) {
    for (const ex of day.exercises) {
      flattened.push({ date: day.date, ...ex });
    }
  }
  flattened.sort((a, b) => (a.date < b.date ? 1 : -1));

  for (const ex of flattened) {
    const tr = document.createElement("tr");
    const cells = [
      ex.date,
      formatType(ex.type),
      typeof ex.duration_minutes === "number" ? `${ex.duration_minutes} min` : "--",
      typeof ex.calories === "number" ? `${ex.calories} cal` : "--",
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

initMetricDetailPage("activity", { title: "Activity", renderChart, renderTable });
