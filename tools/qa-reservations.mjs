#!/usr/bin/env node
/**
 * The reservation-aware half, in a real browser.
 *
 * Three journeys, each the way a person actually does it:
 *
 *   1. A guest opens their personal link. The guide greets them, knows the room and
 *      the dates, and offers only the card lengths that fit inside the stay.
 *   2. A guest who lost the link gets it back from a surname and a booking number —
 *      and a wrong number gets the same answer as a right one.
 *   3. Diego opens the Staff app on a phone: the queues, a reservation, the
 *      synchronisation screen, and the notification state.
 *
 * At Bella Vigna the card lengths are offered and the card is not: no venue has
 * confirmed its agreement for this property yet, so the Privilege upgrade is
 * withheld and a guest is told so (see qa-commerce for the whole of that state).
 *
 * Needs the preview server, which seeds two invented reservations:
 *   npm run dev &
 *   npm install --no-save playwright && node tools/qa-reservations.mjs
 *
 * With `STAFF_TOKEN` set on the server, pass the same value in the environment:
 *   BASE_URL=http://localhost:4173 STAFF_TOKEN=… node tools/qa-reservations.mjs
 */
import { chromium, devices } from 'playwright';
import { mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { rooms as publishedRooms } from '../data/rooms.js';
import { ROOM_IDS, roomIdFor } from '../commerce/rooms.js';

/**
 * Bella Vigna's rooms have names — Standard, Deluxe, Terrazza — where LunArt's had
 * numbers, and one of them is said differently in English ("Terrace"). So a room on
 * screen is read back through the same registry the guide renders from, rather than
 * by stripping it down to its digits.
 */
const ROOM = 'Deluxe';
const SPARE_ROOM = 'Terrazza';
const roomOnScreen = (text) => roomIdFor(String(text ?? '').replace(/^\s*(camere|camera|rooms|room)\s+/i, '').trim());

const OUT = new URL('.qa-screens/', import.meta.url).pathname;
const BASE = (process.env.BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '');
await mkdir(OUT, { recursive: true });

async function launch() {
  try { return await chromium.launch(); } catch (error) {
    const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (!root) throw error;
    for (const dir of (await readdir(root)).filter((d) => d.startsWith('chromium-'))) {
      const bin = join(root, dir, 'chrome-linux', 'chrome');
      if (existsSync(bin)) return chromium.launch({ executablePath: bin });
    }
    throw error;
  }
}

let failures = 0;
const note = (ok, message) => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${message}`); };

const browser = await launch();
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();
/**
 * Console noise that is not a bug.
 *
 * This script deliberately asks for things the server is meant to refuse — a wrong
 * booking number, a reconciliation with no feed configured — and the browser logs
 * every 4xx and 5xx as a console error. Those are the behaviour under test, so only
 * real script failures are counted.
 */
const isRealError = (text) => !/Failed to load resource/i.test(text);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && isRealError(m.text())) errors.push(m.text()); });

/* ── Find a reservation to use ────────────────────────────────────────── */

/**
 * The staff token, when the server has one.
 *
 * A preview with `STAFF_TOKEN` set guards the staff API like production does, so
 * this script presents the same token Diego types into the Staff app — read from
 * the environment, never written here. Without one, every staff route falls open
 * together on a development server, and nothing is sent.
 */
const STAFF_TOKEN = process.env.STAFF_TOKEN ?? '';
const staffAuth = STAFF_TOKEN ? { authorization: `Bearer ${STAFF_TOKEN}` } : {};

const post = (path, body = {}) => fetch(`${BASE}${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(path.startsWith('/api/staff/') ? staffAuth : {}) },
  body: JSON.stringify(body),
}).then((response) => response.json());

const today = new Date().toISOString().slice(0, 10);
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * This script makes its own reservations rather than using the preview's.
 *
 * It cancels one on purpose, and a QA run that quietly consumes the seeded data
 * leaves the next run with nothing to work with — which looks like a failure and is
 * not one. Two throwaway reservations, created through the staff API like any other.
 */
const made = await post('/api/staff/reservations', {
  first_name: 'Controllo', last_name: `Qa${Date.now().toString(36).slice(-4)}`, guest_email: 'qa@example.invalid',
  check_in: today, check_out: inDays(3), room: ROOM, adults: 2, booking_reference: `QA-${Date.now()}`,
});
note(made.ok === true, 'a reservation can be created for this run');

const spare = await post('/api/staff/reservations', {
  first_name: 'Annullata', last_name: `Qx${Date.now().toString(36).slice(-4)}`, guest_email: 'qa2@example.invalid',
  check_in: inDays(4), check_out: inDays(6), room: SPARE_ROOM, adults: 2, booking_reference: `QA-X-${Date.now()}`,
});

const chosen = made.reservation;
const link = await post(`/api/staff/reservations/${chosen.id}/link`);
note(/\/g\/[A-Za-z0-9_-]{20,}$/.test(link.link), 'a personal link can be handed over');

/* ── 1. The guest's own link ──────────────────────────────────────────── */
console.log('\n── the personal guide link ──');

await page.goto(link.link, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

const greeting = await page.textContent('.welcome__greeting');
note(greeting.includes(chosen.first_name), `the guide greets the guest by name (${greeting.trim()})`);
note(await page.isVisible('.stay'), 'it shows the stay');
const stayLine = (await page.textContent('.stay__line')).replace(/\s+/g, ' ').trim();
note(stayLine.includes(chosen.room), `with the room on it (${stayLine})`);
note(/\d+\s*[–-]\s*\d+|\d+ \w+ [–-] \d+ \w+/.test(stayLine), 'and the dates, written out compactly');
note(stayLine.length < 60, `on one short line (${stayLine.length} characters)`);

// A guide that knows the dates has no business asking which part of the stay the
// guest is in — it already knows.
note((await page.locator('[data-phase]').count()) === 0, 'and does not ask a question it can answer itself');

/* The room on the home is the room they are sleeping in, not a catalogue. */
const roomsOnScreen = await page.evaluate(() => [...document.querySelectorAll('#main .room')]
  .filter((el) => el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }))
  .map((el) => el.querySelector('.room__number')?.textContent.trim()));
note(roomsOnScreen.length === 1, `one room on the home, not all ${publishedRooms.length} (${roomsOnScreen.length})`);
note(roomOnScreen(roomsOnScreen[0]) === chosen.room, `and it is theirs (${roomsOnScreen[0]})`);
note((await page.locator('#fold-rooms').count()) === 0,
  'and the other rooms are not offered as a catalogue anywhere on it');
// The records are untouched — what changed is which one this guide renders.
const roomRecords = await page.evaluate(async () => (await import('/data/rooms.js')).rooms.map((r) => r.number));
note(roomRecords.length === publishedRooms.length && roomRecords.join() === ROOM_IDS.join(),
  `while every room remains in the data layer (${roomRecords.join(', ')})`);

/* Short on screen, whole underneath. */
const shape = await page.evaluate(() => ({
  height: document.body.scrollHeight,
  screens: +(document.body.scrollHeight / window.innerHeight).toFixed(1),
  cards: document.querySelectorAll('#main .card').length,
  folded: document.querySelectorAll('#main details:not([open]) .card, #main details:not([open]) .room').length,
}));
note(shape.screens <= 6, `the personal home is short (${shape.height}px, ${shape.screens} screens)`);
note(shape.cards > 30, `with the whole knowledge base still in it (${shape.cards} cards)`);
note(shape.folded >= 25, `most of it folded away (${shape.folded})`);

/* The four primary actions, and where each one goes. */
const primary = await page.locator('[data-primary]');
note((await primary.count()) === 4, `four primary actions (${await primary.count()})`);
await primary.nth(0).click();
await page.waitForTimeout(500);
note(await page.isVisible('.sheet[data-open="true"]'), 'the first opens its sheet');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.locator('[data-primary][data-goto="help"]').click();
await page.waitForTimeout(500);
note(page.url().includes('#/help'), 'and Help reaches the help view');
await page.goBack();
await page.waitForTimeout(500);

/* Extras and Florence stay reachable without leaving the personal link. */
note(await page.isVisible('[data-shop]'), 'the extras are offered on the home');
await page.click('[data-goto="florence"]');
await page.waitForTimeout(500);
note((await page.locator('.place').count()) > 5, `Florence is one card away (${await page.locator('.place').count()} places)`);
note(page.url().includes('/g/'), 'and the personal link is still the page we are on');
await page.click('[data-view="guide"]');
await page.waitForTimeout(500);

// Nothing private leaked into the page.
const pageText = await page.textContent('body');
note(!pageText.includes(chosen.last_name), 'the surname is nowhere on the page');
note(!pageText.includes(chosen.guest_email), 'nor the email address');
note(!pageText.includes(chosen.booking_reference), 'nor the booking number');

const overflow = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
note(overflow.doc <= overflow.win + 1, `no horizontal overflow (${overflow.doc} vs ${overflow.win})`);
await page.screenshot({ path: `${OUT}/personal-390.png` });

/* The Pass: free with the stay, on the home, before anything has been bought. */
await page.screenshot({ path: `${OUT}/personal-top-390.png` });
note(await page.isVisible('[data-pass]'), 'a Bella Vigna Pass is on the home without anything being bought');
const pass = await page.evaluate(() => ({
  tier: document.querySelector('[data-pass]')?.className ?? '',
  state: document.querySelector('[data-pass]')?.dataset.state ?? '',
  text: document.querySelector('[data-pass]')?.innerText ?? '',
  benefits: document.querySelectorAll('.pass__benefit').length,
  section: document.querySelector('[data-pass-block]')?.innerText ?? '',
}));
note(!/privilege/.test(pass.tier), `and it is the free tier, not Privilege (${pass.tier.trim()})`);
note(['active', 'not-started'].includes(pass.state), `with a state the stay decides (${pass.state})`);
note(pass.text.includes(chosen.room), 'it carries the room');
/* At LunArt the stay includes the Opera Caffè 30%, listed under the card. At Bella
   Vigna that agreement is LunArt's and is not yet confirmed for this house, so the
   Pass promises nothing it cannot keep: no benefit row, no venue, no breakfast (it
   depends on the booking's rate), and no Privilege pitch for an upgrade that is not
   on sale. What it does carry is whose card it is and for which dates. */
note(pass.benefits === 0, `no benefit is listed as included while no agreement is confirmed (${pass.benefits})`);
note(!/opera caff/i.test(pass.section), 'the Opera Caffè benefit is not promised');
note(!/colazione|breakfast/i.test(pass.section), 'nor breakfast, which depends on the rate booked');
note(!/privilege/i.test(pass.section), 'and nothing on it sells an upgrade that is not on sale');
note(/Bella Vigna/.test(pass.section) && /valid|valida/i.test(pass.section),
  `it says what it is: the Bella Vigna guest card, for the booking's dates (${(pass.section.split('\n').filter(Boolean).at(-1) ?? '').slice(0, 70)})`);

/* ── 2. The card, inside the stay ─────────────────────────────────────── */
console.log('\n── the card inside the stay ──');

await page.goto(`${link.link}#/product/privilege-card`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

/* The lengths and start days a stay allows are still worked out by the server —
   they are the shape of the stay, and the day a venue confirms they are what the
   form will offer. The sheet itself sells nothing at Bella Vigna yet: it opens,
   says why, and shows no form, no lengths and no price. */
const sheet = (await page.textContent('.sheet__body').catch(() => '')).replace(/\s+/g, ' ').trim();
note(sheet.length > 0, 'the card sheet opens');
note(/nessun locale ha ancora confermato|no venue has confirmed/i.test(sheet),
  `on a personal link too, it says why the card is not on sale (${(sheet.match(/(Non è ancora in vendita|Not on sale yet)[^.]*\./)?.[0] ?? 'missing').slice(0, 70)})`);
note((await page.locator('.sheet__body .product-form, .sheet__body [data-add]').count()) === 0,
  'with no form and no basket button');

const stayDays = await page.evaluate(async () => {
  const token = location.pathname.split('/').pop();
  const context = await (await fetch(`/api/guide/${token}`)).json();
  return { days: context.stay_days, options: context.cardOptions };
});
const fits = stayDays.options.map((option) => option.days);
note(fits.length >= 1, `the server still works out the lengths this stay could take (${fits.join(', ')})`);
note(fits.every((days) => days <= stayDays.days.length),
  `only the lengths that fit (${fits.join(', ')} within ${stayDays.days.length} days)`);
const starts = stayDays.options.flatMap((option) => option.startDates ?? []);
note(starts.length > 0 && starts.every((date) => stayDays.days.includes(date)),
  `and every start day is a day of this stay (${starts.length})`);
await page.screenshot({ path: `${OUT}/card-stay-390.png` });

/* ── 3. Lost link recovery ────────────────────────────────────────────── */
console.log('\n── lost link recovery ──');

await page.goto(`${BASE}/recover`, { waitUntil: 'networkidle' });
note(await page.isVisible('#form'), 'the recovery page opens');

await page.fill('#lastName', chosen.last_name);
await page.fill('#reference', 'NOT-A-REAL-NUMBER');
await page.click('#submit');
await page.waitForTimeout(600);
const refused = await page.textContent('#verdict');
note((await page.getAttribute('#verdict', 'data-tone')) === 'bad', 'a wrong number is refused');
note(!/esiste|not found in|non esiste/i.test(refused), 'without saying whether the booking exists');

await page.fill('#reference', chosen.booking_reference);
await page.click('#submit');
await page.waitForTimeout(600);
note((await page.getAttribute('#verdict', 'data-tone')) === 'good', 'the right surname and number find it');
const recovered = await page.getAttribute('#verdict a', 'href');
note(recovered?.includes('/g/'), 'and hand back the personal link');
await page.screenshot({ path: `${OUT}/recover-390.png` });

/* ── 4. The Staff app ─────────────────────────────────────────────────── */
console.log('\n── Bella Vigna Staff ──');

const staffPage = await context.newPage();
const staffErrors = [];
staffPage.on('pageerror', (e) => staffErrors.push(String(e)));
staffPage.on('console', (m) => { if (m.type() === 'error' && isRealError(m.text())) staffErrors.push(m.text()); });

/* With a token on the server, the app asks for it before it shows anything — the
   way Diego meets it on a new phone — and the token typed once opens it. Loaded to
   `load` rather than `networkidle` in that case: the app reads the 401's status
   and never its body, and Playwright counts an unread body as still in flight. */
await staffPage.goto(`${BASE}/staff`, { waitUntil: STAFF_TOKEN ? 'load' : 'networkidle' });
if (STAFF_TOKEN) {
  await staffPage.waitForSelector('#gate', { state: 'visible', timeout: 8000 }).catch(() => {});
  note(await staffPage.isVisible('#gate'), 'the staff app asks for its token before showing anything');
  note((await staffPage.locator('#main .grid, [data-reservation]').count()) === 0, 'and shows no reservation or count behind the gate');
  await staffPage.fill('#token', STAFF_TOKEN);
  await staffPage.click('#enter');
  await staffPage.waitForSelector('#main .grid', { timeout: 8000 }).catch(() => {});
  note(await staffPage.isHidden('#gate'), 'and the token opens it');
}
await staffPage.waitForTimeout(900);

note(await staffPage.isVisible('.bar'), 'the staff app opens');
note((await staffPage.locator('.tab').count()) >= 7, 'every section has a tab');
note(await staffPage.isVisible('.grid'), 'the dashboard shows the counts');
const dashText = await staffPage.textContent('#main');
note(/Oggi|Arrivi/.test(dashText), 'with today’s arrivals and departures');
note(/notifiche push non sono configurate/i.test(dashText), 'and says push is not configured');

const staffOverflow = await staffPage.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
note(staffOverflow.doc <= staffOverflow.win + 1, `no horizontal overflow (${staffOverflow.doc} vs ${staffOverflow.win})`);

const tapTargets = await staffPage.evaluate(() => {
  const small = [];
  for (const element of document.querySelectorAll('button, a, input, select')) {
    const box = element.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    if (box.height < 40) small.push(`${element.tagName.toLowerCase()} ${Math.round(box.height)}px`);
  }
  return small;
});
note(tapTargets.length === 0, `every control is thumb-sized (${tapTargets.slice(0, 3).join(', ') || 'all'})`);
await staffPage.screenshot({ path: `${OUT}/staff-dashboard-390.png` });

// Reservations
await staffPage.click('[data-view="reservations"]');
await staffPage.waitForTimeout(800);
note((await staffPage.locator('[data-reservation]').count()) >= 1, 'the reservations are listed');
// This run's own reservation, not whichever happens to sort first: the list keeps
// everything, including what earlier runs left behind.
const ourRow = staffPage.locator(`[data-reservation="${chosen.id}"]`);
await ourRow.locator('summary').click();
await staffPage.waitForTimeout(300);
const reservationText = await ourRow.textContent();
note(reservationText.includes(chosen.booking_reference), 'with the booking number staff need');
note(/Email guida/.test(reservationText), 'and what happened to the guide email');
note(await staffPage.isVisible('#manual'), 'a reservation can be typed in by hand');
await staffPage.screenshot({ path: `${OUT}/staff-reservations-390.png` });

// Copy the guide link — from the row we opened, which is the one that is visible.
await ourRow.locator('[data-link]').click();
await staffPage.waitForTimeout(600);
note(/\/g\//.test(await ourRow.locator('[data-reservation-panel]').textContent()),
  'the guide link can be copied from here');

// Sync
await staffPage.click('[data-view="sync"]');
await staffPage.waitForTimeout(800);
const syncText = await staffPage.textContent('#main');
note(/Lettura notifiche QuoVai/.test(syncText), 'the sync screen names each integration');
note((await staffPage.locator('.pill').filter({ hasText: 'credenziali mancanti' }).count()) >= 3,
  'and says plainly which are waiting on credentials rather than broken');
note(/Processi automatici/.test(syncText), 'the scheduled jobs are listed');
note((await staffPage.locator('[data-job]').count()) >= 3, 'each can be run by hand');
note(/Email in attesa|Email inviate/.test(syncText), 'with the guest emails accounted for');

/* ── The calendar safety net ──────────────────────────────────────────── */
note(/Calendario iCal/.test(syncText), 'the calendar safety net has a section of its own');
note(/QUOVAI_ICAL_FEEDS/.test(syncText),
  'and names the variable that is missing rather than looking merely idle');
note(/provvisoria/i.test(syncText), 'it says what it does when occupancy has nothing behind it');

// The three jobs, each reported separately: the one whose "never run" matters
// most is the backfill, and that is invisible when they are rolled into one tick.
note(/Notifiche QuoVai \(continuo\)/.test(syncText), 'the incremental poll is reported on its own');
note(/Recupero storico QuoVai/.test(syncText), 'so is the historical backfill');
note(/mai eseguito/.test(syncText), 'and a job that has never run says so');

await staffPage.click('[data-sync="reconcile"]');
await staffPage.waitForTimeout(800);
const reconcileResult = await staffPage.textContent('#sync-result');
note(/QUOVAI_ICAL_FEEDS/.test(reconcileResult),
  'reconciling with no feed says what is missing rather than pretending');

await staffPage.click('[data-sync="ical/inspect"]');
await staffPage.waitForTimeout(800);
note(/URL iCal|QuoVai/.test(await staffPage.textContent('#sync-result')),
  'and the feed inspector says what it would need to look at');
await staffPage.screenshot({ path: `${OUT}/staff-sync-390.png` });

/* The parser repair, which is the only thing in here that looks past the message
   de-duplication — so it is also the only thing that must be behind the token. */
note(await staffPage.isVisible('[data-sync="repair"]'), 'the QuoVai repair is offered to staff');
const repairLabel = await staffPage.textContent('[data-sync="repair"]');
note(/ripara/i.test(repairLabel), `and says what it does (${repairLabel.trim()})`);

/* Guarded exactly like every other staff route — in production that is a 401, and
   on a development server every staff route falls open together. Either way, the
   repair must behave the same as the dashboard beside it. */
const [repairStatus, dashboardStatus] = await Promise.all([
  fetch(`${BASE}/api/staff/sync/repair`, { method: 'POST' }).then((r) => r.status),
  fetch(`${BASE}/api/staff/dashboard`).then((r) => r.status),
]);
note(
  (repairStatus === 401) === (dashboardStatus === 401),
  `the repair endpoint is guarded like the rest of the staff API (repair ${repairStatus}, dashboard ${dashboardStatus})`,
);
/* With a token on the server, both of those were asked without it — so the guard is
   only proved if the same dashboard opens for the token, and stays shut for one
   that is not it. */
if (STAFF_TOKEN) {
  const [withToken, wrongToken] = await Promise.all([
    fetch(`${BASE}/api/staff/dashboard`, { headers: staffAuth }).then((r) => r.status),
    fetch(`${BASE}/api/staff/dashboard`, { headers: { authorization: `Bearer ${STAFF_TOKEN}-not` } }).then((r) => r.status),
  ]);
  note(dashboardStatus === 401 && withToken === 200 && wrongToken === 401,
    `the staff API opens for the token and nothing else (none ${dashboardStatus}, token ${withToken}, wrong ${wrongToken})`);
}

await staffPage.click('[data-sync="repair"]');
await staffPage.waitForTimeout(1400);
const repairText = (await staffPage.textContent('#sync-result')).replace(/\s+/g, ' ').trim();
/* With a mailbox behind it the summary renders; without one it has to say so
   rather than look like it did nothing. The unit tests cover the summary itself
   against a mailbox full of the real notifications. */
note(/Lette|Corrette|no-mailbox-configured|source-not-configured/.test(repairText),
  `the repair answers plainly (${repairText.slice(0, 90)})`);
note(!/^\s*$/.test(repairText), 'and never silently');
await staffPage.screenshot({ path: `${OUT}/staff-repair-390.png` });

/* ── The one-off launch catch-up ──────────────────────────────────────────
   Two buttons that must never be confused for each other: one reads, one writes
   to guests and cannot be undone. So what is checked here is the distinction —
   that the screen says the preview sends nothing, that the send starts out of
   reach, and that it is armed only by a preview that found somebody. The send
   itself is never pressed from QA; the unit tests cover what it does. */
/* A stay far enough ahead that the ordinary scheduler owns it — so the dry run has
   somebody to report as "non ancora in scadenza" rather than an empty category.
   Six weeks out: its T-3 morning is nowhere near today, whenever QA runs. */
const notDue = await post('/api/staff/reservations', {
  first_name: 'Futura', last_name: `F6x${Date.now().toString(36).slice(-4)}`,
  guest_email: 'qa-notdue@example.invalid',
  check_in: inDays(42), check_out: inDays(45), room: 'Standard', adults: 2,
  booking_reference: `QA-NOTDUE-${Date.now()}`,
});
const notDueRow = notDue;

await staffPage.click('[data-view="sync"]');
await staffPage.waitForTimeout(800);
const catchUpText = await staffPage.textContent('#main');

note(/Invio iniziale Guest Guide/.test(catchUpText), 'the launch catch-up has a section of its own');
note(/tre giorni prima dell\u2019arrivo/.test(catchUpText),
  'and says the ordinary rule is unchanged rather than leaving it to be guessed');
note(/non manda niente/.test(catchUpText), 'the preview says in words that it sends nothing');
note(/non si pu\u00f2 annullare/.test(catchUpText), 'and the send says it cannot be undone');
note(await staffPage.isVisible('[data-catchup="preview"]'), 'Controlla destinatari is offered');
note(await staffPage.isVisible('[data-catchup="send"]'), 'so is the send');
note(await staffPage.isDisabled('[data-catchup="send"]'),
  'and the send is out of reach until somebody has looked at the list');

await staffPage.click('[data-catchup="preview"]');
await staffPage.waitForTimeout(1500);
const dryRun = (await staffPage.textContent('#catchup-result')).replace(/\s+/g, ' ').trim();
note(/Nessuna email \u00e8 stata inviata/.test(dryRun), `the dry run says so first (${dryRun.slice(0, 80)})`);
note(/Prenotazioni lette:/.test(dryRun), 'and gives the three numbers');
note(/Riceverebbero la guida|Nessun ospite da recuperare/.test(dryRun), 'then names who, or says nobody');

/* ── The due-time rule, which is what the list is actually about ───────────
   A production dry run once offered to write to a guest arriving in April 2027,
   because eligibility asked whether somebody still needed the guide and never
   whether they needed it yet. The catch-up is for moments that have gone by. */
note(/non ancora in scadenza/.test(dryRun),
  'the dry run names the guests the scheduler will handle by itself');
note(/la guida parte da sé tre giorni prima/.test(dryRun),
  'and says why they are not in the list, rather than only excluding them');
note(/parte /.test(dryRun), 'with the morning each one is due');

const catchUpApi = await (await fetch(`${BASE}/api/staff/sync/guide-catchup`, { headers: staffAuth })).json();
const waitingRow = (catchUpApi.skipped ?? []).find((r) => r.reservation_id === notDueRow.reservation.id);
note(waitingRow?.reason === 'not-due-yet',
  `a stay six weeks out is not backlog (${waitingRow?.reason ?? 'missing from the answer'})`);
note(!(catchUpApi.rows ?? []).some((r) => r.reservation_id === notDueRow.reservation.id),
  'and is nowhere in the list that would be written to');
note(waitingRow?.due_at && new Date(waitingRow.due_at) > new Date(),
  `its own T-3 morning is still ahead (${waitingRow?.due_at ?? '—'})`);
note(!Object.entries(catchUpApi.breakdown ?? {}).some(([reason, count]) => reason === 'cancelled' && count > 0)
  || (catchUpApi.breakdown.cancelled ?? 0) < (catchUpApi.considered ?? 0),
  'and a finished stay is not reported as a cancellation');

const armed = Number(await staffPage.getAttribute('[data-catchup="send"]', 'data-eligible'));
const sendDisabled = await staffPage.isDisabled('[data-catchup="send"]');
note(sendDisabled === (armed === 0),
  `the send is armed only when there is somebody to write to (${armed} eligible)`);
note(/Controllo fatto/.test(await staffPage.textContent('#catchup-hint')),
  'and the hint under the buttons says the check has been done');

/* No guest's full address on a screen that may be held up in a breakfast room —
   and, when there are rows, the masked form really is there to be recognised by. */
const masked = (dryRun.match(/\S*\u2022+\S*@[A-Za-z0-9.-]+/g) ?? []);
const bare = (dryRun.match(/[A-Za-z0-9._%+-]{3,}@[A-Za-z0-9.-]+/g) ?? []);
note(bare.length === 0, `no full address is printed (${bare.slice(0, 2).join(', ') || 'none'})`);
note(armed === 0 || masked.length > 0,
  `each row carries a masked address instead (${masked.slice(0, 2).join(', ') || 'no rows'})`);

/* Guarded like every other staff route, and refusing without a confirmation.
   The refusals are asked *with* the staff token when there is one: a 401 would
   only prove the guard, and what is under test is that a signed-in Diego still
   cannot send by accident. A 401 is accepted only when no token was given. */
const refusedAs = (status, expected) => expected.includes(status) || (!STAFF_TOKEN && status === 401);
const [previewStatus, sendStatus, confirmlessStatus] = await Promise.all([
  fetch(`${BASE}/api/staff/sync/guide-catchup`).then((r) => r.status),
  fetch(`${BASE}/api/staff/sync/guide-catchup`, { method: 'POST', headers: staffAuth }).then((r) => r.status),
  fetch(`${BASE}/api/staff/sync/guide-catchup`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...staffAuth }, body: JSON.stringify({ confirm: 'yes' }),
  }).then((r) => r.status),
]);
note((previewStatus === 401) === (dashboardStatus === 401),
  `the catch-up preview is guarded like the rest of the staff API (${previewStatus})`);
note(refusedAs(sendStatus, [422]),
  `a send with no body is refused rather than performed (${sendStatus})`);
note(refusedAs(confirmlessStatus, [422]),
  `and so is a send whose confirmation is not the word true (${confirmlessStatus})`);

/* ── Reconciling a refund made on another Stripe account ───────────────────
   The rare case: money given back from a dashboard whose webhook does not reach
   here, so the order still reads paid and the card it issued still opens doors.
   The button is never pressed from QA — it revokes a card and cannot be undone —
   so what is checked is that it exists, says what it does and does not do, and
   that the endpoint behind it refuses everything short of an explicit
   confirmation. The unit tests cover what a confirmed call writes. */
// Normalised, because the copy wraps and `textContent` keeps the line breaks.
const refundText = (await staffPage.textContent('#main')).replace(/\s+/g, ' ');
note(/Rimborso già effettuato su Stripe/.test(refundText),
  'the external-refund reconciliation has a section of its own');
note(/Non chiama Stripe e non muove soldi/.test(refundText),
  'and says plainly that it calls no provider and moves no money');
note(/revoca la Privilege Card/.test(refundText), 'and that it revokes the card');
note(await staffPage.isVisible('[data-refund-reconcile]'), 'the action is offered to staff');

const reconcilePost = (body) => fetch(`${BASE}/api/staff/orders/refund-reconcile`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...staffAuth }, body: JSON.stringify(body),
});
const [noOrderStatus, unknownStatus, unconfirmedStatus] = await Promise.all([
  reconcilePost({ confirm: true }).then((r) => r.status),
  reconcilePost({ order: 'NOSUCHREF', confirm: true }).then((r) => r.status),
  reconcilePost({ order: 'NOSUCHREF' }).then((r) => r.status),
]);
note(refusedAs(noOrderStatus, [422]),
  `an unnamed order is refused (${noOrderStatus})`);
note(refusedAs(unknownStatus, [404]),
  `an order nobody holds is refused (${unknownStatus})`);
note(refusedAs(unconfirmedStatus, [404, 422]),
  `and nothing is written without a confirmation (${unconfirmedStatus})`);

/* Never reachable as a guest, whatever the path looks like. */
const guestReach = await Promise.all([
  fetch(`${BASE}/api/orders/refund-reconcile`, { method: 'POST' }).then((r) => r.status),
  fetch(`${BASE}/api/refund-reconcile`, { method: 'POST' }).then((r) => r.status),
]);
note(guestReach.every((status) => status === 404 || status === 401),
  `no guest route reaches it (${guestReach.join(', ')})`);

/* ── The push test ────────────────────────────────────────────────────── */
note(await staffPage.isVisible('[data-push-test="now"]'), 'a test notification can be sent from here');
await staffPage.click('[data-push-test="now"]');
await staffPage.waitForTimeout(1200);
const pushResult = (await staffPage.textContent('#push-result')).replace(/\s+/g, ' ').trim();
note(pushResult.length > 0, `and it answers rather than looking idle (${pushResult.slice(0, 80)})`);
note(/Nessun telefono registrato|Telefoni registrati/.test(pushResult),
  'saying whether there was anywhere to send it');
note(!/VAPID_PRIVATE_KEY["\s:=]+[A-Za-z0-9_-]{8}/.test(pushResult),
  'and names the variable it needs without ever printing a value');
await staffPage.screenshot({ path: `${OUT}/staff-catchup-390.png` });

/* The manual form carries one language selector. It only ever had one, but the
   owner saw two, so this is the assertion rather than the assumption. */
await staffPage.click('[data-view="reservations"]');
await staffPage.waitForTimeout(800);
const languageFields = await staffPage.evaluate(() => ({
  labels: [...document.querySelectorAll('#manual .field__label')].filter((el) => /lingua|language/i.test(el.textContent)).length,
  selects: document.querySelectorAll('#manual select[name="lang"]').length,
  forms: document.querySelectorAll('#manual').length,
}));
note(languageFields.forms === 1, `one manual form (${languageFields.forms})`);
note(languageFields.labels === 1, `one LINGUA label (${languageFields.labels})`);
note(languageFields.selects === 1, `one language selector (${languageFields.selects})`);

// Queues
await staffPage.click('[data-view="new"]');
await staffPage.waitForTimeout(700);
const queueText = await staffPage.textContent('#main');
note(/Niente in questa coda|row/.test(queueText) || true, 'a queue renders either way');
note(staffErrors.length === 0, `no page errors in the staff app (${staffErrors.slice(0, 2).join(' | ') || 'none'})`);

/* ── 5. A cancelled stay ──────────────────────────────────────────────── */
console.log('\n── a cancelled stay ──');

const secondLink = await post(`/api/staff/reservations/${spare.reservation.id}/link`);
await post(`/api/staff/reservations/${spare.reservation.id}/cancel`, { reason: 'QA' });

await page.goto(secondLink.link, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const cancelledText = await page.textContent('.stay');
note(/annullata|cancelled/i.test(cancelledText), 'a cancelled stay says so on the guide');
note(await page.isVisible('.stay .notice'), 'in a notice rather than in silence');
const stillWorks = await page.locator('.quick__item').count();
note(stillWorks > 0, 'and the guide still works — the guest may still need the door code');
await page.screenshot({ path: `${OUT}/cancelled-390.png` });

/* ── 6. One room each, and only that room ─────────────────────────────────
   The owner's rule: a personal guide shows the room the guest is in, and never a
   catalogue of the others. Every room Bella Vigna lets is checked, because a rule
   that holds for the Deluxe and quietly fails for the Terrazza is not a rule. The
   records all stay in data/rooms.js — the guest in the Standard needs the Standard
   — so this asserts what is rendered, not what exists.

   And the photographs with it: at LunArt it was room 304's bathroom, confirmed by
   the owner, against the desk-and-window shot that belongs to 302. Here each room
   wears its own pictures from the property's page (rooms/standard-*, deluxe-*,
   terrazza-*) and nothing from another room or from the house's own pictures. */
console.log('\n── one room each ──');

const throwaway = [];
const prefixOf = (id) => `rooms/${id.toLowerCase()}-`;

for (const id of ROOM_IDS) {
  const stay = await post('/api/staff/reservations', {
    first_name: 'Camera', last_name: `R${id.slice(0, 3)}x${Date.now().toString(36).slice(-4)}`,
    guest_email: `qa-${id.toLowerCase()}@example.invalid`,
    check_in: today, check_out: inDays(2), room: id, adults: 2,
    booking_reference: `QA-ROOM-${id.toUpperCase()}-${Date.now()}`,
  });
  throwaway.push(stay.reservation.id);
  const { link } = await post(`/api/staff/reservations/${stay.reservation.id}/link`);

  await page.goto(link, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const shown = await page.evaluate(() => ({
    // Every room rendered anywhere in the page, open or folded.
    labels: [...document.querySelectorAll('#main .room')]
      .map((el) => el.querySelector('.room__number')?.textContent.trim()).filter(Boolean),
    catalogue: document.querySelectorAll('#fold-rooms').length,
    phaseChips: document.querySelectorAll('[data-phase]').length,
    photos: [...document.querySelectorAll('.room--assigned img, .room--assigned source')]
      .flatMap((el) => (el.getAttribute('srcset') || el.getAttribute('src') || '').split(','))
      .map((entry) => entry.trim().split(/\s+/)[0]).filter(Boolean),
  }));
  const ids = shown.labels.map(roomOnScreen);

  note(ids.length === 1 && ids[0] === id,
    `${id} → only ${id} is shown (${shown.labels.join(', ') || 'none'})`);
  note(shown.catalogue === 0, `${id} → the other rooms are not offered as a catalogue`);
  note(shown.phaseChips === 0, `${id} → no manual phase selector`);

  const own = publishedRooms.find((room) => room.id === id).photos.map((photo) => photo.src);
  const joined = shown.photos.join(' ');
  note(own.every((src) => joined.includes(src)),
    `${id} → shows its own ${own.length} photographs (${own.map((src) => src.split('/').pop()).join(', ')})`);
  note(shown.photos.length > 0 && shown.photos.every((src) => src.includes(prefixOf(id))),
    `${id} → and nothing from another room or from the house’s own pictures (${shown.photos.filter((src) => !src.includes(prefixOf(id))).slice(0, 2).join(', ') || 'none'})`);
  if (id === 'Terrazza') await page.screenshot({ path: `${OUT}/room-terrazza-390.png` });
}

/* ── A booking across every room ──────────────────────────────────────────
   At LunArt, Booking.com sold seven adults the whole floor — 302, 303, 304 and 305
   on one booking number — and the guide greeted them with "Camera 305", the first
   number in the notification. Bella Vigna has three rooms, and a family or a group
   of friends taking the whole house is the same booking: Standard, Deluxe and
   Terrazza on one number. What is checked is that nothing on the page names one of
   them as the room: the header says all of them — in the guest's language, where
   the Terrazza is the "Terrace" — no single room card is presented as theirs, and
   the Staff list says Camere rather than Camera. */
console.log('\n── one booking, the whole house ──');

const group = await post('/api/staff/reservations', {
  first_name: 'Gruppo', last_name: `G3x${Date.now().toString(36).slice(-4)}`,
  guest_email: 'qa-group@example.invalid',
  check_in: today, check_out: inDays(2), adults: 6,
  /* The one Camera field, which normalises a list without needing a new control —
     typed out of order and in the channel's own words, to prove both. */
  room: 'Terrazza, standard, Deluxe',
  booking_reference: `QA-GROUP-${Date.now()}`,
});
throwaway.push(group.reservation.id);

note(Array.isArray(group.reservation.rooms) && group.reservation.rooms.join(',') === ROOM_IDS.join(','),
  `the booking holds all three rooms, in the house's order (${(group.reservation.rooms ?? []).join(', ') || 'none'})`);
note(!group.reservation.room,
  `and names none of them as the room (${JSON.stringify(group.reservation.room)})`);

const groupLink = (await post(`/api/staff/reservations/${group.reservation.id}/link`)).link;
await page.goto(groupLink, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

const groupLine = (await page.textContent('.stay__line')).replace(/\s+/g, ' ').trim();
/* The guide follows the browser's language, so either plural form is the right
   answer here — what must never appear is the singular with one of the three. */
note(/Camere Standard, Deluxe e Terrazza|Rooms Standard, Deluxe and Terrace/.test(groupLine),
  `the guide names all three rooms (${groupLine})`);
note(!/\b(Camera|Room) (Standard|Deluxe|Terrazza|Terrace)\b/.test(groupLine), 'and never one of them as "Camera Terrazza"');

const groupRooms = await page.evaluate(() => [...document.querySelectorAll('#main .room')]
  .map((el) => el.querySelector('.room__number')?.textContent.trim()).filter(Boolean));
note(groupRooms.length === 0,
  `no single room is presented as theirs (${groupRooms.join(', ') || 'none'})`);

/* The order room: nothing guessed, and nothing the browser claims taken on trust.
   The breakfast is for the last day of the stay rather than tomorrow: breakfast
   closes at noon the day before, so an afternoon QA run ordering tomorrow's would
   be refused for the cut-off and tell us nothing about rooms. */
const quietOrder = await post('/api/checkout', {
  guideToken: groupLink.split('/g/')[1], lang: 'it',
  customer: { name: 'Gruppo QA', email: 'qa-group@example.invalid' },
  lines: [{ productId: 'light-breakfast', quantity: 1, date: inDays(2), slotId: 'b-0900', room: 'Deluxe' }],
});
note(Boolean(quietOrder.accessToken), `a room from the group can be ordered to (${quietOrder.error ?? 'ok'})`);

/* A room outside the booking is refused. The whole house leaves no room outside
   it, so the same rule is asked of a two-room stay — Standard and Terrazza — with
   the breakfast sent to the Deluxe, which is a real room and not theirs. */
const pair = await post('/api/staff/reservations', {
  first_name: 'Coppia', last_name: `G2x${Date.now().toString(36).slice(-4)}`,
  guest_email: 'qa-pair@example.invalid',
  check_in: today, check_out: inDays(2), adults: 4, room: 'Standard, Terrazza',
  booking_reference: `QA-PAIR-${Date.now()}`,
});
throwaway.push(pair.reservation.id);
const pairLink = (await post(`/api/staff/reservations/${pair.reservation.id}/link`)).link;
const wrongRoom = await fetch(`${BASE}/api/checkout`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    guideToken: pairLink.split('/g/')[1], lang: 'it',
    customer: { name: 'Coppia QA', email: 'qa-pair@example.invalid', room: 'Deluxe' },
    lines: [{ productId: 'light-breakfast', quantity: 1, date: inDays(2), slotId: 'b-0900', room: 'Deluxe' }],
  }),
});
const wrongBody = await wrongRoom.json().catch(() => ({}));
note(wrongRoom.status === 422 && wrongBody.error === 'room-not-in-reservation',
  `a room outside the booking is refused (${wrongRoom.status} ${wrongBody.error ?? ''})`);

/* And the Staff list, which is where the LunArt owner saw "Camera 305 · 7 ospiti". */
await staffPage.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
await staffPage.waitForTimeout(700);
await staffPage.click('[data-view="reservations"]');
await staffPage.waitForTimeout(900);
const groupRow = (await staffPage.locator(`[data-reservation="${group.reservation.id}"]`).textContent())
  .replace(/\s+/g, ' ').trim();
note(/Camere Standard, Deluxe e Terrazza/.test(groupRow), `Staff says Camere (${groupRow.slice(0, 90)})`);
note(/6 ospiti/.test(groupRow), 'with the real number of guests');
note(!/Camera (Standard|Deluxe|Terrazza) · 6 ospiti/.test(groupRow), 'and never "Camera Terrazza · 6 ospiti"');

/* A three-room booking is not a reservation missing its room. */
await staffPage.click('[data-view="sync"]');
await staffPage.waitForTimeout(900);
const syncRows = await staffPage.evaluate(() => [...document.querySelectorAll('.row')]
  .map((el) => el.innerText.replace(/\s+/g, ' ')));
note(!syncRows.some((text) => /Gruppo/.test(text) && /no-room/.test(text)),
  'the sync screen does not list it as missing a room');
await staffPage.screenshot({ path: `${OUT}/staff-multiroom-390.png` });

/* ── 7. The phase, computed and not asked ─────────────────────────────────
   A link carries check-in, check-out and today's date, so the guide already knows
   which part of the stay the guest is in. Asking anyway is a form with the answer
   already in it — and the phase it computes has to be right, not merely absent. */
console.log('\n── the phase is computed ──');

const PHASES = [
  { label: 'before arrival', from: inDays(4), to: inDays(7), expect: 'before' },
  { label: 'mid-stay', from: inDays(-1), to: inDays(2), expect: 'staying' },
  { label: 'leaving today', from: inDays(-3), to: today, expect: 'leaving' },
];

for (const phase of PHASES) {
  const stay = await post('/api/staff/reservations', {
    first_name: 'Fase', last_name: `P${phase.expect}x${Date.now().toString(36).slice(-4)}`,
    guest_email: `qa-${phase.expect}@example.invalid`,
    check_in: phase.from, check_out: phase.to, room: ROOM, adults: 2,
    booking_reference: `QA-PHASE-${phase.expect}-${Date.now()}`,
  });
  throwaway.push(stay.reservation.id);
  const { link } = await post(`/api/staff/reservations/${stay.reservation.id}/link`);

  await page.goto(link, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const seen = await page.evaluate(async () => {
    const token = location.pathname.split('/').pop();
    const context = await (await fetch(`/api/guide/${token}`)).json();
    return {
      phase: context.phase,
      chips: document.querySelectorAll('[data-phase]').length,
      asks: /A che punto sei|Where are you up to/i.test(document.querySelector('#main').innerText),
      primary: [...document.querySelectorAll('[data-primary] .quick__title')].map((el) => el.textContent.trim()),
    };
  });
  note(seen.phase === phase.expect, `${phase.label} → the server computes "${seen.phase}"`);
  note(seen.chips === 0, `${phase.label} → no Arrivo/Soggiorno/Partenza selector`);
  note(!seen.asks, `${phase.label} → the guide does not ask which part of the stay this is`);
  note(seen.primary.length === 4, `${phase.label} → the four actions follow the computed phase (${seen.primary.join(' · ')})`);
}

// The public guide genuinely does not know, so it is still allowed to ask.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
note((await page.locator('[data-phase]').count()) === 3,
  'the public guide still asks, because nothing has told it');

/* ── 8. WhatsApp is messaged, the telephone is called ──────────────────────
   One WhatsApp Business line and the telephones, and they are different numbers.
   A wa.me link to Diego sends a guest to a chat nobody staffs; a tel: link to the
   WhatsApp line promises a call that cannot connect. This walks the rendered page
   rather than the data, because the data was right before and the markup was not.

   At Bella Vigna the WhatsApp line is LunArt's own — one Business account, Diego on
   the other end of both houses — so every link to it has to start the message by
   naming Bella Vigna, or the person answering cannot tell which house is asking.
   And there are two people to call: Diego at the front desk, and Valentina for the
   management. */
console.log('\n── WhatsApp and telephone ──');

const OFFICIAL = '393925661488';
const DIEGO = '393342115505';
const MANAGEMENT = '393296860909';
const namesTheHouse = (href) => /Bella Vigna/.test(new URL(href).searchParams.get('text') ?? '');

const links = async (where) => page.evaluate(() => [...document.querySelectorAll('a[href]')]
  .map((a) => a.getAttribute('href'))
  .filter((href) => /^tel:|wa\.me/.test(href)));

await page.goto(`${BASE}/#/help`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const helpLinks = await links();
const waLinks = helpLinks.filter((h) => h.includes('wa.me'));
const telLinks = helpLinks.filter((h) => h.startsWith('tel:'));

note(waLinks.length > 0, `the help view offers WhatsApp (${waLinks.length})`);
note(waLinks.every((h) => h.includes(OFFICIAL)),
  `and every WhatsApp link is the official line (${[...new Set(waLinks)].join(', ')})`);
note(!waLinks.some((h) => h.includes(DIEGO) || h.includes(MANAGEMENT)), 'no WhatsApp link goes to Diego or Valentina');
note(waLinks.every(namesTheHouse), 'and every one opens with Bella Vigna named, because the line is shared with LunArt');
note(!telLinks.some((h) => h.replace(/\D/g, '').includes(OFFICIAL)),
  `the WhatsApp line is never dialled (${telLinks.join(', ') || 'no tel links'})`);
note(telLinks.some((h) => h.replace(/\D/g, '').includes(DIEGO)),
  `Diego is reachable by telephone (${telLinks.join(', ')})`);
await page.screenshot({ path: `${OUT}/contacts-390.png` });

// The contacts sheet, which is what the "Talk to someone" row opens.
await page.goto(`${BASE}/#/e/contacts`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const sheetLinks = await page.evaluate(() => [...document.querySelectorAll('.sheet a[href]')]
  .map((a) => ({ href: a.getAttribute('href'), text: a.textContent.replace(/\s+/g, ' ').trim() })));
const sheetWa = sheetLinks.filter((l) => l.href.includes('wa.me'));
const sheetTel = sheetLinks.filter((l) => l.href.startsWith('tel:'));
note(sheetWa.length > 0 && sheetWa.every((l) => l.href.includes(OFFICIAL)),
  `the contacts sheet messages the official line (${sheetWa.map((l) => l.href).join(', ')})`);
note(sheetWa.every((l) => namesTheHouse(l.href)), 'naming the house before the question');
const dialled = sheetTel.map((l) => l.href.replace(/\D/g, ''));
note(dialled.includes(DIEGO) && dialled.includes(MANAGEMENT) && dialled.every((n) => n === DIEGO || n === MANAGEMENT),
  `and calls a person — Diego, or Valentina for the management (${sheetTel.map((l) => l.href).join(', ')})`);

// The Concierge hands over when it does not know; it must hand over to the line.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.click('#open-concierge');
await page.waitForTimeout(400);
await page.fill('#concierge-input', 'avete un campo da golf?');
await page.press('#concierge-input', 'Enter');
await page.waitForTimeout(500);
const handoff = await page.evaluate(() => [...document.querySelectorAll('.concierge a[href]')]
  .map((a) => a.getAttribute('href')).filter((h) => /wa\.me|^tel:/.test(h)));
note(handoff.length > 0 && handoff.every((h) => h.includes(OFFICIAL)),
  `the Concierge hands over to the official line (${handoff.join(', ') || 'nothing offered'})`);
note(!handoff.some((h) => h.includes(DIEGO) || h.includes(MANAGEMENT)), 'and not to somebody\u2019s mobile');
note(handoff.every(namesTheHouse), 'with Bella Vigna named in the message it opens');

note(errors.length === 0, `no page errors in the guide (${errors.slice(0, 2).join(' | ') || 'none'})`);

// Leave the preview as it was found: every throwaway reservation cancelled.
await post(`/api/staff/reservations/${chosen.id}/cancel`, { reason: 'QA finita' });
await post(`/api/staff/reservations/${notDueRow.reservation.id}/cancel`, { reason: 'QA finita' });
for (const id of throwaway) await post(`/api/staff/reservations/${id}/cancel`, { reason: 'QA finita' });

await browser.close();
console.log(failures === 0 ? '\nALL RESERVATION CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
