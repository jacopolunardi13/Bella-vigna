# Dalla Staff App LunArt alla Staff App unica

Obiettivo (10 ottobre 2026): alla fine **una sola** Staff App, quella che lo staff
conosce già, con le stesse sezioni (Oggi, Nuovi, Da confermare, In preparazione,
Completati, Annullati, Prenotazioni, Sincronizzazione), più il filtro
Tutte | LunArt | Bella Vigna, l'accesso personale con passkey e le notifiche delle
due strutture. Durante il collaudo le due possono convivere; dopo, ne resta una.

La Staff App unica **è** la Staff App LunArt: lo stesso file (`src/staff/app.js`),
le stesse schermate e gli stessi pulsanti, con in più il selettore di struttura, le
etichette sulle righe e la schermata "Accesso". Non è un'app nuova da imparare.

## 1. Si può aggiornare l'icona già installata, senza crearne un'altra?

**Sì, a una condizione: che la Staff App unica sia servita dallo stesso indirizzo
e dallo stesso percorso di quella installata.**

Oggi la Staff App LunArt è installata da `https://lunart-production.onrender.com/staff`
(manifest "LunArt Staff", `start_url` e `scope` = `/staff`, service worker
`/staff-sw.js`). Un'app installata è legata al suo indirizzo: i browser non
permettono di "spostarla" su un indirizzo diverso. Quindi:

- **Strada consigliata (stessa icona).** Al go-live il server LunArt di produzione
  serve la Staff App unica proprio su `/staff`, con lo stesso manifest e lo stesso
  service worker. Chi apre l'icona di sempre trova la nuova versione: una volta sola
  crea la sua passkey, poi entra con Face ID. Nessuna nuova installazione. Serve:
  una modifica a LunArt di produzione (dopo collaudo e approvazione), un file
  separato sul disco di LunArt per persone e passkey della console, le credenziali
  di Bella Vigna come variabili d'ambiente di LunArt. I dati degli ospiti restano
  separati: quelli di Bella Vigna restano sul server di Bella Vigna.
- **Alternativa (indirizzo dedicato, es. `staff.<dominio>`).** Una nuova
  installazione per telefono, guidata: la vecchia app mostra "Passa alla nuova
  Staff App" con il pulsante per aprirla e installarla; dopo il collaudo `/staff`
  porta direttamente lì e la vecchia icona si elimina.

La scelta si fa al go-live. Lo staging serve a collaudare l'app, non l'icona: per
questo vive su un indirizzo di prova (`staff-console-staging.onrender.com`), con
passkey di prova che non passano alla produzione.

## 2. Il primo accesso del titolare (passkey)

1. Aprire la Staff App unica dal telefono.
2. "Primo accesso del titolare, o ripristino" → incollare il codice di attivazione.
   Il codice sta nelle variabili d'ambiente del servizio (`CONSOLE_SETUP_CODE`), lo
   vede solo chi gestisce l'hosting, non viene mai scritto in chat o nei documenti.
3. "Crea la passkey del titolare" → Face ID / impronta / PIN. Fatto.
4. Consigliato subito: *Accesso → Aggiungi un altro dispositivo* (es. il computer),
   e poi cambiare il codice di attivazione.

## 3. Attivare Diego e Valentina

1. Jacopo: *Accesso → Persone → Link di primo accesso* per ciascuno.
2. Il link vale una volta sola, 72 ore: consegnarlo a voce o in persona, non in un
   gruppo.
3. Diego (o Valentina) lo apre sul proprio telefono → "Crea la passkey" → Face ID.
4. Su iPhone: Condividi → *Aggiungi alla schermata Home* (oppure, con la strada
   consigliata, l'icona di sempre) → *Accesso → Attiva su questo telefono* per le
   notifiche.

Nessuna password, nessun codice da ricordare. Un telefono perso: *Telefono perso*
dalla schermata Persone (link di 24 ore che revoca le vecchie passkey).

**La password o il token attuali di LunArt non valgono nella Staff App unica**:
ognuno crea la propria passkey.

## 4. La vecchia Staff App resta in funzione fino al collaudo

- Su LunArt di produzione non cambia nulla finché non lo approvi: la PR #6 non è
  unita, e anche dopo il merge ogni parte resta spenta finché non si impostano le
  variabili.
- Lo staging usa servizi separati con dati dimostrativi (`bella-vigna-preview`,
  `lunart-pr6-staging`, `staff-console-staging`): non legge né scrive nulla di
  LunArt in produzione.
- Quando si collega la Staff App unica alla produzione, il token condiviso continua
  a funzionare accanto alla credenziale della console. Si ritira solo alla fine
  (`STAFF_TOKEN_RETIRED=1`), ed è reversibile.

## 5. Notifiche: niente perse, niente doppie

| Fase | Chi riceve le notifiche reali | Perché non si perde e non si duplica nulla |
|---|---|---|
| Collaudo in staging | la vecchia app, come oggi | la console di staging riceve solo eventi dimostrativi |
| Passaggio (console collegata, token non ritirato) | la vecchia app **e** chi ha già attivato la console | ognuno attiva le notifiche nella console e le spegne nella vecchia app (impostazioni del telefono), una volta |
| Dopo il ritiro del token | solo la console | con `STAFF_TOKEN_RETIRED=1` la struttura smette di inviare ai telefoni della vecchia app (provato dai test): nessun doppione |

In nessuna fase si perde un evento: ogni notifica resta anche nella schermata
*Accesso → Ultimi avvisi* e gli ordini e le prenotazioni sono comunque nelle liste.
Con la strada consigliata (stessa icona) il passaggio è ancora più semplice: c'è un
solo service worker sul telefono, e passa dalla vecchia alla nuova app con
l'aggiornamento.

## 6. Sequenza al go-live (ognuno è un passo da approvare)

1. Collaudo dello staging dal telefono (Jacopo, poi Diego e Valentina con i loro
   link).
2. Merge della PR LunArt #6 e deploy, con le variabili ancora vuote: nessun effetto.
3. Scelta: stessa icona (strada consigliata) o indirizzo dedicato.
4. Collegamento della Staff App unica alle due strutture di produzione; primo
   accesso del titolare; link a Diego e Valentina; notifiche attivate.
5. Qualche giorno di uso in parallelo.
6. Ritiro del token condiviso: da qui, una sola Staff App.
