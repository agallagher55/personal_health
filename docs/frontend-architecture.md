# Frontend Architecture (planning)

## Stack

**Vanilla JavaScript, HTML, and CSS — no framework, no build step.** Static files served directly (e.g. by the backend's stdlib HTTP server, or any simple static file server) and loaded straight in the browser via `<script type="module">` so we can still use ES modules without a bundler.

## Dashboard vs. multi-page

Still open, but leaning **dashboard-first**:

- Health data is naturally something you want to glance at as a whole (today's snapshot, recent trends) rather than dig through separate pages for.
- A single dashboard page with cards/widgets per metric (steps, heart rate, sleep, activity) can cover most of v1.
- If specific metrics need more depth than a card allows (e.g. drilling into intraday heart rate, sleep stage breakdowns), those can become separate static HTML pages linked from the dashboard — so it's dashboard-first with room to grow into a few detail pages, not a strict either/or.

## Charting

No charting library to start (keeps this dependency-free like the rest of the stack) — draw simple charts (line/bar sparklines, trend lines) directly with the **Canvas API** or inline **SVG**. Revisit a lightweight charting library only if hand-rolled charts become a real bottleneck.

## Data fetching

Plain `fetch()` calls to the backend's local query API (e.g. `GET /api/metrics/steps?from=2026-08-01&to=2026-08-17`), returning JSON. No client-side state library — a small set of module-scoped JS objects/functions is enough at this scale.

## Proposed module layout

```
frontend/
├── index.html                # dashboard page
├── css/
│   └── styles.css
├── js/
│   ├── api.js                 # fetch() wrappers for the backend query API
│   ├── dashboard.js           # wires up the dashboard page
│   ├── charts.js              # small canvas/SVG chart-drawing helpers
│   └── components/            # small render functions per widget (steps card, sleep card, etc.)
└── pages/                     # optional per-metric detail pages, added as needed
    └── heart-rate.html
```

## v1 dashboard widgets (draft)

- Today's steps (with a small trend sparkline)
- Resting heart rate trend
- Last night's sleep (duration + stages)
- Recent activity/exercise log
- A date range picker to shift the whole dashboard's view window

## Open questions

- How much historical trend data to show by default (last 7 days? 30 days?) vs. letting the user pick a range.
- Whether to add a "sync now" button that calls the backend to pull fresh data on demand.
- Mobile-friendliness — not a priority for v1 but worth keeping the layout responsive (plain CSS flexbox/grid) from the start.
- At what point (if ever) hand-rolled charts justify pulling in a small charting library — revisit once we see real widgets built.
