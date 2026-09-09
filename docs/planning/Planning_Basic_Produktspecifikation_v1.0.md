# Veyro Planning Basic

## Produktspecifikation og teknisk udviklingsgrundlag

**Version:** 1.0  
**Dato:** 4. september 2026  
**Status:** Godkendt grundlag for første implementering  
**Referencecase:** Holstebro Kommune, ca. 190 køretøjer  
**Målgruppe:** Produktejer, Codex og øvrige udviklere

---

## 1. Beslutning og produktretning

Planning er et selvstændigt modul i den samlede Veyro-platform. Det er ikke et separat produkt eller en separat kodebase. Denne specifikation erstatter ikke Fleet, Workforce eller andre moduler; den beskriver den fælles Planning Basic-kerne og dens kontrollerede integration med de øvrige moduler.

Planning Basic skal være brancheuafhængig. Holstebro Kommune er referencecase for kapacitet og kommunal anvendelighed, men kernens begreber må ikke bindes til hjemmepleje. Der udvikles ingen særskilt branchepakke i første omgang.

Den eksisterende transportorienterede bookingløsning må ikke blot omdøbes. Genbrugelige komponenter skal bevares, mens en ny generisk model for opgaver, ruter og ressourcer etableres.

### 1.1 Første produktmål

Den første leverance skal være en klikbar prototype med fiktive data, koblet til en ægte optimeringskerne, som er egnet til at videreføre til den endelige løsning. Prototypen må ikke præsentere foruddefinerede resultater som ruteoptimering.

### 1.2 Afgrænset betydning af "produktionsklar motor"

Optimeringsmotoren skal være reel, deterministisk ved identiske input og bygget som den fremtidige kerne. Hele Planning-løsningen betragtes dog ikke som produktionsklar, før integrationer, sikkerhed, samtidighed, overvågning og realistisk belastning er dokumenteret.

## 2. Brugere, roller og ansvar

### 2.1 Planlægger/disponent

Planlægger/disponent er den eneste rolle, som ændrer den daglige plan i Planning Basic. Rollen kan:

- Oprette, importere, redigere og annullere opgaver.
- Fordele opgaver på ruter, medarbejdere, teams, køretøjer og udstyr.
- Køre optimering for hele planen eller et udvalgt område.
- Flytte opgaver manuelt og håndtere akutte ændringer.
- Udgive planer efter virksomhedens valgte arbejdsgang.
- Godkende kontrollerede undtagelser med begrundelse.

### 2.2 Virksomhedsadministrator

Virksomhedsadministratoren styrer:

- Virksomhedens betegnelse for kundekartoteket, fx Kunder, Borgere, Modtagere eller Lokationer.
- Ekstra felter og hvilke roller der må se dem.
- Automationsniveau og frigivelsesflow.
- Adgangsniveau til rapporter om individuelle medarbejdere.
- Standardindstillinger for optimering og visninger.

### 2.3 Udførende medarbejder

Medarbejderen ændrer ikke selve planen, men kan modtage ruten og sende status. Planen skal kunne leveres gennem:

- Veyro mobil-/webapp.
- PDF eller udskrift.
- Link via e-mail eller SMS.
- Integration til et andet system.

## 3. Fælles domænemodel

### 3.1 Opgave

En opgave er den mindste planlægningsenhed. Den skal kunne indeholde:

- Kunde/reference og lokation.
- Varighed.
- Fast mødetid, tidsvindue, deadline eller frit tidspunkt på dagen.
- Prioritet.
- Kompetence- og certifikatkrav.
- Krav til køretøjstype, kapacitet og udstyr.
- Praktiske noter og adgangsoplysninger med adgangsstyring.
- Status, historik og eventuelle afhængigheder.

### 3.2 Rute

En rute er en ordnet samling af opgaver og stop med:

- En eller flere medarbejdere.
- Et eller flere køretøjer.
- Udstyr eller andre ressourcer.
- Start- og slutsted.
- Planlagte tidspunkter, køretid, afstand og ventetid.
- Udgivelsesstatus og versionshistorik.

Kravet om, hvorvidt en rute kan gennemføres uden køretøj, er åbent og skal afklares med kommunen. Datamodellen må derfor ikke gøre køretøj teknisk obligatorisk.

### 3.3 Ressourcer

Planning har et enkelt, selvstændigt kartotek over medarbejdere, teams, køretøjer, udstyr og andre ressourcer. Hvis kunden har Fleet eller Workforce, udvides kartoteket med stamdata fra disse moduler uden dobbeltregistrering.

### 3.4 Kunder og adresser

Standardbetegnelsen er Kunder, men virksomheden kan ændre betegnelsen. Minimumsfelter er:

- Navn eller kundenummer.
- Adresse og validerede koordinater.
- Kontaktoplysninger.
- Praktiske adgangsnoter.

Kommercielle kunder og eventuelle borgere/patienter må ikke dele samme følsomme datamodel. Ekstra felter skal være adgangsstyrede, og oplysninger må ikke lække til kort, eksport eller medarbejdervisninger uden den nødvendige rolle.

## 4. Opgavetyper og gentagelser

Planning Basic skal fra starten understøtte:

- Ruter med flere stop.
- Faste tilbagevendende opgaver.
- Akutte opgaver samme dag.
- Afhentning før levering.
- Opgave B efter opgave A.
- Krav eller præference om samme medarbejder på flere opgaver.
- Opgaver uden indbyrdes afhængighed.

Gentagelser skal kunne oprettes dagligt, på bestemte ugedage, hver anden/n-te uge eller måned samt ved kopiering af en tidligere dag eller rute.

## 5. Planlægningsflow

### 5.1 Indlæsning

Opgaver kan komme ind gennem:

1. Manuel oprettelse.
2. Excel- eller CSV-import via Veyros standardskabelon.
3. Kopiér og indsæt fra et regneark.
4. Genbrug af tidligere gemte kunder og adresser.
5. Integration til kundens system.

Basic indeholder standardimport og et integrationsklart grænsefladeprincip. Kundespecifik udvikling og opsætning af integrationer kan faktureres som implementeringsydelse.

### 5.2 Importkontrol

Importen skal vise forhåndsvisning, rækkevise fejl og dubletter, før data aktiveres. En fejl i én række må ikke stoppe gyldige rækker.

### 5.3 Adresseproces

1. Adressen normaliseres, og ufarlige formatforskelle rettes automatisk.
2. Systemet viser adresseforslag og placering på kort.
3. Ved flere mulige resultater vælger disponenten den korrekte adresse.
4. Hvis adressen ikke kan valideres, får opgaven status "Kræver adressekontrol" og placeres i en rettelseskø.
5. Opgaven kan ikke optimeres eller udgives, før adressen er godkendt.
6. Disponenten kan som sidste udvej placere kortnålen manuelt.
7. Den valgte position gemmes sammen med oprindelse og ændringshistorik.

### 5.4 Planlægning og optimering

Planlæggeren kan arbejde manuelt, køre optimering eller kombinere begge dele. Automationsniveauet vælges pr. virksomhed og skal mindst kunne dække:

- Systemet foreslår; bruger godkender.
- Automatisk plan før arbejdsdagen.
- Løbende automatisk omplanlægning.

Der skal altid være mulighed for manuel overstyring inden for regelmodellen.

### 5.5 Akutte opgaver

Ved en akut opgave skal systemet kunne:

- Foreslå den bedste placering i en eksisterende rute.
- Lade disponenten placere opgaven manuelt.
- Genberegne udvalgte ruter.
- Genberegne hele dagsplanen.

Eksisterende aftaler og låste stop må kunne beskyttes mod genplanlægning.

### 5.6 Udgivelse

Virksomheden vælger, om planen udgives som kladde efter godkendelse eller om tilladte ændringer vises straks. Udgivelsen skal oprette en version, så tidligere planer og efterfølgende ændringer kan dokumenteres.

## 6. Regler og undtagelser

Planning Basic bruger tre regelniveauer.

### 6.1 Ufravigelige krav

Eksempler er udløbet påkrævet certifikat, fysisk overkapacitet, dobbeltbooking samt logisk umulig rækkefølge. Disse krav kan ikke tilsidesættes. En opgave, der ikke kan placeres lovligt og fysisk muligt, skal forblive ikke-planlagt med en tydelig forklaring.

### 6.2 Kontrollerede undtagelser

Eksempler er arbejde uden for normal vagt, overskridelse af et ønsket tidsvindue eller brug af en mindre foretrukken medarbejder. Den automatiske motor må ikke bryde disse regler. Disponenten kan godkende en undtagelse efter en tydelig advarsel og skal angive en begrundelse, som gemmes i auditloggen.

### 6.3 Præferencer

Eksempler er korteste rute, jævn arbejdsfordeling, kontinuitet og færrest mulige køretøjer. Disse kan ændres manuelt og vægtes i optimeringen.

## 7. Optimeringsmotor

### 7.1 Formål

Når flere gyldige planer findes, skal motoren kunne balancere:

- Kortere køretid og afstand.
- Færre køretøjer i brug.
- Jævn arbejdsfordeling.
- Kontinuitet hos samme medarbejder.

Vægtene skal være konfigurerbare pr. virksomhed. Standardprofilen skal prioritere alle ufravigelige krav først og derefter minimere samlet rejsetid uden at skabe urimelig arbejdsfordeling.

### 7.2 Krav til motoren

Motoren skal:

- Anvende vejbaseret rejsetid og afstand, ikke luftlinje, når en rutetjeneste er tilsluttet.
- Understøtte tidsvinduer, varigheder, kompetencer, kapacitet, arbejdstid, fravær, start/slutsteder og afhængigheder.
- Kunne optimere hele dagen, valgte områder og udvalgte ruter.
- Returnere både planlagte og ikke-planlagte opgaver med årsagskoder.
- Returnere før-/eftermålinger.
- Være deterministisk ved samme data, konfiguration og beregningsgrænse.
- Køre som et isoleret job, så klienten ikke fryser, og så beregningen kan annulleres eller tidsbegrænses.

### 7.3 Foreløbig kapacitet

Indtil kommunen leverer faktiske mængder, anvendes 190 køretøjer og 2.000 syntetiske opgaver pr. dag som internt benchmark. Dette er et udviklingsmål, ikke en kontraktlig SLA. Arkitekturen skal kunne opdele beregninger efter dag, afdeling, geografisk område eller depot.

## 8. Brugerflade

### 8.1 Primært planlægningsbord

Planning Basic har skift mellem dag og uge. Hovedskærmen skal samle:

- Kø med ikke-planlagte opgaver.
- Ruter som tidslinjer.
- Ruter og stop på kort.
- Konflikter, advarsler og nøgletal.

Visningen skal kunne opdeles og filtreres efter afdeling/team, geografisk område, depot/startsted og frit valgte filtre eller grupper. Systemet må ikke forsøge at vise alle 190 køretøjer som permanente kalenderækker.

### 8.2 Manuel redigering

Disponenten skal kunne flytte opgaver og ændre rækkefølge med drag-and-drop. Hver flytning skal valideres mod reglerne, vise konsekvens for tid/afstand og markere eventuelle kontrollerede undtagelser før lagring.

### 8.3 Kort

Kortet skal vise stop, ruter, valgte adresser og fejl. Kort og tidslinje skal følge samme filtre og markeringer. Et stop valgt på kortet skal fremhæves på tidslinjen og omvendt.

## 9. Gennemførelse og status

Medarbejderen skal kunne sende:

- Rute modtaget/accepteret.
- På vej/ankommet.
- Opgave startet/afsluttet.
- Forsinkelse, problem eller afvisning.

Disponenten skal se statusændringer på planen. Status må ikke i sig selv give medarbejderen ret til at omplanlægge ruten.

Live-position leveres fra OBD/GPS-enhed og er et betalt tilvalg. Planning Basic skal kunne fungere med manuelle statusser uden live-position.

## 10. Rapporter og historik

Planning Basic skal måle:

- Planlagt mod faktisk tid og afstand.
- Opgaver afsluttet til tiden.
- Udnyttelse af medarbejdere og køretøjer.
- Forsinkelser, afvigelser og akutte ændringer.

Historikken skal mindst vise:

- Hvem ændrede hvad og hvornår.
- Begrundelser for kontrollerede undtagelser.
- Før- og efterresultat ved optimering.
- Udgivne planversioner og efterfølgende ændringer.

Virksomheden vælger adgangsniveauet til individuelle medarbejderresultater. Standardvisningen bør være aggregeret på team eller afdeling.

## 11. Basic og tilvalg

### 11.1 Planning Basic

Basic omfatter den fælles opgave- og rutemodel, manuelt planlægningsbord, gentagelser, standardimport, gemte kunder/adresser, adressekontrol, kort, den reelle optimeringsmotor, genoptimering, udgivelse, status, grundrapporter, audit og adgangsstyrede virksomhedsdefinerede felter.

### 11.2 Betalt tilvalg

OBD/GPS-liveposition er et betalt tilvalg. Kundespecifikke integrationer kan desuden udløse en særskilt implementeringspris, selv om integrationsmuligheden tilhører Planning Basic.

Der udvikles ingen særskilt kommune-, hjemmepleje-, transport- eller servicepakke i denne fase.

## 12. Genbrug fra eksisterende Veyro

Følgende bør genbruges, hvis deres kontrakter kan holdes generiske og tests fortsat består:

- Kalendergitter og tidsberegning.
- Reservationer og overlapkontrol.
- Køretøjs-, medarbejder-, kompetence- og fraværsstamdata.
- Stopformat og status-/auditmønstre.
- Tenant- og datatilstandsmønstre.

Følgende må ikke genbruges ukritisk:

- Den kommercielle booking som universel opgavemodel.
- Den kommercielle kundemodel som borger-/patientmodel.
- View-only ugevisning som hovedskærm.
- Den nuværende tekstbaserede "Rute & status" som kortløsning.
- Klientfiltrering og faste 500-postgrænser som skalastrategi.

## 13. Tekniske og sikkerhedsmæssige krav

- Alle data skal være tenant-isolerede.
- Følsomme ekstra felter skal kunne begrænses pr. rolle og må ikke følge automatisk med i eksport eller medarbejdervisning.
- Centrale planændringer, optimeringsresultater og undtagelser skal skrives atomisk eller med versionskontrol.
- Samtidige redigeringer må ikke kunne skabe stille dobbeltbookinger.
- Læsninger skal afgrænses efter dato, område og relevante ressourcer; store datatræer må ikke hentes og filtreres ukritisk på klienten.
- Prototype og testdata skal være tydeligt syntetiske og må ikke skrives til en eksisterende kundetenant.
- Planning-arbejdet må ikke ændre sikkerhedsbranchens filer, før den er merget.

## 14. Første implementeringsforløb

### Fase 0 - Isolering og kontrakter

- Opret særskilt Planning-branch fra opdateret master.
- Bekræft rent arbejdstræ og ingen overlap med sikkerhedsbranchen.
- Fastlæg nye generiske typer og adaptere til eksisterende stamdata.
- Skriv tests for regelniveauer, opgaver, ruter og årsagskoder.

### Fase 1 - Klikbar lokal arbejdsflade

- Byg dag-/uge-skift, filtre og grupper.
- Vis ikke-planlagte opgaver, tidslinjer, kort og konflikter.
- Tilføj 20-30 fiktive opgaver, 5-8 medarbejdere og køretøjer.
- Implementér manuel flytning og lokal regelvalidering.
- Implementér standardskabelon, indsæt-fra-regneark og import-preview.

### Fase 2 - Reel optimeringskerne

- Indfør solveradapter og struktureret optimeringsinput/-output.
- Understøt tidsvinduer, varighed, kapacitet, kompetencer, arbejdstid, fravær og afhængigheder.
- Returnér årsager til ikke-planlagte opgaver og før-/eftermålinger.
- Kør kun på syntetiske data, indtil datasikkerhed og kundekrav er godkendt.

### Fase 3 - Geografi og ruter

- Tilslut adressekontrol, geokodning og vejbaseret tids-/afstandsmatrix.
- Implementér rettelseskø og manuel kortnål.
- Vis beregnede ruter synkroniseret med tidslinjen.

### Fase 4 - Udgivelse, status og historik

- Tilføj virksomhedsvalgt udgivelsesflow.
- Forbind medarbejdervisning, PDF/udskrift og linklevering.
- Gem planversioner, statusser, undtagelser og optimeringsmålinger.

### Fase 5 - Skalering og produktionsmodning

- Benchmark 190 køretøjer/2.000 syntetiske opgaver.
- Test parallelle planlæggere, samtidige ændringer og afbrudte beregninger.
- Indfør overvågning, jobstatus, timeout, retry-politik og fejlhåndtering.
- Erstat benchmarkantagelser med kommunens faktiske volumen og arbejdsgange.

## 15. Første prototypes acceptkriterier

Prototypen kan godkendes, når:

1. Den kører uden forbindelse til en kundetenant og viser kun fiktive data.
2. Dag og uge kan vælges, og data kan filtreres efter mindst team, område og depot.
3. Ikke-planlagte opgaver, rutetidslinjer, kort og konflikter er synlige på samme arbejdsflade.
4. En opgave kan oprettes manuelt og importeres via Veyros standardskabelon.
5. En opgave kan flyttes med drag-and-drop og valideres mod reglerne.
6. "Optimér" udfører en reel beregning og ændrer fordeling og rækkefølge.
7. Motoren bryder ingen ufravigelige krav og forklarer ikke-planlagte opgaver.
8. Før-/efterresultater viser tid, afstand, antal køretøjer og arbejdsfordeling.
9. Akut opgave kan indsættes manuelt eller udløse genberegning af valgte ruter eller hele dagen.
10. Ingen filer fra den aktive sikkerhedsbranch ændres.

## 16. Testkrav

- Enhedstests for tidsregler, gentagelser, afhængigheder og regelniveauer.
- Kontrakttests for solverinput, solveroutput og årsagskoder.
- Test af import, dubletter, delvise fejl og adressekø.
- Test af drag-and-drop med hard block, kontrolleret undtagelse og præference.
- Determinismetest med fast seed og identisk input.
- Belastningstest med dokumenteret datasæt og tidsgrænse.
- Browserbaseret end-to-end-test af den aktuelle React-visning før kundedemo.

## 17. Konfliktgrænser under sikkerhedsarbejdet

Indtil sikkerhedsbranchen er merget, må Planning-arbejdet ikke ændre:

- `firebase.rules.json`
- `functions/index.js`
- `functions/delt/`
- `src/firebase.js`
- `src/fleet/permissions.js`
- `package.json`
- `.github/workflows/`
- Claims-, migrations- og provisioneringsfiler eller deres tests

Første prototype skal derfor isoleres i nye Planning-filer og eksisterende Planning-skærme med mindst mulig konfliktflade.

## 18. Åbne kundespørgsmål

Følgende kan ikke fastlægges uden yderligere oplysninger fra Holstebro Kommune:

- Antal opgaver/besøg pr. dag, spidsbelastning og planlægningshorisont.
- Om ruter kan gennemføres uden et registreret køretøj.
- Faktiske vagt-, pause- og arbejdstidsregler.
- Områder, depoter og start-/slutsteder.
- Hvilke kompetencer og kontinuitetskrav der er ufravigelige.
- Kildesystem, filformat og opdateringsfrekvens.
- Krav til adgang, personoplysninger, opbevaring og sletning.
- Nødvendig beregningstid og forventet antal samtidige planlæggere.
- Om OBD/GPS skal anvendes i pilotfasen.

Disse spørgsmål må ændre konfiguration og kapacitetsmål, men bør ikke kræve en ny grundmodel.

## 19. Implementeringsordre til Codex

1. Kontrollér branch, HEAD, origin-status, arbejdstræ og aktive worktrees.
2. Stop ved overlap med sikkerhedsbranchen eller et urent arbejdstræ.
3. Opret en separat Planning-branch fra opdateret master.
4. Implementér Fase 0 og Fase 1 først uden Firebase-skrivning og uden rigtige persondata.
5. Genbrug eksisterende komponenter via adaptere; ændr dem kun ved dokumenteret mangel.
6. Skriv tests før eller sammen med hver domænefunktion.
7. Præsenter optimering som reel optimering først, når solverberegningen faktisk køres.
8. Kør målrettede tests, fuld relevant testsuite og build før commit.
9. Lav ét tydeligt checkpoint-commit og rapportér ændrede filer, testresultater og kendte begrænsninger.

---

**Produktbeslutning:** Planning Basic er en fælles, selvstændigt købbar planlægningskerne i Veyro. Den skal kombinere manuel disponering, reel automatisk optimering, kort, standardimport, fleksibel udgivelse og dokumenterbar drift. OBD/GPS-liveposition er tilvalg; branchespecifikke pakker udskydes.
