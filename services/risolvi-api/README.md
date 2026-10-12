# RISOLVI API

Primo scaffold server-side del Case Engine di WEBINSOLITO.

## Avvio locale

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn app.main:app --reload
```

Poi apri `http://127.0.0.1:8000/docs`.

## Stato

Questa API è deliberatamente piccola: memoria volatile, nessun database, nessun upload, nessun LLM. Serve a fissare il contratto di dominio e a rendere testabile il routing deterministico prima di aggiungere parsing, OCR, provenance e storage temporaneo.
