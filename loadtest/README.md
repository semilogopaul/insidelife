# Load test

k6 script that plays Inside Life like real players. Each virtual user (VU) is one player:

1. Registers a unique account (`lt-<run>-<vu>@loadtest.example.com`, born over 18) and creates a character.
2. Loads the clock and the snapshot, steps outside (`POST /characters/me/exits`).
3. Until the end of the hold, the same requests at the same rates as the web client on the street screen: polls
   `/world/state`, `/progression/suggestions` and `/visits` every 60 s and `/promotions/billboards/live` every 5 min, sends
   `PUT /characters/me/play-state` every 45 s and `POST /characters/me/heartbeats` every 15 s, and starts a free `scroll`
   action every 90 s (a stand-in for the player's own commands). The snapshot (`GET /characters/me`) is never polled, as
   in `frontend/src/common/game/snapshot.ts`: it is fetched on `character:invalidate` (with `/visits`), when play-state
   says `resumed`, after a rejected heartbeat and 30 game minutes before its timeline runs out; every new snapshot (also
   the one an action or the exit answers with) fetches `/progression/suggestions`, whose query is keyed by `asOf`.
4. Holds a Socket.IO connection to `/realtime` (Engine.IO v4 framing written by hand, same `{token}` auth as the client) and
   sends `world:move` at 4 Hz while walking and every 2 s while standing, answering pings. Counts `world:players` messages and bytes.

Every request (including the WebSocket handshake) carries a stable fake `cf-connecting-ip` per VU. The API must run with
`CLIENT_IP_HEADER=cf-connecting-ip`, otherwise all VUs share one IP and hit the sign-up limit (8/min per IP). The target also
needs `REQUIRE_EMAIL_VERIFICATION=false` and `MAX_ONLINE_PLAYERS` above `PEAK_VUS` (or 0). It creates real accounts: point it
at staging or a throwaway database. Past capacity the API sheds load (`OVERLOAD_LAG_MS`): requests get 503 `SERVER_BUSY`
(counted in `server_busy`, and in `http_req_failed`) and new sockets get `world:full`; that's the point where to stop
adding players. Set `OVERLOAD_LAG_MS=0` on the target to see how it behaves without shedding.

## Run

```bash
# Build and run the image (what the Azure Container Apps job runs):
docker build -t insidelife-loadtest loadtest
docker run --rm -e BASE_URL=https://staging.example.com -e PEAK_VUS=200 -e RAMP=5 -e HOLD=10 insidelife-loadtest

# Against a local API (Docker Desktop), without building:
docker run --rm -v "$PWD/loadtest":/work -w /work grafana/k6:1.5.0 run \
  -e BASE_URL=http://host.docker.internal:4000 -e PEAK_VUS=10 -e RAMP=1 -e HOLD=2 game.js
```

| Env | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://localhost:4000` | API origin (`/api/v1/...`); the WebSocket uses the same host |
| `WS_URL` | `BASE_URL` | Override if realtime is served elsewhere |
| `PEAK_VUS` | 10 | Players at peak |
| `RAMP` / `HOLD` | 1 / 2 | Minutes to ramp up / to hold at peak (VUs stop on their own when HOLD ends) |
| `RUN_ID` | timestamp | Namespaces emails and fake IPs; use a fresh value per run against the same database |

Thresholds (k6 exits non-zero if one fails): commands p95 < 400 ms, reads p95 < 250 ms, sign-up and create-character
p95 < 1.5 s, HTTP errors < 1 %, `ws_connect_success` > 99 %.

Custom metrics: `ws_bytes_received`, `ws_bytes_per_sec_per_vu` (10 s windows), `ws_world_players_msgs`, `ws_world_players_bytes`,
`ws_moves_sent`, `ws_world_full`, `signup_ok`, `actions_started`, `snapshot_fetches`, `server_busy`.

## Notes

- k6 1.5.0 has no stable `k6/websockets`, so the script imports `k6/experimental/websockets` (hence the pinned image tag).
- Access tokens last 15 min; VUs refresh through the cookie jar like the browser, so longer holds work.
- Registering and creating a character are tagged `kind:signup` rather than `command`: they hash a password and seed a life.
