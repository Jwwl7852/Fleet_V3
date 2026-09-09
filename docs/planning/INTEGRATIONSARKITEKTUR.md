# Planning Basic – integrationsarkitektur

## Formål og afgrænsning

Planning Basic er en ren, brancheuafhængig JavaScript-domænekerne. Den kan validere et eksplicit snapshot, men ejer hverken brugerflade, persistence, adgangskontrol, kortdata eller optimering. Holstebro Kommune er referencecase; modellen indeholder ingen kommune- eller hjemmeplejespecifikke begreber.

Etape 1 er ikke produktionsklar. Den dokumenterer kontrakter og deterministiske regler, men dokumenterer ikke skalerbarhed til 190 køretøjer eller mange tusinde daglige opgaver.

## Ejerskab

| Område | Autoritativ ejer | Planning Basics rolle |
| --- | --- | --- |
| Planning-opgaver, forekomster, dagsplaner, ruter og rutestop | Planning Basic | Ejer domæneformen og de interne valideringsregler |
| Planning-ejede kunder, lokationer og enkle ressourcer | Planning Basic | Ejer et valgfrit, enkelt kartotek |
| Transportbooking, gods, pris, etape og transportstatus | Booking | Læses gennem en envejsprojektion; alle ændringer forbliver bookingkommandoer |
| Køretøjsstamkort | Fleet | Normaliseres som fakta med Fleet-id bevaret |
| Medarbejderstamkort, kompetencer, certifikater og fravær | Workforce | Normaliseres som fakta med `personId` bevaret og uden fraværsårsag |
| Facility-lokationer og reserverbare aktiver | Facility | Senere provider/adapter; Facility-id skal bevares |
| Tværgående reservationer og overlapkontrol | Fælles reservationsdomæne | Planning danner kun kandidater; den fælles kontrakt udfører understøttet konfliktkontrol |
| Audittransport og auditlagring | Fælles server-/auditlag | Planning beskriver auditpayload for en kontrolleret undtagelse, men skriver intet |
| Permissions, Database Rules og databeskyttelse | Sikkerheds- og serverlaget | Feltmetadata valideres kun strukturelt; metadata håndhæver ikke adgang |

## Typed source references

Alle ejede eller adapterede objekter forbindes med:

```js
{ kilde: "planning" | "fleet" | "workforce" | "booking" | "facility",
  art: "medarbejder" | "team" | "koeretoej" | "lokation" |
       "udstyr" | "kunde" | "opgave" | "rute",
  id: "stabilt-ejer-id" }
```

Den stabile nøgle er `kilde:art:id`. Kernen validerer kendt kilde og art, feltets forventede art, entydighed og at referencen findes i det samlede snapshot. En provider må levere en art, når den ejer kildens objekt; der er derfor ikke fastlåst en unødigt snæver kilde/art-matrix. Eksempler er `fleet:koeretoej:<fleet-id>`, `workforce:medarbejder:<personId>` og `planning:opgave:<opgave-id>`.

Adapterede visningsdata er snapshots af fakta. De må ikke udvikle sig til konkurrerende autoritative stamkort, og ejer-id'et må ikke erstattes af et Planning-id.

## Planning-aggregater

En `planningOpgave` beskriver varigt arbejde og krav. En `opgaveforekomst` binder opgaven til en lokal kalenderdato. Et `ruteStop` placerer netop denne forekomst på en bestemt rute med rækkefølge og konkret interval. Stamdata kopieres ikke ukritisk ind i stoppet.

En `dagsplan` er versionsaggregatet. Den har stabilt id, lokal dato, obligatorisk IANA-tidszone, positiv version, særskilt status, eksplicit beregningstid, ruter og ikke-tildelte forekomst-id'er. Versionen er grundlag for senere optimistic concurrency; etape 1 har ingen lagring eller transaktion.

Opgave, forekomst, rute og dagsplan har hver sin statusmodel. Transportens statusmaskine kopieres eller ændres ikke.

En rute kan have nul, ét eller flere køretøjer. Et køretøj bliver kun et valideringskrav, når opgaven kræver type eller fysisk kapacitet. Et team er en kandidatgruppe, ikke et reserverbart crew. En kladderute kan have kandidatteam uden medarbejder, mens en frigivet udførbar rute kræver mindst én konkret medarbejder.

Kontinuitet samler opgaver med en stabil nøgle og klassificeres som `HARD`, `CONTROLLED_EXCEPTION` eller `PREFERENCE`. Forskellige medarbejdertildelinger giver et fund på det højeste relevante niveau; en præference er ikke et hard stop.

## Klassificerede felter og undtagelser

Kontaktoplysninger, adgangsnoter, praktiske noter og virksomhedsdefinerede ekstrafelter repræsenteres som klassificerede værdier. Metadata omfatter feltnøgle, klassifikation, synlighedsroller eller -politik og præcis én af inline-værdi eller reference til en beskyttet værdi. Kernen validerer kun formen. Reel fortrolighed kræver senere permissions, Database Rules og serverkontrol.

En kontrolleret undtagelse peger stabilt på et `CONTROLLED_EXCEPTION`-fund og indeholder begrundelse, godkenderreference eller -rolle, eksplicit tidspunkt og korrelations-id. Kernen producerer domæneresultatet, men importerer ikke audittransport. `HARD` kan aldrig godkendes som undtagelse.

## Provider- og adaptergrænser

Providerkontrakten samler allerede indlæste Planning-ejede og adapterede eksterne objekter. Den afviser dublerede typed references og providerdata med uklart ejerskab. Kontrakten indeholder ingen netværks-, cache- eller persistence-service.

Adapterretningen er altid fra ejermodulets eksplicitte input til Planning-kontrakten:

- `fleet.js`: Fleet-køretøj til normaliseret køretøjsressource; id og ejerskab bevares.
- `workforce.js`: person, kompetence/certifikat, vagt og sanitiseret fravær til medarbejderressource; fraværsårsag og note bortfiltreres.
- `booking.js`: booking, etape, transportstop og statushændelser til read-only transportprojektion. Den eksporterer ingen skrivekommando og omgår ikke fireøjne-flowet.
- `reservationer.js`: dokumenteret konkret ressourcebrug til reservationskandidater.
- `providers.js`: kombinerer statiske input-snapshots og kontrollerer referenceejerskab.

Kernen importerer kun det importfri valideringslag. Adapterne må importere kernen og rene, dokumenterede domænefunktioner. Eksisterende moduler importerer ikke Planning-kernen i etape 1. Denne enrettede afhængighed undgår cirkulære imports og holder React, Firebase, permissions, `booking-state.js` og audittransport ude af kernen.

## Reservationer og interne konflikter

`tilReservationskandidater(dagsplan)` opretter én kandidat pr. konkret `ressourcebrug`. Den reserverer ikke alle rutens ressourcer i hele ruteintervallet og udvider aldrig et kandidatteam til teammedlemmer. Intervaller er halvåbne `[fra, til)`, så slut på ét interval må være start på det næste.

Medarbejder, køretøj og lokation oversættes til eksisterende fælles ressourcetyper. Udstyr kan danne en kandidat, men den nuværende fælles reservationsmodel understøtter endnu ikke typen; adapteren markerer dette i stedet for at opfinde parallel konfliktlogik. Understøttede kandidater kontrolleres med de eksisterende rene reservationsfunktioner. Etape 1 skriver ingen reservationer og lover ikke atomisk dobbeltbookingsbeskyttelse.

Kernen kontrollerer kun interne overlap mellem dokumenterede ressourceintervaller i det konkrete dagsplansnapshot. Konflikter mod øvrige modulers autoritative reservationer hører til den fælles reservationsgrænse.

## Senere solver, UI og persistence

En senere optimeringsmotor skal modtage et versionsmærket, valideret snapshot og returnere et forslag med forklaring og fund. Den må ikke mutere stamdata eller skrive reservationer. Accept og lagring skal ske i et særskilt serverflow med versionskontrol, permissions, audit og atomisk reservation.

En senere UI kan vise både generiske Planning-ruter og read-only transportprojektioner i samme Planning-modul. Transportbookinger skal fortsat redigeres gennem det eksisterende bookingflow. UI, Firebase og serverfunktioner skal afhænge af adapter-/applikationslaget, aldrig omvendt.

Etape 1 indeholder ingen ruteoptimering, demonstrationsheuristik, afstands- eller køretidsmatrix, grafisk kort, geokodning, adresseforslag eller import.

## Åbne produktejerbeslutninger

- Om og hvornår køretøj kræves for bestemte anvendelser.
- Om egentlig arbejdsholds-/crewsemantik skal tilføjes ud over kandidatteam.
- Autoritativ ejer og livscyklus for eksterne kunder samt beskyttede værdier.
- Om Facility-lokationer og udstyr skal være centralt reserverbare, og hvilke fælles ressourcetyper de får.
- Præcis frigivelses- og fireøjnepolitik for generiske dagsplaner.
- Hvilke `CONTROLLED_EXCEPTION`-regler der kan anvendes, og hvilke roller der må godkende.
- Serverkontrakt for atomisk reservation, versionskontrol og audit.
- Solverens kvalitetsmål, skaleringskrav og forklaringsformat.
- Valg af kort-, geokodnings- og vejdataleverandør i en senere etape.
