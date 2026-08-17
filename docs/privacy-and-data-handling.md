# Privacy & Data Handling

This project pulls and stores real personal health data. Short doc on what that data is, where it lives, and how it's kept out of places it shouldn't be. Read alongside [`google_health.md`](../google_health.md) (how access is granted) and [`docs/backend-architecture.md`](./backend-architecture.md) (how it's stored).

## What data this project touches

Whatever the scopes in `google_health.md` grant, pulled via the Google Health API — for v1: steps, heart rate, sleep, activity/exercise logs, and any other metrics added later (see the priority list in `backend-architecture.md`). This is personal biometric/health data, not synthetic or test data.

## Where it lives

- **OAuth credentials & tokens** — `backend/config.json` (Client ID/Secret, refresh token).
- **Pulled health data** — `backend/data/health_data.json`.
- Both files are **local only**, on disk, on your machine. Nothing in this project pushes data to a third-party server, analytics service, or cloud store beyond Google's own API (which we call to *pull* data, never to send it elsewhere).

## What's git-ignored (and must stay that way)

Already covered by `.gitignore`:
```
backend/config.json
backend/data/health_data.json
```
Before adding any new file that could hold credentials or real health data (a token cache, an export, a log file with response bodies), add it to `.gitignore` in the same commit — don't rely on remembering later.

**Before every commit**, especially after touching `backend/`, run `git status` and eyeball the file list. If `config.json`, `health_data.json`, or anything unexpected shows as staged, stop and check its contents before committing — a filename alone isn't proof it's safe (e.g. a differently-named debug dump could still contain real data or tokens).

## Scope minimization

Request only the OAuth scopes actually needed for the metrics in use (see the table in `google_health.md` step 5). Don't request write scopes (this project never writes back to Google Health) or scopes for data types not yet built.

## Access surface

- The query API (`docs/api-contract.md`) is served on `localhost` only, with no auth of its own — this is acceptable **only** because it's not exposed beyond your own machine. If this project ever runs somewhere network-reachable (even on a home LAN), add auth to the query API first — don't rely on "nobody else knows the port."
- The OAuth consent screen stays in **unverified/testing mode** with only your own account as a test user (per `google_health.md` step 3) — never submit for Google verification or add other test users, since that would mean sharing access to your own health data pull.

## Token handling

- The refresh token in `config.json` is long-lived credentials to your health data — treat it like a password. Never paste it into a chat, commit message, issue, or log output.
- If a token is ever exposed (accidentally committed, pasted somewhere, etc.), revoke it immediately at [Google Account permissions](https://myaccount.google.com/permissions) (find the app tied to this project's OAuth client and remove access), then redo the OAuth setup with a fresh client if the Client Secret itself was exposed.

## If you ever want to stop / undo

- **Revoke access:** [Google Account permissions](https://myaccount.google.com/permissions) → remove this project's app.
- **Delete local data:** delete `backend/config.json` and `backend/data/health_data.json`. Nothing else on this project's side retains a copy.
- **Delete the Google Cloud project:** removes the OAuth client entirely, if you want to fully tear down setup rather than just revoke access.

## Not doing (by design, for v1)

- No cloud hosting/deployment of pulled data.
- No sharing/export features.
- No analytics, telemetry, or third-party logging in the backend or frontend.
