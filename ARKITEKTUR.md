# Datamodel

Firebase Realtime Database, projekt `fleetcontrol-98e11`, europe-west1.

## Konventioner

| | |
|---|---|
| Beløb | Hele **øre** som integer. `842615 kr` → `84261500`. Aldrig float. |
| Moms | `beloebOere` er **altid ekskl. moms**. `momsOere` er separat felt. |
| Tid | Epoch millisekunder. Intervaller er halvåbne: `[fra, til)` |
| Afvigelser | Gemmes som `faktisk − budget`. Farven afgøres af `betterWhen` i visningen. |
| Numre | `PRÆFIKS-ÅÅÅÅ-NNNNN` fra counter i transaction. BKG, FRB, WO, PO, INV. |
| Sletning | Regnskabsdata: kun `slettet: true` med `slettetMs`, `slettetAf`, `slettetAarsag`. |
| Tenant | `tenantId` er immutabelt. Kommer fra `auth.token.tenant`, aldrig fra klienten. |

## Noder

```
tenants/<tenantId>/
  kpi/<gods|bus>/current        aggregerede nøgletal — kun Cloud Functions skriver
  satser/
    poster/<id>/satser[]        { gyldigFra, beloebOere, metode, valuta, aktiv }
    agenter/<id>/satser[]
    biler/<id>/kmPrisSatser[]
  reservationer/<type>/<id>/<resId>
                                { fra, til, kilde:{type,id,reference}, annulleret }
                                type: koeretoej | chauffoer | facilityAktiv | lokation
                                kilde: booking | vaerksted | facilitySag | fravaer | manuel
  bookinger/<id>                { nummer, tilstand, forslag[], valgtForslagId,
                                  prisSnapshot, prisLinjer[], historik/<ms> }
  opgaver/<id>                  { art: vaerksted|langtur, ... }
  koeretoejer/<id>
  indberetninger/<id>           { type, km, ... }  km = TOTAL målerstand
  fravaer/<id>
  facility/sensorer/<zoneId>/   { aktuel, maalinger/<ms> }  ÉN kilde
  indkoeb/<id>                  { beloebOere, momsOere, ... }
  fakturaer/<id>
  kunder/<id>
  countere/booking/<år>
  idebank/<id>
brugerTenants/<uid>             opslag til custom claims, kun server-side
```

## Reservationsprioritet

Højere tal vinder. Bestemmer hvad der kan overskrive hvad.

```
vaerksted    40   en bil på værksted kan ikke køre
fravaer      30   en syg chauffør kan ikke disponeres
facilitySag  20
booking      10
manuel        5
```

Overskrives en reservation, sættes den til `annulleret: true` med årsag — den
slettes ikke. Ellers kan man ikke forklare hvorfor en tur blev flyttet.

## Bookingtilstande

```
kladde ──► afventerPlan ──► afventerKoord ──► reserveret ──► udfoert
             ▲                   │  │              │
             │                   │  └► returneret ─┘
             └── afvist ◄────────┘         │
                                           └──► afventerKoord
```

Roller: `casehandler` opretter, `disponent` foreslår, `koordinator` godkender.
Disponenten står ikke på listen over roller der må godkende — se
`booking-state.js`.

## Egress

RTDB koster på data ud, ikke på forespørgsler.

- `once()` frem for `on()` for alt der ikke skal være live.
- Nøgletal fra `kpi/`, aldrig ved at hente rådata og summere i klienten.
- RTDB kan kun filtrere på ét felt. Reservationer indekseres på `fra`; hent et
  vindue der er bredt nok til at fange reservationer der startede før perioden
  men stadig løber, og filtrér resten klientside.
- Historiske data tidspartitioneres (`/<år>/<måned>/`), så et opslag ikke
  trækker hele historikken.

## Verificér før demo

Satser der ændrer sig og bør tjekkes mod kilden:

- **Storebælt erhverv:** 887 kr med grøn rabat / 1.020 kr uden, lastbil 10–20 m,
  2026. Rabatten er progressiv på månedsbasis i Storebælt Erhvervsaftale, så din
  faktiske sats afhænger af volumen. Fra 2026 kræver grøn rabat køretøj over 6 m
  og 2,7 m høj.
- **Femern (Rødby–Puttgarden):** sats i `Bookingopsaetning.jsx` er et gæt.
- Eurotunnel er Calais–Folkestone og hører ikke på en Hamburg-rute.
