# Veyro WAREHOUSE / UNIT Booking – fælles kontrakt V1

## Formål og ejerskab

Den fysiske, individuelt identificerede unit er `kasser/<unitId>`. UNIT Booking
ejer reservationen i `kasseudlaan`, mens WAREHOUSE ejer lagerarbejdsgangen.
Begge moduler læser den samme unit, den samme aktuelle placering og den samme
append-only historik. WAREHOUSE implementerer den fælles callable
`unitlagerhandling`; UNIT Booking implementerer bookingens udlevering/retur i
`kasseudlaanskriv` og kalder `unitlagerhandling` til uafhængig modtagelse og
flytning.

## Identitet og QR

- `unitId` er stabil identitet og QR-payload. Eksisterende rå koder ændres ikke.
- Opslag er et eksakt opslag i `kasser` under den aktuelle tenant. Ukendt kode
  giver fejl og opretter aldrig en unit.
- `kasser.pladsId` er den faktiske aktuelle placering.
- `kasser.hjemPladsId` er et valgfrit forslag til hjemplacering. Fravær ændrer
  ikke den faktiske placering og kræver ingen migration.
- Lokationer ligger i `reolpladser` og er fælles for begge moduler.
- En fysisk unit tælles én gang. `enheder` er serienummerførte vareenheder, og
  `carriers` er beholdningsbeholdere; de er ikke parallelle kopier af `kasser`.

## Fysisk bevægelse

`unitbevaegelser/<operationId>` er en uforanderlig hændelse. Gyldigt
`operationId` matcher `^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$` og kan derfor bruges
som RTDB child key. Samme nøgle og payload er et sikkert retry; samme nøgle med
en anden payload afvises.

`unitlagerhandling` modtager:

```text
{
  operationId,
  unitId,
  art: "modtagelse" | "flytning" | "udlevering" | "retur",
  tilPladsId?,
  bookingId?,
  reference?,
  kilde: "warehouse" | "unitbooking"
}
```

Svaret er:

```text
{ ok: true, gentaget, unit?, bevaegelse, bookingId? }
```

Hele tenant-roden er transaktionsgrænse, så unit, placering, event og en eventuel
bookingafslutning enten gemmes samlet eller slet ikke.

## Adgang og kombinationer

- `kilde: "warehouse"` kræver WAREHOUSE samt `bevaegelser.skriv` og kan udføre
  alle fire fysiske handlinger.
- `kilde: "unitbooking"` kræver UNIT Booking samt `kasseudlaan.skriv` og kan kun
  modtage eller flytte via denne callable.
- Faktisk UNIT-udlevering og -retur skal gå via `kasseudlaanskriv`, så booking og
  fysisk hændelse afsluttes atomisk.
- WAREHOUSE-udlevering afviser en unit med en bindende booking. En WAREHOUSE-
  retur med konkret `bookingId` kan afslutte en faktisk udlånt booking atomisk.
- Læsning af `kasser`, `kassetyper`, `reolpladser` og `unitbevaegelser` tillades
  for den relevante tenant, når brugeren har mindst ét af modulerne og de
  nødvendige rettigheder.
- WAREHOUSE skriver fysiske handlinger gennem servercallables. Direkte
  klientskrivning må kun rette ikke-fysiske stamdata som mål, type og note.
  `pladsId`, fysisk status og append-only `unitbevaegelser` må ikke kunne
  ændres direkte. UNIT-sporet ejer den eksisterende kasseformular og den
  tilhørende regelstramning; indtil dens regelcommit er samlet, er dette et
  kendt, åbent kontraktbrud og ikke en bestået kontrol.

## Oprettelse og bagudkompatibilitet

`unitlageropret` er WAREHOUSEs atomiske oprettelse og første modtagelse. Den
opretter aldrig over en eksisterende `unitId`. Eksisterende QR-koder og units
kræver ingen migration. `hjemPladsId` kan udelades; `modtagelsesPladsId` er
fortsat påkrævet og bliver den faktiske `pladsId`. Varer uden det nye
`ejerforhold` fortolkes fortsat som kundegods; egne varer gemmes eksplicit med
`ejerforhold: "egen"` og uden `kundeId`, så de ikke bliver kundeafregnet.

## Samlingspunkter

Ved samling skal ændringer i `functions/index.js`, `firebase.rules.json`,
`src/fleet/moduler.js`, de genererede `functions/delt/*` samt UNIT Bookings kald
til `unitlagerhandling` afstemmes. Der må kun være én implementation af
`unitlagerhandling` og ét fælles operation-id-mønster.

## Transaktionsgrænse og samtidighed

`unitlageropret` og `unitlagerhandling` bruger i V1 hele
`tenants/<tenantId>` som RTDB-transaktionsgrænse. Det giver en enkel atomisk
garanti på tværs af unit, booking og historik, men enhver samtidig skrivning
under samme tenant kan få callbacken til at køre igen — også en skrivning i et
helt andet modul. Jo større tenant-roden og jo højere skrivefrekvens, desto
mere data og flere genforsøg skal funktionen håndtere.

Idempotensnøglen forhindrer dobbelte fysiske hændelser, og alle forudsætninger
evalueres igen ved hvert transaktionsforsøg. Det beskytter korrektheden, men
fjerner ikke latenstid eller risikoen for mange genforsøg. Før grænsen ændres,
skal samlingssporet måle tenant-størrelse, antal callbackforsøg, varighed og
abort-rate under realistisk aktivitet. En eventuel opdeling kræver en fælles
låse-/kommandoarkitektur for unit og booking og må ikke indføres af ét modul
alene.
