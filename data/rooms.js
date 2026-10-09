/**
 * The rooms, as a guest who has already booked needs them: which one am I in, what
 * is in it. Not a sales sheet.
 *
 * Three rooms (Property Pack §3): Standard, Deluxe, Doppia/Tripla con Terrazza.
 * Their identifiers in QuoVai and their maximum capacity are NOT confirmed yet, so
 * neither is published: the registry below carries provisional spellings for the
 * notification parser, and every room carries a `blocker` until the mapping and
 * the capacity are checked against a real Bella Vigna notification.
 *
 * Photographs come from the property's own June 2026 page (`legacy/index.html`),
 * where each one was already captioned with its room; the originals are in
 * `assets/img/_src/`. No LunArt image is used anywhere.
 */

/**
 * Which strings are rooms, for `commerce/rooms.js` — the one place the QuoVai
 * parser, the iCal reader, the Staff app and the checkout ask.
 *
 * The id is what the store keeps and what a screen prints after "Camera". The
 * aliases are the other ways a channel or a person may name the same room.
 * PROVISIONAL until the first real Bella Vigna notification is read: QuoVai may
 * use its own codes, and then they go here, not into the parser.
 */
export const roomRegistry = [
  {
    id: 'Standard',
    aliases: ['camera standard', 'classica', 'camera classica'],
    label: { it: 'Standard', en: 'Standard' },
  },
  {
    id: 'Deluxe',
    aliases: ['camera deluxe', 'doccia doppia', 'camera con doccia doppia'],
    label: { it: 'Deluxe', en: 'Deluxe' },
  },
  {
    id: 'Terrazza',
    aliases: ['terrace', 'con terrazza', 'camera con terrazza', 'camera terrazza', 'doppia/tripla con terrazza', 'doppia tripla con terrazza', 'terrace room'],
    label: { it: 'Terrazza', en: 'Terrace' },
  },
];

const capacityNote = 'Identificativo QuoVai/PMS e capienza massima da verificare (Property Pack §3, §11). Gli alias nel registro sono provvisori finché non si legge una notifica reale.';

export const rooms = [
  {
    id: 'Standard',
    number: 'Standard',
    category: { it: 'Travertino e caramello', en: 'Travertine and caramel' },
    summary: {
      it: 'La più raccolta della casa: lampade in travertino e un bagno nei toni del caramello.',
      en: 'The snuggest room in the house: travertine lamps and a bathroom in caramel tones.',
    },
    photos: [
      { src: 'rooms/standard-camera', alt: { it: 'Camera Standard, letto matrimoniale e lampade a sfera', en: 'Standard room, double bed and globe lamps' } },
      { src: 'rooms/standard-bagno', alt: { it: 'Bagno della camera Standard, piastrelle nei toni del caramello', en: 'Standard room bathroom, caramel-toned tiles' } },
    ],
    verify: { level: 'blocker', note: capacityNote },
  },
  {
    id: 'Deluxe',
    number: 'Deluxe',
    category: { it: 'Bagno doppio, due docce', en: 'Double bathroom, two showers' },
    highlight: true,
    summary: {
      it: 'Luminosa e spaziosa, pensata per le coppie: bagno doppio con due docce, rivestimenti verdi e lavabo freestanding.',
      en: 'Bright and spacious, made for couples: a double bathroom with two showers, green tiling and a freestanding basin.',
    },
    photos: [
      { src: 'rooms/deluxe-camera', alt: { it: 'Camera Deluxe con scrivania e poltrona', en: 'Deluxe room with desk and armchair' } },
      { src: 'rooms/deluxe-doccia', alt: { it: 'La doccia doppia della camera Deluxe, piastrelle verdi', en: 'The Deluxe room’s double shower, green tiles' } },
      { src: 'rooms/deluxe-bagno', alt: { it: 'Lavabo freestanding e specchio ad arco nel bagno della Deluxe', en: 'Freestanding basin and arched mirror in the Deluxe bathroom' } },
      { src: 'rooms/deluxe-angolo', alt: { it: 'Angolo con poltrona nella camera Deluxe', en: 'Armchair corner in the Deluxe room' } },
    ],
    verify: { level: 'blocker', note: capacityNote },
  },
  {
    id: 'Terrazza',
    number: 'Terrazza',
    category: { it: 'Doppia/Tripla con terrazza', en: 'Double/Triple with terrace' },
    summary: {
      it: 'Con una terrazza privata tra le viti — è da qui che viene il nome della casa. Travi a vista e frigobar in camera.',
      en: 'With a private terrace among the vines — the house takes its name from it. Exposed beams and a minibar in the room.',
    },
    photos: [
      { src: 'rooms/terrazza-esterno', alt: { it: 'La terrazza privata, con il salottino tra le piante', en: 'The private terrace, its lounge among the plants' } },
      { src: 'rooms/terrazza-camera', alt: { it: 'Camera con terrazza, travi a vista e porta finestra', en: 'Terrace room, exposed beams and French window' } },
      { src: 'rooms/terrazza-letto', alt: { it: 'Il letto della camera con terrazza', en: 'The bed in the terrace room' } },
      { src: 'rooms/terrazza-bagno', alt: { it: 'Bagno della camera con terrazza', en: 'Terrace room bathroom' } },
    ],
    verify: { level: 'blocker',
      note: `${capacityNote} Inoltre: il Property Pack descrive il bagno di questa camera “color turchese”, mentre la foto che la vecchia pagina gli attribuiva (rooms/terrazza-bagno) ha toni pietra — confermare l’abbinamento o sostituire la foto. Il testo non nomina il colore finché non è chiarito.` },
  },
];

/** Nothing is announced as coming. */
export const plannedRooms = [];

/** Shared across every room, so it is stated once rather than three times (Property Pack §3). */
export const roomsCommon = {
  it: 'In tutte le camere: bagno privato, aria condizionata, Wi-Fi, macchina Nespresso con caffè e tè e prodotti da bagno. La camera con terrazza ha anche il frigobar.',
  en: 'Every room has a private bathroom, air conditioning, Wi-Fi, a Nespresso machine with coffee and tea, and toiletries. The terrace room also has a minibar.',
};
