# Etape 6A – ugeplanlægning og arbejdsflader

## Formål og afgrænsning

Etape 6A udvider den lokale Planning-prototype med en særskilt fremadrettet planlægningsflade og et genanvendeligt, ikke-modalt arbejdspanel. `Dagens drift` viser samlet status for den aktuelle demodag, `Livekalender` viser dagens udførelse og fremdrift, mens `Planlægning` bruges til fremtidig disponering. Ingen af fladerne gemmer, publicerer eller sender data.

Der er ingen backend, Firebase, persistence, eksternt kort, OBD, GPS, netværksklient eller rigtig kommunikationskanal. Alle personer, køretøjer, lokationer, beskeder og tidspunkter er deterministiske demo-fixtures.

## Arkitektur

`src/fleet/planning-scheduling/index.js` er den offentlige facade for et rent og frameworkuafhængigt lag. Laget ejer statusser, placeringsvalidering, foreløbig placering, flytning, fjernelse, planlagt-markering, ændringsønske og stopintegritetskontrol. Beregningstidspunkter og ID'er gives eksplicit af kalderen. Input klones, og samme input giver samme resultat.

`demo-planning-scheduling.js` leverer uge 38, opgaver, ruter, medarbejdere, køretøjer og en syntetisk flerdagsrute. Laget importerer ikke React, DOM/browser-API'er, Firebase, netværk, persistence, UI eller optimeringsmotoren. Browserbaseret synkronisering ligger alene i `PlanningDemo.jsx`.

Importgrænsen tillader Planning-UI at importere præcis `../planning-scheduling/index.js`. Direkte UI-import af scheduling-undermoduler er forbudt. Negative arkitekturassertions dækker React, browser-API'er, Firebase/persistence/netværk og import tilbage til Planning-UI.

## Ikke-modale arbejdsflader

`PlanningWorkPanel` er fortsat det genanvendelige højrepanel på siden `Opgaver`. Det har intet backdrop, ingen `aria-modal` og ingen fokusfælde. Det begynder under topbjælken, har uigennemsigtig flade, venstrekant, intern scroll, fast handlingslinje, luk-knap og Escape-håndtering.

På `Planlægning` vises den aktive opgave i ét kompakt, flytbart og ikke-modalt opgavevindue. Det har ingen backdrop eller fokusfælde og kan maksimeres inden for Planning-arbejdsfladen. Kalender, navigation og øvrige handlinger forbliver anvendelige. Maksimeret visning har fanerne `Placering`, `Opgavedetaljer` og `Bestillingstråd`; alle tre bruger samme aktive opgave-ID. Overskriften viser altid navn og stabil reference.

Drop eller klik på en ny opgave gør den straks aktiv og åbner det kompakte placeringsvindue. Klik på et eksisterende kalenderkort aktiverer præcis kortets opgave. Maksimering, faneskift og gendannelse bevarer placeringens indtastninger og trådhistorik. Luk-krydset eller Escape lukker kun vinduet; placering, opgave og kladde bevares. En åben filter-underkontrol lukkes før opgavevinduet.

Opgaverækker kan åbnes med klik, Enter eller mellemrum. Checkbox, link og øvrige selvstændige kontroller stopper event-bobling. En anden række udskifter straks panelindholdet. Kladdenoter ligger i React-sessiontilstand, markeres som `Kladde` og bevares, fordi Opgaver-visningen forbliver monteret ved intern navigation. Genindlæsning nulstiller fixtures.

`Åbn i ny fane` bygger en absolut same-origin Planning-URL med opgaveidentitet ud fra den aktuelle lokale side. Den kaldes efter direkte brugerklik og viser en lokal fejltekst, hvis browseren blokerer åbningen.

## Ugeplanlægning

Uge 38 viser en planlægningskø til venstre og en mandag–søndag-kalender til højre. Køen kan filtreres på opgavetype, krævet ressource, fleksibilitet og status. Kalenderen kan grupperes efter ruter, medarbejdere eller køretøjer. Forrige/næste uge og `I dag` ændrer den viste deterministiske uge uden at bruge systemtid.

En opgave kan placeres med HTML drag and drop eller med den tilgængelige klikfallback: vælg `Planlæg`, klik i et tomt område af den ønskede dato- og ressourcecelle, og vælg starttid og varighed. Hele cellen er dropområde og fremhæves diskret under træk. Et eksisterende opgavekort åbner altid den eksisterende opgave og starter ikke en ny placering. Placeringsformularen ligger i det flytbare vindue, viser alle konkrete valideringsfund og tilbyder `Gem kladde` eller `Annuller`. En kladde kan flyttes eller fjernes igen.

En kalendercelle viser alle sine opgaver som separate kort sorteret efter starttid og derefter stabilt placerings-ID. Cellens række vokser samlet på tværs af alle syv dage. Der vises ingen gentagen placeringsknap eller stiplet reserveret flade i cellerne. Drop på eller omkring et kort behandles som drop på cellens dato og ressource og overskriver aldrig det eksisterende kort. Ved tidskonflikt bevares både den første opgave og den nye placeringskladde, mens bekræftelse afvises med en konkret fejl.

Rutegrænser tegnes som én sammenhængende, semantisk Veyro-kant fra det fastlåste ressourcenavn gennem alle dagsceller. Dag- og tidslinjer er fortsat mere diskrete, så flere tilstødende ruter kan aflæses uden dobbelte eller tunge rammer. Den separate kalendervisning genbruger præcis samme celle- og rækkekomponent.

Ansvarsdelingen er uændret: `Faste ruter` er skabeloner for tilbagevendende besøg, `Planlægning` placerer konkrete opgaver på datoer og ressourcer, og `Livekalender` følger den aktuelle dags udførelse. Etape 6A omlægger ikke Faste ruter.

Følgende kontrolleres uden automatiske undtagelser:

- tilladt dato/periode og tidsvindue;
- kendt ressource og ressourcekonflikt inklusive returkørsel;
- kompetence;
- køretøjstype og normaliseret kapacitet;
- positiv varighed og nødvendig returkørsel;
- entydig flerstop-rækkefølge og afhentning før levering.

En flerstop-opgave ligger i én placering med alle stop bevaret. Opgaven splittes ikke mellem ressourcer eller datoer.

## Status, arbejdsgange og bestillingstråd

Bekræftelsesforløbet er adskilt fra udførelsesstatus og bruger én autoritativ status: `Kladde` → `Afventer bekræftelse` → `Bekræftet` eller `Ændring ønsket`. `Bekræftet` betyder alene, at den konkrete bestillerrolle har accepteret den viste version af dato, tid, ressource og stop; det betyder ikke, at opgaven er startet eller udført. Disponenten kan gemme en kladde og sende et versioneret forslag, men kan ikke selv udløse bestillerbekræftelsen.

Hvert forslag får stabilt ID og stigende versionsnummer. Bestillersvaret skal referere til præcis den viste version. Et gammelt svar afvises, gentagne identiske svar er idempotente, og en ændring af placeringen markerer den gamle version som erstattet og opretter igen en kladde. Tråden bevarer oprindelig bestilling, alle forslag, bekræftelser og ændringsønsker.

De tre arbejdsgange bevares som `Intern planlægning`, `Orientér bestiller` og `Kræv bekræftelse`. Hjemmeplejens besøg bruger som standard intern planlægning. Kun arbejdsgangen `Kræv bekræftelse` viser bekræftelseshandlingen i denne prototype; den særskilte bestillervisning er tydeligt en lokal rolle-simulation. Rigtig afsendelse skal senere ske gennem en særskilt adapter til den kanal, bestillingen kom fra.

Ved et bekræftet tidspunkt eller et ændringsønske oprettes højst én lokal notifikation. Klik udvider midlertidigt køfiltrene, vælger opgavens aktuelle uge og ressource, markerer opgaven og åbner dens tråd. Den tidligere filtertilstand kan gendannes. Hvis placeringen er flyttet eller fjernet, navigeres der ikke til en forkert celle; opgaven åbnes med en forklarende lokal status.

Kalenderkortene viser status med både ikon, tekst, kanttype og semantisk Veyro-farve. Kladder har kraftig advarselsmarkering og stiplet kant, afventende forslag har urikon, bekræftede forslag har flueben, og ændringsønsker har beskedikon. Den valgte opgave har en særskilt fokusmarkering, så valg og status ikke forveksles.

## Flerdagsruter

Flerdagsruter ligger nederst i ugekalenderen som et særskilt mønstret forløb med tekstetiketten `Flerdagsrute`, periode, køretøj, crew, stopfremdrift og afvigelse. Dagscellerne viser rutenes stop på de relevante dage.

Klik åbner hele ugeprogrammet med én sektion pr. dag, stoprækkefølge, planlagte og eventuelle faktiske tider, status og overnatning. Handlingen `Gå til dagens del i Livekalenderen` viser kun demoens aktuelle dagsafsnit i Livekalenderen, inklusive fremdrift, næste stop og dagens afvigelse. Livekalenderen redigerer ikke hele ugeforløbet.

## To vinduer

`Åbn kalender i nyt vindue` åbner en absolut same-origin kalender-URL efter direkte brugerklik. Valgt opgave og lokal ugeplan synkroniseres mellem samme-origin-visninger med `BroadcastChannel` i UI-laget. Tilstanden har et monotont lokalt revisionsnummer, så et nyåbnet vindues ældre fixture ikke kan overskrive en nyere arbejdsplan. Ingen data lagres.

Cross-window drag and drop betragtes ikke som en garanteret arbejdsgang. Den sikre fallback er: vælg opgaven i hovedvinduet, se `Opgave valgt` i kalenderen, klik dag og ressource, og brug tidsvælgeren. Lukning af ekstravinduet fjerner ikke hovedvinduets lokale plan. Det tilgængelige lokale browsermiljø kunne fysisk kontrollere kalender-only-visningen og fallbacken, men stillede ikke Microsoft Edge til rådighed; rigtig Edge cross-window drag and drop er derfor fortsat manuel UI-QA.

## Mobil

Mobilens primærhandlinger hedder ensartet `Start` og `Slut`. En sekundær tekst forklarer, om stoppet er et besøg, en serviceopgave, en afhentning, en levering eller en generisk opgave. `Slut` er deaktiveret indtil `Start`, og hændelseslisten bruger den samme rækkefølge. Der anvendes ingen rigtig GPS, OBD eller ekstern synkronisering.

## Reproducerbare kontroller

```text
node --test test/planning-scheduling/*.test.mjs test/planning-ui/planning-ui-6a.test.mjs
node --test test/planning-input/*.test.mjs
node --test --test-isolation=none test/planning-basic.test.mjs test/planning-basic-adapters.test.mjs test/planning-basic-v2.test.mjs test/planning-ui/*.test.mjs test/planning-input/*.test.mjs test/planning-execution/*.test.mjs test/planning-optimization/*.test.mjs test/planning-scheduling/*.test.mjs
npm run lint
npm run test:design
npm run build
git diff --check
```

Den konservative regression bruger den eksplicitte filliste fra etape 3-dokumentationen og suppleres med alle Planning-lag ovenfor.

## Kendte begrænsninger

- Ingen data overlever genindlæsning.
- Drag and drop er kun en bekvemmelighed; klikfallback er den understøttede tilgængelige arbejdsgang.
- Cross-window-synkronisering er same-origin browsertilstand, ikke en distribueret eller persistent løsning.
- Kalenderen planlægger én valgt primær ressource ad gangen; egentlig crew-planlægning er udskudt.
- Flerdagsruten er en syntetisk visualisering uden international routing, køre-/hviletidsregler, kort eller trafikinformation.
- Kommunikation, portaladapter, publicering, permissions, audit og persistence er udskudt til senere etaper.

## Fleksibel arbejdsflade – afsluttende 6A-runde

Den faste opgaveredigeringsflade under kalenderen er erstattet af ét kompakt, ikke-modalt opgavevindue. Vinduet åbnes ved valg, klikbaseret placering eller drop og ligger altid i den synlige Planning-arbejdsflade. Det kan flyttes i overskriften, centreres med tastaturets `Home`, maksimeres og gendannes. Maksimeret visning har fanerne `Placering`, `Opgavedetaljer` og `Bestillingstråd`. Ét aktivt opgave-ID styrer vinduets overskrift, kladde, validering, kalenderfremhævelse, detaljer og tråd. Lukning eller skift af opgave sletter hverken eksisterende placering eller sessionkladde.

Planlægningskøen er omlagt som en kompakt indbakke med søgning, antal, ugechips og øvrige filtre. Køen og ugekalenderen har hver sin lodrette rulning. Den lodrette separator imellem dem kan trækkes eller betjenes med venstre/højre piletast. Købredden holdes inden for sikre minimums- og maksimumsgrænser ved ændring af viewport; kalenderen optager resten af arbejdsbredden. Under 700 px erstattes splitvisningen af et tydeligt skift mellem `Planlægningskø` og `Ugekalender`.

Kalenderen indeholder mindst 30 syntetiske ruter og kan vise flere placeringer pr. dato og ressource. Kortene sorteres efter starttid og stabilt placerings-ID. Ressourcekolonnen og dagshovederne er sticky, mens kalenderen kan rulle i begge retninger. Drop på et eksisterende kort bobler ikke ind i en overskrivning; den omgivende celle modtager en ny placeringskladde, og den rene validering afviser tids-, kompetence-, køretøjs-, kapacitets-, retur- og flerstopkonflikter.

### Bestillerens oprindelige periode

Den offentlige inputkontrakt understøtter følgende periodetyper uden at etablere en parallel tidsmodel:

- `DATO`, `DATO_TID`, `TIDSVINDUE`, `ISO_UGE`, `DATO_INTERVAL` og `UDEN_DATO_OENSKE`;
- niveau `OENSKET` eller `SKAL_OVERHOLDES`;
- datoer som `DD-MM-ÅÅÅÅ` eller `ÅÅÅÅ-MM-DD`, klokkeslæt som `TT:MM` og ISO-uge med årstal.

Et ønske er en præference. En alternativ placering kan bekræftes lokalt med en synlig advarsel og uden at fremstille alternativet som accepteret. Et bindende krav giver en hård valideringsfejl. Den foreløbige placering gemmer et separat snapshot af bestillerperioden; den oprindelige bestilling overskrives ikke. Ældre CSV-filer uden de nye, eksplicitte periodekolonner får `UDEN_DATO_OENSKE` og beholder samtidig deres eksisterende Planning-dato og tidsform uændret.

Standard-CSV'en er semikolonsepareret UTF-8 med BOM og tilføjer kolonnerne `Bestillingsperiode`, `Periode-niveau`, `Ønsket dato`, `Ønsket tid`, `Ønsket vindue fra`, `Ønsket vindue til`, `Ønsket uge`, `Ønsket ugeår`, `Periode fra` og `Periode til`. Filen indeholder fortsat både et syntetisk én-stop-eksempel og en eksplicit flerstop-opgave. Rigtig `.xlsx` er fortsat udskudt uden falsk filformat eller ny dependency.

### Ugefilter og to vinduer

Ugefilteret følger som standard kalenderens ISO-uge. Brugeren kan skifte til manuel filtrering, kombinere uge 37, 38 og 39, vælge andre gyldige år/uger, inkludere `Uden datoønske` eller vise `Alle perioder`. Datointervaller medtages, når de overlapper mindst én valgt uge, og hver opgave vises højst én gang. Filtreringen anvender bestillerperioden – ikke oprettelsesdatoen eller den aktuelle placering.

`Åbn kalender i eget vindue` viser kun kalender, uge- og ressourcevalg, lokal status og opgavevinduet; platformsidebar, global topbjælke og planlægningskø udelades. Synkronisering bruger fortsat same-origin `BroadcastChannel` i UI-laget og revisionsbeskyttelse mod ældre fixtures. Browseren afgør, om visningen bliver et vindue eller en fane. Native cross-window-drag og Microsoft Edge er ikke verificeret; den dokumenterede fallback er at vælge opgaven i hovedvinduet og derefter klikke på dato/ressource i kalendervinduet.
