# WAREHOUSE – ændrings- og verifikationsrapport V2

Dato: 2026-09-13

## Bevaret

- Modulet hedder fortsat WAREHOUSE; eksisterende routes, RTDB-noder og
  rettigheder er genbrugt.
- Lagerbevægelser, batch/serienummer, optælling, minimumsregler,
  billedhåndtering, volumen og eksisterende fakturagrundlag er bevaret.
- Eksisterende units og rå QR-id'er kræver ingen migration.

## Ændret

- WAREHOUSE-navigationen har nu overblik, scan, units og varer som sammenhængende
  arbejdsflader.
- Varer og serienummerførte vareenheder skelner eksplicit mellem kundeeje og eget
  eje. Manglende felt er fortsat kundeeje af hensyn til historiske data.
- Fælles unitnoder kan læses af WAREHOUSE eller UNIT Booking, mens fysisk
  skrivning samles i servertransaktioner.
- Mobil layout bryder tabeller til kort, beskytter mod vandret overflow og gør
  scannerens primære handlinger tilgængelige uden overlappende navigation.

## Nyt

- Databåret WAREHOUSE-overblik for modtagelser/placering, pluk/udlevering,
  minimum, optællinger/afvigelser og belægning pr. lager/zone.
- Unitopslag via rå QR, tastaturscanner, manuel indtastning og kamera, når
  browserens `BarcodeDetector` og kameraadgang findes.
- Unitdetalje med ejer, faktisk placering, hjemplacering, status, reservation,
  historik og almindelig QR-label.
- Atomisk oprettelse og modtagelse samt idempotent modtagelse, flytning,
  selvstændig udlevering og retur.
- Beskyttelse mod dobbelt tilgang/afgang, operation-id-konflikter, aktive
  reservationer og samtidige ændringer.

## Verifikation

Følgende direkte tests er bestået i det isolerede worktree:

- `test/warehouse.test.mjs`: 114/114
- `test/warehouse-unit.test.mjs`: 13/13
- `test/unitbooking.test.mjs`: 174/174
- `test/modulkrav.test.mjs`: 14/14
- `test/functions-delt.test.mjs`: 29/29
- `test/design-tokens.test.mjs`: 11/11
- `test/qrkode.test.mjs`: 12/12
- Afgrænset ESLint for ændrede rod-, function- og testfiler: bestået
- Produktionsbuild med Vite: bestået

Regel-/emulatortesten er forsøgt med JDK 21, IPv4 og Netty uden native transport,
men Firebase Database-emulatoren stopper på værten før reglerne indlæses med
`Unable to establish loopback connection` / `SocketException: Invalid argument:
connect`. Derfor er real-backend browsermatrixen, tenant-/rettighedsafvisning og
samtidighed gennem Firebase-emulatoren **ikke bestået** i dette miljø. De rene
domæne- og kontrakttests er ikke brugt som erstatning for det krav.

Den fulde `npm run lint` stoppes desuden af et eksisterende, indlejret
`facility-v2/eslint.config.js`, der importerer en ikke installeret `@eslint/js`.
De ændrede filer er i stedet lintet direkte og bestået.

## Praktisk browserafgrænsning

Desktop og mobil er gennemgået i browseren med syntetiske demodata. Kontrollen
dækkede WAREHOUSE-overblik, ejerskabsfilter og detalje for egen reservedel,
ud-/sammenfoldning af WAREHOUSE-menuen, råt QR-id via Enter, forståelig fejl for
ukendt id uden oprettelse, fælles placering samt blokering af selvstændig
udlevering ved aktiv reservation. Mobilkontrollen er udført ved 390 CSS-pixel;
felter og handlinger stables, lange placeringer brydes, og siden har ingen
vandret overflow. Evidens ligger i `docs/warehouse-review-v2/`.

Kamera kan kun verificeres til browserens capability/fallback i denne
arbejdsstation; fysisk kamera og ekstern scanner kan ikke ærligt certificeres
uden hardware. Tastaturscannerens Enter-flow og manuel kodeindtastning dækkes af
den samme opslagshandling.

## Ingen produktionsændring

Der er ikke deployet, ændret produktionsdata eller flettet til en fælles
integrationsbranch. Ingen datamigration er nødvendig for de nye ejerfelter.
