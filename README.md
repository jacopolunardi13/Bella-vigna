# Bella Vigna — Guest Guide & Concierge

La guida digitale personale per gli ospiti di **Bella Vigna Firenze** (Via della Vigna
Nuova 8): arrivo e check-in, Wi-Fi, colazione, parcheggio e ZTL, assistenza, partenza,
Firenze — più Concierge, Pass, Privilege, rete partner, Extras con pagamento, app
Staff e automazioni sulle prenotazioni QuoVai.

Non è un secondo sito vetrina: è il sistema Guest Guide & Concierge di LunArt
(release stabile `golden/lunart-production-2026-10-08`, `51ac362`), con lo stesso
Core e configurazione, contenuti, branding e dati di Bella Vigna separati.

```sh
npm ci
npm test                                   # suite completa, senza browser
GUIDE_PREVIEW=1 STAFF_TOKEN=prova npm start  # staging locale → http://localhost:4173/preview
npm run console:local                      # Staff App unica + Bella Vigna + LunArt simulato → http://localhost:4180
```

**Staff App unica** per LunArt e Bella Vigna: `server/console/` (accesso con passkey,
ruoli e strutture verificati sul server, notifiche centralizzate). Documento:
`docs/STAFF-UNIFICATA.md`; staging su Render: `docs/PREVIEW.md` e `render.yaml`.

## Dove sta cosa

| | |
|---|---|
| `data/brand.js` | identità della struttura: nomi, asset, testo email, prefissi, canale WhatsApp condiviso |
| `data/property.js` · `data/rooms.js` · `data/entries/` · `data/florence.js` | i fatti di Bella Vigna, scritti una volta (guida + Concierge) |
| `commerce/prices.js` | prezzi — tutti `placeholder` finché l'operatore non li conferma |
| `commerce/partners.js` | rete partner LunArt + `PROPERTY_AGREEMENTS` di Bella Vigna (tutti in attesa) |
| `server/` · `src/` | Core condiviso con LunArt (delta documentato in `docs/CORE-DELTA.md`, strategia in `docs/CORE-STRATEGIA.md`) |
| `server/console/` · `data/console.js` · `console.html` | la Staff App unica: server, persone e ruoli, pagina |
| `assets/img/_src/` | foto e logo originali di Bella Vigna; `tools/make-bella-vigna-assets.py` |
| `legacy/index.html` | la pagina di giugno 2026, conservata identica, non servita |

## Documenti

- `docs/AUDIT.md` — audit reale di LunArt e di questo repository, fonti, strategia di replica
- `docs/CORE-DELTA.md` — ogni modifica al Core condiviso, verificata contro la suite LunArt
- `docs/PREVIEW.md` — lo staging: come avviarlo, cosa contiene, cosa è spento
- `docs/GO-LIVE.md` — **solo** le conferme necessarie per la produzione
- `docs/WHATSAPP.md` — uso operativo della linea WhatsApp condivisa con LunArt
- `docs/STAFF-UNIFICATA.md` — una sola Staff App per LunArt e Bella Vigna: audit e architettura
- `docs/CORE-README.md` — documentazione tecnica completa del Core (da LunArt)

## Regole che il codice fa rispettare

- Nessun dato mancante è inventato: ciò che non è confermato è nascosto o porta un
  flag `verify` visibile su `/?review=1`.
- Nessun segreto nel repository (password Wi-Fi, chiavi Stripe, token): solo variabili
  d'ambiente, e in staging non vengono nemmeno lette.
- Isolamento da LunArt: store timbrato `bella-vigna`, eventi Stripe e notifiche QuoVai
  di altre strutture rifiutati, chiavi browser e variabili d'ambiente separate.
- Nessuna email reale, nessun pagamento live, nessuna vendita a prezzo non confermato
  in produzione.
