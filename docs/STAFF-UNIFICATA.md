# Una sola Staff App per LunArt e Bella Vigna

Decisione vincolante dell'operatore (Property Pack §9, 9 ottobre 2026): **due Guest
Guide indipendenti, una sola Staff App** per entrambe le strutture, con un accesso
per operatore, filtri Tutte | LunArt | Bella Vigna, permessi lato server per utente,
ruolo e struttura, notifiche centralizzate e possibilità di aggiungere strutture.

Questo documento: (1) com'era la Staff App LunArt, (2) la soluzione, (3) cosa cambia
nei due repository e in che ordine, (4) le decisioni prese, (5) cosa è stato
costruito, (6) il recupero dell'accesso, (7) il ritiro del token condiviso.

## 1. Audit: la Staff App LunArt @ 51ac362

| Elemento | Com'è oggi |
|---|---|
| Interfaccia | PWA a `/staff` sulla stessa origine della guida: `staff.html` + `src/staff/app.js` (~1400 righe, JS senza build), service worker `staff-sw.js`, manifest dinamico |
| API | `/api/staff/*` sul server della struttura (~25 endpoint: dashboard, code ordini, azioni su ordini, prenotazioni, link guida, sync QuoVai/iCal, catch-up email, rimborsi, alert, push) più `/api/provider/*` |
| Autenticazione | **un solo token condiviso** (`STAFF_TOKEN`) in `Authorization: Bearer`, salvato sul telefono. Nessun utente, nessun ruolo, nessun log di chi ha fatto cosa. Senza token in produzione l'API è chiusa |
| Dati | archivio della singola struttura (un file JSON su disco); la Staff App vede solo quello |
| Notifiche | Web Push con chiavi VAPID del server; iscrizioni salvate nell'archivio della struttura; 5 eventi (nuovo ordine, in attesa, annullamento ospite, nuova prenotazione, da verificare) |
| Multi-struttura | assente: ogni server è una struttura. Con due deploy avremmo due app, due token, due iscrizioni push sul telefono di Diego |

Cosa è già stato preparato in questo branch, valido per qualunque soluzione:
- ogni risposta Staff (`/dashboard`, `/orders`, `/reservations`, `/sync`) dichiara `property: { id, name, longName }`;
- ogni prenotazione e ordine nella vista Staff porta `property`;
- le notifiche push portano `property` nel payload e il nome della struttura nel titolo;
- gli archivi sono timbrati per struttura e un server rifiuta l'archivio di un'altra.

## 2. Soluzione proposta: una console Staff sopra le API delle strutture

```
                 ┌──────────────── Staff Console (una PWA, un'origine) ───────────────┐
 Diego, Valentina│ login per operatore · ruoli · permessi per struttura · audit log   │
 Jacopo (telefoni│ dashboard aggregata · filtro Tutte/LunArt/Bella Vigna · push unici  │
                 └──────┬─────────────────────────────────────────────┬───────────────┘
        credenziale di servizio LunArt                   credenziale di servizio BV
        (solo lato server, mai al browser)               (solo lato server)
                        │                                              │
               ┌────────▼────────┐                            ┌────────▼────────┐
               │ server LunArt   │  archivio LunArt           │ server Bella    │ archivio BV
               │ guida + API     │  (invariato)               │ Vigna: guida +  │ (timbrato)
               └─────────────────┘                            │ API             │
                                                              └─────────────────┘
```

- **Una sola Staff App**: è la Staff App LunArt esistente (`src/staff/app.js`),
  estesa con selettore di struttura, badge di provenienza su ogni riga e viste
  aggregate. Nessuna seconda app: le pagine `/staff` dei singoli server, al go-live,
  rimandano alla console.
- **Utenti, ruoli, strutture** (nuovo, lato server della console): ogni operatore ha
  il proprio accesso; il ruolo decide le azioni (es. solo direzione/admin per
  rimborsi e catture di pagamento), l'elenco strutture decide cosa vede. Ogni
  richiesta è verificata lato server prima di essere inoltrata; il filtro in
  pagina è solo comodità. Ogni azione è registrata con operatore, struttura e ora.
- **Dati separati**: prenotazioni, ospiti, ordini, pagamenti e automazioni restano
  negli archivi delle singole strutture. La console conserva solo utenti, sessioni,
  iscrizioni push e registro azioni; i dati ospite la attraversano senza essere
  salvati. Una struttura aggiunta in futuro è una riga di configurazione della
  console, non una copia dell'app.
- **Notifiche centralizzate**: i server delle strutture inviano i loro eventi alla
  console (chiamata firmata); la console deduplica e li spinge solo ai dispositivi
  degli operatori autorizzati per quella struttura, con badge "LunArt ·" /
  "Bella Vigna ·". Un telefono, una iscrizione.
- **Stessa codebase**: la console è una modalità del Core (`GUIDE_MODE=console`),
  non un progetto separato.

### Perché questa e non le alternative

| Alternativa | Perché no (per ora) |
|---|---|
| Un unico server con entrambe le strutture dentro | Richiede di migrare LunArt in produzione su un server nuovo: è il rischio che la decisione chiede di evitare. Resta possibile più avanti (modulo multi-struttura, Master Bible §22-D) |
| La PWA tiene i due token e chiama i due server | Nessun utente né ruolo, token sul telefono, permessi solo in pagina: non rispetta "permessi lato server per utente, ruolo e struttura" |
| Due Staff App | Escluso dalla decisione |

**LunArt in produzione non va toccato per partire**: la console può usare l'API Staff
LunArt così com'è (con il suo token, conservato solo sul server della console). Le
modifiche a LunArt servono per migliorare, non per iniziare, e arrivano via PR.

## 3. Piano e repository

| Passo | Dove | Tocca LunArt prod? | Stato |
|---|---|---|---|
| 1. Console: persone/ruoli/strutture, proxy autorizzato, viste aggregate, filtri, registro | Core, in questo branch | No | fatto |
| 2. Staff App estesa (selettore struttura, badge, viste "Tutte", Accesso) | `src/staff/app.js`, stesso branch | No | fatto |
| 3. Notifiche centralizzate: relay firmato dalle strutture alla console | Core, stesso branch | No | fatto |
| 4. PR su LunArt: credenziale della console, ritiro progressivo del token condiviso, `property` nelle risposte Staff, relay | `jacopolunardi13/lunart#6` (bozza) | Solo dopo merge e deploy approvati; tutto spento senza variabili | aperta |
| 5. Staging: Bella Vigna + LunArt (branch della PR, in anteprima) + console | `render.yaml`, Render, servizi gratuiti | No | blueprint pronto |
| 6. Go-live: console in produzione, `/staff` delle strutture → console | dopo approvazione | Sì, con approvazione | da fare |

La PR LunArt è volutamente limitata al ponte verso la console: il resto del delta Core
(`docs/CORE-DELTA.md`) arriverà con PR separate. La strategia per dare al Core una
sola casa è in `docs/CORE-STRATEGIA.md`.

## 4. Decisioni (approvate dall'operatore il 9 ottobre 2026)

| # | Decisione |
|---|---|
| 1 | Approccio: console sopra le API delle strutture — **approvato** |
| 2 | Operatori: Jacopo titolare (entrambe, e strutture future), Valentina direzione (entrambe), Diego front desk (entrambe). Nessun altro utente per ora |
| 3 | Accesso con **passkey**, recupero affidabile, nessuna crittografia fatta in casa |
| 4 | Render; per ora solo staging, dominio definitivo più avanti; nessun costo senza approvazione |
| 5 | Accesso al repository LunArt: branch dedicato, worktree separato, test completi, PR revisionabile, nessun merge |
| 6 | Core: percorso meno invasivo, strategia documentata (`docs/CORE-STRATEGIA.md`) |

## 5. Cosa è stato costruito

| Pezzo | Dove |
|---|---|
| Server della console (`node server/console/index.js`) | `server/console/` |
| Persone e strutture | `data/console.js` (`CONSOLE_OPERATORS`, `CONSOLE_PROPERTIES`) |
| Passkey (WebAuthn) | `server/console/auth.js`, libreria `@simplewebauthn/server` 13.3.3; nel browser `@simplewebauthn/browser` 13.3.0 (copiata in `assets/vendor/`) |
| Ruoli e permessi, elenco delle rotte inoltrate | `server/console/permissions.js` |
| Chiamate alle strutture con credenziale lato server | `server/console/upstream.js` |
| Notifiche: relay firmato + push | `server/relay.js` (strutture), `server/console/notify.js` (console) |
| Archivio della console: file, Postgres o memoria | `server/console/store.js` |
| Registro azioni | `server/console/audit.js` |
| L'app: la stessa Staff App in modalità console | `src/staff/app.js` + `console.html`, `console-sw.js` |
| Lato strutture: credenziale della console, ritiro del token condiviso, relay | `server/app.js`, `server/config.js`, `server/push.js` (Bella Vigna); PR LunArt #6 |
| Test | `test/console.test.mjs` (33), browser `tools/qa-console.mjs` |
| Avvio locale completo | `node tools/console-local.mjs` |

### Ruoli

| | Front desk (Diego) | Direzione (Valentina) | Titolare (Jacopo) |
|---|---|---|---|
| Oggi, ordini (conferma, rifiuto, preparazione, consegna, contatto) | ✓ | ✓ | ✓ |
| Prenotazioni: inserire, modificare, link guida, email al singolo ospite, annullare | ✓ | ✓ | ✓ |
| Sincronizzazione: vedere, leggere le notifiche | ✓ | ✓ | ✓ |
| Annullare un ordine (può rimborsare), rimborsi, riconciliazione rimborsi | — | ✓ + passkey | ✓ + passkey |
| Invii email massivi (catch-up, email in scadenza) | — | ✓ + passkey | ✓ + passkey |
| Riparazione, recupero storico, iCal, alert, controlli integrazioni, registro | — | ✓ | ✓ |
| Accessi: inviti, recupero, revoche | — | — | ✓ + passkey |

"+ passkey" = conferma con la passkey negli ultimi 5 minuti, oltre alla conferma
esplicita in pagina. Credenziali, chiavi di pagamento e configurazioni economiche
**non sono nella console**: sono variabili d'ambiente dei servizi, gestite solo da chi
amministra l'hosting.

### Sicurezza, in breve

- Ogni richiesta è verificata sul server: sessione, ruolo, struttura. La console
  inoltra solo un elenco fisso di rotte, ricostruite dalla propria tabella.
- Le credenziali delle strutture restano sul server della console: mai al browser,
  mai nei log, mai nelle risposte (verificato dai test).
- Una struttura che risponde come un'altra viene rifiutata (indirizzo sbagliato in
  configurazione = errore, non dati nel posto sbagliato).
- Sessioni: cookie `__Host-` HttpOnly, Secure, SameSite=Strict; 72 ore di inattività,
  14 giorni al massimo. Richieste di modifica solo dalla stessa origine. CSP stretta,
  nessuno script inline, niente framing.
- Le notifiche arrivano solo a chi lavora per quella struttura.

## 6. Recupero dell'accesso

1. **Prevenzione**: ognuno registra due passkey (telefono e computer) dalla schermata
   *Accesso → Aggiungi un altro dispositivo*, oppure usa una passkey sincronizzata
   (portachiavi iCloud o Google): perdere il telefono non chiude fuori.
2. **Telefono perso (Diego o Valentina)**: il titolare, da *Accesso → Persone*, preme
   *Telefono perso*: ottiene un link valido 24 ore, una sola volta, da consegnare a voce
   o di persona. Quando la persona lo usa, tutte le sue vecchie passkey vengono
   revocate e i dispositivi disconnessi. Le singole passkey si possono anche revocare
   subito.
3. **Titolare senza più passkey**: con l'accesso all'hosting si legge
   `CONSOLE_SETUP_CODE` nelle impostazioni del servizio console, si usa *Primo accesso o
   ripristino* sulla pagina di accesso, e poi si cambia il codice. Il codice vale solo
   per il titolare, è limitato a 5 tentativi l'ora e ogni uso finisce nel registro.

## 7. Il token condiviso: sostituzione progressiva

1. Oggi: ogni struttura accetta il proprio `STAFF_TOKEN` (la vecchia Staff App).
2. Si aggiunge `CONSOLE_SERVICE_TOKEN` (solo la console lo conosce): funziona insieme al
   token condiviso, nessuno si ferma.
3. Tutti passano alla console e attivano le notifiche lì.
4. `STAFF_TOKEN_RETIRED=1`: il token condiviso smette di funzionare, `/staff` porta alla
   console. Si torna indietro togliendo la variabile.

Ogni passo su LunArt in produzione è un cambio di configurazione da approvare, dopo il
merge (approvato) della PR #6.
