# RISOLVI evaluation suite v1.0

Questa directory contiene il benchmark deterministico pre-pilot di RISOLVI.

## Cosa significa “gold” qui

I 200 casi sono **sintetici e de-identificati**. Sono gold dal punto di vista tecnico: descrivono il comportamento atteso del rule engine v0 e impediscono regressioni silenziose. Non costituiscono approvazione legale del contenuto: ogni caso ha `review.legal = pending` finché la legal review dedicata non viene completata.

I casi sono generati in modo deterministico da `gold_cases.py`, hanno ID stabili e un checksum SHA-256 bloccato in `manifest.json`. Questo rende ogni modifica al benchmark visibile in review.

## Distribuzione

- 70 garanzia / difetto / venditore→produttore
- 40 mancata consegna
- 45 recesso / rimborso
- 25 fuori perimetro
- 20 adversarial e boundary

Totale: **200**.

## Severity

- `S0`: errore potenzialmente catastrofico di routing/claim o guardrail critico
- `S1`: errore ad alta gravità che può portare a un'azione sbagliata
- `S2`: regressione funzionale importante ma non critica
- `S3`: difetto minore
- `S4`: cosmetico/osservabilità

La CI richiede almeno:

- 0 failure S0/S1;
- validità temporale delle rule version: 100%;
- copertura delle source ID: 100%;
- nel gate `--strict`, 0 failure complessive.

## Campi principali di ogni caso

Ogni caso contiene:

- `facts`: fatti confermati forniti al `CaseFacts`;
- `expected.status` e `expected.route`;
- `expected.missing_facts`;
- `expected.rule_ids` e `expected.source_ids`;
- `expected.expected_action`;
- `allowed_claims_contains`;
- `prohibited_claims`;
- severity, tags e stato review.

Alcuni casi adversarial aggiungono anche `prohibited_substrings` o `max_draft_chars` per proteggere il rendering delle bozze.

## Esecuzione

```bash
cd services/risolvi-api
pip install -e '.[dev]'
python -m app.evaluation --strict
```

Per materializzare i 200 casi in JSONL per una review esterna:

```bash
python -m app.evaluation --dump-jsonl /tmp/risolvi-gold-v1.jsonl
```

## Registry

`registry.json` collega le rule version alle fonti MIMIT verificate al 12 ottobre 2026. `valid_from` indica la validità della **versione interna RISOLVI v0**, non pretende di rappresentare la data storica di entrata in vigore della norma.

Ogni cambiamento a regole, fonti o dataset deve aggiornare il manifest e passare nuovamente l'intero benchmark.
