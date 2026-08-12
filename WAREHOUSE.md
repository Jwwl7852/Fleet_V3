# Warehouse / WMS — plan

Elleve designplancher: **Overblik, Lokationer & lagerstruktur, Varemodtagelse
& putaway, Pluk/pak & afsendelse, Sporbarhed & optælling, Mobil scanner-app
(to plancher), Mål på håndtering, Volumenkalkulator, Rater & afregning.**

Det er ikke et modul. Det er **et system på størrelse med resten af
platformen** — og det skal bygges i etaper, med de samme spørgsmål afgjort
først som ved Turtlebooking.

**Denne fil er planen, ikke koden.** CLAUDE.md: *analyse før kode.*

---

## 1. Hvad plancherne viser

| Flade | Hvad |
|---|---|
| Overblik | Aktive lokationer, varelinjer, åbne modtagelser, opgavekø, lagerkort med belægning |
| Lokationer & lagerstruktur | Zoner → række → reol → niveau → plads, belægning, temperatur, karantæne |
| Varemodtagelse & putaway | PO'er, dokstatus, kvalitetskontrol, karantæne, batch/serienr., putaway-forslag |
| Pluk, pak & afsendelse | Wave-pluk, plukrute, konsolidering, pakkestationer, fragtlabels, POD |
| Sporbarhed & optælling | Bevægelseshistorik, audit log, cycle count, batch-opslag, compliance |
| Mobil scanner-app | Modtagelse, flyt, pluk, pak, optælling, skade — offline-kø, foto, signatur |
| Mål på håndtering | Ind/ud, paller, håndteringer, opholdstid, aktiviteter omsat til **afregningsværdi** |
| Volumenkalkulator | m², m³, paller → månedspris. En tilbudsberegner |
| Rater & afregning | Rater pr. ydelse (håndtering, modtagelse, pluk, pak, lager pr. palle/m²/m³ pr. dag), kundeaftaler, brancheprofiler, tillæg |

---

## 2. ⚠ Fem navne er allerede taget — og det er værre end ved Turtlebooking

Det er ikke pedanteri. Det er den fejl der har kostet mest i dette repo, og
den er dukket op **seks gange**. Her er den seks nye gange på én gang.

| Planchen siger | FleetControl har allerede | Hvad det er dér |
|---|---|---|
| **Lokationer** (reol · niveau · plads) | `facility/lokationer` | **Bygninger og zoner** i ejendomsdrift |
| **Lager** | `lagre` | **Reservedelslageret** under Indkøb — med `satser` OG `haandteringSatser` |
| **Ordrer** (SO-10458, pluk) | `bookinger` | En **transportopgave** med etaper og køretøj (beslutning 16, 21) |
| **Rater** | `satser` | Kundepriser med `gyldigFra`, som **aldrig overskrives** |
| **Afregning** | `grundlag.js` + `fakturaer` | **Fakturagrundlaget**, med `erGaeldende()` og ét godkendelsesflow (beslutning 12) |
| **Modtagelse** | `indkoeb` | Købsfakturaer og varelinjer med leverandør og lokation |

⚠ Og en syvende, som er den lumske: **`reolpladser` er taget af
Turtlebooking.** Hal · reol · fag · hylde · plads. WMS'ens lokation er
zone · række · reol · niveau · plads. **Det er praktisk taget den samme ting**,
og hvis de bliver to noder, har vi to reolsystemer i samme installation, hvor
den ene ikke kan se den andens pladser.

**Det er den vigtigste enkeltbeslutning i hele modulet**, og den står i punkt
3.3 nedenfor.

---

## 3. Det der skal afgøres FØR der skrives kode

### ✅ 3.1 BESVARET: det er 3PL — kundens varer

Plancherne siger to forskellige ting, og de peger på to forskellige
produkter:

- **Rater & afregning, Volumenkalkulator og "Aktiviteter omsat til
  afregningsværdi"** → det er **3PL**: vognmanden opbevarer **kundens** varer
  og fakturerer for håndtering ind, opbevaring og håndtering ud.
- **"Forbrug pr. afdeling", "Spor materialeforbrug på opgaver og biler",
  "Facility: styr forbrugsvarer", "Produktion: råvarer"** → det er **eget
  lager**: virksomhedens egne varer, hvor forbruget er en **omkostning** der
  skal konteres, ikke en indtægt der skal faktureres.

De to har **ikke** samme datamodel. I 3PL bærer hver vare en `kundeId`, og
hver bevægelse er en fakturerbar hændelse. På eget lager er varen vores egen,
og bevægelsen er et forbrug der skal på en bil, en opgave eller en afdeling.

Bygger man det ene og opdager man skulle have haft det andet, er det en
migrering af alt.

**Svaret er 3PL.** Hver vare bærer en `kundeId`, og hver bevægelse er en
fakturerbar hændelse der ender på kundens fakturagrundlag.

⚠ **To konsekvenser der skal stå her, fordi de ikke er til at se bagefter:**

1. **`kundeId` står på BEVÆGELSEN, ikke kun på varen.** Det ligner en kopi, og
   det er det ikke: bevægelsen er et *historisk faktum* — hvem varen tilhørte
   **da den blev flyttet**. Skifter en vare ejer, må sidste kvartals
   fakturagrundlag ikke ændre sig. Samme grund som at satsen skrives med på en
   grundlagslinje frem for at blive slået op igen bagefter.
2. **Indkøbs `lagre` består uændret.** Det er vores EGNE reservedele, hvor
   forbruget er en omkostning på en bil. Warehouse er kundens gods, hvor
   bevægelsen er en indtægt. To forskellige ting — og derfor to noder, ikke én
   med et flag.

### ⚠ 3.2 Afregningen må ikke blive et fjerde prissystem

Platformen har allerede **tre** steder hvor priser bor:

1. `satser` — kundepriser, ny post pr. `gyldigFra`, overskrives aldrig
2. `lagre/<id>/satser` og `haandteringSatser` — allerede sat af til
   reservedele og **håndtering**
3. `udbyder/prisliste` — abonnementsprisen for platformen selv

Planchens "Rater & afregning" er en fjerde. **Det skal den ikke være.** WMS'ens
rater hører i `satser` som en gruppe med `gyldigFra`, og resultatet skal ind i
det **eksisterende** `fakturagrundlag` via `grundlag.js` — med `erGaeldende()`
og `summer()`, øre som integer, moms der nægtes hvis satsen mangler.

⚠ **Og godkendelsen sker ét sted.** Beslutning 12: der er ét
fakturagodkendelsesflow, og det ligger i Indkøb → Fakturaer. En "Afregn"-knap
i WMS der godkender noget, er beslutning 12 om igen.

*Det her afgør jeg selv, medmindre du siger noget andet — det følger af
beslutninger der allerede er truffet.*

### ✅ 3.3 BESVARET: én node, udvidet

`reolpladser` har i dag `hal · reol · fag · hylde · plads` og `pladsnavn()`
der udleder navnet. WMS'en vil have `zone · række · reol · niveau · plads`
plus **type** (hylde/gulvplads), **belægning**, **temperatur** og **status**
(aktiv/karantæne).

**`reolpladser` udvides og deles.** Zone, type, temperatur og status kommer
til som **valgfrie** felter, så Turtlebooking ikke mærker det. Én reolstruktur
i huset: transportkasser og kundens gods står på samme slags plads, og den
vognmand der har begge moduler, vedligeholder sit lager ét sted.

⚠ **Det gør `reolpladser` til den første node der hører til TO moduler.** To
ting følger, og begge rører noget der allerede virker:

- **Modulklausulen skal acceptere begge.** `turtlebooking === true ||
  warehouse === true`. `NODE_MODUL` peger i dag på præcis ét modul pr. node,
  og `rules.moduler.test.mjs` håndhæver det i **begge** retninger — den skal
  kunne bære en liste.
- **Permissionen kan ikke blive ved med at være `kasser.skriv`.** En node to
  moduler deler, kan ikke gates af det ene moduls rettighed: en
  WMS-medarbejder uden Turtlebooking ville ikke kunne oprette en hylde. Den
  får sin egen — `reolpladser.skriv`.

**Etape 3 er inde.** Warehouse står nu i sidebaren med **Varer** og
**Lokationer**, og `UDEN_SKAERM` er tom igen.

⚠ **Delingen af `reolpladser` havde en fælde der allerede var indført.**
Turtlebookings formular sender kun sine fem felter, og `gem()` skrev med
`.set()`. En lagermedarbejder der rettede et hyldenummer, ville have
nulstillet temperaturen og taget hylden ud af karantæne — i tavshed.
`skriv.js` har derfor fået `flet: true`, som bruger `update()`, og begge
skærme bruger den. Der er både en adfærdsprøve (felterne overlever) og en
kodeprøve (skærmen kalder den vej) — den første kan ikke se om nogen fjerner
`flet` igen.

⚠ **Demo-sættet flyttede til `demo-lager.js`.** Et datasæt for en delt node
hører ikke i det ene moduls fil; ellers laver den anden skærm sin egen kopi.

### ⚠ 3.4 Scanner-appen er ikke en skærm

Offline-kø, kamera, stregkodelæser, signatur, badge-login. Det er en
**selvstændig applikation**, ikke en rute i denne React-shell — og
offline-køen støder direkte ind i to ting der er besluttet:

- **`skriv.js` er den ene vej ind.** En offline-kø er pr. definition en anden.
- **En afvist skrivning er ikke en netværksfejl.** En kø der synkroniserer
  "når du er online igen", skal kunne skelne — ellers ligger der en
  `permission-denied` i køen og prøver igen i timevis.

### ⚠ 3.5 Multi-site står i topbaren på plancherne

*"Hovedlager – Aarhus"* med en vælger. Shellen ejer tenant- og
periodevælgeren; en lagervælger ville være den tredje.

⚠ **RETTET I ETAPE 2 — DER KOM INTET `lagerId`.** Planen sagde først at hver
post skulle bære et, for at slippe for en migrering senere. Det viste sig at
være det forkerte svar: **lageret er `hal` på reolpladsen**, og listen af
lagre udledes af pladserne — præcis som `haller()` allerede gør i
`turtlebooking.js`.

Et `lagerId` ved siden af ville have været et katalog mere at holde ved lige,
og det ville have kunnet blive uenigt med `hal`. Og bevægelsen behøver det
ikke: den peger på en plads, og pladsen ved hvor den står. **Et felt der kan
udledes, skal ikke gemmes** — det er `bemanding.ledig`-reglen, og den gælder
også når det er bekvemt at bryde den.

### ⚠ 3.6 Roller og permissions

Beslutning 31: rollerne er faste. `lagermedarbejder` findes allerede (fra
Turtlebooking) og er den oplagte til modtagelse, pluk og flytning. WMS'en
har brug for nye permissions — `wms.laes`, `wms.skriv`, `wms.rater`,
`wms.optaelling` — men **ikke** en ny rolleverden. Planchernes "Warehouse
Manager" og "Driftsleder" er ikke roller; de er admin med et andet visitkort.

### ⚠ 3.7 Bevægelsen er kernen — ikke lagerbeholdningen

Alle ni flader hænger på **én** ting: en bevægelse (modtag, putaway, flyt,
pluk, pak, afsend, optæl, retur). Beholdningen pr. lokation er **udledt** af
bevægelserne, ikke et gemt tal der opdateres.

Gemmes beholdningen som et tal der tælles op og ned, driver den fra
bevægelserne — og det er `bemanding.ledig` igen, denne gang med lagerværdi
på. Men et helt udledt tal er langsomt på hundredtusind bevægelser.

Svaret er formentlig **begge dele med en tvungen afstemning**: et gemt
saldotal som *kun* en Cloud Function må skrive, sammen med bevægelsen, i én
atomisk skrivning — præcis som `kasseudlaanskriv` skriver udlån og kasse
sammen. Og cycle count er så ikke pynt, men den kontrol der beviser at de to
stemmer.

---

## 4. Etaper

| # | Hvad | Værdi alene | Status |
|---|---|---|---|
| 1 | **Modulet findes**: `warehouse` i katalog, regler, prisliste, nav | Kan sælges og krydses af | ✅ |
| 2 | **Datamodel**: varer, lokationer, bevægelser, beholdning + regler + prøver | Grundlaget kan ikke laves om bagefter | ✅ |
| 3 | **Varekartotek og lokationer** — stamdata, zoner, belægning | Lageret kan registreres | ✅ |
| 4 | **Bevægelsen**: modtag → putaway → flyt, som Cloud Function | Den operationelle kerne. Beholdningen bliver rigtig | |
| 5 | **Pluk, pak, afsend** — pluklister, konsolidering, afsendelse | Udgående flow | |
| 6 | **Optælling (cycle count)** og afvigelser | Beviset for at beholdningen passer | |
| 7 | **Rater** i `satser` + **afregning** ind i `fakturagrundlag` | Der kan sendes en regning | |
| 8 | **Volumenkalkulator** som tilbudsværktøj | Salg | |
| 9 | **Sporbarhed**: batch, serienr., historik, compliance-udtræk | Dokumentation | |
| 10 | **Scanner-app** — egen applikation | Gulvet | |

Etape 1–4 er fundamentet og kan ikke deles op mindre. Etape 7 kan ikke bygges
før 4, fordi der ikke er noget at afregne før bevægelserne findes.

---

## 5. Størrelsen, ærligt

Turtlebooking var seks etaper og blev bygget på en dag, fordi datamodellen var
lille: en kasse, en plads, et udlån.

Det her er **fem til ti gange så stort**. Alene etape 2–4 er sammenlignelige
med Booking + Flåde tilsammen: et varekartotek med batch og serienummer, en
lokationsstruktur med belægning, en bevægelsesmodel der skal være atomisk og
afstemt, og en Cloud Function for hver hændelsestype.

Det bliver ikke færdigt i én omgang, og et halvt bygget WMS er værre end
intet: en beholdning der er forkert, er værre end ingen beholdning, fordi
nogen disponerer efter den.
