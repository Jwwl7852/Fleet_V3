# V1 Readiness — sammenfatning

**Dato:** 2026-08-26
**Metode:** Feature freeze. Ingen kodeændring i denne audit. Produktet blev testet som en bruger ville teste det — klik-igennem i den kørende DEV-app (`localhost:5173`, tenant `demo`) på tværs af canonical navigation og syv roller, suppleret med kildelæsning for at forstå tilsigtet adfærd. Arbejdet blev delt på syv parallelle undersøgelser (seks funktionsområder + én tværgående rolle-/sikkerheds-/designgennemgang); denne fil samler deres konklusion. De øvrige fem filer i denne mappe er detaljerne.

**Metodisk forbehold:** de syv undersøgelser delte i perioder den samme Chrome-fane-gruppe, hvilket gav ægte, dokumenteret klik-flakiness (faner der blev navigeret væk af en anden proces midt i et forsøg). Hvor det skete, faldt undersøgelserne tilbage på kildelæsning og sagde det udtrykkeligt i stedet for at gætte. To findings, der så ud til at kunne være testmiljø-støj (Kunder-skærmens "Vis"-knap, og at et uploadet bilag ikke dukkede op i listen), er efterfølgende gen-verificeret af undertegnede alene, uden samtidig trafik — begge dele virker korrekt. Én rapport (Facility/Procure) bar en sikkerhedsklassifikator-advarsel om agentens egne handlinger; dens eneste BLOCKER-påstand er derfor uafhængigt genbekræftet direkte fra kildekoden, ikke taget for pålydende.

---

## Kan ejerne starte intern V1-test nu?

## **YES, AFTER THESE BLOCKERS**

Produktet er markant tættere på en sammenhængende V1 end en oprydningsfase typisk efterlader et produkt: seks af de otte navngivne ende-til-ende-kæder gennemførtes helt, sikkerhedsdisciplinen (aldrig et opdigtet tal, aldrig en påstået tilstand der ikke er sand, permission-denied vises som "reglerne virker" og ikke som en netværksfejl) holder konsekvent på tværs af alle testede skærme, og den nyeste feature (Skive 4D's rigtige ordremail) blev gen-verificeret at virke fuldt ud, inklusive den korrekte fjernelse af den gamle falske "Markér som sendt".

Der er **to konkrete, snævre BLOCKERE** — begge lokaliseret til én funktion hver, ingen af dem arkitektoniske — som bør rettes før ejerne bruger de to berørte flows. Resten af produktet kan testes nu.

---

## Antal fund

| Kategori | Antal |
|---|---|
| **BLOCKER** | 2 |
| **HIGH FRICTION** | 7 |
| **POLISH** | ~15 (se 05) |
| **FUTURE FEATURE (allerede ærligt afsløret)** | ~8 (se 05) |

## De to blockere

1. **Facility → "Planlæg service" kan aldrig gennemføres.** Cloud Function'en `facilityplanlaeg` bygger reservationens `kilde.id` FØR opgavens id er genereret — feltet er derfor altid `undefined`, og RTDB's `update()` kaster synkront på et hvilket som helst `undefined`-felt. 100 % reproducerbart, ingen tenant kan planlægge et nyt servicebesøg gennem UI'et i dag. Se `02_BLOCKERS_AND_FRICTION.md` for præcis linje og rettelsens form.
2. **Chaufførens "Anmod om frihed" lover et svar der aldrig kan komme.** Skærmens egen tekst siger "Kontoret svarer her i appen — ikke på mail", og en rigtig ansøgning skrives til databasen — men intet kontor-vendt skærmbillede kan se eller besvare den. En chauffør får en kvittering, og ansøgningen forsvinder i praksis. Se `02_BLOCKERS_AND_FRICTION.md`.

Begge er punktrettelser i én funktion/skærm hver — ikke et arkitekturproblem, og ikke en grund til at genoverveje freeze'et.

## Minimal anbefalet stabiliseringsrækkefølge

Ikke en roadmap — kun rækkefølgen for at lukke det der reelt blokerer:

1. **Ret `facilityplanlaeg`** (flyt `kilde.id`-tildelingen til efter `opgaveId` er genereret, eller generér id'et først). Dette er den eneste rettelse der er en reel funktionsblokade, og den er lille.
2. **Byg (eller bevidst fjern) et kontor-modtagested for `ansoegning`** — enten en synlig kø/handling på `Fravaer.jsx`, eller ret skærmens egen tekst så den ikke lover noget systemet ikke holder. Begge løsninger er acceptable; at lade det stå som det er, er ikke.
3. **(Anbefalet, ikke blokerende) Fjern eller skjul de rå udviklerpaneler** på Planning-skærmene (`NyForespoergsel.jsx`, `Forslag.jsx`) og **filtrér Planning's standardliste** på `art`, før en almindelig bruger sættes til at teste netop disse to skærme — begge er hurtige rettelser og vil ellers dominere den første brugeroplevelse med støj der ikke er reel.
4. Alt andet i `02`/`05` kan vente til efter den første interne testrunde er i gang — ingen af de øvrige fund forhindrer et flow i at blive gennemført.

Sikkerhedsstatus (04) kræver ingen handling for at starte **intern DEV-test** — den handler udelukkende om hvornår rigtige kundedata må røre produktet, hvilket er uden for denne audits formål (og allerede eksplicit sporet andetsteds).

## Testtal (uændret — ingen kode blev rørt)

`npm test`: **3486/3486 grønne**, lint ren. Se commit for detaljer.
