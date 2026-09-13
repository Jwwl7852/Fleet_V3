# Veyro Support – kundeplatform, implementering V1

> Historisk V1-rapport. Ejerinputtet, som denne rapport beskrev som manglende,
> er efterfølgende afstemt på ejer-HEAD
> `29b8b0252384cc111e58b3bfe279a18e56046642`. Den aktuelle kontrakt og
> adaptergrænse findes i `VEYRO_SUPPORT_KONTRAKT_V1.md` (V1.1) og
> `VEYRO_SUPPORT_AFSTEMNING_V1_1.md`.

Status: lokal, isoleret udviklingsleverance. Ingen push, merge, deployment, ekstern AI, rigtig mail eller produktionsdata.

## Grundlag

- Kildegrundlag: `6e164c9a0987096f1491a1d64c1846535b14683a`.
- Arbejdsspor: `codex/support-kundeplatform-development`.
- Worktree: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-support-kundeplatform`.
- Kravreference: `VEYRO_SUPPORT_KUNDEPLATFORM_SAMLING_V1.md` er behandlet som krav og designreference, ikke som tilladelse til deployment eller eksterne kald.
- Ejerreference: `VEYRO_EJERKONSOL_CODEX_V8_SUPPORT_AI.md` er alene orientering. Denne leverance ændrer ikke ejerkonsollens skærmbilleder.
- Visuel reference modtaget 12. september 2026: fanerne Supportchat, Mine sager og Vejledninger, samtale til venstre og sagsstatus/-metadata til højre.

Den fælles kontrakt ligger i `docs/VEYRO_SUPPORT_KONTRAKT_V1.md` og blev låst i et separat lokalt commit, før produktkoden blev skrevet.

## Ejerskab

| Område | Enkelt ejer |
| --- | --- |
| Kanonisk supportkontrakt, delte supportpolitikker, fælles callable endpoints og adgangsregler | Integrationschatten/supportsporet |
| Kundens Hjælp og support, kundesamtale og kundeadapter | Kunde-supportsporet |
| Ejerens kø, sagsarbejdsflade, interne noter og intern AI-assistance | Ejerchatten |
| AppShell, login, claims, fælles tema, root-dependencies og deploymentgate | Integrationschatten |

Ejerchatten må kalde de fælles `supportEjer*`-endpoints, men må ikke oprette en parallel servermodel eller skrive direkte i `support/`. Ændringer i kontrakt, endpoints, Rules eller delte filer koordineres i integrationschatten.

## Implementeret kundestrøm

1. Kunden åbner den eksisterende, lazy-loadede rute `/support` under den fælles AppShell.
2. Kunden starter en samtale. Serveridentitet kommer fra det signerede token; tenant og uid accepteres ikke fra payload.
3. Kun eksplicit kundegodkendte, versionsmærkede vidensposter kan danne et kundesvar. Den lokale fixture er syntetisk og handler om Fakturacenter.
4. Et ukendt spørgsmål eller kundens valg af Kontakt support flytter den samme sag og samtale til `afventerSupport` med ejeransvar.
5. Ejerens fælles endpoints kan liste, hente, overtage og svare i samme sag. Interne noter og intern AI ligger på separate, ikke-kundesynlige grene.
6. Ejerens svar tilføjes samme beskedtråd og sætter sagen til `afventerKunde`. Kundens næste besked starter ikke AI igen.
7. Kunden kan udtrykkeligt markere sagen løst og genåbne den samme sag.

Alle mutationer bruger et `anmodningId`. Sagsrevision og ansvar kontrolleres igen, før et AI-svar publiceres, så et forsinket svar ikke kan lande efter eskalering eller ejerovertagelse.

## Data og transport

Kanonisk servermodel:

- `support/sager/{sagId}`
- `support/beskeder/{sagId}/{beskedId}`
- `support/interneNoter/{sagId}/{noteId}`
- `support/internAi/{sagId}/{postId}`
- `support/idempotens/{uid}/{anmodningId}`
- `tenants/{tenantId}/supportsager/{sagId}` som minimalt tenantindeks

Browserklienten skriver aldrig direkte i disse noder. De eksisterende Rules nægter klientadgang til de nye supportnoder; emulatorprøverne bekræfter kunde, kollega, anden tenant og ejerbrowser. Adgang foregår gennem callable serverfunktioner.

Den lokale demo bruger kun `localStorage` under nøglen `veyro:support:v1:demo:<tenant>:<uid>`. Den er adskilt pr. miljø, tenant og bruger og indeholder kun syntetiske prøvedata. Der er ikke læst fra eller skrevet til Firebase eller eksisterende moduldatabaser.

Vedhæftninger er bevidst todelt:

- Demo: frivilligt billede/PDF på højst 1 MB gemmes kun i den isolerede lokale demo-origin.
- Servervariant: vedhæftninger afvises, indtil Storage-sti, metadata, scanning, retention og Rules er godkendt. Der foregives ikke en upload.

Ekstern AI og mailtransport er ikke aktiveret. AI-adapteren er deterministisk og lokal. Ejersvar leveres kun i portalen i denne leverance.

## Ændrede områder

- `src/fleet/support.js`: fælles V1-kontrakt, validering, adgang, synlighedsfilter, statusovergange og AI-publiceringsguard.
- `src/fleet/support-ai.js`: ren, lokal og kildeafgrænset kundesvaradapter.
- `src/fleet/support-lokal.js`: isoleret lager og kunde-/ejeradapter til demo og kontrakttest.
- `src/fleet/support-kunde-adapter.js`: lokal demo eller callable Functions; ingen direkte databaseadgang.
- `src/fleet/demo-support-viden.js`: én syntetisk, kundegodkendt og versionsmærket videnspost.
- `src/moduler/support/Hjaelp.jsx`: Supportchat, Mine sager, Vejledninger, ny samtale, samme tråd, eskalering, løsning/genåbning og sagsmetadata.
- `src/fleet/AppShell.jsx`: husker kun den seneste ikke-support-rute i sessionen til en allowlistet kontekst.
- `src/fleet/nav.js`: fælles titel og undertitel for supportskærmen.
- `src/fleet/fleet.css`: support-CSS scoped under `.fc-support` og kun med fælles tokens.
- `functions/support-endpoints.js`: 12 fælles callable endpoints for kunde- og ejersiden.
- `functions/index.js`, `scripts/kopier-delt.mjs`, `functions/delt/*`: eksport og kontrolleret kopi af de to delte supportfiler.
- `test/support-kontrakt-v1.test.mjs`: kontrakt- og ende-til-ende-domæneprøver.
- `test/rules.support-v1.test.mjs`: direkte klientadgang afvises i emulator.

Ingen dependencies eller lockfiler er ændret.

## Kontrol og beviser

### Domæne og arkitektur

- `node --test --test-concurrency=1 test/support.test.mjs test/support-kontrakt-v1.test.mjs test/functions-delt.test.mjs test/rutedeling.test.mjs test/design-tokens.test.mjs test/skive1-navigation.test.mjs test/skive2a-navigation.test.mjs`
  - Resultat: 114/114 bestået.
- Kontraktprøven `S3: kunde → eskalering → ejer → svar bruger samme sag og annullerer gammelt AI-svar` dokumenterer hele overdragelsen i ét lager og med ét `sagId`.
- Samme prøve dokumenterer, at et forsinket AI-svar afvises efter ejerovertagelse.
- `S6/S7` dokumenterer, at interne noter ikke lækker til kunden, og at kundens opfølgning efter overtagelse ikke genstarter AI.
- Functions-indgang indlæst lokalt: 12/12 forventede supportexports fundet.

### Rules og samlet regression

- `npm run test:rules` mod det syntetiske projekt `demo-fleetcontrol-rules-test` med isolerede lokale emulatorer:
  - Temurin JDK `21.0.11+10` fra `C:\Users\DennisChristensen\Tools\Adoptium\jdk-21.0.11+10\jdk-21.0.11+10`.
  - Firebase CLI `15.29.0`.
  - Databaseport `9200`, Storageport `9399`.
  - Resultat: 4301/4301 bestået; emulatorerne blev stoppet efter prøven.
- `npm run lint`: bestået.
- `npm run build`: bestået, Vite `5.4.21`, 570 moduler transformeret.
- `git diff --check`: bestået.

Den fulde Rules-kørsel blev udført før en efterfølgende UI-race-rettelse og en server-side udvidelse af ejer-idempotens. Rules-filerne er uændrede, og de berørte domæne-, arkitektur-, design-, Functions-kopi- og navigationstests er genkørt efter alle ændringer med 114/114 bestået.

En ny fuld emulatorstart blev forsøgt tre gange efter de sidste ændringer. Alle tre stoppede før testkoden med Java/Netty-miljøfejlen `Unable to establish loopback connection`; porte 9200, 9399, 4410 og 4510 var frie. En proceslokal `java.net.preferIPv4Stack=true` ændrede ikke udfaldet. Det er en emulator-/miljøblokering, ikke en Rules-testfejl, og den må ikke beskrives som en ny bestået sikkerhedsgate. Seneste faktisk gennemførte fulde resultat er derfor 4301/4301 ovenfor.

### Browser på bygget app

Den byggede app blev testet på `http://127.0.0.1:5214/support` med en separat origin og syntetiske data:

- Direkte åbning af `/support` under én AppShell.
- Kendt Fakturacenter-spørgsmål gav et lokalt AI-svar med titel, version og kilde.
- Samme sag overlevede reload med `?sag=<id>`.
- Manuel Kontakt support beholdt sagsnummer og hele samtalen og viste `Afventer Veyro Support`.
- En kundebesked efter eskalering blev føjet til tråden uden et nyt AI-svar.
- Ukendt syntetisk spørgsmål blev automatisk eskaleret i samme sag.
- Ny samtale vises straks; en fundet race med et gammelt query-parameter blev rettet og genverificeret.
- Mine sager viste tre isolerede prøvesager; frem/tilbage skiftede mellem de korrekte sags-URL'er og tråde.
- Browserkonsol: 0 warnings/errors fra forløbet.

Ejerens UI er ikke implementeret eller browsertestet her. Overdragelsen og retursvaret er bevist på den fælles adapter/kontrakt i automatiseret test; den senere ejerleverance skal browserverificere sin konkrete kø og sagsflade mod de samme endpoints.

## Åbne afhængigheder og gates

1. Ejerchattens konkrete kontraktinput mangler fortsat. Især skal ejeren bekræfte feltnavne, køfiltre, statusskift, SLA-præsentation og mapping fra den nuværende ejer-vidensbase.
2. `kundeGodkendt` findes ikke i ejerens nuværende vidensbase-UI. Ejerleverancen skal kunne vedligeholde flaget uden at gøre interne udkast kundesynlige.
3. Ejerens eksisterende support-/salgsmodel under `udbyder` må ikke blive en parallel supportsag. En eksplicit migration/mapping skal aftales.
4. Storage-transport, filregler, malwarekontrol, retention og downloadautorisation mangler; servervedhæftning er derfor lukket.
5. Rigtig mailnotifikation og svarindlæsning mangler. Mailafsendelse må først aktiveres efter fælles outbox-, idempotens- og leveringsgate.
6. Ekstern AI-provider, databehandlerforhold, logging/redaction, prompt-/kildepolitik, omkostningsgrænser og kill switch mangler. Lokal adapter er ikke en produktions-AI.
7. De nye Functions og supportdata er ikke deployet. Serverlagring og kunde↔ejer-forbindelse er derfor ikke live.
8. Functions-pakken kræver Node 20, mens denne lokale maskine kørte importkontrollen med Node `24.19.0`; en Node 20-emulator-/deploygate er stadig nødvendig.
9. Kendte dependency-fund er ikke rettet i dette afgrænsede trin: root-installationen rapporterede 21 fund (18 moderate, 3 high), Functions 11 moderate. Der er ikke kørt `npm audit fix` eller foretaget brede opgraderinger.
10. Produktionsbuilden viser den allerede kendte CSS-kommentaradvarsel om en backtick i `fleet.css`; den er ikke introduceret af support-CSS'en.

## Aflevering til ejerchatten

Ejerchatten skal bygge sin kø og sagsflade mod følgende allerede definerede endpoints:

- `supportEjerKoelist`
- `supportEjerSagHent`
- `supportEjerOvertag`
- `supportEjerSvarSend`
- `supportEjerNoteSkriv`

Den skal bevare samme `sagId`, revisionskontrol og `anmodningId`, vise kunde-beskeder fra `support/beskeder`, holde interne noter i `support/interneNoter` og aldrig publicere intern AI direkte til kunden. Eventuelle kontraktændringer sendes tilbage til integrationschatten som et præcist forslag; fælles filer ændres ikke ensidigt.
