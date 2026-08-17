# Planning

## What we're building

A personal system to pull health/fitness data from a Fitbit device and Google's health APIs, store it, and explore it through a self-built dashboard.

## Data source research (important, needs confirming)

There are actually a few different Google/Fitbit APIs, and picking the right one matters:

- **Fitbit Web API** — the direct way to pull data from a Fitbit account (steps, heart rate, sleep stages, SpO2, HRV, activity, etc.). Uses OAuth 2.0. This is likely our primary/most reliable source since the device is a Fitbit.
- **Google Fit API (REST)** — Google's older fitness data API. Officially deprecated (Google has announced shutdown of the Fit API/app in 2026). Worth confirming current status before building against it.
- **Health Connect API** — Google's newer on-device health data platform (Android). Fitbit data is being merged into this ecosystem, but it's primarily an on-device Android API, not a cloud REST API, so it doesn't fit a Python backend directly.

**Decision (starting point):** build against the **Fitbit Web API** first, since it's the most direct path to real device data and has a stable, well-documented cloud REST API + OAuth flow. Revisit Google Fit / Health Connect once we see what Fitbit alone gives us. Update this doc once confirmed.

## Scope for v1

- [ ] Register a Fitbit developer app, get OAuth working
- [ ] Pull a handful of data types to start: steps, heart rate (intraday if scope allows), sleep, activity/exercise logs
- [ ] Store data locally (start simple — SQLite — revisit if needed)
- [ ] Backend API to query stored data by date range / metric
- [ ] Basic front end to view the data
- [ ] Expand to more data types once the pipeline works end-to-end

## Open questions

- **Dashboard vs. multi-page site?** Leaning dashboard — a single view with multiple charts/widgets (today's snapshot, trends over time) feels more natural for health data than separate pages per metric. Could add dedicated pages per metric later if the dashboard gets crowded. See [`docs/frontend-architecture.md`](./docs/frontend-architecture.md).
- **How much history to pull?** Fitbit rate-limits API calls (150 requests/hour per user by default) — need a backfill strategy for historical data vs. ongoing sync.
- **Auth storage:** where/how to store OAuth tokens safely for a personal single-user project (env file vs. simple encrypted store).
- **Hosting:** run locally to start, or deploy somewhere? Not needed for v1.

## Next steps

1. Flesh out backend architecture — see [`docs/backend-architecture.md`](./docs/backend-architecture.md)
2. Flesh out frontend architecture — see [`docs/frontend-architecture.md`](./docs/frontend-architecture.md)
3. Register Fitbit developer app and get a first successful OAuth + data pull working end-to-end before building anything else out.
