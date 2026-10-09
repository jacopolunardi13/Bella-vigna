# Il Core condiviso: dove siamo e dove andare

Decisione dell'operatore (9 ottobre 2026): massimo riuso del codice fra le
strutture, percorso **meno invasivo** adesso, nessuna grande migrazione se non
indispensabile, strategia documentata senza bloccare Bella Vigna.

## Oggi

- Il Core (server, guida, commerce, Staff App, console) esiste in **due copie**: nel
  repository LunArt (`main`) e in questo (branch `ccr-412adc5b-p2jc5l`), partito
  dall'import esatto di LunArt @ 51ac362.
- Ogni differenza è registrata in `docs/CORE-DELTA.md`, con il motivo e se vale per
  tutte le strutture.
- Ciò che è solo di Bella Vigna sta in `data/` (identità, camere, contenuti, persone
  della console), in `commerce/prices.js` / `partners.js` e negli asset.
- La console Staff è una modalità dello stesso Core (`server/console/`), non un
  progetto a parte.
- Verso LunArt passa solo ciò che serve, con PR piccole e spente per default: la
  prima è jacopolunardi13/lunart#6 (ponte verso la console).

## Il rischio da evitare

Due copie che divergono: un bug corretto in una e non nell'altra (è già successo:
checkout Privilege senza partner, `CORE-DELTA.md` §Segnalazioni), o una modifica
LunArt (come la campagna offerte dell'8 ottobre) che Bella Vigna non riceve.

## Dove andare: tre possibilità

| | Come | Pro | Contro |
|---|---|---|---|
| A. LunArt è la casa del Core | Il Core resta nel repository LunArt; Bella Vigna diventa configurazione + asset che lo usano | Nessun repository nuovo | LunArt e Core restano mescolati; ogni struttura dipende dal repository di un'altra |
| **B. Repository Core dedicato** (raccomandata) | `guest-core` con server, guida, commerce, Staff App e console; ogni struttura è un repository con `data/`, asset, prezzi, partner e il proprio `render.yaml`, che fissa una versione del Core | Una correzione arriva a tutte le strutture con un aggiornamento di versione; una struttura nuova è una cartella di configurazione | Va fatta una volta l'estrazione, con i test di tutte e due le strutture |
| C. Un solo repository con tutte le strutture | `properties/lunart`, `properties/bella-vigna` | Un solo posto | I deploy e i permessi delle strutture si mescolano |

## Percorso proposto (B), a passi che non fermano nessuno

1. **Riallineare** (in corso): PR LunArt piccole e spente per default — prima la
   console (#6), poi le correzioni di `CORE-DELTA.md` che valgono per tutti (checkout
   Privilege, `serveStatic`, immagini, parser QuoVai), una alla volta.
2. **Rendere il Core parametrico anche in LunArt**: il modulo `data/brand.js` e il
   registro camere (già in Bella Vigna) entrano in LunArt con i valori LunArt.
   Dopo questo passo le due copie differiscono solo in `data/` e asset.
3. **Estrarre** `guest-core` dal codice ormai identico, con la suite di test di
   entrambe le strutture che gira contro ogni versione.
4. **Ridurre** i due repository a configurazione + asset + `render.yaml`, che
   indicano la versione del Core da usare.

Ogni passo è una PR revisionata; nessun deploy di produzione senza approvazione.
Il completamento di Bella Vigna non dipende da questi passi: funziona già sulla sua
copia del Core, e ogni correzione fatta qui è scritta in modo da poter essere
riportata.
