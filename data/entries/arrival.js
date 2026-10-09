/**
 * Everything a guest needs between leaving home and standing in the room.
 *
 * Source precedence, where the materials disagree (Property Pack §12):
 *   1. the operator's decisions in the Property Pack
 *   2. the operating model LunArt already runs, where the Pack says it applies
 *   3. the agency's marketing texts
 *   4. the June 2026 page in `legacy/index.html`
 *
 * Three things the old page promised are deliberately not repeated: "check-in
 * dalle 15:00 / check-out 11:00" (the hours are not confirmed — the agency says
 * 14:00–22:00, LunArt runs 15:00–20:00/20:30, and the Pack forbids transferring
 * either), a self check-in "24/7" with a smart lock (check-in is in person with
 * Diego; out of hours he or the staff guide the guest remotely), and a ZTL
 * procedure in which Diego asks the Comune for a permit (the garage handles the
 * plate within its own service, and its terms are still to be confirmed).
 */

const hoursNote = 'ORARI BLOCCANTI (Property Pack §4): l’agenzia indica 14:00–22:00, l’operatività LunArt 15:00–20:00/20:30. Nessuno dei due va pubblicato finché l’operatore non conferma gli orari di Bella Vigna. Fino ad allora la guida dice che l’orario viene confermato prima dell’arrivo.';

export const arrival = [
  {
    id: 'checkin',
    section: 'arrival',
    phase: ['before'],
    icon: 'key',
    priority: -10,
    title: { it: 'Check-in e orario di arrivo', en: 'Check-in and arrival time' },
    summary: {
      it: 'Di norma ti accoglie Diego, di persona. Se arrivi fuori orario, Diego o lo staff ti guidano a distanza, passo passo, nel self check-in: non sei mai da solo.',
      en: 'Normally Diego welcomes you in person. If you arrive outside the usual hours, Diego or the staff guide you remotely, step by step, through self check-in: you are never on your own.',
    },
    detail: {
      it: 'Facci sapere un orario indicativo di arrivo: è quello che ci permette di esserci. Un messaggio su WhatsApp quando sei a circa mezz’ora da Firenze è perfetto.\n\nL’orario esatto di check-in e di check-out te lo confermiamo prima dell’arrivo, insieme alle istruzioni per entrare.',
      en: 'Let us know roughly when you expect to arrive: that is what lets us be there. A WhatsApp message when you are about half an hour from Florence is ideal.\n\nWe confirm the exact check-in and check-out times before you arrive, together with the instructions for getting in.',
    },
    facts: [
      { label: { it: 'Accoglienza', en: 'Welcome' }, value: { it: 'di persona, con Diego', en: 'in person, with Diego' } },
      { label: { it: 'Fuori orario', en: 'Out of hours' }, value: { it: 'self check-in guidato a distanza', en: 'self check-in, guided remotely' } },
      { label: { it: 'Orari', en: 'Times' }, value: { it: 'confermati prima dell’arrivo', en: 'confirmed before you arrive' } },
    ],
    actions: [{ kind: 'entry', label: { it: 'Avvisa del tuo arrivo', en: 'Tell us when you arrive' }, value: 'contacts' }],
    intents: ['checkin'],
    verify: { level: 'blocker', field: 'orari check-in/check-out', note: hoursNote },
  },
  {
    id: 'late-arrival',
    section: 'arrival',
    phase: ['before'],
    icon: 'moon',
    priority: -5,
    title: { it: 'Se arrivi fuori orario', en: 'If you arrive out of hours' },
    summary: {
      it: 'Nessun problema: prima dell’arrivo ricevi istruzioni personali, e quando sei davanti alla porta Diego o lo staff ti guidano a distanza nel self check-in.',
      en: 'Not a problem: you receive personal instructions before you arrive, and when you are at the door Diego or the staff guide you remotely through self check-in.',
    },
    detail: {
      it: 'Le istruzioni per entrare sono tue e arrivano in privato, non in questa pagina: sono le uniche cose della guida che non devono girare.\n\nScrivici su WhatsApp quando stai per arrivare, dicendo che sei ospite di Bella Vigna. Se il volo o il treno slittano, avvisaci: è il genere di cosa che si sistema in un minuto.',
      en: 'The instructions for getting in are yours and reach you privately, not on this page: they are the only part of the guide that must not travel.\n\nMessage us on WhatsApp when you are about to arrive, saying you are a Bella Vigna guest. If your flight or train slips, tell us: this is the kind of thing that takes a minute to sort out.',
    },
    actions: [{ kind: 'entry', label: { it: 'Scrivici', en: 'Message us' }, value: 'contacts' }],
    intents: ['late-arrival'],
    verify: { level: 'blocker', field: 'procedura self check-in',
      note: 'Serrature, codici e istruzioni di self check-in non sono ancora definiti (Property Pack §11). Devono raggiungere solo l’ospite giusto, in privato: non vanno mai scritti nei dati della guida. Confermare anche fino a che ora l’accoglienza è di persona.' },
  },
  {
    id: 'access',
    section: 'arrival',
    phase: ['before', 'staying'],
    icon: 'door',
    priority: -8,
    title: { it: 'Dove siamo e come si entra', en: 'Where we are and getting in' },
    summary: {
      it: 'Via della Vigna Nuova 8, nel centro storico, a pochi passi da Palazzo Strozzi. Le istruzioni per entrare te le mandiamo personalmente prima dell’arrivo.',
      en: 'Via della Vigna Nuova 8, in the historic centre, a few steps from Palazzo Strozzi. We send you the instructions for getting in personally before you arrive.',
    },
    detail: {
      it: 'Codici e istruzioni non sono in questa pagina, che è pubblica: arrivano a te, in privato. Se non li trovi, cercali nella chat con noi prima di suonare da qualcun altro.',
      en: 'Codes and instructions are not on this page, which is public: they reach you privately. If you cannot find them, check your chat with us before ringing anyone else’s bell.',
    },
    facts: [
      { label: { it: 'Indirizzo', en: 'Address' }, value: 'Via della Vigna Nuova 8, 50123 Firenze' },
    ],
    actions: [
      { kind: 'map', label: { it: 'Apri in Maps', en: 'Open in Maps' }, value: 'https://www.google.com/maps/search/?api=1&query=Via+della+Vigna+Nuova+8%2C+50123+Firenze' },
      { kind: 'entry', label: { it: 'Non trovo le istruzioni', en: 'I can’t find my instructions' }, value: 'contacts' },
    ],
    intents: ['access', 'pin'],
    verify: { level: 'blocker', field: 'accesso',
      note: 'Piano, ascensore, scale, portone e modalità chiavi non sono nel Property Pack. Da definire e aggiungere qui (senza codici) prima della pubblicazione.' },
  },
  {
    id: 'luggage-early',
    section: 'arrival',
    phase: ['before'],
    icon: 'suitcase',
    priority: -3,
    title: { it: 'Bagagli prima del check-in', en: 'Bags before check-in' },
    summary: {
      it: 'Puoi lasciarli gratuitamente all’Opera Caffè, in Piazza del Duomo, negli orari di apertura del locale.',
      en: 'You can leave them free of charge at Opera Caffè in Piazza del Duomo, during the café’s opening hours.',
    },
    detail: {
      it: 'Il deposito all’Opera Caffè vale sia prima del check-in sia dopo il check-out, ed è lo stesso locale della colazione. Avvisaci prima di passare, così il locale sa che sei nostro ospite.',
      en: 'Storage at Opera Caffè works both before check-in and after check-out, and it is the same café as breakfast. Let us know before you drop by, so the café knows you are our guest.',
    },
    actions: [
      { kind: 'map', label: { it: 'Opera Caffè', en: 'Opera Caffè' }, value: 'https://maps.app.goo.gl/uok3CmvHBLmwieoV9' },
      { kind: 'entry', label: { it: 'Avvisaci', en: 'Let us know' }, value: 'contacts' },
    ],
    intents: ['luggage'],
    verify: { level: 'confirm', field: 'deposito Opera Caffè',
      note: 'Modello confermato dall’operatore: uguale a LunArt (Property Pack §5). Da verificare con l’Opera Caffè che riconosca gli ospiti Bella Vigna e come. Orari del locale: dato di terzi, per questo la guida dice “negli orari di apertura”.' },
  },
  {
    id: 'parking',
    section: 'arrival',
    phase: ['before'],
    icon: 'car',
    priority: 0,
    title: { it: 'Arrivare in auto e parcheggiare', en: 'Arriving by car and parking' },
    summary: {
      it: 'Bella Vigna non ha un parcheggio proprio. Il garage di riferimento è il Garage Tornabuoni, in Via dell’Inferno 7/9R, a circa due minuti a piedi.',
      en: 'Bella Vigna has no parking of its own. The garage we work with is Garage Tornabuoni, Via dell’Inferno 7/9R, about two minutes’ walk away.',
    },
    detail: {
      it: 'Prima di partire scrivici: ti confermiamo come prenotare il posto e cosa fare con la ZTL. Tariffe e orari del garage sono suoi e cambiano, per questo qui non li scriviamo.\n\nImposta il navigatore sul garage, non sulla struttura.',
      en: 'Message us before you set off: we confirm how to book a space and what to do about the ZTL. The garage’s rates and hours are its own and they change, which is why we do not print them here.\n\nSet your navigation to the garage, not to the B&B.',
    },
    facts: [
      { label: { it: 'Garage', en: 'Garage' }, value: 'Garage Tornabuoni · Via dell’Inferno 7/9R' },
      { label: { it: 'A piedi', en: 'On foot' }, value: { it: '~2 minuti', en: '~2 minutes' } },
    ],
    actions: [
      { kind: 'map', label: { it: 'Garage in Maps', en: 'Garage in Maps' }, value: 'https://www.google.com/maps/search/?api=1&query=Garage+Tornabuoni+Via+dell%27Inferno+7+Firenze' },
      { kind: 'entry', label: { it: 'Come funziona la ZTL', en: 'How the ZTL works' }, value: 'ztl' },
      { kind: 'entry', label: { it: 'Chiedici prima di partire', en: 'Ask us before you set off' }, value: 'contacts' },
    ],
    intents: ['parking'],
    verify: { level: 'blocker', field: 'garage',
      note: 'Garage Tornabuoni (Property Pack §6): confermare istruzioni ufficiali, link e modalità di prenotazione, tariffa, orari e limiti prima di pubblicarli. NON riutilizzare garage, tariffe o indicazioni di LunArt. La vecchia pagina diceva “5 min, €25–40/giorno, 7:00–24:00”: non confermato, non pubblicato.' },
  },
  {
    id: 'ztl',
    section: 'arrival',
    phase: ['before'],
    icon: 'camera',
    priority: 1,
    title: { it: 'ZTL — la zona a traffico limitato', en: 'The ZTL — the restricted traffic zone' },
    summary: {
      it: 'Il centro storico di Firenze è a traffico limitato, e Bella Vigna è al suo interno. Non entrare in auto senza aver chiesto prima a noi o al garage come farlo.',
      en: 'Florence’s historic centre is a restricted traffic zone, and Bella Vigna is inside it. Do not drive in without first asking us or the garage how to do it.',
    },
    detail: {
      it: 'Le telecamere ai varchi leggono la targa. Il Garage Tornabuoni gestisce la comunicazione della targa per l’accesso nell’ambito del suo servizio: tempi, modalità e limiti te li confermiamo prima dell’arrivo.\n\nNessuno può garantirti che un transito sia coperto se non è stato concordato prima: meglio due minuti ora che una multa fra sei mesi.',
      en: 'Cameras at the gates read number plates. Garage Tornabuoni handles reporting your plate for access as part of its service: we confirm the timing, the procedure and its limits before you arrive.\n\nNobody can promise you a passage is covered unless it was arranged first: two minutes now beats a fine in six months.',
    },
    actions: [
      { kind: 'entry', label: { it: 'Hai un dubbio? Scrivici', en: 'Not sure? Message us' }, value: 'contacts' },
    ],
    intents: ['ztl'],
    verify: { level: 'blocker', field: 'procedura ZTL',
      note: 'Procedura targa/ZTL del Garage Tornabuoni da confermare: modalità, tempi, copertura delle singole entrate e uscite (Property Pack §6). Non garantire esenzione da multe né accesso libero. La vecchia pagina (Diego chiede al Comune un permesso temporaneo) non è confermata.' },
  },
  {
    id: 'from-station',
    section: 'arrival',
    phase: ['before'],
    icon: 'train',
    priority: 4,
    title: { it: 'Dalla stazione di Santa Maria Novella', en: 'From Santa Maria Novella station' },
    summary: {
      it: 'Circa 10 minuti a piedi, se non hai troppi bagagli. In alternativa il taxi è comodo e breve.',
      en: 'About a 10-minute walk, if you are not loaded with luggage. Otherwise a taxi is quick and easy.',
    },
    actions: [
      { kind: 'map', label: { it: 'Percorso a piedi', en: 'Walking route' },
        value: 'https://www.google.com/maps/dir/?api=1&origin=Firenze+Santa+Maria+Novella&destination=Via+della+Vigna+Nuova+8+Firenze&travelmode=walking' },
    ],
    intents: ['from-station'],
    verify: { level: 'confirm', note: 'Tempo a piedi dalla vecchia pagina (8–10 minuti a seconda della sezione). Controllare una volta sul percorso reale.' },
  },
  {
    id: 'from-airport',
    section: 'arrival',
    phase: ['before'],
    icon: 'plane',
    priority: 5,
    title: { it: 'Dall’aeroporto di Firenze', en: 'From Florence airport' },
    summary: {
      it: 'Tramvia T2 fino a Santa Maria Novella e poi circa dieci minuti a piedi o un taxi; oppure taxi diretto.',
      en: 'Tram line T2 to Santa Maria Novella, then about ten minutes on foot or a taxi; or a taxi straight here.',
    },
    detail: {
      it: 'Il taxi dall’aeroporto al centro ha una tariffa fissa comunale: chiedi conferma al conducente prima di partire.\n\nSe preferisci un’auto con conducente, chiedicelo con anticipo: vediamo cosa si può organizzare.',
      en: 'Taxis from the airport into the centre run on a fixed municipal fare: confirm it with the driver before setting off.\n\nIf you would rather have a private driver, ask us ahead of time: we will see what can be arranged.',
    },
    actions: [{ kind: 'entry', label: { it: 'Chiedi un transfer', en: 'Ask about a transfer' }, value: 'transfer' }],
    intents: ['from-airport'],
  },
  {
    id: 'city-tax',
    section: 'arrival',
    phase: ['before', 'leaving'],
    icon: 'receipt',
    priority: 8,
    title: { it: 'Tassa di soggiorno', en: 'City tax' },
    summary: {
      it: 'È un’imposta del Comune di Firenze, non inclusa nella tariffa, che si paga in struttura. L’importo a persona per notte dipende dal tipo di struttura: te lo confermiamo all’arrivo.',
      en: 'A City of Florence tax, not included in the room rate, paid at the property. The amount per person per night depends on the type of property: we confirm it when you arrive.',
    },
    intents: ['city-tax'],
    verify: { level: 'blocker', field: 'importo',
      note: 'Importo e tetto di notti per la categoria di Bella Vigna da confermare con l’operatore e con la delibera comunale vigente. Non copiare il valore di LunArt.' },
  },
];
