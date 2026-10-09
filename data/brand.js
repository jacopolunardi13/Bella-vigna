/**
 * Who this deployment is.
 *
 * The LunArt core used to say "LunArt" in about a hundred places — the email, the
 * Staff app, the push titles, the Pass, the venue scanner, the storage keys on a
 * guest's phone. Every one of them now reads this module instead, so the same core
 * can run for a second property without a second copy of the code, and so a
 * screen can never name the wrong house.
 *
 * Shared by the browser and the server, which is why it holds no secret and
 * nothing that is not already public: a name, an address, the words a guest reads.
 * Credentials live in the environment (see `.env.example`); facts about the stay
 * live in `data/property.js` and `data/entries/`.
 *
 * ── Bella Vigna Firenze ─────────────────────────────────────────────────────
 *
 * Source: Property Pack v1 (Google Doc "Bella Vigna — Guest Guide & Concierge —
 * Property Pack v1"). Anything the Pack marks as still to confirm is either left
 * out here or carried with a `verify` note in the data it belongs to.
 */

/**
 * The tenant key. It is stamped on the store, on every Stripe object this server
 * creates, and checked on everything that comes back, so data written by another
 * property's deployment is refused rather than adopted. Never change it once a
 * store exists: a store stamped with another id will not open.
 */
export const PROPERTY_ID = 'bella-vigna';

export const brand = {
  id: PROPERTY_ID,
  name: 'Bella Vigna',
  longName: 'Bella Vigna Firenze',
  city: { it: 'Firenze', en: 'Florence' },
  addressLine: {
    it: 'Via della Vigna Nuova 8, Firenze',
    en: 'Via della Vigna Nuova 8, Florence',
  },

  /** Prefix for everything a browser keeps, so two guides on one phone never share a key. */
  storagePrefix: 'bellavigna',

  /* ── Product names ───────────────────────────────────────────────────── */
  guideName: 'Bella Vigna Guest Guide',
  passName: 'Bella Vigna Pass',
  privilegeName: 'Bella Vigna Privilege',
  privilegeCardName: 'Bella Vigna Privilege Card',
  staffName: 'Bella Vigna Staff',
  network: { it: 'La rete Bella Vigna', en: 'The Bella Vigna network' },

  /* ── Assets (local, never hotlinked) ─────────────────────────────────── */
  /** The classic gold mark, from the logo the property supplied. */
  mark: 'assets/img/brand/bella-vigna-mark.webp',
  markSize: { width: 240, height: 170 },
  /** The image the Pass wears: the terrace and its vines, the house's own story. */
  passArtwork: {
    standard: 'assets/img/pass/bella-vigna-pass',
    privilege: 'assets/img/pass/bella-vigna-pass-privilege',
  },
  /** The first photograph a guest sees: the terrace, under the vine. */
  hero: 'rooms/terrazza-esterno',
  /** The "Discover Florence" card: the logo's skyline, in gold on dark ink. */
  florenceImage: 'brand/firenze',
  florenceAlt: {
    it: 'Il Duomo e il campanile di Giotto, dal logo di Bella Vigna',
    en: 'The Duomo and Giotto’s bell tower, from the Bella Vigna logo',
  },
  heroAlt: {
    it: 'La terrazza privata di Bella Vigna, tra le viti',
    en: 'Bella Vigna’s private terrace, among the vines',
  },

  /* ── Shared channels ─────────────────────────────────────────────────── */
  /**
   * The WhatsApp Business line is shared with LunArt (operator's decision, Property
   * Pack §7): one account, one number, Diego on the other end of both. So every
   * WhatsApp link this guide opens starts the conversation by naming the house —
   * the person answering sees which property the guest is writing about before
   * reading a word of the question.
   */
  whatsappPrefill: {
    it: 'Ciao! Scrivo da ospite di Bella Vigna Firenze (Via della Vigna Nuova 8). ',
    en: 'Hello! I am a guest at Bella Vigna Firenze (Via della Vigna Nuova 8). ',
  },

  /* ── Integrations: names only, never credentials ─────────────────────── */
  /**
   * How QuoVai names this property in its notifications ("Struttura: …").
   * A notification naming a different property is refused, never ingested.
   * PROVISIONAL: no Bella Vigna notification has been seen yet — confirm the exact
   * label against the first real one (go-live checklist).
   */
  quovaiPropertyNames: ['bella vigna', 'bellavigna', 'bella vigna firenze'],
  /** The words a QuoVai subject uses for this property, for the mailbox classifier. */
  quovaiSubjectPattern: /\bbella\s*vigna\b/i,
  mail: {
    fromName: 'Bella Vigna Firenze',
    /**
     * Deliberately empty. The Property Pack lists info@bellavignafirenze.it as a
     * marketing address still to be verified, and the sending account is not
     * decided. With no MAIL_FROM the Gmail sender refuses to start and every guide
     * email stays simulated.
     */
    defaultFrom: '',
  },
  calendarName: 'Bella Vigna Hair Bookings',

  /**
   * Interface sentences that are facts about this house (see `src/i18n.js`).
   * Breakfast is not promised on the Pass: it depends on the booking's rate.
   */
  uiOverrides: {
    it: {
      passNote: 'Compresa nel soggiorno: è la tua carta d’ospite Bella Vigna, valida per le date della prenotazione.',
      passNotePrivilege: 'La tua Pass, con i vantaggi Privilege sbloccati per le date della prenotazione.',
    },
    en: {
      passNote: 'Included with your stay: your Bella Vigna guest card, valid for the dates of your booking.',
      passNotePrivilege: 'Your Pass, with the Privilege benefits unlocked for the dates of your booking.',
    },
  },
};

/** `bellavigna.lang`, `bellavigna.cart.v1` … one namespace per property. */
export const storageKey = (suffix) => `${brand.storagePrefix}.${suffix}`;

/** A wa.me link that opens with the property already named. */
export function whatsappHref(number, lang = 'it', extra = '') {
  const digits = String(number ?? '').replace(/\D/g, '');
  const text = `${brand.whatsappPrefill[lang === 'en' ? 'en' : 'it']}${extra}`.trim();
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * The guide email, in the property's own words.
 *
 * The LunArt email promised "colazione in camera, vino, il transfer": at Bella
 * Vigna none of those is validated yet (Property Pack §8), so the email says what
 * the guide is for and does not advertise extras that may be switched off.
 */
export const guideEmailCopy = {
  it: {
    subject: 'La tua Bella Vigna Guest Guide',
    hello: (name) => (name ? `Ciao ${name},` : 'Ciao,'),
    lead: 'ecco la tua guida personale per il soggiorno a Bella Vigna: arrivo e check-in, Wi-Fi, colazione, parcheggio e Firenze — tutto in una pagina, da aprire dal telefono.',
    cta: 'Apri la tua Bella Vigna Guest Guide',
    stay: (from, to) => `Soggiorno: ${from} → ${to}`,
    room: 'Camera',
    rooms: 'Camere',
    keep: 'Il link è personale: tienilo da parte, ti servirà anche durante il soggiorno.',
    extras: 'Per qualsiasi cosa, dalla guida trovi anche come scriverci su WhatsApp.',
    signoff: 'A presto,\nBella Vigna — Via della Vigna Nuova 8, Firenze',
  },
  en: {
    subject: 'Your Bella Vigna Guest Guide',
    hello: (name) => (name ? `Hello ${name},` : 'Hello,'),
    lead: 'here is your personal guide for your stay at Bella Vigna: arrival and check-in, Wi-Fi, breakfast, parking and Florence — all on one page, made for your phone.',
    cta: 'Open your Bella Vigna Guest Guide',
    stay: (from, to) => `Stay: ${from} → ${to}`,
    room: 'Room',
    rooms: 'Rooms',
    keep: 'The link is personal: keep it, you will want it during the stay too.',
    extras: 'For anything at all, the guide also shows you how to reach us on WhatsApp.',
    signoff: 'See you soon,\nBella Vigna — Via della Vigna Nuova 8, Florence',
  },
};
