# UNIT Booking V2 – migrations- og integrationsvej

Dato: 13. september 2026

Denne leverance udfører ingen produktionsmigration. Vejledningen beskriver den
additive og reversible samling af UNIT Booking V2 med den samtidige Warehouse-
udvikling.

## Bevarede identiteter

- `kasser/<unitId>` forbliver den kanoniske fysiske og bookbare enhed.
- QR-nyttelasten forbliver det rå, eksisterende `unitId`.
- `reolpladser/<pladsId>` forbliver det fælles lokationskatalog.
- `kasseudlaan/<bookingId>` forbliver booking og historisk reference.
- Eksisterende id'er, datoer og lovlige tilstandsovergange ændres ikke.

Der oprettes ikke kopier i `enheder` eller `carriers`. De noder bevarer deres
Warehouse-betydning for henholdsvis serienummerførte vareforekomster og
beholdere.

## Additive felter og noder

| Data | Ændring | Migrationsregel |
|---|---|---|
| `kasser.indvendigLaengdeMm`, `indvendigBreddeMm`, `indvendigHoejdeMm` | Nye, valgfrie brugbare indvendige mål | Alle tre eller ingen. Eksisterende mål kopieres aldrig automatisk. |
| `kasser.maalBetydning` | `udvendig` eller `ukendt` | Manglende historisk semantik vises som ukendt og skal gennemgås. |
| `kasser.hjemPladsId` | Valgfrit forslag | Fravær er gyldigt og ændrer ikke `pladsId`. |
| `unitbevaegelser/<operationId>` | Ny append-only fysisk historik | Starter ved nye handlinger. Historik fabrikeres ikke bagudrettet. |
| `unitbookingImporter/<kladdeId>` | Importudkast med original og aflæsning | Serverejet; klienten har kun beskyttet læseadgang. |
| `unitbookingImportHashes/<sha256>` | Dubletindeks | Serverejet; samme materiale udløser advarsel, ikke automatisk reservation. |
| `unitbookingImportOperationer/<operationId>` | Idempotens for import | Serverejet og tenant-afgrænset. |

## Fysisk placering og tilstand

For eksisterende enheder kan klienten ikke ændre `pladsId` direkte. Flytning,
modtagelse, udlevering og retur går gennem serverhandlinger, som skriver enhed,
relevant booking og `unitbevaegelser` samlet. Direkte stamdatarettelser er
fortsat mulige. Skift mellem `ledig` og `udeAfDrift` beskriver egnethed og må
fortsat foretages i registeret; `klargjort` og `udlaant` følger bookingflowet.

En ny enhed kan få en første faktisk placering ved registrering. Efterfølgende
ændringer kræver en fysisk bevægelse. Warehouse-sporets `unitlageropret` kan
oprette og modtage atomisk; samlingssporet skal bevare én implementation.

## Sikker samlingsrækkefølge

1. Saml den fælles domænekontrakt og kontrollér, at der kun findes én
   `unitlagerhandling` og ét operation-id-mønster.
2. Saml Functions med importcallables, `kasseudlaanskriv` og Warehouse-
   callables. Kør emulator-QA før regelændringen frigives.
3. Saml Database Rules for fælles modul-gates, append-only historik,
   valgfri `hjemPladsId`, målsemantik og beskyttede importnoder.
4. Saml UI-routes, navigation og fælles kopier via `scripts/kopier-delt.mjs`.
5. Kør domæne-, regel-, runtime- og browsermatrixen på en eksport/kopi af data.
6. Udfør først en produktionsfrigivelse efter særskilt godkendelse. Denne
   leverance må ikke bruges som autorisation til deployment eller dataskrivning.

## Dry-run før senere produktion

Et senere dry-run skal kun rapportere:

- enheder uden eller med delvise indvendige mål;
- enheder hvor eksisterende måls betydning er ukendt;
- ukendte `pladsId`/`hjemPladsId`-referencer;
- dublerede fysiske identiteter på tværs af `kasser`, `enheder` og `carriers`;
- bookinger hvis tilstand og fysisk placering allerede er i modstrid.

Dry-run må ikke udfylde mål, vælge målakse, flytte enheder eller skabe historiske
bevægelser. Afvigelser skal godkendes enkeltvis eller efter en særskilt,
dokumenteret regel.

## Fælles ejerskab

- UNIT-sporet ejer bookingassistent, match, UNIT-UI, UNIT-retur/udlevering og
  klientbeskyttelse af `kasser.pladsId`.
- Warehouse-sporet ejer Warehouse-UI, selvstændige lagerhandlinger og den
  valgfrie hjemplacering i sin oprettelseshandling. Referencecommit:
  `37bba72ec73e33369479b236454a1a1e913a208c`.
- Samlingssporet ejer konfliktløsning i `functions/index.js`,
  `firebase.rules.json`, navigation, permissions og genererede `functions/delt`.

Den normative felt- og callable-kontrakt står i
`docs/VEYRO_UNIT_WAREHOUSE_CONTRACT_V1.md`.
