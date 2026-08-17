# Frontend Architecture (planning)

## Dashboard vs. multi-page

Still open, but leaning **dashboard-first**:

- Health data is naturally something you want to glance at as a whole (today's snapshot, recent trends) rather than dig through separate pages for.
- A single dashboard with cards/widgets per metric (steps, heart rate, sleep, activity) can cover most of v1.
- If specific metrics need more depth than a card allows (e.g. drilling into intraday heart rate, sleep stage breakdowns), those can become dedicated **detail pages** navigated to from the dashboard — so it's dashboard-first with room to grow into a few detail pages, not a strict either/or.

## Proposed stack

- **React** with **Vite** for the build tooling (fast, simple, minimal config).
- **TypeScript** for type safety against the backend's API responses.
- Charting: **Recharts** or **visx** for time-series/health data visualization.
- Data fetching: **TanStack Query** (React Query) — good fit for caching/refetching API data.
- Styling: keep simple to start — plain CSS or a lightweight utility framework (Tailwind) — decide once we see the dashboard taking shape.

## Proposed module layout

```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/               # typed client for our backend's query API
│   ├── components/
│   │   ├── dashboard/      # dashboard layout + metric cards
│   │   └── charts/         # reusable chart components
│   ├── pages/              # dashboard.tsx, plus per-metric detail pages as needed
│   └── types/               # shared types mirroring backend response shapes
├── index.html
├── package.json
└── vite.config.ts
```

## v1 dashboard widgets (draft)

- Today's steps (with a small trend sparkline)
- Resting heart rate trend
- Last night's sleep (duration + stages)
- Recent activity/exercise log
- A date range picker to shift the whole dashboard's view window

## Open questions

- How much historical trend data to show by default (last 7 days? 30 days?) vs. letting the user pick a range.
- Whether to add a "sync now" button that triggers the backend to pull fresh data on demand, or rely on background sync.
- Mobile-friendliness — not a priority for v1 but worth keeping the layout responsive from the start.
