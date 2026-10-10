# Staging: Guest Guide Bella Vigna + Staff App unica

Tre servizi di prova, tutti in modalità dimostrazione, nessuno di produzione:

| Servizio | Cosa | Indirizzo previsto |
|---|---|---|
| `bella-vigna-preview` | la Guest Guide Bella Vigna completa (guida, Extras, Pass, prenotazioni inventate) | https://bella-vigna-preview.onrender.com/preview |
| `lunart-pr6-staging` | il codice LunArt della PR #6, in anteprima, con prenotazioni inventate — **non** il LunArt in produzione | https://lunart-pr6-staging.onrender.com |
| `staff-console-staging` | la Staff App unica per le due strutture, con passkey | https://staff-console-staging.onrender.com |

Più un database Postgres gratuito per la console (persone e passkey), che scade
dopo 30 giorni.

Tutto parte dai branch di lavoro (`ccr-412adc5b-p2jc5l` qui, `feat/staff-console-bridge`
su LunArt). Non tocca `main`, il LunArt in produzione, né alcun pagamento, email o
casella reale. **Costo: zero** (piani gratuiti).

## Pubblicarlo (una volta sola, dal tuo account Render)

I servizi esistenti `lunart-production`, `lunart-staging` e `lunart-preview` non
vengono toccati: il blueprint crea tre servizi nuovi con nomi diversi e un
database nuovo, e non riusa variabili, archivi o database esistenti.

1. Aprire questo link (con l'account Render già usato per LunArt):
   https://render.com/deploy?repo=https://github.com/jacopolunardi13/Bella-vigna/tree/ccr-412adc5b-p2jc5l
2. Se Render dice di non vedere il repository `Bella-vigna`: **Configure GitHub** →
   aggiungere `Bella-vigna` ai repository autorizzati, poi riaprire il link.
3. Render mostra 3 servizi e 1 database, tutti **Free** → **Apply**.

Se Render segnala che esiste già un database gratuito nell'account (ne è ammesso
uno), fermarsi: si decide insieme se togliere la persistenza dallo staging o
approvare un piano a pagamento.

Dopo pochi minuti i servizi sono *Live*. La verifica dall'esterno, senza credenziali:
`node tools/verify-staging.mjs`.

## Dal telefono

**Guest Guide**: aprire `https://bella-vigna-preview.onrender.com/preview`: da lì la
guida pubblica, due link personali di ospiti inventati (camera Standard e Terrazza),
la revisione dei dati da confermare.

**Staff App**:

1. Su Render, servizio `staff-console-staging` → **Environment** → copiare il valore di
   `CONSOLE_SETUP_CODE` (è la chiave del primo accesso del titolare).
2. Sul telefono aprire `https://staff-console-staging.onrender.com` → *Primo accesso
   del titolare, o ripristino* → incollare il codice → **Crea la passkey del titolare**
   → Face ID. Si è dentro come Jacopo.
3. Su iPhone: Condividi → **Aggiungi alla schermata Home**, poi aprirla da lì:
   è il modo in cui iOS consente le notifiche push. In *Accesso → Attiva su questo
   telefono*.
4. **Un ordine simulato**: dalla guida personale di un ospite inventato → *Extra* →
   ad esempio *Vino in camera* → paga sul checkout finto. In pochi secondi l'ordine
   compare in *Nuovi* con l'etichetta Bella Vigna, e arriva la notifica
   "Bella Vigna · …" ai telefoni che l'hanno attivata. Lo stesso dalla guida di
   `lunart-pr6-staging` per un ordine LunArt.
5. Per provare i ruoli: *Accesso → Persone → Link di primo accesso* per Valentina o
   Diego, aprire il link su un altro telefono (o un'altra finestra in incognito) e
   creare la passkey.

Il servizio gratuito si addormenta dopo ~15 minuti senza traffico: la prima apertura
dopo una pausa impiega 30–60 secondi. Le passkey e le persone restano (database);
le prenotazioni inventate delle due strutture si rigenerano a ogni risveglio.

## Cosa è spento, e come

`GUIDE_PREVIEW=1` (Bella Vigna) e `LUNART_PREVIEW=1` (LunArt) vengono letti per
primi e **impediscono di leggere** le credenziali pericolose:

| | in staging |
|---|---|
| Pagamenti | checkout finto interno: nessuna carta, nessun addebito |
| Email agli ospiti | preparate e conservate, mai spedite |
| Casella QuoVai | non letta: le prenotazioni sono inventate |
| Calendario parrucchiere | non letto né scritto |
| Password Wi-Fi | mai letta, mai servita |
| Prezzi | i placeholder sono vendibili, per provare ogni flusso |
| Privilege (Bella Vigna) | **non acquistabile**: nessun accordo partner confermato |
| Notifiche Staff | solo ai telefoni degli operatori che le attivano nella console |

## In locale (nessun account)

```sh
npm ci
node tools/console-local.mjs     # console :4180, Bella Vigna :4173, LunArt simulato :4174
# stampa il codice del primo accesso; aprire http://localhost:4180
```

Solo la guida: `GUIDE_PREVIEW=1 STAFF_TOKEN=prova node server/index.js` → http://localhost:4173/preview

## Spegnerlo

Render → Blueprint → **Delete** (o i singoli servizi e il database da *Settings*).
Nient'altro è coinvolto.
