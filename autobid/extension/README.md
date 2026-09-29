# AutoBid Connector 2.0.0
Solo PWA ↔ estensione Chrome ↔ AutoProff. Nessun eseguibile o servizio intermedio.
1. Scarica manifest.json e background.js di questa cartella in una cartella AutoBid Connector.
2. In Chrome desktop apri chrome://extensions, abilita la modalità sviluppatore e scegli Carica estensione non pacchettizzata.
3. Copia l'ID dell'estensione nella PWA https://webinsolito.github.io/webinsolito/autobid/ e premi Collega.
4. Apri AutoProff in una scheda ed effettua l'accesso direttamente sul sito; torna alla PWA e premi Scansiona AutoProff.

Handshake con protocollo 1, versione 2.0.0, correlazione delle richieste, timeout e messaggi di errore. Accesso esterno limitato all'origine GitHub Pages e al percorso AutoBid. Nessuna azione di offerta o acquisto.

## Limite attuale
Il percorso demo è funzionante. L'adattatore live è conservativo e riconosce soltanto elementi con data-auction-id e campi strutturati espliciti; NON è ancora verificato sul DOM AutoProff autenticato. Se non riconosce il layout restituisce ADAPTER_NO_RECORDS. Non interpreta testi ambigui e non tratta dati mancanti come zero o assenza di sinistri.
Prossimo passo: verificare un campione reale autorizzato del DOM, aggiungere parser testati per i campi effettivi e provare la comunicazione con Chrome.
