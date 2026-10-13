# RISOLVI Reviewer

Console statica per il pilot Wizard-of-Oz. Serve a ispezionare i casi in coda, scaricare gli eventuali documenti autorizzati, confrontare la proposta del motore e registrare una decisione prima che l'Action Card venga mostrata all'utente.

## Sicurezza

- nessun reviewer secret è presente nel repository;
- il token viene inserito a runtime e conservato solo in `sessionStorage`;
- l'URL dell'API può essere ricordato in `localStorage` perché non è un segreto;
- ogni chiamata reviewer usa `X-Reviewer-Token`;
- l'interfaccia rende i contenuti del caso con `textContent` per evitare HTML proveniente da dati utente;
- la pagina contiene `noindex,nofollow`, ma **questo non è un controllo di accesso**: il vero gate è l'API.

Per un pilot reale è preferibile servire questa console su un'origine interna/restritta e configurare `RISOLVI_ALLOWED_ORIGINS` con quell'origine esplicita.

## Decision taxonomy

`PASS_AUTONOMOUS`, `MINOR_EDIT`, `MATERIAL_EDIT`, `WRONG_ROUTE`, `UNSUPPORTED_MISSED`, `LEGAL_REVIEW_REQUIRED`.

Per tutte le classificazioni diverse da `PASS_AUTONOMOUS` la UI richiede una severity e invia una raccomandazione finale esplicita. Il candidato originale non viene sovrascritto: resta disponibile nel record di review per il confronto.

## Metriche

La console mostra i contatori di consenso, review, Action Card consegnate, errori S0/S1, latenza e gli outcome registrati dal client (`action_copied`, `action_sent`, `case_resolved`, ecc.).
