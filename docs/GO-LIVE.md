# Bella Vigna — Go-live checklist

Solo ciò che serve **confermare o fornire** per attivare la produzione. Ogni voce dice
chi deve rispondere e dove va applicata la risposta. Nulla qui è stato inventato per
riempire un vuoto: finché una voce è aperta, la guida la dichiara o la nasconde.

La lista completa e sempre aggiornata dei punti di contenuto è la schermata di
revisione: **`/?review=1`** sull'anteprima (invisibile agli ospiti).

## 0. Prossimo passo: cosa serve adesso, e cosa può aspettare

Stato reale di ogni integrazione (A sviluppato · B testato · C integrato · D validato ·
E attivo) e piano QuoVai-first: `docs/INTEGRAZIONI.md`. Oggi nessuna integrazione di
Bella Vigna è oltre lo stato B. Migrazione della Staff App: `docs/MIGRAZIONE-STAFF.md`.

| Serve per il prossimo passo | Può aspettare l'apertura al pubblico |
|---|---|
| Pubblicare lo staging su Render (un'azione sul tuo account) | Tutte le voci A, B, D qui sotto |
| Da QuoVai Bella Vigna, in sola lettura: indirizzo che riceve le notifiche, nomi/codici e capienza delle camere, portali collegati e come, URL iCal (Q1) | Mittente email, Stripe, dominio |

## A. Conferme dell'operatore — contenuti bloccanti

| # | Da confermare | Dove si applica |
|---|---|---|
| A1 | **Orario di check-in** e fino a che ora l'accoglienza è di persona (agenzia 14–22 vs LunArt 15–20/20:30) | `data/entries/arrival.js` → `checkin` (togliere il `verify`) |
| A2 | **Orario di check-out** (non presumere le 11:00) | `data/entries/departure.js` → `checkout` |
| A3 | **Accesso**: piano, ascensore, scale, portone, tipo di serrature/chiavi | `data/entries/arrival.js` → `access`; `data/entries/stay.js` → `accessibility` |
| A4 | **Procedura self check-in fuori orario**: come arrivano codici/istruzioni all'ospite (canale privato, mai nella guida) | `late-arrival`; se serve un canale nel sistema, nuova "private fact" come il Wi-Fi |
| A5 | **Identificativi QuoVai/PMS delle 3 camere** e **capienza** di ciascuna | `data/rooms.js` → `roomRegistry` (alias) e `verify` delle camere; `children` in `stay.js` |
| A6 | ~~Bagno della camera con terrazza: turchese o pietra?~~ **Risolto** dalle foto Drive: è lo stesso bagno (pareti in pietra, doccia turchese). Resta da confermare se anche la **Standard ha il frigobar** (si vede nella foto `rooms/standard-dotazioni`; il testo lo attribuisce solo alla Terrazza) | `data/rooms.js` → `roomsCommon` e `verify` della Standard |
| A7 | **Colazione**: orario all'Opera Caffè, cosa copre il ticket, in quali **rate plan** è inclusa | `data/entries/breakfast.js` → `breakfast` |
| A8 | Deposito bagagli all'Opera Caffè per ospiti Bella Vigna: come vengono riconosciuti | `luggage-early`, `luggage-late` |
| A9 | **Garage Tornabuoni / ZTL**: prenotazione (link), tariffa, orari, procedura targa, copertura ingressi/uscite | `data/entries/arrival.js` → `parking`, `ztl` |
| A10 | **Tassa di soggiorno**: importo e tetto per la categoria di Bella Vigna | `city-tax` |
| A11 | Pulizia quotidiana reale; policy fumo (anche in terrazza); animali; culla/letto aggiuntivo | `stay.js` → `cleaning`, `smoking`, `pets`, `children` |
| A12 | Numero di Diego per gli ospiti Bella Vigna (+39 334 211 5505, dalla config LunArt) | `data/property.js` → `contacts.diego.verify` |
| A13 | Condizioni di prenotazione dirette di Bella Vigna (se diverse da "fa fede la conferma") | `help.js` → `booking-terms` |
| A14 | **Logo** `Bella_Vigna_logo_oro_classico.jpg` e **16 foto** autorizzati per lo staging (9 ottobre); approvazione definitiva dopo la visione dell'anteprima da smartphone. Esiste un file vettoriale per la stampa? (elenco foto e motivi in `assets/img/_src/README.md`) | `assets/img/_src/`, `tools/import-room-photos.py`, poi `python3 -I tools/make-bella-vigna-assets.py` e `node tools/optimize-images.mjs` |
| A15 | Consigli su Firenze: confermare che valgono anche per Bella Vigna (sono quelli LunArt, senza distanze) | `data/entries/florence.js` → `eat.verify` |

## B. Canali e identità

| # | Da fare / confermare | Note |
|---|---|---|
| B1 | **WhatsApp Business condiviso** (+39 392 566 1488): nome e foto profilo che vede l'ospite BV; instradamento a Diego; etichette e risposte rapide che nominano la struttura | Dettagli in `docs/WHATSAPP.md`. La guida apre ogni chat con "Scrivo da ospite di Bella Vigna Firenze" |
| B2 | **Mittente email** delle Guest Guide (es. info@bellavignafirenze.it): account, operatività, autorizzazione Gmail **solo invio**, separata dalla lettura | `MAIL_FROM`, `MAIL_PROVIDER=gmail`, `GMAIL_SEND_CLIENT_ID/SECRET/REFRESH_TOKEN` (scope `gmail.send`) |
| B3 | Dominio/sito e Instagram ufficiali | `data/property.js` → `unverifiedContacts` |
| B4 | **Wi-Fi**: verificare il QR fisico nelle 3 camere; se si vuole la password come riserva sul link personale, inserirla **solo** come variabile `WIFI_PASSWORD` del servizio di produzione | Mai nel repository, nei log o in documenti |

## C. Integrazioni e credenziali (solo variabili d'ambiente del servizio di produzione)

| # | Variabile/i | Prerequisito |
|---|---|---|
| C1 | `RESERVATION_MAILBOX=gmail`, `GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN` (scope `gmail.readonly`), `GMAIL_QUERY` | Casella che riceve le notifiche **QuoVai di Bella Vigna** (non è quella di Jacopo: da identificare, Q1); leggere una notifica reale e confermare l'etichetta "Struttura" (`brand.quovaiPropertyNames`) e il formato camere (A5). API QuoVai non usate (a pagamento; decisione del 9/10/2026) |
| C2 | `QUOVAI_ICAL_FEEDS=Standard:…,Deluxe:…,Terrazza:…`, `ICAL_POLL_MINUTES` | URL dei feed iCal di Bella Vigna; prima "Esamina i feed" dallo Staff |
| C3 | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Decidere: account Stripe proprio o condiviso con LunArt. Se condiviso, gli eventi sono separati da `metadata.property`; webhook dedicato all'URL di produzione BV |
| C4 | `CARD_SIGNING_KEY`, `STAFF_TOKEN` | Nuovi, generati per Bella Vigna. **Mai** quelli di LunArt |
| C5 | `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` | Con la Staff App unica le notifiche partono dalla **console** (una coppia VAPID per la console, non per struttura); **elenco dei dispositivi Staff autorizzati** (Diego) |
| C6 | `GUIDE_DATA_DIR` su disco persistente | Disco proprio del servizio BV (lo store si timbra `bella-vigna`) |
| C7 | `PUBLIC_URL` | URL stabile di produzione (dominio da decidere) |

## D. Commerce, partner, prezzi

| # | Da confermare | Dove si applica |
|---|---|---|
| D1 | **Accordi partner per Bella Vigna**: Opera Caffè (30% LunArt), Le Firme (10% Privilege), Blue Velvet (lista ≤15 € + 20% tavoli) — validi anche per BV? come riconoscono l'ospite? | `commerce/partners.js` → `PROPERTY_AGREEMENTS[id].status = 'confirmed'` (uno per partner). Con almeno un partner Privilege confermato la Privilege Card torna acquistabile da sola |
| D2 | **Prezzi** di ogni servizio per Bella Vigna (oggi tutti `placeholder` = prezzi LunArt) | `commerce/prices.js` → `status: 'confirmed'` riga per riga; un prezzo non confermato non viene venduto in produzione |
| D3 | Quali servizi esistono davvero a BV: colazione/brunch in camera (sono prodotti dell'Opera Caffè, il cui accordo per BV è ancora da confermare: oggi vendibili solo in staging), vino in camera, parrucchiere (professionista e orari), celebration (fornitore), transfer NCC e bagagli (fornitore, cutoff, cancellazione) | Prezzi (D2), `commerce/schedule.js` per gli orari del parrucchiere, voci `hair-in-room`, `celebration-in-room`, `breakfast-room`, `transfer` |
| D4 | Testo del vantaggio Opera Caffè per BV una volta confermato | `data/entries/breakfast.js` → `opera-benefit` |

## E. Decisioni di pubblicazione

| # | Decisione | Note |
|---|---|---|
| E1 | Servizio di **produzione** separato dallo staging (Render o altro), con disco persistente | `render.yaml` descrive solo lo staging (`GUIDE_PREVIEW=1`). La produzione è un servizio nuovo, **senza** `GUIDE_PREVIEW` |
| E2 | Merge del branch in `main` | Se `main` del repository Bella Vigna è pubblicato (es. GitHub Pages), il merge sostituisce la pagina di giugno con la guida (la pagina resta in `legacy/`, non servita) |
| E3 | Approvazione del Core delta per LunArt (`docs/CORE-DELTA.md`) | PR separata sul repository LunArt, testata lì |

## E-bis. Staff App unica (decisioni del 9 ottobre 2026: approvate)

Bella Vigna **non** pubblica una propria Staff App: si opera dalla console unica per
LunArt e Bella Vigna (`docs/STAFF-UNIFICATA.md`), costruita e provata in staging. La
`/staff` di questo server resta solo come banco di prova delle API.

| # | Da fare per la produzione | Note |
|---|---|---|
| S1 | Approvare e fare il merge della PR LunArt #6 (ponte verso la console), poi il deploy di LunArt | Senza variabili nuove non cambia nulla in produzione |
| S2 | Dove vive la Staff App unica in produzione: **sull'indirizzo della Staff App LunArt attuale, `/staff`** (stessa icona, nessuna nuova installazione; consigliato) oppure su un indirizzo dedicato (una nuova installazione guidata). Archivio persistente, `CONSOLE_SETUP_CODE` nuovo | `docs/MIGRAZIONE-STAFF.md`. Le passkey sono legate all'indirizzo: quelle dello staging non passano alla produzione |
| S3 | `CONSOLE_SERVICE_TOKEN` e `CONSOLE_RELAY_SECRET` nuovi per ciascuna struttura, gli stessi valori sulla console | Mai quelli dello staging, mai `STAFF_TOKEN` |
| S4 | Primo accesso del titolare, inviti a Valentina e Diego, notifiche attivate sui loro telefoni | Consegna dei link di persona |
| S5 | Ritiro del token condiviso: `STAFF_TOKEN_RETIRED=1` su LunArt e Bella Vigna quando tutti usano la console | Reversibile togliendo la variabile |
| S6 | `CONSOLE_VAPID_*` (o quelle generate dalla console, conservate nel suo archivio) | Una sola coppia per la console |

## F. Sequenza di attivazione (dal Master Bible §26, adattata)

1. Chiudere A, B, D (contenuti e condizioni) → `/?review=1` senza blocker.
2. Servizio di produzione con disco persistente, `PUBLIC_URL`, `STAFF_TOKEN`, `CARD_SIGNING_KEY` propri.
3. VAPID → registrare i telefoni Staff autorizzati → "Invia una notifica di prova".
4. Gmail lettura (QuoVai BV) → poll manuale → verificare 1 prenotazione reale (camere, struttura).
5. Gmail invio → email di prova a un indirizzo interno.
6. Catch-up: **"Controlla destinatari"** (dry-run) → approvazione esplicita della lista → invio.
7. Scheduler email normale (`DELIVERY_POLL_MINUTES`).
8. Stripe live + webhook live → pagamento reale controllato → rimborso/cancellazione.
9. Privilege/QR end-to-end presso un partner confermato (attivo / futuro / scaduto).
10. Restart del servizio con dati persistenti; revisita da un telefono con cache precedente.
11. Smoke test completo → apertura agli ospiti.

Nessuna email reale, nessun pagamento live e nessuna modifica di produzione prima dell'approvazione esplicita di ciascun passo.
