# Integrazioni di Bella Vigna: stato reale e piano

Stati usati in questo documento e in ogni resoconto (decisione del 10 ottobre 2026):

| | Stato | Significa |
|---|---|---|
| **A** | Sviluppato | il codice esiste |
| **B** | Testato | funziona con dati simulati (test automatici, staging) |
| **C** | Integrato | collegato all'account reale di Bella Vigna |
| **D** | Validato | dati reali controllati e corrispondenti a QuoVai e ai canali |
| **E** | Attivo | abilitato per gli ospiti in produzione |

Nessuna integrazione di Bella Vigna è oltre lo stato **B**. Nessun accesso operativo
di Bella Vigna (QuoVai, Booking.com, Expedia, Airbnb, Gmail, Stripe) è stato fornito
o usato.

## Stato al 10 ottobre 2026

| Integrazione | A | B | C | D | E | Nota |
|---|:-:|:-:|:-:|:-:|:-:|---|
| Notifiche QuoVai via email (lettura e parser) | ✓ | ✓ | — | — | — | Il parser è quello di LunArt, già in uso reale per LunArt; per Bella Vigna provato su notifiche simulate. Rifiuta una notifica di un'altra struttura |
| QuoVai API / webhook | parziale | interfaccia | — | — | — | API a pagamento (avvio + canone, NDA): non usate per scelta del titolare (9/10/2026). Il codice resta come predisposizione, spento |
| iCal QuoVai (rete di sicurezza) | ✓ | ✓ | — | — | — | Mancano gli URL dei feed per camera |
| Gmail lettura notifiche | ✓ | ✓ | — | — | — | Casella di Bella Vigna da identificare (vedi Q1) |
| Gmail invio Guest Guide | ✓ | ✓ | — | — | — | Ora con autorizzazione separata, solo invio (`GMAIL_SEND_*`). Mittente da decidere |
| Booking.com / Expedia / Airbnb | via QuoVai | ✓ (canale letto dalla notifica) | — | — | — | Nessuna integrazione diretta prevista: le prenotazioni arrivano tramite il channel manager QuoVai |
| Stripe (pagamenti Extra) | ✓ | ✓ (checkout simulato) | — | — | — | Spento: prezzi, catalogo, accordi, account e politiche da verificare |
| Partner / Privilege Card | ✓ | ✓ | — | — | — | Nessun accordo confermato per Bella Vigna: la card non è in vendita |
| Notifiche push Staff (console) | ✓ | ✓ | staging | — | — | Attive in staging solo per chi le abilita; nessun evento reale |
| Staff App unica (console) | ✓ | ✓ | staging | — | — | Dati dimostrativi; LunArt di produzione non collegato |
| WhatsApp | link `wa.me` | ✓ | — | — | — | Linea condivisa con LunArt; nessuna API |

## Cosa abbiamo verificato su QuoVai (senza credenziali)

- **API**: esistono come componente aggiuntivo ("APIs for custom integrations"),
  senza documentazione pubblica. L'assistenza QuoVai (ticket del 23/09/2026) le
  sconsiglia e conferma costo di avvio, canone annuale, NDA e licenza. Il 9/10/2026
  il titolare ha scelto la soluzione standard, **senza API**.
- **Channel manager**: sincronizzazione bidirezionale con oltre 500 portali; iCal
  per i portali che non supportano la sincronizzazione completa. Quindi le
  prenotazioni Booking.com, Expedia e Airbnb confluiscono in QuoVai.
- **Notifiche email**: per LunArt QuoVai invia a ogni nuova prenotazione,
  modifica e cancellazione un'email con oggetto "🔔 Prenotazione per LunArt…",
  "⛔ Cancellazione…" e nel testo `Struttura : LUNART`, `Agenzia/Canale : …`. È la
  fonte che il sistema LunArt usa oggi.
- **Booking engine Bella Vigna**: `https://be.quovai.com/be/bellavigna`.
- **Avviso QuoVai del 23/09/2026**: dal 28/09 Booking.com non trasmette più il
  telefono degli ospiti al channel manager. La guida non dipende dal telefono;
  l'email dell'ospite resta il dato essenziale (da verificare per ogni canale, Q3).
- **Notifiche Bella Vigna**: nella casella di Jacopo non c'è nessuna notifica
  QuoVai di Bella Vigna: arrivano a un'altra casella oppure non sono ancora
  configurate (Q1).

Conclusione: per Bella Vigna si usa lo stesso schema di LunArt — **notifiche email
QuoVai come fonte, iCal come rete di sicurezza** — senza API e senza integrazioni
dirette con le OTA, salvo che una verifica (Q3) mostri dati mancanti importanti.

## Piano, nell'ordine

### Q1 — QuoVai Bella Vigna (oggi, nessuna password da comunicare)

Dal pannello QuoVai di Bella Vigna, solo lettura:

1. **A quale indirizzo arrivano le notifiche di prenotazione** (nuova, modifica,
   cancellazione) di Bella Vigna.
2. **Come si chiamano le camere** in QuoVai (codice e nome) e la loro capienza.
3. **Quali portali sono collegati** e come: Booking.com, Expedia, Airbnb (API o iCal).
4. **Gli URL iCal di esportazione** per camera, se il piano li prevede.

Con 1 si decide la casella (Q2). Con 2 si chiude il blocker A5 della go-live. Con 3
si sa se Airbnb è in iCal (dati ospite ridotti).

### Q2 — Gmail (dopo Q1)

- **Lettura**: un'autorizzazione Google con il solo permesso `gmail.readonly`, sulla
  casella che riceve le notifiche di Bella Vigna. Meglio ancora: un filtro Gmail che
  inoltra solo le notifiche QuoVai di Bella Vigna a una casella dedicata, e
  l'autorizzazione su quella. Il sistema legge solo i messaggi che corrispondono a
  `GMAIL_QUERY` e rifiuta ogni notifica con "Struttura" diversa da Bella Vigna.
- **Invio**: un'autorizzazione separata con il solo permesso `gmail.send`,
  sull'account del mittente scelto (es. info@bellavignafirenze.it). Non può leggere
  nessuna casella.
- Le autorizzazioni si creano con una procedura guidata e si inseriscono **solo**
  nelle variabili d'ambiente del servizio di produzione Bella Vigna, mai in chat,
  mai nello staging.

Collaudo prima di attivare (tutto senza inviare nulla agli ospiti):

| Verifica | Come |
|---|---|
| Una prenotazione reale | lettura manuale dalla Staff App ("Leggi le notifiche"), controllo campo per campo con QuoVai |
| Identificativi delle camere | confronto con Q1.2; alias aggiornati in `data/rooms.js` |
| Modifiche e cancellazioni | una modifica e una cancellazione reali (o di prova in QuoVai) lette e confrontate |
| Nessuna prenotazione LunArt importata | la notifica LunArt viene rifiutata ("altra struttura"), già coperto dai test; verificato anche sulla casella reale |
| Anteprima delle email | "Controlla destinatari" mostra chi riceverebbe la guida e perché; il testo è quello di `brand.guideEmailCopy` |
| Niente doppioni né invii retroattivi | una sola email per prenotazione; il recupero delle prenotazioni passate richiede l'approvazione esplicita della lista; lo scheduler resta spento finché non lo si approva |

### Q3 — Booking.com, Expedia, Airbnb

Nessuna integrazione diretta finché i dati che arrivano da QuoVai bastano. Si
verifica, su una prenotazione reale per canale, che la notifica QuoVai contenga:
nome, date, camera, numero ospiti, **email dell'ospite** (serve per la guida),
canale. Se per un canale manca un dato essenziale (tipicamente Airbnb collegato in
iCal, senza email), si valuta solo allora un'integrazione mirata o una procedura
manuale (inserimento dalla Staff App). Nessun accesso agli account OTA è necessario
per questa verifica.

### Q4 — Stripe e servizi

Restano spenti. Prima di accenderli: prezzi Bella Vigna, catalogo dei servizi
realmente offerti, accordi partner, account Stripe (proprio o condiviso con LunArt,
separato da `metadata.property`), webhook dedicato e riconciliazione, politiche di
cancellazione e rimborso. Nessun pagamento reale senza approvazione.

## Cosa puoi autorizzare oggi, e cosa aspetta

| Oggi | Quando colleghiamo QuoVai, Gmail e i canali |
|---|---|
| Pubblicare lo staging (solo dati dimostrativi) | Scelta della casella di lettura e del mittente |
| Leggere da QuoVai le informazioni Q1 (indirizzo notifiche, camere, portali, iCal) | Verifica di una prenotazione reale, modifica e cancellazione |
| | Validazione dei dati per canale (Q3) |
| | Attivazione dell'invio della Guest Guide (dopo anteprima e lista approvata) |
