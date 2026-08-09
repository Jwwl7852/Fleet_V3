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
| Numre | `PRÆFIKS-ÅÅÅÅ-NNNNN` fra counter i transaction. BKG, FRB, WO, PO, INV, **FLT**, **FAC**. Én mekanisme: `naesteNummer()` i `booking-state.js`. Serien er fortløbende og dermed gætbar — et nummer er en **adresse, ikke en hemmelighed**, og må aldrig i sig selv give adgang. Se beslutning 20. |
| Sletning | Regnskabsdata: kun `slettet: true` med `slettetMs`, `slettetAf`, `slettetAarsag`. |
| Tenant | `tenantId` er immutabelt. Kommer fra `auth.token.tenant`, aldrig fra klienten. |
| Division | Felt, aldrig sti. `gods` \| `bus` \| `faelles`. **Transaktioner** hører til én afdeling: `opgaver`, `indberetninger`, `etaper`, `indkoeb`, `lagre`. **Kunder** kan være `faelles` — kundens forretning går på tværs. **Stamdata om vores egne folk og biler har ingen** (beslutning 19): `personale` og `koeretoejer` afvises. Det samme gør `reservationer`, `fravaer` og `kompetencer`, som arvede den fra ressourcen. Håndhævet med `.validate` i begge retninger. |

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
                                type: koeretoej | medarbejder | facilityAktiv | lokation | lager
                                kilde: booking | vaerksted | facilitySag | fravaer | lager | manuel
                                maengde: { m3, kg } — KUN kapacitetsressourcer
  lagre/<lagerId>               { navn, kapacitet:{m3,kg}, satser[], haandteringSatser[] }
  bookinger/<id>                { nummer, kundeId, tilstand, harAabneEtaper,
                                  prisSnapshot, prisLinjer[], historik/<ms> }
                                tilstand og harAabneEtaper er AFLEDT af etaperne
  etaper/<etapeId>              { bookingId, nr, tilstand, division, senestMs,
                                  fraSted, tilSted, koeretoejId, personId,
                                  forslag[], valgtForslagId, maengde, historik/<ms> }
  opgaver/<id>                  { art: vaerksted|facility, division, status, ... }
                                art styrer feltskemaet — ART_FELTER i
                                opgaver.js. IKKE langtur: en langtur er en
                                ETAPE (beslutning 21). status er opgavens eget
                                maskineri, ikke etapens tilstand
  koeretoejer/<id>              { art, status, laengdeMm, ... }  INGEN division
                                art styrer feltskemaet — ART_FELTER i flaade.js.
                                En trailer har intet kmStand (ingen motor), en
                                bus har saeder frem for kapacitet. Et felt arten
                                ikke har, er ikke et tomt felt
  personale/<personId>          { navn, status, funktioner{}, uid? }  INGEN division
  kompetencer/<id>              { personId, type, udloeberMs }  INGEN division
  indberetninger/<id>           { type, km, ... }  km = TOTAL målerstand
  fravaer/<id>                  { personId, fra, til }  INGEN division, INGEN art
                                [fra, til) er HALVÅBENT: et fravær 14.–18. juli
                                har til = 19. juli. Gemmes den 18., er
                                medarbejderen ledig hele sin sidste dag
  sensitive/fravaer/<id>        { art, note, dokumentation }  bag
                                fravaer.sensitiveLaes — HELE art, også ferie
  facility/sensorer/<zoneId>/   { aktuel, maalinger/<ms> }  ÉN kilde
  indkoeb/<id>                  { beloebOere, momsOere, ... }
  fakturaer/<id>
  kunder/<id>
  sager/<sagId>                 { nummer, art: fleet|facility, tilstand, emne,
                                  modul, objektType, objektId, modpartNavn,
                                  parter[], securityLevel, sidsteBeskedMs,
                                  antalBeskeder, antalKarantaene,
                                  harAftale, aftaleTilstand, aftaleFraMs }
                                GENERAL — ingen brødtekst. parter[] er
                                ADGANGSLISTEN, ikke kontaktinfo
  countere/booking/<år>
  countere/sagFlt/<år>
  countere/sagFac/<år>
  idebank/<id>
brugerTenants/<uid>             opslag til custom claims, kun server-side
```

## Reservationsprioritet

Højere tal vinder. Bestemmer hvad der kan overskrive hvad.

```
vaerksted    40   en bil på værksted kan ikke køre
fravaer      30   en syg medarbejder kan ikke disponeres
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
| `eksklusiv` | koeretoej, medarbejder, facilityAktiv, lokation | Enhver overlapning |
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

## Delvis afsløring lækker gennem udeladelsen

**Klassificér hele feltet, eller intet af det.** Skjuler man kun de værdier der
er følsomme, bliver *fraværet af en værdi* selv svaret.

Fravær er det tydelige tilfælde. Årsagen kan være `sygdom`, `ferie`, `barsel`,
`kursus`. Kun sygdom og barsel er helbredsoplysninger, så det ser rimeligt ud
at vise ferie og skjule sygdom. Men så betyder en tom celle *sygdom*, og
disponenten kan læse det uden at have `fravaer.sensitiveLaes`. Derfor ligger
**hele `art`** i `sensitive/fravaer/<id>`, og reglerne afviser feltet i
general-noden med `.validate: false` — også for en ferie.

Det gælder også et niveau op: **klassifikationsfeltet må ikke variere med det
klassificerede.** Sætter man `securityLevel: confidential` på sygdom og
`normal` på ferie, er niveauet selv kanalen — det ligger i general og kan
læses af enhver. Derfor har hvert fravær samme niveau, og der er en test der
fastholder det.

Reglen skal huskes andre steder, hvor den er nemmere at overse:

| Hvis nogen engang gør… | …er læk-slutningen |
|---|---|
| Skjuler `cargoValue` kun over en beløbsgrænse | Et skjult felt betyder at godset er dyrt |
| Viser `securityLevel` men skjuler `sensitive/` selektivt | Hængelåsen udpeger hvilke bookinger der er noget ved |
| Logger kun afviste følsomme opslag | Loggens tavshed markerer de godkendte |
| Viser antallet af karantænebeskeder kun når det er > 0 | Nul og skjult bliver til det samme signal |

Den generelle form: hvis en observatør kan udlede den skjulte værdi af
*hvilke* poster der er skjult, er skjulningen ikke en beskyttelse — den er et
indeks. En hængelås på hver række siger ingenting; en hængelås på hver tredje
siger hvem.

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

## Tachografdata — forudsætningen for at fjerne køre-hviletidsforbeholdet

`tjekKoerehviletid()` i `fleet/koerehviletid.js` blokerer en disponering der
overtræder 4,5-timers-reglen eller den daglige køretid. **Men den regner kun på
planen**, og derfor bærer hvert svar — også de grønne — et forbehold:

> planen overtræder ikke reglen — vi kan ikke se tachografen

Forbeholdet kan først fjernes når vi har **faktisk køretid pr. chauffør**, og
den findes ét sted: på tachografen. Indtil da må ingen skærm og ingen rapport
formulere svaret som at chaufføren er lovlig.

**Det hører sammen med de øvrige integrationer** — kort, brændstofkort,
regnskab, løn — men det er formentlig en større opgave end kortintegrationen,
og det skal siges før nogen estimerer det:

| | |
|---|---|
| Ingen standard | Der findes ikke ét format at læse. DDD-filer fra førerkort og køretøjsenhed er reguleret, men udtrækket sker gennem producentens eget system |
| Hver producent sit format | Scania, Volvo, Mercedes, MAN og DAF har hver sin flådeportal og sit eget API. En kunde med blandet flåde skal have flere |
| Fjernudlæsning kræver abonnement | Remote download er en betalt tjeneste hos producenten, ikke noget vi kan hente selv |
| Persondata | Køretid pr. chauffør er personoplysninger og hører i `sensitive/`. Det er også et medbestemmelsesspørgsmål |

Så længe det ikke er løst, er kontrollen ærlig frem for fuldstændig: den fanger
en plan der ikke kan lade sig gøre, og den påstår ikke at fange en overtrædelse
der allerede er sket.

## Forudsætninger for Disponering

Koblingen personale + køretøj + trailer sker på **etapen**, og hver kobling
skriver en reservation. Tre tjek skal køre, før en etape må oprettes eller
ændres.

**Alle tre hører i den Cloud Function der skriver etapen — ikke i skærmen.**
Ligger de i skærmen, kan en direkte skrivning omgå dem, og så er de
dekoration. `etaper` er `.write: false` netop derfor.

| # | Tjek | Funktion | Status |
|---|---|---|---|
| 1 | Enhedskombination | `kanDisponeres(enheder)` i `flaade.js` | **Bygget og testet — men intet kalder den** |
| 2 | Kompetencer | `kraevedeKompetencer(enheder, gods)` + `tjekKompetencer(...)` | Bygget og testet — intet kalder dem |
| 3 | Kapacitet | `kanBaere(enheder, gods)` i `flaade.js` | Bygget og testet — intet kalder den |

At funktionerne findes er ikke det samme som at de håndhæves. Indtil
Cloud Function'en skrives, er `.write: false` den eneste reelle spærring —
strengere end de tre tjek, men ikke granulær.

**En udløbet kompetence BLOKERER.** Den advarer ikke. Samme regel som i
reservationsmodellen: *"ingen konflikter fundet"* skal betyde noget. En
advarsel man kan klikke videre fra, er ikke en kontrol, og en chauffør uden
gyldigt ADR-bevis må ikke køre farligt gods, uanset hvor travlt disponenten
har.

`tjekKompetencer()` holder **mangler** og **udløbne** adskilt. *"Han har
aldrig haft C+E"* og *"hans C+E udløb i går"* kræver hver sin handling — et
andet køretøj mod en fornyelse — og en samlet liste ville skjule forskellen.

ADR-kravet kommer fra **lasten**, ikke fra bilen, og kan derfor ikke udledes
af enhederne alene. Det er grunden til at `kraevedeKompetencer()` tager både
`enheder` og `gods`.

**Ikke alle kompetencer kan blokere.** `KOMPETENCE` i `flaade.js` rummer også
typer der kun *registreres* — EU-chaufføruddannelse, kran og hejs,
førstehjælp. De står i samme katalog, fordi to vokabularer for samme begreb er
beslutning 11 og 14 om igen, men de optræder ikke i `ART_KRAV`, og
`kraevedeKompetencer()` udsender dem aldrig. Konsekvensen skal læses som den
er: **en udløbet førstehjælp blokerer ikke en disponering.** Det er ikke en
forglemmelse — kravet skal kunne udledes af enhederne plus godset, og der
findes ingen lastbil der gør førstehjælp til en betingelse for at køre. Skal
et af dem begynde at blokere, hører det i `ART_KRAV` eller i
`kraevedeKompetencer()`s gods-gren, ikke i en skærm. `BLOKERENDE_KOMPETENCER`
og `kanBlokere()` gør skellet forespørgbart, så en skærm kan skrive det til
brugeren frem for at lade ham gætte.

Kapacitet måles på `m3` og `kg` hver for sig, i samme enheder som
lagerreservationens `maengde` — så godset kan sammenlignes med både en hal og
et vogntog uden omregning. En trækker bærer næsten intet; lasten ligger på
traileren, så det er summen der tæller.

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

## Beslutning 19 — stamdata har ikke en division

**Division hører på tenanten, ikke på medarbejderen eller bilen.** Ingen
abonnent har både gods og bus; en busvognmand har kun ét sæt tal, så der var
aldrig noget at dele op.

En medarbejder oprettes **én gang** og virker i alle moduler tenanten har
adgang til. Hun er defineret ved sine **kompetencer**, ikke ved en afdeling.
Et køretøj er defineret ved sin **art** — en påhængsvogn eller en varevogn kan
tilhøre begge slags vognmænd, og det er præcis derfor feltet ikke sagde noget.

Feltet er **forbudt**, ikke valgfrit, på `personale/` og `koeretoejer/`. Et
felt der må stå der uden at betyde noget, bliver tastet — og derefter læst af
nogen. `.validate: false` gør fejlen til en afvisning frem for en vane.

**`faelles` bevares på kunder.** Dér betyder værdien noget andet: at kundens
forretning går på tværs. Kolding Kommune køber både skolebusser og
containerkørsel. Det er kundens forhold, ikke vores organisation.

### Hvad der fulgte med

- `kompetencer/` og `fravaer/` afviste allerede feltet, men med begrundelsen
  *"divisionen arves fra personen"*. Personen har den ikke længere, så
  begrundelsen er nu enklere: den findes ikke nogen steder på den akse.
- **`bemanding.kompetencerUdloeber` er ét tal**, ikke fem i gods og tre i bus.
  Summen er uændret — otte. Feltet står stadig under begge divisioner i `kpi/`,
  fordi noden er delt (beslutning 9), men med samme værdi.
- **`opgaver`, `indberetninger` og `etaper` kræver stadig division.** De er
  transaktioner. Men værdien kan ikke længere kopieres fra køretøjet, og
  skriveren skal sætte den selv. Det hører i den Cloud Function der endnu ikke
  er skrevet; indtil da er `etaper` alligevel `.write: false`.
- `.indexOn` mistede `division` på begge noder. Intet forespurgte på den.

### Det åbne spørgsmål

Holder præmissen — at ingen abonnent har både gods og bus — så er **hele
Gods/Bus-toggle'en** til diskussion, ikke kun de to felter. `kpi/` er delt på
division, shellen har en vælger, og elleve skærme filtrerer på den. Denne
beslutning rører kun stamdata. Om resten skal følge efter, er en beslutning
for sig.

## Beslutning 20 — sagsbaseret mail

**Nummeret i emnefeltet er hele integrationen.** En sag får et nummer fra
beslutning 8's counter, nummeret sættes i emnet, modtageren svarer normalt i
Outlook, `Re:` bevarer det, og svaret lægges på sagen. Værkstedet og
leverandøren installerer ingenting og gør ingenting anderledes.

Politikken ligger i `fleet/sager.js`. Filen importerer kun `booking-state.js`
og aldrig firebase — samme disciplin som `permissions.js` og
`audit-regler.js`, og af samme grund: den Cloud Function der modtager mail,
skal bruge **nøjagtig samme** regex og **nøjagtig samme** afsendervurdering som
skærmen. To definitioner ville betyde, at en besked kan se accepteret ud ét
sted og karantæneret et andet.

### Noder

```
tenants/<t>/sager/<sagId>                             general — se Noder ovenfor
tenants/<t>/sensitive/sager/<sagId>/beskeder/<id>     { ms, retning, afsender,
                                                        afsenderNavn, modtagere[],
                                                        emne, tekst, afsenderStatus,
                                                        dmarc, vedhaeftninger[] }
tenants/<t>/sensitive/sager/<sagId>/karantaene/<id>   samme + aarsag
tenants/<t>/sensitive/sager/<sagId>/aftaleforslag/<id>
                                                      { tilstand, fra, til, sted,
                                                        ressourceType, ressourceId,
                                                        udtrukketFra, udtrukketSaetning,
                                                        bekraeftetAf, bekraeftetMs }
tenants/<t>/countere/sagFlt/<år>                      FLT-serien
tenants/<t>/countere/sagFac/<år>                      FAC-serien
```

**Delingen er beslutning 17 anvendt på en ny node, ikke en ny idé.**
Brødteksten er fritekst fra internettet og kan indeholde hvad som helst —
navne, telefonnumre, og før eller siden en helbredsoplysning. Den kan ikke
ligge som barn af sagen, for `.read` kaskaderer, og flytter man `.read` ned på
`<sagId>/general`, kan man ikke længere forespørge på `sager` — og så findes
der ingen sagsliste. Som søskende koster det ét ekstra opslag på en
detaljeskærm og nul på en liste.

Læg mærke til hvad der er i general og hvad der ikke er: `harAftale`,
`aftaleTilstand` og `aftaleFraMs` er **struktur** og kan stå i en liste.
`udtrukketSaetning` er et citat fra en mail og ligger i `sensitive/`.

`parter[]` er **adgangslisten**, ikke kontaktinfo. Den står derfor på Oversigt
og ikke gemt i en opsætningsskærm: det er den der afgør hvad der lander på
tråden.

### Modtagevejen

Én adapter, én vej bygget:

```
indgaaendeMail(raw) → { envelopeAfsender, dmarc, emne, tekst, vedhaeftninger[] }
```

**Bygget: dedikeret adresse hos en mailtjeneste med webhook.** Én integration,
virker for alle tenants dag ét, testbar i DEV uden en kunde. Mailtjenesten
bliver underdatabehandler og skal i DPA og i EU.

**Tilvalg, ikke bygget: Microsoft Graph mod kundens eget Microsoft 365.**
Korrespondancen bliver i kundens egen postkasse, og der er ingen tredjepart på
indholdet. Til gengæld kræver det admin consent pr. kunde til en Entra-app,
scopet med en `ApplicationAccessPolicy` til den ene postkasse — beder man om
`Mail.Read` uden scope, beder man om læseadgang til hele virksomhedens mail.
Det er en IT-samtale, ikke en afkrydsning, og en tenant kan stå fast på en
person vi ikke kan nå. Se README for hele sammenligningen.

Adapteren findes, så den anden vej kan tilføjes uden at røre sagsmodellen.
**Byg ikke begge på én gang.**

### Indgangen er den eneste uautentificerede i platformen

Alt andet i FleetControl kommer fra en bruger med et claim. Det her kommer fra
internettet, og sagsnummeret er fortløbende og dermed gætbart.

```
sagsnummerFraEmne(emne)  → { nummer, art } | null    KUN emnefeltet
vurderAfsender({ envelopeAfsender, dmarc, parter, egneDomaener })
                         → { status, aarsag }        kendt | karantaene | afvist
```

**Kun emnefeltet, aldrig brødteksten.** En brødtekst bærer citerede tidligere
mails, og en af dem kan have et andet sagsnummer i sig. Læste vi den, kunne en
fremmed videresende en gammel tråd og få sin besked lagt på en sag han aldrig
har haft med at gøre. To *forskellige* numre i samme emne giver `null`.

**Envelope-afsenderen, aldrig `From:`.** `From:` er fritekst afsenderen
skriver selv.

**DMARC pass er nødvendigt, ikke tilstrækkeligt.** DMARC beviser at afsenderen
ejer det domæne han skriver fra — ikke at han er den rigtige part.
`mercedes-greve-service.dk` består DMARC og er stadig ikke
`mercedes-greve.dk`. Derfor er sidste led et opslag i sagens `parter[]`.

**Karantænen er ikke en del af tråden.** Ikke gråtonet, ikke sammenklappet —
eget afsnit med egen ramme. Renderes den inline, læser mennesket den og
handler på den, og så er karantænen dekoration. Frigivelse kræver
`sag.karantaeneFrigiv` og tilføjer adressen til **denne sags** parter alene.

**Vedhæftninger fejler lukket.** `maaHentes()` er sand kun ved `ren`. Er
scanneren nede, bliver status stående på `afventerScan`, og der renderes intet
downloadlink — ikke et gråt link, ikke et link med en advarsel, intet element.

Brødtekst renderes som **tekst**. Ingen `dangerouslySetInnerHTML`, ingen
fjernbilleder: et fjernbillede er en sporingspixel der fortæller afsenderen at
sagen blev åbnet.

### Aftale → reservation

En sætning i en mail kan blive en reservation. Den bliver et **forslag** først.

```
reservationFraAftale(sag, aftale) → { ressourceType, ressourceId, fra, til, kilde }
```

**Mailen er ikke en femte `kilde.type`.** Det man reserverer, er et
værkstedsbesøg, og reservationen får derfor `kilde.type: vaerksted` med
prioritet 40 — `facilitySag` og prioritet 20 på en FAC-sag. Fik den sin egen
lave prioritet, ville en bekræftet værkstedsaftale tabe til en booking, og en
bil på værksted kan ikke køre uanset hvad disponenten har lovet. Sporet
bevares med `kilde.viaSagId`, ikke ved at ændre `kilde.type`.

`reservationFraAftale()` kaster på alt der ikke er `tilstand: "aftalt"`.
Automatikken skriver aldrig selv — samme regel som `matchAabneEtaper()`.

**Datoen er et gæt.** "18/8" kan læses to veje, og "næste tirsdag" kan ingen
maskine læse med sikkerhed. Derfor bærer forslaget altid `udtrukketSaetning`,
og skærmen viser den ved siden af feltet. Tidspunktet er aldrig forudfyldt i
noget der kan bekræftes i ét klik.

### Retention

To grænser der ikke er den samme:

| | Hvor | Grænse |
|---|---|---|
| Auditposten om en besked | `audit/<t>/drift/…` | Følger `RETENTION_MAANEDER` |
| Tråden selv | `sensitive/sager/` | **Ikke afgjort** |
| Karantæne | `sensitive/sager/<id>/karantaene/` | 30 dage, **hård sletning** |

**`emne` må ikke på `LOGBARE_FELTER`.** Det er fritekst fra internettet, og
allowlisten i `audit-regler.js` findes netop for at holde fritekst ude af
loggen. Auditposten bærer `nummer`, `sagId`, `afsenderStatus` og `ms`.

Trådens egen grænse er samme åbne spørgsmål som audit-retention: en
værkstedssag knyttet til en faktura rører regnskabsgrundlaget, en sag der løb
ud i sandet er drift. Afgøres juridisk sammen med de øvrige tal.

Karantænen er den ene undtagelse fra "hardslet aldrig". Det er
uautentificeret input fra en fremmed, der er intet behandlingsgrundlag for at
gemme det, og det er ikke regnskabsdata.

### Status

Fase 0 er **visning**: `Sagsvisning.jsx` med fanerne Oversigt, Kommunikation,
Dokumenter, Aktiviteter, og en demo-tråd på Værkstedskalender. Komponenten
ligger i `fleet/` fordi Facility skal bruge den samme — forskellen på FLT og
FAC er præfiks, counter og hvad knappen hedder, og alt det står i `SAG_ART`.

Ikke bygget: modtagevej, parsing, afsendelse, scanning, Cloud Functions.
`sager/` findes ikke i `firebase.rules.json`, og derfor står `sag.laes`,
`sag.sensitiveLaes`, `sag.skriv`, `sag.karantaeneFrigiv` og
`sag.aftaleBekraeft` heller ikke i `permissions.js` endnu. Kataloget siger
selv, at man ikke tilføjer en permission uden et sted der spørger efter den.

`test/sager.test.mjs` kører politikken frem for at læse den — 39 tests, uden
emulator, men med i `npm test` og dermed i pre-commit-hooken.