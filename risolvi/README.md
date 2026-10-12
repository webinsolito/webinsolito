# RISOLVI — prototipo v0.2

RISOLVI è il primo esperimento del nuovo Case Engine di WEBINSOLITO.

## Cosa fa davvero ora

- legge **immagini/screenshot con OCR locale** tramite Tesseract.js;
- estrae testo da **PDF nel browser** con PDF.js e usa OCR locale sulle pagine scansionate;
- legge EML, TXT e HTML senza caricare il file su WEBINSOLITO;
- propone fatti strutturati (problema, venditore, date e alcuni segnali discriminanti) con **provenance visibile**;
- segnala conflitti tra documenti invece di scegliere silenziosamente;
- non considera i fatti estratti come confermati: l'utente deve correggerli/confermarli;
- applica un piccolo rule pack deterministico per acquisti online B2C Italia/UE;
- distingue garanzia, recesso, mancata consegna e casi fuori perimetro;
- prepara una bozza da copiare e inviare personalmente;
- mostra fonti istituzionali per i percorsi automatici;
- resta gratuito, senza account, crediti o paywall.

## Privacy della v0.2

Gli allegati restano nel browser. Per OCR/PDF vengono scaricati da jsDelivr i motori open-source Tesseract.js e PDF.js e, quando serve, i modelli OCR. Il browser invia richieste per scaricare tali asset, ma il codice di RISOLVI non carica i documenti dell'utente su WEBINSOLITO.

## Backend

`services/risolvi-api/` offre la stessa separazione architetturale: parsing documentale → candidate facts/provenance → conferma utente → rule engine. L'endpoint server legge PDF testuali/EML/TXT/HTML senza persistere i file; un secondo endpoint può ricevere soltanto testo già estratto sul client.

## Cosa NON fa ancora

- persistenza PostgreSQL/object storage e retention automatica;
- identificazione robusta del seller-of-record nei marketplace;
- interpretazione legale affidata a un LLM;
- invio automatico di email/PEC;
- casi B2B, privati, extra-UE, servizi, banche, assicurazioni, telecom, energia o contenzioso;
- rilascio pubblico non supervisionato senza benchmark e legal review.
