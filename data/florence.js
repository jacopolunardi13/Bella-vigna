/**
 * The house's recommendations for the city.
 *
 * Bella Vigna and LunArt share a management, and these picks are the ones the
 * LunArt guide already gives — kept here as the same list rather than invented
 * afresh. `source: 'lunart'` records where each came from. What changed is every
 * distance and direction that was measured from LunArt's door in the Oltrarno:
 * Bella Vigna is across the river, near Palazzo Strozzi, so those are restated as
 * the district a place is in, never as "two minutes away".
 *
 * Two kinds of information live here and are kept apart on purpose:
 *   - `source: 'lunart'`  — the house's pick and the reason for it.
 *   - `volatile: true`    — opening hours, prices, closing days. Third-party facts
 *                            that drift. We link out instead of restating them, so
 *                            the guide cannot quietly go stale.
 *
 * Addresses and Maps links stay; the historic knowledge base's published opening
 * hours and phone numbers mostly do not, because a guest who walks to a closed
 * door because our page said it was open is worse served than one who tapped
 * through to Maps.
 */

export const CATEGORIES = [
  { id: 'bistecca',  icon: 'steak',    title: { it: 'Bistecca e cucina toscana', en: 'Steak and Tuscan cooking' } },
  { id: 'trattoria', icon: 'pasta',    title: { it: 'Trattorie',                 en: 'Trattorias' } },
  { id: 'special',   icon: 'candle',   title: { it: 'Per una sera speciale',     en: 'For a special evening' } },
  { id: 'aperitivo', icon: 'wine',     title: { it: 'Aperitivo',                 en: 'Aperitivo' } },
  { id: 'gelato',    icon: 'icecream', title: { it: 'Gelato',                    en: 'Gelato' } },
  { id: 'museum',    icon: 'museum',   title: { it: 'Musei',                     en: 'Museums' } },
  { id: 'wellness',  icon: 'spa',      title: { it: 'Benessere',                 en: 'Wellness' } },
];

export const places = [
  // ── Bistecca and Tuscan cooking ──────────────────────────────────────────
  {
    id: 'dall-oste', category: 'bistecca', source: 'lunart',
    name: 'Trattoria dall’Oste',
    area: { it: 'Più sedi in centro', en: 'Several branches in the centre' },
    note: { it: 'Il posto per la bistecca di Chianina senza cerimonie. Prenota: si riempie.',
            en: 'The place for Chianina steak without ceremony. Book ahead: it fills up.' },
    address: 'Via dei Cerchi 40/R',
    maps: 'https://www.google.com/maps/place/?q=place_id:ChIJo0EUbAFUKhMRHvz47JzTN6c',
  },
  {
    id: 'paoli', category: 'bistecca', source: 'lunart',
    name: 'Antico Ristorante Paoli 1827',
    area: { it: 'Vicino a Piazza della Signoria', en: 'Near Piazza della Signoria' },
    note: { it: 'Soffitti affrescati e cucina toscana storica. Vale la pena anche solo per la sala.',
            en: 'Frescoed ceilings and historic Tuscan cooking. Worth it for the room alone.' },
    address: 'Via dei Tavolini 12/R',
    maps: 'https://www.google.com/maps/place/?q=place_id:ChIJfYUTEgFUKhMRTkbwYcXHR_M',
  },
  {
    id: 'perseus', category: 'bistecca', source: 'lunart',
    name: 'Perseus',
    area: { it: 'Fuori dal centro, zona Don Minzoni', en: 'Outside the centre, Don Minzoni' },
    note: { it: 'Qui ci vanno i fiorentini per la bistecca. Lontano dal giro turistico: prendi un taxi.',
            en: 'Where Florentines go for steak. Well off the tourist circuit: take a taxi.' },
    address: 'Viale Don Minzoni 10/R',
    maps: 'https://www.google.com/maps/place/?q=place_id:ChIJm2cQixdUKhMR-cFOvlTGyIM',
    volatile: true,
  },
  // ── Trattorias ───────────────────────────────────────────────────────────
  {
    id: 'cammillo', category: 'trattoria', source: 'lunart',
    name: 'Trattoria Cammillo',
    area: { it: 'Oltrarno, Borgo San Jacopo', en: 'Oltrarno, Borgo San Jacopo' },
    note: { it: 'Cucina toscana classica e clientela fiorentina, praticamente sotto casa.',
            en: 'Classic Tuscan cooking and a Florentine crowd, practically next door.' },
    address: 'Borgo San Jacopo 57/R',
    maps: 'https://www.google.com/maps/place/?q=place_id:ChIJLRNpLVVRKhMRG4c6pltQEhE',
  },
  // ── A special evening ────────────────────────────────────────────────────
  {
    id: 'la-giostra', category: 'special', source: 'lunart',
    name: 'La Giostra',
    area: { it: 'Borgo Pinti', en: 'Borgo Pinti' },
    note: { it: 'Romantica, aperta fino a tardi. La carbonara al tartufo bianco è il motivo per cui ci si torna.',
            en: 'Romantic, open late. The white truffle carbonara is why people come back.' },
    address: 'Borgo Pinti 16/R',
    maps: 'https://www.google.com/maps/place/?q=place_id:ChIJt9Hy2AVUKhMRfaoxnj4MUDA',
  },
  {
    id: 'tre-panche', category: 'special', source: 'lunart',
    name: 'Osteria delle Tre Panche',
    area: { it: 'Terrazza sul Lungarno, sopra Ponte Vecchio', en: 'Terrace on the Lungarno, above Ponte Vecchio' },
    note: { it: 'Tartufo e una terrazza che guarda il fiume dall’alto. Da prenotare con anticipo.',
            en: 'Truffle, and a terrace looking down on the river. Book well ahead.' },
    address: 'Vicolo Marzio 1',
    maps: 'https://www.google.com/maps/place/?q=place_id:ChIJkSF6cBVUKhMRhWz9opGQgZg',
  },
  // ── Aperitivo ────────────────────────────────────────────────────────────
  {
    id: 'il-santino', category: 'aperitivo', source: 'lunart',
    name: 'Il Santino',
    area: { it: 'Oltrarno, Via Santo Spirito', en: 'Oltrarno, Via Santo Spirito' },
    note: { it: 'Minuscolo wine bar con salumi e formaggi seri. Si sta in piedi e si sta benissimo.',
            en: 'A tiny wine bar with serious charcuterie and cheese. You stand up, and it is wonderful.' },
    address: 'Via Santo Spirito 60/R',
    maps: 'https://www.google.com/maps/place/?q=place_id:ChIJX-77UKtWKhMR-6C27uTUuYc',
  },
  {
    id: 'opera-aperitivo', category: 'aperitivo', source: 'lunart',
    name: 'Opera Caffè',
    area: { it: 'Piazza del Duomo', en: 'Piazza del Duomo' },
    // No benefit is promised here: the Opera Caffè agreement is not yet confirmed
    // for Bella Vigna guests (Property Pack §8). See `commerce/partners.js`.
    note: { it: 'Lo stesso posto della colazione, ai piedi del Campanile: la sera è un aperitivo con vista.',
            en: 'The same place as breakfast, at the foot of the bell tower: in the evening, an aperitivo with a view.' },
    address: 'Piazza del Duomo 62/R',
    maps: 'https://maps.app.goo.gl/uok3CmvHBLmwieoV9',
  },
  // ── Gelato ───────────────────────────────────────────────────────────────
  {
    id: 'sbrino', category: 'gelato', source: 'lunart',
    name: 'Sbrino Gelatificio Contadino',
    area: { it: 'Oltrarno, Santo Spirito', en: 'Oltrarno, Santo Spirito' },
    note: { it: 'Il migliore dell’Oltrarno: ingredienti veri, gusti che cambiano con la stagione.',
            en: 'The best in the Oltrarno: real ingredients, flavours that change with the season.' },
    address: 'Via dei Serragli 32/R',
    maps: 'https://www.google.com/maps/place/?q=place_id:ChIJNXTlQ1NRKhMRjUD4ljzT0bo',
  },
  {
    id: 'vivoli', category: 'gelato', source: 'lunart',
    name: 'Vivoli',
    area: { it: 'Santa Croce', en: 'Santa Croce' },
    note: { it: 'Dal 1930. Prendi l’affogato, non il cono.',
            en: 'Since 1930. Order the affogato, not a cone.' },
    address: 'Via Isola delle Stinche 7/R',
    maps: 'https://www.google.com/maps/place/?q=place_id:ChIJg6kOnalWKhMRs-D-wrDp7a0',
    volatile: true,
  },
  {
    id: 'carraia', category: 'gelato', source: 'lunart',
    name: 'La Carraia',
    area: { it: 'Ponte alla Carraia', en: 'Ponte alla Carraia' },
    note: { it: 'Porzioni generose e prezzo onesto, lungo il fiume.',
            en: 'Generous scoops at an honest price, along the river.' },
    address: 'Piazza Nazario Sauro 25/R',
    maps: 'https://www.google.com/maps/place/?q=place_id:ChIJfcXDX6tWKhMRs1cgi8ISs7E',
  },
  {
    id: 'edoardo', category: 'gelato', source: 'lunart',
    name: 'Edoardo il Gelato Biologico',
    area: { it: 'Piazza del Duomo', en: 'Piazza del Duomo' },
    note: { it: 'Biologico, con i coni fatti al momento davanti a te. Comodo dopo la colazione al Duomo.',
            en: 'Organic, with cones made in front of you. Handy after breakfast at the Duomo.' },
    address: 'Piazza del Duomo 45/R',
    maps: 'https://www.google.com/maps/place/?q=place_id:ChIJcWQz-gNUKhMRXrpLa1-2Zv8',
  },
  // ── Museums ──────────────────────────────────────────────────────────────
  {
    id: 'uffizi', category: 'museum', source: 'lunart',
    name: 'Galleria degli Uffizi',
    area: { it: 'Piazzale degli Uffizi', en: 'Piazzale degli Uffizi' },
    note: { it: 'Prenota il giorno e l’ora sul sito ufficiale: senza biglietto la fila è lunga.',
            en: 'Book a day and time on the official site: without a ticket the queue is long.' },
    maps: 'https://www.google.com/maps/place/?q=place_id:ChIJgZDFjQBUKhMRzcTwm8i33s0',
    url: 'https://www.uffizi.it',
    volatile: true,
  },
  {
    id: 'accademia', category: 'museum', source: 'lunart',
    name: 'Galleria dell’Accademia',
    area: { it: 'Il David', en: 'The David' },
    note: { it: 'Si va per una statua sola e ne vale la pena. Un’ora abbondante, su prenotazione.',
            en: 'You go for a single statue and it is worth it. An hour or so, booked ahead.' },
    maps: 'https://www.google.com/maps/place/?q=place_id:ChIJJ7mRvIxVKhMRx6JB-q73TG0',
    url: 'https://www.galleriaaccademiafirenze.it',
    volatile: true,
  },
  // ── Wellness ─────────────────────────────────────────────────────────────
  {
    id: 'soulspace', category: 'wellness', source: 'lunart',
    name: 'Soulspace SPA',
    area: { it: 'Via Sant’Egidio', en: 'Via Sant’Egidio' },
    note: { it: 'Piscina, bagno turco e sauna. Ingresso libero, trattamenti su prenotazione.',
            en: 'Pool, Turkish bath and sauna. Walk in for the spa, book for treatments.' },
    maps: 'https://maps.app.goo.gl/jJ1EeKqUBVwqrWAx5',
    url: 'https://www.soulspace.it',
    volatile: true,
  },
  {
    id: 'silathai', category: 'wellness', source: 'lunart',
    name: 'Silathai Thai Massage',
    area: { it: 'Oltrarno, Via dei Serragli', en: 'Oltrarno, Via dei Serragli' },
    note: { it: 'Massaggio thai fatto come si deve, in un palazzo dell’Ottocento. Prenota.',
            en: 'Thai massage done properly, in a nineteenth-century palazzo. Book ahead.' },
    maps: 'https://maps.app.goo.gl/F98iExqyzfgnpm2y9',
    url: 'https://www.silathaimassage.com',
    volatile: true,
  },
  {
    id: 'yogaincentro', category: 'wellness', source: 'lunart',
    name: 'YogaInCentro',
    area: { it: 'Oltrarno, Via de’ Marsili', en: 'Oltrarno, Via de’ Marsili' },
    note: { it: 'Lezioni di yoga e meditazione vicinissime a Ponte Vecchio. Prenotazione obbligatoria.',
            en: 'Yoga and meditation classes steps from Ponte Vecchio. Booking required.' },
    maps: 'https://maps.app.goo.gl/gKwiz4GxYgssLUVd8',
    url: 'https://www.yogaincentro.it',
    volatile: true,
  },
];

/** Routes rather than checklists: what to do with the time you actually have. */
export const itineraries = [
  {
    id: 'half-day',
    title: { it: 'Mezza giornata', en: 'Half a day' },
    body: {
      it: 'Esci verso Palazzo Strozzi e Piazza della Repubblica, poi Piazza della Signoria e gli Uffizi. Attraversa Ponte Vecchio: aperitivo da Il Santino e cena da Cammillo, in Oltrarno.',
      en: 'Head out past Palazzo Strozzi to Piazza della Repubblica, then Piazza della Signoria and the Uffizi. Cross Ponte Vecchio: aperitivo at Il Santino and dinner at Cammillo, in the Oltrarno.',
    },
  },
  {
    id: 'three-days',
    title: { it: 'Tre giorni', en: 'Three days' },
    body: {
      it: 'Giorno uno: Uffizi e Piazza della Signoria, cena alla Giostra.\nGiorno due: il Duomo e la colazione lì accanto, poi l’Accademia per il David; bistecca da Perseus la sera.\nGiorno tre: passa l’Arno — Palazzo Pitti, il Giardino di Boboli, gelato da Sbrino e aperitivo da Il Santino.',
      en: 'Day one: the Uffizi and Piazza della Signoria, dinner at La Giostra.\nDay two: the Duomo and breakfast beside it, then the Accademia for the David; steak at Perseus in the evening.\nDay three: cross the Arno — Palazzo Pitti, the Boboli Garden, gelato at Sbrino and aperitivo at Il Santino.',
    },
  },
  {
    id: 'sunset',
    title: { it: 'La passeggiata al tramonto', en: 'The sunset walk' },
    body: {
      it: 'Attraversa l’Arno a Ponte Santa Trinita o a Ponte Vecchio e sali a piedi: Costa San Giorgio, il Forte di Belvedere, poi il Piazzale Michelangelo. Un’ora buona di salita gentile, e la vista che tutti fotografano. Parti circa novanta minuti prima del tramonto.',
      en: 'Cross the Arno at Ponte Santa Trinita or Ponte Vecchio and walk uphill: Costa San Giorgio, the Forte di Belvedere, then Piazzale Michelangelo. A good hour of gentle climbing, and the view everyone photographs. Leave about ninety minutes before sunset.',
    },
  },
];

export const dayTrips = [
  { id: 'siena', name: 'Siena',
    how: { it: 'Circa un’ora e un quarto in auto, o in bus dall’autostazione.', en: 'About an hour and a quarter by car, or by coach from the bus station.' } },
  { id: 'pisa', name: 'Pisa',
    how: { it: 'Treno da Santa Maria Novella, circa un’ora e corse frequenti.', en: 'Train from Santa Maria Novella, about an hour, running often.' } },
  { id: 'chianti', name: 'Chianti',
    how: { it: 'Da fare in auto, fra Greve, Radda e Gaiole. Se ti serve un autista, chiedici.', en: 'Best by car, between Greve, Radda and Gaiole. If you need a driver, ask us.' } },
  { id: 'san-gimignano', name: 'San Gimignano',
    how: { it: 'Circa un’ora in auto; in bus con cambio a Poggibonsi.', en: 'About an hour by car; by bus with a change at Poggibonsi.' } },
];
