# Delta Core rispetto a LunArt @ 51ac362

Ogni modifica al codice condiviso fatta in questo branch, perché, e se è pronta da
riportare in LunArt. Il confronto completo è `git diff 99454e8 -- server src commerce sw.js staff-sw.js tools`
(il commit `99454e8` è l'import esatto di LunArt).

**Regola**: un cambiamento valido per tutte le strutture va riportato nel Core di
LunArt con una PR sul suo repository, revisionata e testata lì; una differenza solo
di Bella Vigna resta in `data/` o nei file commerce della struttura. Con
l'autorizzazione del 9 ottobre le modifiche arrivano a LunArt con PR piccole, da
branch dedicati, senza merge automatico: la prima è jacopolunardi13/lunart#6.

## Verifica di non regressione per LunArt

La suite di LunArt è stata eseguita sul Core modificato con l'identità e il registro
camere di LunArt (`PROPERTY_ID = 'lunart'`, camere 301–306): **792/803**. Le 11
differenze sono tutte attese: 5 sono il prefisso struttura nei titoli push (voluto),
4 sono file già rinominati per Bella Vigna nella copia (`staff.html`, `sw.js`,
asset), 2 richiedono una working copy git. Nessuna regressione funzionale.

## Modifiche (tutte compatibili con LunArt, da proporre upstream)

| Area | File | Cosa | Perché |
|---|---|---|---|
| Identità | `data/brand.js` (nuovo), ~25 file core | Nome, prodotti (Pass/Privilege), Staff, chiavi storage, mittente, calendario, asset letti da un modulo | Un solo Core per più strutture, nessuna schermata con il nome sbagliato |
| Tenant | `server/store.js`, `server/app.js`, `server/index.js` | Store timbrato `meta.property_id`; store altrui o non timbrato con dati → `TenantMismatchError`, avvio bloccato, nessuna scrittura | Impedisce di leggere/sovrascrivere i dati di un'altra struttura |
| Tenant | `server/config.js` | `GUIDE_PREVIEW`, `GUIDE_DATA_DIR`, `GUIDE_DEV_PRICES` al posto di `LUNART_*` | Un env copiato da LunArt non punta ai dati LunArt |
| Stripe | `server/app.js` | `metadata.property` su session e payment intent; `handleStripeEvent` ignora eventi taggati per altre strutture | Account Stripe eventualmente condiviso |
| QuoVai | `server/ingest/quovai-email.js`, `server/ingest/index.js` | "Struttura" diversa → `other-property`, alert, nessun dato ospite; classificatore da `brand.quovaiSubjectPattern` | Casella eventualmente condivisa |
| Camere | `commerce/rooms.js`, `server/ingest/quovai-email.js`, `server/ingest/ical.js`, `server/dev-seed.js` | Registro camere (`roomRegistry` in `data/rooms.js`) con id e alias; regex costruite dal registro; `roomLabel` | Bella Vigna ha camere con nome, non numeri |
| Mail | `server/mail/gmail.js` | Nessun mittente predefinito: senza `MAIL_FROM` il mailer è "non configurato" e tutto resta simulato | Non indovinare mai un mittente |
| Email | `server/delivery.js` | Testo dell'email Guest Guide in `brand.guideEmailCopy` | Il testo LunArt prometteva servizi non validati per BV |
| WhatsApp | `src/ui/components.js`, `src/ui/views.js`, `src/concierge/ui.js`, `server/app.js` (contatto ordine Staff) | Link `wa.me` con testo precompilato che nomina la struttura, sia ospite → struttura sia Staff → ospite | Linea WhatsApp condivisa |
| Push | `server/push.js`, `staff-sw.js` | Titolo `«Struttura» · …`, tag e campo `property` | Lo stesso telefono riceve due strutture |
| Dati riservati | `server/private-facts.js` (nuovo), `server/app.js`, `src/guest.js`, `src/ui/sheet.js` | `WIFI_PASSWORD` (mai in preview) consegnata solo al link personale di un soggiorno attivo (dal giorno prima a check-out) | Password mai nel repository né nella guida pubblica |
| Sicurezza | `server/http.js` | `server/`, `test/`, `tools/`, `docs/`, `legacy/`, `node_modules/`, dotfile, `package*.json`, `render.yaml` non serviti | Il server serviva qualunque file della root (es. un `.env` dimenticato) |
| Concierge | `src/concierge/intents.js`, `src/concierge/engine.js`, `src/concierge/lexicon.js` | Intent senza voce nella struttura scartati; domande su argomenti non pubblicati → persona; concetto `terrace` | Non rispondere con fatti di un'altra struttura |
| UI | `src/i18n.js` | Nomi da `brand`; `brand.uiOverrides` per le frasi che sono fatti della casa (nota Pass) | Stessa UI, contenuti per struttura |
| Checkout | `commerce/ordering.js` | `validateLine` rifiuta un prodotto `requiresPartners` (Privilege) se nessun partner offre un vantaggio della card (`not-on-sale`, `no-card-partner`) | **Bug del Core**: la regola era applicata solo in UI (`isPurchasable`); una chiamata diretta a `/api/checkout` comprava una card senza alcun locale dietro |
| Scheda prodotto | `src/commerce/ui/product-sheet.js`, `src/i18n.js` | Un prodotto `requiresPartners` senza partner mostra il motivo (`noCardPartnerBody`) invece di modulo, durate, prezzi e totale | La scheda contraddiceva la vetrina: prezzi e modulo per una card non in vendita |
| Footer statico | `index.html`, `src/main.js` | Link WhatsApp e etichette del footer seguono la lingua (`data-whatsapp`, `data-it`/`data-en`) | Sulla guida inglese il footer restava in italiano |
| Camere negli ordini | `server/app.js` (`roomForOrder`), `src/commerce/ui/product-sheet.js`, `src/commerce/ui/cart-sheet.js`, `src/staff/app.js` | La camera digitata è letta tramite il registro (`deluxe`, `Terrace` → id); input camera con tastiera testuale, lunghezza e esempio dal registro (`ROOM_INPUT`); select Staff da `ROOM_IDS` | Con camere-parola l'ospite veniva rifiutato o vedeva un tastierino numerico con "303" |
| QuoVai | `server/ingest/quovai-email.js` | Una riga che contiene la nota dell'ospite (anche "Note: …") non è mai letta come camera; nel lettore di ultima istanza conta solo la parte prima del primo `|` | "vorremmo la camera con terrazza" veniva assegnata; "Tariffa: standard" veniva letta come camera Standard |
| Immagini | `tools/optimize-images.mjs` | Genera sempre tutte le larghezze (mai ingrandendo) | `picture()` chiede sempre la -1024: con sorgenti < 1024 px restava un buco servito come HTML |
| Views | `src/ui/home.js`, `src/commerce/ui/pass.js` | Immagine "Scopri Firenze" e hero da `brand`; titolo camera da `roomLabel` | Nessuna foto LunArt |

## Staff App unica (console) — in LunArt con la PR #6 per la parte che riguarda le strutture

| Area | File | Cosa | In LunArt |
|---|---|---|---|
| Accesso Staff API | `server/app.js`, `server/config.js`, `server/http.js` | `CONSOLE_SERVICE_TOKEN` accettato insieme a `STAFF_TOKEN`; `STAFF_TOKEN_RETIRED` ritira il token condiviso e porta `/staff` alla console; confronto dei token in tempo costante (`sameSecret`) | PR #6 |
| Identità nelle risposte | `server/app.js` | `property` in ogni risposta Staff, `rooms` nella dashboard | PR #6 (LunArt: costante `lunart`) |
| Notifiche | `server/relay.js`, `server/push.js` | Relay firmato HMAC verso la console, mai bloccante | PR #6 |
| Salute | `server/app.js` | `integrations.staffConsole` (mai segreti) | PR #6 |
| Console | `server/console/*`, `data/console.js`, `console.html`, `console-sw.js`, `src/staff/app.js` (modalità console) | La console stessa | Vive qui; a regime nel Core condiviso (`docs/CORE-STRATEGIA.md`) |
| Pagina guida | `server/app.js` | La guida non serve `console.html` né `console-sw.js` (un service worker della console prenderebbe lo scope della guida) | con la console |

## Segnalazioni per LunArt (non corrette lì)

0. **Checkout Privilege senza partner** (v. tabella): in LunArt oggi è latente perché i partner esistono, ma è lo stesso buco. Da riportare per primo.
7. Su `main` @ eac9b68 un test fallisce già (`test/pass.test.mjs` › "each moment leads with what that moment is for": atteso `wine-in-room`, ora `privilege-card`) e il QA `qa-reservations` segnala la home personale lunga 6,3 schermate: entrambi dal commit 0269afd (offerte Privilege-first), non dalle PR di questo lavoro.
1. `commerce/prices.dev.js` sovrascrive in anteprima la Light Breakfast con **1 €** anche se in `prices.js` è confermata a 49 € (il commento "è l'unico prodotto senza prezzo" è superato). In anteprima LunArt la colazione in camera appare a 1 €. Corretto qui (Bella Vigna: nessun fixture sovrascrive un prezzo esistente).
2. `server/http.js` → `serveStatic` serve qualunque file sotto la root del repository, inclusi sorgenti server e un eventuale `.env`. Corretto qui (v. tabella).
3. `tools/optimize-images.mjs` non genera la variante -1024 per sorgenti larghe meno di 1024 px (v. tabella).
4. `test/cache.test.mjs` lascia un timer aperto: il file impiega 60 s a terminare (anche in LunArt).
5. `server/ingest/quovai-email.js`: una nota sulla stessa riga dell'etichetta ("Note: la camera 305") era letta come camera anche in LunArt.
6. `total_amount` resta vuoto sulle notifiche QuoVai reali: l'intestazione "Prezzo totale" della tabella è letta come etichetta con valore "Stato" (anche in LunArt; nessun test lo verifica).
