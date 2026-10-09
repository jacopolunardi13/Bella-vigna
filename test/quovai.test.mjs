/**
 * Reading QuoVai's notifications, and the calendar reconciliation behind them.
 *
 * The parser is tested against fixtures that look like the real thing — plain text,
 * an HTML table, Italian dates, Italian money, an OTA relay address — because the
 * failure that matters is not a crash. It is a notification that parses into a
 * plausible-looking reservation with the wrong dates in it.
 *
 * At Bella Vigna there is a second way to be plausible and wrong: a notification
 * that reads perfectly and belongs to LunArt. The two houses share an operator,
 * and the same QuoVai template names the property on every message, so the last
 * section here is about whose notification it is.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';

import {
  parseQuovaiEmail, isQuovaiMessage, classifyQuovaiMessage, kindOf,
  parseItalianDate, parseMoney, flatten, fieldOf, splitReference,
} from '../server/ingest/quovai-email.js';
import { repairFromMailbox } from '../server/ingest/repair.js';
import * as REAL from './fixtures/quovai.js';
import { ingestMessage, ingestMessages } from '../server/ingest/index.js';
import {
  parseIcal, reconcile, reconcileFeeds, parseFeedConfig, inspectIcal, createProvisional,
} from '../server/ingest/ical.js';
import { createQuovaiApiAdapter, reservationSources } from '../server/ingest/quovai-api.js';
import { createMemoryMailbox, createGmailMailbox, pollMailbox, createMailbox } from '../server/ingest/mailbox.js';
import { createStore } from '../server/store.js';
import {
  buildReservation, upsertReservation, incompleteFields, isProvisional, findProvisionalMatch,
} from '../server/reservations.js';
import { scheduleGuideEmail } from '../server/delivery.js';

const fixtureUrl = (name) => new URL(`./fixtures/${name}`, import.meta.url);

/** The fixtures are stored as messages, headers and all, and split like one. */
async function fixture(name) {
  const raw = await readFile(fixtureUrl(name), 'utf8');
  const split = raw.indexOf('\n\n');
  const headers = Object.fromEntries(raw.slice(0, split).split('\n').map((line) => {
    const colon = line.indexOf(':');
    return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
  }));
  return {
    subject: headers.subject,
    from: headers.from,
    messageId: headers['message-id'],
    body: raw.slice(split + 2),
  };
}

const store = () => createStore();

/* ── Recognising one ─────────────────────────────────────────────────────── */

test('a QuoVai notification is recognised, and other mail is not', async () => {
  assert.equal(isQuovaiMessage(await fixture('quovai-new.eml')), true);
  assert.equal(isQuovaiMessage({ subject: 'Fattura elettronica', from: 'commercialista@example.com', body: 'Buongiorno' }), false);
  assert.equal(isQuovaiMessage({ subject: 'Newsletter', from: 'news@example.com', body: 'Offerte' }), false);
});

test('the kind comes from the body, and from the subject when it has to', () => {
  assert.equal(kindOf({ subject: '🔔 Prenotazione per Bella Vigna', body: 'NEW' }), 'new');
  assert.equal(kindOf({ subject: '🔄 Modifica per Bella Vigna', body: 'MODIFIED' }), 'modified');
  assert.equal(kindOf({ subject: '⛔ Cancellazione per Bella Vigna', body: 'CANCELLED' }), 'cancelled');
  assert.equal(kindOf({ subject: '🔔 Prenotazione per Bella Vigna', body: 'nessuna parola chiave' }), 'new');
  assert.equal(kindOf({ subject: 'Qualcosa', body: 'Qualcosa' }), null);
});

/* ── NEW ─────────────────────────────────────────────────────────────────── */

test('a NEW notification becomes a complete reservation event', async () => {
  const parsed = parseQuovaiEmail(await fixture('quovai-new.eml'));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.kind, 'new');

  const { event } = parsed;
  assert.equal(event.booking_reference, '5312447891');
  assert.equal(event.channel, 'Booking.com');
  assert.equal(event.first_name, 'Marta');
  assert.equal(event.last_name, 'Venturi');
  assert.equal(event.guest_email, 'marta.venturi.4h9k@guest.booking.com');
  assert.equal(event.guest_phone, '+39 348 112 4455');
  assert.equal(event.check_in, '2026-10-12');
  assert.equal(event.check_out, '2026-10-15');
  assert.equal(event.adults, 2);
  assert.equal(event.children, 0);
  assert.equal(event.room, 'Deluxe');
  // The rate on the same line says "standard", and the property has a room called
  // Standard. A rate is not a room: only the token that leads the row is.
  assert.deepEqual(event.rooms, ['Deluxe'], 'one room, not Deluxe and Standard');
  assert.equal(event.rate, 'standard non rimborsabile');
  assert.equal(event.total_amount, 48600);
  assert.equal(event.booked_at, '2026-09-28');
  assert.equal(event.property, 'Bella Vigna');
  assert.deepEqual(parsed.warnings, []);
});

test('an OTA relay address is kept exactly as it arrived', async () => {
  const { event } = parseQuovaiEmail(await fixture('quovai-new.eml'));
  assert.match(event.guest_email, /@guest\.booking\.com$/, 'the alias is the address that works');
});

test('a notification laid out as a table, with named dates, parses the same way', async () => {
  const { ok, event } = parseQuovaiEmail(await fixture('quovai-expedia-new.eml'));
  assert.equal(ok, true);
  assert.equal(event.booking_reference, 'EXP-77120934');
  assert.equal(event.channel, 'Expedia');
  assert.equal(event.check_in, '2026-11-05', '5 novembre 2026');
  assert.equal(event.check_out, '2026-11-07');
  assert.equal(event.total_amount, 124050, '1.240,50 € is Italian, not American');
  assert.equal(event.room, 'Standard', '"Classica" is the Property Pack’s other name for it, and the id is what is kept');
  assert.equal(event.property, 'Bella Vigna Firenze', 'the long name is this property too');
  assert.equal(event.children, 1);
  assert.equal(event.guest_count, 3);
});

/* ── MODIFIED and CANCELLED ──────────────────────────────────────────────── */

test('a MODIFIED notification in HTML parses, entities and all', async () => {
  const { ok, kind, event } = parseQuovaiEmail(await fixture('quovai-modified.eml'));
  assert.equal(ok, true);
  assert.equal(kind, 'modified');
  assert.equal(event.booking_reference, '5312447891', 'the same booking');
  assert.equal(event.check_out, '2026-10-17', 'the dates moved');
  assert.equal(event.adults, 3);
  assert.equal(event.room, 'Terrazza', 'and the room moved, from Deluxe to the terrace');
  assert.equal(event.total_amount, 81000, '810,00 &euro; decoded');
  assert.equal(event.source_updated_at, '2026-10-02');
});

test('a CANCELLED notification parses without a full set of fields', async () => {
  const { ok, kind, event, warnings } = parseQuovaiEmail(await fixture('quovai-cancelled.eml'));
  assert.equal(ok, true);
  assert.equal(kind, 'cancelled');
  assert.equal(event.booking_reference, '5312447891');
  assert.equal(event.last_name, 'Venturi', 'read from a single "Ospite" line');
  assert.equal(event.first_name, 'Marta');
  assert.ok(warnings.includes('no-guest-email'), 'and it says what was missing');
});

/* ── Refusing rather than guessing ───────────────────────────────────────── */

test('a notification without a booking number is refused', () => {
  const result = parseQuovaiEmail({ subject: '🔔 Prenotazione per Bella Vigna', body: 'NEW\nStruttura: Bella Vigna' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-booking-reference');
});

test('a notification with unreadable dates is refused rather than filled in', () => {
  const result = parseQuovaiEmail({
    subject: '🔔 Prenotazione per Bella Vigna',
    body: 'NEW\nNumero prenotazione: 123456\nCheck-in: prossimamente\nCheck-out: ?',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unreadable-dates');
});

test('a checkout before the check-in is refused', () => {
  const result = parseQuovaiEmail({
    subject: '🔔 Prenotazione per Bella Vigna',
    body: 'NEW\nNumero prenotazione: 123456\nCheck-in: 12/10/2026\nCheck-out: 03/10/2026',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'checkout-before-checkin');
});

test('an unreadable notification becomes something staff have to look at', async () => {
  const db = store();
  const result = await ingestMessage({
    store: db,
    message: { subject: '🔔 Prenotazione per Bella Vigna', body: 'NEW\nqualcosa è andato storto', messageId: '<broken@q>' },
  });
  assert.equal(result.ok, false);
  const alerts = await db.alerts.open();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].kind, 'unreadable-notification');
});

/* ── The small parsers ───────────────────────────────────────────────────── */

test('Italian dates are read as Italian', () => {
  assert.equal(parseItalianDate('12/10/2026'), '2026-10-12');
  assert.equal(parseItalianDate('05.11.2026'), '2026-11-05');
  assert.equal(parseItalianDate('2026-10-12'), '2026-10-12');
  assert.equal(parseItalianDate('5 novembre 2026'), '2026-11-05');
  assert.equal(parseItalianDate('5 November 2026'), '2026-11-05');
  assert.equal(parseItalianDate('12/10/26'), '2026-10-12');
  assert.equal(parseItalianDate('presto'), null);
  assert.equal(parseItalianDate(''), null);
});

test('Italian money is read as Italian', () => {
  assert.equal(parseMoney('486,00 €'), 48600);
  assert.equal(parseMoney('1.240,50 €'), 124050);
  assert.equal(parseMoney('€ 90'), 9000);
  assert.equal(parseMoney('90.00'), 9000);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('gratis'), null);
});

test('a label is not matched inside another label', () => {
  const body = flatten('Agenzia/Canale: Booking.com\nCamera Deluxe - Matrimoniale | Tariffa: non rimborsabile');
  assert.equal(fieldOf(body, ['agenzia/canale', 'agenzia']), 'Booking.com');
  assert.equal(fieldOf(body, ['tariffa']), 'non rimborsabile');
});

/* ── The mailbox seam ────────────────────────────────────────────────────── */

test('a mailbox is just something that returns messages', async () => {
  const db = store();
  const mailbox = createMemoryMailbox([await fixture('quovai-new.eml'), await fixture('quovai-modified.eml')]);
  const result = await pollMailbox({ store: db, mailbox, ingest: ingestMessages });

  assert.equal(result.ok, true);
  assert.equal(result.created, 1);
  assert.equal(result.modified, 1);
  assert.equal((await db.reservations.list({})).length, 1, 'one booking, seen twice');
  assert.equal(mailbox.pending(), 0);
});

test('polling the same mailbox twice does not send a guest two guides', async () => {
  const db = store();
  const message = await fixture('quovai-new.eml');
  const mailbox = createMemoryMailbox([message]);
  await pollMailbox({ store: db, mailbox, ingest: ingestMessages });
  mailbox.push(message);
  const second = await pollMailbox({ store: db, mailbox, ingest: ingestMessages });

  assert.equal(second.duplicates, 1);
  assert.equal((await db.deliveries.list({})).length, 1, 'one scheduled email, not two');
});

test('the Gmail mailbox says it is not configured rather than returning nothing', async () => {
  const mailbox = createGmailMailbox({});
  assert.equal(mailbox.configured, false);
  await assert.rejects(() => mailbox.fetchMessages(), /not configured/);

  const db = store();
  const result = await pollMailbox({ store: db, mailbox, ingest: ingestMessages });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'source-not-configured');
});

test('no mailbox configured is an answer, not a crash', async () => {
  assert.equal(createMailbox({}), null);
  const result = await pollMailbox({ store: store(), mailbox: null, ingest: ingestMessages });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-mailbox-configured');
});

/* ── The API seam ────────────────────────────────────────────────────────── */

test('the QuoVai API adapter refuses everything until it is configured', async () => {
  const adapter = createQuovaiApiAdapter({});
  assert.equal(adapter.configured, false);
  assert.equal(adapter.verify('{}', 'anything'), false, 'nothing verifies without a secret');
  await assert.rejects(() => adapter.fetchChanges(), /not configured/);
  assert.ok(adapter.requires.includes('QUOVAI_WEBHOOK_SECRET'));
  assert.ok(adapter.openQuestions.length >= 3, 'the unknowns are written down');
});

test('a configured adapter verifies a signature and refuses a forged one', () => {
  const adapter = createQuovaiApiAdapter({ quovaiWebhookSecret: 'shhh' });
  assert.equal(adapter.configured, true);
  const body = '{"kind":"new","booking_reference":"1"}';
  const signature = createHmac('sha256', 'shhh').update(body).digest('hex');
  assert.equal(adapter.verify(body, signature), true);
  assert.equal(adapter.verify(body, `sha256=${signature}`), true);
  assert.equal(adapter.verify(body, signature.replace(/.$/, '0')), false);
  assert.equal(adapter.verify(`${body} `, signature), false, 'over the exact body');
});

test('an unmapped payload throws rather than inventing a reservation', () => {
  const adapter = createQuovaiApiAdapter({ quovaiWebhookSecret: 'shhh' });
  assert.throws(() => adapter.toEvent({ something: 'else' }), /not agreed/);
  assert.deepEqual(adapter.toEvent({ kind: 'NEW', booking_reference: 'A1' }), {
    kind: 'new', source: 'quovai', booking_reference: 'A1', message_id: undefined, raw_kept_for_mapping: true,
  });
});

test('every reservation source says whether it can actually be used', () => {
  const sources = reservationSources({});
  assert.equal(sources.find((s) => s.id === 'quovai-email').configured, true);
  assert.equal(sources.find((s) => s.id === 'quovai-api').configured, false);
  assert.equal(sources.find((s) => s.id === 'quovai-ical').configured, false);
  assert.equal(sources.find((s) => s.id === 'manual').configured, true);
});

/* ── iCal reconciliation ─────────────────────────────────────────────────── */

/**
 * A feed naming its rooms the way a person would. Which spelling QuoVai's real
 * feed uses for Bella Vigna is not known yet, so the room is found by the same
 * registry the notification parser reads (`commerce/rooms.js`), whatever it is.
 */
const ICAL = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//QuoVai//EN
BEGIN:VEVENT
UID:qv-5312447891@quovai
DTSTART;VALUE=DATE:20261012
DTEND;VALUE=DATE:20261015
SUMMARY:Prenotazione 5312447891 - camera Deluxe
END:VEVENT
BEGIN:VEVENT
UID:qv-unknown@quovai
DTSTART;VALUE=DATE:20261020
DTEND;VALUE=DATE:20261022
SUMMARY:Camera Terrazza occupata
DESCRIPTION:Nessun dato ospite
END:VEVENT
BEGIN:VEVENT
UID:qv-blocked@quovai
DTSTART;VALUE=DATE:20261101
DTEND;VALUE=DATE:20261103
SUMMARY:Not available
END:VEVENT
END:VCALENDAR`;

test('an iCal feed parses into occupancy, with the end date read correctly', () => {
  const events = parseIcal(ICAL);
  assert.equal(events.length, 3);
  const [first] = events;
  assert.equal(first.uid, 'qv-5312447891@quovai');
  assert.equal(first.check_in, '2026-10-12');
  assert.equal(first.check_out, '2026-10-15');
  assert.equal(first.last_night, '2026-10-14', 'DTEND is the morning the room is free');
  assert.equal(first.booking_reference, '5312447891');
  assert.equal(first.room, 'Deluxe', '"camera Deluxe" in a summary is the room id, whatever its case');
  assert.equal(events[1].room, 'Terrazza');
  assert.equal(events[2].blocked, true, 'a block is not a guest');
});

test('folded iCal lines are unfolded before being read', () => {
  const folded = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:a@b
DTSTART;VALUE=DATE:20261012
DTEND;VALUE=DATE:20261013
SUMMARY:Prenotazione 998877
 6655 - camera Standard
END:VEVENT
END:VCALENDAR`;
  const [event] = parseIcal(folded);
  assert.equal(event.room, 'Standard');
  assert.match(event.summary, /9988776655/);
});

test('an occupancy with no reservation behind it is the alert that matters', () => {
  const reservations = [buildReservation({
    source: 'quovai', booking_reference: '5312447891',
    check_in: '2026-10-12', check_out: '2026-10-15', room: 'Deluxe',
  })];
  const result = reconcile({ events: parseIcal(ICAL), reservations, now: new Date('2026-10-01T10:00:00Z') });

  assert.equal(result.matched.length, 1);
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.unmatched[0].uid, 'qv-unknown@quovai');
  assert.equal(result.unmatched[0].room, 'Terrazza');
  assert.equal(result.missing.length, 0);
});

test('a reservation the feed does not show is flagged, not deleted', () => {
  const reservations = [buildReservation({
    source: 'quovai', booking_reference: 'NOT-IN-FEED',
    check_in: '2026-10-12', check_out: '2026-10-15', room: 'Standard',
  })];
  const result = reconcile({ events: [], reservations, now: new Date('2026-10-01T10:00:00Z') });
  assert.equal(result.missing.length, 1);
  assert.equal(result.missing[0].booking_reference, 'NOT-IN-FEED');
});

test('a reservation typed in by staff is not expected to be in an OTA feed', () => {
  const reservations = [buildReservation({
    source: 'manual', booking_reference: 'MAN-1',
    check_in: '2026-10-12', check_out: '2026-10-15', room: 'Standard',
  })];
  const result = reconcile({ events: [], reservations, now: new Date('2026-10-01T10:00:00Z') });
  assert.equal(result.missing.length, 0);
});

test('an occupancy matched only by room and dates still counts as matched', () => {
  const feed = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:no-ref@quovai
DTSTART;VALUE=DATE:20261012
DTEND;VALUE=DATE:20261015
SUMMARY:Camera Deluxe
END:VEVENT
END:VCALENDAR`;
  const reservations = [buildReservation({
    source: 'quovai', booking_reference: 'WHATEVER',
    check_in: '2026-10-12', check_out: '2026-10-15', room: 'Deluxe',
  })];
  const result = reconcile({ events: parseIcal(feed), reservations, now: new Date('2026-10-01T10:00:00Z') });
  assert.equal(result.matched.length, 1);
  assert.equal(result.unmatched.length, 0);
});

test('reconciling a feed is idempotent: the second run holds no second stay', async () => {
  const db = store();
  const feeds = [{ room: 'Deluxe', url: 'https://feed.example/deluxe.ics' }];
  const fetchText = async () => ICAL;

  const first = await reconcileFeeds({ store: db, feeds, fetchText, now: new Date('2026-10-01T10:00:00Z') });
  assert.equal(first.ok, true);
  assert.equal(first.unmatched, 2, 'both the Deluxe booking and the terrace occupancy are unaccounted for');
  assert.equal(first.created, 2, 'each one becomes a provisional reservation');

  const before = (await db.alerts.open()).length;
  const again = await reconcileFeeds({ store: db, feeds, fetchText, now: new Date('2026-10-01T11:00:00Z') });

  assert.equal(again.unmatched, 0, 'the provisional reservations now answer for the occupancy');
  assert.equal(again.created, 0);
  assert.equal(again.matched, 2);
  assert.equal((await db.reservations.list({ limit: 50 })).length, 2, 'and no second stay was filed');
  assert.equal((await db.alerts.open()).length, before, 'nor a second alert');
});

test('a calendar entry nobody has emailed about becomes a provisional stay, not a guess', async () => {
  const db = store();
  const result = await reconcileFeeds({
    store: db,
    feeds: [{ room: 'Terrazza', url: 'https://feed.example/terrazza.ics' }],
    fetchText: async () => ICAL,
    now: new Date('2026-10-01T10:00:00Z'),
  });

  assert.equal(result.created, 2);
  const held = (await db.reservations.list({ limit: 10 })).find((r) => r.ical_uid === 'qv-unknown@quovai');
  assert.ok(held, 'the occupancy is held');
  assert.equal(held.provisional, true);
  assert.equal(held.source, 'ical');
  assert.equal(held.check_in, '2026-10-20');
  assert.equal(held.check_out, '2026-10-22');
  assert.equal(held.room, 'Terrazza');

  // Nothing invented. Every one of these is something only a guest can tell us.
  assert.equal(held.first_name, '');
  assert.equal(held.last_name, '');
  assert.equal(held.guest_email, '');
  assert.equal(held.guest_phone, '');
  assert.equal(held.channel, '');
  assert.equal(held.booking_reference, '', 'a booking number is read back by a guest, so it is never made up');
  assert.deepEqual(incompleteFields(held), ['first_name', 'last_name', 'guest_email']);
  assert.equal(isProvisional(held), true);
});

test('a provisional stay never schedules a guest email', async () => {
  const db = store();
  await reconcileFeeds({
    store: db,
    feeds: [{ room: 'Terrazza', url: 'https://feed.example/terrazza.ics' }],
    fetchText: async () => ICAL,
    now: new Date('2026-10-01T10:00:00Z'),
  });

  const [held] = await db.reservations.list({ limit: 10 });
  // Asked for directly, which is the only way it could ever happen by accident.
  const delivery = await scheduleGuideEmail({
    store: db, reservation: held, now: new Date('2026-10-18T09:00:00Z'), reason: 'test',
  });
  assert.equal(delivery, null, 'there is nobody to write to, so nothing is queued at all');
  assert.equal((await db.deliveries.list({ limit: 10 })).length, 0);
});

test('the QuoVai notification fills the calendar’s stay in rather than filing a second one', async () => {
  const db = store();
  await reconcileFeeds({
    store: db,
    feeds: [{ room: 'Deluxe', url: 'https://feed.example/deluxe.ics' }],
    fetchText: async () => ICAL,
    now: new Date('2026-10-01T10:00:00Z'),
  });

  const held = (await db.reservations.list({ limit: 10 })).find((r) => r.ical_uid === 'qv-5312447891@quovai');
  assert.ok(held);
  // Something was already bought against it, which is what makes the id load-bearing.
  const order = await db.orders.create({ reservation_id: held.id, amount: 4900, lines: [], status: 'paid' });

  const result = await upsertReservation({
    store: db,
    event: {
      kind: 'new',
      source: 'quovai',
      booking_reference: '5312447891',
      first_name: 'Marta',
      last_name: 'Rossi',
      guest_email: 'marta@example.com',
      check_in: '2026-10-12',
      check_out: '2026-10-15',
      room: 'Deluxe',
      channel: 'Booking.com',
    },
    now: new Date('2026-10-02T10:00:00Z'),
  });

  assert.equal(result.action, 'completed');
  assert.equal(result.matchedBy, 'booking_reference');
  assert.equal(result.reservation.id, held.id, 'the same record');
  assert.equal(result.reservation.guide_token, held.guide_token, 'and the same link, which may already be open');
  assert.equal(result.reservation.staff_ref, held.staff_ref);
  assert.equal(result.reservation.provisional, false);
  assert.equal(result.reservation.source, 'quovai');
  assert.equal(result.reservation.first_name, 'Marta');
  assert.equal(result.reservation.guest_email, 'marta@example.com');
  assert.equal(result.reservation.channel, 'Booking.com');
  assert.deepEqual(incompleteFields(result.reservation), []);

  // The feed held two stays; the email accounted for one of them. Two records, not
  // three — and exactly one of them carries this booking number.
  const all = await db.reservations.list({ limit: 50 });
  assert.equal(all.length, 2);
  assert.equal(all.filter((r) => r.booking_reference === '5312447891').length, 1, 'one stay, not two');
  assert.equal((await db.orders.get(order.id)).reservation_id, held.id, 'and what was bought is still against it');
  assert.ok(
    result.reservation.history.some((entry) => entry.type === 'completed-from-notification'),
    'the history says what happened',
  );
});

test('a stay with no booking number in the feed is still recognised by room and dates', async () => {
  const db = store();
  const feed = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:bare@quovai
DTSTART;VALUE=DATE:20261112
DTEND;VALUE=DATE:20261115
SUMMARY:Camera Standard
END:VEVENT
END:VCALENDAR`;
  await reconcileFeeds({
    store: db, feeds: [{ room: 'Standard', url: 'https://feed.example/standard.ics' }],
    fetchText: async () => feed, now: new Date('2026-11-01T10:00:00Z'),
  });
  const [held] = await db.reservations.list({ limit: 10 });

  const result = await upsertReservation({
    store: db,
    event: {
      kind: 'new', source: 'quovai', booking_reference: '6703524869',
      first_name: 'Irene', last_name: 'Bianchi', guest_email: 'irene@example.com',
      check_in: '2026-11-12', check_out: '2026-11-15', room: 'Standard',
    },
    now: new Date('2026-11-02T10:00:00Z'),
  });

  assert.equal(result.action, 'completed');
  assert.equal(result.matchedBy, 'room-and-dates');
  assert.equal(result.reservation.id, held.id);
  assert.equal(result.reservation.booking_reference, '6703524869', 'the real number arrives with the email');
});

test('two provisional stays that both fit are never merged into one', async () => {
  const db = store();
  // The same room on the same nights, twice: a feed read badly, or two feeds.
  for (const uid of ['dup-a@quovai', 'dup-b@quovai']) {
    await createProvisional({
      store: db,
      occupancy: { uid, check_in: '2026-12-01', check_out: '2026-12-04', room: 'Deluxe' },
      now: new Date('2026-11-01T10:00:00Z'),
    });
  }

  const incoming = buildReservation({
    source: 'quovai', booking_reference: 'AMBIG-1',
    check_in: '2026-12-01', check_out: '2026-12-04', room: 'Deluxe',
  });
  const found = await findProvisionalMatch({ store: db, incoming });
  assert.equal(found.match, null, 'a guess that attaches a guest to the wrong stay is worse than a new row');
  assert.equal(found.ambiguous, true);
  assert.equal(found.candidates.length, 2);

  const result = await upsertReservation({
    store: db,
    event: {
      kind: 'new', source: 'quovai', booking_reference: 'AMBIG-1',
      first_name: 'Anna', check_in: '2026-12-01', check_out: '2026-12-04', room: 'Deluxe',
    },
  });
  assert.equal(result.action, 'created');
  assert.equal(result.ambiguousProvisional.length, 2, 'and it says which two it could have been');
});

test('an event vanishing from the feed is reported and never cancelled', async () => {
  const db = store();
  const feeds = [{ room: 'Terrazza', url: 'https://feed.example/terrazza.ics' }];
  await reconcileFeeds({ store: db, feeds, fetchText: async () => ICAL, now: new Date('2026-10-01T10:00:00Z') });
  const held = (await db.reservations.list({ limit: 10 })).find((r) => r.ical_uid === 'qv-unknown@quovai');

  const empty = 'BEGIN:VCALENDAR\nEND:VCALENDAR';
  const result = await reconcileFeeds({
    store: db, feeds, fetchText: async () => empty, now: new Date('2026-10-02T10:00:00Z'),
  });

  assert.equal(result.vanished, 2, 'both stays the calendar created are now absent from it');
  assert.equal((await db.reservations.get(held.id)).status, 'active', 'and both are still live');
  const alert = (await db.alerts.open()).find((a) => a.kind === 'occupancy-vanished');
  assert.ok(alert, 'a person is told');
  assert.match(alert.detail.message, /Nessuna cancellazione automatica/);
});

test('inspecting a feed reports its shape and writes nothing', () => {
  const shape = inspectIcal(ICAL);
  assert.equal(shape.looksLikeIcal, true);
  assert.equal(shape.events, 3);
  assert.equal(shape.withUid, 3);
  assert.equal(shape.withBookingReference, 1, 'only one of these actually carries a number');
  assert.equal(shape.withRoom, 2);
  assert.ok(shape.properties.includes('DTSTART'));
  assert.ok(shape.properties.includes('SUMMARY'));
  assert.equal(shape.sample.uid, 'qv-5312447891@quovai');

  const notACalendar = inspectIcal('<html>login required</html>');
  assert.equal(notACalendar.looksLikeIcal, false, 'a feed behind a login page says so rather than parsing as empty');
  assert.equal(notACalendar.events, 0);
});

test('an unreachable feed is an alert, not a silent failure', async () => {
  const db = store();
  const result = await reconcileFeeds({
    store: db,
    feeds: [{ room: 'Deluxe', url: 'https://feed.example/deluxe.ics' }],
    fetchText: async () => { throw new Error('ETIMEDOUT'); },
  });
  assert.equal(result.errors.length, 1);
  const alerts = await db.alerts.open();
  assert.equal(alerts[0].kind, 'ical-feed-unreachable');
});

test('no feeds configured is reported as such', async () => {
  const result = await reconcileFeeds({ store: store(), feeds: [] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-feeds-configured');
});

test('feeds are configured as room:url pairs, or bare urls', () => {
  // A room may be written in any spelling the registry knows, and is kept as its id.
  assert.deepEqual(parseFeedConfig('Deluxe:https://a.ics,terrace:https://b.ics'), [
    { room: 'Deluxe', url: 'https://a.ics' },
    { room: 'Terrazza', url: 'https://b.ics' },
  ]);
  assert.deepEqual(parseFeedConfig('https://all.ics'), [{ room: '', url: 'https://all.ics' }]);
  assert.deepEqual(parseFeedConfig(''), []);
  // A setting copied from LunArt names a room this property does not have.
  assert.equal(parseFeedConfig('303:https://a.ics')[0].room, '', '303 is not a room here');
});

/* ═══════════════════════════════════════════════════════════════════════════
   The real thing.

   Everything above was written against a shape nobody had seen. These are the
   notifications QuoVai actually sends — the template LunArt receives, which the
   first live Gmail ingestion there showed the parser getting wrong on both counts
   that matter: QuoVai does not label the guest's name, and the room is in the
   table's data rather than beside the word "Camera". The four reservations below
   are the four that were really in LunArt's staging store, carried here in Bella
   Vigna's name and rooms until a Bella Vigna notification has been seen
   (`test/fixtures/quovai.js` says how).
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── A. Parsing ─────────────────────────────────────────────────────────── */

test('the guest name is read even though QuoVai never labels it', () => {
  const irene = parseQuovaiEmail(REAL.IRENE);
  assert.equal(irene.ok, true);
  assert.equal(irene.event.first_name, 'Irene');
  assert.equal(irene.event.last_name, 'Cappellini');

  const martin = parseQuovaiEmail(REAL.MARTIN);
  assert.equal(martin.event.first_name, 'Martin');
  assert.equal(martin.event.last_name, 'Markert');
});

test('the room comes out of the table data, not from beside the word Camera', () => {
  // "Camera Standard" / "Doppia/Tripla con Terrazza": the room leads the row, and
  // the word "Camera" on its own is a column header several lines above it.
  assert.equal(parseQuovaiEmail(REAL.IRENE).event.room, 'Standard');
  assert.equal(parseQuovaiEmail(REAL.MARTIN).event.room, 'Terrazza');
  assert.equal(parseQuovaiEmail(REAL.KELLY).event.room, 'Deluxe');
  // The bare id reads the same as the Property Pack's name for it.
  assert.equal(parseQuovaiEmail(REAL.FLORIAN).event.room, 'Deluxe');
});

test('all four live reservations read exactly as the owner verified them', () => {
  const expected = [
    { ref: '6230618454', guest: 'Martin Markert', room: 'Terrazza', from: '2026-10-02', to: '2026-10-03', channel: 'BOOKING.COM', kind: 'modified' },
    { ref: '6213834462', guest: 'Kelly Kay', room: 'Deluxe', from: '2026-10-13', to: '2026-10-14', channel: 'BOOKING.COM', kind: 'new' },
    { ref: '6703524869', guest: 'Irene Cappellini', room: 'Standard', from: '2026-11-07', to: '2026-11-08', channel: 'BOOKING.COM', kind: 'new' },
    { ref: '2568875469', guest: 'Florian Tinsley', room: 'Deluxe', from: '2027-05-29', to: '2027-06-02', channel: 'EXPEDIA', kind: 'new' },
  ];
  const got = REAL.REAL_RESERVATIONS.map((message) => {
    const { event, kind } = parseQuovaiEmail(message);
    return {
      ref: event.booking_reference,
      guest: `${event.first_name} ${event.last_name}`.trim(),
      room: event.room,
      from: event.check_in,
      to: event.check_out,
      channel: event.channel,
      kind,
    };
  });
  assert.deepEqual(got, expected);
});

/**
 * The booking number is the key the upsert turns on, and QuoVai prints the status
 * on the same line as it. Squeezing the spaces out filed the stay under
 * "6703524869NEW" — unreadable to a guest, and a second row as soon as the same
 * booking came back as MODIFIED.
 */
test('the status word beside the booking number is not part of the booking number', () => {
  for (const message of [...REAL.REAL_RESERVATIONS, REAL.IRENE_CANCELLED]) {
    const { event } = parseQuovaiEmail(message);
    assert.match(event.booking_reference, /^\d{10}$/, `"${event.booking_reference}" is not a booking number`);
  }
  assert.equal(parseQuovaiEmail(REAL.IRENE).event.booking_reference, '6703524869');
  assert.equal(parseQuovaiEmail(REAL.IRENE_CANCELLED).event.booking_reference, '6703524869');
});

test('and it is what tells NEW from MODIFIED from CANCELLED', () => {
  assert.equal(parseQuovaiEmail(REAL.KELLY).kind, 'new');
  assert.equal(parseQuovaiEmail(REAL.MARTIN).kind, 'modified');
  assert.equal(parseQuovaiEmail(REAL.IRENE_CANCELLED).kind, 'cancelled');
});

test('a cancellation of a real booking still carries its name and room', () => {
  const { event } = parseQuovaiEmail(REAL.IRENE_CANCELLED);
  assert.equal(event.last_name, 'Cappellini');
  assert.equal(event.room, 'Standard');
});

test('a multi-part surname keeps its particle', () => {
  const name = (full) => {
    const message = {
      subject: '🔔 QuoVai — nuova prenotazione',
      from: 'QuoVai <noreply@quovai.com>',
      body: `Numero prenotazione: 1234567890 NEW\n\n${full}\n\nStruttura: BELLA VIGNA\nCheck-in: 01/02/2027\nCheck-out: 03/02/2027`,
    };
    const { event } = parseQuovaiEmail(message);
    return `${event.first_name}|${event.last_name}`;
  };
  assert.equal(name('Irene Cappellini'), 'Irene|Cappellini');
  assert.equal(name('Maria Teresa Di Napoli'), 'Maria Teresa|Di Napoli');
  assert.equal(name('Jan van der Berg'), 'Jan|van der Berg');
  assert.equal(name('Cher'), '|Cher');
});

/** The name must come from the one place it lives, not from any standalone line. */
test('a line that is not a name is not taken for one', () => {
  const { event } = parseQuovaiEmail({
    subject: '🔔 QuoVai — nuova prenotazione',
    from: 'QuoVai <noreply@quovai.com>',
    body: 'Numero prenotazione: 1234567890 NEW\n\nStruttura: BELLA VIGNA\nCheck-in: 01/02/2027\nCheck-out: 03/02/2027\n\nMartin Markert',
  });
  // The field block started immediately, so there was no unlabelled name to take —
  // and a name sitting below the block is not where QuoVai puts it.
  assert.equal(event.last_name, '');
});

/**
 * A room in prose is not a room.
 *
 * At LunArt the danger was a number; here the rooms are words a guest uses in a
 * sentence, which makes the notes the likeliest place for one to turn up.
 */
const withNote = (...noteLines) => parseQuovaiEmail({
  subject: '🔔 QuoVai — nuova prenotazione',
  from: 'QuoVai <noreply@quovai.com>',
  body: [
    'Numero prenotazione: 1234567890 NEW',
    '',
    'Anna Bianchi',
    '',
    'Struttura: BELLA VIGNA',
    'Check-in: 01/02/2027',
    'Check-out: 03/02/2027',
    ...noteLines,
  ].join('\n'),
}).event;

test('a room mentioned in a note is not read as the room', () => {
  const inline = withNote('Note: se possibile vorremmo la Terrazza, grazie');
  assert.equal(inline.room, '', 'a request is not an assignment');
  assert.match(inline.notes, /Terrazza/, 'and the request itself is kept');

  // A note on its own line that opens with a room is shaped exactly like a table
  // row. It is still the guest's sentence, and only the notes rule keeps it out.
  const leading = withNote('Note', 'Deluxe se fosse libera, è il nostro anniversario');
  assert.equal(leading.room, '');
  assert.deepEqual(leading.rooms, []);
  assert.match(leading.notes, /^Deluxe se fosse libera/);
});

/**
 * A note written on the label's own line is prose too. The last-resort reader
 * takes any line mentioning "camera" and reads the rooms in it, and it used to
 * skip a note only when the note sat on a line by itself — so "vorremmo la camera
 * con terrazza", the most natural thing a Bella Vigna guest could write, filed
 * them on the terrace. `roomsFromTable` now skips any line that carries the note.
 */
test('a room named in a note, in the registry’s own words, is not the room', () => {
  const event = withNote('Note: se possibile vorremmo la camera con terrazza, grazie');
  assert.equal(event.room, '', 'a request is not an assignment');
});

/* ── B. Classification ──────────────────────────────────────────────────── */

test('the police forms are not a reservation, and raise nothing', async () => {
  for (const message of [REAL.SCHEDINE, REAL.SCHEDINE_14]) {
    const verdict = classifyQuovaiMessage(message);
    assert.equal(verdict.relevant, false);
    assert.equal(verdict.reason, 'operational-notice');
  }

  const store = createStore();
  const outcome = await ingestMessages({ store, messages: [REAL.SCHEDINE, REAL.SCHEDINE_14] });
  assert.equal(outcome.ignored, 2);
  assert.equal(outcome.failed, 0);
  assert.equal((await store.alerts.open()).length, 0, 'noise must not become a warning');
  assert.equal((await store.reservations.list()).length, 0);
});

test('a completed online check-in is not a reservation either', async () => {
  // Its subject says "prenotazione 1308918", which is exactly what used to fool us.
  const verdict = classifyQuovaiMessage(REAL.ONLINE_CHECKIN);
  assert.equal(verdict.relevant, false);
  assert.equal(verdict.reason, 'operational-notice');

  const store = createStore();
  await ingestMessages({ store, messages: [REAL.ONLINE_CHECKIN] });
  assert.equal((await store.alerts.open()).length, 0);
});

/**
 * Sender alone decides nothing, so a forwarded notice is recognised by the words
 * QuoVai puts in its subject — and those words are this property's name, not
 * LunArt's. A LunArt subject from an unknown sender is not this mailbox's business.
 */
test('the subject words that mark the reservation mailbox are Bella Vigna’s', () => {
  const forwarded = (subject) => classifyQuovaiMessage({
    subject, from: 'diego@example.com', body: 'Il check-in online è stato completato.',
  });

  const ours = forwarded('Bella Vigna: check-in online effettuato per prenotazione 1308918 (Pelicic)');
  assert.equal(ours.relevant, false);
  assert.equal(ours.reason, 'operational-notice', 'ours, and operational');
  assert.equal(ours.notice, 'online-check-in');

  const theirs = forwarded('LunArt: check-in online effettuato per prenotazione 1308918 (Pelicic)');
  assert.equal(theirs.relevant, false);
  assert.equal(theirs.reason, 'not-from-the-reservation-mailbox', 'not ours at all');
});

test('a genuine notification that will not read still reaches staff', async () => {
  const verdict = classifyQuovaiMessage(REAL.MALFORMED);
  assert.equal(verdict.relevant, true, 'it says it is a reservation, so it is one');

  const store = createStore();
  const outcome = await ingestMessages({ store, messages: [REAL.MALFORMED] });
  assert.equal(outcome.failed, 1);
  assert.equal(outcome.ignored, 0);
  const alerts = await store.alerts.open();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].kind, 'unreadable-notification');
  assert.equal(alerts[0].detail.reason, 'unreadable-dates');
});

test('noise and reservations in one batch are told apart', async () => {
  const store = createStore();
  const outcome = await ingestMessages({
    store,
    messages: [REAL.SCHEDINE, REAL.IRENE, REAL.ONLINE_CHECKIN, REAL.KELLY, REAL.MALFORMED],
  });
  assert.equal(outcome.created, 2);
  assert.equal(outcome.ignored, 2);
  assert.equal(outcome.failed, 1);
  assert.equal((await store.alerts.open()).length, 1, 'one warning, for the one that earned it');
});

/* ── C. Repair ──────────────────────────────────────────────────────────── */

/**
 * The staging store as the old parser left it: the stay is there, with its dates
 * and its guide link, and without the guest's name or the room.
 */
async function staleStore() {
  const store = createStore();
  const reservations = [
    { ref: '6230618454MODIFIED', from: '2026-10-02', to: '2026-10-03' },
    { ref: '6213834462NEW', from: '2026-10-13', to: '2026-10-14' },
    { ref: '6703524869NEW', from: '2026-11-07', to: '2026-11-08' },
    { ref: '2568875469NEW', from: '2027-05-29', to: '2027-06-02' },
  ];
  const made = [];
  for (const row of reservations) {
    made.push(await store.reservations.create(buildReservation({
      source: 'quovai',
      booking_reference: row.ref,
      check_in: row.from,
      check_out: row.to,
      first_name: '',
      last_name: '',
      room: '',
      adults: 2,
    })));
  }
  return { store, made };
}

test('repair fills in the name and the room the old parser lost', async () => {
  const { store } = await staleStore();
  const mailbox = createMemoryMailbox([...REAL.REAL_RESERVATIONS]);

  const result = await repairFromMailbox({ store, mailbox });
  assert.equal(result.ok, true);
  assert.equal(result.scanned, 4);
  assert.equal(result.reservations, 4);
  assert.equal(result.matched, 4, 'matched under the booking number the old parser mangled');
  assert.equal(result.repaired, 4);
  assert.equal(result.unmatched, 0);
  assert.equal(result.failed, 0);

  const rows = await store.reservations.list();
  const byName = Object.fromEntries(rows.map((r) => [`${r.first_name} ${r.last_name}`.trim(), r]));
  assert.equal(byName['Martin Markert'].room, 'Terrazza');
  assert.equal(byName['Kelly Kay'].room, 'Deluxe');
  assert.equal(byName['Irene Cappellini'].room, 'Standard');
  assert.equal(byName['Florian Tinsley'].room, 'Deluxe');
  // And the booking numbers are numbers a guest could read back.
  for (const row of rows) assert.match(row.booking_reference, /^\d{10}$/);
});

test('repair never creates a reservation, and keeps every identity it found', async () => {
  const { store, made } = await staleStore();
  const before = made.map((r) => ({ id: r.id, token: r.guide_token, created: r.guide_created_at, ref: r.staff_ref }));

  await repairFromMailbox({ store, mailbox: createMemoryMailbox([...REAL.REAL_RESERVATIONS]) });

  const after = await store.reservations.list();
  assert.equal(after.length, 4, 'four before, four after');
  for (const was of before) {
    const now = after.find((r) => r.id === was.id);
    assert.ok(now, 'the reservation id survived');
    assert.equal(now.guide_token, was.token, 'the guest keeps the link they already have');
    assert.equal(now.guide_created_at, was.created);
    assert.equal(now.staff_ref, was.ref);
  }
});

test('repair schedules no email and sends nothing', async () => {
  const { store, made } = await staleStore();
  // One of them has already had its guide email; that must not be undone.
  await store.reservations.update(made[0].id, { guide_email_status: 'sent', guide_email_sent_at: '2026-09-30T08:00:00.000Z' });

  await repairFromMailbox({ store, mailbox: createMemoryMailbox([...REAL.REAL_RESERVATIONS]) });

  assert.equal((await store.deliveries.list()).length, 0, 'no delivery was scheduled');
  const sent = (await store.reservations.list()).find((r) => r.id === made[0].id);
  assert.equal(sent.guide_email_status, 'sent', 'an email already sent stays sent');
  assert.equal(sent.guide_email_sent_at, '2026-09-30T08:00:00.000Z');
});

test('repair does not move the dates or change the status', async () => {
  const { store, made } = await staleStore();
  const before = made.map((r) => ({ id: r.id, from: r.check_in, to: r.check_out, status: r.status }));

  await repairFromMailbox({ store, mailbox: createMemoryMailbox([...REAL.REAL_RESERVATIONS]) });

  const after = await store.reservations.list();
  for (const was of before) {
    const now = after.find((r) => r.id === was.id);
    assert.equal(now.check_in, was.from);
    assert.equal(now.check_out, was.to);
    assert.equal(now.status, was.status, 'a repair is not a modification');
  }
});

test('running repair a second time changes nothing', async () => {
  const { store } = await staleStore();
  const first = await repairFromMailbox({ store, mailbox: createMemoryMailbox([...REAL.REAL_RESERVATIONS]) });
  const snapshot = JSON.stringify((await store.reservations.list()).map((r) => ({ ...r, history: r.history.length })));

  const second = await repairFromMailbox({ store, mailbox: createMemoryMailbox([...REAL.REAL_RESERVATIONS]) });
  assert.equal(first.repaired, 4);
  assert.equal(second.repaired, 0, 'nothing left to correct');
  assert.equal(second.unchanged, 4);
  assert.equal(
    JSON.stringify((await store.reservations.list()).map((r) => ({ ...r, history: r.history.length }))),
    snapshot,
    'and not one field moved',
  );
});

test('repair leaves the history, and says in it what it did', async () => {
  const { store, made } = await staleStore();
  await repairFromMailbox({ store, mailbox: createMemoryMailbox([REAL.IRENE]) });
  const row = (await store.reservations.list()).find((r) => r.last_name === 'Cappellini');
  const repair = row.history.filter((h) => h.type === 'parser-repair');
  assert.equal(repair.length, 1);
  assert.match(repair[0].detail, /room: Standard/);
  assert.match(repair[0].detail, /last_name: Cappellini/);
});

test('repair ignores the noise in the same mailbox', async () => {
  const { store } = await staleStore();
  const result = await repairFromMailbox({
    store,
    mailbox: createMemoryMailbox([REAL.SCHEDINE, REAL.IRENE, REAL.ONLINE_CHECKIN]),
  });
  assert.equal(result.ignored, 2);
  assert.equal(result.reservations, 1);
  assert.equal(result.repaired, 1);
});

test('repair does not invent a reservation for a booking we never had', async () => {
  const store = createStore();
  const result = await repairFromMailbox({ store, mailbox: createMemoryMailbox([REAL.IRENE]) });
  assert.equal(result.unmatched, 1);
  assert.equal(result.repaired, 0);
  assert.equal((await store.reservations.list()).length, 0, 'repair repairs; polling creates');
});

/** Ordinary polling must stay exactly as idempotent as it was. */
test('the dedupe bypass belongs to repair alone', async () => {
  const store = createStore();
  const mailbox = createMemoryMailbox([REAL.IRENE]);
  const first = await pollMailbox({ store, mailbox, ingest: ingestMessages });
  assert.equal(first.created, 1);

  mailbox.push(REAL.IRENE);
  const second = await pollMailbox({ store, mailbox, ingest: ingestMessages });
  assert.equal(second.duplicates, 1, 'the same message twice is still recognised');
  assert.equal(second.created, 0);
  assert.equal((await store.reservations.list()).length, 1);
});

test('an empty value never overwrites something we already hold', async () => {
  const { store } = await staleStore();
  await repairFromMailbox({ store, mailbox: createMemoryMailbox([...REAL.REAL_RESERVATIONS]) });
  // These fixtures carry no guest email; the field must be left as it was rather
  // than blanked by a parser that simply did not find one.
  const row = (await store.reservations.list()).find((r) => r.last_name === 'Kay');
  const withEmail = await store.reservations.update(row.id, { guest_email: 'kelly@example.invalid' });
  await repairFromMailbox({ store, mailbox: createMemoryMailbox([REAL.KELLY]) });
  const after = (await store.reservations.list()).find((r) => r.id === withEmail.id);
  assert.equal(after.guest_email, 'kelly@example.invalid');
});

/* ═══════════════════════════════════════════════════════════════════════════
   Whose notification it is.

   Bella Vigna and LunArt run the same core for the same operator, and QuoVai
   sends both of them the same template. A LunArt notification in this mailbox —
   a forwarding rule, a shared inbox, a query that matches too much — would parse
   perfectly, and a LunArt guest would be sent a Bella Vigna link, Pass and email.
   QuoVai names the property on every message ("Struttura: …"), so that line
   decides: another property's name stops the parse before a guest field is read.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── D. Another property ────────────────────────────────────────────────── */

test('a LunArt notification is refused before a single guest field is read', () => {
  const parsed = parseQuovaiEmail(REAL.LUNART);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, 'other-property');
  assert.equal(parsed.property, 'LUNART', 'it says whose it was');
  assert.equal(parsed.booking_reference, '6213834462', 'and which message, so staff can find it');
  assert.equal('event' in parsed, false, 'there is nothing to file');
  assert.ok(!JSON.stringify(parsed).includes('Kay'), 'the guest was never read');
});

test('ingesting it files nothing, and tells staff once however often it arrives', async () => {
  const db = store();

  const first = await ingestMessage({ store: db, message: REAL.LUNART });
  assert.equal(first.ok, false);
  assert.equal(first.reason, 'other-property');
  assert.equal((await db.reservations.list({})).length, 0, 'no reservation');
  assert.equal((await db.deliveries.list({})).length, 0, 'and so no guide email');

  const alerts = await db.alerts.open();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].kind, 'other-property-notification',
    'not "unreadable": it read fine, and it means the mailbox query is wrong');
  assert.equal(alerts[0].detail.property, 'LUNART');
  assert.ok(!JSON.stringify(alerts).includes('Kay'), 'nothing about the guest is kept, not even in the alert');

  // The next poll sees the same message. Still nothing filed, still one alert.
  const again = await ingestMessage({ store: db, message: REAL.LUNART });
  assert.equal(again.reason, 'other-property');
  assert.equal((await db.reservations.list({})).length, 0);
  const after = await db.alerts.open();
  assert.equal(after.length, 1, 'one alert, counted, not two rows');
  assert.equal(after[0].seen, 2);
});

test('in a batch, LunArt’s notification is neither a stay nor noise', async () => {
  const db = store();
  // Ours and LunArt's share a booking number because the fixture was derived from
  // the real LunArt message, which makes this the sharpest version of the check:
  // the refusal comes before any lookup by number could reach Kelly's stay.
  const outcome = await ingestMessages({
    store: db, messages: [REAL.SCHEDINE, REAL.IRENE, REAL.KELLY, REAL.LUNART],
  });
  assert.equal(outcome.created, 2, 'Irene and Kelly, ours');
  assert.equal(outcome.ignored, 1, 'the police forms, quietly');
  assert.equal(outcome.failed, 1, 'LunArt’s is not dropped in silence');
  assert.equal(outcome.modified, 0, 'and it changed nothing of ours');

  const kelly = await db.reservations.findByBooking('quovai', '6213834462');
  assert.equal(kelly.room, 'Deluxe', 'still our Deluxe, not LunArt’s 305');
  assert.equal(kelly.history.filter((entry) => entry.type !== 'created').length, 0,
    'and nothing was written against it');

  const alerts = await db.alerts.open();
  assert.deepEqual(alerts.map((a) => a.kind), ['other-property-notification']);
});

test('a Bella Vigna notification is read, in whichever way QuoVai spells the name', () => {
  for (const name of ['BELLA VIGNA', 'Bella Vigna', 'Bella Vigna Firenze', 'BELLAVIGNA']) {
    const parsed = parseQuovaiEmail({
      ...REAL.IRENE,
      body: REAL.IRENE.body.replace('Struttura: BELLA VIGNA', `Struttura: ${name}`),
    });
    assert.equal(parsed.ok, true, `${name}: ${parsed.reason}`);
    assert.equal(parsed.event.property, name);
    assert.equal(parsed.event.last_name, 'Cappellini');
  }
  for (const name of ['LUNART', 'LunArt']) {
    const parsed = parseQuovaiEmail({
      ...REAL.IRENE,
      body: REAL.IRENE.body.replace('Struttura: BELLA VIGNA', `Struttura: ${name}`),
    });
    assert.equal(parsed.ok, false, name);
    assert.equal(parsed.reason, 'other-property');
  }
});

test('a Bella Vigna notification goes all the way through', async () => {
  const db = store();
  const result = await ingestMessage({ store: db, message: REAL.IRENE });
  assert.equal(result.action, 'created');
  assert.equal(result.reservation.last_name, 'Cappellini');
  assert.equal(result.reservation.room, 'Standard');
  assert.equal((await db.alerts.open()).length, 0, 'and nobody is told anything');
});

test('a notification that names no property at all is still read', async () => {
  // The mailbox query is what scopes the messages; a notification that names no
  // property names no other property either.
  const parsed = parseQuovaiEmail(REAL.UNNAMED_PROPERTY);
  assert.equal(parsed.ok, true, parsed.reason);
  assert.equal(parsed.event.property, '');
  assert.equal(parsed.event.first_name, 'Irene');
  assert.equal(parsed.event.last_name, 'Cappellini');
  assert.equal(parsed.event.room, 'Standard');

  const db = store();
  const result = await ingestMessage({ store: db, message: REAL.UNNAMED_PROPERTY });
  assert.equal(result.action, 'created');
  assert.equal((await db.alerts.open()).length, 0);
});

test('repair takes no correction from another property’s notification', async () => {
  const { store } = await staleStore();
  const before = await store.reservations.findByBooking('quovai', '6213834462NEW');

  const result = await repairFromMailbox({ store, mailbox: createMemoryMailbox([REAL.LUNART]) });
  assert.equal(result.reservations, 0, 'not one of ours');
  assert.equal(result.matched, 0, 'so it is never matched, even under a number we hold');
  assert.equal(result.repaired, 0);
  assert.deepEqual(result.problems.map((p) => p.reason), ['other-property']);

  const after = await store.reservations.get(before.id);
  assert.equal(after.last_name, '', 'Kelly’s stay did not get LunArt’s copy of her name');
  assert.equal(after.room, '');
  assert.equal(after.history.length, before.history.length);
});
