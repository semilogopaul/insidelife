# Inside Life

**Your whole life in Lagos — earned.** A multiplayer life simulation for the web: write JAMB, survive ASUU strikes,
hustle, drive across Third Mainland Bridge with GPS directions, marry, raise kids, buy land with a real C of O, and
pass it all on to your heir. Built to fix what went wrong with the viral *Lagos Life*: the economy is
server-authoritative (no client-side money), prices are real 2026 Lagos prices, and the rich list only counts money
you actually earned.

| | |
|---|---|
| Game design | [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) |
| Player experience & flows | [`docs/UX_FLOWS.md`](docs/UX_FLOWS.md) |
| Player psychology & monetisation ethics | [`docs/PLAYER_PSYCHOLOGY.md`](docs/PLAYER_PSYCHOLOGY.md) |
| Architecture & how to add features | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Research (Nigeria 2026 data, competitor teardown) | [`docs/research/`](docs/research/) |

## Run it

### Everything in Docker (closest to production)

```bash
docker compose up --build
```

Open **http://localhost:8080**. Postgres, Redis, object storage (SeaweedFS), the API, the web app and an nginx gateway
start together; migrations run automatically. Payments use the built-in **sandbox checkout** until you add a Paystack
key (see below).

### Local development (hot reload)

Requires Node 24+ and Docker.

```bash
npm install                 # all workspaces; builds packages/shared
npm run dev:infra           # Postgres :55432, Redis :56379, storage :58333 (Docker)
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
npm run dev:shared          # terminal 1 — rebuilds shared rules on change
npm run dev:backend         # terminal 2 — API on http://localhost:4000
npm run dev:frontend        # terminal 3 — game on http://localhost:3100
```

Ports are deliberately non-default so Inside Life doesn't collide with other local projects.

### Useful commands

```bash
npm run test                # unit tests in every workspace (Vitest)
npm run lint                # oxlint (backend) + ESLint (frontend)
npm run typecheck
npm run build
npm run assets:prepare -w @insidelife/frontend   # re-optimise 3D/audio assets (needs the free Kenney source packs; see the scripts' --source flag)
npm run sim:economy -w @insidelife/backend       # bot economy simulation (see "Economy balance" below)
```

## Configuration

Backend environment is validated at startup — see [`backend/.env.example`](backend/.env.example) for every variable.

| Variable | Purpose |
|---|---|
| `GAME_TIME_SCALE` | Game minutes per real minute (default `120`: a game day is 12 real minutes, a year 3 real days). |
| `GAME_EPOCH`, `WORLD_SEED` | Anchor of the shared world clock and the seed for weather, economy and world events. |
| `PAYSTACK_SECRET_KEY` | `sk_test_…` / `sk_live_…`. Empty in development → sandbox checkout. Required in production. |
| `PAYSTACK_CALLBACK_URL` | Where Paystack returns players after checkout (`/payments/callback`). |
| `TOPUP_DAILY_LIMIT_NGN` | Real-money spending cap per account per day (responsible play). |
| `ADMIN_EMAILS` | Owners of the admin portal (moderation, players, payments, audit log); they can grant the admin role to others. |
| `ADMIN_ORIGINS` | Origins of the separate admin portal (`insidelife-admin` repo), e.g. `https://admin.insidelife.online`. |
| `ADMIN_MFA_KEY` | Encrypts admins' authenticator secrets (required on the live site; never change it). |
| `ACCOUNT_RESTORE_DAYS` | How long a deleted account can be restored before it's anonymised (default 30). |
| `S3_*` | Object storage for ad creatives and music (SeaweedFS locally; any S3-compatible store in production). |

### Paystack

1. Create a Paystack account and copy your **test** secret key from *Settings → API Keys & Webhooks*.
2. Set `PAYSTACK_SECRET_KEY` in `backend/.env` (or as an environment variable for `docker compose`).
3. Set the webhook URL to `https://<your-domain>/api/v1/payments/paystack/webhook`. Signatures are verified with
   HMAC-SHA512; crediting is idempotent per transaction reference, so the redirect verify and the webhook can race
   safely.

## How it's built

```
packages/shared   pure TypeScript shared by server and client: calendar, needs model, seeded RNG, world model,
                  finance rules (NTA 2025 tax bands, transfer fees), catalog, API contracts, open-world geometry
backend           NestJS 12 · TypeORM 1.1 · Postgres 17 · Redis 7 · BullMQ · Socket.IO
frontend          Next.js 16 · React 19 · React Three Fiber · Tailwind v4 · TanStack Query · Zustand
infra             nginx gateway, SeaweedFS config
```

- **Lazy, deterministic simulation.** Each character stores `settledAt`; any request (or a background sweep) advances
  them to "now" in closed form. Rolls are seeded per character per day, so refreshing can never re-roll fate.
- **One mutation path.** Every character command runs in a locked transaction (`CharacterSession`): settle → act →
  persist → push. Double-submits can't double-spend.
- **Double-entry ledger.** Every naira moves between accounts in balanced, idempotent postings; player balances can't go
  negative. System accounts (mint, burn, tax…) are never locked by player transactions — their deltas are queued and
  rolled up every few seconds — so thousands of players never queue on a hot row. Faucets and sinks are exported as
  Prometheus metrics at `/api/metrics` (internal; the gateway doesn't expose it).
- **Autopilot with intent.** While you're offline your character sleeps (earlier before a dawn shift or when
  exhausted), eats when they get home hungry, commutes through Lagos traffic and keeps up to two **daily habits** you
  set ("learn to code, 2h at 8pm"). Every autopilot choice gives way to anything you do.
- **Open world.** The client simulates walking and driving; the server validates door distance, anti-teleport speed
  and charges fuel by road distance.

## Economy balance

Success has to be earned, so balance is tested, not guessed. `backend/src/tools/economy-sim.ts` boots the real game
with a fast-forward clock and plays bot cohorts (idle, hustler, scholar, techie, investor, spender, entrepreneur) for
years of game time, reporting wealth per strategy, health, careers and the money supply. In a 3-game-year run nobody
got rich quick: minimum-wage hustles only support a modest lifestyle, small businesses and steady investing build
slowly, and the big money (remote tech, professions, scaled businesses, property) takes many game years. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#economy-balancing-bot-simulation) to run it.

Assets: 3D models and sound effects are [Kenney](https://kenney.nl) packs (CC0). Characters, clothing, music and
ambience are generated in code.
