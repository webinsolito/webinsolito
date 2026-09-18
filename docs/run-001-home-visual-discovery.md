# RUN 1 — Home Visual Quality + Discovery

**Timestamp:** 2026-09-18T20:06Z  
**Macro-area:** Home / discovery  
**Baseline:** main @ 6ac4c6abde2e8af8505c9fdb0119be8a7837ea82

## Prima
- Home pulita ma visivamente piatta.
- Icone categoria: 50px.
- Card categoria: circa 170px.
- Hero molto dominante (fino a 96px).
- Ricerca basata solo su nome + descrizione.
- Nessuna comprensione di intenzioni o piccoli errori di battitura.

## Modifiche
- Hero centrato su “Dimmi cosa devi fare.”
- Icone categoria portate a 60px desktop / 56px mobile.
- Card più presenti (188px desktop) con profondità visiva leggera.
- Nessuna sezione “In evidenza”.
- Numero strumenti per categoria visibile senza aggiungere una nuova sezione.
- Nuovo motore locale `assets/home-search.js`.
- Intenti curati, sinonimi, fuzzy matching e categorie come fallback.
- Navigazione risultati anche da tastiera.
- Service worker aggiornato per includere il nuovo motore.
- Screenshot prima/dopo prodotti dal QA.

## Test
- Primo QA: FAIL su ranking “cosa cucino” (LeftoverChef sopra FrigoChef).
- Correzione: priorità più forte all’ordine editoriale degli intenti.
- QA finale: **130 PASS, 2 SKIPPED, 0 FAIL**.
- Test desktop Chromium + iPhone.
- Query verificate:
  - devo vendere la macchina → SellMyCar
  - mi scade la revisione → RevisioneMemo
  - quanto spendo per andare a Roma → TripCost
  - parto una settimana → Packr
  - voglio dividere una cena → Splitly
  - cosa cucino → FrigoChef
  - devo studiare per un esame → ExamPlanner
  - quanto mi costa davvero auto → CarCost
  - revizione auto → RevisioneMemo

## Prima vs dopo
- Hero massimo: 96px → 84px.
- Icone: 50px → 60px desktop.
- Card: ~170px → 188px desktop.
- Ricerca: letterale → intent + sinonimi + fuzzy.
- Home: ancora solo accesso, ricerca e categorie; nessuna vetrina app aggiunta.

## App migliorate
Nessuna app modificata in questa run, per rispettare la macro-area singola.

## Produzione
Candidate validata. Promozione prevista solo dopo verifica di divergenze da main.

## Regressioni
Nessuna rilevata nel QA finale.

## Quality delta
Migliorata discovery, gerarchia visiva, leggibilità delle categorie e tolleranza a linguaggio naturale/errori semplici.

## Prossima run
APP QUALITY SWEEP: misurare e ordinare le 200 app per utilità, completezza, UX, affidabilità e qualità visiva; iniziare dalle peggiori.
