# PROCURE — opfølgning og verifikation

Dato: 2026-09-11

## Status

### 1. Enkel mobilbestilling — færdig kode og browserafprøvet

- Ruter: `/indkoeb/mobil`, `/indkoeb/mobil/kurv` og
  `/indkoeb/mobil/mine`.
- Varer har søgning, favoritter, tidligere køb, varegrupper, store
  antalstrin, numerisk input og fritekstvare.
- Kurven gemmes løbende både lokalt og via de brugerbundne callables
  `procureMobilKladdeHent`/`procureMobilKladdeGem`. Revision, mutation-id og
  trevejsfletning bevarer afdeling, leveringssted og varer gennem reload,
  skærmlås og en anden autoriseret browsersession uden tavst overskriv.
- Produktionsflowet bruger de eksisterende callable-grænser og
  godkendelsesregler. Leverandørgrupper bliver separate ordrer og PO-numre.
- Offline deaktiverer indsendelse og bevarer kladden. En genoprettet
  forbindelse afsender ikke automatisk.
- Browserafprøvet ved præcis 390 px og 360 px: ingen horisontal overflow,
  ti varelinjer på tværs af grupper, ændring af antal, søgning, reload, ESC
  med fokusretur, offline/online og synkront dobbeltklik. Fem af ti linjer
  blev sendt videre, mens fem blev stående i den servergemte liste. En
  supplerende demo-regression bevarede 5/5 kurvlinjer gennem
  netværksafbrydelsen og oprettede præcis to leverandørordrer.

### 1a. QR-bestilling fra materialehylder — færdig kode og browserafprøvet

- `Scan QR` åbner mobilens kameraflow med native `BarcodeDetector` og
  bagudvendt kamera, når browseren understøtter det. Kameraafvisning og
  manglende scannerunderstøttelse giver en konkret fejl samt fortsat adgang
  til manuel kode/URL og almindelig varesøgning.
- Mærkatlinket indeholder kun en stabil reference på formen
  `/indkoeb/mobil/scan/{maerkat-id}`. Varenavn, pris, varenummer,
  pakningsstørrelse og aktiv status hentes ved hvert opslag.
- Scanvisningen viser eksisterende kurvantal for det aktuelle leveringssted,
  store plus/minus-felter og `Tilføj og scan næste`. En scanning navigerer
  kun til varen; den lægger ikke i kurven og kan aldrig indsende en ordre.
- Brugere med `indkoeb.skriv` kan oprette flere placeringsmærkater til samme
  vare, deaktivere dem og udskrive et udvalg som kompakte hyldemærkater med
  faktisk QR-billede, varenavn, nummer, bestillingsenhed og placering.
- De fire QR-callables kræver signeret bruger, aktivt PROCURE-modul og normal
  læse-/skriverettighed. Den underliggende tenantnode er lukket for direkte
  Database-læsning og -skrivning. En ny autoriseret session i samme tenant
  kunne liste mærkaterne; en anden tenant fik en tom liste og `not-found` ved
  opslag på den fremmede stabile reference.
- Login-retur bruger den eksisterende `TilLogin`/`EfterLogin`-mekanisme og
  bevarer hele scan-URL'en. QR-koden tildeler ingen rolle eller tenantadgang.

Browserafprøvningen dækkede direkte og manuel QR-URL, gentagen scanning af
samme vare (passiv aflæsning 0 → 0, aktivt `Tilføj` 0 → 1), deaktiveret mærkat, simuleret afvist
kameraadgang, to genererede QR-billeder, flerudskrift, vedvarende kurv,
offlineværn og det eksisterende indsendelsesflow ved både 360 og 390 px.
Et fysisk mobilkamera er **ikke** afprøvet i denne lokale aflevering; den
native kamerasti er implementeret, men den afsluttende hardwareprøve mangler.

Formuleringen »normal demo-login/adgang« fra den tidligere rapport var
upræcis. `:5205` er fortsat en tydeligt mærket visuel DEMO med lokal
`DEMO_BRUGER`, og den tæller ikke som adgangstest. Den autoriserede preview
på `:5207` bruger derimod almindeligt Firebase Auth-login mod den lokale
Auth-emulator, signerede tenant-/rolle-/permission-claims, aktivt abonnement
og modul samt faktiske Functions-/Database-/Storage-emulatorer. To separate
autoriserede browsersessioner genåbnede samme serverkladde. Login-retur til
QR-varen lykkedes, og en bruger fra en anden tenant blev afvist. De
syntetiske brugere aktiverer intet login- eller rettighedsbypass.

### 1b. Delvis indsendelse og linjegodkendelse — færdig backend og afprøvet

- Medarbejderen kan sende enkelte linjer eller en delmængde videre; resten
  bliver i den revisionsstyrede serverkladde.
- Godkenderen kan pr. linje godkende, udskyde, sende retur eller afvise og
  kan godkende en del af mængden. Begrundelse er obligatorisk for de tre
  ikke-godkendende handlinger.
- Kun aktivt godkendte mængder danner leverandørordrer. Udskudte mængder
  bestilles ikke automatisk, og hele den oprindelige liste bruges fortsat
  som godkendelsesgrundlag, så deling ikke omgår beløbsgrænser.
- Faktisk callable-prøve: 10 taperuller ønsket, 6 godkendt i browseren og
  genåbnet i en anden godkendersession. Backendprøven godkendte yderligere
  2, så 8 blev bestilt og 2 forblev ventende; idempotent gentagelse
  efterlod præcis én ny leverandørordre, og en køber uden
  `indkoeb.godkend` blev afvist.

### 2. Modtagelser og filopbevaring — færdig backend og emulatorafprøvet

Følgende callable-funktioner er implementeret:

- `procureModtagelseUploadInitier`
- `procureModtagelseUploadBekraeft`
- `procureModtagelseDownloadLink`
- `procureModtagelseRegistrer`
- `procureModtagelseKorriger`

Tenant og bruger kommer fra auth-tokenet. Funktionerne kontrollerer aktivt
abonnement, Procure-modul, `indkoeb.laes`/`indkoeb.skriv`, ordrevision,
idempotens og historik. PDF, JPEG og PNG er tilladt; maksimal størrelse er
25 MB. Den faktiske Storage-fil kontrolleres for størrelse og magic bytes,
før metadata skifter fra karantæne til aktiv. Fejlede filer slettes fra
karantænen og markeres afvist.

Den sammenhængende handlerprøve lagrede to PNG-bilag i Storage, verificerede
dem gennem backendfunktionen og registrerede 72 accepterede taperuller samt
80 accepterede filmruller. Resultatet og begge aktive bilag kunne genåbnes
efter en ny læsning; samme ordre-id med en anden tenant gav `not-found`.
Domæne-/sikkerhedstesten bekræfter desuden, at beskadigede og afviste varer
ikke tæller med, og at falsk filsignatur afvises.

### 3. Bestillingsmail og PDF — færdig backend og payload afprøvet

`ordreMailSend` renderer én revisionslåst PDF, arkiverer den i den kanoniske
Storage-sti og sender de samme bytes som multipart-vedhæftning. Den gemte
afsendelse omfatter faktisk modtager, Cc, emne, ledsagetekst, afsender,
tidspunkt, provider-id, mailstatus, ordrevision, Storage-sti, størrelse og
SHA-256.

Den faktiske callable-handler blev kørt med den emulatorlåste testtransport,
som kun accepterer reserverede `.invalid`-adresser og kontrollerer præcis én
PDF-vedhæftning. Den konkrete revisionslåste ordre-PDF er 1.217 bytes, og
preview, transportpayload og Storage-arkiv blev sammenlignet byte-for-byte
med denne SHA-256:

`a9f933191b4a699ec4dea7381d93bdad53603d1ad7d5b4fb11e9a159d75b0233`

Samme `sendRequestId` kontaktede ikke transporten igen. En simuleret timeout
efter mulig accept blev gemt som `ukendt`; ordren forblev `godkendt`, og et
retry med samme nøgle gensendte ikke. Provideraccept og
leverandørbekræftelse er fortsat to forskellige statusser.

### 4. Fakturacenter — sammenhængende backendflow afprøvet

Flowet bruger `procureFakturaImport` til den fælles `fakturaer`-node og
`fakturastatus` til Fakturacenterets eksisterende godkendelsesvej:

1. Ordre: 120 × 24 kr. + 80 × 75 kr. = 8.880 kr. ekskl. moms.
2. Kontrolleret mailaccept med den revisionslåste PDF.
3. Første modtagelse: 72 tape + 80 film = 7.728 kr.; rest 48 tape = 1.152 kr.
4. Delfaktura: tape 26 kr. og film 75 kr. = 7.872 kr.; prisafvigelse 144 kr.
5. Tilknyttet kreditnota på 144 kr. blev godkendt og satte afvigelsen til
   `korrigeret`.
6. Restmodtagelse og slutfaktura på 1.152 kr. gav et godkendt nettobeløb på
   8.880 kr. og ordrestatus `modtaget`.

Efter denne afstemte slutstatus blev en særskilt fysisk retur af én
taperulle (24 kr.) registreret uden at omskrive modtagelsen. Gentagelsen gav
ingen dublet. En tilknyttet kreditnota blev derefter godkendt i
Fakturacenteret, returstatus skiftede til `krediteret`, og nettobeløbet blev
8.856 kr. Dette er et efterfølgende returflow og ændrer ikke dokumentationen
af den oprindelige ordreafstemning på 8.880 kr.

Importen er idempotent pr. request-id, kontrollerer dubletfakturanumre,
leverandør, PO, ordrevision og samlet faktureret mængde mod accepterede
modtagelser. Kreditnotaen skal pege på samme ordre og leverandør og kan ikke
overstige den åbne prisafvigelse.

### 5. Samlet Bestillinger, enheder og webshop — færdig kode og kontraktafprøvet

- Behov, under behandling, bestilt og afsluttet ligger i én Bestillinger-
  arbejdsflade med URL-bevarede faner, søgning, sortering og valgte sager.
- Godkendelser kan sendes tilbage til rettelse med obligatorisk begrundelse;
  relevante ændringer øger revisionen og nulstiller tidligere godkendelse.
- Ordrelinjer bærer bestillingsenhed, grundenhed, pakningsfaktor og prisbasis.
  Mobilen viser eksempelvis `1 pakke = 6 ruller` og blander ikke
  uforenelige enheder.
- Leverandørstamdata kan vælge mail, webshop eller begge, inkl. webshop-URL,
  kundenummer, betingelser og ansvarlige indkøbere.
- Webshoplegitimation krypteres server-side med AES-256-GCM uden lagring i
  browseren. Den faktiske emulatorprøve gemte/hentede legitimationen som
  administrator, afviste en almindelig køber og fandt ingen hemmelighed i
  auditloggen. Åbning af webshopadgangen ændrede ikke ordrestatus. Ekstern
  webshopbestilling og firmakort kan registreres
  revisionslåst og idempotent; kortnummer/CVV afvises, og mail- og
  webshopmetoder kan ikke blandes på samme ordre.
- Forbrugsanalysen holder fakturaforbrug, ikke-modtagne ordrer og modtaget
  uden dokumentation adskilt og filtrerer faktisk på periode, afdeling,
  varegruppe, leverandør, leveringssted og tilknytning.

## Testresultater

- `npm run lint`: bestået.
- `npm run build`: bestået, 647 moduler transformeret.
- `node --test --test-isolation=none test/procure-followup.test.mjs test/procure-round2-domain.test.mjs test/procure-round2-security.test.mjs test/procure-partial-workflow.test.mjs test/godkendelse.test.mjs`:
  64/64 fokuserede PROCURE-/godkendelsestests bestået.
- `npm run test:design`: 11/11 bestået.
- Fuld Database/Storage-emulatorsuite via
  `firebase emulators:exec --only database,storage --config firebase.rules-test.json --project demo-fleetcontrol-rules-test "node scripts/test-platform.mjs"`:
  4.333/4.333 bestået, 885 suites.
- `node scripts/procure-review-backend-qa.mjs`: bestået mod lokale Auth-,
  Functions-, Database- og Storage-emulatorer. Dækker ordre 8.880 kr.,
  PDF/mail-hash, to bilag, delleverancer, afvigelse/kreditnota,
  dubletværn, fysisk retur, krypteret webshopadgang og firmakortstatus.
- `node --check functions/index.js`: bestået.
- `git diff --check`: bestået.
- `node scripts/procure-browser-qa.mjs <afleveringsmappe>`: bestået med
  reload, Escape, gentagen QR, rigtig offline-emulering, genforbindelse uden
  automatisk indsendelse, dobbelttryk, leverandørdeling samt 360/390 px.

- `node scripts/procure-auth-browser-qa.mjs <afleveringsmappe>`: bestået med
  to Firebase-login-sessioner, servergenoptagelse, offline, delindsendelse,
  QR 0→0 ved passiv aflæsning og 0→1 efter aktivt Tilføj samt tenantafvisning.
- `node scripts/procure-partial-backend-qa.mjs`: bestået mod de faktiske
  Functions- og Database-emulatorer.

Den fulde suite blev kørt med den installerede lokale Temurin JDK 21, som
Firebase CLI 15.29.0 kræver. En første kørsel uden eksplicit `JAVA_HOME`
stoppede før teststart på værtsmaskinens Java 8; den efterfølgende JDK
21-kørsel bestod 4.333/4.333 tests.

## Screenshots og preview

- `01-mobil-varer-390.png`
- `02-mobil-qr-gentagelse-390.png`
- `03-mobil-kurv-390.png`
- `03b-mobil-kurv-gennemgang-390.png`
- `04-mobil-kvittering-390.png`
- `05-mobil-varer-360.png`
- Autoriserede screenshots: `01-auth-mobil-varer-390.png`,
  `01b-auth-mobil-varer-360.png`,
  `02-auth-mobil-kurv-delindsendelse-390.png`,
  `03-auth-mobil-kvittering-390.png`,
  `04-auth-qr-aktiv-tilfoejelse-390.png` og
  `05-auth-godkendelse-delmaengde-390.png`.
- Desktop-screenshots af Bestillinger, Godkendelser, Analyse og Opsætning:
  `06-desktop-bestillinger.png`–`09-desktop-opsaetning.png`.
- Visuel demo-preview: `http://127.0.0.1:5205/indkoeb/mobil`.
- Autoriseret preview med lokale emulatorer:
  `http://127.0.0.1:5207/indkoeb/mobil`.

## Ekstern konfiguration og deployment

Færdig kode er ikke deployet. Der er ikke pushet eller merget.

Produktion kræver fortsat kundens Firebase-projekt/Storage-bucket, offentlig
HTTPS-appadresse til modtagelses-QR, `PROCURE_WEBSHOP_KEY` og Mailgun-secrets
(`MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_AFSENDER`) samt leverandørens
bestillingsadresse/webshopopsætning og kundens fakturamodtagelse i stamdata.
Ingen rigtig leverandørmail, webshopordre eller betaling er foretaget.
Manglende credentials ændrer ikke, at callables, PDF-arkiv,
Storage-validering og Fakturacenterkontrakten er implementeret og afprøvet
lokalt.
