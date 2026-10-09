# DeltaCloud

A practice-trading and market-learning app. Real or simulated prices, a $10,000 play-money account, plain-language market readings, and a growth calculator.

```
dc/
  backend/    Node 22 + Express + MongoDB + socket.io
  frontend/   React 19 (CRA) + Capacitor 8
```

## What it does

- **Sign-in:** email + password, then a 6-digit emailed code. Access token (15 min) and rotating refresh token (7 days, stored hashed, max 5 per user).
- **Prices:** polls Binance.US every 2s, streams to the app over socket.io. If the feed fails it falls back to clearly labelled simulated prices. The UI always shows **Live** or **Simulated**. A price is only tradeable if under 15 seconds old.
- **Practice trading:** server-authoritative. The server sets the price; the client cannot.
  - **Spot:** buy and sell at the live price, no shorting.
  - **Leverage:** long or short at 2×–50×, isolated margin only — a position can never lose more than the margin put into it, and cash can never go negative. A position auto-closes ("liquidated") if the price crosses its liquidation level; see `backend/src/lib/leverageMath.js`.
- **Trade journal:** every buy, sell, leveraged open, close, liquidation and account reset is written permanently to its own `TradeLog` collection, never trimmed or edited. Each entry is saved in the same database write as the trade itself (an outbox on the account) and then copied into the journal, so a trade can't exist without its record, and retries can't create duplicates. History from before the journal existed is copied in once per account. The Journal page shows totals (realised P/L, win rate, volume, liquidations, best and worst trade), filters, paging back to the first trade, and a CSV download. Endpoints: `GET /api/paper/journal?market=&symbol=&before=&limit=`, `GET /api/paper/journal/summary`, `GET /api/paper/journal/export`.
- **Pace your trades:** a position-size helper on the dashboard that compares a spot slice of cash with the same slice used as leveraged margin, with no advice and no order placed.
- **Insights:** rule-based readings of recent movement (short vs long average, change over the window, range). No buy/sell wording, always with a disclaimer.
- **Growth Lab:** compound-growth calculator.

## Run locally

Requires Node 22+ and a MongoDB (Atlas or local).

```bash
cd backend
cp .env.example .env      # fill in MONGO_URI and two different 32+ char secrets
npm install
npm run dev               # http://localhost:8080
npm test                  # 45 unit tests
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

## Hosting

The site has two parts, both deployed from this private repo:

- **Frontend:** Cloudflare Pages at **https://joindeltacloud.com** (and `www.`). Builds on every push to `main`.
  - Root directory `frontend`, build command `npm run build`, output `build`
  - Variables: `REACT_APP_API_BASE_URL=https://deltacloud.onrender.com`, `NODE_VERSION=22`, `CI=false`
- **Backend:** Render (`render.yaml`, `backend/Dockerfile`). Check `https://deltacloud.onrender.com/health`.
  - Fill `MONGO_URI`, `SMTP_*`, `EMAIL_FROM`; secrets are generated for you.
  - `https://joindeltacloud.com` and `https://www.joindeltacloud.com` are always allowed to call the API; add any other origins to `CLIENT_ORIGINS` (origin only, no path).
  - Use a paid instance in production; the free one sleeps after inactivity and the first request takes about a minute.

Database: MongoDB Atlas. Allow the backend host in Network Access.

CI (`.github/workflows/ci.yml`) runs the backend tests and a frontend build on every push. Never commit `.env`; it is git-ignored.

## Delta News

The backend reads public RSS feeds from central banks and regulators (Federal Reserve, SEC, ECB) and from news outlets (CNBC, MarketWatch, CoinDesk, Cointelegraph, BBC, The Guardian, The New York Times, Al Jazeera). It refreshes every 5 minutes, keeps only market-relevant stories, merges the same story reported by several outlets, tags the markets and topics it mentions, and ranks by relevance, freshness, number of outlets and whether the source is official. Tone is a simple word count of the headline and is labelled as such.

- Only headlines, a short snippet and a link back to the publisher are stored or shown, always credited. Do not copy full articles.
- A feed that is down is skipped. If all are unreachable the last good list stays.
- Edit `SOURCES` in `backend/src/services/news.js` to add or remove feeds. Check each publisher's terms before adding one, and add a licensed data provider before charging for news.
- Endpoint: `GET /api/news?topic=&symbol=&q=&sort=top|latest&limit=`.

## Devices

- **Any browser:** the site is responsive from phone to widescreen. It works in Safari, Chrome, Edge and Firefox on iPhone, iPad, Android, Mac, Windows and Linux.
- **Install as an app (no store needed):** it is a Progressive Web App. iPhone/iPad: Safari, Share, Add to Home Screen. Android: Chrome menu, Install app. Mac, Windows, Linux: Chrome or Edge, install icon in the address bar. The service worker (`frontend/public/sw.js`) keeps the shell available offline; pages always load fresh from the network first.
- **App Store / Google Play:** the Capacitor project is configured (`com.deltacloud.app`). iOS builds need a Mac with Xcode and an Apple Developer account. Android builds need Android Studio and a Google Play developer account.

## Mobile apps (iPhone and Android)

The same code is wrapped as native apps with Capacitor (`frontend/capacitor.config.json`, app id `com.deltacloud.app`). The `android/` and `ios/` folders are generated on demand, so they are not committed.

**Android (works from GitHub, no Mac needed).** In the repo, open Actions, choose **Build Android app**, and click Run workflow. When it finishes, download the `DeltaCloud-android-debug` artifact. It contains `app-debug.apk`, which you can install on an Android phone (allow installs from your browser or files app). Before this, set the Actions variable `REACT_APP_API_BASE_URL` to your live backend (https). The phone cannot reach `localhost`.

**Google Play.** Needs a Google Play developer account (one-time fee) and a signed release build. Create a signing key, store it as GitHub secrets, and switch the workflow from `assembleDebug` to a signed `bundleRelease`.

**iPhone.** The **Check iOS build** workflow confirms the app compiles on a Mac runner. It does not produce an installable app. To install on iPhones or release on the App Store you need an Apple Developer account (yearly fee), signing certificates and a provisioning profile, then a TestFlight upload. Add those as GitHub secrets and the workflow can be extended to upload to TestFlight.

**Backend access.** The backend must allow the app origins `capacitor://localhost` (iOS) and `https://localhost` (Android). They are in the default `CLIENT_ORIGINS`. If you set that variable yourself, include them.

Run locally instead (needs Xcode for iOS, Android Studio for Android):

```bash
cd frontend && npm run build && npx cap add android && npx cap sync
npx cap open android   # or: npx cap add ios && npx cap open ios
```

## Security

- **Rotate every credential you pasted into chat or committed anywhere** (Mongo users, SMTP keys, JWT secrets, market-data key). Treat them as exposed.
- Keep `.env` out of git (`.gitignore` is set up). Only `.env.example` is committed.
- Account-enumeration safe responses, equalised login timing, rate limits on code endpoints, hashed codes with attempt limits, refresh-token rotation.

## What was fixed from the original code

Account data wiped by `localStorage.clear()`; a hard-coded `000000` code; registration without verification; `dotenv` loaded after imports; fake "AI signals"; a dock that always said "Online"; wrong leverage profit maths; SELL that created money; four separate sockets; an unregistered Chart.js `Filler`; a hijacked "f" key.

## Deliberately not included yet

Order book, depth chart, terminal, assets, news and auto-pilot pages. They depended on fake or unsourced data. Add them back once there are real data sources. Account-linked features are planned for a later release.

## Verification status

Passed: 18 backend unit tests; feed smoke test; 45-check browser end-to-end run of the real UI against an in-memory API that reuses the backend's real validation, order and indicator code (desktop and 390px mobile).

Not yet run (the build sandbox blocked package installs): `npm install`, `react-scripts build`, the Express/Mongoose routes against a real database, real email, and the live Binance feed. Expect to fix small things on first run.
