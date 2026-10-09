/**
 * Who Bella Vigna is and how a guest reaches a person.
 *
 * Source of truth: Property Pack v1 (operator decisions) > the operational facts
 * LunArt already runs on > the agency's marketing texts > the June 2026 page now
 * kept in `legacy/index.html`. Where they disagree, the higher one wins, and where
 * nothing confirms a fact it is not published — it waits in `unverifiedContacts`
 * or behind a `verify` flag for the review screen (`?review=1`).
 *
 * The contact model is LunArt's, deliberately: one official WhatsApp line for
 * messages, a telephone for a person, and the management kept apart from both.
 */

export const property = {
  name: 'Bella Vigna',
  longName: 'Bella Vigna Firenze',
  tagline: {
    it: 'Bed & Breakfast · Via della Vigna Nuova 8, Firenze',
    en: 'Bed & Breakfast · Via della Vigna Nuova 8, Florence',
  },
  /* Short enough to sit on one line over the hero photograph at 360px. */
  shortTagline: {
    it: 'Bed & Breakfast · Firenze',
    en: 'Bed & Breakfast · Florence',
  },
  address: {
    street: 'Via della Vigna Nuova 8',
    postcode: '50123',
    city: { it: 'Firenze', en: 'Florence' },
    /**
     * Floor, lift and stairs are not in the Property Pack. The access entry says
     * so instead of guessing; see `data/entries/arrival.js`.
     */
    floor: null,
    /** A Maps search built from the address itself: nothing to go stale, nothing invented. */
    maps: 'https://www.google.com/maps/search/?api=1&query=Via+della+Vigna+Nuova+8%2C+50123+Firenze',
  },
  /**
   * The story, told once (Property Pack §2): Florentine charm, the city at the
   * door, and the vine on the terrace that gave the house its name.
   */
  intro: {
    it: 'Bella Vigna è un bed & breakfast di tre camere in Via della Vigna Nuova, nel cuore '
      + 'di Firenze, a pochi passi da Palazzo Strozzi e da Via de’ Tornabuoni. Il nome viene '
      + 'dalla vite che cresce sulla terrazza: eleganza fiorentina, un’anima toscana e il '
      + 'comfort di oggi.',
    en: 'Bella Vigna is a three-room bed & breakfast on Via della Vigna Nuova, in the heart '
      + 'of Florence, a few steps from Palazzo Strozzi and Via de’ Tornabuoni. The name comes '
      + 'from the vine growing on the terrace: Florentine elegance, a Tuscan soul and '
      + 'today’s comfort.',
  },

  /**
   * Said once, in the guide. LunArt's equivalent is a line about the paintings on
   * its walls; Bella Vigna's distinctive element is the vine (Property Pack §2).
   */
  art: {
    it: 'Una vite vera, sulla terrazza: è da lì che viene il nome della casa.',
    en: 'A real vine, on the terrace: that is where the house takes its name from.',
  },
};

/**
 * The official WhatsApp line — the same WhatsApp Business account and number as
 * LunArt (operator's decision, Property Pack §7).
 *
 * Read from LunArt's operating configuration (`OFFICIAL_WHATSAPP` in LunArt's
 * `data/property.js` at golden 51ac362), not invented and not retyped from a
 * marketing text. Because the line is shared, every link the guide opens to it
 * starts the message by naming Bella Vigna (`whatsappHref` in `data/brand.js`),
 * and the contact card says in words that it is shared.
 *
 * A WhatsApp Business line, and only that: it is not a telephone, so nothing may
 * ever render it as one.
 */
export const OFFICIAL_WHATSAPP = '+393925661488';

/** Who to reach, in the order a guest should try. */
export const contacts = [
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    role: {
      it: 'Il modo più veloce per scriverci — linea condivisa con LunArt, scrivi che sei ospite di Bella Vigna',
      en: 'The fastest way to reach us — a line shared with LunArt, say you are a Bella Vigna guest',
    },
    whatsapp: OFFICIAL_WHATSAPP,
    display: '+39 392 566 1488',
    primary: true,
  },
  {
    id: 'diego',
    name: 'Diego',
    role: { it: 'Front desk, check-in e assistenza — al telefono', en: 'Front desk, check-in and guest support — by phone' },
    phone: '+393342115505',
    display: '+39 334 211 5505',
    /**
     * Diego is the front desk for Bella Vigna as for LunArt (Property Pack §1, §4).
     * The number is LunArt's published front-desk telephone, and the June 2026
     * Bella Vigna page carried the same one.
     */
    verify: { level: 'confirm',
      note: 'Numero di Diego preso dalla configurazione LunArt (stesso numero della vecchia pagina Bella Vigna). Confermare che risponda anche per gli ospiti Bella Vigna.' },
  },
  {
    id: 'direzione',
    name: 'Valentina',
    role: { it: 'Direzione — prenotazioni, fatture e casi particolari', en: 'Management — bookings, invoices and anything out of the ordinary' },
    phone: '+393296860909',
    display: '+39 329 686 0909',
  },
];

/**
 * Held, not published. Nothing here is confirmed for Bella Vigna guests yet.
 */
export const escalation = [];

/**
 * In circulation, not confirmed. Never rendered in the guide; the review screen
 * lists them so they can be confirmed or dropped (Property Pack §2, §7).
 */
export const unverifiedContacts = [
  { label: 'Email pubblica', value: 'info@bellavignafirenze.it',
    note: 'Indicata nei testi dell’agenzia. Verificare che sia operativa prima di pubblicarla, e decidere separatamente il mittente delle email automatiche.' },
  { label: 'Email (vecchia pagina)', value: 'bellavigna.firenze@gmail.com',
    note: 'Presente nella pagina di giugno 2026 come “in aggiornamento”. Non pubblicata.' },
  { label: 'Sito', value: 'www.bellavignafirenze.it',
    note: 'Dominio indicato dall’agenzia: verificare dominio e sito in sviluppo.' },
  { label: 'Instagram', value: 'instagram.com/bellavigna.florence',
    note: 'Indicato dai testi dell’agenzia: verificare.' },
];

/**
 * Deliberately short. 112 is certain and covers every emergency in Italy; the
 * pharmacy entry opens a live Maps search rather than naming a place that may have
 * closed.
 */
export const emergency = [
  { id: 'eu', label: { it: 'Emergenze — numero unico europeo', en: 'Emergencies — EU-wide number' },
    number: '112' },
  { id: 'pharmacy', label: { it: 'Farmacia di turno più vicina', en: 'Nearest on-duty pharmacy' },
    maps: 'https://www.google.com/maps/search/?api=1&query=farmacia+di+turno+Firenze+centro' },
  { id: 'staff', label: { it: 'Per tutto il resto, scrivici', en: 'For anything else, get in touch' },
    entry: 'contacts' },
];
