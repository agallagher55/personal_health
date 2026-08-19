import { initMetricDetailPage } from "./metric-detail.js";
import { drawSparkline } from "../charts.js";

function renderChart(canvas, records) {
  drawSparkline(canvas, records.map((r) => r.resting), {
    color: "#dc2626",
    labels: records.map((r) => r.date),
  });
}

function renderTable(tbody, records) {
  tbody.innerHTML = "";
  for (const r of [...records].reverse()) {
    const tr = document.createElement("tr");
    const date = document.createElement("td");
    date.textContent = r.date;
    const resting = document.createElement("td");
    resting.textContent = `${r.resting} bpm`;
    tr.append(date, resting);
    tbody.appendChild(tr);
  }
}

initMetricDetailPage("heart_rate", { title: "Resting Heart Rate", renderChart, renderTable });
