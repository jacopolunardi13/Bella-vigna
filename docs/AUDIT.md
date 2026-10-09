# Bella Vigna — Guest Guide & Concierge · Audit e piano di replica

Data: 9 ottobre 2026 · Branch di lavoro: `ccr-412adc5b-p2jc5l` (repository `jacopolunardi13/Bella-vigna`).
Nessuna modifica a LunArt, a `main` o alla produzione.

## 1. Fonti: cosa è stato consultato davvero

| Fonte | Stato | Note |
|---|---|---|
| Property Pack v1 (Google Doc) | **letto per intero** | Source of truth per dati e decisioni dell'operatore. |
| Master Bible & Replication Playbook (Google Doc) | **letto per intero** | Riferimento funzionale; il §25 sullo stato LunArt è superato (v. §2). |
| Repository `jacopolunardi13/lunart` | **clonato in sola lettura**, tutti i branch | Nessuna scrittura (l'accesso è solo in lettura e non va modificato). |
| Repository `jacopolunardi13/Bella-vigna` | **analizzato** | Un solo file, `index.html` (giugno 2026). Preservato, v. §4. |
| Drive `img-sito-bellavigna` | **parziale** | Il connettore vede 3 file (`image00027/31/45.jpeg`, 7–14 MB ciascuno). Non scaricati: il connettore li restituisce come base64 nel contesto, troppo grandi. |
| Drive `nuove foto settembre 2026` | **non accessibile** | La cartella esiste (metadati letti) ma il connettore non restituisce alcun file al suo interno. Non consultata. |
| Email "Testi per Lunart e Bellavigna", "Testi sito", email con il logo | **non consultate direttamente** | Il Property Pack ne riporta la sintesi; il logo oro è stato ricavato dalla pagina BV di giugno, dove è incorporato identico. |

Foto usate nella guida: le 10 fotografie Bella Vigna e il logo già incorporati (base64) nella pagina di giugno, estratti senza alterazioni in `assets/img/_src/`. Nessuna immagine LunArt.

> **Aggiornamento 9 ottobre 2026.** Le due cartelle Drive (71 foto) sono state lette integralmente tramite i loro link pubblici e la guida usa ora 16 fotografie scelte da lì, attribuite camera per camera (`assets/img/_src/README.md`). Il logo è ora il file originale `Bella_Vigna_logo_oro_classico.jpg` dell'email di Valentina Longo dell'11 marzo 2026, estratto dal messaggio completo (il connettore Gmail non scarica gli allegati singolarmente, ma restituisce il messaggio MIME intero). Le righe sopra descrivono lo stato al momento dell'audit.

## 2. LunArt: stato reale e baseline stabile

| Ref | Commit | Cosa contiene |
|---|---|---|
| **`golden/lunart-production-2026-10-08`** | **`51ac362`** | Merge PR #3. **Baseline scelta**: 803/803 test verdi (eseguiti qui). |
| `main` | `eac9b68` | `51ac362` + 2 commit dell'8/10: "Cash sprint" Return Pass (campagna LunArt a scadenza 16/10, tetto 6k€). Non replicata: è una campagna commerciale LunArt, non Core. |
| `fable/guest-guide-v2` | `34d0bbd` | Branch di sviluppo v2, già fuso in `main` (PR #1). Il Master Bible §25 lo indica ancora come "dev branch, main non aggiornato": non più vero. |
| `finalize/guest-guide-content`, `fix/children-cot-extra-bed-rule` | `e98dd58`, `347f11f` | Fusi (PR #2, #3). |
| `cash-sprint-return-pass`, `cash-sprint/shared-hard-cap-oct2026` | +3 / +10 commit | Lavoro sulla campagna Return Pass (ledger condiviso del tetto). Non stabile per la replica. |

### Funzionalità effettivamente implementate in LunArt @ 51ac362

| Area | Stato in LunArt | In Bella Vigna |
|---|---|---|
| Guest Guide statica + PWA, offline, service worker network-first | operativo | replicato |
| Knowledge base unica guida/Concierge, review `?review=1` | operativo | replicato, contenuti BV |
| Concierge deterministico con escalation | operativo | replicato + rinvio a persona per argomenti che BV non pubblica |
| Link personale opaco `/g/<token>`, recupero `/recover` | operativo | replicato |
| Email Guest Guide T-3 alle 10:00, catch-up dry-run/confirm | implementato; reale con credenziali Gmail | replicato; **nessun mittente predefinito** |
| Pass Standard, Privilege, stati, QR rotante HMAC, validazione venue | operativo | replicato; Privilege **non vendibile** finché nessun accordo partner è confermato per BV |
| Rete partner active/activating | operativo (3 attivi, 29 in attivazione) | stessa rete; **tutti in attivazione** per BV |
| Catalogo (hair, colazione/brunch, vino, celebration, NCC, bagagli, Privilege) | operativo, prezzi confermati | stesso catalogo, **prezzi placeholder** (vendibili solo in staging) |
| Stripe Checkout, webhook firmati, capture manuale, rimborsi, cancellazioni per riga | operativo (chiavi test) | replicato + tag `property` e scarto eventi altrui |
| Staff PWA, code, prenotazioni, sync, push | operativo; push simulate senza VAPID | replicato, "Bella Vigna Staff" |
| QuoVai email (Gmail) | implementato, attende credenziali | replicato + rifiuto notifiche di altre strutture |
| QuoVai API/webhook | solo interfaccia, attende QuoVai | idem |
| iCal safety net | implementato, attende URL feed | idem, per stanza con id BV |
| Calendario parrucchiere (Google) | implementato, attende credenziali | idem |

## 3. Repository Bella Vigna esistente

`index.html` (2,9 MB, 4 commit "Add files via upload", 4–10 giugno 2026): sito vetrina statico con 14 immagini base64 (logo ×3, 11 foto), chatbot a parole chiave.

**Preservato**: spostato senza alcuna modifica in `legacy/index.html` (SHA-1 identico verificato). Non è servito dal server (cartella privata) e non è fonte di verità: diverse sue promesse contraddicono il Property Pack.

| La pagina di giugno dice | Property Pack | Nella guida |
|---|---|---|
| Check-in dalle 15:00, check-out entro le 11:00 | orari da confermare, non trasferire né 14–22 né 15–20 | "orari confermati prima dell'arrivo" + blocker |
| Self check-in con smart lock, Diego 24/7 | check-in di persona con Diego; fuori orario self check-in **guidato** | così |
| Diego chiede al Comune il permesso ZTL | il garage gestisce la targa; non garantire nulla | procedura da confermare, blocker |
| Garage Tornabuoni "5 min, €25–40/giorno, 7–24" | Via dell'Inferno 7/9R, ~2 min; tariffe da confermare | indirizzo + ~2 min, niente tariffe |
| Light breakfast incluso al Caffè Amerini | colazione modello LunArt (Opera Caffè) | solo Opera Caffè, se inclusa nella tariffa |
| WhatsApp/telefono Diego +39 334 211 5505 | WhatsApp = linea Business LunArt condivisa | WhatsApp +39 392 566 1488; Diego al telefono (da confermare) |
| Email bellavigna.firenze@gmail.com | info@bellavignafirenze.it da verificare | nessuna email pubblicata |

## 4. Strategia di riuso del Core

**Clone controllato della release stabile + modulo d'identità struttura + dati separati** (Master Bible §22-B: "partire dalla release LunArt stabile, sostituire solo configurazione/property data, trasformare le differenze inevitabili in config").

1. **Import** (`99454e8`): albero LunArt @ `51ac362`, esclusi foto, dipinto e marchio LunArt. Diff leggibile verso LunArt.
2. **Delta Core** (`f52b2c3`, dettagli in `docs/CORE-DELTA.md`): ogni "LunArt" cablato ora legge `data/brand.js`; registro camere configurabile; guardie d'isolamento. Verificato con l'identità LunArt: la suite LunArt resta verde salvo le differenze volute (prefisso struttura nelle push). Proposta di upstream a LunArt tramite PR, **non eseguita** (nessun accesso in scrittura e nessuna modifica a LunArt richiesta ora).
3. **Dati Bella Vigna**: `data/` (contenuti), `commerce/prices.js` (placeholder), `commerce/partners.js` (`PROPERTY_AGREEMENTS`), asset in `assets/img/`.

Separazione richiesta dal Master Bible:

| Livello | Dove |
|---|---|
| Core condiviso | `server/`, `src/`, `commerce/*.js` tranne prezzi/partner/catalogo, `sw.js`, HTML shell |
| Configurazione struttura | `data/brand.js`, `data/property.js`, `data/rooms.js`, `data/entries/`, `data/florence.js` |
| Commerce della struttura | `commerce/prices.js`, `commerce/partners.js` (`PROPERTY_AGREEMENTS`), `commerce/catalog.js` |
| Prenotazioni e dati personali | store della singola istanza (`GUIDE_DATA_DIR`), timbrato `bella-vigna` |
| Branding e contenuti | `assets/img/`, `assets/css/app.css` (token), `tools/make-bella-vigna-assets.py` |
| Integrazioni e credenziali | solo variabili d'ambiente (`.env.example`), mai nel repository |
| Staging / produzione | servizi distinti; `render.yaml` = solo staging (`GUIDE_PREVIEW=1`) |

**Isolamento tra strutture** = istanze separate (origin, disco, token Staff, chiave firma card, VAPID, webhook) **più** guardie nel codice che rendono rumoroso ogni errore di configurazione:

- store timbrato `meta.property_id`; uno store di altra struttura (o non timbrato e non vuoto) blocca l'avvio e non viene mai scritto;
- Stripe: `metadata.property` su sessione e payment intent; il webhook ignora eventi di altre strutture;
- QuoVai: notifica con "Struttura" diversa → rifiutata + alert, nessun dato ospite letto;
- variabili `LUNART_*` non lette; chiavi di storage browser `bellavigna.*`;
- file non pubblici (`server/`, `test/`, `legacy/`, dotfile…) non serviti.

Perché non un'unica istanza multi-struttura adesso: richiederebbe di riscrivere store, routing e Staff con tenant per richiesta — una modifica architetturale sostanziale al Core di LunArt in produzione. Il Master Bible (§22-D) la rimanda a una fase successiva (modulo Vesta). Il delta di questo branch è il primo passo compatibile: un solo Core, identità per configurazione.
