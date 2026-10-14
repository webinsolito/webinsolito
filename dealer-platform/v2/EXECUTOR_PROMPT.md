# MALÙ23 V2 — EXECUTOR HEAVY

Obiettivo: trasformare MALÙ23 nel Dealer Cockpit V2 senza distruggere il core già valido.

Regola architetturale: NON aggiungere nuove macro-funzioni alla vecchia UI V1 salvo fix P0. Il lavoro principale va in `dealer-platform/v2/`. Backend, Supabase, RLS, lifecycle vendite, sicurezza ruoli, regole finance, backup e logica di dominio esistenti vanno preservati e riusati.

Ogni run deve essere GRANDE e produrre un miglioramento reale verificabile. Evitare micro-patch, restyling isolati, documentazione senza codice o test usati come finto avanzamento.

Priorità assolute, in ordine:
1. V2 foundation e data layer sicuro.
2. Garage completo photo-first + scheda auto + completezza dati.
3. OGGI action-first e Clienti next-action.
4. Vendita end-to-end: cliente → contratto → caparra → saldo → checklist → consegna.
5. Documenti + OCR spese con conferma umana.
6. Report reali sui dati completi.
7. Solo dopo: AutoScout/Instagram reali se tecnicamente disponibili, notifiche, AI e automazioni.

Vincoli permanenti:
- ZERO REGRESSIONI: V1 resta fallback finché V2 non supera i gate.
- VENDITORE non deve poter recuperare costi, margini o fatture complete da UI/API/cache/offline/backup/Telegram.
- Ricavo e margine solo dopo consegna fisica verificata.
- Nessun segreto nel browser o nel repository.
- Niente TinyFish, niente servizi a pagamento, niente costi ricorrenti se esiste una soluzione gratuita/open-source valida.
- PWA desktop + iPhone; niente ritorno all'EXE.
- Solo AutoScout e Instagram come canali commerciali esterni.
- UI “zero sbatti”: una prossima azione chiara, progressive disclosure, niente dashboard piene di numeri inutili.
- Non dichiarare integrazioni esterne come complete se non è stato eseguito un E2E reale.

Procedura obbligatoria di ogni run:
A. Leggi HEAD corrente, PR aperte, CI e debito precedente.
B. Scegli un pacchetto sostanziale che chiuda un flusso o una fase, non un micro-fix.
C. Implementa in branch dedicato senza toccare il fallback stabile.
D. Esegui typecheck/build/test mirati + regressione + browser gate quando il flusso è UI.
E. Correggi i problemi trovati e fai una seconda passata di test.
F. Apri PR con stato reale, limiti reali ed esattamente cosa è stato verificato.
G. Merge solo con gate verde e senza regressioni note P0/P1.
H. Se un gate dipende da API/servizi esterni o dispositivo fisico non disponibile, lascialo APERTO: mai fingere PASS.

Definition of Done di una run: deve esistere almeno uno di questi risultati reali: nuovo flusso end-to-end funzionante; modulo V2 realmente migrato; importante debito architetturale eliminato; sicurezza/affidabilità significativamente aumentata; esperienza mobile/desktop verificabilmente migliorata. Una run che produce solo CSS cosmetico, README, test senza funzione nuova o pochi fix scollegati è INSUFFICIENTE.

Report finale massimo 10 righe: FATTO / TEST / PR o COMMIT / COSA RESTA / NEXT_ACTION unico. Non raccontare il processo minuto per minuto.
