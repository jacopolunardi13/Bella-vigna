/**
 * Two properties, one core, nothing shared that should not be.
 *
 * Bella Vigna runs LunArt's code as a separate deployment: its own origin, its own
 * disk, its own Staff token, its own Stripe tagging. The day-one mistakes that
 * would mix the two are configuration mistakes — a copied environment, a shared
 * volume, a mailbox query that also matches LunArt — and none of them throws on
 * its own. These tests pin the guards that make them throw, refuse or stay quiet.
 *
 * The QuoVai and Stripe halves of the same story live with their own suites
 * (`quovai.test.mjs`: a notification for another property is refused;
 * `transports.test.mjs` / `commerce.test.mjs`: an event tagged for another
 * property touches nothing).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { createStore, TenantMismatchError } from '../server/store.js';
import { createApp } from '../server/app.js';
import { createMockStripe } from '../server/stripe.js';
import { isPrivatePath } from '../server/http.js';
import { wifiFor, privateWindowOpen } from '../server/private-facts.js';
import { buildNotification } from '../server/push.js';
import { ingestEvent } from '../server/ingest/index.js';
import { PROPERTY_ID, brand, whatsappHref, storageKey } from '../data/brand.js';
import { contacts, OFFICIAL_WHATSAPP } from '../data/property.js';
import { entries } from '../data/index.js';
import { propertyDate, addDays } from '../commerce/time.js';

const ROOT = new URL('../', import.meta.url).pathname;

const scratch = async () => mkdtemp(join(tmpdir(), 'bv-tenant-'));

/* ── The store knows whose it is ─────────────────────────────────────────── */

test('this deployment is Bella Vigna, and a new store says so on disk', async () => {
  assert.equal(PROPERTY_ID, 'bella-vigna');
  const dir = await scratch();
  try {
    const db = createStore({ dataDir: dir });
    await db.reservations.create({ booking_reference: 'BV-1' });
    await db.flush();
    const saved = JSON.parse(await readFile(join(dir, 'store.json'), 'utf8'));
    assert.equal(saved.meta.property_id, 'bella-vigna');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a store written by another property is refused, and never written to', async () => {
  const dir = await scratch();
  try {
    const foreign = JSON.stringify({
      meta: { property_id: 'lunart' },
      reservations: { r1: { id: 'r1', booking_reference: '6213834462', last_name: 'Kay', guide_token: 'lunart-token-0000000000' } },
    });
    await writeFile(join(dir, 'store.json'), foreign);
    const db = createStore({ dataDir: dir });

    await assert.rejects(db.verifyTenant(), (error) => error instanceof TenantMismatchError && error.owner === 'lunart');
    await assert.rejects(db.reservations.list(), TenantMismatchError, 'no read gets past it');
    await assert.rejects(db.reservations.create({ booking_reference: 'BV-2' }), TenantMismatchError, 'nor any write');
    await db.flush();
    assert.equal(await readFile(join(dir, 'store.json'), 'utf8'), foreign, 'the other property’s file is untouched');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('an unstamped store with guests in it cannot be shown to be ours, so it is refused too', async () => {
  // Every store this core writes carries a stamp; the only unstamped stores with
  // reservations in them are LunArt's from before the stamp existed.
  const dir = await scratch();
  try {
    await writeFile(join(dir, 'store.json'), JSON.stringify({ reservations: { r1: { id: 'r1' } } }));
    await assert.rejects(createStore({ dataDir: dir }).verifyTenant(), TenantMismatchError);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('an empty unstamped store is adopted, and stamped on the first write', async () => {
  const dir = await scratch();
  try {
    await writeFile(join(dir, 'store.json'), JSON.stringify({ sync_runs: {} }));
    const db = createStore({ dataDir: dir });
    await db.verifyTenant();
    await db.alerts.create({ key: 'k', status: 'open' });
    await db.flush();
    const saved = JSON.parse(await readFile(join(dir, 'store.json'), 'utf8'));
    assert.equal(saved.meta.property_id, 'bella-vigna');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the app will not start on another property’s store', async () => {
  const dir = await scratch();
  try {
    await writeFile(join(dir, 'store.json'), JSON.stringify({ meta: { property_id: 'lunart' } }));
    await assert.rejects(
      createApp({ dataDir: dir, stripe: createMockStripe(), useDevPrices: false, seed: false }),
      (error) => error.code === 'tenant-mismatch',
    );
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('LunArt’s environment variable names are not read here at all', async () => {
  // A Bella Vigna service configured by copying LunArt's environment must not
  // pick up LunArt's data directory, preview switch or price fixtures.
  const keys = ['LUNART_DATA_DIR', 'LUNART_PREVIEW', 'LUNART_DEV_PRICES', 'GUIDE_DATA_DIR', 'GUIDE_PREVIEW', 'GUIDE_DEV_PRICES'];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { LUNART_DATA_DIR: '/var/data/lunart', LUNART_PREVIEW: '1', LUNART_DEV_PRICES: '1' });
  for (const key of ['GUIDE_DATA_DIR', 'GUIDE_PREVIEW', 'GUIDE_DEV_PRICES']) delete process.env[key];
  try {
    const { config } = await import(`../server/config.js?tenant=${Math.random()}`);
    assert.equal(config.dataDir, '');
    assert.equal(config.preview, false);
    assert.equal(config.useDevPrices, false);
    assert.equal(config.propertyId, 'bella-vigna');
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

/* ── What a URL can reach ────────────────────────────────────────────────── */

test('the server’s own files are not a URL away', () => {
  for (const path of [
    '/server/config.js', '/server/app.js', '/test/tenant.test.mjs', '/tools/qa.mjs', '/docs/GO-LIVE.md',
    '/.env', '/.git/config', '/node_modules/web-push/package.json', '/legacy/index.html',
    '/package.json', '/render.yaml', '/README.md', '/assets/.secret',
  ]) {
    assert.equal(isPrivatePath(path), true, `${path} must not be served`);
  }
  for (const path of ['/assets/css/app.css', '/src/main.js', '/data/brand.js', '/commerce/rooms.js', '/sw.js', '/manifest.webmanifest']) {
    assert.equal(isPrivatePath(path), false, `${path} is the guide itself`);
  }
});

test('asking for a private file gets the guide page, never the file', async () => {
  const app = await createApp({ stripe: createMockStripe(), useDevPrices: false, seed: false, publicUrl: 'http://127.0.0.1' });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const source = await (await fetch(`${base}/server/config.js`)).text();
    assert.doesNotMatch(source, /process\.env/, 'no server source');
    const legacy = await (await fetch(`${base}/legacy/index.html`)).text();
    assert.doesNotMatch(legacy, /data:image\/png;base64/, 'not the old page');
    const pkg = await fetch(`${base}/package.json`);
    assert.doesNotMatch(await pkg.text(), /"dependencies"/);
    // An encoded climb out of the root resolves inside it, and finds nothing there.
    const climb = await (await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`)).text();
    assert.doesNotMatch(climb, /root:/);
  } finally { server.close(); }
});

/* ── The Wi-Fi password: one guest, one stay ─────────────────────────────── */

const today = propertyDate();
const stay = (over = {}) => ({ status: 'active', check_in: addDays(today, 1), check_out: addDays(today, 3), ...over });

test('the Wi-Fi password reaches a live stay only, from the day before arrival to checkout', () => {
  const password = 'configured-in-the-environment';
  assert.deepEqual(wifiFor(stay(), { password, today }), { password }, 'the day before arrival');
  assert.deepEqual(wifiFor(stay({ check_in: today }), { password, today }), { password }, 'arrival day');
  assert.deepEqual(wifiFor(stay({ check_in: addDays(today, -3), check_out: today }), { password, today }), { password }, 'checkout morning');
  assert.equal(wifiFor(stay({ check_in: addDays(today, 2) }), { password, today }), null, 'too early');
  assert.equal(wifiFor(stay({ check_in: addDays(today, -4), check_out: addDays(today, -1) }), { password, today }), null, 'gone');
  assert.equal(wifiFor(stay({ status: 'cancelled' }), { password, today }), null, 'cancelled');
  assert.equal(wifiFor(stay({ provisional: true }), { password, today }), null, 'a calendar hold is nobody');
  assert.equal(wifiFor(stay(), { password: '', today }), null, 'not configured: nothing');
  assert.equal(privateWindowOpen(null, today), false);
});

test('the personal link carries the password when configured, and the public guide never does', async () => {
  const password = 'only-for-this-guest';
  const app = await createApp({
    stripe: createMockStripe(), useDevPrices: false, seed: false, publicUrl: 'http://127.0.0.1', wifiPassword: password,
  });
  const created = await ingestEvent({
    store: app.store,
    event: {
      kind: 'new', source: 'quovai', booking_reference: 'BV-WIFI-1', first_name: 'Ada', last_name: 'Prova',
      guest_email: 'ada@example.invalid', check_in: today, check_out: addDays(today, 2), rooms: ['Deluxe'], room: 'Deluxe',
      message_id: '<bv-wifi-1@test>',
    },
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const personal = await (await fetch(`${base}/api/guide/${created.reservation.guide_token}`)).json();
    assert.deepEqual(personal.wifi, { password });

    const catalog = await (await fetch(`${base}/api/catalog`)).text();
    assert.equal(catalog.includes(password), false, 'not in the catalogue');
    const page = await (await fetch(`${base}/`)).text();
    assert.equal(page.includes(password), false, 'not in the public guide');

    await app.store.reservations.update(created.reservation.id, { status: 'cancelled' });
    const cancelled = await (await fetch(`${base}/api/guide/${created.reservation.guide_token}`)).json();
    assert.equal(cancelled.wifi, null, 'a cancelled stay no longer gets it');
  } finally { server.close(); }
});

test('a preview never reads the Wi-Fi password, however it got there', async () => {
  const before = { GUIDE_PREVIEW: process.env.GUIDE_PREVIEW, WIFI_PASSWORD: process.env.WIFI_PASSWORD };
  Object.assign(process.env, { GUIDE_PREVIEW: '1', WIFI_PASSWORD: 'pasted-by-mistake' });
  try {
    const { config } = await import(`../server/config.js?wifi=${Math.random()}`);
    assert.equal(config.wifiPassword, '');
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('the Wi-Fi entry names the network and the QR code, and holds no password', () => {
  const wifi = entries.find((entry) => entry.id === 'wifi');
  assert.equal(wifi.privateFact, 'wifi-password');
  assert.ok(wifi.facts.some((fact) => fact.value === 'WINDTRE-96F14E'));
  for (const fact of wifi.facts) assert.doesNotMatch(JSON.stringify(fact.label), /password/i);
});

test('no committed file carries a Wi-Fi password — ours or LunArt’s', () => {
  // LunArt publishes its own guest password in its guide; it must not have
  // travelled here with the core. Bella Vigna's is never committed at all.
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
    // This file names the string it looks for, so it is the one place allowed to.
    .filter((file) => !/\.(png|jpe?g|webp|woff2|pdf|ico)$/i.test(file) && !file.startsWith('legacy/') && file !== 'test/tenant.test.mjs');
  const offenders = [];
  for (const file of files) {
    if (!existsSync(join(ROOT, file))) continue;
    if (/LOPERACAFFE62R/.test(readFileSync(join(ROOT, file), 'utf8'))) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

/* ── The shared WhatsApp line names the house ────────────────────────────── */

test('the WhatsApp line is LunArt’s shared one, and every link to it names Bella Vigna', () => {
  assert.equal(OFFICIAL_WHATSAPP, '+393925661488', 'the number in LunArt’s own configuration');
  for (const lang of ['it', 'en']) {
    const href = whatsappHref(OFFICIAL_WHATSAPP, lang);
    assert.match(href, /^https:\/\/wa\.me\/393925661488\?text=/);
    assert.match(decodeURIComponent(href.split('text=')[1]), /Bella Vigna/);
  }
  const whatsapp = contacts.find((contact) => contact.whatsapp);
  assert.match(whatsapp.role.it, /LunArt/, 'the card says the line is shared');
});

test('the management telephone is its own channel, distinct from the WhatsApp line', () => {
  const management = contacts.find((contact) => contact.id === 'direzione');
  assert.equal(management.name, 'Valentina');
  assert.equal(management.phone, '+393296860909');
  assert.equal(management.whatsapp, undefined, 'a telephone, not a WhatsApp');
  assert.notEqual(management.phone, OFFICIAL_WHATSAPP);
});

/* ── What a phone holds, and what it is told ─────────────────────────────── */

test('everything a browser keeps is namespaced to the property', () => {
  assert.equal(storageKey('cart.v1'), 'bellavigna.cart.v1');
  const browserFiles = execFileSync('git', ['ls-files', 'src', '*.html'], { cwd: ROOT, encoding: 'utf8' }).split('\n')
    .filter((file) => file && !file.startsWith('legacy/'));
  for (const file of browserFiles) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    assert.doesNotMatch(text, /['"`]lunart[.:]/, `${file} must not read or write LunArt's storage keys`);
  }
});

test('a staff notification says which house it is about', () => {
  const note = buildNotification('reservation-new', { guest: 'Ada P.', room: 'Deluxe', check_in: '2026-11-02', check_out: '2026-11-04' });
  assert.match(note.title, /^Bella Vigna · /);
  assert.match(note.tag, /^bella-vigna:/);
  assert.equal(note.property, brand.id);
});

test('a guest types a Bella Vigna room with a keyboard, not a number pad', async () => {
  // LunArt's form asked for "303" on a number pad with six characters. Bella
  // Vigna's rooms are words, and "Terrazza" has eight.
  const { ROOM_INPUT, ROOM_IDS } = await import('../commerce/rooms.js');
  assert.equal(ROOM_INPUT.inputmode, 'text');
  assert.ok(ROOM_IDS.includes(ROOM_INPUT.placeholder), 'the example is one of our own rooms');
  assert.ok(ROOM_INPUT.maxlength >= Math.max(...ROOM_IDS.map((id) => id.length)), 'every room fits');
  for (const file of ['src/commerce/ui/product-sheet.js', 'src/commerce/ui/cart-sheet.js']) {
    assert.doesNotMatch(readFileSync(join(ROOT, file), 'utf8'), /name="room"[^>]*inputmode="numeric"/, `${file} still asks for a number`);
  }
});

test('when staff message a guest from the shared line, the first words name Bella Vigna', async () => {
  const app = await createApp({
    stripe: createMockStripe(), useDevPrices: false, seed: false, publicUrl: 'http://127.0.0.1',
    staffToken: 'tenant-staff', mode: 'development',
  });
  const order = await app.store.orders.create({
    lines: [], customer: { name: 'Ada', email: 'ada@example.invalid', phone: '+39 333 000 0000', room: 'Deluxe' },
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/staff/orders/${order.id}/contact`, {
      headers: { authorization: 'Bearer tenant-staff', 'x-staff-token': 'tenant-staff' },
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.match(body.whatsapp, /^https:\/\/wa\.me\/393330000000\?text=/);
    assert.match(decodeURIComponent(body.whatsapp.split('text=')[1]), /^Bella Vigna Firenze/);
  } finally { server.close(); }
});

test('every Staff API answer and every staff record names its house', async () => {
  // One Staff app will read several properties' APIs (docs/STAFF-UNIFICATA.md).
  // The house is stated by the server, on the response and on each record, so a
  // console never has to infer it from the address it happened to call.
  const app = await createApp({
    stripe: createMockStripe(), useDevPrices: false, seed: false, publicUrl: 'http://127.0.0.1',
    staffToken: 'tenant-staff', mode: 'development',
  });
  await ingestEvent({
    store: app.store,
    event: {
      kind: 'new', source: 'quovai', booking_reference: 'BV-STAFF-1', first_name: 'Ada', last_name: 'Prova',
      guest_email: 'ada@example.invalid', check_in: today, check_out: addDays(today, 2), rooms: ['Deluxe'], room: 'Deluxe',
      message_id: '<bv-staff-1@test>',
    },
  });
  await app.store.orders.create({ lines: [], customer: { name: 'Ada', email: 'ada@example.invalid', room: 'Deluxe' }, status: 'paid' });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const get = async (path) => (await fetch(`http://127.0.0.1:${server.address().port}/api/staff${path}`, {
    headers: { authorization: 'Bearer tenant-staff' },
  })).json();
  try {
    for (const path of ['/dashboard', '/orders', '/reservations', '/sync']) {
      const body = await get(path);
      assert.deepEqual(body.property, { id: 'bella-vigna', name: 'Bella Vigna', longName: 'Bella Vigna Firenze' }, path);
    }
    const { reservations } = await get('/reservations');
    assert.ok(reservations.length > 0 && reservations.every((r) => r.property === 'bella-vigna'));
    const { orders } = await get('/orders');
    assert.ok(orders.length > 0 && orders.every((o) => o.property === 'bella-vigna'));
  } finally { server.close(); }
});
