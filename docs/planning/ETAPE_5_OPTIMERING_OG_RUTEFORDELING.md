# Planning etape 5 – dagsoptimering og rutefordeling

## Formål og afgrænsning

Etape 5 er en lokal, deterministisk optimeringsprototype. Den fordeler godkendte Planning-opgaver på én primær medarbejder og højst ét primært køretøj pr. rute, beregner en lovlig stoprækkefølge og returnerer en valideret dagsplanskladde. Resultatet bliver ikke gemt, frigivet eller publiceret.

Prototypen bruger ingen kortleverandør, geokodning, trafikdata eller vejnet. Alle afstande og rejsetider stammer fra en eksplicit matrix, hvor hvert segment er mærket `SYNTETISK`. Den viste tekst er altid: **Bedste fundne plan – globalt optimum er ikke bevist.**

## Arkitektur og offentlige facader

`src/fleet/planning-optimization/index.js` er den eneste offentlige facade for optimeringslaget. Laget består af:

- `kontrakt.js`: job-, matrix-, resultat- og årsagskodekontrakter.
- `projektion.js`: tabfri projektion fra en samlet opgave med flere stop til interne planlægningsenheder.
- `motor.js`: deterministisk indsættelsesheuristik, tidsberegning, ressourcekontrol og resultatprojektion til Planning Basic.
- `demo-planning-optimization.js`: syntetiske scenarier, profiler, matrixgenerator og benchmarkfixture.

Laget er rent JavaScript. Det importerer kun den offentlige `planning-basic.js`-facade og egne filer. Det importerer ikke React, UI, Firebase, permissions, bookingtilstande, browser-API'er, netværk eller persistence. UI'et importerer kun `planning-optimization/index.js`.

## Optimeringsjobbet

Et job indeholder stabilt job-ID, tenantreference, kalenderdato, IANA-tidszone, eksplicit beregningstid, inputversion, planlægningspulje, normaliserede ressourcer, lokationer, start-/slutsteder, matrix, profil, baseline og en eksplicit operationsgrænse. Manglende inputversion eller beregningstid afviser hele jobbet; der returneres ikke en delplan, som ligner et gyldigt resultat.

Tid, inputversion og grænse injiceres. Motoren bruger hverken `Date.now()` eller `Math.random()` og muterer ikke input.

## Flerstop-opgaver

Hvert originalt stop projekteres til:

- et stabilt afledt Planning-opgave-ID;
- en entydig opgaveforekomst for datoen;
- en typed opgave- og lokationsreference;
- sporbarhed til original opgave, stop, ekstern reference og batch;
- det oprindelige udførelsessnapshot.

Alle stop i samme samlede opgave behandles i denne version som én sammenhængende blok. Blokken placeres på én rute, stoprækkefølgen bevares, og afhentning ligger derfor før den tilhørende levering. Interleaving af andre opgaver mellem afhentning og levering er udskudt.

## Syntetisk matrix

Et matrixsegment indeholder fra- og til-reference, rejsetid i minutter, afstand i meter, kilden `SYNTETISK` og matrixversion. Retningerne er uafhængige; A→B kan være forskellig fra B→A. Diagonaler skal være eksplicitte og have nul tid og nul afstand.

Ukendte lokationer, dubletter, negative værdier og versionsafvigelser afvises. Mangler et nødvendigt segment, bliver opgaven ikke-planlagt med `OPT_MATRIXSEGMENT_MANGLER`. Motoren bruger ikke modsat retning, koordinater, luftlinje eller standardtid som fallback.

## Regler og målfunktion

Hårde krav og kontrollerede undtagelser tilsidesættes aldrig automatisk. En kontrolleret undtagelse får `OPT_KONTROLLERET_UNDTAGELSE_KRAEVER_GODKENDELSE` og kræver en senere, særskilt manuel arbejdsgang.

Motoren håndhæver fast tid, tidsvindue, deadline, fri tid, stopvarighed, vagt, fravær, kompetencer, certifikatudløb, valgfrit eller påkrævet køretøj, type, normaliseret kapacitet, udstyr, ressourceunikhed, start/slut, afhængigheder, flerstoprækkefølge, kontinuitet og adresse-/matrixberedskab. Kapacitet er kun egnethedskontrol; dynamisk lastsaldo foregives ikke implementeret.

Prioriteringen er:

1. Strukturel og regelmæssig gyldighed.
2. Flest planlagte opgaver i rækkefølgen AKUT, HØJ, NORMAL og LAV.
3. Vægtet rejsetid.
4. Vægtet afstand.
5. Vægtet arbejdsbalance.
6. Vægtet antal køretøjer.
7. Vægtet foretrukken kontinuitet.

Delmålingerne returneres separat og skjules ikke i én score.

## Algoritme og tie-breaks

Algoritmen validerer først input, partitionerer efter eksplicit område/depot og topologisk sorterer afhængigheder. Inden for samme afhængighedsniveau sorteres opgaver efter prioritet, færrest egnede medarbejdere, tidskravets stramhed og til sidst stabilt ID. Den afprøver lovlige medarbejder-, køretøjs- og indsættelseskombinationer, genberegner hele ruten for hver kandidat og vælger laveste dokumenterede omkostning. Identiske kandidater afgøres stabilt efter typed medarbejderreference, typed køretøjsreference og hele rækkefølgens stabile blok-ID'er.

Et afgrænset 1-opt-trin afprøver nabobytninger uden at bryde afhængigheder. Når operationsgrænsen nås, returneres kun den bedste allerede fundne gyldige kladde. Resterende opgaver bevares med `OPT_OPERATIONS_GRAENSE`.

## Scenarier

Hjemmepleje-demoen har 22 fiktive besøg, seks medarbejdere, fem mulige køretøjer, to distrikter, alle fire tidsformer, kompetencer, certifikater, fravær, hård og foretrukken kontinuitet samt en bevidst umulig kompetence. Betegnelserne er syntetiske og indeholder ingen borgernavne eller helbredsdata.

Transport-demoen har 15 fiktive opgaver, leveringer, afhentninger, tre flerstop-opgaver, fire medarbejdere, fire køretøjer, type-/kapacitets- og udstyrskrav samt en bevidst umulig kranbilopgave. Begge scenarier bruger samme motor; forskellen ligger kun i data og profilvægte.

Den lokale planlægningspulje løftes til `PlanningDemo`. `PlanningIntake` ejer fortsat oprettelse, import og godkendelse, mens optimeringsvisningen kun læser samme lokale array. Ukontrollerede adresser og manglende matrixpunkter gættes ikke. Genindlæsning nulstiller al tilstand.

## Resultat og årsagskoder

Resultatet indeholder job- og inputversion, algoritme/version, `globaltOptimalitetsbevis: false`, kladderuter, tildelinger, stopsporbarhed, bevarede udførelsessnapshots, ikke-planlagte opgaver, før/efter/delta, evalueringer, forbedringsrunder og grænsestatus. Dagsplanskladden valideres gennem Planning Basic og en særskilt resultatvalidator.

Nye stabile koder er:

- `OPT_JOB_UGYLDIGT`, `OPT_INPUTVERSION_MANGLER`, `OPT_BEREGNINGSTID_MANGLER`.
- `OPT_TENANT_UOVERENSSTEMMELSE`, `OPT_REFERENCE_UKENDT`.
- `OPT_MATRIX_DUBLET`, `OPT_MATRIX_SEGMENT_UGYLDIGT`, `OPT_MATRIX_VERSION_FORKERT`, `OPT_MATRIXSEGMENT_MANGLER`.
- `OPT_ADRESSE_IKKE_KLAR`.
- `OPT_MEDARBEJDER_MANGLER`, `OPT_KOMPETENCE_MANGLER`, `OPT_CERTIFIKAT_MANGLER`, `OPT_CERTIFIKAT_UDLOEBET`.
- `OPT_VAGT_MANGLER`, `OPT_FRAVAER_OVERLAP`.
- `OPT_KOERETOEJ_MANGLER`, `OPT_KOERETOEJSTYPE_FORKERT`, `OPT_KAPACITET_UTILSTRAEKKELIG`, `OPT_UDSTYR_MANGLER`.
- `OPT_TIDSRUM_MANGLER`, `OPT_AFHAENGIGHED_UGYLDIG`, `OPT_KONTINUITET_UGYLDIG`, `OPT_KONTROLLERET_UNDTAGELSE_KRAEVER_GODKENDELSE`.
- `OPT_RESSOURCEKONFLIKT`, `OPT_OPERATIONS_GRAENSE`, `OPT_RESULTAT_UGYLDIGT`.

## Før-/eftermålinger og benchmark

Målingerne viser planlagte/ikke-planlagte opgaver, stop, prioritetspoint, rejsetid, afstand, service, ventetid, ruter, køretøjer og belastningsspredning. Delta beregnes felt for felt.

Benchmarkfixturet indeholder 190 køretøjer, 2.000 opgaver og 100 eksplicitte partitioner. Testen bruger 6.000 evalueringer, kontrollerer identisk checksum ved identisk input, præcis én disposition pr. stop, ingen tab og en valideret begrænset plan. Wall-clock-tiden rapporteres kun informativt og er ikke et SLA-krav.

## UI-flow

Den lokale navigation har visningen **Optimering**. Brugeren kan vælge Hjemmepleje-demo, Transport-demo eller den delte lokale planlægningspulje, redigere generiske præferencevægte, køre **Optimér dagsplan**, se før/efter-KPI'er, rutefølge, tider, tildelinger og konkrete ikke-planlagte årsager samt nulstille lokalt. Resultatet er tydeligt mærket som syntetisk og som kladde.

## Reproducerbare testkommandoer

```powershell
node --test --test-isolation=none test/planning-optimization/*.test.mjs
node --test --test-isolation=none test/planning-basic.test.mjs test/planning-basic-adapters.test.mjs test/planning-basic-v2.test.mjs test/planning-ui/planning-ui.test.mjs test/planning-input/planning-input.test.mjs test/planning-execution/planning-execution.test.mjs test/planning-optimization/*.test.mjs
npm run lint
npm run test:design
npm run build
git diff --check
```

Det konservative regressionsudsnit fra etape 4 køres desuden med den dokumenterede kommando i etape 3-dokumentationen.

## Kendte begrænsninger og udskudte integrationer

Heuristikken beviser ikke global optimalitet. Der er ingen automatisk pauseplanlægning, crew-optimering, dynamisk lastsaldo, live-/akutomplanlægning eller serverkø. Matricen er syntetisk og kan ikke bruges som vej- eller afstandsdokumentation.

Firebase, persistence, permissions, claims, tenantregler, kort, geokodning, vejnet, trafik, OBD, GPS, adressefortolkning, publicering, Cloud Functions, juridiske køre-/hviletidsregler, international routing, ADR, told, kabotage, lager, pris, faktura og PROCURE er udskudt. Etape 5 etablerer ingen midlertidig integrations- eller skrivevej til disse områder.
