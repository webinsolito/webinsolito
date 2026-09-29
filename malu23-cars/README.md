# MALÙ23 CARS · AUTOSALONE ONE — V1.13.1

Edizione dedicata di AUTOSALONE ONE per Malù23 Cars.

Questa cartella è il runtime canonico del prodotto. `autosalone-one-preview/` è soltanto la preview pubblica con dati dimostrativi.

## Filosofia
**Zero sbatti:** una sola azione chiara per volta. Se il sistema può leggere, collegare, compilare o ricordare qualcosa, non deve chiederlo di nuovo.

## Novità V1.12 — Document Brain
La nuova azione principale è **Scatta o carica**. Puoi fare una foto dall'iPhone oppure inviare un PDF. MALÙ23 prova automaticamente a:
- capire che documento è;
- leggere targa, telaio/VIN, CF e dati veicolo;
- leggere importo/data/numero su fatture e ricevute;
- dividere un PDF multipagina in documenti diversi;
- collegare ogni documento alla vettura/cliente corretti;
- preparare una spesa con un tocco;
- creare una nuova auto da un libretto non ancora presente.

Il PDF originale rimane sempre disponibile. Se il riconoscimento non è abbastanza sicuro, MALÙ23 chiede **una sola scelta** invece di inventare.

## Come verrà usato
Direzione definitiva **cloud + PWA**:
- iPhone: link WhatsApp → installazione guidata → icona Home → OGGI;
- Windows: link Edge/Chrome → `Installa MALÙ23 CARS` → app nel menu Start/Desktop;
- stessi dati su tutti i dispositivi, anche a distanza;
- nessun EXE/BAT necessario.

## Funzioni principali
OGGI / Daily Brain, Garage, import stock CSV, Document Brain/OCR, lavori/costi/margini, CRM con timeline e callback, calendario, Notification Brain/Web Push, foto iPhone, AutoScout Studio/Price Brain/aging, Instagram Studio, Delivery Brain, contratti PDF, utenti/ruoli, audit, backup/restore, gate produzione e PWA multipiattaforma.

## Verifica release
**85/85 test PASS**, JavaScript syntax PASS, Python compile PASS, SQLite integrity `ok`.

Vedi `PROJECT_STATUS.md`, `TEST_REPORT.md`, `NOVITA_V1_12.md`, `PRODUCTION_CHECKLIST.md` e `WINDOWS_PWA_STATUS.md`.
