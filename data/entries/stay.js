/**
 * Life inside the room.
 *
 * Only what the Property Pack states is stated as fact. LunArt's entries on the
 * heated towel rail, the climate sensors, the welcome prosecco and the linen
 * rhythm describe LunArt's rooms and are deliberately not carried over: a guest
 * at Bella Vigna looking for a grey cap on a towel rail that does not exist would
 * be the guide being wrong in the most visible way.
 */

export const stay = [
  {
    id: 'wifi',
    section: 'stay',
    phase: ['staying'],
    icon: 'wifi',
    priority: -20,
    title: { it: 'Wi-Fi', en: 'Wi-Fi' },
    summary: {
      it: 'Inquadra con la fotocamera il codice QR che trovi in camera: il telefono si collega da solo. La rete è WINDTRE-96F14E.',
      en: 'Point your camera at the QR code in your room: your phone joins by itself. The network is WINDTRE-96F14E.',
    },
    detail: {
      it: 'Se il telefono non legge il QR, scrivici su WhatsApp e ti aiutiamo a collegarti.',
      en: 'If your phone will not read the QR code, message us on WhatsApp and we will get you connected.',
    },
    facts: [
      { label: { it: 'Rete', en: 'Network' }, value: 'WINDTRE-96F14E', mono: true, copy: true },
      { label: { it: 'Come collegarsi', en: 'How to join' }, value: { it: 'QR code in camera', en: 'QR code in the room' } },
    ],
    /**
     * The password is never written here. When the operator configures it
     * (`WIFI_PASSWORD`, see `.env.example`) the server adds it to this entry on a
     * guest's own link, during their stay, and nowhere else.
     */
    privateFact: 'wifi-password',
    actions: [{ kind: 'entry', label: { it: 'Il QR non funziona', en: 'The QR code won’t scan' }, value: 'contacts' }],
    intents: ['wifi'],
    verify: { level: 'confirm',
      note: 'SSID e collegamento via QR confermati dall’operatore. Verificare il QR fisico in tutte e tre le camere prima del go-live. Password: solo nella configurazione riservata (WIFI_PASSWORD), mai nel repository.' },
  },
  {
    id: 'amenities',
    section: 'stay',
    phase: ['staying'],
    icon: 'home',
    priority: -4,
    title: { it: 'Cosa trovi in camera', en: 'What’s in the room' },
    summary: {
      it: 'Bagno privato, aria condizionata, Wi-Fi, macchina Nespresso con caffè e tè e i prodotti da bagno. Nella camera con terrazza c’è anche il frigobar.',
      en: 'A private bathroom, air conditioning, Wi-Fi, a Nespresso machine with coffee and tea, and toiletries. The terrace room also has a minibar.',
    },
    intents: ['amenities'],
  },
  {
    id: 'climate',
    section: 'stay',
    phase: ['staying'],
    icon: 'thermometer',
    priority: -6,
    title: { it: 'Aria condizionata', en: 'Air conditioning' },
    summary: {
      it: 'Ogni camera ha l’aria condizionata. Se qualcosa non va, scrivici: veniamo a vedere.',
      en: 'Every room has air conditioning. If something is not right, message us: we will come and look.',
    },
    actions: [{ kind: 'entry', label: { it: 'Non funziona', en: 'It isn’t working' }, value: 'room-problem' }],
    intents: ['climate'],
  },
  {
    id: 'terrace',
    section: 'stay',
    phase: ['before', 'staying'],
    icon: 'leaf',
    priority: 1,
    title: { it: 'La terrazza e la vite', en: 'The terrace and the vine' },
    summary: {
      it: 'La camera Doppia/Tripla ha una terrazza privata con un salottino tra le piante e la vite che ha dato il nome alla casa.',
      en: 'The Double/Triple room has a private terrace with a small lounge among the plants, and the vine the house is named after.',
    },
    intents: ['terrace'],
  },
  {
    id: 'cleaning',
    section: 'stay',
    phase: ['staying'],
    icon: 'broom',
    priority: 3,
    title: { it: 'Pulizia, teli e biancheria', en: 'Cleaning, towels and linen' },
    summary: {
      it: 'Se ti serve qualcosa per la camera — teli puliti, un riordino, un cuscino in più — scrivici e ce ne occupiamo.',
      en: 'If you need anything for the room — fresh towels, a tidy-up, an extra pillow — message us and we will see to it.',
    },
    actions: [{ kind: 'entry', label: { it: 'Chiedi', en: 'Ask us' }, value: 'contacts' }],
    intents: ['cleaning', 'towels'],
    verify: { level: 'confirm', field: 'pulizia quotidiana',
      note: 'I testi parlano di pulizia quotidiana: da confermare prima di prometterla (Property Pack §5, §11). Fino ad allora la guida non fissa una frequenza.' },
  },
  {
    id: 'accessibility',
    section: 'stay',
    phase: ['before', 'staying'],
    icon: 'accessibility',
    priority: 7,
    title: { it: 'Scale, ascensore e dislivelli', en: 'Steps, lift and thresholds' },
    summary: {
      it: 'Se hai difficoltà motorie, o viaggi con un passeggino o bagagli pesanti, scrivici prima di arrivare: ti diciamo esattamente cosa aspettarti.',
      en: 'If you have limited mobility, or are travelling with a pushchair or heavy luggage, message us before you arrive: we will tell you exactly what to expect.',
    },
    actions: [{ kind: 'entry', label: { it: 'Chiedici com’è', en: 'Ask us about access' }, value: 'contacts' }],
    intents: ['accessibility'],
    verify: { level: 'confirm',
      note: 'Piano, ascensore e gradini non sono documentati: aggiungerli qui appena confermati, così l’ospite non deve chiedere.' },
  },
  {
    id: 'noise',
    section: 'stay',
    phase: ['staying'],
    icon: 'ear',
    priority: 9,
    title: { it: 'Rumore', en: 'Noise' },
    summary: {
      it: 'Siamo nel centro di Firenze, e qualche rumore di città arriva. Se ti dà fastidio dillo, vediamo cosa si può fare.',
      en: 'This is central Florence, so some city noise reaches you. If it bothers you, say so and we will see what we can do.',
    },
    intents: ['noise'],
  },
  {
    id: 'smoking',
    section: 'stay',
    phase: ['staying'],
    icon: 'no-smoking',
    priority: 11,
    title: { it: 'Fumare', en: 'Smoking' },
    summary: {
      it: 'In camera non si fuma, bagno compreso.',
      en: 'Smoking is not allowed in the rooms, bathrooms included.',
    },
    intents: ['smoking'],
    verify: { level: 'confirm', note: 'Dalla vecchia pagina (“Non fumatori”). Confermare, e decidere cosa vale sulla terrazza.' },
  },
  {
    id: 'pets',
    section: 'stay',
    phase: ['before'],
    icon: 'paw',
    priority: 12,
    title: { it: 'Animali', en: 'Pets' },
    summary: {
      it: 'Li valutiamo caso per caso: scrivici prima di prenotare o di arrivare con un animale.',
      en: 'We consider pets case by case: message us before booking or before turning up with one.',
    },
    actions: [{ kind: 'entry', label: { it: 'Chiedi', en: 'Ask us' }, value: 'contacts' }],
    intents: ['pets'],
    verify: { level: 'confirm', note: 'Dalla vecchia pagina (“Animali previo accordo”). Confermare.' },
  },
  {
    id: 'children',
    section: 'stay',
    phase: ['before', 'staying'],
    icon: 'child',
    priority: 10,
    title: { it: 'Bambini e letto aggiuntivo', en: 'Children and an extra bed' },
    summary: {
      it: 'Le famiglie sono benvenute. Culle, letti aggiuntivi e quante persone può ospitare ogni camera dipendono dalla camera: scrivici prima di arrivare e ti diciamo cosa è possibile.',
      en: 'Families are welcome. Cots, extra beds and how many people each room can sleep depend on the room: message us before you arrive and we will tell you what is possible.',
    },
    actions: [{ kind: 'entry', label: { it: 'Chiedi', en: 'Ask us' }, value: 'contacts' }],
    intents: ['children'],
    verify: { level: 'blocker', field: 'capienze e letti',
      note: 'Capienza delle tre camere, culla e letto aggiuntivo (con eventuale costo) da confermare. La regola LunArt (culla a pagamento, terzo letto 30 €) NON va trasferita senza conferma.' },
  },
  {
    id: 'hair-in-room',
    section: 'stay',
    phase: ['staying'],
    icon: 'scissors',
    priority: 8,
    title: { it: 'Parrucchiere e barbiere in camera', en: 'Hairdresser and barber in your room' },
    summary: {
      it: 'Taglio, barba o piega nella tua camera, da un professionista che viene da te. Dalla guida vedi i servizi; la prenotazione si apre quando il servizio è attivo per Bella Vigna.',
      en: 'A cut, a beard or a blow-dry in your own room, from a professional who comes to you. The guide shows the services; booking opens once the service is live at Bella Vigna.',
    },
    detail: {
      it: 'Gli orari proposti sono solo quelli realmente liberi. Non è previsto il lavaggio, e colore e colpi di sole al momento non si fanno.',
      en: 'The only times offered are the ones actually free. There is no wash service, and colour and highlights are not offered at the moment.',
    },
    actions: [{ kind: 'product', label: { it: 'Vedi il servizio', en: 'See the service' }, value: 'hair-service' }],
    intents: ['hair'],
    verify: { level: 'blocker', field: 'servizio attivo',
      note: 'Servizio del catalogo LunArt (Property Pack §8). Prezzi, professionista, orari e copertura per Bella Vigna da validare: fino ad allora i prezzi sono “placeholder” e la produzione non vende.' },
  },
  {
    id: 'celebration-in-room',
    section: 'stay',
    phase: ['before', 'staying'],
    icon: 'glass',
    priority: 13,
    title: { it: 'Compleanni, anniversari, proposte', en: 'Birthdays, anniversaries, proposals' },
    summary: {
      it: 'Fiori, una bottiglia, un biglietto scritto a mano: allestimenti della camera per un’occasione. Dalla guida vedi cosa comprendono; la prenotazione si apre quando il servizio è attivo per Bella Vigna.',
      en: 'Flowers, a bottle, a handwritten card: the room set up for an occasion. The guide shows what each includes; booking opens once the service is live at Bella Vigna.',
    },
    actions: [
      { kind: 'product', label: { it: 'Vedi gli allestimenti', en: 'See the set-ups' }, value: 'celebration' },
      { kind: 'entry', label: { it: 'Oppure scrivici', en: 'Or message us' }, value: 'contacts' },
    ],
    intents: ['celebration'],
    verify: { level: 'blocker', field: 'servizio attivo',
      note: 'Allestimenti del catalogo LunArt: contenuti, prezzi e fornitore per Bella Vigna da validare prima della vendita.' },
  },
  {
    id: 'water',
    section: 'stay',
    phase: ['staying'],
    icon: 'drop',
    priority: 14,
    title: { it: 'Un pensiero all’acqua', en: 'A thought for the water' },
    summary: {
      it: 'Chiudi il rubinetto mentre non lo usi e usa il mezzo scarico quando basta. Firenze ti ringrazia.',
      en: 'Turn the tap off while you are not using it, and use the half flush when that is enough. Florence thanks you.',
    },
    intents: [],
  },
];
