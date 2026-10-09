/**
 * A whole console on loopback, for tests: the console itself, a real Bella Vigna
 * server reporting to it, and a stand-in for LunArt's production Staff API as it
 * answers today (no `property` field, no `rooms`, its own token).
 */

import { createServer } from 'node:http';
import { createApp } from '../../server/app.js';
import { createStore } from '../../server/store.js';
import { createMockStripe } from '../../server/stripe.js';
import { createConsoleApp } from '../../server/console/app.js';
import { syncOperators } from '../../server/console/auth.js';
import { consoleConfig } from '../../server/console/config.js';
import { createConsoleStore } from '../../server/console/store.js';
import { CONSOLE_OPERATORS, CONSOLE_PROPERTIES } from '../../data/console.js';
import { createAuthenticator } from './authenticator.mjs';

export const SECRETS = {
  bvService: 'svc-bella-vigna-test-credential',
  bvShared: 'shared-staff-token-bv',
  bvRelay: 'relay-secret-bella-vigna',
  lunartService: 'svc-lunart-test-credential',
  lunartRelay: 'relay-secret-lunart',
  setup: 'setup-code-for-tests-0123456789',
};

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

/** LunArt's Staff API as production answers it on 51ac362: same shapes, no house named. */
export function fakeLunart({ token = SECRETS.lunartService, claim = null } = {}) {
  const seen = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, actor: req.headers['x-console-actor'], body });
    const send = (status, payload) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(payload));
    if (req.headers.authorization !== `Bearer ${token}`) { send(401, { error: 'unauthorised' }); return; }
    const url = new URL(req.url, 'http://x');
    const extra = claim ? { property: { id: claim, name: claim } } : {};
    if (url.pathname === '/api/staff/dashboard') {
      send(200, {
        ...extra,
        today: '2026-10-09', orders: { new: 2, awaiting: 1, preparing: 0, completed: 5 },
        arrivals: [{ id: 'r-l1', first_name: 'Anna', last_name: 'Rossi', room: '303', rooms: ['303'], check_in: '2026-10-09', check_out: '2026-10-11', status: 'active' }],
        departures: [], inHouse: 4, next: [], alerts: 0, guestCancellations: [], push: { configured: true },
      });
      return;
    }
    if (url.pathname === '/api/staff/orders') {
      send(200, { ...extra, counts: { new: 2 }, orders: [{ id: 'o-l1', queue: 'new', status: 'paid', amount: 4900, currency: 'EUR', lines: [{ title: 'Breakfast', amount: 4900 }], customer: { name: 'Anna Rossi', room: '303' }, fulfilment_status: 'requested' }] });
      return;
    }
    if (url.pathname === '/api/staff/reservations') {
      send(200, { ...extra, groups: { 'in-house': [] }, order: ['in-house'] });
      return;
    }
    const action = url.pathname.match(/^\/api\/staff\/orders\/([^/]+)\/([^/]+)$/);
    if (action && req.method === 'POST') { send(200, { ok: true, order: { id: action[1], status: action[2] } }); return; }
    send(404, { error: 'not-found' });
  });
  return { server, seen };
}

/**
 * Start everything. `clock.now` drives the console's sessions; move it forward to
 * age a session or a passkey check.
 */
export async function startConsole({ operators = CONSOLE_OPERATORS, lunartClaim = null, retired = false } = {}) {
  const clock = { now: Date.now() };
  const pushed = [];
  const pushTransport = {
    async sendNotification(subscription, payload) {
      pushed.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
      return { statusCode: 201 };
    },
  };

  // The console first, so the property can be told where to relay.
  const consoleServer = createServer();
  const consolePort = await listen(consoleServer);
  const origin = `http://localhost:${consolePort}`;

  const lunart = fakeLunart({ claim: lunartClaim });
  const lunartPort = await listen(lunart.server);

  const bvStore = createStore();
  const bv = await createApp({
    store: bvStore, stripe: createMockStripe(), cardSigningKey: 'console-test', mode: 'production',
    seed: false, allowPlaceholderPrices: true, useDevPrices: false,
    staffToken: SECRETS.bvShared, staffTokenRetired: retired,
    console: { serviceToken: SECRETS.bvService, url: origin, relayUrl: `http://127.0.0.1:${consolePort}`, relaySecret: SECRETS.bvRelay },
  });
  const bvServer = bv.listen(0);
  await new Promise((resolve) => bvServer.once('listening', resolve));
  const bvUrl = `http://127.0.0.1:${bvServer.address().port}`;

  const config = consoleConfig({
    PORT: String(consolePort),
    CONSOLE_PUBLIC_URL: origin,
    CONSOLE_SETUP_CODE: SECRETS.setup,
    CONSOLE_PROPERTY_LUNART_URL: `http://127.0.0.1:${lunartPort}`,
    CONSOLE_PROPERTY_LUNART_TOKEN: SECRETS.lunartService,
    CONSOLE_PROPERTY_LUNART_RELAY_SECRET: SECRETS.lunartRelay,
    CONSOLE_PROPERTY_BELLA_VIGNA_URL: bvUrl,
    CONSOLE_PROPERTY_BELLA_VIGNA_TOKEN: SECRETS.bvService,
    CONSOLE_PROPERTY_BELLA_VIGNA_RELAY_SECRET: SECRETS.bvRelay,
  });
  const store = await createConsoleStore({});
  await syncOperators(store, operators);
  const app = await createConsoleApp({ config, store, pushTransport, now: () => clock.now });
  consoleServer.on('request', app.handle);

  return {
    origin, clock, pushed, store, app, config, bv, bvStore, bvUrl, lunart,
    properties: CONSOLE_PROPERTIES,
    client: () => createClient(origin),
    authenticator: () => createAuthenticator({ origin, rpId: 'localhost' }),
    async close() {
      await Promise.all([consoleServer, lunart.server, bvServer].map((s) => new Promise((resolve) => { s.closeAllConnections?.(); s.close(resolve); })));
    },
  };
}

/** A browser, minus the browser: one cookie jar, the console's Origin on every call. */
export function createClient(origin) {
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        origin,
        ...(cookie ? { cookie } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const set = response.headers.get('set-cookie');
    if (set) {
      const value = set.split(';')[0];
      cookie = value.endsWith('=') ? '' : value;
    }
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: response.status, body: json, text, headers: response.headers, setCookie: set };
  };
  return {
    get: (path, headers) => call('GET', path, undefined, headers),
    post: (path, body = {}, headers) => call('POST', path, body, headers),
    get cookie() { return cookie; },
    set cookie(value) { cookie = value; },
  };
}

/** Enrol a passkey with whatever authority `start` carries ({ invite } or { setupCode }). */
export async function enrol(client, authenticator, start) {
  const options = await client.post('/console/api/enrol/options', start);
  if (options.status !== 200) return options;
  return client.post('/console/api/enrol/verify', { response: authenticator.register(options.body.options), label: 'Telefono' });
}

export async function signIn(client, authenticator, overrides = {}) {
  const options = await client.post('/console/api/sign-in/options');
  return client.post('/console/api/sign-in/verify', { response: authenticator.assert(options.body, overrides) });
}

export async function stepUp(client, authenticator) {
  const options = await client.post('/console/api/step-up/options');
  return client.post('/console/api/step-up/verify', { response: authenticator.assert(options.body) });
}

/** The owner enrolled with the setup code, then Valentina and Diego by invitation. */
export async function everyoneEnrolled(env) {
  const people = {};
  const owner = { client: env.client(), passkey: env.authenticator() };
  await enrol(owner.client, owner.passkey, { setupCode: SECRETS.setup });
  people.jacopo = owner;
  for (const id of ['valentina', 'diego']) {
    const invite = await owner.client.post(`/console/api/people/${id}/invite`, { purpose: 'enroll' });
    const token = new URL(invite.body.link).hash.replace('#invito=', '');
    const person = { client: env.client(), passkey: env.authenticator() };
    await enrol(person.client, person.passkey, { invite: token });
    people[id] = person;
  }
  return people;
}
