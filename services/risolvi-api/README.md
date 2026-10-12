# RISOLVI API

Case Engine server-side di WEBINSOLITO RISOLVI.

## Avvio locale

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn app.main:app --reload
```

Poi apri `http://127.0.0.1:8000/docs`.

## v0.2 — extraction pipeline

L'API mantiene ancora i casi in memoria, ma ora separa chiaramente **estrazione** e **decisione**:

1. `POST /v1/cases` crea un caso;
2. `POST /v1/cases/{id}/documents/extract` legge lato server PDF testuali, EML, TXT e HTML senza conservare i file;
3. `POST /v1/cases/{id}/documents/extract-text` riceve testo già estratto sul client (OCR/PDF locale) e restituisce candidate facts con provenance;
4. l'utente conferma/corregge i fatti e li salva con `PUT /v1/cases/{id}/facts`;
5. solo dopo `POST /v1/cases/{id}/analyse` applica il rule engine deterministico.

Le immagini non vengono mandate automaticamente all'API: il frontend statico RISOLVI usa Tesseract.js nel browser e può trasmettere in futuro soltanto il testo estratto, se viene configurato un backend. Per i PDF il frontend usa PDF.js e ricorre all'OCR locale per pagine senza testo.

## Guardrail

- massimo 8 documenti per richiesta;
- massimo 8 MB per file server-side;
- nessun fatto assente viene inventato;
- ogni fatto candidato conserva documento, pagina/span e metodo di estrazione;
- valori discordanti vengono marcati `CONFLICT` e non precompilati;
- il testo estratto è considerato **dato non fidato**, non istruzione per un modello;
- l'estrazione non modifica automaticamente i `CaseFacts` confermati;
- nessun invio automatico di reclami o comunicazioni.

## Limiti ancora aperti

Persistenza PostgreSQL/object storage, retention automatica, auth guest robusta, seller-of-record più affidabile, legal review completa e benchmark da 200 gold cases restano gate separati prima di un pilot pubblico non supervisionato.
