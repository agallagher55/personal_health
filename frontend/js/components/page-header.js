// Reusable app header: page title, the date-range filter form, and an
// optional sync/update control. Every page (the dashboard and each metric
// detail page) used to hand-roll this same markup; centralizing it here
// keeps them in sync and gives each page one place to wire up listeners.
export function renderPageHeader(container, { title, showSync = false } = {}) {
  container.innerHTML = `
    <h1>${title}</h1>
    <form class="range-controls" id="range-form">
      <label>From <input type="date" id="range-from" /></label>
      <label>To <input type="date" id="range-to" /></label>
      <button type="submit" id="range-apply">Apply</button>
      ${showSync ? `
      <button type="button" id="sync-now">Sync now</button>
      <span id="last-synced" class="last-synced"></span>` : ""}
    </form>
  `;

  return {
    form: container.querySelector("#range-form"),
    from: container.querySelector("#range-from"),
    to: container.querySelector("#range-to"),
    sync: container.querySelector("#sync-now"),
    lastSynced: container.querySelector("#last-synced"),
  };
}
