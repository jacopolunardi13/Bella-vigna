/**
 * The Staff console: one app for LunArt and Bella Vigna.
 *
 * Everything here runs against the real pieces on loopback — the console, a real
 * Bella Vigna server reporting to it, and a stand-in for LunArt's production Staff
 * API — with a software passkey verified by the real WebAuthn library. What is
 * pinned is the operator's brief: one login per person, roles and houses checked
 * on the server, sensitive operations behind a fresh passkey, every record
 * labelled with its house, notifications only to the people who work there, and
 * the shared token retired without stopping anybody.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  startConsole, enrol, signIn, stepUp, everyoneEnrolled, createClient, SECRETS,
} from './support/console.mjs';
import { createAuthenticator } from './support/authenticator.mjs';
import { policyFor, permissionsOf, ROLES } from '../server/console/permissions.js';
import { signRelay } from '../server/relay.js';
import { syncOperators } from '../server/console/auth.js';
import { createConsoleStore } from '../server/console/store.js';
import { consoleConfig } from '../server/console/config.js';
import { CONSOLE_OPERATORS, CONSOLE_PROPERTIES } from '../data/console.js';

async function withConsole(t, options) {
  const env = await startConsole(options);
  t.after(() => env.close());
  return env;
}

const MINUTE = 60 * 1000;

/* ── The people, as the operator listed them ─────────────────────────────── */

test('three people, as the operator listed them, and nobody else', () => {
  assert.deepEqual(CONSOLE_OPERATORS.map((o) => [o.id, o.role]), [
    ['jacopo', 'owner'], ['valentina', 'manager'], ['diego', 'frontdesk'],
  ]);
  // Both houses for everyone; only the owner is open to houses added later.
  assert.deepEqual(CONSOLE_OPERATORS.find((o) => o.id === 'jacopo').properties, ['*']);
  for (const id of ['valentina', 'diego']) {
    assert.deepEqual(CONSOLE_OPERATORS.find((o) => o.id === id).properties, ['lunart', 'bella-vigna']);
  }
  assert.deepEqual(CONSOLE_PROPERTIES.map((p) => p.id), ['lunart', 'bella-vigna']);
});

test('front desk works reservations, arrivals and orders; money, bulk email and access are not theirs', () => {
  const desk = permissionsOf('frontdesk');
  for (const p of ['reservations.manage', 'reservations.cancel', 'orders.work', 'dashboard.view', 'sync.run']) assert.ok(desk.has(p), p);
  for (const p of ['orders.refund', 'orders.cancel', 'payments.reconcile', 'emails.bulk', 'emails.bulk.preview', 'access.manage', 'audit.view', 'sync.repair']) {
    assert.ok(!desk.has(p), p);
  }
  const manager = permissionsOf('manager');
  for (const p of ['orders.refund', 'orders.cancel', 'payments.reconcile', 'emails.bulk', 'audit.view']) assert.ok(manager.has(p), p);
  assert.ok(!manager.has('access.manage'), 'managing access is the owner’s');
  assert.ok(permissionsOf('owner').has('access.manage'));
  assert.equal(Object.keys(ROLES).length, 3);
});

test('the console forwards a fixed list of Staff routes, rebuilt from the table, never a path it was handed', () => {
  assert.equal(policyFor('GET', '/dashboard').upstreamPath, '/dashboard');
  assert.equal(policyFor('POST', '/orders/abc/refund', {}).permission, 'orders.refund');
  assert.equal(policyFor('POST', '/orders/abc/refund', {}).sensitive, true);
  assert.equal(policyFor('POST', '/orders/abc/preparing', {}).sensitive, false);
  // The dry run of a refund reconciliation is harmless; the confirmed one is not.
  assert.equal(policyFor('POST', '/orders/refund-reconcile', { order: 'X' }).sensitive, false);
  assert.equal(policyFor('POST', '/orders/refund-reconcile', { order: 'X', confirm: true }).sensitive, true);
  assert.equal(policyFor('POST', '/sync/guide-catchup', {}).sensitive, true);
  for (const [method, path] of [
    ['POST', '/push/test'], ['POST', '/push/subscribe'], ['GET', '/orders/x/../../checks'],
    ['POST', '/orders/%2e%2e/refund'], ['POST', '/orders/a%2Fb/confirm'], ['GET', '/../health'],
    ['DELETE', '/orders/x/refund'], ['POST', '/orders/x/explode'],
  ]) {
    assert.equal(policyFor(method, path, {}).ok, false, `${method} ${path}`);
  }
});

/* ── Getting in ──────────────────────────────────────────────────────────── */

test('the owner’s first passkey comes from the setup code, and only the owner’s', async (t) => {
  const env = await withConsole(t);
  const anon = env.client();
  assert.equal((await anon.get('/console/api/me')).status, 401);

  const wrong = await anon.post('/console/api/enrol/options', { setupCode: 'guess' });
  assert.equal(wrong.status, 403);
  // Asking for Diego with the right code still enrols nobody: the code is the owner's.
  const forDiego = await anon.post('/console/api/enrol/options', { setupCode: SECRETS.setup, user: 'diego' });
  assert.equal(forDiego.status, 400);

  const owner = env.client();
  const passkey = env.authenticator();
  const enrolled = await enrol(owner, passkey, { setupCode: SECRETS.setup });
  assert.equal(enrolled.status, 200);
  assert.equal(enrolled.body.user.role, 'owner');
  assert.match(enrolled.setCookie, /^__Host-staff=[\w-]{40,}; Path=\/; HttpOnly; SameSite=Strict; Secure; Max-Age=\d+$/);
  const me = await owner.get('/console/api/me');
  assert.equal(me.body.user.id, 'jacopo');
  assert.deepEqual(me.body.properties.map((p) => p.id), ['lunart', 'bella-vigna']);
});

test('guessing the setup code stops after five tries, and every try is logged', async (t) => {
  const env = await withConsole(t);
  const anon = env.client();
  for (let i = 0; i < 5; i++) assert.equal((await anon.post('/console/api/enrol/options', { setupCode: `no-${i}` })).status, 403);
  assert.equal((await anon.post('/console/api/enrol/options', { setupCode: SECRETS.setup })).status, 429, 'locked even for the right code');
  const refused = await env.store.read((doc) => doc.audit.filter((e) => e.action === 'setup.refused').length);
  assert.equal(refused, 5);
});

test('an invitation enrols one person, once', async (t) => {
  const env = await withConsole(t);
  const people = await everyoneEnrolled(env);
  const invite = await people.jacopo.client.post('/console/api/people/diego/invite', { purpose: 'enroll' });
  assert.equal(invite.status, 200);
  assert.match(invite.body.link, new RegExp(`^${env.origin}/#invito=[\\w-]{40,}$`));
  const token = new URL(invite.body.link).hash.replace('#invito=', '');

  const described = await env.client().post('/console/api/invite/describe', { invite: token });
  assert.deepEqual(described.body.user, { id: 'diego', name: 'Diego', role: 'frontdesk' });

  const phone = env.client();
  assert.equal((await enrol(phone, env.authenticator(), { invite: token })).status, 200);
  const again = await enrol(env.client(), env.authenticator(), { invite: token });
  assert.equal(again.status, 400);
  assert.equal(again.body.error, 'invite-invalid');

  // Only its hash is kept.
  const stored = await env.store.read((doc) => JSON.stringify(doc));
  assert.ok(!stored.includes(token));
});

test('an invitation expires, and a newer one replaces an older one', async (t) => {
  const env = await withConsole(t);
  const people = await everyoneEnrolled(env);
  const first = new URL((await people.jacopo.client.post('/console/api/people/diego/invite', {})).body.link).hash.slice(8);
  const second = new URL((await people.jacopo.client.post('/console/api/people/diego/invite', {})).body.link).hash.slice(8);
  assert.equal((await env.client().post('/console/api/invite/describe', { invite: first })).status, 400);
  env.clock.now += 73 * 60 * MINUTE;
  assert.equal((await env.client().post('/console/api/invite/describe', { invite: second })).status, 400);
});

test('signing in is a passkey: no name, no password; a stolen assertion or another site’s is refused', async (t) => {
  const env = await withConsole(t);
  const people = await everyoneEnrolled(env);
  const phone = env.client();
  const ok = await signIn(phone, people.diego.passkey);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.id, 'diego');
  assert.equal((await phone.get('/console/api/me')).body.user.role, 'frontdesk');

  // The same signed answer, sent again: its challenge is spent.
  const options = await env.client().post('/console/api/sign-in/options');
  const answer = people.diego.passkey.assert(options.body);
  assert.equal((await env.client().post('/console/api/sign-in/verify', { response: answer })).status, 200);
  const replay = await env.client().post('/console/api/sign-in/verify', { response: answer });
  assert.equal(replay.status, 400);
  assert.equal(replay.body.error, 'challenge-expired');

  // A look-alike page relaying the challenge: the origin in the signed data is wrong.
  const phished = await signIn(env.client(), people.diego.passkey, { origin: 'https://staff-lunart.example' });
  assert.equal(phished.status, 401);

  // A passkey nobody registered.
  assert.equal((await signIn(env.client(), env.authenticator())).status, 401);
});

test('a passkey that does not verify the person (no Face ID, no PIN) is refused', async (t) => {
  const env = await withConsole(t);
  const lazy = createAuthenticator({ origin: env.origin, rpId: 'localhost', userVerified: false });
  const refused = await enrol(env.client(), lazy, { setupCode: SECRETS.setup });
  assert.equal(refused.status, 400);
});

test('every state-changing call must come from the console’s own page', async (t) => {
  const env = await withConsole(t);
  const people = await everyoneEnrolled(env);
  const cookie = people.diego.client.cookie;
  const forged = await fetch(`${env.origin}/console/api/p/bella-vigna/reservations`, {
    method: 'POST',
    headers: { cookie, origin: 'https://evil.example', 'content-type': 'application/json' },
    body: JSON.stringify({ first_name: 'X' }),
  });
  assert.equal(forged.status, 403);
  const noOrigin = await fetch(`${env.origin}/console/api/sign-out`, { method: 'POST', headers: { cookie } });
  assert.equal(noOrigin.status, 403);
});

test('a session ends after 72 hours idle and after 14 days whatever happens, and at sign-out', async (t) => {
  const env = await withConsole(t);
  const people = await everyoneEnrolled(env);
  const diego = people.diego.client;
  env.clock.now += 71 * 60 * MINUTE;
  assert.equal((await diego.get('/console/api/me')).status, 200);
  env.clock.now += 73 * 60 * MINUTE;
  assert.equal((await diego.get('/console/api/me')).status, 401, 'idle');

  const valentina = people.valentina.client;
  assert.equal((await signIn(valentina, people.valentina.passkey)).status, 200);
  for (let day = 0; day < 15; day++) {
    env.clock.now += 24 * 60 * MINUTE;
    await valentina.get('/console/api/me');
  }
  assert.equal((await valentina.get('/console/api/me')).status, 401, 'absolute');

  const jacopo = people.jacopo.client;
  assert.equal((await signIn(jacopo, people.jacopo.passkey)).status, 200);
  const out = await jacopo.post('/console/api/sign-out');
  assert.match(out.setCookie, /Max-Age=0/);
  assert.equal((await jacopo.get('/console/api/me')).status, 401);
});

/* ── Recovery ────────────────────────────────────────────────────────────── */

test('a lost phone: the owner revokes its passkey, its sessions end, and a recovery link brings the person back', async (t) => {
  const env = await withConsole(t);
  const people = await everyoneEnrolled(env);
  const owner = people.jacopo.client;

  const roster = await owner.get('/console/api/people');
  const diego = roster.body.people.find((p) => p.id === 'diego');
  assert.equal(diego.passkeys.length, 1);

  assert.equal((await owner.post(`/console/api/people/diego/passkeys/${diego.passkeys[0].id}/revoke`)).status, 200);
  assert.equal((await people.diego.client.get('/console/api/me')).status, 401, 'the lost phone is signed out');
  assert.equal((await signIn(env.client(), people.diego.passkey)).status, 401, 'and cannot sign in again');

  const link = await owner.post('/console/api/people/diego/invite', { purpose: 'recover', revokeExisting: true });
  const token = new URL(link.body.link).hash.slice(8);
  const newPhone = env.client();
  const newKey = env.authenticator();
  assert.equal((await enrol(newPhone, newKey, { invite: token })).status, 200);
  assert.equal((await newPhone.get('/console/api/me')).body.user.id, 'diego');
});

test('the owner’s last resort is the setup code again, and it is logged', async (t) => {
  const env = await withConsole(t);
  const people = await everyoneEnrolled(env);
  const replacement = env.authenticator();
  assert.equal((await enrol(env.client(), replacement, { setupCode: SECRETS.setup })).status, 200);
  const passkeys = await env.store.read((doc) => Object.values(doc.credentials).filter((c) => c.user_id === 'jacopo' && !c.revoked_at));
  assert.equal(passkeys.length, 2);
  const added = await env.store.read((doc) => doc.audit.filter((e) => e.action === 'passkey.added' && e.actor === 'jacopo'));
  assert.deepEqual(added.map((e) => e.detail.via), ['setup', 'setup']);
  assert.ok(people.jacopo);
});

test('adding a second device needs a fresh passkey check, so an open session alone cannot plant one', async (t) => {
  const env = await withConsole(t);
  const people = await everyoneEnrolled(env);
  env.clock.now += 10 * MINUTE;
  const stale = await people.diego.client.post('/console/api/enrol/options', {});
  assert.equal(stale.status, 403);
  assert.equal(stale.body.error, 'step-up-required');
  assert.equal((await stepUp(people.diego.client, people.diego.passkey)).status, 200);
  const laptop = env.authenticator();
  assert.equal((await enrol(people.diego.client, laptop, {})).status, 200);
  assert.equal((await signIn(env.client(), laptop)).body.user.id, 'diego');
});

test('only the owner manages access', async (t) => {
  const env = await withConsole(t);
  const people = await everyoneEnrolled(env);
  for (const id of ['valentina', 'diego']) {
    const client = people[id].client;
    assert.equal((await client.get('/console/api/people')).status, 403, id);
    assert.equal((await client.post('/console/api/people/diego/invite', {})).status, 403, id);
  }
});

test('a person taken off the list is disabled and signed out everywhere', async (t) => {
  const env = await withConsole(t);
  const people = await everyoneEnrolled(env);
  await syncOperators(env.store, CONSOLE_OPERATORS.filter((o) => o.id !== 'diego'));
  assert.equal((await people.diego.client.get('/console/api/me')).status, 401);
  assert.equal((await signIn(env.client(), people.diego.passkey)).status, 401);
  assert.equal((await env.client().post('/console/api/people/diego/invite', {})).status, 401);
});

/* ── Working ─────────────────────────────────────────────────────────────── */

test('one read across both houses, each answer labelled with its house', async (t) => {
  const env = await withConsole(t);
  const people = await everyoneEnrolled(env);
  const all = await people.diego.client.get('/console/api/all/dashboard');
  assert.equal(all.status, 200);
  assert.deepEqual(all.body.results.map((r) => [r.property.id, r.ok]), [['lunart', true], ['bella-vigna', true]]);
  // LunArt in production does not name itself yet: the console labels it.
  assert.equal(all.body.results[0].data.property.id, 'lunart');
  assert.deepEqual(all.body.results[0].property.rooms, ['301', '302', '303', '304', '305', '306']);
  // Bella Vigna names itself and lists its rooms.
  assert.deepEqual(all.body.results[1].data.rooms.map((r) => r.id), ['Standard', 'Deluxe', 'Terrazza']);

  const one = await people.diego.client.get('/console/api/all/dashboard?properties=bella-vigna');
  assert.deepEqual(one.body.results.map((r) => r.property.id), ['bella-vigna']);
});

test('front desk: creates a stay and moves an order; a refund is refused at the server', async (t) => {
  const env = await withConsole(t);
  const people = await everyoneEnrolled(env);
  const diego = people.diego.client;

  const stay = await diego.post('/console/api/p/bella-vigna/reservations', {
    first_name: 'Giulia', last_name: 'Neri', check_in: '2026-11-02', check_out: '2026-11-04',
    room: 'Terrazza', adults: 2, guest_email: 'giulia@example.invalid',
  });
  assert.equal(stay.status, 201);
  assert.equal(stay.body.property.id, 'bella-vigna');

  const moved = await diego.post('/console/api/p/lunart/orders/o-l1/preparing', { by: 'someone else' });
  assert.equal(moved.status, 200);
  // Who did it is the console's to say.
  assert.equal(env.lunart.seen.at(-1).body.by, 'Diego');
  assert.equal(env.lunart.seen.at(-1).actor, 'diego');
  assert.equal(env.lunart.seen.at(-1).auth, `Bearer ${SECRETS.lunartService}`);

  const before = env.lunart.seen.length;
  for (const [path, body] of [
    ['/console/api/p/lunart/orders/o-l1/refund', {}],
    ['/console/api/p/lunart/orders/o-l1/cancel', {}],
    ['/console/api/p/lunart/sync/guide-catchup', { confirm: true }],
    ['/console/api/p/bella-vigna/sync/repair', {}],
    ['/console/api/p/lunart/orders/refund-reconcile', { order: 'X' }],
  ]) {
    const refused = await diego.post(path, body);
    assert.equal(refused.status, 403, path);
  }
  assert.equal((await diego.get('/console/api/p/lunart/sync/guide-catchup')).status, 403);
  assert.equal(env.lunart.seen.length, before, 'nothing refused reached the property');
});

test('direzione refunds, but only with a passkey check in the last five minutes', async (t) => {
  const env = await withConsole(t);
  const people = await everyoneEnrolled(env);
  const valentina = people.valentina.client;
  env.clock.now += 6 * MINUTE;
  const stale = await valentina.post('/console/api/p/lunart/orders/o-l1/refund', { note: 'doppio addebito' });
  assert.equal(stale.status, 403);
  assert.equal(stale.body.error, 'step-up-required');

  assert.equal((await stepUp(valentina, people.valentina.passkey)).status, 200);
  const done = await valentina.post('/console/api/p/lunart/orders/o-l1/refund', { note: 'doppio addebito' });
  assert.equal(done.status, 200);
  assert.equal(env.lunart.seen.at(-1).body.by, 'Valentina');

  // Someone else's passkey cannot stand in for hers.
  env.clock.now += 6 * MINUTE;
  const options = await valentina.post('/console/api/step-up/options');
  const borrowed = await valentina.post('/console/api/step-up/verify', { response: people.diego.passkey.assert(options.body) });
  assert.equal(borrowed.status, 403);
});

test('a house nobody gave you, an unknown house, and a route outside the list are all refused', async (t) => {
  const env = await withConsole(t, {
    operators: [
      { id: 'jacopo', name: 'Jacopo', role: 'owner', properties: ['*'] },
      { id: 'diego', name: 'Diego', role: 'frontdesk', properties: ['bella-vigna'] },
      { id: 'valentina', name: 'Valentina', role: 'manager', properties: ['lunart', 'bella-vigna'] },
    ],
  });
  const people = await everyoneEnrolled(env);
  const diego = people.diego.client;
  assert.equal((await diego.get('/console/api/p/lunart/dashboard')).status, 403);
  const all = await diego.get('/console/api/all/dashboard?properties=lunart,bella-vigna');
  assert.deepEqual(all.body.results.map((r) => r.property.id), ['bella-vigna'], 'picking a house does not grant it');
  assert.deepEqual((await diego.get('/console/api/me')).body.properties.map((p) => p.id), ['bella-vigna']);
  assert.equal((await diego.get('/console/api/p/ritz/dashboard')).status, 404);
  assert.equal((await diego.post('/console/api/p/bella-vigna/push/test', {})).status, 404);
  // fetch() resolves the dots before sending, so this arrives as /checks: refused for front desk.
  assert.ok([403, 404].includes((await diego.get('/console/api/p/bella-vigna/orders/x/../../checks')).status));
});

test('a property answering as another house is refused, not shown under the wrong badge', async (t) => {
  const env = await withConsole(t, { lunartClaim: 'bella-vigna' });
  const people = await everyoneEnrolled(env);
  const answer = await people.diego.client.get('/console/api/p/lunart/dashboard');
  assert.equal(answer.status, 502);
  assert.equal(answer.body.error, 'property-mismatch');
});

test('the browser never sees a property’s address or credential', async (t) => {
  const env = await withConsole(t);
  const people = await everyoneEnrolled(env);
  const texts = [
    (await env.client().get('/console/api/health')).text,
    (await people.jacopo.client.get('/console/api/me')).text,
    (await people.jacopo.client.get('/console/api/all/dashboard')).text,
    (await people.jacopo.client.get('/console/api/people')).text,
    (await people.jacopo.client.get('/console/api/audit')).text,
  ].join('\n');
  for (const secret of [SECRETS.bvService, SECRETS.lunartService, SECRETS.bvRelay, SECRETS.lunartRelay, SECRETS.setup, env.bvUrl]) {
    assert.ok(!texts.includes(secret), `leaked ${secret.slice(0, 8)}…`);
  }
});

test('every change made through the console is in the log, refusals included; front desk cannot read it', async (t) => {
  const env = await withConsole(t);
  const people = await everyoneEnrolled(env);
  await people.diego.client.post('/console/api/p/lunart/orders/o-l1/completed', {});
  await people.diego.client.post('/console/api/p/lunart/orders/o-l1/refund', {});
  const log = await people.valentina.client.get('/console/api/audit');
  assert.equal(log.status, 200);
  const mine = log.body.entries.filter((e) => e.actor === 'diego' && e.property === 'lunart');
  assert.deepEqual(mine.map((e) => [e.action, e.outcome]), [['orders.refund:refund', 'refused:403'], ['orders.work:completed', 'ok']]);
  assert.equal((await people.diego.client.get('/console/api/audit')).status, 403);
});

/* ── Notifications ───────────────────────────────────────────────────────── */

test('a property’s event reaches the phones of the people who work there, titled with its house', async (t) => {
  const env = await withConsole(t, {
    operators: [
      { id: 'jacopo', name: 'Jacopo', role: 'owner', properties: ['*'] },
      { id: 'valentina', name: 'Valentina', role: 'manager', properties: ['lunart'] },
      { id: 'diego', name: 'Diego', role: 'frontdesk', properties: ['lunart', 'bella-vigna'] },
    ],
  });
  const people = await everyoneEnrolled(env);
  for (const id of ['jacopo', 'valentina', 'diego']) {
    await people[id].client.post('/console/api/push/subscribe', {
      subscription: { endpoint: `https://push.example/${id}`, keys: { p256dh: 'k', auth: 'a' } },
    });
  }
  const created = await people.diego.client.post('/console/api/p/bella-vigna/reservations', {
    first_name: 'Luca', last_name: 'Bianchi', check_in: '2026-11-10', check_out: '2026-11-12', room: 'Deluxe', adults: 2,
  });
  assert.equal(created.status, 201);
  // The property relays before it answers, so the push is already out.
  const endpoints = env.pushed.map((p) => p.endpoint).sort();
  assert.deepEqual(endpoints, ['https://push.example/diego', 'https://push.example/jacopo'], 'not Valentina: she does not work for Bella Vigna here');
  assert.match(env.pushed[0].payload.title, /^Bella Vigna · Nuova prenotazione$/);
  assert.equal(env.pushed[0].payload.property, 'bella-vigna');

  const seen = await people.valentina.client.get('/console/api/notifications');
  assert.deepEqual(seen.body.notifications, []);
  const diegoSeen = await people.diego.client.get('/console/api/notifications');
  assert.equal(diegoSeen.body.notifications[0].property.id, 'bella-vigna');
});

test('the relay takes only signed, fresh, first-time events from the house they claim', async (t) => {
  const env = await withConsole(t);
  const post = (property, body, { secret = SECRETS.lunartRelay, at = Math.floor(env.clock.now / 1000) } = {}) => {
    const raw = JSON.stringify(body);
    return fetch(`${env.origin}/console/api/relay/${property}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-relay-timestamp': String(at), 'x-relay-signature': signRelay(secret, String(at), raw) },
      body: raw,
    });
  };
  const event = { id: 'evt-1', property: 'lunart', event: 'order-new', notification: { title: 'Colazione', body: 'Camera 303', tag: 'order:1' } };
  assert.equal((await post('lunart', event)).status, 202);
  assert.equal((await post('lunart', event)).status, 200, 'a repeat is acknowledged and dropped');
  assert.equal((await post('lunart', { ...event, id: 'evt-2' }, { secret: SECRETS.bvRelay })).status, 401, 'another house’s secret');
  assert.equal((await post('lunart', { ...event, id: 'evt-3' }, { at: Math.floor(env.clock.now / 1000) - 600 })).status, 401, 'stale');
  assert.equal((await post('bella-vigna', { ...event, id: 'evt-4' }, { secret: SECRETS.bvRelay })).status, 400, 'claims another house');
  const stored = await env.store.read((doc) => doc.notifications);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].title, 'LunArt · Colazione', 'titled with the house whatever was sent');
});

/* ── The properties' side ────────────────────────────────────────────────── */

test('a property accepts the console’s own credential alongside the shared Staff token', async (t) => {
  const env = await withConsole(t);
  const status = (token) => fetch(`${env.bvUrl}/api/staff/dashboard`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.status);
  assert.equal(await status(SECRETS.bvService), 200);
  assert.equal(await status(SECRETS.bvShared), 200);
  assert.equal(await status('nope'), 401);
  const health = await fetch(`${env.bvUrl}/api/health`).then((r) => r.json());
  assert.equal(health.integrations.staffConsole.configured, true);
  assert.equal(health.integrations.staffConsole.sharedStaffToken, 'active');
  assert.ok(!JSON.stringify(health).includes(SECRETS.bvService));
});

test('retiring the shared token: it stops working, the console keeps working, /staff leads to the console', async (t) => {
  const env = await withConsole(t, { retired: true });
  const status = (token) => fetch(`${env.bvUrl}/api/staff/dashboard`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.status);
  assert.equal(await status(SECRETS.bvShared), 401);
  assert.equal(await status(SECRETS.bvService), 200);
  const page = await fetch(`${env.bvUrl}/staff`, { redirect: 'manual' });
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), env.origin);
  const people = await everyoneEnrolled(env);
  assert.equal((await people.diego.client.get('/console/api/p/bella-vigna/dashboard')).status, 200);
});

/* ── The page and the store ──────────────────────────────────────────────── */

test('the console page is locked down: strict CSP, no framing, passkeys allowed only here', async (t) => {
  const env = await withConsole(t);
  const page = await fetch(`${env.origin}/`);
  assert.equal(page.status, 200);
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.match(page.headers.get('permissions-policy'), /publickey-credentials-get=\(self\)/);
  const html = await page.text();
  assert.ok(!/<script>(?!<\/script>)/.test(html.replace(/<script[^>]*src=[^>]*><\/script>/g, '')), 'no inline script');

  // It serves the Staff app and nothing else of the guide.
  assert.equal((await fetch(`${env.origin}/src/staff/app.js`)).status, 200);
  for (const path of ['/index.html', '/server/console/auth.js', '/package.json', '/data/entries/arrival.js', '/staff.html']) {
    assert.equal((await fetch(`${env.origin}${path}`)).status, 404, path);
  }
});

test('the console refuses a store that is not a console’s', async () => {
  const backend = { name: 'memory', async load() { return { meta: { property_id: 'lunart' }, reservations: { a: {} } }; }, async save() {} };
  await assert.rejects(() => createConsoleStore({ backend }), { code: 'console-store-refused' });
});

test('configuration: houses come from the environment, and missing pieces are said out loud', () => {
  const config = consoleConfig({
    NODE_ENV: 'production',
    CONSOLE_PUBLIC_URL: 'https://staff.example.test',
    CONSOLE_PROPERTY_BELLA_VIGNA_URL: 'https://bv.example.test/',
  });
  assert.deepEqual(config.properties.map((p) => [p.id, p.url]), [['bella-vigna', 'https://bv.example.test']]);
  assert.equal(config.rpId, 'staff.example.test');
  assert.equal(config.origin, 'https://staff.example.test');
  const text = config.warnings.join('\n');
  assert.match(text, /BELLA_VIGNA_TOKEN is not set/);
  assert.match(text, /CONSOLE_SETUP_CODE is not set/);
  assert.match(text, /lost at every restart/);
});

test('a client with no cookie support still cannot be signed in by someone else’s cookie name', async (t) => {
  const env = await withConsole(t);
  const client = createClient(env.origin);
  client.cookie = 'staff=forged';
  assert.equal((await client.get('/console/api/me')).status, 401);
  client.cookie = `__Host-staff=${'a'.repeat(43)}`;
  assert.equal((await client.get('/console/api/me')).status, 401);
});
