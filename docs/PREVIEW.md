# Staging: Guest Guide Bella Vigna + Staff App unica

Tre servizi di prova, tutti in modalità dimostrazione, nessuno di produzione:

| Servizio | Cosa | Indirizzo previsto |
|---|---|---|
| `bella-vigna-preview` | la Guest Guide Bella Vigna completa (guida, Extras, Pass, prenotazioni inventate) | https://bella-vigna-preview.onrender.com/preview |
| `lunart-staff-staging` | il codice LunArt della PR #6, in anteprima, con prenotazioni inventate — **non** il LunArt in produzione | https://lunart-staff-staging.onrender.com |
| `staff-console-staging` | la Staff App unica per le due strutture, con passkey | https://staff-console-staging.onrender.com |

Più un database Postgres gratuito per la console (persone e passkey), che scade
dopo 30 giorni.

Tutto parte dai branch di lavoro (`ccr-412adc5b-p2jc5l` qui, `feat/staff-console-bridge`
su LunArt). Non tocca `main`, il LunArt in produzione, né alcun pagamento, email o
casella reale. **Costo: zero** (piani gratuiti).

## Pubblicarlo (una volta sola)

Serve il proprio account Render: nessuno può farlo al posto del titolare, perché
collega Render al GitHub del titolare.

1. Aprire https://render.com → **Sign in with GitHub**; autorizzare l'accesso ai
   repository `jacopolunardi13/Bella-vigna` e `jacopolunardi13/lunart`.
2. **New + → Blueprint** → repository `Bella-vigna`, branch `ccr-412adc5b-p2jc5l` →
   Render legge `render.yaml` e mostra i 3 servizi e il database, tutti *Free* →
   **Apply**.
3. Attendere che i tre servizi siano *Live* (alcuni minuti la prima volta).
4. Se Render ha assegnato a un servizio un indirizzo diverso da quelli in tabella
   (succede quando il nome è già preso), correggerlo una volta in
   **Env Groups → staff-staging-links**.

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
4. Per provare i ruoli: *Accesso → Persone → Link di primo accesso* per Valentina o
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
