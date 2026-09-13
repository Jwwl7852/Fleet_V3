# Veyro fælles UNIT/Warehouse-kontrakt V1

Dato: 13. september 2026

Status: Aftalt arbejdsgrundlag for de parallelle UNIT- og Warehouse-spor. Ingen
produktionmigrering eller deployment er en del af leverancen.

## Formål og grænse

UNIT og Warehouse viser det samme fysiske objekt, når objektet er en bookbar
transportkasse. Kontrakten bevarer eksisterende identiteter og adskiller fortsat
reservation, fysisk placering og egnethed til udlån.

Kontrakten gør ikke alle Warehouse-varer, serienumre eller carriers bookbare i
UNIT. Warehouse er fortsat modulets brugerrettede navn.

## Kanoniske noder og identiteter

| Begreb | Kanonisk node/felt | Regel |
|---|---|---|
| Bookbar fysisk unit/kasse | `kasser/<unitId>` | Det eksisterende kasse-id er stabil identitet og må ikke migreres eller dubleres. |
| Unit-QR | QR-nyttelast = råt `unitId` | Eksisterende mærker forbliver gyldige. QR giver kun en identitet; tenant, modul og permission afgør adgang. |
| Aktuel fysisk placering | `kasser/<unitId>/pladsId` | Én sandhed. `null` betyder ude/ingen registreret intern plads, aldrig en kunstig lokationstekst. |
| Normal placering | `kasser/<unitId>/hjemPladsId` | Valgfrit forslag/normalplads. Feltet ændrer ikke automatisk den faktiske placering ved retur. |
| Lokationskatalog | `reolpladser/<pladsId>` | Delt katalog. UNIT-only og Warehouse-only må begge bruge det via modul- og rettighedsgates. |
| Booking | `kasseudlaan/<bookingId>` | UNIT ejer booking, inklusiv konfliktkontrol og tilstandsmaskine. |
| Fysisk historik | `unitbevaegelser/<operationId>` | Append-only hændelse med tenant-scope idempotens. Samme operation og payload returnerer samme resultat; anden payload afvises. |

`enheder/<serienummer>` forbliver Warehouse-forekomster af serienummerførte
varer, og `carriers/<carrierId>` forbliver Warehouse-beholdere. De må ikke
oprettes som parallel kopi af en post i `kasser`.

## Fysisk bevægelse V1

En `unitbevaegelser/<operationId>`-post indeholder:

- `unitId`;
- `art`: `modtagelse`, `flytning`, `udlevering` eller `retur`;
- `fraPladsId` og `tilPladsId`, hver enten et kendt id eller `null`;
- `bookingId` eller `null`;
- `reference` eller `null`;
- `operationId`;
- `kilde`: `unitbooking` eller `warehouse`;
- serverens `tidspunktMs` og autentificerede `udfoertAf`.

Reservation og klargøring ændrer ikke `pladsId`. UNIT-udlevering sætter
`pladsId` til `null` og skriver én `udlevering`. UNIT-retur kræver en valgt,
eksisterende modtagelseslokation, sætter `pladsId` dertil og skriver én `retur`.
En senere flytning skriver en ny `flytning`; historik overskrives ikke.

Bookingtilstand, kassetilstand, fysisk placering og bevægelseshændelse ændres i
én servertransaktion ved udlevering/retur. Dermed kan en delvis fejl ikke efterlade
booking og fysisk status i modstrid.

## Adgang og modulvarianter

- UNIT-only: må læse og administrere `kasser`, `reolpladser` og
  `unitbevaegelser` via UNIT-permissions og udføre UNIT-bookingflowet.
- Warehouse-only: må læse og administrere de samme fysiske kasser/lokationer
  via Warehouse-permissions uden adgang til UNIT-bookinger.
- Begge: ser samme `unitId`, QR, `pladsId` og bevægelseshistorik. Lagerhandlinger
  opretter ikke en ekstra kassepost.

Alle kritiske fysiske bevægelser går gennem serverfunktioner. En eksisterende
`kasser`-posts `pladsId` kan ikke ændres direkte fra klienten, og direkte
klientskrivning til `unitbevaegelser` er afvist. Klienten må fortsat rette
stamdata samt skifte egnethed mellem `ledig` og `udeAfDrift`; de fysiske
tilstande `klargjort` og `udlaant` ændres kun med bookingens serverhandling.
Ved førstegangsregistrering kan en faktisk startplacering sættes; efterfølgende
flytninger skal have bevægelseshistorik. Tenant kommer fra tokenet og kan ikke
vælges i payloaden.

## Ejerskab under parallel udvikling

UNIT-sporet ejer:

- bookingassistent, dimension-/orienteringsmatch og UNIT-UI;
- ændringen i `kasseudlaanskriv` ved UNIT-udlevering og UNIT-retur;
- UNIT-domæne- og kontrakttests samt UNIT-reviewrapport.

Warehouse-sporet ejer:

- Warehouse-scanner, modtagelse, flytning og selvstændig udlevering;
- afvisning af Warehouse-udlevering, når en bindende UNIT-reservation ellers
  ville blive omgået;
- Warehouse-domæne-, UI- og kontrakttests.

Integrations-/samlingssporet ejer den endelige sammenlægning af delte Functions,
Rules, permissions, modul-gates, AppShell/navigation og globale styles. De to
modulspor leverer afgrænsede commits og må ikke merge eller deploye kontrakten.

## Kompatibilitet og migration

V1 er additiv:

1. Eksisterende `kasser`, `kasseudlaan`, `reolpladser`, ids og QR-nyttelaster
   ændres ikke.
2. Nye indvendige mål tilføjes som særskilte felter. Eksisterende
   `laengdeMm`, `breddeMm`, `hoejdeMm` bevares som hidtidige/udvendige eller
   uafklarede mål og kopieres ikke automatisk til indvendige mål.
3. `unitbevaegelser` starter fra nye fysiske hændelser. Historiske bookinger
   må ikke fabrikeres om til bevægelser uden en særskilt, kontrolleret
   migrationsbeslutning.
4. En eventuel backfill er et separat dry-run-script med rapport over manglende
   lokationer og må ikke køres mod produktion i UNIT-leverancen.

## Samlingspunkter

- Warehouse-sporets afstemte rettelsescommit er
  `37bba72ec73e33369479b236454a1a1e913a208c`. Det leverer blandt andet
  `unitlageropret`, den valgfrie hjemplacering og Warehouse-UI'en. UNIT har
  genbrugt den aftalte validering uden at oprette en konkurrerende model.
- Endelig konfliktløsning i delte Functions, Rules og navigation udføres af
  integrationssporet. UNIT giver ikke Warehouse adgang til bookingnoden.
- Begge spor bruger i V1 hele tenant-roden som transaktionsgrænse. Det giver
  atomisk tværnodeopdatering, men kan øge dataoverførsel og retry-frekvens ved
  samtidige, ellers uafhængige skrivninger. En smallere grænse kræver en fælles
  låse-/kommandoarkitektur og må ikke indføres af ét modul alene.
- Kamera/scanner er browser- og hardwareafhængig. Manuelt QR-id og
  tastaturscanner er altid fallback; fysisk hardwareverifikation dokumenteres
  separat.
