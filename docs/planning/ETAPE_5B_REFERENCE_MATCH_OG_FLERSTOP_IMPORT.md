# Etape 5B – reference-match og flerstopimport

## Formål og afgrænsning

Etape 5B færdiggør den lokale visuelle prototype for `Dagens drift` og `Livekalender` og udvider Planning-inputkontrakten snævert, så en CSV-række kan identificere et stop i en samlet flerstop-opgave. Arbejdet er fortsat deterministisk og lokalt. Der er ingen Firebase-, kort-, GPS-, OBD-, netværks- eller persistensintegration.

De to referencebilleder ved 1672 × 941 er facit for arbejdsfladernes geometri. Begge Planning-visninger bruger dog bevidst den samme foldbare Veyro-sidebar og topbjælke. Det korrekte lokale Veyro-logo bevares, og de syntetiske rute-, medarbejder- og køretøjsnavne må afvige fra billedfixtures.

## Flerstopkontrakt

Den offentlige facade i `planning-input/index.js` understøtter følgende nye mappingfelter:

| Feltnavn | CSV-overskrift | Betydning |
| --- | --- | --- |
| `samletOpgaveId` | `Samlet opgave-ID` | Eksplicit identitet for den samlede opgave; eneste grundlag for gruppering |
| `stopId` | `Stop-ID` | Stabil og entydig stopidentitet inden for gruppen |
| `stopRaekkefoelge` | `Stoprækkefølge` | Positivt heltal, entydigt inden for gruppen |

`eksternReference` og `stoptype` er eksisterende kontraktfelter og bevares. Gentagne eksterne referencer grupperer ikke rækker. En række uden `samletOpgaveId`, `stopId` og `stopRaekkefoelge` bliver fortsat én almindelig opgave med ét stop.

Rækker med samme gyldige `samletOpgaveId` samles deterministisk, sorteres efter `stopRaekkefoelge` og får rådata og kilderækkenumre bevaret. Valideringen blokerer manglende eller dubleret stop-ID, manglende, ugyldig eller dubleret rækkefølge samt afhentning efter levering. Inputrækkefølgen ændrer ikke stopresultatet. Udførelsesvalg og et eventuelt versioneret udførelsessnapshot behandles på samme måde som ved én-stop-import.

`findDubletter()` ser ikke den allerede samlede flerstop-opgave som flere indbyrdes sikre dubletter. En opgave med samme eksterne reference som en eksisterende opgave opdages fortsat som en reel sikker dublet.

## Standard-CSV

Opgaveimporten tilbyder `Veyro_Planning_Importskabelon_v1.csv` som en lokal browserdownload. Filen bruger semikolon, CRLF og UTF-8 med BOM, så den kan åbnes direkte i en almindelig dansk Excel-installation. Kolonnerne er afledt af `KOLONNEFELTER`; ukendte kontraktfelter accepteres ikke af skabelongeneratorens kontrol.

Skabelonen indeholder udelukkende syntetiske eksempeldata: én én-stop-serviceopgave og én samlet transportopgave med afhentning før levering. Roundtriptesten genererer CSV'en, parser den gennem den offentlige importvej og bekræfter to opgaver, tre entydige stop og korrekt stoprækkefølge uden tab eller dubletter.

En ægte `.xlsx`-skabelon er udskudt. Repositoryet har ikke en godkendt, allerede installeret `.xlsx`-skrive- og læsevej til dette flow, og etape 5B ændrer ikke dependencies eller opretter en fil med forkert format. `Udførelsesskabeloner` er et andet domænebegreb end standardimportskabelonen.

## Lokale interaktioner

På Dagens drift vælger KPI-kortene filtrering, mens klik på ruter, medarbejdere og køretøjer vælger samme underliggende rute og fremhæver den på det syntetiske SVG-kort. Kortets ruter kan vises eller skjules, zoomes, nulstilles og åbnes skærmfyldende lokalt. Trepunktsmenuerne har lokale handlinger.

Livekalenderens `NU · 09:42`-mærke er et separat lag over tidslinjen. Forslagspanelet er modeless: kalenderen har intet backdrop, og et andet stop kan vælges direkte, mens panelet er åbent. Krydset og Escape lukker panelet. Redigering, afvisning og godkendelse ændrer alene lokal demotilstand.

Mobilhandlingerne følger opgavetypen: besøg bruger `Start besøg`/`Afslut besøg`, service bruger `Start opgave`/`Afslut opgave`, og transport bruger `Ankommet` efterfulgt af henholdsvis `Afhentning udført` eller `Levering udført`. Afslutning er blokeret, indtil start eller ankomst er registreret.

## Beslutninger og udskudte dele

Optimering er midlertidigt placeret under Planning. Funktionen skal senere flyttes til Veyros fælles Opsætning, hvor platformens konfiguration samles på tværs af moduler. Navigation, motor, profiler og optimeringsarkitektur ændres ikke i etape 5B.

Rigtige kort, livepositioner, OBD, GPS, geokodning, persistence, publicering og eksterne tjenester er udskudt. Kort og OBD er altid mærket som syntetisk demo.

## Reproducerbare kontroller

```text
node --test test/planning-input/planning-input.test.mjs test/planning-input/planning-multistop-import.test.mjs
node --test test/planning-ui/planning-ui.test.mjs test/planning-ui/planning-ui-reference.test.mjs test/planning-ui/planning-ui-5b.test.mjs
node --test --test-isolation=none test/planning-basic.test.mjs test/planning-basic-adapters.test.mjs test/planning-basic-v2.test.mjs test/planning-ui/*.test.mjs test/planning-input/*.test.mjs test/planning-execution/*.test.mjs test/planning-optimization/*.test.mjs
npm run lint
npm run test:design
npm run build
git diff --check
```

Den konservative regression køres med den fulde, dokumenterede testfilliste fra etape 3-dokumentationen. Skærmbilleder og overlaymateriale gemmes uden for repositoryet.
