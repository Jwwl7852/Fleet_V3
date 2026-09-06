# Planning Basic · etape 4

## Formål og afgrænsning

Etape 4 føjer en lokal, deterministisk opgaveindbakke til Planning-prototypen. Den understøtter manuel oprettelse, CSV og indsat tabeltekst, datakontrol, eksplicit dubletbehandling, udførelseskrav og overførsel til en lokal planlægningspulje. Importerede opgaver placeres aldrig direkte på en rute.

Prototypen åbnes fortsat med:

```powershell
npm run dev -- --host 127.0.0.1
```

Åbn derefter `http://127.0.0.1:5173/planning-demo.html` og vælg **Opgaver**.

## Lagdeling

`planning-input` er et rent JavaScript-lag for parsing, kolonnemapping, normalisering, validering, batches, dubletter og konvertering til Planning-opgavens offentlige kontrakt. `planning-execution` er et rent JavaScript-lag for versionerede udførelsesskabeloner, dokument-, foto-, spørgsmåls- og materialekrav samt snapshots.

Begge lag er uafhængige af React, Firebase, permissions, browser-API'er, netværk og persistence. UI-laget må importere deres offentlige `index.js`-facader. De rene lag importerer aldrig UI. Tidspunkt og ID-generator injiceres, så testene er reproducerbare.

## Opgavestatus og flow

- `MODTAGET`: normaliseret uden blokerende fund, men endnu ikke godkendt.
- `KRAEVER_KONTROL`: ufuldstændige data, strukturelle fejl eller en uafklaret dublet.
- `KLAR_TIL_PLANLAEGNING`: eksplicit godkendt og kan føjes til den lokale pulje.
- `AFVIST`: eksplicit afvist eller sprunget over som dublet; kan genåbnes.

Flowet er kilde → rå forhåndsvisning → kolonnemapping → validering → fejl/dubletter → eksplicit godkendelse. Manuel oprettelse bruger samme normalisering og validering. Rå kildeværdier, normaliserede stop, parserfund, batch-ID, filnavn uden sti, rækkenummer, mapping og dubletbeslutning bevares hver for sig.

## Importformat og grænser

CSV-parseren håndterer komma, semikolon og tabulator, LF/CRLF, UTF-8 BOM, citerede felter, dobbelte anførselstegn, tomme felter samt skilletegn og linjeskift i citerede værdier. Ukendte kolonner bevares i den rå repræsentation. Mapping foreslås fra danske og engelske overskriftsnavne og kan ændres; den bygger ikke på kolonneposition.

- Maksimal filstørrelse: 5 MB.
- Maksimalt antal datarækker: 10.000.
- Maksimal feltlængde: 10.000 tegn.
- `.xlsx` læses ikke. Brugeren får teksten: “Gem filen som CSV, eller kopier rækkerne fra Excel og indsæt dem her.”
- Indsat tekst fra Excel eller Google Sheets bruger samme parser-, mapping- og valideringsflow.
- Celleindhold evalueres aldrig som programkode eller formel.

Delvis import er tilladt: gyldige valgte rækker kan godkendes, mens alle ugyldige rækker bliver i kontrollaget. Annullering gendanner batchens oprindelige lokale snapshot atomisk.

## Opgaver, stop, tid og adresser

En intake-opgave kan have flere stop af typerne `BESOEG`, `LEVERING`, `AFHENTNING`, `SERVICE`, `KONTROL` og `ANDET`. Hvert stop har sin egen lokation, land, tidsform, varighed, ressourcekrav og udførelsesprofil. De fire eksisterende tidsformer genbruges uden gæt: fast tidspunkt, tidsvindue, deadline og frit tidspunkt.

Varighed accepteres eksempelvis som `30`, `30 min`, `00:30` og `1:15`, men normaliseres kun til positive hele minutter. Originalværdien bevares. Manglende eller ugyldig varighed kræver kontrol.

Adressekvalitet kan være `UKONTROLLERET`, `FORMATKONTROLLERET`, `MANUELT_BEKRAEFTET` eller `GEOKODET`. Etape 4 sætter aldrig selv `GEOKODET`; manuel bekræftelse er ikke geokodning. Land bevares pr. stop alene som datagrundlag for en senere afklaring.

## Dubletter

En sikker dublet er samme eksterne reference inden for samme tenant. En mulig dublet bygger på en ens kombination af dato, kunde/modtager, adresse og stoptype. Brugeren skal vælge `SPRING_OVER`, `ERSTAT_LOKAL`, `OPRET_ALLIGEVEL` eller `BEHOLD_TIL_KONTROL`. Der sker ingen tavs sletning eller overskrivning; en senere persistence-etape skal definere den autoritative transaktion for `ERSTAT_LOKAL`.

## Versionerede udførelseskrav

En skabelon har stabilt ID, version og aktiv/inaktiv status. Redigering og ny version muterer ikke input. Når en opgave godkendes, bindes hver skabelonprofil til et konkret opgavestop, og kravene dybkopieres til opgaven. Dokumentnavn/version, spørgsmålstekst og svarmuligheder samt materialenavn/reference/enhed bevares i snapshot. Senere ændringer i skabelon eller katalog ændrer derfor ikke den godkendte opgave.

Anvendte skabeloner og materialer slettes ikke fysisk i kontrakten; de kan deaktiveres for nye opgaver.

### Dokument og modtagers underskrift

Dokumentkrav er knyttet til stop og dokumentversion. Obligatorisk underskrift uden dokumentreference er en hård strukturel fejl. Den eneste konfigurerede modtagermetode er `CHAUFFOER_INDTASTER_MAIL`: chaufføren vil senere indtaste og bekræfte en adresse ved stoppet. UI'et kalder dette modtagers underskrift eller kvittering—not en kvalificeret elektronisk signatur.

Etape 4 indsamler ingen underskrift eller rigtig mailadresse, genererer intet dokument og sender ingen mail. Kontrakten er forberedt til underskrivernavn, tidspunkt, dokumentversion, stop/opgave, signaturdata, bekræftet mailvalg, afsendelsesstatus og fejlstatus.

### Foto

Fotokrav kan være før/efter udførelse, synlig skade, emballage, placering, leveringskvittering eller andet. Kravet angiver påkrævet/valgfrit, minimum, maksimum, kommentarkrav og mulighed for ekstra billeder. Prototypen åbner ikke kamera, uploader ikke og gemmer ingen filer. En senere filkontrakt skal altid binde en fil til tenant, sag/opgave, stop, kategori, uploader, tidspunkt, eventuel lovlig position, filstatus og revision.

### Spørgsmål og betingelser

Understøttede svartyper er ja/nej, kort/lang tekst, tal, enkelt-/flervalg, dato, klokkeslæt, materialeforbrug og bekræftelse. Betingelser kan sammenligne et tidligere svar med en værdi eller en numerisk grænse. Ukendte referencer, selvreferencer, senere utilgængelige spørgsmål, ugyldig type/operator og cyklusser afvises. Brugerdefineret kode evalueres aldrig.

Demoeksemplet “Har du brugt materialer på opgaven?” viser materialetrinnet ved svaret JA.

### Materialer

Materialekataloget indeholder stabilt ID, navn, kundereference, enhed, aktiv status og valgfri beskrivelse. Forbrug kræver et aktivt materiale fra opgavens snapshot og et positivt antal. Flere materialer kan knyttes til samme stop. Etape 4 foretager intet lagertræk, ingen prisberegning, fakturering eller PROCURE-integration.

## Mobilforhåndsvisning

Den eksisterende mobilvisning viser nu et lokalt udførelsesflow: ankomst, opgave, spørgsmål, betingede materialer, foto, dokument, modtagers underskrift/mailvalg, afslutning og afgang. Kamera, filupload, signaturfelt, dokumentgenerering, mailafsendelse og persistence er mærket **Ikke tilsluttet endnu**. Knapperne ændrer kun lokal React-tilstand.

## Dataklassifikation og senere sikkerhed

Kontakt- og leveringsdata er fortrolige; svar, mailadresse og dokumentmetadata er personhenførbare; signatur- og billeddata er følsomme. En produktionsetape skal etablere tenant-isolation, mindst mulige roller, auditlog, opbevaringspolitik, kontrolleret sletning, eksport/indsigt, kryptering under transport og lagring, filtype- og malwarekontrol, begrænset deling og dokumenteret afsendelsesstatus. Etape 4 etablerer ingen midlertidig lagringsvej.

## Syntetiske fixtures

Fixtures indeholder 30 importerede opgaver, alle fire tidsformer, alle stoptyper, fem tilsigtede valideringsfejl, tre mulige dubletter, én sikker dublet, ukontrolleret adresse, ukendt ressource og manglende stopvarighed. Skabelonerne indeholder obligatorisk kvittering, valgbar kopi, foto før/efter og ved skade, betingede spørgsmål samt mindst seks fiktive materialetyper. Navne, adresser, referencer og koordinater er deterministiske og tydeligt syntetiske.

## Kontroller

Målrettet og samlet Planning-suite:

```powershell
node --test --test-isolation=none test/planning-input/planning-input.test.mjs test/planning-execution/planning-execution.test.mjs
node --test --test-isolation=none test/planning-basic.test.mjs test/planning-basic-adapters.test.mjs test/planning-basic-v2.test.mjs test/planning-ui/planning-ui.test.mjs test/planning-input/planning-input.test.mjs test/planning-execution/planning-execution.test.mjs
```

Konservativt eksisterende regressionstestudsnit (samme dokumenterede etape 3-udsnit):

```powershell
node --test --test-isolation=none test/planning-basic.test.mjs test/planning-basic-adapters.test.mjs test/planning-basic-v2.test.mjs test/planning-ui/planning-ui.test.mjs test/booking.test.mjs test/bookingopret.test.mjs test/disponering.test.mjs test/driftskalender.test.mjs test/etapeskift.test.mjs test/etapeskifte.test.mjs test/flaade.test.mjs test/flaade-bemanding.test.mjs test/forslag.test.mjs test/forslagform.test.mjs test/fravaer.test.mjs test/gitter.test.mjs test/gitter-uge.test.mjs test/godkendelse.test.mjs test/opgaveplan.test.mjs test/opgaver.test.mjs test/rutedeling.test.mjs test/statusmelding.test.mjs test/steder.test.mjs test/stop.test.mjs test/behov.test.mjs test/indeslutning.test.mjs test/referencetjek.test.mjs test/unitbooking.test.mjs test/hf1-planning-oprydning.test.mjs test/skive3a-planning-fleet.test.mjs test/opgavestatus.test.mjs
```

Øvrige kontroller:

```powershell
npm run lint
npm run test:design
npm run build
git diff --check
```

Importgrænserne i `planning-basic-adapters.test.mjs` og `planning-basic-v2.test.mjs` registrerer input og execution som rene Planning-lag. De afviser React, UI, Firebase, permissions, booking-state, browserlag, netværk og persistence i de rene lag, og afviser `fleet.css` samt skjulte skriveveje fra UI.

## Udskudt

Firebase-persistence, adgangsregler, rigtig fil- og billedlagring, kamera, signaturindfangning, dokumentgenerering, mail, juridisk signaturniveau, import af `.xlsx`, kort/geokodning, optimering og produktionsintegration er udskudt.

Udenlandskørsel er en selvstændig produktopklaring. Etape 4 tager ingen beslutning om europæiske ruter, grænseovergange, færger/tunneler, afgifter, miljøzoner, køre-/hviletider, chaufførregler, ADR, told, kabotage, internationale dokumenter, tidszoner, valuta eller rutetjenester.
