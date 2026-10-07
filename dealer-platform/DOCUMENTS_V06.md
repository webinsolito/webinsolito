# Documents V0.6

Modulo archivio documentale del Dealer Platform.

## Funzioni
- archivio documenti separato dall'Inbox;
- caricamento multiplo PDF/immagini fino a 20 MB per file;
- funzionamento offline con blob in IndexedDB separati dai metadata sincronizzabili;
- categorie documento, data documento, scadenza e note;
- collegamento opzionale a veicolo e/o cliente;
- ricerca per nome, categoria, targa/veicolo e cliente;
- filtri attivi, in scadenza entro 30 giorni, scaduti e archiviati;
- privacy PRIVATE predefinita;
- apertura del file locale senza upload obbligatorio;
- gateway Worker autenticato per R2 privato quando il backend è configurato;
- nessun URL R2 pubblico permanente.

## Cloud storage
Il Worker usa il binding Cloudflare R2 `DOCS_BUCKET`. `PUT /documents/file` e `GET /documents/file` richiedono un JWT Supabase valido e una membership ACTIVE nella concessionaria indicata da `x-dealer-id`.

Il database contiene solo metadata e `object_key`; i byte del file restano fuori da PostgreSQL.

## Database
Applicare `supabase/migrations/0005_documents_v06.sql` dopo le migrazioni precedenti. La migrazione aggiunge metadata archivio, indici per categoria/scadenza/relazioni e vincoli sui valori ammessi.

## Stato demo
Con `demoMode: true` i file restano sul dispositivo. Questo consente di provare l'intero archivio senza backend e senza esporre documenti a servizi esterni.
