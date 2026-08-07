# Datamodel

Firebase Realtime Database. **To projekter:**

| Alias | Projekt | RTDB | Storage | Plan |
|---|---|---|---|---|
| `dev` | `fleetcontrol-dev-1ac1c` | europe-west1, locked mode | **ikke oprettet** | Spark |
| `prod` | `fleetcontrol-98e11` | europe-west1 | europe-west1, Regional | — |

Aliaserne står i `.firebaserc`, så `firebase deploy --project dev` og
`--project prod` er eksplicitte valg. Appen udleder selv sit miljø af
`VITE_FB_PROJECT_ID` og viser en bjælke i toppen, når man ikke er på
produktion — se `AppShell.jsx`.

### Regioner — verificeret 7. august 2026

**PROD's Storage-bucket ligger i `europe-west1`, Regional.** Samme region som
RTDB. Ingen migrering nødvendig. Kontrolleret i Firebase Console; bemærk at
`firebase projects:list` viser *Resource Location ID: Not specified* og
dermed er misvisende — nyere `.firebasestorage.app`-buckets oprettes uden at
sætte projektets fælles resource location, så bucket'en har sin egen.

**En bucket-region kan ikke ændres efter oprettelsen.** Det samme gælder
RTDB-instansen. Oprettes et nyt projekt, skal begge dele derfor sættes til
`europe-west1` fra starten — vælger man forkert, er den eneste vej ud en
migrering til en ny bucket. Det er noteret her, fordi det ellers er den slags
der skal slås op forfra hver gang nogen spørger.

**DEV har ingen Storage-bucket.** Den kræver Blaze, og DEV står på Spark. Det
er udskudt til en skærm faktisk skal uploade filer — og når den dag kommer,
skal bucket'en oprettes i `europe-west1` sammen med en budgetalarm.

### Ældre projekter i kontoen

`fleetcontrol-6de59` (det gamle produktionsprojekt, kan indeholde rigtige
data), `fleetcontrol-v2-0` og `flaadestyring-4b161`. **Ingen af dem må bruges
til noget**, før nogen har set efter hvad der ligger i dem. Det er en
oprydningsopgave for sig.

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
| Division | Felt, aldrig sti. `gods` \| `bus` \| `faelles`. Transaktioner hører til én afdeling, stamdata kan være fælles. Reservationer og fravær har **ingen** division — de arver fra ressourcen. Håndhævet med `.validate`. |

## Noder

```
tenants/<tenantId>/
  kpi/<gods|bus>/current        aggregerede nøgletal — kun Cloud Functions skriver
  satser/
    poster/<id>/satser[]        { gyldigFra, beloebOere, metode, valuta, aktiv }
    agenter/<id>/satser[]
    biler/<id>/kmPrisSatser[]
  reservationer/<type>/<id>/<resId>
                                { fra, til, kilde:{type,id,reference}, maengde, annulleret }
                                type: koeretoej | chauffoer | facilityAktiv | lokation | lager
                                kilde: booking | vaerksted | facilitySag | fravaer | lager | manuel
                                maengde: { m3, kg } — KUN kapacitetsressourcer
  lagre/<lagerId>               { navn, kapacitet:{m3,kg}, satser[], haandteringSatser[] }
  bookinger/<id>                { nummer, kundeId, tilstand, harAabneEtaper,
                                  prisSnapshot, prisLinjer[], historik/<ms> }
                                tilstand og harAabneEtaper er AFLEDT af etaperne
  etaper/<etapeId>              { bookingId, nr, tilstand, division, senestMs,
                                  fraSted, tilSted, koeretoejId, chauffoerId,
                                  forslag[], valgtForslagId, maengde, historik/<ms> }
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

**Prioritet gælder kun eksklusive ressourcer.** `lager` står ikke på listen:
man smider ikke en palle ud, fordi en værkstedsopgave har prioritet 40. Der er
plads, eller også er der ikke.

## Ressourcearter

| Art | Ressourcer | Konflikt |
|---|---|---|
| `eksklusiv` | koeretoej, chauffoer, facilityAktiv, lokation | Enhver overlapning |
| `kapacitet` | lager | Kun hvis **summen** over overlappet overskrider kapaciteten |

Kapacitet måles på `m3` og `kg` hver for sig — en palle kan være let og fylde
meget, eller tung og fylde lidt. `maksBelastning()` finder toppen med en
sweep-line; det er den samtidige spids der afgør om der er plads, ikke summen
over hele perioden.

**Et lagerophold uden slutdato må aldrig gemmes som `til: null`.** Man kan ikke
summere kapacitet over uendelighed, og en åben ende betyder i praksis at hallen
er fuld for altid. Er afgangen ukendt, sættes `til` til etapens `senestMs` —
samme rangorden som prisen bruger i `lagerUd()`.

## Bookingtilstande

Tilstanden ligger på **etapen**, ikke på bookingen. En booking er et forløb med
N etaper, og etape 1 kan være reserveret mens etape 2 stadig er åben.

```
kladde ──► afventerPlan ──► afventerKoord ──► reserveret ──► udfoert
             ▲  │               │  │              │
             │  ▼               │  └► returneret ─┘
             │ aaben ───────────┤         │
             │  │               │         └──► afventerKoord
             └──┴── afvist ◄────┘
```

Roller: `casehandler` opretter, `disponent` foreslår, `koordinator` godkender.
Disponenten står ikke på listen over roller der må godkende — se
`booking-state.js`.

**`aaben` er en tilstand, ikke fravær af planlægning.** Den skal kunne
forespørges (`orderByChild("tilstand").equalTo("aaben")` — fravær kan ikke
indekseres), den skal kunne skelnes fra `kladde`, og den bærer `senestMs`.
Uden en frist på tilstanden fyldes lageret med gods ingen henter.

Der er ingen `forfalden`-tilstand. Overskredet frist udledes af `senestMs` med
`serviceTone()` og kan intervalforespørges.

### Forløbstilstand

Bookingens `tilstand` er **afledt** af etaperne med `forloebstilstand()`. Den
lagres denormaliseret, men skrives af præcis én ting: den Cloud Function der
skifter en etapetilstand, i samme transaktion. Samme mønster som `kpi/`, og
`bookinger` er allerede `.write: false`. Klienten kan altid genberegne.

Ny værdi: **`delvist`** — noget er i hus, noget er ikke. Et forløb er først
`udfoert` når hver eneste etape er det.

## Fakturering af forløb

Dækningsbidraget på et forløb er ikke endeligt, før sidste etape er kørt —
lagerdagene løber stadig. Derfor tre spande, ikke to. Et forløb med åbne
etaper må hverken tælle med som færdigt eller være usynligt.

| Felt | Dækker |
|---|---|
| `opgaver.klarTilFakturering` | **Alle** etaper udført. Kun disse kan faktureres |
| `opgaver.forloebMedAabneEtaper` | Antal forløb i gang |
| `oekonomi.igangvaerendeForloebOere` | Påløbet omkostning på igangværende forløb |
| `kunder.foreloebigtDaekningsbidragOere` | DB på igangværende forløb — ikke endeligt |

### ⚠ `ikkeFaktureretOere` skifter betydning

Feltet findes allerede og læses i dag af **Dashboard, Booking og Økonomi**.
Dette er en ændring i noget der er i brug, ikke en tilføjelse.

| | |
|---|---|
| **Før** | Alt arbejde der ikke var faktureret |
| **Nu** | Kun **færdige** forløb der ikke er faktureret |

Igangværende forløb ligger i `oekonomi.igangvaerendeForloebOere`. Blandes de
to, kan et halvfærdigt forløb blive læst som fakturerbart, og lagerdage der
stadig løber bliver talt som en endelig omkostning.

Aggregeringen skal opdateres samtidig med de forbrugende skærme — ellers
falder totalen på Dashboard uden at nogen har ændret noget synligt.

Samme disciplin som beslutning 14: to tal med hver sin betydning skal have
hver sit navn. `daekningsbidragOere` tæller kun færdige forløb.

## Egress

RTDB koster på data ud, ikke på forespørgsler.

- `once()` frem for `on()` for alt der ikke skal være live.
- Nøgletal fra `kpi/`, aldrig ved at hente rådata og summere i klienten.
- RTDB kan kun filtrere på ét felt. Reservationer indekseres på `fra`; hent et
  vindue der er bredt nok til at fange reservationer der startede før perioden
  men stadig løber, og filtrér resten klientside.
- Historiske data tidspartitioneres (`/<år>/<måned>/`), så et opslag ikke
  trækker hele historikken.
- **Etaper ligger som egen node, ikke under bookingen.** RTDB forespørger kun
  på børnene af én node, så "alle åbne etaper på tværs af bookinger" ville
  kræve at hente samtlige bookinger ned. Se beslutning 16.

## Matchning af åbne etaper

Grænseflade — implementeringen er en Cloud Function, ikke en skærm.

```
matchAabneEtaper(tur, { radiusKm }) → [{ etapeId, score, afstandKm, restkapacitet, slaek }]
```

Kører `onWrite` af en tur, altså når en tur oprettes **eller ændres**. Finder
åbne etaper med `orderByChild("tilstand").equalTo("aaben")` og vurderer dem på
destination + radius, kapacitet, transporttype og deadline. `slaek` er dage til
`senestMs`.

**Den skriver aldrig en reservation.** Et match bliver et `forslag` på etapen,
og koordinatoren godkender stadig. Ellers omgår automatikken rolletjekket, og
beslutning 5 er væk ad bagvejen.

## Verificér før demo

Satser der ændrer sig og bør tjekkes mod kilden:

- **Storebælt erhverv:** 887 kr med grøn rabat / 1.020 kr uden, lastbil 10–20 m,
  2026. Rabatten er progressiv på månedsbasis i Storebælt Erhvervsaftale, så din
  faktiske sats afhænger af volumen. Fra 2026 kræver grøn rabat køretøj over 6 m
  og 2,7 m høj.
- **Femern (Rødby–Puttgarden):** sats i `Bookingopsaetning.jsx` er et gæt.
- Eurotunnel er Calais–Folkestone og hører ikke på en Hamburg-rute.
