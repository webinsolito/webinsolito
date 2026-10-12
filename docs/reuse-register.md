# Webinsolito — registro riuso / ispirazioni

| Repository | Tipo | Licenza | Uso attuale |
|---|---|---|---|
| naptha/tesseract.js | dipendenza esterna | Apache-2.0 | OCR locale immagini/scansioni in RISOLVI; release verificata v7.0.0 |
| mozilla/pdf.js | dipendenza esterna | Apache-2.0 | estrazione testo/render PDF locale in RISOLVI; release verificata v6.4.299 |
| Leaflet/Leaflet | riferimento | BSD-2-Clause | pattern mappe mobile |
| GoogleChrome/workbox | pattern | MIT | strategie caching/offline |
| dexie/Dexie.js | candidato | Apache-2.0 | non integrato ancora |
| localForage/localForage | valutato | Apache-2.0 | non integrato |
| PeculiarVentures/webcrypto | valutato | MIT | non integrato; Web Crypto nativo |
| jspsych/offline-pwa | pattern | MIT | installabilità/offline |
| scribeocr/scribe.js | escluso | AGPL-3.0 | non integrato |
| apache/pouchdb | valutato | Apache ecosystem | non integrato |
| firstlinkai/omnitools | pattern | MIT | studiata architettura di utility client-side; nessun codice copiato |
| CorentinTh/it-tools | pattern esclusivamente concettuale | GPL-3.0 | studiato lo scaffold di nuove utility; nessun codice copiato |
| jfoclpf/autocosts | riferimento concettuale | GPL-3.0 | studiata la scomposizione dei costi auto; nessun codice copiato |

Ogni nuova dipendenza o pezzo riutilizzato va registrato qui prima della pubblicazione.

## Dipendenze runtime esterne di RISOLVI

RISOLVI v0.2 carica Tesseract.js e PDF.js da jsDelivr soltanto quando serve elaborare immagini/PDF. I documenti restano nel browser; il traffico esterno serve a scaricare codice/modelli OCR. Prima di un rilascio production-grade valutare vendoring, SRI/CSP e pinning degli asset per ridurre il rischio supply-chain.

## Local utility vendors added in 200-app run

- `davidshimjs/qrcodejs` → local QR generation for QRPocket and QRMenu → MIT → vendored minified browser build plus license notice.
- `Stuk/jszip` → local ZIP creation for PhotoSort → MIT option of dual license → vendored browser build plus license notice.
