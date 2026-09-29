# AutoBid 2.0.0-r2 — 30 settembre 2026
Architettura: PWA ↔ estensione Chrome ↔ AutoProff.
Preview: https://webinsolito.github.io/webinsolito/autobid/

## Implementato
PWA con manifest, icona, cache offline del guscio UI e aggiornamento network-first.
UI responsive senza emoji, shortlist/esclusi/revisione, simulatore costi e max bid.
Scanner fixture, deduplicazione per auction ID, filtri >150000 km, oltre 6 anni di calendario, sinistro confermato.
UNKNOWN resta null e richiede revisione. Duplicati discordanti non entrano silenziosamente in shortlist.
Estensione MV3, handshake/versione/protocollo/requestId, controllo origine e percorso, errori e timeout. Nessun invio offerte.
ZIP estensione disponibile dalla Home.

## Evidenze
node tests.mjs PASS: fixture → dedup → filtri → shortlist → budget, unknown, soglie, date invalide, conflitti.
node extension.test.mjs PASS: MOCK del trasporto Chrome per handshake/versione/origine/percorso/scheda mancante. Non equivale a test estensione installata.
Sintassi app, service worker e background PASS.
Browser pubblico: demo 7 record → 6 auto, 2 shortlist / 3 esclusi / 1 revisione. Selezione Golf e input 22000/2000/2500 producono 17500 EUR.
Layout desktop ispezionato. Mobile e installazione PWA su dispositivo non verificati.

## NEXT_ACTION
Validare parser su HTML AutoProff reale autorizzato: l'adattatore attuale legge soltanto attributi data-auction-id / data-mileage-km / data-first-registration / data-accident. Se assenti restituisce ADAPTER_NO_RECORDS: non dichiarare scansione live completata.
Provare handshake e scansione con estensione realmente installata; verificare 390/430px e offline/update su dispositivo.
Non ricreare bridge, server intermedi o eseguibili.
