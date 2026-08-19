import { initMetricDetailPage } from "./metric-detail.js";
import { drawBarChart } from "../charts.js";

function renderChart(canvas, records) {
  drawBarChart(canvas, records.map((r) => r.value), {
    color: "#2563eb",
    labels: records.map((r) => r.date),
  });
}

function renderTable(tbody, records) {
  tbody.innerHTML = "";
  for (const r of [...records].reverse()) {
    const tr = document.createElement("tr");
    const date = document.createElement("td");
    date.textContent = r.date;
    const value = document.createElement("td");
    value.textContent = r.value.toLocaleString();
    tr.append(date, value);
    tbody.appendChild(tr);
  }
}

initMetricDetailPage("steps", { title: "Steps", renderChart, renderTable });
