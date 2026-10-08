# DeltaCloud

A practice-trading and market-learning app. Real or simulated prices, a $10,000 play-money account, plain-language market readings, and a growth calculator. No real money moves anywhere.

```
dc/
  backend/    Node 22 + Express + MongoDB + socket.io
  frontend/   React 19 (CRA) + Capacitor 8
```

## What it does

- **Sign-in:** email + password, then a 6-digit emailed code. Access token (15 min) and rotating refresh token (7 days, stored hashed, max 5 per user).
- **Prices:** polls Binance.US every 2s, streams to the app over socket.io. If the feed fails it falls back to clearly labelled simulated prices. The UI always shows **Live** or **Simulated**. A price is only tradeable if under 15 seconds old.
- **Practice trading:** server-authoritative. Spot only, no leverage, no shorting. The server sets the price; the client cannot.
- **Insights:** rule-based readings of recent movement (short vs long average, change over the window, range). No buy/sell wording, always with a disclaimer.
- **Growth Lab:** compound-growth calculator.

## Run locally

Requires Node 22+ and a MongoDB (Atlas or local).

```bash
cd backend
cp .env.example .env      # fill in MONGO_URI and two different 32+ char secrets
npm install
npm run dev               # http://localhost:8080
npm test                  # 18 unit tests
```

With no SMTP configured, codes are printed in the backend console, and (non-production only) returned to the UI when `DEV_RETURN_OTP=true`.

```bash
cd frontend
cp .env.example .env      # REACT_APP_API_BASE_URL=http://localhost:8080
npm install
npm start
```

Generate secrets with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## Environment (backend)

| Var | Notes |
| --- | --- |
| `MONGO_URI` | Required |
| `JWT_SECRET`, `REFRESH_SECRET` | Required, 32+ chars, must differ (enforced in production) |
| `CLIENT_ORIGINS` | Comma-separated allowed origins. Include `capacitor://localhost` and `http://localhost` for the mobile app |
| `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM` | Email delivery. Required in production |
| `MARKET_SOURCE` | `auto` (default), `binance` (never simulates), `sim` |
| `BINANCE_API_BASE` | Defaults to Binance.US |
| `DEV_RETURN_OTP` | Dev only; ignored in production |

## Launch on GitHub (step by step)

GitHub Pages serves static files only, so the site has two parts: the **frontend on GitHub Pages** and the **backend on a small server** (Render's free tier works; `render.yaml` and `backend/Dockerfile` are included).

1. **Create a new GitHub repo** (private is fine to start), then from this folder:
   ```bash
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. **Database:** create a fresh MongoDB Atlas user and cluster (not the old exposed one). Allow the backend host in Network Access.
3. **Backend:** on Render choose *New > Blueprint*, pick the repo. Fill the prompted values:
   `MONGO_URI`, `SMTP_*`, `EMAIL_FROM`, and `CLIENT_ORIGINS=https://<you>.github.io` (origin only, no path). Secrets are generated for you. Check `https://<your-api>.onrender.com/health`.
4. **Frontend:** repo *Settings > Pages > Source: GitHub Actions*. Then *Settings > Secrets and variables > Actions > Variables* and add:
   - `REACT_APP_API_BASE_URL` = your backend URL (https)
   - `PUBLIC_URL` = `/<repo>` for a project site, or leave empty for a custom domain / `<you>.github.io` repo
5. Push to `main` (or run the *Deploy site to GitHub Pages* workflow). The site appears at `https://<you>.github.io/<repo>/`.

CI (`.github/workflows/ci.yml`) runs the backend tests and a frontend build on every push. Never commit `.env`; it is git-ignored.

## Mobile (Capacitor)

`localhost` does not work from a phone. Deploy the backend over HTTPS, set `REACT_APP_API_BASE_URL` to it, then:

```bash
cd frontend && npm run build && npx cap sync
npx cap open android   # or ios
```

## Security

- **Rotate every credential you pasted into chat or committed anywhere** (Mongo users, SMTP keys, JWT secrets, market-data key). Treat them as exposed.
- Keep `.env` out of git (`.gitignore` is set up). Only `.env.example` is committed.
- Account-enumeration safe responses, equalised login timing, rate limits on code endpoints, hashed codes with attempt limits, refresh-token rotation.

## What was fixed from the original code

Account data wiped by `localStorage.clear()`; a hard-coded `000000` code; registration without verification; `dotenv` loaded after imports; fake "AI signals"; a dock that always said "Online"; wrong leverage profit maths; SELL that created money; four separate sockets; an unregistered Chart.js `Filler`; a hijacked "f" key.

## Deliberately not included yet

Order book, depth chart, terminal, assets, news and auto-pilot pages. They depended on fake or unsourced data. Add them back once there are real data sources. Real-money features (brokerage, payments, wallet) stay out until legal and compliance groundwork exists.

## Verification status

Passed: 18 backend unit tests; feed smoke test; 45-check browser end-to-end run of the real UI against an in-memory API that reuses the backend's real validation, order and indicator code (desktop and 390px mobile).

Not yet run (the build sandbox blocked package installs): `npm install`, `react-scripts build`, the Express/Mongoose routes against a real database, real email, and the live Binance feed. Expect to fix small things on first run.
