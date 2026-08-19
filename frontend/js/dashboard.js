import { getMetrics, triggerSync } from "./api.js";
import { renderSteps } from "./components/steps-card.js";
import { renderHeartRate } from "./components/heart-rate-card.js";
import { renderSleep } from "./components/sleep-card.js";
import { renderActivity } from "./components/activity-card.js";
import { renderSimpleValueCard } from "./components/simple-value-card.js";
import { renderWeightCard } from "./components/weight-card.js";

const els = {
  form: document.getElementById("range-form"),
  from: document.getElementById("range-from"),
  to: document.getElementById("range-to"),
  sync: document.getElementById("sync-now"),
  status: document.getElementById("status"),
  steps: document.getElementById("steps-card-body"),
  heartRate: document.getElementById("heart-rate-card-body"),
  sleep: document.getElementById("sleep-card-body"),
  activity: document.getElementById("activity-card-body"),
  spo2: document.getElementById("spo2-card-body"),
  hrv: document.getElementById("hrv-card-body"),
  breathingRate: document.getElementById("breathing-rate-card-body"),
  temperature: document.getElementById("temperature-card-body"),
  weight: document.getElementById("weight-card-body"),
};

// Matches the per-metric styling used on each metric's own detail page
// (js/pages/{spo2,hrv,breathing-rate,temperature}.js). `weight` is handled
// separately below via renderWeightCard, since it's the only one with a
// unit toggle (kg/lbs).
const SIMPLE_VALUE_METRICS = [
  { key: "spo2", el: "spo2", unit: "%", color: "#0891b2", decimals: 1 },
  { key: "hrv", el: "hrv", unit: " ms", color: "#9333ea", decimals: 1 },
  { key: "breathing_rate", el: "breathingRate", unit: " br/min", color: "#0d9488", decimals: 1 },
  { key: "temperature", el: "temperature", unit: "°C", color: "#ea580c", decimals: 2 },
];

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Matches docs/api-contract.md's dashboard default: last 7 days.
function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  return { from: isoDate(from), to: isoDate(to) };
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("status-error", isError);
}

function currentRange() {
  const fallback = defaultRange();
  return { from: els.from.value || fallback.from, to: els.to.value || fallback.to };
}

async function loadDashboard(from, to) {
  setStatus("Loading…");
  try {
    const data = await getMetrics(from, to);
    renderSteps(els.steps, data.metrics.steps);
    renderHeartRate(els.heartRate, data.metrics.heart_rate);
    renderSleep(els.sleep, data.metrics.sleep);
    renderActivity(els.activity, data.metrics.activity);
    for (const m of SIMPLE_VALUE_METRICS) {
      renderSimpleValueCard(els[m.el], data.metrics[m.key] || [], {
        unit: m.unit,
        color: m.color,
        decimals: m.decimals,
      });
    }
    renderWeightCard(els.weight, data.metrics.weight || []);
    setStatus(`Showing ${data.from} to ${data.to}`);
  } catch (err) {
    setStatus(`Failed to load: ${err.message}`, true);
  }
}

function init() {
  const initial = defaultRange();
  els.from.value = initial.from;
  els.to.value = initial.to;

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const { from, to } = currentRange();
    loadDashboard(from, to);
  });

  els.sync.addEventListener("click", async () => {
    els.sync.disabled = true;
    setStatus("Syncing…");
    try {
      const result = await triggerSync();
      const counts = Object.entries(result.synced)
        .map(([metric, count]) => `${metric}: ${count}`)
        .join(", ");
      // A partial failure (see docs/api-contract.md's POST /api/sync) still
      // means the other metrics genuinely synced - report both rather than
      // hiding the failure or treating the whole sync as an error.
      if (result.errors && Object.keys(result.errors).length > 0) {
        const failed = Object.keys(result.errors).join(", ");
        setStatus(`Synced (${counts}) — failed: ${failed}`, true);
      } else {
        setStatus(`Synced (${counts})`);
      }
    } catch (err) {
      setStatus(`Sync failed: ${err.message}`, true);
    } finally {
      els.sync.disabled = false;
      const { from, to } = currentRange();
      loadDashboard(from, to);
    }
  });

  loadDashboard(initial.from, initial.to);
}

init();
