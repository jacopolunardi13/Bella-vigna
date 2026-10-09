/**
 * QuoVai notifications, in the shape they actually arrive.
 *
 * The shape is QuoVai's own, transcribed from the live LunArt mailbox in October
 * 2026: QuoVai sends every property the same template. The parser was written
 * against a shape nobody had seen yet and got two things wrong on contact with
 * the real thing: the guest name carries no label, and the room is in the table's
 * data rather than beside the word "Camera". Both are reproduced here exactly, so
 * neither can quietly come back.
 *
 * No Bella Vigna notification has been seen yet (`data/brand.js` and
 * `data/rooms.js` both say PROVISIONAL), so these are that real shape carrying
 * Bella Vigna's property name and Bella Vigna's rooms. The guests, booking numbers
 * and dates are the four reservations the parser was first proved against, kept
 * because what they caught is about the template and not about the house.
 *
 * Which spelling QuoVai will use for a room is not known either, so the fixtures
 * use both kinds the registry accepts: the Property Pack's names ("Camera
 * Standard", "Doppia/Tripla con Terrazza") and the bare ids ("Deluxe").
 *
 * One notification here is LunArt's own, exactly as it arrived. It is the one
 * thing in this file that must never be read: Bella Vigna and LunArt share an
 * operator, and may one day share a mailbox.
 *
 * The operational messages are real too. The same mailbox carries them, they are
 * not reservations, and they must not reach the parser at all.
 */

/**
 * The shape every reservation notification takes.
 *
 * `property` is what QuoVai prints after "Struttura"; `null` leaves the line out
 * altogether, which is how a notification that names no property looks.
 */
const notification = ({
  reference, status, name, room, rate, from, to, channel, total, quantity = 1, property = 'BELLA VIGNA',
}) => `
Numero prenotazione: ${reference} ${status}

${name}
${property === null ? '' : `\nStruttura: ${property}`}
Agenzia/Canale: ${channel}
Check-in: ${from}
Check-out: ${to}
Adulti: 2
Bambini: 0

Stanza
Tariffa
Camera
Check-in
Check-out
Quantità
Prezzo totale
Stato

${room}
${rate}

${from.slice(0, 5)}
${to.slice(0, 5)}
${quantity}
${total}
${status.toLowerCase()}
`.trim();

/** Martin Markert — the terrace room, Booking.com, a modification. */
export const MARTIN = {
  subject: '🔄 QuoVai — prenotazione modificata',
  from: 'QuoVai <noreply@quovai.com>',
  messageId: '<quovai-6230618454-mod@quovai.com>',
  body: notification({
    reference: '6230618454', status: 'MODIFIED', name: 'Martin Markert',
    room: 'Doppia/Tripla con Terrazza', rate: 'Doppia/Tripla con Terrazza /NR BB OTA',
    from: '02/10/2026', to: '03/10/2026', channel: 'BOOKING.COM', total: '142,00',
  }),
};

/** Kelly Kay — Deluxe, Booking.com, new. */
export const KELLY = {
  subject: '🔔 QuoVai — nuova prenotazione',
  from: 'QuoVai <noreply@quovai.com>',
  messageId: '<quovai-6213834462-new@quovai.com>',
  body: notification({
    reference: '6213834462', status: 'NEW', name: 'Kelly Kay',
    room: 'Camera Deluxe', rate: 'Camera Deluxe /NR BB OTA',
    from: '13/10/2026', to: '14/10/2026', channel: 'BOOKING.COM', total: '168,50',
  }),
};

/** Irene Cappellini — Standard, Booking.com, new. */
export const IRENE = {
  subject: '🔔 QuoVai — nuova prenotazione',
  from: 'QuoVai <noreply@quovai.com>',
  messageId: '<quovai-6703524869-new@quovai.com>',
  body: notification({
    reference: '6703524869', status: 'NEW', name: 'Irene Cappellini',
    room: 'Camera Standard', rate: 'Camera Standard /NR BB OTA',
    from: '07/11/2026', to: '08/11/2026', channel: 'BOOKING.COM', total: '175,86',
  }),
};

/** Florian Tinsley — Deluxe under its bare id, Expedia, new, four nights. */
export const FLORIAN = {
  subject: '🔔 QuoVai — nuova prenotazione',
  from: 'QuoVai <noreply@quovai.com>',
  messageId: '<quovai-2568875469-new@quovai.com>',
  body: notification({
    reference: '2568875469', status: 'NEW', name: 'Florian Tinsley',
    room: 'Deluxe', rate: 'Deluxe /Tariffa Expedia NR',
    from: '29/05/2027', to: '02/06/2027', channel: 'EXPEDIA', total: '612,40', quantity: 4,
  }),
};

/** The same stay as Irene's, called off. */
export const IRENE_CANCELLED = {
  subject: '⛔ QuoVai — cancellazione',
  from: 'QuoVai <noreply@quovai.com>',
  messageId: '<quovai-6703524869-cancel@quovai.com>',
  body: notification({
    reference: '6703524869', status: 'CANCELLED', name: 'Irene Cappellini',
    room: 'Camera Standard', rate: 'Camera Standard /NR BB OTA',
    from: '07/11/2026', to: '08/11/2026', channel: 'BOOKING.COM', total: '175,86',
  }),
};

/* ── Whose notification it is ──────────────────────────────────────────────── */

/**
 * LunArt's notification for Kelly Kay, exactly as it arrived at LunArt: room 305,
 * "Struttura: LUNART".
 *
 * Everything in it would parse — a booking number, a name, dates, a room row — and
 * that is the danger. Read here, it would give a LunArt guest a Bella Vigna link, a
 * Bella Vigna Pass and a Bella Vigna email. It has its own message id because it is
 * another property's message, not a second copy of ours.
 */
export const LUNART = {
  subject: '🔔 QuoVai — nuova prenotazione',
  from: 'QuoVai <noreply@quovai.com>',
  messageId: '<quovai-lunart-6213834462-new@quovai.com>',
  body: notification({
    reference: '6213834462', status: 'NEW', name: 'Kelly Kay', property: 'LUNART',
    room: '305 sup', rate: '305 sup /NR BB OTA',
    from: '13/10/2026', to: '14/10/2026', channel: 'BOOKING.COM', total: '168,50',
  }),
};

/**
 * Irene's notification with no "Struttura" line at all.
 *
 * Not a shape anyone has seen, and not one to refuse: the mailbox query is what
 * scopes the messages, and a notification that names no property names no other
 * property either.
 */
export const UNNAMED_PROPERTY = {
  subject: '🔔 QuoVai — nuova prenotazione',
  from: 'QuoVai <noreply@quovai.com>',
  messageId: '<quovai-6703524869-unnamed@quovai.com>',
  body: notification({
    reference: '6703524869', status: 'NEW', name: 'Irene Cappellini', property: null,
    room: 'Camera Standard', rate: 'Camera Standard /NR BB OTA',
    from: '07/11/2026', to: '08/11/2026', channel: 'BOOKING.COM', total: '175,86',
  }),
};

/* ── A booking across every room ───────────────────────────────────────────── */

/** One row of the principal table per room, as QuoVai lays them out. */
const BINA_ROWS = {
  terrazza: ['Doppia/Tripla con Terrazza', 'Doppia/Tripla con Terrazza /NR BB OTA', '25/10', '27/10', '2', '336,00'],
  standard: ['Camera Standard', 'Camera Standard /NR BB OTA', '25/10', '27/10', '2', '302,00'],
  deluxe: ['Camera Deluxe', 'Camera Deluxe /NR BB OTA', '25/10', '27/10', '2', '308,00'],
};

const groupBooking = ({ status, order }) => `
Numero prenotazione: 5639466196 ${status}

Bina Kang

Struttura: BELLA VIGNA
Agenzia/Canale: BOOKING.COM
Check-in: 25/10/2026
Check-out: 27/10/2026
Adulti: 7
Bambini: 0

Stanza
Tariffa
Camera
Check-in
Check-out
Quantità
Prezzo totale
Stato

${order.map((key) => [...BINA_ROWS[key], status.toLowerCase()].join('\n')).join('\n\n')}

Data
Stanza
Prezzo
25/10/2026
Terrazza
168,00
25/10/2026
Standard
151,00
25/10/2026
Deluxe
154,00
26/10/2026
Terrazza
168,00
26/10/2026
Standard
151,00
26/10/2026
Deluxe
154,00

Prezzo totale: 946,00
`.trim();

/**
 * Bina Kang — seven adults across all three rooms, Booking.com, new.
 *
 * At LunArt this was the notification that proved the parser was reading one room
 * and calling it the room: seven adults across four rooms, and a guide telling them
 * they were in the first one. Here it is the same party in every room Bella Vigna
 * has. The principal table lists the terrace room first, then Standard, then
 * Deluxe — not registry order — and the per-night price table underneath repeats
 * all three once per night, so a reader that simply looked for rooms after the
 * first heading would find them twice, and one that stopped at the first would
 * tell a party of seven they were all on the terrace.
 *
 * The totals are in the same places as the single-room shape, including one that
 * reads `302,00`: at LunArt a room number anywhere outside a price column. Digits
 * are not rooms here at all, and the row rules still have to say so.
 */
export const BINA = {
  subject: '🔔 QuoVai — nuova prenotazione',
  from: 'QuoVai <noreply@quovai.com>',
  messageId: '<quovai-5639466196-new@quovai.com>',
  body: groupBooking({ status: 'NEW', order: ['terrazza', 'standard', 'deluxe'] }),
};

export const REAL_RESERVATIONS = [MARTIN, KELLY, IRENE, FLORIAN];

/** The same booking as a modification, with the rooms listed in another order. */
export const BINA_MODIFIED = {
  subject: '🔄 QuoVai — prenotazione modificata',
  from: 'QuoVai <noreply@quovai.com>',
  messageId: '<quovai-5639466196-mod@quovai.com>',
  body: groupBooking({ status: 'MODIFIED', order: ['deluxe', 'terrazza', 'standard'] }),
};

/* ── The same mailbox, carrying things that are not reservations ───────────── */

/** The police forms waiting to be filed. Operational, and not a stay. */
export const SCHEDINE = {
  subject: '8 schedine da inviare per Bella Vigna',
  from: 'QuoVai <noreply@quovai.com>',
  messageId: '<quovai-schedine-8@quovai.com>',
  body: `
Ciao,
ci sono 8 schedine da inviare per Bella Vigna.

Accedi a QuoVai per completare l'invio ad Alloggiati Web.
`.trim(),
};

export const SCHEDINE_14 = {
  ...SCHEDINE,
  subject: '14 schedine da inviare per Bella Vigna',
  messageId: '<quovai-schedine-14@quovai.com>',
  body: SCHEDINE.body.replace('8 schedine', '14 schedine'),
};

/**
 * A guest finished the online check-in.
 *
 * The subject carries the word "prenotazione" and a number, which is exactly why
 * the old classifier took it for a reservation notification: it is not one, and
 * nothing in it was ever going to parse.
 */
export const ONLINE_CHECKIN = {
  subject: 'Bella Vigna: check-in online effettuato per prenotazione 1308918 (Pelicic)',
  from: 'QuoVai <noreply@quovai.com>',
  messageId: '<quovai-checkin-1308918@quovai.com>',
  body: `
Il check-in online per la prenotazione 1308918 (Pelicic) è stato completato.

Puoi vedere i dati inseriti dall'ospite in QuoVai.
`.trim(),
};

export const OPERATIONAL = [SCHEDINE, SCHEDINE_14, ONLINE_CHECKIN];

/**
 * A genuine reservation notification that is broken.
 *
 * It says what it is — a booking number, a status, the property — and then fails
 * to give a date anyone can read. This one must still reach staff: a guest is
 * arriving whether or not the email parsed.
 */
export const MALFORMED = {
  subject: '🔔 QuoVai — nuova prenotazione',
  from: 'QuoVai <noreply@quovai.com>',
  messageId: '<quovai-broken-1@quovai.com>',
  body: `
Numero prenotazione: 9999000111 NEW

Sconosciuto Ospite

Struttura: BELLA VIGNA
Agenzia/Canale: BOOKING.COM
Check-in: ------
Check-out: ------
`.trim(),
};
