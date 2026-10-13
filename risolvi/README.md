# RISOLVI — pilot v0.6

RISOLVI è il primo prodotto del Case Engine di WEBINSOLITO: **documento/problema → fatti confermati → regole/fonti → Action Card → outcome**.

## Flusso attuale

- legge immagini/screenshot con OCR locale tramite Tesseract.js;
- estrae testo da PDF nel browser con PDF.js e usa OCR locale sulle pagine scansionate;
- legge EML, TXT e HTML;
- propone fatti strutturati con provenance visibile e segnala conflitti;
- l'utente corregge/conferma i fatti prima di qualsiasi routing;
- nel pilot il client crea una pratica sul Case Engine e registra un consenso versionato;
- **solo dopo il consenso** gli eventuali originali vengono inviati per consentire la review umana;
- il motore produce una candidata, ma l'interfaccia non la mostra finché il reviewer non ha deciso;
- dopo l'approvazione mostra Action Card, fonti e bozza pronta da copiare;
- registra in modo esplicito feedback come copia, invio ed esito;
- l'utente può cancellare la pratica;
- nessun account, credito, abbonamento o paywall.

## Privacy nel pilot

Prima del consenso, OCR e lettura PDF avvengono sul dispositivo. Nel pilot controllato, se l'utente accetta, i documenti selezionati vengono caricati nello storage privato del Case Engine per la review.

La UI legge da `GET /v1/config` i tempi effettivi di retention e li mostra prima del consenso. I default prototipali sono 24 ore per gli originali e 7 giorni per la pratica strutturata, ma il server resta la fonte di verità.

Il capability token della pratica viene conservato in `sessionStorage`, non nella URL e non in localStorage.

## Configurazione API

`config.js` contiene soltanto configurazione pubblica di deploy:

```js
window.RISOLVI_CONFIG = Object.freeze({ apiBase: '' });
```

Stringa vuota = API same-origin. Se il Case Engine è su un'origine diversa, il deploy può sostituire `apiBase`; il server deve includere l'origine frontend in `RISOLVI_ALLOWED_ORIGINS`.

## Reviewer

La console del reviewer è in `../risolvi-review/`. Non contiene secret hardcoded: il reviewer inserisce il token a runtime e questo rimane solo nella sessione del browser.

## Gate aperti

- legal review specialistica del rule pack (#79);
- separazione giuridica/operativa del percorso `refund` dal semplice esercizio del recesso;
- seller-of-record robusto nei marketplace;
- Alembic e hardening deploy;
- 50–100 casi reali Wizard-of-Oz e decisione GO/RESCOPE/KILL (#83).

RISOLVI non invia comunicazioni automaticamente e non deve presentare una candidata non revisionata come diritto certo.
