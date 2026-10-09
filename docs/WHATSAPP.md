# WhatsApp condiviso LunArt / Bella Vigna — uso operativo

Bella Vigna usa lo stesso numero e account WhatsApp Business di LunArt
(**+39 392 566 1488**, decisione dell'operatore, Property Pack §7). Questa nota
descrive cosa fa già la guida e cosa resta da impostare sull'account. Nessuna
impostazione dell'account è stata toccata.

## Cosa fa già il sistema

- Ogni pulsante WhatsApp della guida Bella Vigna apre la chat con un testo già
  scritto: *"Ciao! Scrivo da ospite di Bella Vigna Firenze (Via della Vigna Nuova 8)."*
  (in inglese per chi usa la guida in inglese). Il primo messaggio dice quindi sempre
  la struttura.
- Il contatto WhatsApp nella guida dice che la linea è condivisa con LunArt e che
  nel profilo l'ospite potrebbe vedere il nome LunArt.
- Quando lo Staff apre WhatsApp verso un ospite da un ordine Bella Vigna, il messaggio
  inizia con *"Bella Vigna Firenze — "*.
- Le notifiche push dello Staff Bella Vigna iniziano con *"Bella Vigna · "*.

## Da impostare sull'account (operatore / Diego)

1. **Nome e foto del profilo**: decidere se restano "LunArt" o diventano neutri
   (es. il nome della gestione). Se cambiano, aggiornare il testo in
   `data/entries/help.js` → `contacts` e `data/property.js` → `contacts.whatsapp.role`.
2. **Etichette**: creare le etichette *Bella Vigna* e *LunArt* e assegnarle a ogni
   chat al primo messaggio (il testo precompilato rende la scelta immediata).
3. **Risposte rapide** con la struttura nel testo, per esempio:
   - `/bv-arrivo` — "Benvenuti a Bella Vigna Firenze, Via della Vigna Nuova 8. …"
   - `/bv-wifi` — "Bella Vigna: per il Wi-Fi inquadrate il QR code in camera (rete WINDTRE-96F14E)."
   - `/bv-colazione`, `/bv-garage`… da scrivere quando gli orari e le condizioni sono confermati (v. `docs/GO-LIVE.md`).
   Mai codici porta o password nelle risposte rapide: vanno solo all'ospite giusto.
4. **Messaggio di benvenuto/assenza** dell'account: se nomina LunArt, renderlo valido
   per entrambe le strutture.
5. **Verifica**: un messaggio di prova dalla guida Bella Vigna (staging) deve arrivare
   a Diego con il testo precompilato e finire sotto l'etichetta giusta.
