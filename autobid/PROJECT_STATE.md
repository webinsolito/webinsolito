# AutoBid 2.1.0 — 30 settembre 2026
Preview: https://webinsolito.github.io/webinsolito/autobid/
Architettura unica: PWA ↔ estensione Chrome ↔ AutoProff.

## Vertical slice verificata
Handshake versionato protocollo 1 con requestId, timeout, stato scheda AutoProff ed errori espliciti.
Fixture: 7 record → 6 veicoli dopo deduplica → 2 shortlist / 3 esclusi / 1 revisione.
Regole: oltre 150.000 km, più di 6 anni e incidente confermato esclusi; dati UNKNOWN restano revisione e non zero.
Cost engine: commissioni + trasporto + documenti/immatricolazione + lavori/preparazione + riserva rischio.
Demo report: veicolo → costi → margine → offerta massima → report stampabile/PDF. Nessuna offerta viene inviata.

## Evidenze test
Sintassi PWA/estensione/service worker verificata.
Fixture engine PASS.
Costi 4.300 EUR e rivendita 22.000 EUR con margine 2.500 EUR → max bid 15.200 EUR.
Un singolo costo UNKNOWN rende totale/max bid null e blocca il report.
Connector mock: origine/percorso/versione/requestId/scheda AutoProff assente verificati.

## Limite reale / NEXT_ACTION
Il parser live riconosce soltanto attributi AutoProff strutturati espliciti. Serve un campione DOM autenticato autorizzato per mappare i campi reali; finché manca, ADAPTER_NO_RECORDS è comportamento corretto. Provare estensione installata, scansione live e stampa PDF su Chrome Windows.
