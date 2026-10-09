/**
 * Breakfast, organised as at LunArt (operator's decision, Property Pack §5):
 * at Opera Caffè in Piazza del Duomo, one ticket per person for each day the
 * booking includes breakfast.
 *
 * What is NOT stated, on purpose:
 *   - that breakfast is included for everyone — it depends on the rate plan of the
 *     booking, and the Pack asks for that to be checked before it is promised;
 *   - the hours — Bella Vigna's texts say "until 10:00", LunArt's confirmed hours at
 *     the same café are 08:30–11:00, and the two disagree;
 *   - the menu (omelette, juice, brioche…) — the ticket may not cover all of it;
 *   - the Caffè Amerini "light breakfast" of the June 2026 page, which no current
 *     source confirms;
 *   - the Opera Caffè 30% for guests, which is LunArt's agreement and not yet
 *     confirmed for Bella Vigna.
 */

export const breakfast = [
  {
    id: 'breakfast',
    section: 'breakfast',
    phase: ['staying'],
    icon: 'cup',
    priority: -15,
    title: { it: 'Dove si fa colazione', en: 'Where breakfast happens' },
    summary: {
      it: 'Se la tua tariffa comprende la colazione, la fai all’Opera Caffè in Piazza del Duomo, ai piedi del Campanile di Giotto, con un buono a persona per ogni giorno compreso.',
      en: 'If your rate includes breakfast, you have it at Opera Caffè in Piazza del Duomo, at the foot of Giotto’s bell tower, with one voucher per person for each day included.',
    },
    detail: {
      it: 'Se la colazione è compresa lo trovi scritto nella conferma della tua prenotazione; nel dubbio chiedici. I buoni te li diamo noi: uno a persona per ogni giorno di colazione compreso, da consegnare al locale.\n\nOrari e cosa comprende il buono te li confermiamo all’arrivo.',
      en: 'Whether breakfast is included is written in your booking confirmation; if in doubt, ask us. We give you the vouchers: one per person for each breakfast day included, to hand over at the café.\n\nWe confirm the hours and what the voucher covers when you arrive.',
    },
    facts: [
      { label: { it: 'Dove', en: 'Where' }, value: 'Opera Caffè · Piazza del Duomo 62R' },
      { label: { it: 'Buono', en: 'Voucher' }, value: { it: 'uno a persona, per giorno compreso', en: 'one per person, per day included' } },
    ],
    actions: [
      { kind: 'map', label: { it: 'Apri in Maps', en: 'Open in Maps' }, value: 'https://maps.app.goo.gl/uok3CmvHBLmwieoV9' },
      { kind: 'entry', label: { it: 'È compresa nella mia tariffa?', en: 'Is it in my rate?' }, value: 'contacts' },
    ],
    intents: ['breakfast'],
    verify: { level: 'blocker', field: 'orari, menu e inclusione',
      note: 'Da confermare prima della pubblicazione (Property Pack §5, §11): orario (testi BV “fino alle 10:00” contro 08:30–11:00 dell’Opera Caffè per LunArt), cosa comprende il ticket, e in quali rate plan Bella Vigna la colazione è inclusa.' },
  },
  {
    id: 'breakfast-room',
    section: 'breakfast',
    phase: ['staying'],
    icon: 'tray',
    priority: -5,
    title: { it: 'Colazione in camera', en: 'Breakfast in the room' },
    summary: {
      it: 'È un servizio in preparazione per Bella Vigna: dalla guida vedi cosa comprende, e la prenotazione si apre quando è attivo. Intanto puoi chiedercelo su WhatsApp.',
      en: 'A service being prepared for Bella Vigna: the guide shows what it includes, and booking opens once it is live. Meanwhile you can ask us on WhatsApp.',
    },
    actions: [
      { kind: 'product', label: { it: 'Vedi la colazione in camera', en: 'See breakfast in the room' }, value: 'light-breakfast' },
      { kind: 'product', label: { it: 'Vedi il brunch', en: 'See the brunch' }, value: 'brunch' },
      { kind: 'entry', label: { it: 'Chiedicelo', en: 'Ask us' }, value: 'contacts' },
    ],
    intents: ['breakfast-room'],
    verify: { level: 'blocker', field: 'servizio attivo',
      note: 'Colazione in camera e brunch: prodotti del catalogo LunArt, da confermare come applicabili a Bella Vigna (Property Pack §5) con prezzi validati. Fino ad allora i prezzi sono “placeholder” e la produzione non vende.' },
  },
  {
    id: 'breakfast-early',
    section: 'breakfast',
    phase: ['staying', 'leaving'],
    icon: 'sunrise',
    priority: -3,
    title: { it: 'Se parti prestissimo', en: 'If you leave very early' },
    summary: {
      it: 'Se parti prima che il locale apra, dillo entro il giorno prima: vediamo insieme cosa si può fare.',
      en: 'If you are leaving before the café opens, tell us by the day before: we will see together what can be done.',
    },
    actions: [{ kind: 'entry', label: { it: 'Scrivici', en: 'Message us' }, value: 'contacts' }],
    intents: ['breakfast-early'],
  },
  {
    id: 'dietary',
    section: 'breakfast',
    phase: ['before', 'staying'],
    icon: 'leaf',
    priority: 0,
    title: { it: 'Intolleranze e scelte alimentari', en: 'Allergies and dietary choices' },
    summary: {
      it: 'Vegano, vegetariano, senza glutine, intolleranze: diccelo il giorno prima, e ricordalo anche al personale del locale prima di ordinare — è il doppio controllo che serve davvero.',
      en: 'Vegan, vegetarian, gluten-free, intolerances: tell us the day before, and mention it to the café staff as well before you order — that second check is the one that matters.',
    },
    actions: [{ kind: 'entry', label: { it: 'Segnala un’esigenza', en: 'Tell us about it' }, value: 'contacts' }],
    intents: ['dietary'],
  },
  {
    id: 'opera-benefit',
    section: 'breakfast',
    phase: ['staying'],
    icon: 'gift',
    priority: -10,
    title: { it: 'Vantaggi presso i partner', en: 'Partner benefits' },
    summary: {
      it: 'La rete di locali partner di Bella Vigna è in attivazione: i vantaggi diventano utilizzabili solo quando l’accordo vale anche per gli ospiti Bella Vigna, e allora li trovi nella tua Pass.',
      en: 'Bella Vigna’s network of partner venues is being set up: a benefit becomes usable only once the agreement covers Bella Vigna guests too, and then you will find it on your Pass.',
    },
    intents: ['opera-benefit'],
    verify: { level: 'confirm',
      note: 'Il 30% dell’Opera Caffè è un accordo LunArt. Quando l’operatore conferma che vale anche per Bella Vigna, si attiva in commerce/partners.js (PROPERTY_AGREEMENTS) e questo testo va aggiornato con la condizione.' },
  },
];
