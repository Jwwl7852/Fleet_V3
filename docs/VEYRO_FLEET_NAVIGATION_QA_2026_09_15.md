# FLEET tilbage-navigation – QA 15. september 2026

## Omfang

Rettelsen gør FLEETs detaljevisninger route-sikre og giver en intern fallback ved direkte URL eller genindlæsning. Returtilstanden indeholder kun en valideret intern sti og en ikke-negativ scrollposition. Den integrerede platform accepterer kun returstier under `/fleet-v2` eller `/opsaetning`; standalone-visningen accepterer interne stier under `/`.

Følgende brugerstate bevares gennem relevante detaljeforløb:

- enhedskatalogets filtre, sortering og kort-/tabelvisning;
- enhedsprofilens valgte fane pr. enhed;
- indberetningstriagens filtre og valgte indberetning;
- arbejdskøens filtre, sortering, kanban-/tabelvisning, valgte sag og scrollposition;
- retur mellem sagsmappe, værkstedstildeling, dokumenter og leasingdetaljer.

## Faktisk browserbevis

Browserkontrollen blev kørt mod FLEETs lokale standalone-build på `http://127.0.0.1:5197/` med `strictPort` efter kontrol af, at porten var ledig.

- Overblik → Arbejdskø: navigationen landede på `/arbejdsko`.
- Arbejdskø: søgningen `Knirkende`, tabelvisning og den valgte sag var bevaret gennem sagsmappe og værkstedstildeling.
- Indberetninger: søgningen `Knirkende` og den valgte indberetning var bevaret efter åbning af sagsmappen.
- Enheder: søgningen `Silence`, kortvisning og fanen `Skader` på SC-104 var bevaret gennem sagsmappen og tilbage til kataloget.
- Scroll: en sag blev åbnet fra den nederste del af arbejdskøen; retur viste samme nederste kortområde, og den målte scrollposition efter retur var ca. 548 px.
- Direkte URL `/sager/case-demo-001` blev genindlæst og gik via sidens tilbageknap til den interne fallback `/arbejdsko` uden at forlade programmet.
- Browserkonsollen viste ingen applikationsfejl; kun to kendte React Router v7-future-flag-advarsler.

Den integrerede root-app blev også startet på port 5197. Normal login blev forsøgt med projektets eksisterende lokale udviklingskonfiguration, men login-tjenesten var ikke tilgængelig (`Der er ikke forbindelse til login-tjenesten`). Ingen autentificering, claims, backendgrænser eller browserdata blev omgået. Browserbeviset ovenfor dokumenterer derfor standalone-prototypen; det er ikke bevis for en fungerende integreret backendsession.

## Verifikation på commitgrundlaget

- Root-lint: bestået (`npm run lint`).
- FLEET-lint: bestået (`npm run lint`).
- Route-/sikkerhedstest for returtilstand: 4 af 4 bestået.
- Fuld FLEET-testsuite: 31 testfiler og 198 af 198 tests bestået.
- Root-produktionsbuild: bestået, 766 moduler transformeret.
- FLEET-produktionsbuild: bestået, 194 moduler transformeret.
- Begge builds har alene den eksisterende Rollup-advarsel om chunks over 500 kB.

## Procesbegrænsning

I den normale proces-sandbox fejlede Node-underprocesser med `spawn EPERM`, herunder både Vitest og esbuild. Det var ikke et skriveadgangsproblem: begge installerede `esbuild.exe` kunne køres direkte, og filernes ACL var normal. En separat `spawnSync(process.execPath, ...)` reproducerede samme `EPERM`.

De afsluttende Node-/Vitest-/buildkørsler blev derfor udført gennem den eksplicit godkendte procesgrænse. De bestod alle. Dette viser, at koden og esbuild-installationen virker, men ikke at den normale proces-sandkasses child-process-begrænsning er ophævet.

Port 5197 blev kontrolleret fri før start. Kun den identificerede server, der blev startet til denne QA, blev stoppet; porten blev efterfølgende kontrolleret fri igen.
