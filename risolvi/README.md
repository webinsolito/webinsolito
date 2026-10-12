# RISOLVI — prototipo v0

RISOLVI è il primo esperimento del nuovo Case Engine di WEBINSOLITO.

## Cosa fa davvero in questa versione

- raccoglie il problema partendo da file o screenshot;
- non invia i file: il prototipo statico li mantiene nel browser;
- chiede solo i fatti discriminanti necessari;
- applica un piccolo rule pack deterministico per acquisti online B2C in Italia;
- distingue garanzia, recesso, mancata consegna e casi fuori perimetro;
- prepara una bozza di richiesta da copiare e inviare personalmente;
- mostra sempre le fonti istituzionali usate dal rule pack.

## Cosa NON fa ancora

- OCR/PDF extraction automatica di produzione;
- identificazione automatica del seller-of-record;
- invio automatico di email/PEC;
- consulenza legale;
- casi B2B, privati, extra-UE, servizi, banche, assicurazioni, telecom, energia o contenzioso.

## Perché esiste anche un backend scaffold

La cartella `services/risolvi-api/` contiene la prima API FastAPI del Case Engine. Il frontend statico resta utilizzabile gratis su GitHub Pages, mentre l'API serve per sviluppare in sicurezza extraction, provenance, rule versioning e evaluation senza esporre chiavi nel browser.
