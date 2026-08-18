# Google Health API Setup Guide

Everything needed to get from "nothing set up" to "our backend can pull data" for the Google Health API — the account setup, Google Cloud project, and OAuth credentials. Do this once, before running the sync/server for the first time.

This is written from Google's own setup docs (`developers.google.com/health/setup`, `/get-started`, `/developer-checklist`) plus their Fitbit migration docs. Some details (exact console screens/button labels) may drift as Google updates the console — if a step doesn't match what you see, treat this doc as a starting point and follow the console's own prompts.

## 0. Background: why OAuth, and why a Google account for Fitbit

- The Google Health API is the successor to the Fitbit Web API — see [`planning.md`](./planning.md). It authenticates entirely through **Google OAuth 2.0**, not the old Fitbit-specific auth.
- **Fitbit accounts now need to be linked to (or migrated onto) a Google Account** to use the Google Health app/API. If your Fitbit login isn't already a Google account, you'll be prompted to move it — see [Google's guide on moving a Fitbit account to a Google Account](https://support.google.com/googlehealth/answer/14237024). You **cannot** use a Google Workspace account for this — use a personal Google account.
- The legacy Fitbit Web API is being shut down (Google has announced a September 2026 turn-down), so this migration isn't optional for a project pulling live Fitbit data going forward.

## 1. Move/link your Fitbit account to a Google Account

1. If you don't already sign into Fitbit with a Google account, follow Google's [Fitbit-to-Google-Account migration flow](https://support.google.com/googlehealth/answer/14237024) first.
2. Make sure your Fitbit device (Fitbit Charge/Air, etc.) is syncing normally under that Google-linked account in the Fitbit app before moving on — the Google Health API only surfaces data your account is already collecting.
3. Optionally check the [Google Health app connected-devices settings](https://support.google.com/fitbit/answer/14236613) to confirm the device shows up there.

## 2. Create a Google Cloud project

The Google Health API is accessed through a Google Cloud project, same as other Google APIs.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and sign in with the **same Google account** your Fitbit data lives under (simplest for a personal project — avoids cross-account consent issues).
2. Create a new project (or reuse an existing personal one) — e.g. `personal-health`.
3. From **APIs & Services > Library**, search for **"Google Health API"** and enable it for the project.

## 3. Configure the OAuth consent screen

Before creating credentials, Google requires the consent screen to be configured — this is what a user (you) sees when authorizing the app.

1. Go to **APIs & Services > OAuth consent screen** (Google may label this "Google Auth Platform" / prompt "Get Started" if it's the first time in this project).
2. Fill in the required app info (app name, support email, developer contact email). For a personal project, this can be minimal.
3. Choose **External** user type unless you have a Workspace org you specifically want to scope this to (you likely don't, for a personal Fitbit account).
4. Add the scopes this project needs (see step 5 below) — or add them later when creating credentials; either order works.
5. Under **Test users**, add your own Google account email. This matters: **newly created OAuth clients start unverified, capped at 100 users, and only addresses on the Test users list can authorize** until the app goes through Google's verification process. For a personal project, staying in unverified/testing mode indefinitely with yourself as the only test user is fine — no need to submit for verification.

## 4. Create an OAuth 2.0 Client ID

1. Go to **APIs & Services > Credentials**.
2. Click **+ Create Credentials > OAuth client ID**.
3. When asked **"Where are you calling from?"**, choose **Web Server** (this project's backend is what will exchange the auth code for tokens, even though it's running locally).
4. Set **Authorized redirect URIs**. The OAuth 2.0 Playground (see step 6) uses a fixed redirect URI when you plug in your own Client ID/Secret — add `https://developers.google.com/oauthplayground`, or the Playground will fail with `redirect_uri_mismatch`. For our own backend to handle the redirect directly later, add a local redirect URI too: `http://localhost:8000/oauth/callback` (matches `backend/config.json.example`).
5. Once created, **download the credentials JSON** (or copy the **Client ID** and **Client Secret** shown). Save it as `backend/config.json` (or similar) — **this file must never be committed**; see step 7.

## 5. Pick the scopes we need

Google Health API scopes take the form `https://www.googleapis.com/auth/googlehealth.<category>.<readonly|writeonly>`. For this project we only need **read** access:

| Data we want | Scope |
|---|---|
| Steps, distance, floors, altitude (activity) | `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly` |
| Sleep | `https://www.googleapis.com/auth/googlehealth.sleep.readonly` |
| Weight and other health metrics/measurements | `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly` |

Add the readonly scopes you need to the OAuth consent screen's scope list, and request the same scopes when starting the auth flow in code. Double-check the current full scope list at `developers.google.com/health/scopes` and the data types each one covers at `developers.google.com/health/data-types` before finalizing — Google has changed scope granularity before (e.g. splitting a combined scope into `.readonly`/`.writeonly`), and heart rate/SpO2/HRV may live under a different category than the three above.

## 6. Get a first token and sanity-check the API (before writing backend code)

Google provides a codelab for this — do it once by hand to confirm the project/credentials/scopes are all correct before wiring up our own OAuth code:

- [Make your first Google Health API call using the OAuth2 Playground](https://developers.google.com/health/codelabs/make-your-first-api-call-using-oauth2-playground) — fastest path: plug your Client ID/Secret into Google's [OAuth 2.0 Playground](https://developers.google.com/oauthplayground), authorize with the scopes from step 5, and exchange for a token without writing any code yet. Make sure `https://developers.google.com/oauthplayground` is in the OAuth client's Authorized redirect URIs (step 4) first — the Playground always redirects there when using your own credentials, and skipping this causes a `redirect_uri_mismatch` error. You can remove it again once you have a refresh token.
- [Make your first Google Health API call](https://developers.google.com/health/codelabs/make-your-first-api-call) — the fuller walkthrough, closer to what our backend will eventually automate.

If this step works, credentials/scopes/consent screen are all wired up correctly and the backend auth code (see [`docs/backend-architecture.md`](./docs/backend-architecture.md)) just needs to automate the same flow.

**Troubleshooting: `Access blocked... doesn't comply with Google's OAuth 2.0 policy` from your own backend, even though the Playground worked** — if the Playground succeeds but `python cli.py auth` later gets blocked with `Error 400: invalid_request` / "doesn't comply with Google's OAuth 2.0 policy for keeping apps secure," even after confirming `redirect_uri` in `backend/config.json` matches an Authorized redirect URI in the Cloud Console character-for-character, check the *type* of that value, not just its text. It must be a plain JSON **string**:
```
"redirect_uri": "http://localhost:8000/oauth/callback"
```
not a single-item **array** left over from copy-pasting the `redirect_uris` key out of Google's downloaded credentials JSON:
```
"redirect_uri": ["http://localhost:8000/oauth/callback"]
```
`auth.py` builds the authorization URL with Python's `urlencode()`, which silently stringifies a list value into `['http://localhost:8000/oauth/callback']` — that mangled, bracket-and-quote-laden string then gets percent-encoded into the request's `redirect_uri` parameter, matching nothing registered in the Cloud Console, and Google returns this generic policy-sounding error instead of a clear `redirect_uri_mismatch`. To confirm, look at the full authorization URL `auth.py` prints to the terminal before opening the browser and decode the `redirect_uri=` value — if it starts with `%5B%27` (`['`), this is the bug.

## 7. Store credentials safely (local, git-ignored)

- Save the OAuth Client ID/Secret (and later, the refresh token) in a local config file — e.g. `backend/config.json` — **not** in `README.md`, `planning.md`, or any committed source file.
- Add that file to `.gitignore` before it's created. Suggested `.gitignore` entries:
  ```
  backend/config.json
  backend/data/health_data.json
  ```
  (the second one because the JSON data store will hold personal health data — keep actual pulled data out of version control too; commit a `.example` or empty placeholder instead if we want the shape documented in the repo.)
- Keep `backend/config.json.example` as its own separate, always-placeholder file. Don't rename/move it into `backend/config.json` when setting up real credentials — copy it instead (`cp backend/config.json.example backend/config.json`) and edit the copy. Renaming loses the placeholder and, since `.gitignore` doesn't retroactively untrack a file that's already committed, risks committing real credentials under the `.example` file's git history the moment the copy is filled in and pushed.
- Never paste the Client Secret or a token into a chat, issue, commit message, or this doc.

## 8. Checklist — before running `sync`/`serve` for the first time

- [ ] Fitbit account is on/linked to a Google account, and device is syncing normally.
- [ ] Google Cloud project created, Google Health API enabled.
- [ ] OAuth consent screen configured, our Google account added as a test user.
- [ ] OAuth 2.0 Client ID created (Web Server type), redirect URI(s) set.
- [ ] Needed scopes chosen and added to the consent screen (step 5).
- [ ] First token pulled successfully via the OAuth Playground codelab (step 6) — confirms everything above is correct.
- [ ] Client ID/Secret saved to a local, git-ignored config file — never committed.

## Reference links

- [Get started](https://developers.google.com/health/get-started)
- [Set up Google Cloud and OAuth](https://developers.google.com/health/setup)
- [Developer checklist](https://developers.google.com/health/developer-checklist)
- [Scopes](https://developers.google.com/health/scopes)
- [Data types](https://developers.google.com/health/data-types)
- [Client libraries](https://developers.google.com/health/libraries)
- [Migration guide (from Fitbit Web API)](https://developers.google.com/health/migration)
- [Move a Fitbit account to a Google Account](https://support.google.com/googlehealth/answer/14237024)
