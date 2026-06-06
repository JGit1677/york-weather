# York Beach Weather

A self-updating weather dashboard for **York Beach, Maine (03909)**. It pulls the
closest, most current **METAR** (airport observations) and **TAF** (airport
forecasts) plus the **NWS** point forecast for the exact yard, then compiles one
"best available" forecast with plain-English **garden alerts** (frost/freeze,
heavy rain, high wind, heat, dry stretch).

Built to open on a phone (mobile-first) and to host free on GitHub Pages.

## How it works

```
GitHub Actions (every ~30 min)
   └─ node scripts/fetch-weather.mjs
        ├─ METAR  ← aviationweather.gov   (KPSM, KSFM, KDAW, KPWM, KBVY)
        ├─ TAF    ← aviationweather.gov   (KPSM nearest, KPWM backup)
        └─ NWS    ← api.weather.gov        (forecast + hourly + alerts for 03909)
   └─ compiles → public/data/weather.json
   └─ vite build → dist → GitHub Pages
React dashboard reads weather.json (no live API calls from the browser)
```

**Why the build-time fetch?** `aviationweather.gov` does **not** send CORS
headers, so a browser on GitHub Pages cannot fetch METAR/TAF directly. Fetching
server-side in Actions sidesteps that and means the page loads instantly from a
static JSON snapshot. The nearest TAF-issuing airport to York is **KPSM**
(Portsmouth/Pease, ~12.6 mi); the closest observations come from KPSM, KSFM
(Sanford) and KDAW (Rochester).

## Project layout

```
config.mjs              Location, station list, NWS zone, alert thresholds
scripts/
  fetch-weather.mjs     Orchestrator: fetch all sources -> weather.json
  notify.mjs            Phase-2 text/push sender (off by default)
  check.mjs             Self-test (synthetic frost/heat/wind/storm days)
  lib/{sources,compile,decode,geo}.mjs
src/                    React dashboard (App.jsx, ui.css, format.js)
public/data/weather.json   Generated snapshot (gitignored; rebuilt each deploy)
.github/workflows/deploy.yml
```

Data is fully separated from rendering: edits to `weather.json`/the data layer
cannot structurally break the UI.

## Local development

```bash
npm install
npm run data      # fetch live data -> public/data/weather.json
npm run check     # self-test the compiler + validate the live snapshot
npm run dev       # http://localhost:5173
```

`npm run build` fetches fresh data and builds to `dist/`. `npm run preview`
serves the built site on http://localhost:4173.

## Deploy to GitHub Pages (free, ~5 min)

`gh` is not required. On github.com, create a new **empty** repo (public is
recommended — the data is public weather and public repos get unlimited free
Actions minutes, which the 30-min schedule needs). Then:

```bash
cd york-weather
git init -b main
git add -A
git commit -m "York Beach weather dashboard"
git remote add origin https://github.com/<YOU>/york-weather.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Build and deployment → Source: GitHub
Actions**. The workflow runs on push and every 30 minutes. Your dashboard:

```
https://<YOU>.github.io/york-weather/
```

### Open it on your Samsung phone

Visit the URL in Chrome → **⋮ menu → Add to Home screen**. It gets an icon and
opens full-screen like an app. (No app store, no account.)

> Note: GitHub pauses scheduled workflows after 60 days with no repo activity —
> any push (or the **Run workflow** button) re-arms it.

## Configuration

Everything tunable lives in [`config.mjs`](config.mjs):

- `LOCATION` — lat/lon and time zone (currently York Beach 43.1745, -70.6092)
- `METAR_STATIONS` / `TAF_STATIONS` — add or swap airports (one line)
- `THRESHOLDS` — frost/freeze/heat/wind/rain trigger points, tuned to Zone 6b

## Phase 2 — text / push notifications (not enabled yet)

`scripts/notify.mjs` already builds a digest from the same `weather.json`. It
just needs a channel. Two good options for Android:

**ntfy (free, simplest):** Install the *ntfy* app from the Play Store, pick a
hard-to-guess topic (e.g. `york-garden-wx-7h3k`), and subscribe to it. Then test
locally:

```bash
NTFY_TOPIC=york-garden-wx-7h3k npm run data && \
NTFY_TOPIC=york-garden-wx-7h3k node scripts/notify.mjs --mode=daily
```

**Telegram:** Create a bot with @BotFather, get the token and your chat id, then
set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.

To automate (you chose **daily digest + event alerts**), add the secret(s) under
**Settings → Secrets and variables → Actions**, then add a second workflow
`.github/workflows/notify.yml`:

```yaml
name: Weather notifications
on:
  schedule:
    - cron: '0 10 * * *'    # ~6 AM ET daily digest (UTC; shifts 1h with DST)
    - cron: '15 * * * *'    # hourly event check
  workflow_dispatch: {}
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: node scripts/fetch-weather.mjs
      - name: Daily digest (6 AM ET only)
        if: github.event.schedule == '0 10 * * *'
        run: node scripts/notify.mjs --mode=daily
        env:
          NTFY_TOPIC: ${{ secrets.NTFY_TOPIC }}
      - name: Event alerts (when not calm)
        if: github.event.schedule == '15 * * * *'
        run: node scripts/notify.mjs --mode=events
        env:
          NTFY_TOPIC: ${{ secrets.NTFY_TOPIC }}
```

Real SMS to your carrier number is also possible later via Twilio (paid); ntfy
or Telegram are free and more reliable on Android.

## Data sources

- NOAA/NWS — https://api.weather.gov (public domain)
- NOAA Aviation Weather Center — https://aviationweather.gov (public domain)

All forecasting is tuned for **Zone 6b, coastal southern Maine**.
