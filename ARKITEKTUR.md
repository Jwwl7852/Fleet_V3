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

## Adgang: permissions, ikke roller

Adgang afgøres af **permissions**. Rollen er et navn på en samling — ikke et
niveau man er over eller under. Kataloget og presetsene står i
`fleet/permissions.js`, som ikke importerer noget, så den Cloud Function der
udsteder claims kan bruge nøjagtig samme kilde. To definitioner af hvem der må
godkende en booking er præcis den fejl beslutning 5 handler om.

```
auth.token.rolle = "koordinator"                  // kun til visning
auth.token.perms = "|kunder.skriv|booking.godkend|…"
```

En rør-afgrænset streng, fordi RTDB-regler kan `.contains()` på strenge men
ikke slå op i arrays. Rørene i begge ender er ikke pynt: uden dem ville
`contains('|booking.afvis')` også matche `|booking.afvisAlle|`.

**Reglerne læser kun `perms`.** Der er ingen `auth.token.rolle` tilbage i
`firebase.rules.json`. En tastefejl i claim'et — `kunder.skrivx`, eller en
streng helt uden rør — giver adgang til ingenting. Fejler lukket.

Klienten udleder aldrig selv permissions af rollen. Gjorde den det, kunne
UI'et vise knapper som serveren afviser, og så var adgangskontrollen tilbage i
frontend. Mangler claim'et, må brugeren intet.

### Presets er provisioneringsstandard, ikke facit

`ROLLE_PERMS` i `permissions.js` definerer, hvad en **ny** tenant får ved
oprettelse. Hvad tenanten *faktisk* har, ligger i databasen:

```
tenants/<t>/roller/<rolleId>/{ navn, perms: ["booking.foreslaa", …] }
```

En kunde skal kunne fjerne fx `booking.vaerdiLaes` fra sin disponent-rolle
uden at nogen skriver kode. Roller er udgangspunkter, ikke lov.

`perms` er et **array**, ikke et map. RTDB-nøgler må ikke indeholde punktum,
og permission-navnene gør — `perms/booking.foreslaa: true` er derfor umuligt.

**Claim'et forbliver håndhævelsespunktet.** Reglerne slår ikke op i databasen
ved hver skrivning; det ville koste en ekstra læsning pr. regel-evaluering.
Den Cloud Function der udsteder claims, læser `roller/`, og en ændring træder
i kraft ved næste token-fornyelse — eller straks med `revokeRefreshTokens`,
som allerede er påkrævet ved rolleskift.

**`roller/` er `.write: false` indtil den funktion findes**, og det er med
vilje hårdt frem for dokumenteret. Kunne man redigere en rolle nu, ville
claim'et ikke blive opdateret: man ville tro, man havde fjernet en permission,
som stadig virkede. Det er den værste fejltilstand af alle, for den ser ud som
om den lykkedes. En fejl er bedre end tavshed. Der er en test der fastholder
det.

| Rolle | Kort sagt |
|---|---|
| `chauffoer` | Egne indberetninger, idébanken |
| `casehandler` | Dataskrivning + opretter bookinger |
| `disponent` | Samme + køretøjer, foreslår, afviser, udfører |
| `koordinator` | Samme + **godkender**, returnerer, annullerer |
| `admin` | Alt |

Disponenten har **ikke** `booking.godkend`. Beslutning 5 er nu et felt der
mangler i en liste frem for en kommentar om hvem der ikke står der — og der er
en test der fastholder det.

**Bookingflowets permissions håndhæves endnu ikke i reglerne.** `bookinger` og
`etaper` er `.write: false`, fordi tilstandsskiftet skal ske atomisk sammen
med reservationen i en Cloud Function der ikke findes. Serveren afviser altså
alle — strengere end nogen permission, men ikke granulært. Der er en test der
fastholder `.write: false`, så ingen åbner noden uden at opdage at
`booking.godkend` så ikke bliver tjekket af nogen.

## securityLevel: restricted — kontakterne

`restricted` er den strengeste af de fire niveauer, men **automatikken er ikke
bygget.** Feltet valideres og kan sættes; det udløser i dag ingen adfærd.

Herunder står de seks kontakter fra sikkerhedsgennemgangen: hvor hver enkelt
skal håndhæves, og hvad der mangler. Tænd dem én ad gangen — en kontakt der
ikke kan håndhæves der hvor den påstås at virke, er værre end ingen.

| # | Kontakt | Håndhæves i | Mangler |
|---|---|---|---|
| 1 | Skjul værdi | **Regler** (delvist) | Værdien ligger allerede i `vaerdi/` bag egen permission. For `restricted` mangler kun klientsidemaskering med audit på afsløring |
| 2 | Begræns GPS | Cloud Function + klient | En **afrundet position** i general. Regler kan ikke afrunde data — kun vælge om de må læses |
| 3 | Blokér eksport | Cloud Function | Der findes ingen eksportfunktion at spærre. Regler kan **ikke** forhindre en klient i at læse og gemme selv |
| 4 | **Kræv MFA igen** | **Regler alene** | **Intet.** Kan skrives i dag — se nedenfor |
| 5 | Stærkere audit | Cloud Function | "Ingen audit, ingen adgang" kræver at læsningen går gennem en callable der logger *før* den leverer |
| 6 | Ingen detaljer i notifikationer | Klient/Function | Der findes intet notifikationssystem |

### Nummer 4 er den eneste der kan tændes nu

RTDB-regler kan læse `auth.token.auth_time` — hvornår brugeren senest
autentificerede sig. Den er i sekunder, mens `now` er i millisekunder:

```
&& auth.token.auth_time * 1000 > now - 900000     // 15 minutter
```

Ingen ny infrastruktur, ingen Cloud Function. Men der er et valg at træffe om
hvor den lægges:

- **På samlingen** (`sensitive/bookinger`): *alle* følsomme læsninger kræver
  frisk MFA. Simplest og strengest, og ingen strukturændring.
- **Pr. objekt** (`sensitive/bookinger/$id`, betinget af at general-postens
  `securityLevel` er `restricted`): mere målrettet — men `.read` skal så ligge
  på `$id`, og dermed kan man ikke længere forespørge på den følsomme samling.

Det er samme afvejning som i beslutning 17. Da følsomme data alligevel ikke
vises i lister, er prisen mindre end den lyder — men den skal træffes bevidst.

De øvrige fem venter på Cloud Functions eller er klientside og dermed svagere.

## Auditlog

```
audit/<tenantId>/<klasse>/<år>/<måned>/<id>
  { ms, brugerUid, rolle, handling, objekt, objektId, resultat,
    korrelationsId, kilde, ip, aendrede[], foer{}, efter{}, antal }
```

**Den ligger ikke under `tenants/<id>/`, og det er med vilje.** RTDB's `.read`
kaskaderer og kan ikke indsnævres på et barn: reglen på `tenants/$tenantId`
giver læseadgang til alt nedenunder. En log over hvem der har set hvad er selv
følsom — den afslører hvilke kunder der bliver kigget på, og af hvem. Som
topniveau-node kan den få sin egen læseregel. Flyt den ikke ind under
`tenants/` for at rydde op.

**Append-only.** `.write: false` for alle, også admin. Skrivning sker kun
gennem en Cloud Function med Admin SDK. Der findes derfor ingen
`audit.skriv`-permission, og den må ikke tilføjes: kan en kompromitteret
admin-konto redigere sit eget spor, er loggen værdiløs.

**Læsning kræver `audit.laes`**, som ligger i `admin` og i `revisor` —
sidstnævnte kan læse loggen og skrive intet, og er den rolle en RA-kundes
security manager får.

### Ingen følsomme oplysninger i posten

*"Viste booking 28372"* — ikke *"viste Picasso, værdi 18 mio., Strandvejen
123"*. En audit-log der lækker er værre end ingen.

Kravet om `før/efter` og kravet om ingen følsomme oplysninger løses med en
feltallowliste i `fleet/audit-regler.js`:

| | |
|---|---|
| `aendrede` | **alle** ændrede felter, ved navn. Et feltnavn er ikke følsomt |
| `foer` / `efter` | kun værdier fra allowlisten: beløb, tilstande, klassifikationer, tidspunkter, id'er |

Fritekst — navne, adresser, noter, begrundelser — kommer aldrig med som værdi.
Begrundelser går ikke tabt: de står i objektets egen `historik`, som også er
append-only.

Serveren filtrerer mod samme liste **igen**. Klientens filtrering er en
bekvemmelighed; serverens er kontrollen. Derfor har `audit-regler.js` ingen
imports — Cloud Function'en skal kunne bruge nøjagtig samme kilde.

### Læsningslogning

`useListe()` tager `auditerSom`, og logger da én post pr. hentning med antal
rækker — aldrig rækkerne. Det ligger i hooket og ikke i skærmen, fordi en
skærm ville glemme det, og så var audit eftermonteret.

### Retention

Klassen ligger i **stien**, ikke kun i posten, fordi retention varierer pr.
klasse: så bliver sletning "fjern `audit/<tenant>/drift/2024/03`" i én
operation frem for en scanning af hver post.

| Klasse | Indhold | Grænse |
|---|---|---|
| `drift` | alt andet | 24 mdr. |
| `regnskab` | fakturaer, indkøb, satser, bookinger, etaper, countere | 24 mdr. |
| `sikkerhed` | login, adgang nægtet, eksport | 24 mdr. |

**Tallene er foreløbige** — se README. Mekanismen kan bære forskellige
grænser; det er kun beslutningen der mangler.

Sletning sker med Cloud Scheduler → Pub/Sub → en Function med Admin SDK.
Grænsen konfigureres i funktionen, **ikke i tenantens data**: kunne kunden
sætte den, ville append-only være teater. Er der opbevaringspligt, eksporteres
partitionen til en bucket i `europe-west1`, før den fjernes.

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
