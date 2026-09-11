# PROCURE — opfølgning og verifikation

Dato: 2026-09-11

## Status

### 1. Enkel mobilbestilling — færdig kode og browserafprøvet

- Ruter: `/indkoeb/mobil`, `/indkoeb/mobil/kurv` og
  `/indkoeb/mobil/mine`.
- Varer har søgning, favoritter, tidligere køb, varegrupper, store
  antalstrin, numerisk input og fritekstvare.
- Kurven gemmes løbende i `localStorage` pr. tenant og bruger. Den bevarer
  afdeling, leveringssted, varer og en stabil indsendelsesreference gennem
  genindlæsning og navigation. Den ryddes først efter et fuldt serversvar.
- Produktionsflowet bruger de eksisterende callable-grænser og
  godkendelsesregler. Leverandørgrupper bliver separate ordrer og PO-numre.
- Offline deaktiverer indsendelse og bevarer kladden. En genoprettet
  forbindelse afsender ikke automatisk.
- Browserafprøvet ved 390 px og 360 px: ingen horisontal overflow, søgning,
  fem varelinjer på tværs af grupper, ændring af antal, reload, ESC med
  fokusretur, browser-Tilbage, offline/online og synkront dobbeltklik.

Den lokale preview er tydeligt mærket `DEMO`, fordi dette checkout ikke har
en Firebase-kundeforbindelse. Den visuelle browserprøve er derfor ikke en
påstand om et rigtigt kundelogin. Produktionskoden bevarer AppShells normale
login-, modul- og permission-gates; de signerede tenant-/permissiongrænser er
afprøvet i Firebase-emulatoren som beskrevet nedenfor.

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

Den faktiske handlerprøve gemte en PDF-følgeseddel i Storage, verificerede
den gennem backendfunktionen og registrerede 72 accepterede taperuller samt
80 accepterede filmruller. To leverede filmruller, hvoraf én var beskadiget
og én afvist, talte ikke med. Resultatet kunne genåbnes med en ny autoriseret
brugerkontekst; gentagelsen gav `allerede: true`. Samme ordre-id med en anden
tenant gav `not-found`. En fil med EXE-signatur og PDF-type blev markeret
afvist og fjernet fra karantænen.

### 3. Bestillingsmail og PDF — færdig backend og payload afprøvet

`ordreMailSend` renderer én revisionslåst PDF, arkiverer den i den kanoniske
Storage-sti og sender de samme bytes som multipart-vedhæftning. Den gemte
afsendelse omfatter faktisk modtager, Cc, emne, ledsagetekst, afsender,
tidspunkt, provider-id, mailstatus, ordrevision, Storage-sti, størrelse og
SHA-256.

Den faktiske callable-handler blev kørt med Mailgun-adapteren og en lokalt
kontrolleret `fetch`-transport. Multipart-payloaden indeholdt præcis én
`application/pdf`-fil. Previewgenerator, vedhæftning og Storage-arkiv havde
identiske bytes og denne SHA-256:

`c784db7e34b64a7006854875260c98bca8c110619e11cf72cdc6ac35ce1a4a13`

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

Importen er idempotent pr. request-id, kontrollerer dubletfakturanumre,
leverandør, PO, ordrevision og samlet faktureret mængde mod accepterede
modtagelser. Kreditnotaen skal pege på samme ordre og leverandør og kan ikke
overstige den åbne prisafvigelse.

## Testresultater

- `npm run lint`: bestået.
- `npm run build`: bestået. Vite viser fortsat den eksisterende minifier-
  advarsel om et backtick i en CSS-kommentar; builden afslutter succesfuldt.
- Fokuseret PROCURE/design/integration: 224/224 bestået.
- Fuld Database/Storage-emulatorsuite: 4.310/4.310 bestået, 883 suites.
- Faktisk callable-handlerflow mod Database/Storage-emulatorer: bestået.
- `node --check functions/index.js`: bestået.
- `git diff --check`: bestået.

Repoets fastlåste `npm test` bruger Firebase CLI 15.29.0 og Java 21. På
denne Windows-host fejler Java 21 før teststart med en lokal NIO-loopback-
selectorfejl. Den samme konfiguration, regler og `scripts/test-platform.mjs`
er derfor kørt med cachet Firebase CLI 13.35.1 og portable Temurin 11; alle
4.310 tests består. Det er et lokalt værktøjsproblem, ikke en udeladt test.

## Screenshots og preview

- `01-mobile-varer-390.png`
- `02-mobile-kurv-390.png`
- `03-mobile-kvittering-390.png`
- Tilsvarende 360-pixelversioner ligger i samme afleveringsmappe.
- Lokal preview: `http://127.0.0.1:5205/indkoeb/mobil`

## Ekstern konfiguration og deployment

Færdig kode er ikke deployet. Der er ikke pushet eller merget.

Produktion kræver fortsat kundens Firebase-projekt/Storage-bucket og Mailgun-
secrets (`MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_AFSENDER`) samt
leverandørens bestillingsadresse og kundens fakturamodtagelse i stamdata.
Ingen rigtig leverandørmail er sendt. Manglende credentials ændrer ikke, at
callables, PDF-arkiv, Storage-validering og Fakturacenterkontrakten er
implementeret og afprøvet lokalt.
