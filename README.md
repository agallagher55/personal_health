# Personal Health

A personal project for exploring health data APIs — starting with **Google Health Connect / Google Fit APIs** and a **Fitbit (Fitbit Charge / Fitbit Air-tracked)** account — and building a system to pull, store, and visualize as much of that data as possible.

## Goals

- Learn the Google Health API / Google Fit ecosystem hands-on.
- Pull personal health data from a connected Fitbit device (steps, heart rate, sleep, SpO2, activity, etc.).
- Build a Python backend that authenticates with the relevant APIs, fetches data on a schedule or on demand, and exposes it through a queryable API of our own.
- Build a front end to explore and visualize that data (dashboard and/or per-metric pages — still deciding, see [`planning.md`](./planning.md)).

## Project Structure (planned)

```
personal_health/
├── README.md
├── planning.md              # high-level planning and open questions
├── docs/
│   ├── backend-architecture.md
│   └── frontend-architecture.md
├── backend/                 # Python backend (API clients, storage, API server)
└── frontend/                # web front end
```

## Tech Stack (planned)

- **Backend:** Python
- **Frontend:** TBD (leaning toward a dashboard-style single page app — see planning doc)
- **Data sources:** Fitbit Web API, Google Fit / Health Connect API

## Status

Early planning stage. See [`planning.md`](./planning.md) for current thinking and open decisions.
