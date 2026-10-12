# RISOLVI — specifica MVP v0.1

## Decisione di prodotto

La prima implementazione non prova a essere un “avvocato AI”. È un **Case Engine verificabile**: raccoglie fatti, individua informazioni mancanti, applica poche regole versionate e produce un'azione preparatoria controllata dall'utente.

La promessa utente è:

> Mandami quello che è successo. RISOLVI capisce il problema, verifica il percorso e ti prepara il prossimo passo. Gratis.

## Perimetro v0

Dentro: consumatore in Italia, venditore professionale Italia/UE, bene fisico, acquisto online, difetto/non conformità, venditore che rinvia al produttore, mancata consegna, recesso e sollecito rimborso.

Fuori: B2B, vendite tra privati, extra-UE, servizi, digitale, banche, assicurazioni, energia, telecom, danni alla persona, contenzioso e invio automatico.

## Architettura

```text
Web / Telegram (futuro)
        |
        v
 Intake & Upload
        |
        v
 Fact Extraction ----> Evidence / provenance
        |                     |
        v                     v
 User confirmation ---> Missing fact engine
        |                     |
        +-----------> Rule Engine <----- Source Registry
                              |
                              v
                    Recommendation Object
                              |
                              v
                    Action Draft Generator
                              |
                              v
                          User sends
                              |
                              v
                       Outcome / follow-up
```

Il frontend statico in `risolvi/` implementa intake, conferma fatti, rule routing e action draft **senza server**. È intenzionalmente limitato e gratuito.

L'API in `services/risolvi-api/` è il primo scheletro del Case Engine server-side. Non contiene ancora OCR o LLM; espone contratti dati e un motore deterministico testabile.

## Guardrail

1. nessuna decisione su fatti mancanti;
2. nessuna applicazione automatica a categorie fuori perimetro;
3. ogni route normativa deve avere una fonte istituzionale;
4. nessuna affermazione del tipo “hai sicuramente diritto a X” quando i fatti non sono sufficienti;
5. nessun invio automatico nella v0;
6. i file non devono diventare un archivio permanente per default.

## Passi successivi

1. legal review del rule pack;
2. 200 gold cases con error severity;
3. extraction strutturata con provenance;
4. seller / marketplace / manufacturer resolution;
5. storage temporaneo e deletion jobs;
6. evaluation CI e prompt-injection tests;
7. Wizard-of-Oz su 50–100 casi reali.
