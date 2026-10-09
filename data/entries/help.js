/**
 * When something is wrong, or a guest just needs a person.
 *
 * The WhatsApp line is LunArt's own WhatsApp Business account (operator's
 * decision). The guide is honest about that: it says the line is shared, every
 * link to it opens a message that already names Bella Vigna, and the management
 * telephone stays a separate, distinct channel.
 */

export const help = [
  {
    id: 'contacts',
    section: 'help',
    phase: ['before', 'staying', 'leaving'],
    icon: 'chat',
    priority: -20,
    title: { it: 'Parlare con qualcuno', en: 'Talk to someone' },
    summary: {
      it: 'Scrivici su WhatsApp al +39 392 566 1488: è il modo più veloce. Per parlare con qualcuno al telefono c’è Diego, al +39 334 211 5505.',
      en: 'Message us on WhatsApp at +39 392 566 1488 — that is the fastest. To speak to someone by phone, call Diego on +39 334 211 5505.',
    },
    detail: {
      it: 'Il WhatsApp è la linea ufficiale che Bella Vigna condivide con LunArt, la struttura sorella con la stessa gestione: per questo nel profilo potresti vedere il nome LunArt. Scrivi sempre che sei ospite di Bella Vigna — i pulsanti di questa guida lo fanno già per te. È una linea solo per messaggi: per una telefonata c’è Diego.\n\nPer prenotazioni, fatture e casi particolari c’è la direzione: Valentina, al +39 329 686 0909.',
      en: 'The WhatsApp line is the official one Bella Vigna shares with LunArt, its sister property under the same management: that is why the profile may show the LunArt name. Always say you are a Bella Vigna guest — the buttons in this guide already do it for you. The line takes messages only: to actually speak to somebody, call Diego.\n\nFor bookings, invoices and anything out of the ordinary there is the management: Valentina, on +39 329 686 0909.',
    },
    facts: [
      { label: { it: 'WhatsApp (linea condivisa)', en: 'WhatsApp (shared line)' }, value: '+39 392 566 1488', mono: true, copy: true },
      { label: { it: 'Diego, al telefono', en: 'Diego, by phone' }, value: '+39 334 211 5505', mono: true, copy: true },
      { label: { it: 'Direzione — Valentina', en: 'Management — Valentina' }, value: '+39 329 686 0909', mono: true, copy: true },
    ],
    actions: [
      { kind: 'whatsapp', label: { it: 'Scrivici su WhatsApp', en: 'Message us on WhatsApp' }, value: '+393925661488' },
      { kind: 'tel', label: { it: 'Chiama Diego', en: 'Call Diego' }, value: '+393342115505' },
      { kind: 'tel', label: { it: 'Chiama la direzione', en: 'Call the management' }, value: '+393296860909' },
    ],
    intents: ['contacts'],
    verify: { level: 'blocker', field: 'canale WhatsApp condiviso',
      note: 'Verificare sul numero WhatsApp Business condiviso (Property Pack §7, §11): instradamento delle richieste Bella Vigna, nome e foto del profilo che l’ospite vede, risposte rapide che nominano la struttura giusta. Il testo dice “potresti vedere il nome LunArt”: correggerlo se il profilo verrà reso neutro.' },
  },
  {
    id: 'room-problem',
    section: 'help',
    phase: ['staying'],
    icon: 'wrench',
    priority: -10,
    title: { it: 'Qualcosa non funziona in camera', en: 'Something is not working' },
    summary: {
      it: 'Scrivici su WhatsApp dicendo che sei ospite di Bella Vigna, in quale camera, e cosa succede. Le cose piccole si risolvono quasi sempre in giornata.',
      en: 'Message us on WhatsApp saying you are a Bella Vigna guest, which room, and what is happening. Small things are almost always sorted the same day.',
    },
    actions: [{ kind: 'whatsapp', label: { it: 'Scrivici su WhatsApp', en: 'Message us on WhatsApp' }, value: '+393925661488' }],
    intents: ['room-problem'],
  },
  {
    id: 'emergency',
    section: 'help',
    phase: ['staying'],
    icon: 'alert',
    priority: -5,
    title: { it: 'Emergenze', en: 'Emergencies' },
    summary: {
      it: 'Per un’emergenza chiama il 112: è il numero unico europeo e risponde anche in inglese.',
      en: 'In an emergency call 112: the single European number, answered in English too.',
    },
    detail: {
      it: 'Per una farmacia aperta adesso, apri la ricerca qui sotto: i turni cambiano ogni giorno.\n\nSe si tratta della struttura — una perdita, la porta che non apre, un allarme — scrivici su WhatsApp o chiama Diego.',
      en: 'For a pharmacy open right now, use the search below: the rota changes daily.\n\nIf it concerns the building — a leak, a door that will not open, an alarm — message us on WhatsApp or call Diego.',
    },
    intents: ['emergency'],
  },
  {
    id: 'invoice',
    section: 'help',
    phase: ['staying', 'leaving'],
    icon: 'receipt',
    priority: 5,
    title: { it: 'Fattura', en: 'Invoice' },
    summary: {
      it: 'Se ti serve la fattura, dillo prima che venga emessa la ricevuta: dopo non si può più cambiare.',
      en: 'If you need an invoice, say so before the receipt is issued: afterwards it cannot be changed.',
    },
    actions: [{ kind: 'entry', label: { it: 'Richiedila', en: 'Request one' }, value: 'contacts' }],
    intents: ['invoice'],
  },
  {
    id: 'booking-terms',
    section: 'help',
    phase: ['before'],
    icon: 'card',
    priority: 8,
    title: { it: 'Pagamento, cancellazioni e cambio date', en: 'Payment, cancellations and changing dates' },
    summary: {
      it: 'Valgono le condizioni scritte nella conferma della tua prenotazione. Per un cambio date o un caso particolare, parlane con la direzione.',
      en: 'The terms in your booking confirmation apply. To change dates or for any particular case, speak to the management.',
    },
    detail: {
      it: 'Se hai prenotato tramite un portale, valgono le condizioni del tuo contratto con loro: fa fede la tua conferma.\n\nPer qualsiasi caso specifico, chiama Valentina, che segue la direzione: è il modo per avere una risposta che vale.',
      en: 'If you booked through a travel site, the terms of your contract with them apply: your own confirmation is what counts.\n\nFor any specific case, call Valentina, who runs the management side: it is the way to get an answer that holds.',
    },
    actions: [{ kind: 'tel', label: { it: 'Chiama la direzione', en: 'Call the management' }, value: '+393296860909' }],
    intents: ['booking-terms'],
    verify: { level: 'confirm',
      note: 'Le condizioni di LunArt (non rimborsabile, cambio date con 2 settimane) NON sono state trasferite. Se Bella Vigna ha una sua policy per le prenotazioni dirette, aggiungerla qui.' },
  },
];
