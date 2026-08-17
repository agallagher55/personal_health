# Local Dev Setup

Day-to-day steps for running this project on your machine, once [`google_health.md`](../google_health.md) has been completed (Google Cloud project + OAuth credentials in place). This doc is about *running* things; `google_health.md` is the one-time account/OAuth setup.

## Prerequisites

- ArcGIS Pro 3.5 installed, with its bundled `arcgispro-py3` Python environment (see [`docs/backend-architecture.md`](./backend-architecture.md) for why — backend code is restricted to packages in this environment, no `pip install`).
- Completed [`google_health.md`](../google_health.md): Google Cloud project created, OAuth client credentials saved locally.
- A modern browser (frontend is vanilla JS/HTML/CSS, no build step, so nothing else to install there).

## 1. Activate the ArcGIS Pro Python environment

The backend must run inside `arcgispro-py3`, not your system Python. From a normal terminal (not the ArcGIS Pro application itself):

**Windows (Python Command Prompt, installed alongside ArcGIS Pro):**
```
"C:\Program Files\ArcGIS\Pro\bin\Python\Scripts\proenv.bat"
```
This drops you into a shell with `arcgispro-py3` already activated. (Look for "Python Command Prompt" in the Start Menu as a shortcut to the same thing.)

**Or, if you're using a plain conda/Anaconda Prompt and ArcGIS Pro's conda is on your PATH:**
```
conda activate arcgispro-py3
```

Confirm you're in the right environment:
```
python -c "import sys; print(sys.executable)"
```
This should point into the ArcGIS Pro installation's `envs\arcgispro-py3` folder, not a system or other conda Python.

## 2. Verify available packages (first time only)

Per [`backend-architecture.md`](./backend-architecture.md), confirm what's actually bundled before relying on it:
```
conda list --prefix "<path-to-arcgispro-py3>"
```
Specifically check for `requests` (used to call the Google Health API). If it's missing, the code falls back to `urllib.request` — see that doc.

## 3. Set up local config (one time)

From the repo root, inside the activated environment:
1. Create `backend/config.json` with the OAuth Client ID/Secret from `google_health.md` step 4. This file is git-ignored — never commit it.
2. Create the `backend/data/` folder if it doesn't exist yet — this is where `health_data.json` (also git-ignored) will be written on first sync.

## 4. Authorize (first run)

```
cd backend
python cli.py auth
```
This runs the OAuth flow once (opens a browser / prints a URL to visit, depending on how `auth.py` implements it), and stores the resulting refresh token in `config.json`. Only needs to be re-run if the refresh token is revoked or expires.

## 5. Pull data

```
python cli.py sync
```
Fetches new data from the Google Health API for the configured data types and writes it into `backend/data/health_data.json`. Safe to re-run — see "Sync management" in `backend-architecture.md` for how it avoids redundant pulls.

## 6. Run the query API server

```
python cli.py serve
```
Starts the stdlib `http.server`-based API (default `http://localhost:8000` — confirm/adjust in `server.py`). Leave this running while using the dashboard.

## 7. Open the frontend

The frontend is static files — no build step. Simplest options:
- Point the backend's server at `frontend/` as static file root (if `server.py` is set up to serve both), then just visit `http://localhost:8000/`.
- Or serve `frontend/` separately with any static file server (e.g. `python -m http.server 5500` from the `frontend/` folder) and open `http://localhost:5500/index.html` — in this case make sure `frontend/js/api.js` points at the backend's actual host/port (`http://localhost:8000`).

Either way, the dashboard calls the endpoints defined in [`docs/api-contract.md`](./api-contract.md).

## Typical loop while developing

```
# one terminal: keep the API server running
python cli.py serve

# another terminal, as needed:
python cli.py sync        # pull fresh data
```
Refresh the browser to see updated data — no build/watch step needed on the frontend.

## Troubleshooting

- **`ModuleNotFoundError` for something backend code imports** — you're probably not in `arcgispro-py3`, or you're relying on a package that isn't actually bundled (re-check step 2).
- **Sync fails with an auth error** — refresh token may have expired/been revoked; re-run `python cli.py auth`.
- **Dashboard loads but shows no data** — confirm `python cli.py sync` has been run at least once, and that `backend/data/health_data.json` exists and isn't empty.
