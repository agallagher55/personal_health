import { initMetricDetailPage } from "./metric-detail.js";
import { drawSparkline } from "../charts.js";

function renderChart(canvas, records) {
  drawSparkline(canvas, records.map((r) => r.value), { color: "#2563eb" });
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

initMetricDetailPage("steps", { renderChart, renderTable });
