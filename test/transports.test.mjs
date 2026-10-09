/**
 * The four outside systems, exercised without credentials and without a network.
 *
 * Every one of them is driven through an injected `fetch` or an injected transport,
 * which is the only honest way to test an integration whose keys do not exist yet:
 * the request that would be sent is inspected, and the answers Google would give —
 * including the awkward ones, a 401 mid-flight, a 500, a dead push endpoint — are
 * handed back on purpose.
 *
 * The properties worth proving are not "it calls the API". They are: nothing is
 * lost when a call fails, nothing is sent twice, a dead device is forgotten and a
 * sulking one is not, and a job that is already running is not started again.
 *
 * And, since Bella Vigna shares a WhatsApp line, a QuoVai account and possibly a
 * Stripe account with LunArt: nothing addressed to the other property is taken
 * for this one's — not a booking notification, not a payment event.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync } from 'node:crypto';

import { createOauthClient, createServiceAccountClient, googleFetch, GoogleError } from '../server/google.js';
import { createGmailMailbox, extractBodies, normaliseMessage } from '../server/ingest/gmail.js';
import { createMailbox, mailboxSources, pollMailbox, createMemoryMailbox } from '../server/ingest/mailbox.js';
import { ingestMessages } from '../server/ingest/index.js';
import { createGmailMailer, buildMimeMessage, encodeHeader } from '../server/mail/gmail.js';
import { createMailer, createSimulatedMailer, mailProviders, sendDueGuideEmails, scheduleGuideEmail, DELIVERY_STATUS } from '../server/delivery.js';
import { createPushAdapter, notifyStaff, registerSubscription } from '../server/push.js';
import { createGoogleCalendarAdapter, appointmentWindow, overlapsBusy, providerCalendars } from '../server/calendar/google.js';
import { freeSlots, freeDays, slotIsFree, verifySlotForCheckout } from '../server/calendar/index.js';
import { createApp, handleStripeEvent } from '../server/app.js';
import { createMockStripe } from '../server/stripe.js';
import { propertyDate, addDays } from '../commerce/time.js';
import { createScheduler } from '../server/scheduler.js';
import { createStore } from '../server/store.js';
import { applySchedule, MANUAL_SCHEDULE, serviceMinutes } from '../commerce/schedule.js';
import { propertyTimeToInstant } from '../commerce/time.js';
import { buildReservation } from '../server/reservations.js';
import { asIfConfirmed } from './support/property.mjs';

const store = () => createStore();

/** A fetch that answers from a script and records what it was asked. */
function scriptedFetch(routes) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method ?? 'GET', body: options.body, headers: options.headers ?? {} });
    for (const [pattern, reply] of routes) {
      if (!String(url).includes(pattern)) continue;
      const answer = typeof reply === 'function' ? await reply(calls.length, { url: String(url), options }) : reply;
      if (answer instanceof Error) throw answer;
      return {
        ok: (answer.status ?? 200) < 400,
        status: answer.status ?? 200,
        statusText: answer.statusText ?? '',
        text: async () => (typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body ?? {})),
      };
    }
    throw new Error(`no scripted answer for ${url}`);
  };
  impl.calls = calls;
  return impl;
}

const TOKEN = { body: { access_token: 'ya29.test', expires_in: 3600 } };

const CREDENTIALS = {
  gmailClientId: 'client-id',
  gmailClientSecret: 'client-secret',
  gmailRefreshToken: 'refresh-token',
};

/* ── OAuth ───────────────────────────────────────────────────────────────── */

test('a refresh token is exchanged once and the access token is reused', async () => {
  const fetchImpl = scriptedFetch([
    ['oauth2.googleapis.com/token', TOKEN],
    ['gmail.googleapis.com', { body: { ok: true } }],
  ]);
  const client = createOauthClient({ clientId: 'a', clientSecret: 'b', refreshToken: 'c', fetchImpl });

  await client.call('https://gmail.googleapis.com/one');
  await client.call('https://gmail.googleapis.com/two');

  const tokenCalls = fetchImpl.calls.filter((call) => call.url.includes('/token'));
  assert.equal(tokenCalls.length, 1, 'the token is cached, not fetched per call');
  assert.match(tokenCalls[0].body, /grant_type=refresh_token/);
  assert.match(tokenCalls[0].body, /refresh_token=c/);
  assert.equal(fetchImpl.calls.at(-1).headers.authorization, 'Bearer ya29.test');
});

test('an expired token mid-flight is refreshed once and the call retried', async () => {
  let apiCalls = 0;
  const fetchImpl = scriptedFetch([
    ['oauth2.googleapis.com/token', TOKEN],
    ['gmail.googleapis.com', () => {
      apiCalls += 1;
      return apiCalls === 1 ? { status: 401, body: { error: { message: 'Invalid Credentials' } } } : { body: { ok: true } };
    }],
  ]);
  const client = createOauthClient({ clientId: 'a', clientSecret: 'b', refreshToken: 'c', fetchImpl });

  const result = await client.call('https://gmail.googleapis.com/messages');
  assert.deepEqual(result, { ok: true });
  assert.equal(fetchImpl.calls.filter((call) => call.url.includes('/token')).length, 2, 'one refresh, not a loop');
});

test('without credentials nothing is attempted at all', async () => {
  const fetchImpl = scriptedFetch([['x', { body: {} }]]);
  const client = createOauthClient({ fetchImpl });
  assert.equal(client.configured, false);
  await assert.rejects(() => client.accessToken(), (error) => error.code === 'source-not-configured');
  assert.equal(fetchImpl.calls.length, 0);
});

test('a service account signs a JWT assertion rather than sending a key', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const fetchImpl = scriptedFetch([['oauth2.googleapis.com/token', TOKEN]]);

  const client = createServiceAccountClient({
    email: 'bellavigna@project.iam.gserviceaccount.com',
    privateKey: pem,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    fetchImpl,
  });
  assert.equal(client.configured, true);
  await client.accessToken();

  const body = new URLSearchParams(fetchImpl.calls[0].body);
  assert.equal(body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  const [header, claims] = body.get('assertion').split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { alg: 'RS256', typ: 'JWT' });
  const parsed = JSON.parse(Buffer.from(claims, 'base64url').toString());
  assert.equal(parsed.iss, 'bellavigna@project.iam.gserviceaccount.com');
  assert.equal(parsed.scope, 'https://www.googleapis.com/auth/calendar');
  assert.equal(body.get('assertion').split('.').length, 3, 'and it is actually signed');
  assert.equal(String(fetchImpl.calls[0].body).includes('BEGIN PRIVATE KEY'), false, 'the key never leaves');
});

test('a key with escaped newlines, as an environment variable carries it, still signs', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n');
  const fetchImpl = scriptedFetch([['oauth2.googleapis.com/token', TOKEN]]);
  const client = createServiceAccountClient({ email: 'a@b.iam', privateKey: pem, scopes: ['x'], fetchImpl });
  await client.accessToken();
  assert.equal(fetchImpl.calls.length, 1);
});

test('a network failure is a retryable error with the host in it', async () => {
  const fetchImpl = async () => { throw new Error('ECONNRESET'); };
  await assert.rejects(
    () => googleFetch('https://gmail.googleapis.com/x', { fetchImpl }),
    (error) => error instanceof GoogleError && error.retryable && /gmail\.googleapis\.com/.test(error.message),
  );
});

/* ── The Gmail mailbox ───────────────────────────────────────────────────── */

/**
 * A QuoVai notification as Gmail hands it over, for Bella Vigna by default.
 * `property` names the house in "Struttura", which is what the parser checks.
 */
const gmailMessage = (id, {
  subject = '🔔 Prenotazione per Bella Vigna', reference = '111', html = false, property = 'Bella Vigna Firenze',
} = {}) => ({
  id,
  threadId: `t-${id}`,
  internalDate: '1759449600000',
  payload: {
    headers: [
      { name: 'Subject', value: subject },
      { name: 'From', value: 'QuoVai <no-reply@quovai.com>' },
      { name: 'Message-Id', value: `<${id}@quovai.com>` },
    ],
    mimeType: html ? 'multipart/alternative' : 'text/plain',
    ...(html
      ? {
        parts: [
          { mimeType: 'text/plain', body: { data: Buffer.from('versione testo').toString('base64url') } },
          {
            mimeType: 'text/html',
            body: {
              data: Buffer.from(`<p>NEW</p><table><tr><td>Numero prenotazione</td><td>${reference}</td></tr>`
                + `<tr><td>Struttura</td><td>${property}</td></tr>`
                + '<tr><td>Nome</td><td>Marta</td></tr><tr><td>Cognome</td><td>Venturi</td></tr>'
                + '<tr><td>Check-in</td><td>12/10/2026</td></tr><tr><td>Check-out</td><td>15/10/2026</td></tr>'
                + '<tr><td>Adulti</td><td>2</td></tr><tr><td>Camera</td><td>Deluxe</td></tr>'
                + '<tr><td>E-Mail</td><td>marta@guest.booking.com</td></tr></table>').toString('base64url'),
            },
          },
        ],
      }
      : {
        body: {
          data: Buffer.from([
            'NEW', '', `Numero prenotazione: ${reference}`, `Struttura: ${property}`,
            'Agenzia/Canale: Booking.com', 'Nome: Marta', 'Cognome: Venturi',
            'Check-in: 12/10/2026', 'Check-out: 15/10/2026', 'Adulti: 2', 'Bambini: 0',
            'E-Mail: marta@guest.booking.com', 'Camera Deluxe - Matrimoniale',
          ].join('\n')).toString('base64url'),
        },
      }),
  },
});

test('the Gmail mailbox is implemented and says what it is waiting for', () => {
  const mailbox = createGmailMailbox({});
  assert.equal(mailbox.implemented, true);
  assert.equal(mailbox.configured, false);
  assert.deepEqual(mailbox.requires, ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN']);
  assert.ok(mailbox.scopes.every((scope) => scope.startsWith('https://www.googleapis.com/auth/gmail')));

  const configured = createGmailMailbox(CREDENTIALS);
  assert.equal(configured.configured, true);
  assert.equal(configured.query, 'from:quovai newer_than:7d', 'a sensible default query');
});

test('an unconfigured mailbox refuses rather than returning an empty inbox', async () => {
  const mailbox = createGmailMailbox({});
  await assert.rejects(() => mailbox.fetchMessages(), (error) => error.code === 'source-not-configured');
  assert.deepEqual(await mailbox.check(), { ok: false, reason: 'credentials-missing' });
});

test('the mailbox pages through the list and fetches every body', async () => {
  const fetchImpl = scriptedFetch([
    ['oauth2.googleapis.com/token', TOKEN],
    ['/messages?', (n, { url }) => (url.includes('pageToken=page2')
      ? { body: { messages: [{ id: 'm3' }] } }
      : { body: { messages: [{ id: 'm1' }, { id: 'm2' }], nextPageToken: 'page2' } })],
    ['/messages/m1', { body: gmailMessage('m1', { reference: '111' }) }],
    ['/messages/m2', { body: gmailMessage('m2', { reference: '222' }) }],
    ['/messages/m3', { body: gmailMessage('m3', { reference: '333' }) }],
  ]);

  const mailbox = createGmailMailbox({ ...CREDENTIALS, gmailQuery: 'from:quovai', fetchImpl });
  const messages = await mailbox.fetchMessages();

  assert.equal(messages.length, 3);
  assert.equal(messages[0].messageId, '<m3@quovai.com>', 'oldest first: a NEW before its MODIFIED');
  assert.ok(fetchImpl.calls.some((call) => call.url.includes('pageToken=page2')), 'it followed the page token');
  assert.ok(fetchImpl.calls.some((call) => call.url.includes('q=from%3Aquovai')), 'and used the configured query');
});

test('a message that cannot be fetched is skipped, not fatal, and not marked', async () => {
  const fetchImpl = scriptedFetch([
    ['oauth2.googleapis.com/token', TOKEN],
    ['/messages?', { body: { messages: [{ id: 'good' }, { id: 'bad' }] } }],
    ['/messages/good', { body: gmailMessage('good') }],
    ['/messages/bad', { status: 500, body: { error: { message: 'Backend Error' } } }],
  ]);

  const mailbox = createGmailMailbox({ ...CREDENTIALS, fetchImpl });
  const messages = await mailbox.fetchMessages();

  assert.equal(messages.length, 1, 'the readable one still comes through');
  assert.equal(messages[0].messageId, '<good@quovai.com>');
  assert.equal(mailbox.state().skipped.length, 1);
  assert.equal(mailbox.state().skipped[0].id, 'bad');
});

test('a Gmail message becomes exactly what the parser expects', () => {
  const normalised = normaliseMessage(gmailMessage('m1', { html: true, reference: '987' }));
  assert.equal(normalised.messageId, '<m1@quovai.com>');
  assert.equal(normalised.subject, '🔔 Prenotazione per Bella Vigna');
  assert.match(normalised.from, /quovai/);
  assert.match(normalised.html, /Numero prenotazione/);
  assert.equal(normalised.gmailId, 'm1');
  assert.equal(new Date(normalised.receivedAt).getTime(), 1759449600000);
});

test('bodies are found wherever MIME hides them', () => {
  const nested = {
    mimeType: 'multipart/mixed',
    parts: [{
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/plain', body: { data: Buffer.from('testo').toString('base64url') } },
        { mimeType: 'text/html', body: { data: Buffer.from('<p>html</p>').toString('base64url') } },
      ],
    }],
  };
  assert.deepEqual(extractBodies(nested), { text: 'testo', html: '<p>html</p>' });

  const flat = { mimeType: 'text/plain', body: { data: Buffer.from('solo testo').toString('base64url') } };
  assert.equal(extractBodies(flat).text, 'solo testo');
  assert.deepEqual(extractBodies(undefined), { text: '', html: '' });
});

test('a Gmail poll creates reservations, and polling again creates none', async () => {
  const db = store();
  const answers = [
    ['oauth2.googleapis.com/token', TOKEN],
    ['/messages?', { body: { messages: [{ id: 'm1' }] } }],
    ['/messages/m1', { body: gmailMessage('m1', { reference: '5312447891' }) }],
  ];

  const first = await pollMailbox({
    store: db, ingest: ingestMessages,
    mailbox: createGmailMailbox({ ...CREDENTIALS, fetchImpl: scriptedFetch(answers) }),
  });
  assert.equal(first.created, 1);

  const second = await pollMailbox({
    store: db, ingest: ingestMessages,
    mailbox: createGmailMailbox({ ...CREDENTIALS, fetchImpl: scriptedFetch(answers) }),
  });
  assert.equal(second.duplicates, 1, 'the same notification is recognised');
  assert.equal((await db.reservations.list({})).length, 1);
  assert.equal((await db.deliveries.list({})).length, 1, 'and one guest email, not two');

  const [reservation] = await db.reservations.list({});
  assert.deepEqual(reservation.rooms, ['Deluxe'], 'in a Bella Vigna room');
});

test('a LunArt notification in the same mailbox is refused, and staff are told', async () => {
  // One QuoVai account, two properties: the mailbox query can let the other
  // house's bookings through. None of its guests may become a Bella Vigna guest.
  const db = store();
  const fetchImpl = scriptedFetch([
    ['oauth2.googleapis.com/token', TOKEN],
    ['/messages?', { body: { messages: [{ id: 'ours' }, { id: 'theirs' }] } }],
    ['/messages/ours', { body: gmailMessage('ours', { reference: '4401' }) }],
    ['/messages/theirs', { body: gmailMessage('theirs', { reference: '4402', property: 'LUNART', subject: '🔔 Prenotazione per LunArt' }) }],
    ['/modify', { body: {} }],
  ]);

  const mailbox = createGmailMailbox({ ...CREDENTIALS, gmailProcessedLabelId: 'Label_1', fetchImpl });
  const result = await pollMailbox({ store: db, mailbox, ingest: ingestMessages });

  assert.equal(result.created, 1, 'our own booking goes in');
  const references = (await db.reservations.list({})).map((r) => r.booking_reference);
  assert.deepEqual(references, ['4401'], 'and LunArt’s does not');
  assert.equal((await db.deliveries.list({})).length, 1, 'nobody of theirs is sent our guide');

  const alert = (await db.alerts.open()).find((entry) => entry.kind === 'other-property-notification');
  assert.ok(alert, 'staff learn the mailbox query is letting the other house through');
  assert.equal(JSON.stringify(alert.detail).includes('Venturi'), false, 'without the other guest’s details');

  const marked = fetchImpl.calls.filter((call) => call.url.includes('/modify')).map((call) => call.url);
  assert.ok(marked.every((url) => !url.includes('/messages/theirs/')), 'and it is not marked as read for us');
});

test('only the messages that were ingested are marked processed', async () => {
  const db = store();
  const fetchImpl = scriptedFetch([
    ['oauth2.googleapis.com/token', TOKEN],
    ['/messages?', { body: { messages: [{ id: 'good' }, { id: 'junk' }] } }],
    ['/messages/good', { body: gmailMessage('good', { reference: '777' }) }],
    ['/messages/junk', { body: {
      id: 'junk', internalDate: '1759449600000',
      payload: {
        headers: [{ name: 'Subject', value: '🔔 Prenotazione per Bella Vigna' }, { name: 'Message-Id', value: '<junk@q>' }],
        body: { data: Buffer.from('NEW\nnessun numero di prenotazione').toString('base64url') },
      },
    } }],
    ['/modify', { body: { id: 'good' } }],
  ]);

  const mailbox = createGmailMailbox({ ...CREDENTIALS, gmailProcessedLabelId: 'Label_1', fetchImpl });
  const result = await pollMailbox({ store: db, mailbox, ingest: ingestMessages });

  assert.equal(result.created, 1);
  assert.equal(result.failed, 1);
  const modified = fetchImpl.calls.filter((call) => call.url.includes('/modify'));
  assert.equal(modified.length, 1, 'one message marked');
  assert.ok(modified[0].url.includes('/messages/good/modify'), 'and it is the one that worked');
});

test('a failed poll leaves everything exactly where it was', async () => {
  const db = store();
  const mailbox = createGmailMailbox({
    ...CREDENTIALS,
    fetchImpl: scriptedFetch([
      ['oauth2.googleapis.com/token', TOKEN],
      ['/messages?', { status: 503, body: { error: { message: 'Service Unavailable' } } }],
    ]),
  });

  const result = await pollMailbox({ store: db, mailbox, ingest: ingestMessages });
  assert.equal(result.ok, false);
  assert.equal((await db.reservations.list({})).length, 0, 'nothing invented from a failure');
});

test('the mailbox registry reports what each option needs', () => {
  const options = mailboxSources({});
  const gmail = options.find((option) => option.id === 'gmail');
  assert.equal(gmail.implemented, true);
  assert.equal(gmail.configured, false);
  assert.equal(createMailbox({ mailboxSource: 'gmail', ...CREDENTIALS }).configured, true);
  assert.equal(createMailbox({ mailboxSource: 'nonsense' }), null);
});

/* ── Sending the guide email ─────────────────────────────────────────────── */

test('the message is a correct multipart/alternative with both bodies', () => {
  const mime = buildMimeMessage({
    to: 'marta@guest.booking.com',
    from: 'guida@example.invalid',
    subject: 'La tua Bella Vigna Guest Guide',
    text: 'Ciao Marta',
    html: '<p>Ciao Marta</p>',
  });

  // The property's own name on the inbox line, whatever account sends it.
  assert.match(mime, /^From: Bella Vigna Firenze <guida@example\.invalid>\r\n/);
  assert.match(mime, /\r\nTo: marta@guest\.booking\.com\r\n/);
  assert.match(mime, /Content-Type: multipart\/alternative; boundary="bellavigna-/);
  assert.match(mime, /Content-Type: text\/plain; charset="UTF-8"/);
  assert.match(mime, /Content-Type: text\/html; charset="UTF-8"/);

  const boundary = /boundary="([^"]+)"/.exec(mime)[1];
  assert.equal(mime.split(`--${boundary}`).length, 4, 'two parts and a closing delimiter');
  assert.ok(mime.includes(Buffer.from('Ciao Marta', 'utf8').toString('base64')));
});

test('a subject with accents survives the trip', () => {
  assert.equal(encodeHeader('La tua guida'), 'La tua guida');
  const encoded = encodeHeader('Perché è pronta');
  assert.match(encoded, /^=\?UTF-8\?B\?/);
  assert.equal(Buffer.from(encoded.slice(10, -2), 'base64').toString('utf8'), 'Perché è pronta');
});

test('a configured Gmail sender actually sends, and says it was not simulated', async () => {
  const fetchImpl = scriptedFetch([
    ['oauth2.googleapis.com/token', TOKEN],
    ['/messages/send', { body: { id: 'sent-1', threadId: 'thread-1' } }],
  ]);
  const mailer = createGmailMailer({ ...CREDENTIALS, mailFrom: 'guida@example.invalid', fetchImpl });

  const result = await mailer.send({ to: 'marta@example.invalid', subject: 'Prova', text: 'ciao', html: '<p>ciao</p>' });
  assert.deepEqual(result, { simulated: false, id: 'sent-1', threadId: 'thread-1' });

  const sent = fetchImpl.calls.find((call) => call.url.includes('/messages/send'));
  const raw = Buffer.from(JSON.parse(sent.body).raw, 'base64url').toString('utf8');
  assert.match(raw, /To: marta@example\.invalid/);
  assert.match(raw, /From: Bella Vigna Firenze <guida@example\.invalid>/);
  assert.equal(mailer.state().sent, 1);
});

test('a send that fails throws, so the delivery is retried rather than marked sent', async () => {
  const db = store();
  const fetchImpl = scriptedFetch([
    ['oauth2.googleapis.com/token', TOKEN],
    ['/messages/send', { status: 500, body: { error: { message: 'Backend Error' } } }],
  ]);
  const mailer = createGmailMailer({ ...CREDENTIALS, mailFrom: 'guida@example.invalid', fetchImpl });

  const reservation = await db.reservations.create(buildReservation({
    source: 'quovai', booking_reference: 'MAIL-1', first_name: 'Marta', last_name: 'Venturi',
    guest_email: 'marta@example.invalid', check_in: '2026-10-12', check_out: '2026-10-15',
  }));
  await scheduleGuideEmail({ store: db, reservation, now: new Date('2026-10-09T09:00:00Z') });

  const [failed] = await sendDueGuideEmails({ store: db, mailer, origin: 'https://g.example', now: new Date('2026-10-09T09:00:00Z') });
  assert.equal(failed.status, DELIVERY_STATUS.failed);
  assert.match(failed.error, /Backend Error/);
  assert.equal(failed.attempts, 1);

  // The next run retries it, and this time it works.
  const working = createGmailMailer({
    ...CREDENTIALS,
    mailFrom: 'guida@example.invalid',
    fetchImpl: scriptedFetch([['oauth2.googleapis.com/token', TOKEN], ['/messages/send', { body: { id: 'ok' } }]]),
  });
  const [sent] = await sendDueGuideEmails({ store: db, mailer: working, origin: 'https://g.example', now: new Date('2026-10-09T10:00:00Z') });
  assert.equal(sent.status, DELIVERY_STATUS.sent);
  assert.equal(sent.attempts, 2);

  const again = await sendDueGuideEmails({ store: db, mailer: working, origin: 'https://g.example', now: new Date('2026-10-09T11:00:00Z') });
  assert.equal(again.length, 0, 'and it is not sent a third time');
});

test('choosing Gmail without credentials falls back to simulated rather than failing every send', () => {
  const mailer = createMailer({ mailProvider: 'gmail' });
  assert.equal(mailer.id, 'simulated');
  assert.equal(mailer.requestedProvider, 'gmail');
  assert.ok(mailer.requires.includes('GMAIL_REFRESH_TOKEN'));

  const real = createMailer({ mailProvider: 'gmail', ...CREDENTIALS, mailFrom: 'guida@example.invalid' });
  assert.equal(real.id, 'gmail');
  assert.equal(real.configured, true);

  const providers = mailProviders({});
  assert.equal(providers.find((provider) => provider.id === 'gmail').implemented, true);
});

/**
 * Bella Vigna's own state. The sending account is not decided (data/brand.js
 * leaves `mail.defaultFrom` empty on purpose), so a token on its own is not a
 * mailer: with no MAIL_FROM nothing can be sent, and every guide email stays
 * simulated rather than going out from an address nobody chose — LunArt's least
 * of all.
 */
test('with credentials but no sending address, Gmail is not a mailer and nothing leaves', async () => {
  const fetchImpl = scriptedFetch([
    ['oauth2.googleapis.com/token', TOKEN],
    ['/messages/send', { body: { id: 'must-not-happen' } }],
  ]);
  const sender = createGmailMailer({ ...CREDENTIALS, fetchImpl });
  assert.equal(sender.configured, false);
  assert.equal(sender.from, '', 'no default address is assumed');
  assert.ok(sender.requires.includes('MAIL_FROM'));
  await assert.rejects(() => sender.send({ to: 'marta@example.invalid', subject: 'x', text: 'y', html: '<p>y</p>' }),
    (error) => error.code === 'source-not-configured');
  assert.equal(fetchImpl.calls.length, 0, 'not even a token was asked for');

  const chosen = createMailer({ mailProvider: 'gmail', ...CREDENTIALS });
  assert.equal(chosen.id, 'simulated', 'the guide email is kept, not sent');
  assert.equal(chosen.requestedProvider, 'gmail');
  assert.ok(chosen.requires.includes('MAIL_FROM'), 'and the health screen can say what is missing');
});

test('a test never sends a real message', async () => {
  const mailer = createSimulatedMailer();
  const result = await mailer.send({ to: 'nobody@example.invalid', subject: 'x', text: 'y', html: '<p>y</p>' });
  assert.equal(result.simulated, true);
  assert.equal(mailer.outbox().length, 1);
  assert.equal(mailer.configured, false);
});

/* ── Web Push ────────────────────────────────────────────────────────────── */

const subscription = (endpoint) => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } });

/** A stand-in for the library, so the encryption itself is not what is under test. */
function fakeTransport(answers = {}) {
  const sent = [];
  return {
    sent,
    async sendNotification(target, payload) {
      sent.push({ endpoint: target.endpoint, payload });
      const answer = answers[target.endpoint];
      if (answer instanceof Error) throw answer;
      if (typeof answer === 'number') throw Object.assign(new Error(`push failed ${answer}`), { statusCode: answer });
      return { statusCode: 201 };
    },
  };
}

const VAPID = { vapidPublicKey: 'BPublic', vapidPrivateKey: 'private', vapidSubject: 'mailto:staff@example.invalid' };

test('with VAPID configured a notification is really sent', async () => {
  const db = store();
  const transport = fakeTransport();
  const push = createPushAdapter({ ...VAPID, pushTransport: transport });
  assert.equal(push.id, 'web-push');
  assert.equal(push.configured, true);

  await registerSubscription({ store: db, subscription: subscription('https://push.example/one') });
  const result = await notifyStaff({ store: db, push, event: 'order-new', data: { orderId: 'o1', title: 'Wine', room: 'Deluxe', amount: '110,00 €' } });

  assert.equal(result.simulated, false);
  assert.equal(result.delivered, 1);
  assert.equal(transport.sent.length, 1);
  // The same phone may hold LunArt's Staff app too, so the house comes first.
  const payload = JSON.parse(transport.sent[0].payload);
  assert.equal(payload.title, 'Bella Vigna · Wine');
  assert.equal(payload.tag, 'bella-vigna:order:o1', 'and LunArt’s order o1 never replaces ours');
  assert.equal(payload.property, 'bella-vigna');
  assert.match(payload.body, /Camera Deluxe/);
});

test('a dead endpoint is forgotten; a sulking one is kept', async () => {
  const db = store();
  const transport = fakeTransport({
    'https://push.example/gone-404': 404,
    'https://push.example/gone-410': 410,
    'https://push.example/sulking': 500,
    'https://push.example/offline': new Error('ECONNRESET'),
  });
  const push = createPushAdapter({ ...VAPID, pushTransport: transport });

  for (const endpoint of ['https://push.example/gone-404', 'https://push.example/gone-410',
    'https://push.example/sulking', 'https://push.example/offline', 'https://push.example/fine']) {
    await registerSubscription({ store: db, subscription: subscription(endpoint) });
  }
  assert.equal((await db.subscriptions.list({})).length, 5);

  const result = await notifyStaff({ store: db, push, event: 'reconciliation', data: { key: 'k', message: 'prova' } });
  assert.equal(result.removed, 2, 'only the two that are gone');

  const left = (await db.subscriptions.list({})).map((entry) => entry.endpoint).sort();
  assert.deepEqual(left, [
    'https://push.example/fine',
    'https://push.example/offline',
    'https://push.example/sulking',
  ]);
  assert.equal(push.state().removed, 2);
});

test('a notification failing never fails the thing it was about', async () => {
  const db = store();
  const push = createPushAdapter({
    ...VAPID,
    pushTransport: { async sendNotification() { throw new Error('the push service exploded'); } },
  });
  await registerSubscription({ store: db, subscription: subscription('https://push.example/boom') });

  const result = await notifyStaff({ store: db, push, event: 'order-new', data: { orderId: 'o', title: 'Brunch' } });
  assert.equal(result.ok, true, 'notifyStaff resolves rather than throwing');
  assert.equal(result.delivered, 0);
  assert.equal((await db.subscriptions.list({})).length, 1, 'and the device is still registered');
});

test('without VAPID the app still works and everything is marked simulated', async () => {
  const db = store();
  const push = createPushAdapter({});
  await registerSubscription({ store: db, subscription: subscription('https://push.example/later') });
  const result = await notifyStaff({ store: db, push, event: 'order-new', data: { orderId: 'o', title: 'Wine' } });

  assert.equal(result.simulated, true);
  assert.equal(result.devices, 1, 'registered now, usable the moment keys exist');
  assert.deepEqual(await push.check(), { ok: false, reason: 'credentials-missing' });
});

/* ── Google Calendar ─────────────────────────────────────────────────────── */

const calendarSettings = () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    googleCalendarId: 'hair@example.com',
    googleCalendarWriteId: 'bellavigna-hair@group.calendar.google.com',
    googleServiceAccountEmail: 'bellavigna@project.iam.gserviceaccount.com',
    googleServiceAccountKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
};

test('an appointment is as long as the service, in Florence time', () => {
  const beard = appointmentWindow({ date: '2026-10-12', time: '10:00', variantId: 'men-beard' });
  assert.equal(beard.minutes, 30);
  assert.equal(beard.start.toISOString(), propertyTimeToInstant('2026-10-12', '10:00').toISOString());
  assert.equal(beard.end.getTime() - beard.start.getTime(), 30 * 60_000);

  assert.equal(appointmentWindow({ date: '2026-10-12', time: '10:00', variantId: 'men-cut' }).minutes, 60);
  assert.equal(appointmentWindow({ date: '2026-10-12', time: '10:00', variantId: 'men-cut-beard' }).minutes, 60);
  for (const id of ['women-blowdry', 'women-cut-blow', 'women-evening']) {
    assert.equal(appointmentWindow({ date: '2026-10-12', time: '10:00', variantId: id }).minutes, 90, id);
  }
  assert.equal(serviceMinutes('unknown-service'), 90, 'an unknown service blocks the longest');

  // Winter and summer are different instants for the same stated hour.
  const winter = appointmentWindow({ date: '2026-01-12', time: '10:00', variantId: 'men-cut' });
  const summer = appointmentWindow({ date: '2026-07-12', time: '10:00', variantId: 'men-cut' });
  assert.equal(winter.start.toISOString(), '2026-01-12T09:00:00.000Z');
  assert.equal(summer.start.toISOString(), '2026-07-12T08:00:00.000Z');
});

test('free/busy is asked for over the right window and with both calendars', async () => {
  const fetchImpl = scriptedFetch([
    ['oauth2.googleapis.com/token', TOKEN],
    ['/freeBusy', { body: { calendars: { 'hair@example.com': { busy: [{ start: '2026-10-12T09:00:00Z', end: '2026-10-12T10:00:00Z' }] } } } }],
  ]);
  const calendar = createGoogleCalendarAdapter({ ...calendarSettings(), fetchImpl });
  assert.equal(calendar.configured, true);

  const busy = await calendar.freeBusy({ from: '2026-10-12', to: '2026-10-12' });
  assert.equal(busy.length, 1);

  const request = JSON.parse(fetchImpl.calls.find((call) => call.url.includes('/freeBusy')).body);
  assert.equal(request.timeZone, 'Europe/Rome');
  assert.equal(request.timeMin, propertyTimeToInstant('2026-10-12', '00:00').toISOString());
  assert.equal(request.timeMax, propertyTimeToInstant('2026-10-13', '00:00').toISOString());
  assert.deepEqual(request.items.map((item) => item.id), ['hair@example.com', 'bellavigna-hair@group.calendar.google.com']);
});

test('a calendar we cannot read is an error, not an empty calendar', async () => {
  const fetchImpl = scriptedFetch([
    ['oauth2.googleapis.com/token', TOKEN],
    ['/freeBusy', { body: { calendars: { 'hair@example.com': { errors: [{ reason: 'notFound' }] } } } }],
  ]);
  const calendar = createGoogleCalendarAdapter({ ...calendarSettings(), fetchImpl });
  await assert.rejects(() => calendar.freeBusy({ from: '2026-10-12', to: '2026-10-12' }),
    (error) => error.code === 'calendar-unreadable');
});

test('a confirmed booking is written with the room, the guest and the right end time', async () => {
  const fetchImpl = scriptedFetch([
    ['oauth2.googleapis.com/token', TOKEN],
    ['/events', { body: { id: 'evt_1', htmlLink: 'https://calendar.google.com/evt_1' } }],
  ]);
  const calendar = createGoogleCalendarAdapter({ ...calendarSettings(), fetchImpl });

  const written = await calendar.createEvent({
    variantId: 'women-cut-blow', serviceTitle: 'Taglio e piega', date: '2026-10-12', time: '15:00',
    room: 'Terrazza', guestName: 'Marta', phone: '+39348', orderId: 'ord-abc',
  });

  assert.equal(written.ok, true);
  assert.equal(written.id, 'evt_1');

  const body = JSON.parse(fetchImpl.calls.find((call) => call.url.includes('/events')).body);
  assert.match(body.summary, /^Bella Vigna · .* · camera Terrazza$/, 'which house, what, and where');
  assert.match(body.description, /Marta/);
  assert.match(body.description, /lavaggio/i, 'the provider is reminded there is no wash');
  assert.equal(body.start.timeZone, 'Europe/Rome');
  assert.equal(body.start.dateTime, propertyTimeToInstant('2026-10-12', '15:00').toISOString());
  assert.equal(new Date(body.end.dateTime) - new Date(body.start.dateTime), 90 * 60_000);
  assert.equal('minutes' in body, false, 'the duration is used, not sent as a field');
  assert.ok(fetchImpl.calls.some((call) => call.url.includes('bellavigna-hair%40group.calendar.google.com')),
    'written to the property’s calendar, not his own');
});

test('the same booking written twice makes one appointment', async () => {
  const fetchImpl = scriptedFetch([
    ['oauth2.googleapis.com/token', TOKEN],
    ['/events', { status: 409, body: { error: { message: 'duplicate' } } }],
  ]);
  const calendar = createGoogleCalendarAdapter({ ...calendarSettings(), fetchImpl });
  const written = await calendar.createEvent({ variantId: 'men-cut', date: '2026-10-12', time: '10:00', room: 'Deluxe', orderId: 'ord-abc' });
  assert.equal(written.ok, true);
  assert.equal(written.duplicate, true);
});

test('a cancelled appointment is deleted, and deleting it twice is still fine', async () => {
  const answers = (status) => scriptedFetch([
    ['oauth2.googleapis.com/token', TOKEN],
    ['/events/', status === 200 ? { body: {} } : { status, body: { error: { message: 'gone' } } }],
  ]);
  const ok = await createGoogleCalendarAdapter({ ...calendarSettings(), fetchImpl: answers(200) }).deleteEvent('evt_1');
  assert.deepEqual(ok, { ok: true });

  const gone = await createGoogleCalendarAdapter({ ...calendarSettings(), fetchImpl: answers(410) }).deleteEvent('evt_1');
  assert.equal(gone.ok, true);
  assert.equal(gone.alreadyGone, true);
});

test('an unconfigured calendar refuses to read and records rather than throwing on write', async () => {
  const calendar = createGoogleCalendarAdapter({});
  assert.equal(calendar.implemented, true);
  assert.equal(calendar.configured, false);
  await assert.rejects(() => calendar.freeBusy({ from: '2026-10-12', to: '2026-10-12' }),
    (error) => error.code === 'source-not-configured');

  const written = await calendar.createEvent({ variantId: 'men-cut', date: '2026-10-12', time: '10:00', room: 'Deluxe' });
  assert.equal(written.ok, false);
  assert.equal(written.reason, 'source-not-configured');
  assert.equal(written.event.minutes, 60, 'and it still says what it would have written');
  assert.equal(providerCalendars({}).every((entry) => entry.implemented && !entry.configured), true);
});

test('the calendar only ever removes slots, never adds any', async () => {
  applySchedule({ 'hair-service': { '2026-10-12': ['10:00', '11:30', '15:00'] } });

  const busyAt = (start, end) => scriptedFetch([
    ['oauth2.googleapis.com/token', TOKEN],
    ['/freeBusy', { body: { calendars: { 'hair@example.com': { busy: [{ start, end }] } } } }],
  ]);

  // Busy 11:00–12:00 in Florence takes out the 11:30.
  const calendar = createGoogleCalendarAdapter({
    ...calendarSettings(),
    fetchImpl: busyAt(propertyTimeToInstant('2026-10-12', '11:00').toISOString(), propertyTimeToInstant('2026-10-12', '12:00').toISOString()),
  });
  const narrowed = await freeSlots({ calendar, productId: 'hair-service', date: '2026-10-12', variantId: 'men-cut' });
  assert.deepEqual(narrowed.slots.map((slot) => slot.time), ['10:00', '15:00']);
  assert.equal(narrowed.source, 'calendar');

  // A day with nothing in the schedule stays empty however free he is.
  const empty = await freeSlots({ calendar, productId: 'hair-service', date: '2026-10-13' });
  assert.deepEqual(empty.slots, []);
  assert.equal(empty.source, 'schedule');

  applySchedule(MANUAL_SCHEDULE);
});

test('a longer service loses a slot a shorter one keeps', async () => {
  applySchedule({ 'hair-service': { '2026-10-12': ['10:00'] } });
  const calendar = createGoogleCalendarAdapter({
    ...calendarSettings(),
    fetchImpl: scriptedFetch([
      ['oauth2.googleapis.com/token', TOKEN],
      ['/freeBusy', { body: { calendars: { 'hair@example.com': { busy: [{
        start: propertyTimeToInstant('2026-10-12', '10:45').toISOString(),
        end: propertyTimeToInstant('2026-10-12', '12:00').toISOString(),
      }] } } } }],
    ]),
  });

  const beard = await freeSlots({ calendar, productId: 'hair-service', date: '2026-10-12', variantId: 'men-beard' });
  assert.deepEqual(beard.slots.map((slot) => slot.time), ['10:00'], '30 minutes fits before 10:45');

  const blowdry = await freeSlots({ calendar, productId: 'hair-service', date: '2026-10-12', variantId: 'women-blowdry' });
  assert.deepEqual(blowdry.slots, [], '90 minutes does not');
  applySchedule(MANUAL_SCHEDULE);
});

test('a calendar that cannot be reached leaves the schedule alone and says so', async () => {
  applySchedule({ 'hair-service': { '2026-10-12': ['10:00', '11:30'] } });
  const calendar = createGoogleCalendarAdapter({
    ...calendarSettings(),
    fetchImpl: scriptedFetch([
      ['oauth2.googleapis.com/token', TOKEN],
      ['/freeBusy', { status: 503, body: { error: { message: 'Service Unavailable' } } }],
    ]),
  });

  const result = await freeSlots({ calendar, productId: 'hair-service', date: '2026-10-12' });
  assert.equal(result.slots.length, 2, 'the schedule still stands');
  assert.equal(result.source, 'schedule');
  assert.ok(result.calendarError);

  const check = await slotIsFree({ calendar, productId: 'hair-service', date: '2026-10-12', time: '10:00', variantId: 'men-cut' });
  assert.equal(check.free, true);
  assert.equal(check.checkedCalendar, false, 'and we know the calendar did not actually confirm it');
  applySchedule(MANUAL_SCHEDULE);
});

test('free days are the schedule’s days minus the ones entirely taken', async () => {
  applySchedule({ 'hair-service': { '2026-10-12': ['10:00'], '2026-10-13': ['10:00'] } });
  const calendar = createGoogleCalendarAdapter({
    ...calendarSettings(),
    fetchImpl: scriptedFetch([
      ['oauth2.googleapis.com/token', TOKEN],
      ['/freeBusy', (n, { options }) => {
        const asked = JSON.parse(options.body).timeMin;
        const busyAll = asked.startsWith(propertyTimeToInstant('2026-10-12', '00:00').toISOString().slice(0, 10));
        return { body: { calendars: { 'hair@example.com': { busy: busyAll
          ? [{ start: propertyTimeToInstant('2026-10-12', '00:00').toISOString(), end: propertyTimeToInstant('2026-10-13', '00:00').toISOString() }]
          : [] } } } };
      }],
    ]),
  });

  const days = await freeDays({ calendar, productId: 'hair-service' });
  assert.deepEqual(days, ['2026-10-13']);
  applySchedule(MANUAL_SCHEDULE);
});

/* ── The scheduler ───────────────────────────────────────────────────────── */

test('a job already running is not started again', async () => {
  let running = 0;
  let peak = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });

  const scheduler = createScheduler({
    jobs: [{ id: 'slow', intervalMinutes: 1, run: async () => { running += 1; peak = Math.max(peak, running); await gate; running -= 1; return { ok: true }; } }],
  });

  const first = scheduler.runJob('slow');
  const second = await scheduler.runJob('slow');
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'already-running');

  release();
  await first;
  assert.equal(peak, 1, 'never two at once');
  assert.equal(scheduler.state()[0].skippedBecauseRunning, 1);
});

test('a failing job backs off and recovers, and never throws at the caller', async () => {
  let attempts = 0;
  const scheduler = createScheduler({
    jobs: [{ id: 'flaky', intervalMinutes: 1, run: async () => { attempts += 1; if (attempts <= 2) throw new Error('upstream down'); return { done: true }; } }],
    logger: { warn() {} },
  });

  const first = await scheduler.runJob('flaky');
  assert.equal(first.ok, false);
  assert.equal(first.error, 'upstream down');
  assert.equal(scheduler.state()[0].status, 'failing');
  assert.equal(scheduler.state()[0].backingOff, true);

  // The next tick is skipped by the backoff rather than hammering the provider.
  const skipped = await scheduler.runJob('flaky');
  assert.equal(skipped.reason, 'backing-off');
  assert.equal(attempts, 1);

  await scheduler.runJob('flaky', { force: true });   // second failure
  const recovered = await scheduler.runJob('flaky', { force: true });
  assert.equal(recovered.ok, true);
  const state = scheduler.state()[0];
  assert.equal(state.status, 'operational');
  assert.equal(state.consecutiveFailures, 0);
  assert.equal(state.backingOff, false);
  assert.equal(state.failures, 2);
  assert.deepEqual(state.lastResult, { done: true });
});

test('a job with no interval is disabled rather than broken', () => {
  const scheduler = createScheduler({
    jobs: [
      { id: 'off', intervalMinutes: 0, run: async () => ({}) },
      { id: 'on', intervalMinutes: 5, run: async () => ({}) },
    ],
  });
  const state = Object.fromEntries(scheduler.state().map((job) => [job.id, job]));
  assert.equal(state.off.enabled, false);
  assert.equal(state.off.status, 'disabled');
  assert.equal(state.on.enabled, true);
  assert.equal(state.on.intervalMinutes, 5);

  scheduler.start();
  scheduler.stop();
});

test('an unknown job is a refusal, not a crash', async () => {
  const scheduler = createScheduler({ jobs: [] });
  assert.deepEqual(await scheduler.runJob('nope'), { ok: false, reason: 'unknown-job' });
  assert.equal(scheduler.has('nope'), false);
});

/* ── Checkout fails closed on the hair calendar ──────────────────────────── */

/**
 * Four cases, one rule: once a real calendar is configured, money only moves on a
 * slot free/busy has just confirmed. The third is the one worth having — a calendar
 * that cannot be read must stop the payment, not be shrugged off.
 *
 * The server here is configured as production is: placeholder prices refused. At
 * Bella Vigna that alone refuses every haircut today — LunArt's figures are not
 * confirmed for it — which is the first test. The four after it are about the
 * calendar, so they run with the prices confirmed (`asIfConfirmed`) for their
 * length, and put back after.
 */

const soon = () => addDays(propertyDate(), 3);

/** A calendar adapter with a scripted free/busy, and nothing else pretending. */
const fakeCalendar = ({ busy = [], fail = null, configured = true } = {}) => ({
  id: 'google-calendar',
  implemented: true,
  configured,
  requires: ['GOOGLE_CALENDAR_ID'],
  writeCalendar: 'Bella Vigna Hair Bookings',
  timeZone: 'Europe/Rome',
  calls: 0,
  state: () => ({ lastError: fail ? String(fail.message ?? fail) : null }),
  async freeBusy() {
    this.calls += 1;
    if (fail) throw Object.assign(new Error(String(fail.message ?? fail)), { code: fail.code ?? 'unavailable' });
    return busy;
  },
  async createEvent() { return { ok: true, id: 'evt' }; },
  async deleteEvent() { return { ok: true }; },
  eventFor: () => ({}),
  check: async () => ({ ok: !fail }),
});

/** A Stripe that records whether it was ever asked to take money. */
function spyingStripe() {
  const mock = createMockStripe();
  const sessions = [];
  return {
    ...mock,
    sessions,
    createCheckoutSession: (...args) => { sessions.push(args[0]); return mock.createCheckoutSession(...args); },
  };
}

async function hairServer({ calendar, date }, t) {
  applySchedule({ 'hair-service': { [date]: ['10:00', '15:00'] } });
  const db = store();
  const stripe = spyingStripe();
  const app = await createApp({
    store: db,
    stripe,
    providerCalendar: calendar,
    allowPlaceholderPrices: false,
    useDevPrices: false,
    seed: false,
    cardSigningKey: 'fail-closed-test',
    staffToken: '',
    mode: 'development',
    publicUrl: 'http://127.0.0.1',
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const book = async (time = '10:00') => {
    const response = await fetch(`${base}/api/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: [{
          productId: 'hair-service', variantId: 'men-cut', quantity: 1,
          date, time, room: 'Deluxe',
          fields: { guestName: 'Marta Venturi', phone: '+39 348 112 4455' },
        }],
        customer: { name: 'Marta Venturi', email: 'marta@example.invalid' },
        lang: 'it',
      }),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    server.close();
    applySchedule(MANUAL_SCHEDULE);
  };
  // Closed even when an assertion fails half-way, so a red test cannot leave a
  // listener holding the whole file open.
  t.after(close);
  return { app, db, stripe, base, book, close };
}

test('on Bella Vigna’s production settings a haircut is refused for its price before the calendar is asked', async (t) => {
  const date = soon();
  const calendar = fakeCalendar({ busy: [] });
  const { stripe, db, book } = await hairServer({ calendar, date }, t);

  const refused = await book('10:00');
  assert.equal(refused.status, 422, JSON.stringify(refused.body));
  assert.equal(refused.body.error, 'cart-invalid');
  assert.ok(refused.body.errors.some((e) => e.code === 'price-not-confirmed' && e.sku === 'hair-service:men-cut'),
    'LunArt’s figure is not Bella Vigna’s price yet');
  assert.equal(calendar.calls, 0, 'nobody asks his calendar about a booking that cannot be sold');
  assert.equal(stripe.sessions.length, 0);
  assert.equal((await db.orders.list({})).length, 0);
});

test('a configured calendar with the slot free lets the payment through', async (t) => {
  t.after(asIfConfirmed());
  const date = soon();
  const calendar = fakeCalendar({ busy: [] });
  const { stripe, db, book, close } = await hairServer({ calendar, date }, t);

  const result = await book('10:00');
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.ok(result.body.checkoutUrl, 'there is somewhere to pay');
  assert.equal(stripe.sessions.length, 1, 'and the session was created');
  assert.equal((await db.orders.list({})).length, 1);
  assert.ok(calendar.calls >= 1, 'the calendar was actually asked');
  close();
});

test('a configured calendar with the slot busy refuses with slot-taken', async (t) => {
  t.after(asIfConfirmed());
  const date = soon();
  const calendar = fakeCalendar({
    busy: [{
      start: propertyTimeToInstant(date, '09:30').toISOString(),
      end: propertyTimeToInstant(date, '11:00').toISOString(),
    }],
  });
  const { stripe, db, book, close } = await hairServer({ calendar, date }, t);

  const taken = await book('10:00');
  assert.equal(taken.status, 409);
  assert.equal(taken.body.error, 'slot-taken');
  assert.equal(stripe.sessions.length, 0, 'nothing was sent to Stripe');
  assert.equal((await db.orders.list({})).length, 0, 'and no order exists');

  // The afternoon is still free, and still sells.
  const free = await book('15:00');
  assert.equal(free.status, 200, JSON.stringify(free.body));
  assert.equal(stripe.sessions.length, 1);
  close();
});

test('a calendar that cannot be read stops the payment entirely', async (t) => {
  t.after(asIfConfirmed());
  const date = soon();
  const calendar = fakeCalendar({ fail: Object.assign(new Error('free/busy refused: 503'), { code: 'unavailable' }) });
  const { app, stripe, db, book, close } = await hairServer({ calendar, date }, t);

  const blocked = await book('10:00');
  assert.equal(blocked.status, 503);
  assert.equal(blocked.body.error, 'availability-temporarily-unavailable');
  assert.equal(blocked.body.retryable, true);

  assert.equal(stripe.sessions.length, 0, 'no Stripe Checkout Session was created');
  assert.equal((await db.orders.list({})).length, 0, 'no order was written');

  // Staff are told, because a refused booking is a lost sale somebody should see.
  const alerts = await db.alerts.open();
  const raised = alerts.find((alert) => alert.kind === 'provider-calendar-unavailable');
  assert.ok(raised, 'an alert was raised');
  assert.match(raised.detail.message, /non raggiungibile/);

  // And a second attempt is one alert with a count, not a second row.
  await book('10:00');
  const again = await db.alerts.open();
  assert.equal(again.filter((alert) => alert.kind === 'provider-calendar-unavailable').length, 1);
  assert.ok(again.find((alert) => alert.kind === 'provider-calendar-unavailable').seen >= 2);
  close();
});

test('with no calendar configured the manual schedule is still the whole truth', async (t) => {
  t.after(asIfConfirmed());
  const date = soon();
  // Configured: false — and it would throw if anything asked it anything.
  const calendar = fakeCalendar({ configured: false, fail: new Error('must not be called') });
  const { stripe, db, book, close } = await hairServer({ calendar, date }, t);

  const sold = await book('10:00');
  assert.equal(sold.status, 200, JSON.stringify(sold.body));
  assert.equal(stripe.sessions.length, 1);
  assert.equal((await db.orders.list({})).length, 1);
  assert.equal(calendar.calls, 0, 'the calendar was never consulted');

  // An hour the schedule does not offer is still refused, exactly as before.
  const notOffered = await book('18:00');
  assert.equal(notOffered.status, 422, JSON.stringify(notOffered.body));
  assert.equal(notOffered.body.error, 'cart-invalid');
  assert.ok(notOffered.body.errors.some((error) => error.code === 'slot-unavailable'));
  assert.equal(stripe.sessions.length, 1, 'still only the one payment');
  close();
});

test('the browsing check stays tolerant while the checkout check does not', async () => {
  const date = soon();
  applySchedule({ 'hair-service': { [date]: ['10:00'] } });
  const calendar = fakeCalendar({ fail: new Error('Google is down') });

  // Browsing: the schedule stands, and says the calendar did not confirm it.
  const browsing = await slotIsFree({ calendar, productId: 'hair-service', date, time: '10:00', variantId: 'men-cut' });
  assert.equal(browsing.free, true);
  assert.equal(browsing.checkedCalendar, false);

  // Checkout: the same situation is a refusal.
  const paying = await verifySlotForCheckout({ calendar, productId: 'hair-service', date, time: '10:00', variantId: 'men-cut' });
  assert.equal(paying.ok, false);
  assert.equal(paying.reason, 'availability-temporarily-unavailable');
  assert.equal(paying.verified, false);

  // And an hour nobody offers is refused before the calendar is even asked.
  const unoffered = await verifySlotForCheckout({ calendar, productId: 'hair-service', date, time: '23:00', variantId: 'men-cut' });
  assert.equal(unoffered.reason, 'slot-taken');
  assert.equal(unoffered.source, 'schedule');

  applySchedule(MANUAL_SCHEDULE);
});

/* ── Stripe, when the account is shared ──────────────────────────────────── */

/**
 * Two properties may end up on one Stripe account, and then each webhook endpoint
 * receives the other's events. Every session and payment this server creates is
 * tagged `property: 'bella-vigna'`, and an event tagged for anybody else is
 * acknowledged and remembered — so Stripe stops retrying it here — and touches
 * nothing. Proved with a real order, so "touches nothing" means something: the
 * LunArt-tagged event names this order's own id and session, and still moves
 * nothing, while the same payment tagged for Bella Vigna is processed.
 */
test('a payment event tagged for LunArt touches no order here, and one tagged for Bella Vigna does', async (t) => {
  const db = store();
  const stripe = createMockStripe();
  const app = await createApp({
    store: db,
    stripe,
    allowPlaceholderPrices: true,     // the preview, so LunArt's figures can be bought with test money
    useDevPrices: false,
    seed: false,
    cardSigningKey: 'tenant-test',
    staffToken: '',
    mode: 'development',
    publicUrl: 'http://127.0.0.1',
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${base}/api/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      lines: [{ productId: 'wine-in-room', variantId: 'brunello', quantity: 1, date: addDays(propertyDate(), 3), slotId: 'w-1900', room: 'Deluxe' }],
      customer: { name: 'Marta Venturi', email: 'marta@example.invalid' },
      lang: 'it',
    }),
  });
  const checkout = await response.json();
  assert.equal(response.status, 200, JSON.stringify(checkout));

  const order = await db.orders.findByAccessToken(checkout.accessToken);
  assert.equal(order.status, 'pending', 'created, not yet paid');
  assert.equal(app.settings.propertyId, 'bella-vigna', 'the tenant this server answers for');

  // The session this server created says whose it is.
  const session = await stripe.retrieveSession(order.stripe_session_id);
  assert.equal(session.metadata.property, 'bella-vigna');

  const ctx = { store: db, stripe, settings: app.settings };
  const paid = (property, id) => ({
    id,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: order.stripe_session_id,
        payment_intent: order.stripe_payment_intent_id,
        metadata: { order_id: order.id, property },
      },
    },
  });

  // LunArt's event, even naming this order's own id and session, is not ours.
  const theirs = await handleStripeEvent(paid('lunart', 'evt_lunart_1'), ctx);
  assert.deepEqual(theirs, { ignored: true, reason: 'other-property' });
  const untouched = await db.orders.get(order.id);
  assert.equal(untouched.status, 'pending', 'no order moved');
  assert.deepEqual(untouched.events, order.events, 'and nothing was written to its history');

  // Remembered, so a Stripe retry of the same event is a no-op rather than a second look.
  assert.equal(await db.events.seen('evt_lunart_1'), true);
  assert.deepEqual(await handleStripeEvent(paid('lunart', 'evt_lunart_1'), ctx), { deduplicated: true });

  // The same payment tagged for this property is processed.
  const ours = await handleStripeEvent(paid('bella-vigna', 'evt_bella_vigna_1'), ctx);
  assert.notEqual(ours.ignored, true, JSON.stringify(ours));
  assert.equal((await db.orders.get(order.id)).status, 'paid');
});
