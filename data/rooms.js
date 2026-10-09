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
 * Photographs are the property's own, from its Google Drive (main folder and
 * "nuove foto settembre 2026"), chosen and cut for the phone by
 * `tools/import-room-photos.py`; the sources are in `assets/img/_src/rooms/`.
 * Each room is told apart by its bathroom — caramel tiles in the Standard, the
 * green double shower in the Deluxe, turquoise in the terrace room — and by its
 * furniture, the same across every shot of it. No LunArt image is used anywhere.
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
      { src: 'rooms/standard-camera', alt: { it: 'Camera Standard: letto matrimoniale, lampade in travertino e scrittoio alla finestra', en: 'Standard room: double bed, travertine lamps and a writing desk by the window' } },
      { src: 'rooms/standard-letto', alt: { it: 'Il letto della camera Standard, con i cuscini color caramello', en: 'The Standard room’s bed, with caramel cushions' } },
      { src: 'rooms/standard-dotazioni', alt: { it: 'Camera Standard: TV a parete, macchina del caffè e portavaligie', en: 'Standard room: wall TV, coffee machine and luggage rack' } },
      { src: 'rooms/standard-bagno', alt: { it: 'Bagno della camera Standard: doccia con piastrelle color caramello', en: 'Standard room bathroom: shower with caramel tiles' } },
      { src: 'rooms/standard-doccia', alt: { it: 'Le piastrelle color caramello della doccia, camera Standard', en: 'The caramel-tiled shower, Standard room' } },
    ],
    verify: { level: 'blocker',
      note: `${capacityNote} Inoltre: la foto rooms/standard-dotazioni mostra un piccolo frigorifero sotto la macchina del caffè, mentre il testo comune attribuisce il frigobar alla sola camera con terrazza (Property Pack §3) — confermare se anche la Standard ce l’ha.` },
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
      { src: 'rooms/deluxe-camera', alt: { it: 'Camera Deluxe: letto matrimoniale, armadio aperto, poltrona e tavolino', en: 'Deluxe room: double bed, open wardrobe, armchair and coffee table' } },
      { src: 'rooms/deluxe-angolo', alt: { it: 'Angolo con poltrona e scrivania nella camera Deluxe', en: 'Armchair and desk corner in the Deluxe room' } },
      { src: 'rooms/deluxe-scrivania', alt: { it: 'Macchina Nespresso, bollitore e tazze sulla scrivania della Deluxe', en: 'Nespresso machine, kettle and cups on the Deluxe room’s desk' } },
      { src: 'rooms/deluxe-doccia', alt: { it: 'La doccia doppia della camera Deluxe, piastrelle verdi', en: 'The Deluxe room’s double shower, green tiles' } },
      { src: 'rooms/deluxe-bagno', alt: { it: 'Lavabo freestanding e specchio ad arco nel bagno della Deluxe', en: 'Freestanding basin and arched mirror in the Deluxe bathroom' } },
    ],
    verify: { level: 'blocker', note: capacityNote },
  },
  {
    id: 'Terrazza',
    number: 'Terrazza',
    category: { it: 'Doppia/Tripla con terrazza', en: 'Double/Triple with terrace' },
    summary: {
      it: 'Con una terrazza privata tra le viti — è da qui che viene il nome della casa. Travi a vista, frigobar in camera e un bagno con la doccia color turchese.',
      en: 'With a private terrace among the vines — the house takes its name from it. Exposed beams, a minibar in the room and a bathroom with a turquoise-tiled shower.',
    },
    photos: [
      { src: 'rooms/terrazza-esterno', alt: { it: 'La terrazza privata, con il salottino tra le piante', en: 'The private terrace, its lounge among the plants' } },
      { src: 'rooms/terrazza-camera', alt: { it: 'Camera con terrazza: letto matrimoniale, tavolino e poltrona', en: 'Terrace room: double bed, side table and armchair' } },
      { src: 'rooms/terrazza-travi', alt: { it: 'Travi a vista e la porta finestra sulla terrazza', en: 'Exposed beams and the French window onto the terrace' } },
      { src: 'rooms/terrazza-accesso', alt: { it: 'L’angolo con poltrona, accanto alla porta finestra sulla terrazza', en: 'The armchair corner, beside the French window onto the terrace' } },
      { src: 'rooms/terrazza-doccia', alt: { it: 'La doccia della camera con terrazza, piastrelle turchesi', en: 'The terrace room’s shower, turquoise tiles' } },
      { src: 'rooms/terrazza-bagno', alt: { it: 'Bagno della camera con terrazza: pietra e lavabo freestanding', en: 'Terrace room bathroom: stone and a freestanding basin' } },
    ],
    verify: { level: 'blocker', note: capacityNote },
  },
];

/** Nothing is announced as coming. */
export const plannedRooms = [];

/** Shared across every room, so it is stated once rather than three times (Property Pack §3). */
export const roomsCommon = {
  it: 'In tutte le camere: bagno privato, aria condizionata, Wi-Fi, macchina Nespresso con caffè e tè e prodotti da bagno. La camera con terrazza ha anche il frigobar.',
  en: 'Every room has a private bathroom, air conditioning, Wi-Fi, a Nespresso machine with coffee and tea, and toiletries. The terrace room also has a minibar.',
};
