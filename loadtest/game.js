// Inside Life load test: every VU is one player (sign up, create a character, play the street screen).
// Run: k6 run -e BASE_URL=http://host:4000 -e PEAK_VUS=50 -e RAMP=2 -e HOLD=5 game.js   (see README.md)
import http from 'k6/http';
import exec from 'k6/execution';
import { WebSocket } from 'k6/experimental/websockets'; // stable `k6/websockets` is not in the k6 releases up to 1.5.0
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');
const WS_URL = (__ENV.WS_URL || BASE_URL).replace(/^http/, 'ws').replace(/\/+$/, '');
const API = `${BASE_URL}/api/v1`;
const PEAK_VUS = Number(__ENV.PEAK_VUS || 10);
const RAMP_MIN = Number(__ENV.RAMP || 1);
const HOLD_MIN = Number(__ENV.HOLD || 2);
const RUN_ID = __ENV.RUN_ID || Date.now().toString(36);
const PASSWORD = 'LoadTest-2026-pw1';
const NS = '/realtime';

export const options = {
  scenarios: {
    players: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: `${RAMP_MIN}m`, target: PEAK_VUS },
        { duration: `${HOLD_MIN}m`, target: PEAK_VUS },
      ],
      // Players leave on their own when the HOLD ends (they close their socket and stop polling); this is the grace for that.
      gracefulRampDown: '40s',
      gracefulStop: '40s',
    },
  },
  thresholds: {
    'http_req_duration{kind:command}': ['p(95)<400'],
    'http_req_duration{kind:read}': ['p(95)<250'],
    // Registering hashes a password and creating a character seeds a life: allowed to be slower than a command.
    'http_req_duration{kind:signup}': ['p(95)<1500'],
    http_req_failed: ['rate<0.01'],
    ws_connect_success: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'max'],
};

const wsConnectSuccess = new Rate('ws_connect_success');
const wsBytesReceived = new Counter('ws_bytes_received');
const wsBytesPerSecPerVu = new Trend('ws_bytes_per_sec_per_vu');
const wsWorldPlayersMsgs = new Counter('ws_world_players_msgs');
const wsWorldPlayersBytes = new Counter('ws_world_players_bytes');
const wsMovesSent = new Counter('ws_moves_sent');
const wsWorldFull = new Counter('ws_world_full');
const signupOk = new Rate('signup_ok');
const actionsStarted = new Counter('actions_started');

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }));

// --- helpers ---------------------------------------------------------------------------------------------------------

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}
/** A distinct, stable fake public IPv4 per VU (and run), so per-IP limits behave like many different players. */
function fakeIp(vu) {
  let h = hash(`${RUN_ID}:${vu}`);
  const octet = () => ((h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0) % 254) + 1;
  let a = octet();
  while (a === 10 || a === 127 || a === 172 || a === 192 || a === 169 || a >= 224) a = octet();
  return `${a}.${octet()}.${octet()}.${octet()}`;
}
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const is2xx = (r) => r.status >= 200 && r.status < 300;

class Player {
  constructor(vu) {
    this.vu = vu;
    this.ip = fakeIp(vu);
    this.email = `lt-${RUN_ID}-${vu}@loadtest.example.com`;
    this.token = '';
    this.tokenAt = 0;
    this.pos = { x: 0, z: 0 };
    this.home = { x: 0, z: 0 };
    this.heading = 0;
    this.outside = false;
    this.connected = false;
  }

  headers(json) {
    const h = { 'cf-connecting-ip': this.ip, Origin: BASE_URL, 'user-agent': 'k6-insidelife-loadtest' };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  /** kind: command | read | signup (the tag drives the thresholds). */
  call(method, path, name, kind, body) {
    const params = { headers: this.headers(body !== undefined), tags: { kind, name } };
    const url = `${API}${path}`;
    if (method === 'GET') return http.get(url, params);
    return http.request(method, url, body === undefined ? null : JSON.stringify(body), params);
  }

  json(res) {
    try { return res.json(); } catch (e) { return null; }
  }

  setSession(res) {
    const body = this.json(res);
    if (body && body.accessToken) {
      this.token = body.accessToken;
      this.tokenAt = Date.now();
      return true;
    }
    return false;
  }

  signUp() {
    if (!this.registered) {
      if (!this.register()) return false;
      this.registered = true;
    }
    return this.createCharacter();
  }

  register() {
    const year = 1985 + Math.floor(Math.random() * 15);
    const reg = this.call('POST', '/auth/register', 'POST /auth/register', 'signup', {
      email: this.email,
      password: PASSWORD,
      birthDate: `${year}-0${1 + Math.floor(Math.random() * 9)}-1${Math.floor(Math.random() * 9)}`,
    });
    const ok = check(reg, { 'register 2xx': is2xx }) && this.setSession(reg);
    signupOk.add(ok);
    if (!ok) console.warn(`VU ${this.vu}: register -> ${reg.status} ${String(reg.body).slice(0, 160)}`);
    return ok;
  }

  createCharacter() {
    const created = this.call('POST', '/characters', 'POST /characters', 'signup', {
      firstName: pick(['Tunde', 'Chioma', 'Ibrahim', 'Ngozi', 'Emeka', 'Aisha', 'Segun', 'Funke']),
      lastName: pick(['Adeyemi', 'Okafor', 'Bello', 'Eze', 'Balogun', 'Musa', 'Nwosu', 'Ojo']),
      handle: `lt${hash(this.email).toString(36)}`.slice(0, 20),
      gender: pick(['male', 'female']),
      stateOfOrigin: pick(['lagos', 'ogun', 'oyo']),
      appearance: {
        bodyType: pick(['slim', 'average', 'curvy', 'broad']),
        height: 1,
        skinTone: 2,
        hairStyle: pick(['lowcut', 'fade', 'afro', 'twists', 'braids', 'bun']),
        hairColor: 0,
        facialHair: 'none',
        eyeStyle: pick(['round', 'almond', 'bright']),
      },
    });
    const ok = check(created, { 'create character 2xx': is2xx });
    if (!ok) console.warn(`VU ${this.vu}: create character -> ${created.status} ${String(created.body).slice(0, 160)}`);
    return ok;
  }

  /** Access tokens last 15 min; the client refreshes with its cookie before they lapse. */
  refreshIfDue() {
    if (Date.now() - this.tokenAt < 12 * 60 * 1000) return;
    const res = this.call('POST', '/auth/refresh', 'POST /auth/refresh', 'command');
    if (res.status === 200) this.setSession(res);
  }

  snapshot() { return this.call('GET', '/characters/me', 'GET /characters/me', 'read'); }

  stepOutside() {
    const res = this.call('POST', '/characters/me/exits', 'POST /characters/me/exits', 'command');
    const body = this.json(res);
    const entrance = body && body.spawn && body.spawn.entrance;
    if (entrance) {
      this.pos = { x: entrance.position.x, z: entrance.position.z };
      this.home = { x: entrance.position.x, z: entrance.position.z };
      this.heading = entrance.heading;
      this.outside = true;
    }
    return this.outside;
  }
}

// --- one player's whole session ---------------------------------------------------------------------------------------

const END_MS = (RAMP_MIN + HOLD_MIN) * 60 * 1000;
const over = () => exec.instance.currentTestRunDuration >= END_MS;

// One player per VU for the whole test: a finished or failed iteration never creates a second account.
let me = null;

export default function () {
  if (over()) { sleep(5); return; }
  if (!me) me = new Player(__VU);
  const player = me;
  if (!player.signedUp && !player.signUp()) {
    sleep(5 + Math.random() * 5); // e.g. rate limited: try again like a person would
    return;
  }
  player.signedUp = true;
  player.snapshot();
  // The client fetches these once when entering the play screen.
  player.call('GET', '/world/clock', 'GET /world/clock', 'read');
  player.stepOutside();

  const timers = [];
  let ws = null;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
    if (ws) { try { ws.close(); } catch (e) { /* already closed */ } }
  };
  const guarded = (fn) => () => {
    if (stopped) return;
    if (over()) { stop(); return; }
    player.refreshIfDue();
    fn();
  };
  // Every poll starts at a random phase so VUs do not hit the server in lockstep.
  const every = (ms, fn) => {
    timers.push(setTimeout(() => {
      fn();
      timers.push(setInterval(fn, ms));
    }, Math.random() * ms));
  };

  // What the play screen polls (frontend: snapshot.ts, use-game-clock.ts, play-state.ts, use-world-sync.ts, hud, visits).
  every(15000, guarded(() => player.snapshot()));
  every(60000, guarded(() => player.call('GET', '/world/state', 'GET /world/state', 'read')));
  every(60000, guarded(() => player.call('GET', '/progression/suggestions', 'GET /progression/suggestions', 'read')));
  every(60000, guarded(() => player.call('GET', '/visits', 'GET /visits', 'read')));
  every(300000, guarded(() => player.call('GET', '/promotions/billboards/live', 'GET /promotions/billboards/live', 'read')));
  every(45000, guarded(() => player.call('PUT', '/characters/me/play-state', 'PUT /characters/me/play-state', 'command', { state: 'playing' })));
  every(15000, guarded(() => {
    if (!player.outside) return;
    player.call('POST', '/characters/me/heartbeats', 'POST /characters/me/heartbeats', 'command', {
      position: { x: Math.round(player.pos.x * 100) / 100, z: Math.round(player.pos.z * 100) / 100 },
      mode: 'walk',
      heading: Math.round(player.heading * 1000) / 1000,
    });
  }));
  // Now and then something cheap: scroll the phone (free, 15 game minutes).
  every(90000, guarded(() => {
    const res = player.call('POST', '/characters/me/actions', 'POST /characters/me/actions', 'command', { actionId: 'scroll', durationMinutes: 15 });
    if (is2xx(res)) actionsStarted.add(1);
  }));

  // Walking: world:move at 4 Hz while moving, once per 2 s when standing still (use-world-sync.ts).
  let walking = true;
  let phaseEnds = Date.now() + rand(15000, 40000);
  let lastSent = 0;
  let lastTick = Date.now();
  const sendMove = () => {
    if (!ws || ws.readyState !== 1 || !player.connected) return;
    ws.send(`42${NS},${JSON.stringify(['world:move', {
      x: Math.round(player.pos.x * 100) / 100,
      z: Math.round(player.pos.z * 100) / 100,
      heading: Math.round(player.heading * 1000) / 1000,
      mode: 'walk',
      speed: walking ? 1.8 : 0,
    }])}`);
    wsMovesSent.add(1);
  };
  timers.push(setInterval(() => {
    if (stopped) return;
    if (over()) { stop(); return; }
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    if (now > phaseEnds) {
      walking = !walking;
      phaseEnds = now + (walking ? rand(15000, 40000) : rand(8000, 25000));
      if (walking) player.heading = Math.random() * Math.PI * 2;
    }
    if (walking && player.outside) {
      // Wander within ~15 m of the door and turn back when too far.
      const dx = player.pos.x - player.home.x;
      const dz = player.pos.z - player.home.z;
      if (dx * dx + dz * dz > 225) player.heading = Math.atan2(-dx, -dz);
      player.pos.x += Math.sin(player.heading) * 1.8 * dt;
      player.pos.z += Math.cos(player.heading) * 1.8 * dt;
    }
    if (walking || now - lastSent >= 2000) {
      lastSent = now;
      sendMove();
    }
  }, 250));

  // The Socket.IO connection (Engine.IO v4 text framing, written by hand).
  let attempts = 0;
  let windowBytes = 0;
  let windowStart = Date.now();
  timers.push(setInterval(() => {
    const seconds = (Date.now() - windowStart) / 1000;
    if (player.connected && seconds > 0) wsBytesPerSecPerVu.add(windowBytes / seconds);
    windowBytes = 0;
    windowStart = Date.now();
  }, 10000));

  const connect = () => {
    if (stopped || over()) return;
    attempts += 1;
    player.connected = false;
    let settled = false;
    const settle = (ok) => { if (!settled) { settled = true; wsConnectSuccess.add(ok); } };
    ws = new WebSocket(`${WS_URL}/socket.io/?EIO=4&transport=websocket`, null, { headers: { 'cf-connecting-ip': player.ip, Origin: BASE_URL } });
    ws.onmessage = (event) => {
      const data = typeof event.data === 'string' ? event.data : '';
      const bytes = data.length;
      wsBytesReceived.add(bytes);
      windowBytes += bytes;
      if (data === '2') { ws.send('3'); return; } // Engine.IO ping -> pong
      if (data.charAt(0) === '0') {
        // Engine.IO open -> connect to the realtime namespace with the same auth the client sends.
        ws.send(`40${NS},${JSON.stringify({ token: player.token })}`);
      } else if (data.startsWith(`40${NS}`)) {
        player.connected = true;
        attempts = 0;
        settle(true);
      } else if (data.startsWith(`44${NS}`)) {
        settle(false);
      } else if (data.startsWith(`42${NS},`)) {
        const body = data.slice(NS.length + 4); // after `42/realtime,[`
        const name = body.slice(1, body.indexOf('"', 1));
        if (name === 'world:players') { wsWorldPlayersMsgs.add(1); wsWorldPlayersBytes.add(bytes); }
        else if (name === 'world:full') wsWorldFull.add(1);
        else if (name === 'character:invalidate') player.snapshot(); // the client refetches the snapshot on this
      }
    };
    ws.onerror = () => settle(false);
    ws.onclose = () => {
      player.connected = false;
      settle(false);
      if (stopped || over()) return;
      // Like socket.io-client: back off 1 s -> 10 s, reconnect with a still-valid token.
      timers.push(setTimeout(() => { player.refreshIfDue(); connect(); }, Math.min(10000, 1000 * Math.max(1, attempts))));
    };
  };
  connect();
}
