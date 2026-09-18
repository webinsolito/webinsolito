# Webinsolito — GitHub-first audit
Data audit: 18 settembre 2026

Obiettivo: prendere pattern solidi e componenti permissivi, senza copiare applicazioni intere e senza introdurre costi ricorrenti.

| Repository | Licenza | Cosa è utile | Decisione Webinsolito |
|---|---|---|---|
| GoogleChrome/workbox | MIT | strategie cache, offline fallback, service worker | Pattern approvati; niente dipendenza obbligatoria finché il service worker leggero basta. |
| dexie/Dexie.js | Apache-2.0 | wrapper IndexedDB, transazioni, migrazioni | Candidato per nuove app con storage complesso; nessuna migrazione cieca delle app attuali. |
| localForage/localForage | Apache-2.0 | storage asincrono semplice e fallback | Valutato; Dexie preferito quando servono schemi/migrazioni. |
| naptha/tesseract.js | Apache-2.0 | OCR browser e worker riutilizzabile | Confermato per ScreenSort/DocPocket. |
| Leaflet/Leaflet | BSD-2-Clause | mappe mobile leggere | Approvato quando serve una mappa interattiva. |
| PeculiarVentures/webcrypto | MIT | compatibilità WebCrypto | Non necessario nel browser: preferenza al Web Crypto nativo. |
| jspsych/offline-pwa | MIT | pattern PWA/offline | Riferimento per installazione e fallback. |
| scribeocr/scribe.js | AGPL-3.0 | OCR/PDF avanzato | Escluso: licenza copyleft non coerente con la flessibilità commerciale richiesta. |
| apache/pouchdb | Apache ecosystem | database offline/sync | Non integrato: troppo pesante per i casi attuali. |

## Principi
1. API native quando bastano: Web Crypto, geolocation, storage, share.
2. Librerie solo quando risolvono un problema reale.
3. Storage esistente non si migra senza migrazione e test.
4. Service worker piccolo e prevedibile; pattern Workbox senza obbligo di Workbox.
5. OCR: Tesseract.js sì; Scribe.js no per licenza.
6. Nuove app complesse: Dexie è il candidato preferito.

## Fonti
- https://github.com/GoogleChrome/workbox
- https://github.com/dexie/Dexie.js
- https://github.com/localForage/localForage
- https://github.com/naptha/tesseract.js
- https://github.com/Leaflet/Leaflet
- https://github.com/PeculiarVentures/webcrypto
- https://github.com/jspsych/offline-pwa
- https://github.com/scribeocr/scribe.js
- https://github.com/apache/pouchdb
