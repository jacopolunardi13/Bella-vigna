# Bella Vigna — staging (anteprima privata)

La Guest Guide Bella Vigna completa — server Node reale, guida, Extras, Pass, Staff,
prenotazioni — su un URL temporaneo, con spento tutto ciò che potrebbe raggiungere
una persona reale. Servizio indipendente da LunArt: altro URL, altro token Staff,
altra chiave delle card, nessun dato in comune.

Il deploy parte dal branch di lavoro `ccr-412adc5b-p2jc5l`. Non tocca `main`, LunArt,
né alcuna produzione.

## Avviarlo in locale (nessun account necessario)

```sh
npm ci
GUIDE_PREVIEW=1 STAFF_TOKEN=prova node server/index.js
# poi apri http://localhost:4173/preview
```

## Pubblicarlo su Render (operazione dell'operatore)

1. https://render.com → accesso con GitHub → autorizzare la sola lettura del
   repository `jacopolunardi13/Bella-vigna`.
2. **New + → Blueprint** → repository `Bella-vigna` → Render legge `render.yaml`
   dal branch `ccr-412adc5b-p2jc5l` → **Apply**.
3. Servizio `bella-vigna-preview` → **Environment** → leggere `STAFF_TOKEN`
   (generato da Render, diverso da quello di LunArt).
4. Aprire `https://<servizio>.onrender.com/preview`.

## Cosa contiene

| | |
|---|---|
| `/preview` | la porta d'ingresso: tutti i link e cosa è spento |
| `/` | la guida come la vede chi non ha un link personale |
| `/g/<token>` | due prenotazioni **inventate** (camere Standard e Terrazza), con Pass |
| `/?review=1` | ogni dato ancora da confermare, nel suo contesto (non visibile agli ospiti) |
| `/recover` | link perso: cognome + numero di prenotazione |
| `/staff` | Bella Vigna Staff (chiede il token una volta) |
| `/validate-card` | pagina venue generica |
| `/api/health` | cosa è configurato e cosa è spento |

## Cosa è spento, e come

`GUIDE_PREVIEW=1` viene letto per primo in `server/config.js` e **impedisce di leggere**
le credenziali, non si limita a non usarle:

| | in staging |
|---|---|
| Pagamenti | checkout finto interno: nessuna carta, nessun addebito |
| Email agli ospiti | preparate e conservate, mai spedite |
| Casella QuoVai | non letta: le prenotazioni sono inventate |
| Calendario parrucchiere | non letto né scritto |
| Push | registrate, non inviate |
| Password Wi-Fi | mai letta, mai servita |
| Prezzi | i placeholder (prezzi LunArt) sono vendibili, per provare ogni flusso |
| Privilege | **non acquistabile**: nessun accordo partner è confermato per Bella Vigna, e non si inventa un partner dimostrativo |

## Da sapere

- **Si addormenta**: sul piano gratuito il servizio si ferma dopo ~15 minuti senza
  traffico; la prima richiesta dopo impiega ~30 secondi.
- **Dimentica**: niente disco. A ogni riavvio rigenera le due prenotazioni inventate
  con nuovi link personali, per questo `/preview` li legge al momento.

## Spegnerlo

Render → servizio → **Settings → Delete Service**. Nient'altro è coinvolto.
