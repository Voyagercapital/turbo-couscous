# Invest Dashboard (PWA)

This is a **local-first** investment dashboard that runs as a **Progressive Web App** (PWA) and can be added to an iPhone Home Screen.

## What it does
- Sleeve targets vs actual + drift (Liquidity / Defensive / Core Growth / Opportunistic)
- Positions list with quick P/L
- Upcoming maturities/calls (next 120 days)
- Monthly review generator (copy/paste into ChatGPT or notes)
- CSV import (positions or balances/cash)
- Export/Import full backup JSON
- Offline support (service worker)

## How to use on iPhone
PWAs require HTTPS (or localhost) to install offline features.

### Option A — GitHub Pages (free)
1. Create a new repo on GitHub (e.g. `invest-dashboard-pwa`)
2. Upload all files from this folder.
3. Repo settings → Pages → deploy from `main` branch root.
4. Open the deployed URL on iPhone Safari.
5. Share button → **Add to Home Screen**.

### Option B — Netlify (free)
1. Drag this folder into Netlify “Deploy manually”.
2. Open the Netlify URL on iPhone Safari.
3. Share → Add to Home Screen.

## CSV templates
### Positions CSV headers (recommended)
`name, sleeve, type, issuer, value_nzd, cost_nzd, currency, maturity_date, expected_rate, tags, notes`

### Balances CSV headers (recommended)
`account, sleeve, value_nzd, as_of, notes`

The importer is forgiving and tries common variants like `value`, `balance`, `market_value`, etc.

## Privacy
All data is stored on-device (LocalStorage). Export backups if you want portability.
