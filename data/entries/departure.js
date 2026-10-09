/** The last morning, and getting out of the city. */

export const departure = [
  {
    id: 'checkout',
    section: 'departure',
    phase: ['leaving'],
    icon: 'clock',
    priority: -20,
    title: { it: 'A che ora devo lasciare la camera', en: 'When to leave the room' },
    summary: {
      it: 'L’orario di check-out te lo confermiamo prima dell’arrivo. Quando esci, avvisaci su WhatsApp.',
      en: 'We confirm the check-out time before you arrive. When you leave, let us know on WhatsApp.',
    },
    detail: {
      it: 'Se ti serve un po’ più di tempo, chiedilo la sera prima: dipende da chi arriva dopo di te, ma spesso si trova una soluzione.\n\nI bagagli non devono condizionarti: si lasciano in deposito.',
      en: 'If you need a little longer, ask the evening before: it depends on who arrives after you, but there is often a way.\n\nDo not let your bags dictate your day: you can leave them in storage.',
    },
    actions: [{ kind: 'entry', label: { it: 'Dove lascio i bagagli', en: 'Where to leave bags' }, value: 'luggage-late' }],
    intents: ['checkout'],
    verify: { level: 'blocker', field: 'orario check-out',
      note: 'Orario di check-out di Bella Vigna da confermare: non presumere le 11:00 di LunArt (Property Pack §4). La vecchia pagina diceva “entro le 11:00”: non confermato.' },
  },
  {
    id: 'luggage-late',
    section: 'departure',
    phase: ['leaving'],
    icon: 'suitcase',
    priority: -15,
    title: { it: 'Bagagli dopo il check-out', en: 'Bags after check-out' },
    summary: {
      it: 'Lasciali gratis all’Opera Caffè in Piazza del Duomo, negli orari di apertura, e tieniti la giornata libera.',
      en: 'Leave them free of charge at Opera Caffè in Piazza del Duomo, during opening hours, and keep your day free.',
    },
    detail: {
      it: 'È lo stesso locale della colazione. Avvisaci prima di passare, così sanno che sei nostro ospite.',
      en: 'It is the same café as breakfast. Let us know before you drop by, so they know you are our guest.',
    },
    actions: [
      { kind: 'map', label: { it: 'Opera Caffè', en: 'Opera Caffè' }, value: 'https://maps.app.goo.gl/uok3CmvHBLmwieoV9' },
      { kind: 'product', label: { it: 'Trasferimento bagagli', en: 'Luggage transfer' }, value: 'luggage-transfer' },
    ],
    intents: ['luggage'],
  },
  {
    id: 'taxi',
    section: 'departure',
    phase: ['leaving'],
    icon: 'taxi',
    priority: -10,
    title: { it: 'Prendere un taxi', en: 'Getting a taxi' },
    summary: {
      it: 'A Firenze i taxi non si fermano per strada: si chiamano o si prendono ai posteggi. I numeri sono 055 4390 e 055 4242.',
      en: 'In Florence taxis are not hailed in the street: you call one or use a rank. The numbers are 055 4390 and 055 4242.',
    },
    detail: {
      it: 'Per l’aeroporto vale la tariffa fissa comunale: chiedi conferma al conducente prima di partire.',
      en: 'For the airport a fixed municipal fare applies: confirm it with the driver before you set off.',
    },
    actions: [
      { kind: 'tel', label: { it: 'Chiama 055 4390', en: 'Call 055 4390' }, value: '+390554390' },
      { kind: 'tel', label: { it: 'Chiama 055 4242', en: 'Call 055 4242' }, value: '+390554242' },
    ],
    intents: ['taxi'],
    verify: { level: 'confirm',
      note: 'Numeri radiotaxi fiorentini (informazione pubblica, già nella guida LunArt). Il posteggio più vicino a Via della Vigna Nuova non è indicato finché non è verificato.' },
  },
  {
    id: 'transfer',
    section: 'departure',
    phase: ['before', 'leaving'],
    icon: 'car',
    priority: -5,
    title: { it: 'Transfer privato (NCC)', en: 'Private transfer' },
    summary: {
      it: 'Un’auto con conducente da e per l’aeroporto: è un servizio in preparazione per Bella Vigna. Dalla guida vedi come funziona; per ora chiedicelo con almeno 24 ore di anticipo.',
      en: 'A car with driver to and from the airport: a service being prepared for Bella Vigna. The guide shows how it works; for now, ask us at least 24 hours ahead.',
    },
    actions: [
      { kind: 'product', label: { it: 'Vedi il transfer', en: 'See the transfer' }, value: 'transfer-airport' },
      { kind: 'entry', label: { it: 'Chiedicelo', en: 'Ask us' }, value: 'contacts' },
    ],
    intents: ['transfer'],
    verify: { level: 'blocker', field: 'servizio attivo',
      note: 'Transfer NCC e trasferimento bagagli: catalogo LunArt, da validare per Bella Vigna (fornitore, tariffe, cutoff, cancellazione) prima di renderli acquistabili.' },
  },
  {
    id: 'to-airport',
    section: 'departure',
    phase: ['leaving'],
    icon: 'plane',
    priority: 0,
    title: { it: 'Andare in aeroporto', en: 'Getting to the airport' },
    summary: {
      it: 'Taxi a tariffa fissa, oppure tramvia T2 da Santa Maria Novella. Con un volo molto presto, organizzati il giorno prima.',
      en: 'A fixed-fare taxi, or tram T2 from Santa Maria Novella. For a very early flight, arrange it the day before.',
    },
    actions: [{ kind: 'entry', label: { it: 'Chiamare un taxi', en: 'Call a taxi' }, value: 'taxi' }],
    intents: ['to-airport'],
  },
  {
    id: 'to-station',
    section: 'departure',
    phase: ['leaving'],
    icon: 'train',
    priority: 2,
    title: { it: 'Andare alla stazione', en: 'Getting to the station' },
    summary: {
      it: 'Santa Maria Novella è a circa dieci minuti a piedi. Con i bagagli, meglio un taxi.',
      en: 'Santa Maria Novella is about ten minutes on foot. With luggage, take a taxi.',
    },
    actions: [
      { kind: 'map', label: { it: 'Percorso a piedi', en: 'Walking route' },
        value: 'https://www.google.com/maps/dir/?api=1&origin=Via+della+Vigna+Nuova+8+Firenze&destination=Firenze+Santa+Maria+Novella&travelmode=walking' },
    ],
    intents: ['to-station'],
  },
];
