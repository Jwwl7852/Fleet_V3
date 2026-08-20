# Warehouse / WMS — plan

Elleve designplancher: **Overblik, Lokationer & lagerstruktur, Varemodtagelse
& putaway, Pluk/pak & afsendelse, Sporbarhed & optælling, Mobil scanner-app
(to plancher), Mål på håndtering, Volumenkalkulator, Rater & afregning.**

Det er ikke et modul. Det er **et system på størrelse med resten af
platformen** — og det skal bygges i etaper, med de samme spørgsmål afgjort
først som ved Unitbooking.

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

⚠ **Tre plancher mere kom til bagefter**, og de står ikke i tabellen ovenfor,
fordi de ikke er en niende flade — de tilføjer et **objekt** der går på tværs
af dem alle: *Transit & placering*, *Transportlabels* og *Carrier-overblik*.
Se punkt 6.

---

## 2. ⚠ Fem navne er allerede taget — og det er værre end ved Unitbooking

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

⚠ Og en **ottende** kom med de nye plancher: **`carrier` er `kasse`.**
Unitbooking har `kasser` — en fysisk beholder med type, status og en
reolplads. Planchens carrier er den samme ting med indhold og ejerforhold.
Svaret blev her **to noder** og ikke én, og prisen for det står i punkt 6.2.

⚠ Og en syvende, som er den lumske: **`reolpladser` er taget af
Unitbooking.** Hal · reol · fag · hylde · plads. WMS'ens lokation er
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

### ✅ 3.2 BESVARET: kundens priser sættes i Kunder & Priser

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

**Svaret er:** der er to slags priser, og de må ikke blandes sammen.

| Hvem sætter den | Hvor | Hvad den er |
|---|---|---|
| **Vi som ejere** | `udbyder/prisliste` | Hvad modulerne koster i abonnement |
| **Vognmanden selv** | **Kunder & Priser, på kunden** | Hvad HANS kunde skal betale |

⚠ **Plancherne har en selvstændig "Rater & afregning"-skærm. Den bygges IKKE.**
Den ville være et andet sted at sætte den samme slags pris, og så skulle en
vognmand vedligeholde sine priser to steder. Alle kundens priser — også
lagerydelserne — defineres på kunden i Kunder & Priser.

⚠ **OG SATSOPSLAGET SKREV JEG AF.** `satsPaa()` i `pricing.js` er husets ene
funktion til *"hvilken sats gjaldt på det her tidspunkt"*, og den bærer
allerede beslutning 7 om at satser aldrig overskrives. Jeg havde bygget den
igen som `gaeldendeSats()` i `warehouse.js`. Den er slettet:
`afregningslinjer()` tager nu opslaget som en **parameter**, fordi filen er
importfri og ikke kan importere `pricing.js`.

⚠ **Og `pricing.js` kan i forvejen lagerdøgn.** `METODER.prLagerdoegn`,
`lagerdoegn()` (påbegyndte døgn, rundet **op**) og `lagerUd()` findes og er
prøvet — med en tre-trins rangorden for hvornår godset forlader lageret.
Opbevaringsafregningen skal bygge på dem, ikke på noget nyt.

### ✅ 3.3 BESVARET: én node, udvidet

`reolpladser` har i dag `hal · reol · fag · hylde · plads` og `pladsnavn()`
der udleder navnet. WMS'en vil have `zone · række · reol · niveau · plads`
plus **type** (hylde/gulvplads), **belægning**, **temperatur** og **status**
(aktiv/karantæne).

**`reolpladser` udvides og deles.** Zone, type, temperatur og status kommer
til som **valgfrie** felter, så Unitbooking ikke mærker det. Én reolstruktur
i huset: transportkasser og kundens gods står på samme slags plads, og den
vognmand der har begge moduler, vedligeholder sit lager ét sted.

⚠ **Det gør `reolpladser` til den første node der hører til TO moduler.** To
ting følger, og begge rører noget der allerede virker:

- **Modulklausulen skal acceptere begge.** `unitbooking === true ||
  warehouse === true`. `NODE_MODUL` peger i dag på præcis ét modul pr. node,
  og `rules.moduler.test.mjs` håndhæver det i **begge** retninger — den skal
  kunne bære en liste.
- **Permissionen kan ikke blive ved med at være `kasser.skriv`.** En node to
  moduler deler, kan ikke gates af det ene moduls rettighed: en
  WMS-medarbejder uden Unitbooking ville ikke kunne oprette en hylde. Den
  får sin egen — `reolpladser.skriv`.

**Etape 3 er inde.** Warehouse står nu i sidebaren med **Varer** og
**Lokationer**, og `UDEN_SKAERM` er tom igen.

⚠ **Delingen af `reolpladser` havde en fælde der allerede var indført.**
Unitbookings formular sender kun sine fem felter, og `gem()` skrev med
`.set()`. En lagermedarbejder der rettede et hyldenummer, ville have
nulstillet temperaturen og taget hylden ud af karantæne — i tavshed.
`skriv.js` har derfor fået `flet: true`, som bruger `update()`, og begge
skærme bruger den. Der er både en adfærdsprøve (felterne overlever) og en
kodeprøve (skærmen kalder den vej) — den første kan ikke se om nogen fjerner
`flet` igen.

⚠ **Demo-sættet flyttede til `demo-lager.js`.** Et datasæt for en delt node
hører ikke i det ene moduls fil; ellers laver den anden skærm sin egen kopi.

**Etape 4 er inde.** `bevaegelseskriv` er udrullet, og skærmen **Bevægelser**
kan modtage, sætte på plads, flytte, plukke, afsende, returnere, optælle og
justere.

⚠ **Atomiciteten er delvis, og det står skrevet.** Bevægelsen og begge
saldoændringer lander sammen eller slet ikke — det er ÉN multi-path `update()`
med `ServerValue.increment()`. To samtidige plukninger af 2 og 3 giver −5,
aldrig −2 eller −3.

Men skrivningen kan ikke afvise sig selv: dækningen læses FØR, og i det vindue
— millisekunder — kan to plukninger begge se dækning og tilsammen tage hylden i
minus. Det kan ikke lukkes med en transaktion, for en RTDB-transaktion virker
på ÉN ref, og en flytning rører to. En transaktion på hele `beholdning` ville
låse hele lageret ved hver scanning.

Valget er derfor: **garantér det der ikke må gå galt** (ingen saldo uden en
bevægelse bag sig), og gør **det der kan gå galt synligt**. Funktionen læser
saldoerne igen bagefter, og går én i minus, skrives der en auditpost — og
skærmen har et nøgletal for det. En negativ saldo er et lager der skal tælles,
ikke et tal der skal rettes. Det er præcis hvad cycle count i etape 6 er til
for.

**Etape 5 er inde.** Skærmen **Pluk & afsend** kan oprette plukordrer, frigive
dem, registrere pluk mod dem og afsende.

⚠ **Noden hedder `plukordrer`, ikke `ordrer`.** `bookinger` er allerede en
ordre i dette hus — en transportopgave med etaper, køretøj og chauffør. En
plukordre siger hvad der skal UD AF LAGERET, ikke hvem der kører det hvorhen.
En 3PL der både opbevarer og kører, har begge dele.

⚠ **Fremdriften er udledt af bevægelserne.** Der står ikke et `plukketAntal`
på linjen; det ville drive ved den første pluk der ramte den ene og ikke den
anden, og så ville ordren se færdig ud mens varerne stod på hylden.

⚠ **Et pluk FLYTTER, det fjerner ikke.** Varen går fra hylden til ordrens
afsendelsesplads, og først afsendelsen tager den ud af huset. Var pluk en ren
fjernelse, ville der være et hul mellem hylden og bilen hvor godset ikke stod
nogen steder — og det er dér det bliver væk. Derfor er afsendelsespladsen et
**påkrævet** felt på ordren.

⚠ **`afsendt` kan ikke sættes af en klient.** Reglerne tillader kun
`kladde`, `frigivet` og `annulleret`; `plukordreafsend` skriver
afsendelsesbevægelserne og tilstanden i én skrivning. Ellers kunne en ordre
meldes afsendt uden at en palle var rørt, mens lageret stadig stod med godset.
Samme greb som kassens status i Unitbooking.

Og den afsender **det der er plukket**, ikke det der er bestilt: er der plukket
8 af 10, går de 8 ud. Alternativet ville være at et lager med 8 på hylden
skulle vente på 2 der måske aldrig kommer.

**Etape 6 er inde.** Skærmen **Optælling** viser hvad der skal tælles,
registrerer tællingen, og opgør afvigelserne pr. årsag.

⚠ **Forventningen læses af SERVEREN, ikke af klienten.** Det er hele grunden
til at optællingen er en funktion. Sendte skærmen `forventet` med, ville
afvigelsen være forskellen mellem hvad brugeren TROEDE der stod og hvad han
talte — og så måler den ingenting. Skærmen viser derfor heller ikke det
forventede tal, før der er talt: står svaret på skærmen, tæller man efter det.

⚠ **En afvigelse skal have en årsag, og årsagen er en allowliste.** Fritekst
kan ikke summeres: "svind", "Svind?" og "vist nok stjålet" ville blive tre
kategorier af det samme problem. `ukendt` står med vilje på listen — tvinges
folk til at vælge en de ikke kender, vælger de en tilfældig.

⚠ **Men en stor afvigelse BLOKERER ikke.** Krævede vi godkendelse over en
grænse, ville den der finder det største hul, være den der ikke kan lukke sin
optælling — og så bliver der talt mindre, ikke mere. Hylden er sandheden;
rettelsen sker med det samme, og afvigelsen står som sin egen post der ikke
kan slettes: `optaellinger` er `.write: false` for enhver klient.

⚠ **Lagernøjagtigheden siger "for lidt grundlag" under ti optællinger.** To og
to hundrede ser ens ud som en procent. Samme regel som `MINDSTE_GRUNDLAG`.

Og den negative saldo fra etape 4 har nu et sted at gå hen: den er **altid**
forfalden til optælling, uanset hvornår der sidst blev talt.

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
`unitbooking.js`.

Et `lagerId` ved siden af ville have været et katalog mere at holde ved lige,
og det ville have kunnet blive uenigt med `hal`. Og bevægelsen behøver det
ikke: den peger på en plads, og pladsen ved hvor den står. **Et felt der kan
udledes, skal ikke gemmes** — det er `bemanding.ledig`-reglen, og den gælder
også når det er bekvemt at bryde den.

### ⚠ 3.6 Roller og permissions

Beslutning 31: rollerne er faste. `lagermedarbejder` findes allerede (fra
Unitbooking) og er den oplagte til modtagelse, pluk og flytning. WMS'en
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
| 4 | **Bevægelsen**: modtag → putaway → flyt, som Cloud Function | Den operationelle kerne. Beholdningen bliver rigtig | ✅ |
| 5 | **Pluk, pak, afsend** — plukordrer, fremdrift, afsendelse | Udgående flow | ✅ |
| 6 | **Optælling (cycle count)** og afvigelser | Beviset for at beholdningen passer | ✅ |
| 7 | **Rater** i `satser` + **afregning** ind i `fakturagrundlag` | Der kan sendes en regning | ✅ PRISER.md etape 4, 6 og 7. Momssatsen pr. linje mangler stadig — se punkt 8 |
| 8 | **Volumenkalkulator** som tilbudsværktøj | Salg | ✅ Se punkt 10. Beregner en pris; opretter ikke et tilbud — nodeformen er ikke besluttet |
| 9 | **Sporbarhed**: batch, serienr., historik, compliance-udtræk | Dokumentation | ✅ |
| 10 | **Scanner-app** — egen applikation | Gulvet | |

Etape 1–4 er fundamentet og kan ikke deles op mindre. Etape 7 kan ikke bygges
før 4, fordi der ikke er noget at afregne før bevægelserne findes.

⚠ **Der er fem etaper mere — 11 til 15 — og de står i punkt 6.7.** De kom med
carrieren, og de er ikke en fortsættelse af rækken her: etape 12 flytter
beholdningens nøgle **under** etape 4, 5 og 6.

---

## 5. Størrelsen, ærligt

Unitbooking var seks etaper og blev bygget på en dag, fordi datamodellen var
lille: en kasse, en plads, et udlån.

Det her er **fem til ti gange så stort**. Alene etape 2–4 er sammenlignelige
med Booking + Flåde tilsammen: et varekartotek med batch og serienummer, en
lokationsstruktur med belægning, en bevægelsesmodel der skal være atomisk og
afstemt, og en Cloud Function for hver hændelsestype.

Det bliver ikke færdigt i én omgang, og et halvt bygget WMS er værre end
intet: en beholdning der er forkert, er værre end ingen beholdning, fordi
nogen disponerer efter den.

---

## 6. Carrieren — de tre plancher der kom til

Tre plancher mere: **Transit & placering**, **Transportlabels** og
**Carrier-overblik**. Den sidste er den med de fem KPI-kort øverst.

⚠ **Ingen af dem er "Overblik" fra punkt 1.** Den flade viser aktive
lokationer, varelinjer, åbne modtagelser og opgavekø. Carrier-overblik viser
noget andet: **beholdere**. Det er ikke den samme skærm med et andet udseende,
og der findes i dag hverken en rute, et menupunkt eller en fil til nogen af
dem — `/warehouse` tegner **Varer**.

De tre hænger sammen om ét nyt objekt: **carrieren**. En beholder der rummer
flere varer, er egen eller engangs, står enten på en lokation eller er knyttet
til en transport, kan tømmes delvist og bærer sin egen historik.

### 6.1 Hvad de tre viser

| Planche | Hvad |
|---|---|
| **Transit & placering** | Fire trin: ankommet fra transport → scan carrier → vælg eller scan lokation → carrier placeret. Systemet **foreslår** en ledig lokation, eller man vælger kundens faste område. Lageroversigt med ledig/optaget/kundezone/kundeområde/transitområde |
| **Transportlabels** | Tre transporttyper med hver sin label: **Direkte A → B**, **Via transit → destination**, **Storage via transit**. Labelen bærer booking-id, carrier-id, kunde, fra/transit/slutmål, lokation efter transit og en stregkode `BK-2026-0513-C-000245` |
| **Carrier-overblik** | Fem nøgletal (aktive, i transit, engangs, delvist tømt, uden lokation), filtre på lokation/transport/status, tabel med carrier-id, type, ejerforhold, lokation, indhold, status, tilknyttet transport og seneste bevægelse — plus en lageroversigt pr. zone |

### ✅ 6.2 BESVARET: carrieren er sin egen node

⚠ **Det er `kasse` én gang til.** Unitbooking har `kasser` med id
(`MDT-101`), type, status, hjemplads og nuværende plads. Planchen har
`CRR-100245`, type *Pallekasse 1200×800×950*, ejerforhold, lokation
*Zone A · A-01-02* og status. Fysisk er det den samme ting: en beholder der
står på en reolplads.

**Svaret blev alligevel to noder** — `kasser` og `carriers` — og modsat
`reolpladser` i punkt 3.3, hvor svaret blev én udvidet node. Begrundelsen er
at de to bærer hver sin **forretning**: kassen udlejes pr. sag og har sin egen
tilstandsmaskine med klargøring og returnering (beslutning 37), mens
carrieren bærer **kundens gods** og har ejerforhold og indhold. Én node ville
have båret to tilstandsmaskiner og to formål, og så afgør et felt hvilken
halvdel af reglerne der gælder.

⚠ **Prisen skal betales i etape 11, ikke opdages i etape 13.** Begge noder
står på **de samme** `reolpladser`. Spørgsmålet *"er hylden optaget?"* har fra
nu af to kilder, og det skal besvares **ét sted** — én funktion der læser
begge. Gør den det ikke, ser en hylde ledig ud i Unitbooking og optaget ud i
Warehouse, og de to skærme har hver sin sandhed om samme fysiske hylde. Det er
divisionsfilteret der stod to steder, og det er `bemanding.ledig` — en
kendsgerning gemt to steder driver.

⚠ **Og permissionen kan ikke hedde `kasser.skriv`.** Carrieren får sin egen,
af samme grund som `reolpladser.skriv` fik sin i punkt 3.3: en
WMS-medarbejder uden Unitbooking skal kunne oprette en carrier.

### ✅ 6.3 BESVARET: beholdningen flytter til carrier-niveau

```
I DAG:  beholdning/<pladsId>_<vareId>_<batch>
EFTER:  beholdning/<carrierId>_<vareId>_<batch>
        carriers/<carrierId>.pladsId → hvor beholderen står
```

Planchen lover to ting der ikke kan holdes med nøglen på pladsen: **"flyt
carrieren, og indholdet følger med"** og **"delvis tømning uden at miste
indhold"**. Med beholdningen på pladsen ville en flytning være N bevægelser
der skal lykkes sammen — og atomiciteten er allerede kun **delvis** (se etape
4). Med nøglen på carrieren rører en flytning ét felt: `pladsId`.

⚠ **Det er en migrering af noget der virker.** `beholdningsNoegle()`,
`virkningPaaBeholdning()`, `valideBevaegelse()`, `beholdningPaaPlads()`,
`plukketPrVare()` og optællingen hænger alle på pladsnøglen i dag, og
prøverne prøver den form. Flyttes nøglen uden at prøverne følger med, prøver
de en form der ikke længere findes — samme fælde som etape 5 i PRISER.md.

### ✅ BESVARET: alt gods ligger i en carrier

*Kan der ligge gods direkte på en hylde uden en carrier?* **Nej.** En palle
er også en carrier, og `reolpladser` bærer aldrig beholdning selv. To nøgler
ville have været to modeller, og hver eneste funktion — nøglen, bevægelsen,
plukket, optællingen, belægningen — skulle kende begge.

Prisen er at hver modtagelse skal navngive en beholder. Det er sådan et WMS
sætter en pallelabel på: beholderen ER stedet, og hylden er dens adresse.

**Etape 12 er inde.** `beholdning/<carrierId>__<vareId>__<batch>`, og
`carriers/<id>.pladsId` siger hvor det står.

⚠ **`putaway` SKIFTEDE BETYDNING, og det er den ene ting man skal vide.**
Før var den en beholdningsbevægelse fra modtagepladsen til lagerpladsen. Nu
flytter den **beholderen** og rører ikke ét eneste beholdningstal — den hedder
*Placering* i skærmen. Til gengæld er `flyt` blevet omstuvning: gods fra én
beholder til en anden. En bevægelse har derfor to former, og
`valideBevaegelse()` deler sig efter arten: en placering har hverken vare
eller antal, fordi godset ikke skifter mængde af at blive båret et andet sted
hen.

⚠ **En flytning er nu ÉT felt.** Før var det N saldoændringer der skulle
lykkes sammen, hvor atomiciteten kun er delvis (etape 4). Det var hele
argumentet for at flytte nøglen.

⚠ **Karantænen sidder på hylden og skulle følge med et led ud.** Godset står i
en beholder, beholderen står på en plads — slås spærringen ikke op gennem
carrieren, kan den omgås ved at plukke fra beholderen frem for fra hylden. Det
gælder både i skærmen, i plukpanelet og i `bevaegelseskriv`.

⚠ **En probe mod den udrullede base fandt en placering med et `antal` der gik
igennem.** Funktionen læste feltet forbi. Der landede ingen forkerte data —
serveren bygger selv posten — men kalderen fik at vide at det lykkedes og
troede dermed at tallet betød noget. Et felt der tages imod og ignoreres, er
værre end et der afvises. Prøverne kunne ikke se det: de prøver
`validePlacering()`, og fejlen lå i hvad funktionen sendte ind i den.

### ⚠ 6.4 Fire ting på planchen der ikke er felter endnu

**"Delvist tømt"** kræver et udgangspunkt: delvist i forhold til *hvad?*
Gemmes tilstanden som et felt, driver den fra beholdningen — `bemanding.ledig`
igen. Udledes den, skal der findes et referencetal (det oprindelige indhold),
og det tal findes ikke i dag. Åbent.

**"Ingen lokation"** — 11 carriers er scannet, men ikke placeret. Det er en
rigtig tilstand, ikke en fejl, og den bør være **fraværet af `pladsId`** frem
for en status ved siden af. To kilder til samme kendsgerning er den fejl der
bliver ved med at koste her.

**Engangs-carriers forbruges.** De hardslettes ikke — bevægelseshistorikken
hænger på dem, og et id der forsvinder, gør historikken uforklarlig. De tages
ud af drift med en status, som alt andet.

**✅ BESVARET: `TRP-2024-0513` mod `BK-2026-0513`.** Planchen brugte to
id-serier: en "tilknyttet transport" i carrier-tabellen og et "booking-id" på
labelen. Spørgsmålet var, om en transport er en **etape** (beslutning 16) eller
et nyt objekt — og det var det tungeste af de fire.

**Svaret er etapen (beslutning 46).** Alt en transport har brug for, står der
allerede: `fraSted`, `tilSted`, `etaMs`, `koeretoejIder`, `bookingId`. Et nyt
objekt ved siden af ville være DE-QR 777 mod DE-KL 404 for tredje gang.

Følgen er, at feltet hed forkert: `carriers.transportId` pegede på ingenting og
stod uden fremmednøgle, netop fordi valget var åbent. Det hedder nu **`etapeId`**
og har eksistenskontrol mod `etaper`, så planchens `TRP-` ikke længere kan
skrives. ⚠ Omdøbningen blev **målt** i den udrullede DEV-base før den blev lavet
— 7 beholdere, én bar feltet, og det var den seedede demo-række. Efter den
første kunde havde den ikke været gratis.

### ⚠ 6.5 De fem nøgletal har ikke noget at læse

Der er ikke ét warehouse-felt i `demo-kpi.js` i dag. Kortene kan heller ikke
regnes i skærmen: tabellen viser **6 af 248** carriers, så tallene er ikke
afledt af data skærmen har — undtagelsen i CLAUDE.md gælder ikke her.

Felterne skal defineres i `demo-kpi.js` først: aktive carriers, i transit,
engangs, delvist tømt, uden lokation.

⚠ **Og kortene viser "↑ 12 % siden i går".** Det kræver gårsdagens tal, ikke
bare dagens. Enten et gemt delta eller en gemt serie — men det må ikke blive
en beregning ud af rådata i skærmen, og det må ikke blive et hardkodet tal
fordi feltet mangler.

### ⚠ 6.6 Transitzonen er et sted, men ikke en hylde

Planchen placerer carriers på *Modtagelse · Indgang 1*, *TRANSIT*,
*Kundezone KZ-OT-01* og *Kundeområde KB-01-03*. `reolpladser` har `type`
(hylde/gulvplads) fra punkt 3.3, men de her er **områder**, ikke pladser — og
et kundeområde er reserveret til én kunde, hvilket ingen plads er i dag.
Åbent: en ny `type`, eller en zone-art ved siden af.

### 6.7 Etaper

| # | Hvad | Værdi alene | Status |
|---|---|---|---|
| 11 | **Carrieren som node** — `carriers`, regler, prøver + **én** belægningsfunktion der læser både `kasser` og `carriers` | Beholderen findes, og hylden har én sandhed | ✅ |
| 12 | **Beholdningen flytter til carrier-niveau** — migrering af nøgle, bevægelser, pluk, optælling og deres prøver | Indholdet følger beholderen | ✅ |
| 13 | **Nøgletallene** + skærmen **Carrier-overblik** | Planchen med KPI-kortene | ✅ |
| 14 | **Transit & placering** — de fire trin, forslag til ledig lokation | Modtagelsen på gulvet | ✅ |
| 15 | **Transportlabels** — de tre typer, og hvad de betyder for etapemodellen | Godset kan mærkes | ✅ Beslutning 46: en transport ER en etape. `transportId` → `etapeId` med fremmednøgle |

⚠ **Skærmen er nummer tre i rækken, og det er ikke til at lave om på.** Den
læser en node der ikke findes (11) og et indhold der ligger et andet sted end
planchen viser (12). Bygges den først, bygges den to gange — og de fem
nøgletal ville stå som hardkodede tal imens.

**Etape 11 er inde.** `carriers` findes med regler, `carriers.skriv` og prøver
i begge lag, og belægningen opgøres ét sted i `reolplads.js`.

⚠ **Skærmen talte allerede forkert, før carrieren kom.** Lokationer regnede
belægningen af beholdningsposterne alene og var dermed blind for
Unitbookings kasser på de samme hylder — en hylde med en transportkasse på
stod som fri. Fejlen var der fra etape 3; carrieren ville have gjort den
dobbelt så stor. Kortet hedder nu **Optaget** og ikke "Med varer på", og der
er en egen kolonne for beholdere, fordi en plads kan bære en beholder uden en
eneste varelinje.

⚠ **`kasser` læses kun hvis tenanten har Unitbooking.** Noden er spærret af
det modul, og en forespørgsel ville give `permission-denied` hos en kunde der
kun har Warehouse. `useListe` har fået `hent`, og den er til dét — ikke til at
dæmpe en afvisning på en node kunden har.

⚠ **En probe mod den udrullede base afviste ALT — også for admin.** Ikke en
fejl i reglerne: de seedede DEV-brugeres tokens var ældre end permissionen, og
et preset rammer ikke eksisterende brugere. Claims skal fornys, og det er
skrevet ved `ROLLE_PERMS` i forvejen. Prøverne i emulatoren kunne ikke se det —
de udsteder deres egne claims.

### 6.8 Størrelsen

Etape 11 er lille: en node, en validering, en permission og prøverne.
**Etape 12 er den farlige** — den flytter nøglen under fire ting der virker og
er prøvet. Etape 13 er en skærm og et sæt KPI-felter. 14 og 15 er hver sit
flow og hører sammen med scanner-appen og etapemodellen; de kan ikke bygges
færdige uden svar på 6.4's fjerde punkt.

**Etape 13 er inde.** Skærmen **Beholdere** (`/warehouse/carriers`) tegner de
fem nøgletal, tabellen med indhold, placering og seneste bevægelse, samt
beholdere pr. zone.

⚠ **De fem tal ligger IKKE i `kpi/`.** De er afledt af de beholdere og
beholdningsposter skærmen allerede har hentet, og undtagelsen i CLAUDE.md
gælder præcis dér: et gemt tal ville drive fra sit grundlag ved den første
bevægelse der ramte det ene og ikke det andet. Opgørelsen står i
`carrieroverblik()` — ét sted, så den næste skærm ikke tæller lidt anderledes.

⚠ **Kun ét felt kom i `kpi/`: `warehouse.carriereUdenLokationDelta`.** Et
"siden i går" kræver gårsdagens tal, og dem har skærmen ikke. Planchen viser
et delta på alle fem kort; de fire andre er bevidst ikke bygget, fordi hvert
felt er et løfte om en aggregering — og et delta på "aktive beholdere" siger
mindre end tallet selv. Det er et **antal**, ikke en procent.

⚠ **Planchens "delvist tømt" er ikke bygget**, og kortet siger i stedet hvor
mange beholdere der HAR indhold. Se punkt 6.4: "delvist" kræver et
referencetal der ikke findes, og et gæt ville se ud som en måling.

### ⚠ Og etapen fandt en fejl der var ældre end alle tre carrier-etaper

Skærmen viste **"0 af 0"** med syv beholdere i basen. Det var ikke skærmen.

`useListe` lagde et `startAt`/`endAt` på forespørgsler **uden**
`orderByChild()` — altså på NØGLEN. En nøgle som `p-a-01-02` eller
`CRR-100245` ligger uden for ethvert millisekund-interval, så hver skærm der
kaldte `useListe` uden både `ordnPaa` og `vindue: "alle"` hentede **nul
rækker**: Lokationer, Bevægelser, Optælling, Pluk og Standardpriser.

Tre ting gjorde den usynlig:

1. **Demo-vejen gjorde det rigtige.** `somServeren()` har altid kun anvendt
   intervallet under `if (ordnPaa)`. To veje til det samme kald, og kun den
   ene havde ret — så alt så rigtigt ud dér hvor man kigger.
2. **En tom tabel ligner et tomt lager.** Skærmene skrev "Der er ingen
   lokationer endnu", og det er en sætning man tror på i et nyt system.
3. **Forespørgselsbyggeriet var uprøveligt.** `useListe.js` importerer
   `FleetContext.jsx`, og Node kan ikke indlæse `.jsx` — der fandtes ikke en
   test i huset der kunne se hvad der blev sendt til RTDB.

Punkt 3 er rettet først: `byg()`, `somServeren()` og resten ligger nu i
`src/fleet/liste.js` **uden React**, og `test/useliste.test.mjs` prøver dem —
heriblandt at de to veje svarer det samme på det samme kald. Samme greb som
`demo-kpi.js`, der blev skilt ud af `useKpi.js` af nøjagtig samme grund.

**Etape 14 er inde.** Skærmen **Modtagelse** (`/warehouse/modtagelse`) tegner
planchens fire trin: hvad der venter på en plads, den valgte beholder med
indhold og transport, et forslag til en ledig plads, og kvitteringen.

⚠ **AT SÆTTE BEHOLDEREN PÅ EN HYLDE ER ANKOMSTEN.** Planchens flow afslørede
et hul i modellen: en beholder i transit kunne ikke placeres, fordi
`skrivPlacering` krævede at den allerede var på lageret. Der er nu ikke et
"modtag"-trin før placeringen — en beholder i transit der nu står på en hylde,
ER kommet frem, og `status` skrives sammen med `pladsId` i ÉN opdatering. To
skridt ville betyde at der fandtes et øjeblik hvor beholderen både var
undervejs og stod et sted, og det er præcis den tilstand belægningen hviler på
ikke findes.

Den anden vej findes stadig: scannes beholderen ind uden at blive placeret,
står den som `paaLager` uden `pladsId`. Køen på skærmen er derfor **begge
dele** — i transit og uden lokation — fordi begge venter på det samme.

⚠ **Forslaget er en LEDIG plads, ikke en beregnet plads.** Det bruger
`pladsErLedig()` og den fælles belægning, så det ikke kan blive uenigt med
Lokationer om hvad "ledig" betyder. Planchens *"1,9 m³ ledig"* er ikke med:
der er ingen kapacitetsmodel, og et opdigtet rumfang ville se ud som en
måling. Der står zone og type i stedet.

⚠ **Kundens faste område er ikke bygget**, og skærmen skriver hvorfor. En
kundezone er et reserveret område med ledig m² og m³ — hverken reservationen
eller kapaciteten findes i modellen. Se punkt 6.6.

⚠ **Og der tegnes ikke et lagerkort.** `reolpladser` har ingen koordinater;
hal, reol, fag, hylde og plads er navne, ikke positioner. Et kort tegnet på
gæt ville vise en hylde et sted den ikke står.

### ⚠ Klikket fandt det proben ikke kunne

Proben mod den udrullede base var grøn i tre punkter. Så blev knappen trykket
i browseren, og placeringen blev afvist med *"antal: En placering flytter
beholderen, ikke godset i den"* — uden at nogen havde skrevet et antal.

Skærmen sendte `antal: undefined`. En callable serialiserer `undefined` til
`null`, og `Number(null)` er **0** — et tal der ser sendt ud. Hærdningen fra
etape 12, der skulle afvise et antal på en placering, afviste altså fraværet
af et.

Proben kunne ikke se det: den udelod feltet **helt**, og så var der ingen
`null` at koste om. Rettet i begge lag — serveren læser med `typeof`, og
klienten sender slet ikke de felter arten ikke har.

**Etape 15 er inde.** Skærmen **Transportlabels** (`/warehouse/labels`) tegner
planchens tre typer, mærkatet felt for felt, og hvad der mangler før det kan
trykkes. Logikken ligger i `src/fleet/transportlabel.js` — ikke i skærmen, så
en kommende Cloud Function kan udstede den samme label.

⚠ **Etapen kunne først bygges, da 6.4's fjerde punkt var afgjort** — og svaret
blev **beslutning 46: en transport ER en etape**. Følgen var større end skærmen:
feltet `carriers.transportId` hed forkert og stod uden fremmednøgle. Det hedder
nu `etapeId` og valideres mod `etaper`, og omdøbningen blev målt i den udrullede
base først (7 beholdere, én bar feltet, og det var demo-rækken).

⚠ **Labelen er ingen node.** Typen udledes af etapekæden, felterne slås op i
booking, kunde og plads. Et gemt mærkat ville drive fra sin booking første gang
nogen rettede et slutmål — og så siger papiret på pallen og skærmen hver sit.
Det er `bemanding.ledig` på et stykke papir.

⚠ **Forskellen på "via transit" og "storage" er hylden**, ikke en status ved
siden af: en beholder der læsses om på terminalen, får aldrig en `pladsId`; en
der sættes på plads, gør. Samme svar som 6.4 gav på "ingen lokation".

⚠ **En halv label trykkes ikke.** `byggLabel()` svarer med `mangler`, og
knappen er spærret så længe der er ét felt tilbage. Et mærkat med et tomt
slutmål ser ud som et helt mærkat, og godset kører efter det — fejlen opdages
på rampen i Hamburg, ikke på skærmen.

⚠ **Og labelen kræver Booking.** `etaper` er spærret af booking-modulet,
`carriers` af warehouse. En kunde med lager men uden booking har ingen
transporter at mærke, og skærmen siger det frem for at vise en tom tabel, der
ligner en fejl (beslutning 32).

**DEV er rettet med, og labelen er set tegnet.** `demo/CRR-100248` bar stadig
`transportId: "TRP-2024-0514"` efter udrulningen — et felt reglerne ikke kender
længere, så enhver fremtidig skrivning til posten ville være afvist af
`$andet: false`. Én `update()` med servicekontoen satte `etapeId: "et-007"` og
`transportId: null`. Efter: 0 beholdere med det gamle felt.

⚠ **Og først dér kunne skærmen efterprøves.** Før rettelsen stod den med
*"0 klar af 7"* og *ingen transport* på hver række — det rigtige svar, men også
et svar hvor mærkatet aldrig blev tegnet. Efter rettelsen tegner CRR-100248 en
**via transit**-label: BKG-2026-00317, Fyn Køl & Frost A/S, København → Hamburg
→ København, stregkode `BKG-2026-00317-CRR-100248`, og Print-knappen er åben.
Det er den samme lære som `useListe`-fejlen i etape 13: en tom tabel ligner et
tomt lager, og kun et klik kan se forskel.

---

## 8. Afregningen når frem til et fakturagrundlag

Warehouse regnede sin afregning færdig i etape 6, og **stoppede før
dokumentet**: `grundlag` havde ingen node, og `byggGrundlag()` kastede uden et
`bookingId`. Begge dele er lukket. Detaljerne står i **PRISER.md §10**; her
står kun det Warehouse skal vide.

**Warehouse → Afregning** har en knap: **Opret fakturagrundlag**. Den skriver
ikke — den kalder `grundlagskriv`. Godkendelsen sker **ét sted**, i Økonomi →
Fakturering (beslutning 12); afregningen laver kun kladden.

⚠ **En linje uden sats kommer ikke med, og skærmen tæller dem op.** En tavs
udeladelse er en for lav faktura, som ingen kan se — grundlaget ser komplet ud.

⚠ **Momssatsen sættes ikke.** Lageret kender den ikke, og den gættes ikke til
25 %. Eksporten er spærret indtil en bogholder har svaret. Det betyder at en
lagerafregning i dag kan **godkendes, men ikke låses** — og det er det
rigtige svar, ikke et hul.

⚠ **Oversættelsen fra afregningslinje til grundlagslinje står i
`fakturering.js`**, ikke i `warehouse.js`. Den hører til dokumentet, ikke til
lageret — og `warehouse.js` er importfri, fordi den kopieres til serveren.

**Det der ikke kan regnes bagud, står stadig.** Opbevaring pr. palle pr. dag
kræver en daglig måling; en genberegning ville give et andet tal hver gang
historikken blev rettet. Samme lærestreg som `maalnu`.

---

## 9. Etape 9 er inde — sporbarheden

Skærmen **Sporbarhed** (`/warehouse/sporbarhed`) svarer på tilbagekaldets
spørgsmål: *hvor er det parti nu, og hvor har det været?* Der er to slags svar,
fordi der er to slags sporing.

**Batch krævede intet nyt.** Beholdningens nøgle er allerede
`carrierId__vareId__batch`, så "hvor ligger LOT-240515" er et opslag i data der
findes. Historikken er bevægelserne, filtreret på batchen.

⚠ **Et parti slås op på vare OG batch.** To kunder kan have hver sin `LOT-1` —
en batch er kun entydig sammen med sin vare, præcis som beholdningsnøglen
siger. Uden varen ville et tilbagekald ramme en fremmed kundes gods, og det er
den værste udgang af netop denne skærm.

⚠ **Sporet læses ældste først.** Alle andre lister i huset er nyeste først,
fordi de svarer på "hvad er der sket for nylig". Den her svarer på "hvad skete
der med DEN her" — og vendes den om, læser man forløbet baglæns uden at opdage
det.

### 9.1 Serienummeret var erklæret, men bandt ingenting

`SPORING.serie` har været i modellen siden etape 2, og `valideBevaegelse()` har
krævet et serienummer på en serie-sporet vare hele tiden. Men feltet indgik
ikke i nogen nøgle. Man kunne registrere SN-4711 hver dag i en måned uden at
nogen kunne svare på hvor den var — og uden at nogen opdagede at den var
modtaget to gange.

Det er præcis den fælde kommentaren ved `SPORING` advarer om: *"Sættes en vare
op uden batch og får batch et år senere, findes der bevægelser uden batch — og
så kan et tilbagekald ikke svare på hvilke kolli der var i det parti."*

**Enheden er nu et eget objekt:** `enheder/<serienr>` med `vareId`, `kundeId`,
`carrierId` og `tilstand`. Nøglen er serienummeret selv.

### 9.2 ⚠ Valget koster noget, og prisen betales tre steder

`enheder` og `beholdning` bærer den **samme kendsgerning** — det ene som
rækker, det andet som et tal. Det er den klasse fejl `bemanding.ledig` var: to
steder der kan komme ud af trit, hvor kun det ene bliver rettet.

Valget er truffet bevidst — et rigtigt WMS gør det sådan, fordi en enhed har
sin egen historie, sin egen tilstand og sin egen skæbne. **Ingen af de tre
betalinger må fjernes:**

| # | Prisen | Hvor |
|---|---|---|
| 1 | **Én skrivning.** Enhedsrækken lægges i den SAMME `rod.update()` som bevægelsen og beholdningen. RTDB's multi-path update er atomisk — enten lander alle tre, eller ingen. To kald ville være to udfald | `bevaegelseskriv` |
| 2 | **Antallet er låst til én.** En bevægelse af en serie-sporet vare bærer præcis én enhed. Bar den ti, skulle ét serienummer bestemme ti enheders skæbne, og de ni ville være usporede bag et tal der så rigtigt ud | `valideBevaegelse()` |
| 3 | **Afvigelsen er synlig.** `enhedsafvigelse()` sammenholder tallet med antallet af rækker, og skærmen VISER det. En drift der ikke kan ses, er en drift der ikke bliver rettet | Skærmen |

⚠ **Og som ved en negativ saldo: det er ikke et tal der skal rettes.** De to
kilder skrives sammen, så en uenighed betyder at en bevægelse ikke er landet —
eller at nogen har skrevet uden om `bevaegelseskriv`. Find bevægelsen. En
optælling retter saldoen, men ikke enhederne.

⚠ **Demo-sættet skal være enigt med sig selv.** Er det ikke det, står
afvigelsespanelet rødt fra dag ét — og så lærer man at rødt er
normaltilstanden. En rigtig uenighed hos en kunde ville forsvinde i støjen fra
vores egen. Selvkontrollen i `demo-lager.js` og en prøve i
`sporbarhed.test.mjs` holder de to sæt sammen.

### 9.3 Hvad serveren afviser

Tre ting kan kun afgøres af den der har læst basen, og de ligger derfor i
funktionen — ikke i skærmen:

| Afvisning | Hvorfor |
|---|---|
| **Samme serienummer modtaget to gange** | Den anden modtagelse ville overskrive den første uden spor: enheden ville have været to steder, og kun det sidste ville stå |
| **Pluk fra en beholder enheden ikke ligger i** | Så peger sporet det forkerte sted resten af enhedens liv |
| **Et serienummer der ikke findes** | En flytning af noget der aldrig er kommet ind |

⚠ **Men en afsendt enhed må gerne komme retur.** Det er ikke en dublet — det er
den samme enhed der kommer hjem, og den skal have en ny linje i sporet frem for
en afvisning. `afsendt` er ikke en slutning i verden, kun i vores hus.

⚠ **Og rækken slettes aldrig.** En afsendt enhed har ingen beholder og tæller
ikke med nogen steder, men den bliver stående — sporet er hele grunden til at
rækken findes.

### 9.4 To ting der ikke blev bygget, og hvorfor

**Compliance-udtrækket er skærmen, ikke en fil.** Planchen siger "compliance",
og sporet står nu på skærmen med tidspunkt, art, fra, til og mængde. En
FIL — et udtræk der forlader systemet — er en kanal ud af huset og sin egen
beslutning, præcis som fakturaeksporten: formatet i den anden ende er ikke
afklaret, og et gæt ville skulle laves om.

**Serienummeret bærer ikke sin egen batch.** En vare spores på `ingen`, `batch`
eller `serie` — ikke på to ting. Skal en enhed også kunne henføres til et parti,
er det et fjerde sporingsvalg, ikke et ekstra felt. Ingen har spurgt om det.

### 9.5 Efterprøvet

**14 punkter mod den udrullede DEV-base:** de seks afvisninger ovenfor, og hele
enhedens liv — modtaget i CRR-100245, flyttet til CRR-100247, afsendt, og
modtaget igen som retur. Enhedsrækken fulgte med hver gang, og de to kilder var
enige efter hvert skridt.

**Og klikket i skærmen:** sporet står i den rigtige rækkefølge, og
afvigelsespanelet blev rødt da en saldo blev sat til 5 med tre enhedsrækker
under sig — med den rigtige tekst om at det er en bevægelse der mangler.

---

## 10. Etape 8 er inde — volumenkalkulatoren

Skærmen **Volumen** (`/warehouse/volumen`) er et salgsværktøj. En kunde ringer
og siger *"jeg har omkring 120 paller og regner med 40 ind og 40 ud om
måneden"* — og sælgeren skal kunne svare med husets egne priser, mens de taler
sammen.

Alt til det fandtes i forvejen: de fem håndteringsydelser, de to
opbevaringsmetoder (`prPalledoegn`, `prKubikdoegn`), `prisFor()` og varernes
egne mål. Etapen er derfor lille — det er en beregner oven på et katalog der
allerede er besluttet.

### 10.1 ⚠ Tallet er et estimat, og forbeholdet er bygget ind

**Priserne er vores og er rigtige. Mængderne er kundens gæt og er det ikke.**
Et beløb der står alene, læses som en pris — og så er det den sælgeren bliver
holdt fast på, den dag det viser sig at være 180 paller og 90 håndteringer.

`tilbudsberegning()` returnerer derfor **altid** sine `forudsaetninger`, og
skærmen tegner dem ved siden af tallet. Det er ikke pynt: uden feltet kan en
skærm vise beløbet uden at vise hvad det hviler på. Samme familie som
forbeholdet i `tjekKoerehviletid()` og `faktisk`-flaget i `dageUde()` — begge
steder er svaret ubrugeligt uden sit forbehold, og derfor kan de ikke skilles ad.

### 10.2 Man vælger ÉT grundlag

Paller, m³ og m² er **tre måder at måle det samme gods på**. Modellen tager ét
`grundlag`, ikke tre mængder — var det tre felter, ville de blive udfyldt, og
så faktureres den samme plads tre gange.

⚠ **m² kom til med denne etape.** Planchen siger "m², m³, paller", men
kataloget havde kun de to. Gods der ikke kan stables, lægger beslag på **gulv**
uanset højden; solgtes det som m³, ville en vognmand fakturere en tredjedel af
hvad pladsen koster ham. `lager-kvadratmeter` med metoden
`prKvadratmeterdoegn` er nu i kataloget — og den dukkede op i
Standardpriser-skærmen af sig selv, fordi den skærm enumererer kataloget frem
for at have sin egen liste.

### 10.3 En måned er 30 døgn, og det står på skærmen

Opbevaring prissættes **pr. døgn**. En "månedspris" kræver derfor at nogen har
besluttet hvad en måned er. Brugte beregneren den indeværende måneds længde,
ville det samme gods koste noget andet den 1. marts end den 1. juli — og
modtageren af tilbuddet kunne ikke regne efter. `DOEGN_PR_MAANED` står som en
konstant frem for som et 30-tal midt i en formel.

### 10.4 Det den ikke gør

⚠ **Der oprettes ikke et tilbud.** Nodeformen er ikke besluttet: et tilbud kan
gå til et **emne** der ikke er kunde endnu, og `tilbud` er ikke en
bookingtilstand. Modellen ligger i `demo-kunder.js` med den note. En "Gem
tilbud"-knap ville afgøre det spørgsmål ved et uheld.

⚠ **Den kender ikke vores egen kapacitet.** Beregneren svarer på *hvad koster
det*, ikke på *har vi plads*. Det andet kræver m³ eller m² pr. reolplads, og
det findes ikke i modellen — se punkt 6.4. Et opdigtet rumfang ville se ud som
en måling.

### 10.5 Klikket fandt en fejl prøverne ikke kunne

Beregningen var rigtig — 120 paller × 360 døgn × 2,50 kr. = 108.000 kr. — men
**satsen stod som "3 kr."**. `kr()` runder til hele kroner som standard, og et
tilbud hvor 120 × 360 × 3 ikke er 108.000, kan sælgeren ikke forklare over for
kunden. Satsen står nu med to decimaler; totalerne står i hele kroner som alle
andre steder. En prøve holder det fast.

Det er tredje gang i træk at et klik i den rigtige skærm har fundet noget
hverken prøverne eller en probe kunne se — og alle tre gange var det noget der
kun kan ses af et menneske der læser tallet.

---

## 10. Etape 16 — mærkatet fik sit design, og modellen fik sine felter

Planchen med de tre labels (Direkte A → B, Via transit → destination, Storage
via transit) viste et mærkat med langt mere på end etape 15 byggede: kundens
eget ref.nr., antal kolli, vægt, gadeadresser i alle tre rutefelter, en
godsbeskrivelse, serienr./batch, en QR ved siden af stregkoden og en række
håndteringsmærker.

### 10.1 Hvad modellen kunne, og hvad den ikke kunne

| Feltet på planchen | Hvor det kom fra |
|---|---|
| Booking ID, Carrier ID | Fandtes |
| Kundens ref.nr. | **Nyt:** `bookinger/<id>.kundeRef` |
| Kunde + adresse | Navnet fandtes; **nyt:** `kunder/<id>.adresse/postnr/by` |
| Antal kolli / enheder | **Nyt:** `carriers/<id>.kolli` og `.loesEnheder` |
| Fra / Transit / Til med gade og postnr | **Nyt:** `etaper/<id>.fraAdresse` og `.tilAdresse` |
| Vægt | **Nyt:** `carriers/<id>.vaegtGram` |
| Mål / dimensioner | Fandtes (`laengdeMm` m.fl.), regnes om til cm |
| Serienr. / batch | **Udledt** af `beholdning` — ikke et felt |
| Goods detaljer | **Nyt:** `carriers/<id>.godsbeskrivelse` |
| Status / rutelogik | **Udledt** af labeltypen |
| Håndteringsmærker | **Nyt:** `carriers/<id>.haandtering/<mærke>` |

⚠ **Kolli er ikke varelinjer.** `beholdning` siger hvor meget af hvilke VARER
der ligger i beholderen; kolli siger hvor mange PAKKER en lagermand kan tælle
på gulvet. Tre kasser kølegods kan være én varelinje. De to kan ikke udledes af
hinanden, og et gæt ville blive talt efter ved modtagelsen.

⚠ **Adressen bærer ikke byen.** Etapen har `fraSted`/`tilSted`, og det ER byen.
`fraAdresse` har derfor kun navn, gade og postnummer; mærkatet sætter dem
sammen. Stod byen begge steder, ville de drive fra hinanden — og
planlægningen læser `fraSted`.

⚠ **Serienummer og batch er udledt, og "flere" er et svar.** Bærer beholderen
to batches, vælger mærkatet ikke den ene: et gæt her ville sende en
tilbagekaldelse efter det forkerte parti.

### 10.2 To koder, én nyttelast

QR'en læses af en telefon, stregkoden af terminalens håndscanner. **Begge
bærer den samme kode** — bar de hver sit, ville mærkatet sige to ting om den
samme palle. QR-koderen står i `fleet/qrkode.js`, Code 128'eren i
`fleet/stregkode128.js`.

⚠ **Begge er efterprøvet med en fremmed implementering.** 240 QR-matricer
sammenlignet modul for modul med zxings egen koder — nul afvigelser — og
afkodet igen af zxings læser. Det fangede tre fejl i QR'en, som alle så ud som
en rigtig QR: formatordet stod spejlvendt, anden formatkopi var delt 8 + 7 i
stedet for 7 + 8, og strafferegel 3 talte kantens falske søgemønstre forkert,
så koderen valgte masker en afkoder ikke kunne finde koden i.

⚠ **Prøven fandt sin egen grænse.** ~4 % af koderne kunne zxings LÆSER ikke
finde i et syntetisk billede. Zxings EGNE koder fejlede nøjagtig ens på de
samme nyttelaster — matricerne var identiske — så det er læseren i prøven, ikke
koderen.

### 10.3 To steder hvor huset vandt over planchen

- **`N/A` blev til `—`.** Planchen skriver "N/A" i serienr.-feltet. Huset har
  ÉN markør for "intet svar", og en prøve håndhæver det: den næste ville tro
  der var forskel, og ingen af dem kunne søges frem.
- **`BK-2405-00123` blev til `BKG-2026-00317`.** Planchens bookingnummer er et
  femte format ved siden af beslutning 8's `PRÆFIKS-ÅÅÅÅ-NNNNN`.

### 10.4 Det der IKKE er gjort

- **Intet fysisk format.** Et mærkat trykkes typisk 100×150 mm, men vi ved ikke
  hvilken printer kunden har, og en `@page size` vi selv fandt på ville skalere
  koderne skævt hos alle andre. En skævt skaleret stregkode scanner ikke.
- **Ingen fysisk scanner.** Begge koder er læst af zxing fra et rent billede.
  Papir, blæk og en håndscanner er ikke prøvet.
- **DEV-basen har ikke de nye felter endnu.** Demo-filerne har dem, så mærkatet
  kan ses i sin helhed dér; i den udrullede DEV-base står ref.nr., kolli, vægt,
  adresser og godsbeskrivelse tomme, indtil nogen skriver dem.
- **Ingen formular til felterne.** De kan skrives af en funktion eller et
  script; der er endnu ingen skærm at taste dem i.

### 10.5 Formatet kom: 100 × 200 mm på en Zebra 420

Det åbne punkt i 10.4 er lukket. Og formatet afgør mere end papirstørrelsen —
det afleder **modulbredden**, som er dét der bestemmer om koden kan scannes.

En Zebra 420 er 203 dpi, altså ét dot = 0,125 mm. Vores Code 128 er 330
moduler inklusive stille zone:

| Dots pr. modul | Modulbredde | Kodens bredde | |
|---|---|---|---|
| 1 | 0,125 mm | 41 mm | Under GS1's minimum på 0,25 mm — scanner ikke |
| **2** | **0,250 mm** | **82,6 mm** | Passer, og rammer minimum præcist |
| 3 | 0,375 mm | 124 mm | Bredere end mærkatet |

**To dots er det eneste der både passer og kan scannes.** Bredden er derfor
låst til 82,6 mm og ikke sat i procent: en kode i procent ville skifte
modulbredde med sidebredden, og en modulbredde der ikke er et helt antal dots,
printer ujævne bjælker. QR'en er 33 moduler; 4 dots hver = 16,5 mm.

⚠ **Termoprinteren kender ikke gråt.** Den brænder sorte prikker; alt derimellem
bliver til et raster, og en 9-punkts etiket i raster kan ikke læses. Hver tone
på mærkatet er derfor ren sort på papir, og typebåndet printer sort med hvid
tekst. Farven er skærmens.

### 10.6 ⚠ Og målingen fandt en grænse ingen havde sat

Med formatet kendt kunne mærkatet måles på arket. Det viste, at
**godsbeskrivelsen kan skubbe mærkatet ud over de 200 mm:**

| Godsbeskrivelse | Mærkatets højde |
|---|---|
| 4 linjer | 182,8 mm |
| 7 linjer | 196,5 mm |
| 8 linjer | **201,1 mm — løber over på etiket nummer to** |

Reglernes grænse på 600 tegn er altså for høj *til papiret* — men tegn er en
dårlig målestok: 250 tegn fordelt på korte linjer fylder mere end 400 tegn i
én blok. Grænsen er derfor sat på **linjer**: `MAKS_GODSLINJER = 7`, hvor
ombrydning tælles med ved 55 tegn (målt til 61 med små bogstaver; 55 fordi
brede tegn ombryder tidligere).

⚠ **Der klippes ikke.** En godsbeskrivelse der forkortes i tavshed, er værre
end en der spærrer trykket: *"Må ikke vendes"* kan stå i den linje der
forsvandt. Overskrides grænsen, kommer `godsbeskrivelse` i `mangler`, og
knappen er lukket — samme regel som et manglende slutmål.

Tilbage af 10.4: ingen fysisk scanner er prøvet, og der er stadig ingen
formular at taste felterne i.

### 10.7 Formularen — og de tre felter der ikke kunne stå i den

Mærkatets felter kan nu tastes på **Transportlabels** (`Redigér felter`):
kolli, løse enheder, vægt, godsbeskrivelse og de fem håndteringsmærker.

⚠ **Den ligger på label-skærmen og ikke på Beholdere.** Felterne hører til
carrieren, men GRUNDEN til at udfylde dem er mærkatet: man ser hvad der
mangler, og retter det uden at skifte skærm. Beholder-skærmen viser
beholderens drift — indhold, placering, seneste bevægelse — og det er ikke
det samme spørgsmål.

⚠ **Den skriver med `flet: true`.** Beholderen bærer også type, status, plads
og mål, som formularen ikke kender. Med `set()` ville et gemt mærkatfelt
slette dem i tavshed — samme fælde som `reolpladser` lukkede.

⚠ **Vægten tastes i kilo og gemmes i gram**, ét sted (`gramFraKilo()`), og
både komma og punktum tages. Et komma i en vægt er samme fejl som et komma i
et beløb.

⚠ **En for lang godsbeskrivelse spærrer IKKE for at gemme.** Teksten er lovlig
data op til reglernes 600 tegn; det er MÆRKATET der kun har plads til syv
linjer. Kunne den ikke gemmes, ville folk forkorte den — og så mister lageret
oplysningen, ikke bare papiret. Formularen tæller linjerne mens man skriver
(*"9 af 7 linjer på mærkatet · 260 af 600 tegn"*) og advarer; trykket er
spærret, indtil den er kortere.

**Tre af planchens felter kunne ikke komme med, og det er ikke en
forglemmelse:**

| Felt | Node | Hvorfor ikke |
|---|---|---|
| Kundens ref.nr. | `bookinger` | `.write: false` — kun `etapeskift` skriver den |
| Fra-/til-adresse | `etaper` | `.write: false` — samme grund |
| Kundens adresse | `kunder` | Skrivbar, men kundekartoteket har **ingen** redigeringsformular i dag |

De to første kræver hver sin Cloud Function, fordi en tilstand og dens
reservation skal skrives atomisk (beslutning 16 og 40). En formular der
altid ville blive afvist af reglerne, er værre end ingen — så skærmen
**skriver det frem** i stedet, under formularen. Ellers ligner mærkatet bare
ufuldstændigt, og nogen leder efter en knap der ikke findes.

⚠ **Efterprøvet mod det UDRULLEDE**, ikke kun i emulatoren (beslutning 29):
kolli sat fra 3 til 4 i browseren, læst tilbage fra DEV-basen som 4 — og de
øvrige felter stod uændrede, så fletningen virker. Sat tilbage til 3 igennem
formularen.
