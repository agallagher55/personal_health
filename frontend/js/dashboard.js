import { getMetrics, triggerSync } from "./api.js";
import { renderSteps } from "./components/steps-card.js";
import { renderHeartRate } from "./components/heart-rate-card.js";
import { renderSleep } from "./components/sleep-card.js";
import { renderActivity } from "./components/activity-card.js";

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
};

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
      setStatus(`Synced (${counts})`);
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
