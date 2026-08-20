# Frontend Architecture

## Stack

**Vanilla JavaScript, HTML, and CSS. No framework, no build step.** Static
files served by the backend's stdlib HTTP server (`python cli.py serve`)
and loaded straight in the browser via `<script type="module">`, so ES
modules are usable without a bundler.

## Dashboard + per-metric detail pages

Implemented as dashboard-first, with a detail page per metric, per the
original plan in this doc:

- `frontend/index.html` is the dashboard: one card per metric (steps,
  resting heart rate, sleep, activity, SpO2, HRV, breathing rate, body
  temperature, weight), each with a title, an icon, a small chart, and a
  link to that metric's own detail page.
- Every metric has its own static HTML page under `frontend/pages/`
  (`steps.html`, `heart-rate.html`, `sleep.html`, `activity.html`,
  `spo2.html`, `hrv.html`, `breathing-rate.html`, `temperature.html`,
  `weight.html`), showing a larger chart and a table of records over a
  wider default range than the dashboard card gives.
- A shared header (title, date-range form, "Sync now" button, "Last
  synced" label) is rendered by `js/components/page-header.js` and reused
  by both the dashboard and every detail page, wired up by
  `js/sync-control.js`.

## Charting

No charting library. Charts are drawn with the **Canvas API**, in
`js/charts.js`:

- `drawSparkline()` for line trends (steps, heart rate, SpO2, HRV,
  breathing rate, temperature).
- `drawBarChart()` for per-day totals.
- `drawStackedBar()` for sleep-stage breakdowns.

All three are DPI-aware (scale to `devicePixelRatio`), skip gaps rather
than interpolating across missing days, and label selectively (min/max
extremes and the first/last date on the axis) instead of labeling every
point. This has held up through nine metrics' worth of widgets without
becoming a bottleneck, so there is no plan to add a charting library.

## Data fetching

Plain `fetch()` calls to the backend's local query API via `js/api.js`
(`getHealth`, `getMetrics`, `getMetricDetail`, `triggerSync`), all
same-origin relative paths, assuming the frontend is served by the same
backend it's calling. No client-side state library. A small set of
module-scoped functions and DOM references per page is enough at this
scale.

## Module layout (actual)

```
frontend/
├── index.html                    # dashboard page
├── css/
│   └── styles.css                # includes responsive grid + media queries
├── js/
│   ├── api.js                    # fetch() wrappers for the backend query API
│   ├── dashboard.js               # wires up the dashboard page
│   ├── charts.js                  # canvas chart-drawing helpers
│   ├── sync-control.js            # shared "Sync now" + "Last synced" wiring
│   ├── units.js                   # weight display-unit (kg/lb) preference, via localStorage
│   ├── components/
│   │   ├── page-header.js         # shared title + date-range form + sync button
│   │   ├── steps-card.js
│   │   ├── heart-rate-card.js
│   │   ├── sleep-card.js
│   │   ├── activity-card.js
│   │   ├── activity-icons.js      # per-exercise-type icons
│   │   ├── simple-value-card.js   # shared card for {date, value} metrics (spo2, hrv, breathing_rate, temperature)
│   │   └── weight-card.js         # like simple-value-card, plus the kg/lb toggle
│   └── pages/
│       ├── metric-detail.js       # shared range/sync/load wiring for every detail page
│       ├── simple-value-metric.js # shared chart/table rendering for spo2/hrv/breathing_rate/temperature
│       ├── steps.js
│       ├── heart-rate.js
│       ├── sleep.js
│       ├── activity.js
│       ├── spo2.js
│       ├── hrv.js
│       ├── breathing-rate.js
│       ├── temperature.js
│       └── weight.js
└── pages/                         # one static HTML shell per metric detail page
    ├── steps.html
    ├── heart-rate.html
    ├── sleep.html
    ├── activity.html
    ├── spo2.html
    ├── hrv.html
    ├── breathing-rate.html
    ├── temperature.html
    └── weight.html
```

## Dashboard widgets (implemented)

- Steps: today's total plus a trend sparkline.
- Resting heart rate: approximated as the minimum bpm sample seen each
  day (see `docs/backend-architecture.md`), with a trend sparkline.
- Sleep: last night's duration plus a stacked bar of sleep stages.
- Activity: a timeline of logged exercises, each with a type icon,
  duration, and calories.
- SpO2, HRV, breathing rate, body temperature: a shared "simple value"
  card layout (`components/simple-value-card.js`), each with its own
  color and unit, showing the latest value and a trend sparkline.
- Weight: like the simple-value cards, with a kg/lb display toggle
  (`js/units.js`) remembered per browser via `localStorage`. Values
  always travel over the wire in kg, per `docs/api-contract.md`.
- A date-range form in the shared header lets the whole dashboard's view
  window be shifted; a "Sync now" button triggers `POST /api/sync` and
  reloads once it settles, showing a "Last synced" relative timestamp.

## Resolved (previously open) questions

- **How much historical trend data to show by default:** the dashboard
  defaults to the last 7 days, detail pages default to the last 30 days,
  both matching `docs/api-contract.md`. Either can be widened with the
  date-range form.
- **"Sync now" button:** implemented, shared across every page via
  `sync-control.js`. A partial sync failure (per `docs/api-contract.md`'s
  `POST /api/sync` contract) is surfaced in the status line rather than
  hidden.
- **Charting library:** not needed. Hand-rolled canvas charts have covered
  every widget built so far (sparklines, bar charts, a stacked bar).
- **Mobile-friendliness:** `css/styles.css` uses flexbox and a
  `grid-template-columns: repeat(auto-fit, minmax(...))` dashboard grid
  with breakpoints at 700px and 480px, so the layout reflows on narrow
  screens.

## Open questions

- No automated tests (unit or end-to-end) exist for any frontend module.
  Given how much of the chart/reshape logic has nontrivial edge cases
  (gaps, single-point series, unit conversion), this is a real gap, not
  just a nice-to-have.
- No loading/error UI beyond the plain-text status line (`setStatus()`
  in `dashboard.js` / `metric-detail.js`). Acceptable for a single-user
  local tool, but worth revisiting if this is ever shown to anyone else.
