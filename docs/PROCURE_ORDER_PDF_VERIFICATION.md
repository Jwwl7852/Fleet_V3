# PROCURE ordre-PDF – implementering og lokal verifikation

Oprindelig rapport: 11. september 2026  
Aktuel skabelonstatus: 12. september 2026  
Branch: `codex/procure-integrated-development`

## Aktuel skabelon v5

Nye leverandørvendte ordre-PDF'er har **ingen modtagelses-QR**. QR-beskrivelser og QR-hashes længere nede i denne rapport er historiske beviser for allerede arkiverede revisioner; de må ikke læses som beskrivelse af den aktuelle skabelon.

Skabelon v5 flytter hele `FAKTURERING`-blokken til første side direkte efter bestillingsnummer, bestillingsdato og leverandørkundenummer og før `BESTILLER`/`LEVERANDØR`. Den tidligere placering nederst er fjernet. Blokken henter fakturamail og eventuelle ekstra instruktioner fra den konkrete tenants `virksomhed`-stamdata og viser altid kravet `Angiv vores bestillingsnummer [nummer] på følgesedlen og fakturaen.`

Samme kanoniske faktureringsblok indgår i mailpreviewet og den serverbyggede tekst, der afleveres til testtransporten. Klientens redigerbare tekst kan ikke fjerne serverens faktureringskrav. Manglende fakturamail eller øvrige obligatoriske stamdata afvises før dokumentgeneration og afsendelse.

Skabelonen bevarer layoutet uden priser, leveringsønsket, åbningstiden 7.00–15.00 og bestillingsnummer på alle fortsættelsessider. Allerede arkiverede dokumentrevisioner returneres fortsat byteidentisk fra den revisionslåste arkivsti og regenereres ikke med v5.

### Aktuelle prøvefiler

| Fil | Omfang | SHA-256 |
| --- | --- | --- |
| `output/pdf/PROCURE-bestilling-hurtigst-muligt.pdf` | 1 side, Hurtigst muligt | `0dcf4e7e00bff1bfa1be209ee3e9ed30603b8d958038e8b18b0b99a7d2cea819` |
| `output/pdf/PROCURE-bestilling-senest-dato.pdf` | 1 side, Senest 30.09.2026 | `123e1dfba553089fc7c0cf77dac2fdee2df5091c3afe852ea7b5ffa2a25a7e10` |
| `output/pdf/PROCURE-bestilling-flere-sider.pdf` | 42 lange varelinjer, 4 sider | `0aee52434e8d91e7f771bc577845260899cd57c59811e4e85f031baca003baf3` |

Alle seks sider er renderet i `output/pdf/screenshots-v5/` og visuelt kontrolleret. Faktureringsblokken står på side 1 i begge korte varianter og flersidevarianten. Flersideeksemplet gentager tabeloverskrifter og `Bestillingsnr. BST-2026-00042` på side 2–4 uden overlap eller afskæring.

### Faktisk afprøvning af v5

- Autoriseret browser-QA med almindeligt Firebase-login mod lokale Auth-, Database-, Functions- og Storage-emulatorer bestod. Den sendeklare syntetiske ordre `BST-2026-00043` viste den tenantlagrede fakturamail og ekstra faktureringsinstruks i mailforslaget. Den revisionslåste PDF var klar til preview før screenshot.
- Screenshot: `output/review/pdf-mail-v5/12-desktop-mailforslag-fakturering.png`.
- Det samlede backendflow inspicerede den faktiske multipart-payload til den kontrollerede testtransport: præcis én PDF-vedhæftning, ingen priser i mailteksten, faktureringsoverskrift, fakturamail, bestillingsnummerkrav og den ekstra instruktion.
- Vedhæftning og arkiv var byteidentiske; SHA-256 var `c6cdb21ec290452bf6a4519a6f6d6781027e048c6a89011709af17e752a244d2`. Transportadapteren blev kaldt én gang, og replay med samme idempotensnøgle sendte ikke igen.
- Det interne ordrebeløb og det sammenhængende fakturamatch var uændret: 8.880,00 kr. i godkendt nettoforbrug, inklusive dokumenteret prisafvigelse og kreditnota på 144,00 kr.
- Ingen rigtig leverandørmail blev sendt; alle modtagere brugte `.invalid`, og transportens HTTP-kald blev erstattet af en lokal payload-inspektion.

Kørte aktuelle kommandoer:

```powershell
npm run procure:pdf-samples
node --test test/bestilling.test.mjs test/procure-followup.test.mjs test/skive4d-ordremail.test.mjs test/functions-delt.test.mjs
node functions/test/procure-callables.integration.mjs
node scripts/procure-varelager-purchase-browser-qa.mjs output/review/pdf-mail-v5
npm run lint -- --quiet
npm run build
npm run test:design
```

Resultat: 118/118 målrettede tests, 11/11 designtests, lint og produktionsbuild bestod. Backend- og browserflows afsluttede med `ok: true`.

## Resultat

Den oprindelige leverandørvendte ordre-PDF blev implementeret som rigtig PDF-tekst, vektorgrafik, tabel og på daværende tidspunkt QR-kode. Den historiske revision fulgte informationshierarkiet med BESTILLING, bestillingsdata, BESTILLER, LEVERANDØR, LEVERING, VARER, FAKTURERING, VAREMODTAGELSE og sidefod. Referencebilledets mærkninger "DESIGNFORSLAG", "EKSEMPELDATA" og "QR-eksempel" indgik ikke i produktionsdokumentet.

Leverandørmail og ordre-PDF indeholder ikke priser, rabatter, moms eller totaler. De interne ordrebeløb er fortsat bevaret til godkendelse, budget, analyse og fakturamatch.

## Historiske kontroller for skabelon v3

- PDF-tabellen viser kun `Varenr.`, `Beskrivelse`, `Antal` og `Enhed`.
- Kun godkendt og faktisk bestilt mængde sendes til PDF-generatoren.
- Pakningsstørrelse og dansk ental/flertal beregnes ud fra antal og varedata.
- Leveringsønsket er enten `Hurtigst muligt` eller `Senest dd.mm.åååå`; en gammel dato ignoreres ved hurtigst muligt.
- Begge leveringsvalg viser `Mellem 7.00-15.00` og `(lagerets åbningstider)`.
- Kunde-, kontakt-, leverandør-, leverings- og faktureringsdata kommer fra ordre- og tenantstamdata. Interne bruger-id'er anvendes ikke som kontakttekst.
- Manglende obligatoriske stamdata giver en konkret servervalideringsfejl før første PDF-generation/afsendelse.
- En eksisterende arkiveret PDF returneres uændret; en ny skabelon overskriver derfor ikke tidligere dokumentrevisioner.
- Preview, mailvedhæftning og arkiv anvender det samme arkiverede PDF-objekt for en ordrerevision.
- QR-koden åbner den konkrete ordre til mobilmodtagelse. Scanning registrerer ikke modtagelse.
- Webshopordrens eksisterende afsendelsesvej er uændret og udløser ikke en ekstra leverandørmail.

## Historiske prøvefiler fra 11. september

| Fil | Omfang | SHA-256 |
| --- | --- | --- |
| `output/pdf/PROCURE-bestilling-hurtigst-muligt.pdf` | Hurtigst muligt, inkl. bevidst gammel dato i input | `d8a1cfac9bd3b0a1819a73fe3e7b01b3f6685867d7ff628598db4aefed11b99d` |
| `output/pdf/PROCURE-bestilling-senest-dato.pdf` | Senest-dato | `6ab71b0ba98eae6337720d06199dd0ac473895b9b759fe20c75bafa869b50f15` |
| `output/pdf/PROCURE-bestilling-flere-sider.pdf` | 4 sider, 48 lange varelinjer | `38e3a6f0fc6eddd0424238814e527fe4575b9823ebbfa334baef3e9ef99e3b6c` |

Renderede PNG'er ligger i `output/pdf/screenshots/`. Alle fire sider i flersideeksemplet er inspiceret.

## Historisk afprøvning fra 11. september

### PDF-indhold og rendering

Prøvefilerne blev genereret med:

```powershell
npm run procure:pdf-samples
```

PDF'erne blev renderet med Poppler og kontrolleret med `pdfplumber`, Pillow og ZXing:

- ingen forekomst af pris-, total-, moms- eller valutafelter i udtrukket leverandørtekst;
- `Hurtigst muligt` skjuler den gamle inputdato;
- `Senest 30.09.2026` vises i datoeksemplet;
- de faste lageråbningstider vises i begge leveringsvarianter;
- vareoverskriften gentages på alle 4 sider;
- danske tegn kan udtrækkes som tekst;
- ingen synlige overlap eller afskårne tekster på de seks inspicerede renders;
- QR-koder blev afkodet fra de renderede PDF-sider til de forventede, ordrespecifikke mobilmodtagelseslinks.

### Samlet backendflow gennem handlers

Et lokalt, syntetisk flow blev kørt med Auth-, Realtime Database-, Storage- og Functions-emulatorer og serverkontrollerede roller. Det brugte `.invalid`-modtagere og en kontrolleret testtransport; der blev ikke sendt eksterne mails.

Resultat:

- ordre: 8.880,00 kr. internt;
- første godkendte modtagelse: 7.728,00 kr.; rest 1.152,00 kr.;
- delfaktura: 7.872,00 kr.; identificeret prisafvigelse 144,00 kr.;
- kreditnota: 144,00 kr.;
- slutfaktura: 1.152,00 kr.;
- godkendt nettoforbrug: 8.880,00 kr.;
- to aktive følgeseddel/dokumentfiler kunne genåbnes;
- adgang fra anden tenant blev afvist;
- dubletbeskyttelse for mail og fakturaimport blev udløst;
- leverandørbekræftelse stod fortsat særskilt som `afventer`.

Den faktiske backendgenererede ordre-PDF havde følgende identitet i alle tre led:

| Led | Bytes | SHA-256 |
| --- | ---: | --- |
| Preview | 35.495 | `04b6753014917a3a2731eb2b8b7735b7afe053627aabcfdc928cf30635a96b24` |
| Testmailens vedhæftning | 35.495 | `04b6753014917a3a2731eb2b8b7735b7afe053627aabcfdc928cf30635a96b24` |
| Arkiv | 35.495 | `04b6753014917a3a2731eb2b8b7735b7afe053627aabcfdc928cf30635a96b24` |

QR-koden blev desuden afkodet fra den renderede backend-PDF til den konkrete syntetiske ordre. Der er dermed testet dokumentpayload, ikke kun en registreret afsendelseshændelse.

### Testkommandoer

Kørt før aflevering:

```powershell
npm run lint -- --quiet
npm run build
npm run test:design
$procureTests = Get-ChildItem test -Filter 'procure*.test.mjs' | Select-Object -ExpandProperty FullName
node --test $procureTests
node --test test/functions-delt.test.mjs test/skive4d-ordremail.test.mjs test/bestilling.test.mjs
firebase emulators:exec --only database,storage "node functions/test/procure-callables.integration.mjs"
firebase emulators:start --only auth,database,storage,functions
node scripts/procure-auth-emulator-seed.mjs
node scripts/procure-review-backend-qa.mjs
```

De tre PDF/mail-fokuserede tests gav 88 beståede og 0 fejl. Den afsluttende kørsel af alle `procure*.test.mjs` gav 67 beståede og 0 fejl; delte filer, mailkontrakt og ordretests gav yderligere 107 beståede og 0 fejl. Designtokentesten gav 11 beståede og 0 fejl. Lint og produktionsbuild bestod. Direkte callable-integration og det samlede handlerflow bestod med ovenstående beløb, tenantkontroller, dubletbeskyttelse og PDF-hash.

## Afgrænsning og resterende ekstern konfiguration

- Fysisk scanning med et rigtigt mobilkamera blev ikke udført i denne runde. QR blev afkodet maskinelt fra både prøve-PDF og faktisk backend-PDF.
- Produktionsafsendelse kræver fortsat kundens mailtransportcredentials, offentlige HTTPS-appadresse samt komplette kunde-, leverandør-, leverings- og faktureringsstamdata.
- Inter-skrifttypen er ikke indlejret som en særskilt fontfil; PDF'en bruger platformens dokumentegnede systemfallback Helvetica. Farver, størrelseshierarki og geometri følger de fælles PROCURE-tokens.
- Ingen deployment, push, merge, produktionsændring, rigtig ordre, betaling eller leverandørmail er udført.
