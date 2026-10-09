# Una sola Staff App per LunArt e Bella Vigna

Decisione vincolante dell'operatore (Property Pack §9, 9 ottobre 2026): **due Guest
Guide indipendenti, una sola Staff App** per entrambe le strutture, con un accesso
per operatore, filtri Tutte | LunArt | Bella Vigna, permessi lato server per utente,
ruolo e struttura, notifiche centralizzate e possibilità di aggiungere strutture.

Questo documento: (1) com'è fatta davvero oggi la Staff App LunArt, (2) la soluzione
proposta, (3) cosa cambia nei due repository e in che ordine, (4) le decisioni
che servono prima di costruirla.

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

| Passo | Dove | Tocca LunArt prod? |
|---|---|---|
| 1. Console: utenti/ruoli/strutture, proxy autorizzato, viste aggregate, filtri, audit | Core, in questo branch | No |
| 2. Staff App estesa (selettore struttura, badge, viste "Tutte") | `src/staff/app.js`, stesso branch | No |
| 3. Push centralizzate: relay firmato dalle strutture alla console | Core, stesso branch | No (LunArt continua con le sue push finché non adotta il relay) |
| 4. PR su LunArt (branch dedicato): delta Core di identità e isolamento, `property` nelle risposte Staff, relay push, credenziale di servizio separata dal token Staff | repository `lunart`, PR revisionata | Solo dopo merge e deploy approvati |
| 5. Staging console con due server di staging (LunArt staging + Bella Vigna staging) | Render, servizi separati | No |
| 6. Go-live: console in produzione, `/staff` delle strutture → console | dopo approvazione | Sì, con approvazione |

Nota sul codice duplicato: oggi il Core vive in due repository (LunArt e questo).
La PR del passo 4 li riallinea; a regime conviene che il Core abbia una sola casa
(il repository LunArt o un repository Core dedicato) e che Bella Vigna ne contenga
solo la configurazione. È una scelta da fare insieme (v. decisioni).

## 4. Decisioni necessarie prima di costruire la console

1. **Conferma dell'approccio** "console sopra le API delle strutture" (§2).
2. **Operatori e ruoli**: chi accede (Diego, Valentina, Jacopo, altri?), a quali
   strutture, e quali azioni sono riservate (proposta: rimborsi, catture di
   pagamento e invio catch-up email solo direzione/admin; front desk tutto il resto).
3. **Metodo di accesso**: password per operatore (la più semplice) oppure passkey.
   Il link via email richiederebbe un mittente operativo che oggi non c'è.
4. **Indirizzo della console** (es. `staff.<dominio>`) e hosting (Render come le guide).
5. **Accesso in scrittura al repository LunArt** per aprire la PR (branch dedicato,
   nessun merge senza approvazione).
6. **Casa del Core a regime**: repository LunArt o repository Core dedicato.
