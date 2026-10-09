/**
 * A booking is not always one room.
 *
 * At LunArt, Booking.com sold seven adults the whole floor: booking 5639466196,
 * Bina Kang, 25 to 27 October, four rooms. QuoVai's notification listed all four.
 * The parser kept the first room it found, the canonical reservation had one
 * `room` field to put it in, and from there everything downstream believed it —
 * the Staff app printed "Camera 305 · 7 ospiti", the guide email said Camera 305,
 * and a breakfast ordered without a room was filed against 305 as well.
 *
 * Bella Vigna has three rooms, and a party of seven takes all of them. The fixture
 * is that same booking in this house: the terrace room listed first, then
 * Standard, then Deluxe. So the bug, here, would be a group of seven told they are
 * all on the terrace.
 *
 * None of that is a display bug. A tray goes to the wrong door, and the order's
 * own record says the guest asked for it there. So what these tests pin down is
 * the shape of the truth: every room read from the table and no others, one field
 * that names a room only when there is exactly one to name, and a checkout that
 * refuses to pick on the guest's behalf.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseQuovaiEmail } from '../server/ingest/quovai-email.js';
import { repairFromMailbox } from '../server/ingest/repair.js';
import { createMemoryMailbox } from '../server/ingest/mailbox.js';
import { ingestEvent, ingestMessage } from '../server/ingest/index.js';
import { createStore } from '../server/store.js';
import { createMockStripe } from '../server/stripe.js';
import { createApp, roomForOrder } from '../server/app.js';
import {
  buildReservation, guestContext, staffView, roomPhrase, changesBetween,
  RESERVATION_STATUS,
} from '../server/reservations.js';
import { renderGuideEmail, DELIVERY_STATUS } from '../server/delivery.js';
import { passForReservation } from '../server/pass.js';
import { syncOverview } from '../server/staff.js';
import { reconcile } from '../server/ingest/ical.js';
import { previewGuideCatchUp } from '../server/catchup.js';
import { roomsOf, roomList, roomFields, isMultiRoom, ROOM_IDS } from '../commerce/rooms.js';
import { applyPriceOverrides } from '../commerce/prices.js';
import { DEV_PRICES } from '../commerce/prices.dev.js';
import { propertyDate, addDays } from '../commerce/time.js';
import { BINA, BINA_MODIFIED, IRENE, MARTIN, KELLY, FLORIAN } from './fixtures/quovai.js';
import { confirmAllAgreements, restoreAgreements } from './support/property.mjs';

const store = () => createStore();
/** Every room the house has, in registry order — not the order QuoVai listed them. */
const BINA_ROOMS = ['Standard', 'Deluxe', 'Terrazza'];
/**
 * A party in two of the three rooms, for the checks that need a real room that is
 * somebody else's. With all three booked there is no such room to name.
 */
const PAIR = ['Standard', 'Deluxe'];

/* ══ A/B. The room table, all of it and only it ═══════════════════════════ */

test('A the parser reads every room on the real group booking', () => {
  const parsed = parseQuovaiEmail(BINA);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.equal(parsed.event.booking_reference, '5639466196');
  assert.equal(parsed.event.adults, 7);
  assert.equal(parsed.event.check_in, '2026-10-25');
  assert.equal(parsed.event.check_out, '2026-10-27');

  assert.deepEqual(parsed.event.rooms, BINA_ROOMS, 'all three, in a deterministic order');
  assert.equal(parsed.event.room, '', 'and no single room, because there is not one');
  assert.ok(!parsed.warnings.includes('no-room'));
});

test('B the per-night price table adds no rooms, and a price is not a room', () => {
  const parsed = parseQuovaiEmail(BINA);

  // The fixture's price table repeats all three rooms, twice each.
  assert.equal(parsed.event.rooms.length, 3, 'no duplicates, and nothing extra');
  assert.equal(new Set(parsed.event.rooms).size, 3);

  // Amounts in the room table, LunArt's own room row, and a line that opens with
  // a room's name but is a sentence about all of them. None of it is a room here.
  const noRooms = parseQuovaiEmail({
    subject: '🔔 QuoVai — nuova prenotazione',
    from: 'QuoVai <noreply@quovai.com>',
    messageId: '<price-only@quovai.com>',
    body: [
      'Numero prenotazione: 9999999999 NEW', 'Prova Prezzo',
      'Struttura: BELLA VIGNA', 'Check-in: 25/10/2026', 'Check-out: 27/10/2026',
      'Stanza', 'Tariffa', 'Prezzo totale', 'Stato',
      '302,00', '1.304,50', '305,00',
      '305 sup',
      'Standard, Deluxe e Terrazza: colazione inclusa',
      'Deluxes',
      'new',
    ].join('\n'),
  });
  assert.equal(noRooms.ok, true);
  assert.deepEqual(noRooms.event.rooms, [], 'three amounts, a LunArt row and two sentences: no rooms');
  assert.ok(noRooms.warnings.includes('no-room'));
});

test('B a room in a guest note is still not a room', () => {
  // The note follows the room rows inside the table, and opens with a room's name
  // — the one shape in which a guest's sentence looks exactly like a row.
  const parsed = parseQuovaiEmail({
    subject: '🔔 QuoVai — nuova prenotazione',
    from: 'QuoVai <noreply@quovai.com>',
    messageId: '<note@quovai.com>',
    body: [
      'Numero prenotazione: 8888888888 NEW', 'Nota Ospite',
      'Struttura: BELLA VIGNA', 'Check-in: 25/10/2026', 'Check-out: 27/10/2026',
      'Stanza', 'Tariffa', 'Stato',
      'Camera Deluxe', 'Camera Deluxe /NR BB OTA', 'new',
      'Note',
      'Terrazza would be lovely if it is free',
    ].join('\n'),
  });
  assert.deepEqual(parsed.event.rooms, ['Deluxe'], 'the table, not the request');
  assert.match(parsed.event.notes, /^Terrazza would be lovely/, 'and the request is kept, as a note');
});

test('B the same rooms in another order are not a change', () => {
  const held = buildReservation(parseQuovaiEmail(BINA).event);
  const again = parseQuovaiEmail(BINA_MODIFIED).event;

  // The modification lists Deluxe, the terrace and Standard: a third order.
  assert.notEqual(BINA_MODIFIED.body.indexOf('Camera Deluxe'), BINA.body.indexOf('Camera Deluxe'));
  assert.deepEqual(again.rooms, held.rooms, 'normalised, so the order QuoVai sent does not matter');
  assert.deepEqual(changesBetween(held, again), {}, 'and nothing reads as modified');

  // A room genuinely dropped from the booking does read as a change, both fields.
  const fewer = changesBetween(held, { rooms: ['Standard', 'Deluxe'] });
  assert.deepEqual(fewer, { rooms: ['Standard', 'Deluxe'], room: '' });
  // And down to one room, which fills the legacy field again.
  assert.deepEqual(changesBetween(held, { rooms: ['Deluxe'] }), { rooms: ['Deluxe'], room: 'Deluxe' });
  // A notification that carried no room at all changes nothing.
  assert.deepEqual(changesBetween(held, { room: '' }), {});
});

/* ══ C. The canonical invariant ═══════════════════════════════════════════ */

test('C a multi-room reservation holds every room and names none of them as the room', async () => {
  const db = store();
  const { reservation } = await ingestMessage({ store: db, message: BINA });

  assert.deepEqual(reservation.rooms, BINA_ROOMS);
  assert.equal(reservation.room, '', 'not Terrazza, the first one listed, which is the bug this is about');
  assert.equal(reservation.guest_count, 7);
  assert.equal(isMultiRoom(reservation), true);
});

test('C a single-room reservation is exactly as it was', async () => {
  const db = store();
  const { reservation } = await ingestMessage({ store: db, message: IRENE });
  assert.equal(reservation.room, 'Standard');
  assert.deepEqual(reservation.rooms, ['Standard']);
  assert.equal(isMultiRoom(reservation), false);
});

test('C a legacy record with only a room reads as one room', () => {
  const legacy = buildReservation({ room: 'Deluxe', check_in: '2026-10-02', check_out: '2026-10-03' });
  assert.deepEqual(legacy.rooms, ['Deluxe']);
  assert.equal(legacy.room, 'Deluxe');

  // And a record from before `rooms` existed, read straight out of the store.
  const stored = { room: 'Terrazza' };
  assert.deepEqual(roomsOf(stored.rooms ?? stored.room), ['Terrazza']);
});

test('C a room nobody recognises is kept rather than discarded', () => {
  const typed = buildReservation({ room: 'Suite', check_in: '2026-10-02', check_out: '2026-10-03' });
  assert.equal(typed.room, 'Suite', 'a hand-typed value is not lost');
  assert.deepEqual(typed.rooms, []);
});

test('C the room set is unique, valid and ordered however it arrives', () => {
  // Any spelling the registry knows, in any case and order, comes back as ids.
  assert.deepEqual(
    roomsOf(['Doppia/Tripla con Terrazza', 'camera standard', 'Deluxe', 'terrace', 'Standard']),
    BINA_ROOMS,
  );
  assert.deepEqual(
    roomsOf(['305', '302 queen', 'Superior', 'Deluxes', '3050', 'nothing']),
    [],
    'only Bella Vigna rooms: LunArt’s are not rooms here, and neither is a longer word',
  );
  assert.deepEqual(roomFields(['Terrazza']), { rooms: ['Terrazza'], room: 'Terrazza' });
  assert.deepEqual(roomFields(['terrace']), { rooms: ['Terrazza'], room: 'Terrazza' }, 'an alias is stored as its id');
  assert.deepEqual(roomFields(['Terrazza', 'Standard']), { rooms: ['Standard', 'Terrazza'], room: '' });
  assert.deepEqual(ROOM_IDS, ['Standard', 'Deluxe', 'Terrazza']);
});

/* ══ D. Staff ════════════════════════════════════════════════════════════ */

test('D the staff view carries the set, and the phrase is plural', async () => {
  const db = store();
  const { reservation } = await ingestMessage({ store: db, message: BINA });
  const view = staffView(reservation);

  assert.deepEqual(view.rooms, BINA_ROOMS);
  assert.equal(view.room, '');
  assert.equal(
    roomPhrase(view, { one: 'Camera', many: 'Camere' }),
    'Camere Standard, Deluxe e Terrazza',
  );
  assert.notEqual(roomPhrase(view, { one: 'Camera', many: 'Camere' }), 'Camera Terrazza');
});

test('D a single-room staff row still reads "Camera Standard"', async () => {
  const db = store();
  const { reservation } = await ingestMessage({ store: db, message: IRENE });
  assert.equal(roomPhrase(staffView(reservation), { one: 'Camera', many: 'Camere' }), 'Camera Standard');
});

test('D the sync screen does not ask staff to go and find a room that is there', async () => {
  const db = store();
  const { reservation } = await ingestMessage({ store: db, message: BINA });
  const overview = await syncOverview({ store: db });
  const row = overview.rows.find((entry) => entry.reservation_id === reservation.id);

  assert.ok(row, 'the booking is on the sync screen');
  assert.ok(!row.problems.includes('no-room'), `three rooms is not no room: ${row.problems}`);
  assert.deepEqual(row.rooms, BINA_ROOMS);
  assert.equal(row.room, 'Standard, Deluxe e Terrazza');
});

/* ══ E. The guest, and the email ═════════════════════════════════════════ */

test('E the guest context names the rooms and claims none of them as the room', async () => {
  const db = store();
  const { reservation } = await ingestMessage({ store: db, message: BINA });
  const context = guestContext(reservation);

  assert.equal(context.room, null, 'null rather than Terrazza');
  assert.deepEqual(context.rooms, BINA_ROOMS);
  assert.equal(context.guest_count, 7);

  // And nothing in it names one room on its own.
  for (const id of BINA_ROOMS) {
    assert.ok(!JSON.stringify(context).includes(`"room":"${id}"`), id);
  }
});

test('E the guide email says Camere, in both languages', async () => {
  const db = store();
  const { reservation } = await ingestMessage({ store: db, message: BINA });

  const it = renderGuideEmail({ reservation, origin: 'https://g.example', lang: 'it' });
  assert.match(it.text, /Camere Standard, Deluxe e Terrazza/);
  assert.ok(!/Camera Terrazza/.test(it.text), 'and never the single room');
  assert.match(it.html, /Camere Standard, Deluxe e Terrazza/);

  // The terrace room has an English name of its own, and the English email uses it.
  const en = renderGuideEmail({ reservation, origin: 'https://g.example', lang: 'en' });
  assert.match(en.text, /Rooms Standard, Deluxe and Terrace/);
});

test('E a single-room email is unchanged', async () => {
  const db = store();
  const { reservation } = await ingestMessage({ store: db, message: IRENE });
  const it = renderGuideEmail({ reservation, origin: 'https://g.example', lang: 'it' });
  assert.match(it.text, /^Camera Standard$/m);
  assert.match(renderGuideEmail({ reservation, origin: 'https://g.example', lang: 'en' }).text, /^Room Standard$/m);

  // One room with a name of its own in English is still just that room.
  const { reservation: terrace } = await ingestMessage({ store: db, message: MARTIN });
  assert.match(renderGuideEmail({ reservation: terrace, origin: 'https://g.example', lang: 'it' }).text, /^Camera Terrazza$/m);
  assert.match(renderGuideEmail({ reservation: terrace, origin: 'https://g.example', lang: 'en' }).text, /^Room Terrace$/m);
});

test('E the Pass carries the set and its face names no single room', async () => {
  const db = store();
  const { reservation } = await ingestMessage({ store: db, message: BINA });
  const pass = await passForReservation({ store: db, reservation });

  assert.equal(pass.room, null, 'the artwork has a line for a number, not a list');
  assert.deepEqual(pass.rooms, BINA_ROOMS);
  // Nothing about the Pass itself moved.
  assert.equal(pass.tier, 'pass', 'still a standard Pass, not upgraded by having three rooms');
  assert.deepEqual(pass.entitlements, []);
  assert.equal(pass.reference, reservation.staff_ref);
});

test('E the catch-up preview names the rooms it would write about', async () => {
  const db = store();
  const now = new Date('2026-10-23T08:00:00Z');
  const { reservation } = await ingestMessage({ store: db, message: BINA });
  await db.reservations.update(reservation.id, { guest_email: 'bina@example.invalid' });

  const preview = await previewGuideCatchUp({ store: db, now });
  const row = preview.rows.find((entry) => entry.reservation_id === reservation.id);
  assert.ok(row, `not eligible: ${JSON.stringify(preview.breakdown)}`);
  assert.equal(row.room, 'Standard, Deluxe e Terrazza');
  assert.deepEqual(row.rooms, BINA_ROOMS);
});

/* ══ F. One room still behaves as one room ═══════════════════════════════ */

test('F every single-room notification parses exactly as before', () => {
  for (const [fixture, room] of [[MARTIN, 'Terrazza'], [KELLY, 'Deluxe'], [IRENE, 'Standard'], [FLORIAN, 'Deluxe']]) {
    const parsed = parseQuovaiEmail(fixture);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.event.room, room);
    assert.deepEqual(parsed.event.rooms, [room]);
  }
});

test('F one room reads as one room everywhere', async () => {
  const db = store();
  const { reservation } = await ingestMessage({ store: db, message: MARTIN });

  assert.equal(guestContext(reservation).room, 'Terrazza');
  assert.deepEqual(guestContext(reservation).rooms, ['Terrazza']);
  assert.equal(staffView(reservation).room, 'Terrazza');
  assert.equal((await passForReservation({ store: db, reservation })).room, 'Terrazza');
  assert.equal(roomList(['Terrazza']), 'Terrazza', 'and the list of one is just the room');
  assert.equal(roomList(['Terrazza'], 'en'), 'Terrace', 'said in the guest’s language');
});

/* ══ G/H/I. Checkout ═════════════════════════════════════════════════════ */

test('G a multi-room booking gets no automatic room, and a single-room one still does', () => {
  const many = { rooms: BINA_ROOMS, room: '' };
  const one = { rooms: ['Standard'], room: 'Standard' };

  assert.deepEqual(roomForOrder({ claimed: '', lines: [{}], reservation: many }),
    { ok: true, room: '', rooms: BINA_ROOMS });
  assert.deepEqual(roomForOrder({ claimed: '', lines: [{}], reservation: one }),
    { ok: true, room: 'Standard' });
  // No reservation at all: the guest's own answer is the only one there is.
  assert.deepEqual(roomForOrder({ claimed: 'Deluxe', lines: [], reservation: null }),
    { ok: true, room: 'Deluxe' });
});

test('H a room the guest names from their own group is accepted', () => {
  const many = { rooms: BINA_ROOMS, room: '' };
  assert.deepEqual(roomForOrder({ claimed: 'Deluxe', lines: [], reservation: many }),
    { ok: true, room: 'Deluxe', rooms: BINA_ROOMS });
  // Named on the line rather than in the customer details.
  assert.deepEqual(roomForOrder({ claimed: '', lines: [{ room: 'Terrazza' }], reservation: many }),
    { ok: true, room: 'Terrazza', rooms: BINA_ROOMS });
});

/**
 * At LunArt a room was three digits and there was one way to type it; here a
 * guest may type "deluxe", or read the English guide and type "Terrace". The
 * comparison used to be against the ids exactly as stored, which refused them as
 * if the room were somebody else's; `roomForOrder` now reads a typed room through
 * the registry, and the guest form's room field takes words (no number pad, room
 * for "Terrazza", a Bella Vigna placeholder).
 */
test('H a room the guest names in lower case, or in English, is the room it names', () => {
  const many = { rooms: BINA_ROOMS, room: '' };
  assert.deepEqual(roomForOrder({ claimed: 'deluxe', lines: [], reservation: many }),
    { ok: true, room: 'Deluxe', rooms: BINA_ROOMS });
  assert.deepEqual(roomForOrder({ claimed: '', lines: [{ room: 'Terrace' }], reservation: many }),
    { ok: true, room: 'Terrazza', rooms: BINA_ROOMS });
});

test('I a room outside the group is refused', () => {
  // Two of the three rooms, so the third is a real room and still not theirs.
  const pair = { rooms: PAIR, room: '' };
  for (const bad of [{ claimed: 'Terrazza' }, { lines: [{ room: 'Terrazza' }] }, { claimed: '305' }, { claimed: '999' }]) {
    const verdict = roomForOrder({ claimed: '', lines: [], ...bad, reservation: pair });
    assert.equal(verdict.ok, false, JSON.stringify(bad));
    assert.equal(verdict.reason, 'room-not-in-reservation');
  }
  // And with every room booked, LunArt's numbers are still nobody's room here.
  const all = roomForOrder({ claimed: '305', lines: [], reservation: { rooms: BINA_ROOMS, room: '' } });
  assert.equal(all.ok, false);
  assert.equal(all.reason, 'room-not-in-reservation');
});

test('G checkout over HTTP never files a multi-room guest against one room', async (t) => {
  applyPriceOverrides(DEV_PRICES);
  // The first line bought is a Privilege Card, which Bella Vigna does not sell yet:
  // no venue has confirmed its benefit for this property. What is under test is
  // which room an order is filed against, so the register is put as if confirmed.
  confirmAllAgreements();
  t.after(() => { applyPriceOverrides({}); restoreAgreements(); });

  const db = store();
  const day = addDays(propertyDate(), 2);
  // A party in two of the three rooms, so that the third is a real room that is
  // somebody else's.
  const { reservation } = await ingestEvent({
    store: db,
    event: {
      kind: 'new', source: 'quovai', booking_reference: '5639466196',
      first_name: 'Bina', last_name: 'Kang', guest_email: 'bina@example.invalid',
      rooms: PAIR, adults: 4, guest_count: 4,
      check_in: propertyDate(), check_out: addDays(propertyDate(), 4),
      message_id: '<bina-http@quovai>',
    },
  });
  assert.deepEqual(reservation.rooms, PAIR);
  assert.equal(reservation.room, '');

  const app = await createApp({
    store: db, stripe: createMockStripe(), allowPlaceholderPrices: true,
    cardSigningKey: 'multi-room-test-key', staffToken: '', mode: 'development',
    publicUrl: 'http://127.0.0.1',
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const checkout = async (body) => {
    const response = await fetch(`${base}/api/checkout`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };

  const CUSTOMER = { name: 'Bina Kang', email: 'bina@example.invalid' };
  const card = {
    productId: 'privilege-card', variantId: '2d', quantity: 1,
    date: day, fields: { holderName: 'Bina Kang' },
  };

  // Nothing named: nothing guessed.
  const quiet = await checkout({ guideToken: reservation.guide_token, lang: 'it', customer: CUSTOMER, lines: [card] });
  assert.ok(quiet.body.accessToken, `refused: ${JSON.stringify(quiet.body)}`);
  const quietOrder = await db.orders.findByAccessToken(quiet.body.accessToken);
  assert.equal(quietOrder.customer.room, '', 'not Standard, the first of theirs');
  assert.equal(quietOrder.reservation_id, reservation.id, 'and still filed against the stay');

  // One of theirs: taken.
  const theirs = await checkout({
    guideToken: reservation.guide_token, lang: 'it',
    customer: { ...CUSTOMER, room: 'Deluxe' },
    lines: [{ productId: 'light-breakfast', quantity: 1, date: day, slotId: 'b-0900', room: 'Deluxe' }],
  });
  assert.ok(theirs.body.accessToken, `refused: ${JSON.stringify(theirs.body)}`);
  assert.equal((await db.orders.findByAccessToken(theirs.body.accessToken)).customer.room, 'Deluxe');

  // Somebody else's: refused, before any order exists.
  const before = (await db.orders.list({})).length;
  const other = await checkout({
    guideToken: reservation.guide_token, lang: 'it',
    customer: { ...CUSTOMER, room: 'Terrazza' },
    lines: [{ productId: 'light-breakfast', quantity: 1, date: day, slotId: 'b-0900', room: 'Terrazza' }],
  });
  assert.equal(other.status, 422);
  assert.equal(other.body.error, 'room-not-in-reservation');
  assert.equal(other.body.room, 'Terrazza');
  assert.deepEqual(other.body.rooms, PAIR, 'and it says which rooms are theirs');
  assert.equal((await db.orders.list({})).length, before, 'and nothing was written');
});

/* ══ J/K. Repairing the record that is already in production ═════════════ */

test('J the repair turns the already-filed first room into all three, in place', async () => {
  const db = store();

  /**
   * The record exactly as the old parser would have left it: one room — the first
   * the table listed — and seven adults. This is the shape LunArt's production
   * held for booking 5639466196.
   */
  const filed = await db.reservations.create(buildReservation({
    source: 'quovai', booking_reference: '5639466196',
    first_name: 'Bina', last_name: 'Kang',
    check_in: '2026-10-25', check_out: '2026-10-27',
    adults: 7, guest_count: 7, room: 'Terrazza', channel: 'BOOKING.COM',
  }));
  assert.equal(filed.room, 'Terrazza');
  assert.deepEqual(filed.rooms, ['Terrazza'], 'the old shape, read forward');

  const outcome = await repairFromMailbox({
    store: db, mailbox: createMemoryMailbox([BINA]),
  });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.matched, 1);
  assert.equal(outcome.repaired, 1);
  assert.equal(outcome.unmatched, 0);
  assert.ok(outcome.changes[0].fields.includes('rooms'));
  assert.ok(outcome.changes[0].fields.includes('room'));

  const fixed = await db.reservations.get(filed.id);
  assert.deepEqual(fixed.rooms, BINA_ROOMS);
  assert.equal(fixed.room, '', 'and no misleading single room is left behind');
  assert.equal(fixed.booking_reference, '5639466196', 'the external identity is untouched');
  assert.equal(fixed.guest_count, 7);
  assert.match(
    (fixed.history ?? []).map((entry) => entry.detail).join(' '),
    /room/,
    'and the correction is written down',
  );

  // Running it again finds nothing left to do.
  const second = await repairFromMailbox({ store: db, mailbox: createMemoryMailbox([BINA]) });
  assert.equal(second.repaired, 0);
  assert.equal(second.unchanged, 1);
});

test('K the repair rotates no token, creates no reservation and sends no email', async () => {
  const db = store();
  const filed = await db.reservations.create(buildReservation({
    source: 'quovai', booking_reference: '5639466196',
    first_name: 'Bina', last_name: 'Kang', guest_email: 'bina@example.invalid',
    check_in: '2026-10-25', check_out: '2026-10-27',
    adults: 7, guest_count: 7, room: 'Terrazza',
  }));
  // A guest who has already had the email, so the repair has something to spare.
  await db.deliveries.create({
    reservation_id: filed.id, to: filed.guest_email, lang: 'it',
    send_at: '2026-10-22T08:00:00.000Z', status: DELIVERY_STATUS.sent,
    attempts: 1, sent_at: '2026-10-22T08:00:01.000Z', provider: 'gmail', error: null,
  });
  await db.reservations.update(filed.id, { guide_email_status: DELIVERY_STATUS.sent });

  await repairFromMailbox({ store: db, mailbox: createMemoryMailbox([BINA]) });

  const after = await db.reservations.get(filed.id);
  assert.equal(after.guide_token, filed.guide_token, 'the link a guest may already hold');
  assert.equal(after.staff_ref, filed.staff_ref);
  assert.equal(after.guide_created_at, filed.guide_created_at);
  assert.equal(after.check_in, '2026-10-25', 'the dates are not a repair’s business');
  assert.equal(after.check_out, '2026-10-27');
  assert.equal(after.status, filed.status, 'and a repair is not a modification');

  assert.equal((await db.reservations.list({})).length, 1, 'no second reservation');
  const deliveries = await db.deliveries.list({});
  assert.equal(deliveries.length, 1, 'no second delivery');
  assert.equal(deliveries[0].status, DELIVERY_STATUS.sent, 'and nothing was re-sent');
  assert.equal(after.guide_email_status, DELIVERY_STATUS.sent);
});

/* ══ The calendar, which must not adopt half a booking ═══════════════════ */

test('a single-room calendar entry is never merged into a multi-room booking', async () => {
  const db = store();
  const { reservation } = await ingestMessage({ store: db, message: BINA });
  const live = [reservation];

  const result = reconcile({
    events: [{ uid: 'cal-deluxe', room: 'Deluxe', check_in: '2026-10-25', check_out: '2026-10-27', summary: 'Booking.com' }],
    reservations: live,
    room: 'Deluxe',
    now: new Date('2026-10-20T08:00:00Z'),
  });

  assert.equal(result.matched.length, 0, 'one entry cannot say which of three rooms this is');
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.unmatched[0].ambiguous, 'multi-room-booking',
    'flagged for a person rather than held as a second stay');
});

test('a single-room booking still reconciles exactly as before', async () => {
  const db = store();
  const { reservation } = await ingestMessage({ store: db, message: IRENE });

  const result = reconcile({
    events: [{ uid: 'cal-standard', room: 'Standard', check_in: '2026-11-07', check_out: '2026-11-08', summary: 'Booking.com' }],
    reservations: [reservation],
    room: 'Standard',
    now: new Date('2026-11-01T08:00:00Z'),
  });

  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0].reservation_id, reservation.id);
  assert.equal(result.unmatched.length, 0);
});

test('the QuoVai notification for a multi-room booking adopts no provisional stay', async () => {
  const db = store();

  // Occupancy the feed knew about first: one room, the right nights.
  await db.reservations.create(buildReservation({
    source: 'ical', provisional: true, ical_uid: 'cal-terrazza',
    room: 'Terrazza', check_in: '2026-10-25', check_out: '2026-10-27',
    guide_email_status: 'no-address',
  }));

  const { action, reservation } = await ingestMessage({ store: db, message: BINA });

  assert.equal(action, 'created', 'a new stay, not somebody else’s room completed');
  assert.deepEqual(reservation.rooms, BINA_ROOMS);
  assert.equal((await db.reservations.list({})).length, 2, 'the occupancy is left for a person');
  assert.equal((await db.reservations.provisional()).length, 1);
});

/* ══ A cancellation still cancels ════════════════════════════════════════ */

test('the group booking can still be called off, once', async () => {
  const db = store();
  await ingestMessage({ store: db, message: BINA });
  const off = await ingestMessage({
    store: db,
    message: {
      ...BINA,
      subject: '⛔ QuoVai — cancellazione',
      messageId: '<quovai-5639466196-cancel@quovai.com>',
      body: BINA.body.replace('5639466196 NEW', '5639466196 CANCELLED'),
    },
  });

  assert.equal(off.reservation.status, RESERVATION_STATUS.cancelled);
  assert.deepEqual(off.reservation.rooms, BINA_ROOMS, 'and still knows which rooms it was');
  assert.equal((await db.reservations.list({})).length, 1);
});
