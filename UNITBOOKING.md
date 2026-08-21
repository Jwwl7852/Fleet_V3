# Unitbooking — plan

`Warehouse.html` er en færdig prototype: **Turtlebooking, Hizkia Denmark**.

⚠ **Prototypen hedder stadig Turtlebooking.** Det er Hizkias navn på deres
eget produkt, og det bliver ikke omdøbt af at vores modul gør. Står der
Turtlebooking i denne fil, er det prototypen der menes — ikke modulet.
4.088 linjer, 320 KB. Den udlejer **transportkasser til kunst** — kasser med
id og type, reolpladser i haller, udlån med sagsnummer, historik, kalender og
udlånsliste pr. uge.

Det er ikke en skærm. Det er et modul på størrelse med Flåde og Booking
tilsammen, og det skal bygges i etaper.

**Denne fil er planen, ikke koden.** CLAUDE.md: *analyse før kode.*

---

## 1. Hvad prototypen indeholder

| Skærm | Hvad |
|---|---|
| Dashboard | Hurtighandlinger, bookede og klargjorte kasser |
| Kasser | Opret, kassetyper, hurtigsøg, filtre |
| Bookinger | Søg ledige kasser i periode, opret udlån |
| Kunder | Kundeoversigt |
| Reolpladser | Hal · reol · fag · hylde · plads, flyt kasse |
| Historik | Pr. kasse og pr. sagsnummer |
| Kalender | Udlån pr. uge |
| Opsætning | Brugere, QR-koder, Excel-import, rapporter |

Datasættet er ægte: `MDT-101`, sagsnumre som `2845/DHS/Skagens
Kunstmuseer/KHS`, reolpladser som `Hal 1 - Reol 2 - Fag 1 - Hylde 10 - Plads 1`.

---

## 2. Syv ting der skal afgøres FØR der skrives kode

Det er ikke pedanteri. Hver af dem er et sted hvor prototypen og platformen
siger noget forskelligt, og hvor en forkert sammenkobling koster en migrering.

### ⚠ 2.1 Tre navne er allerede taget

| Prototypen | FleetControl har allerede | Hvad det er dér |
|---|---|---|
| `lager` / lagerstyring | `lagre` | Reservedelslager under **Indkøb** |
| `bookings` | `bookinger` | En **transportopgave** (beslutning 16, 21) |
| `customers` | `kunder` | **Kundekartoteket** med priser og aftaler |

⚠ **OG MODULET HAR SELV HAFT TRE NAVNE.**

| Hed | Indtil | Hvorfor det skiftede |
|---|---|---|
| `warehouse` | etape 6 | Navnet skal bruges til et **andet** modul: blandede varer ind og ud af et lager, med afregning for håndtering ind, opbevaring og håndtering ud. En anden forretning end at leje transportkasser ud pr. sag |
| `turtlebooking` | 18.08.2026 | Efter prototypen. Produktnavnet blev **Unitbooking** |
| `unitbooking` | — | |

Begge omdøbninger kostede en eftermiddag, og begge gange af samme grund:
**de blev taget mens ingen tenant bar modulnøglen.** Det er ikke et held, det
er en måling — i den **udrullede** base, før en linje blev rørt. Første gang
nævnte hverken tenant, prisliste eller fakturagrundlag `warehouse`; anden
gang bar hverken `demo` eller `nordvest` nøglen `turtlebooking`.

⚠ **Og det er den målings holdbarhed der er pointen.** Et halvt år senere
ville det have været en migrering af **frosne** regnskabsdokumenter — og et
frosset fakturagrundlag må ikke skrives om, for så dokumenterer det ikke
længere hvad der blev faktureret. Prisen for at omdøbe et modul stiger med
hver kunde der krydser det af; den falder aldrig. Skal navnet skiftes igen,
skal det ske **før** den første kunde, eller slet ikke.

⚠ **Noderne skiftede ingen af gangene.** De hedder stadig `kasser`,
`kassetyper`, `kasseudlaan` og `reolpladser`, og permissionerne stadig
`kasser.skriv`, `kasseudlaan.skriv` og `reolpladser.skriv`. Det er derfor
begge omdøbninger var billige: modulnøglen er det eneste af de tre der står i
kundens data, og den stod ingen steder.

To ting med samme navn er beslutning 11 og 14 om igen — og det er den fejl der
har kostet mest i dette repo. **Forslag:** modulet hedder `unitbooking`, og
noderne hedder `kasser`, `reolpladser` og `kasseudlaan`. Aldrig `lager`,
aldrig `booking`.

### ⚠ 2.2 Alt ligger i ÉT blob

Prototypen gemmer hele tilstanden i `lagerstyring/state` — kasser, udlån,
kunder, historik, brugere, i én node.

Det kan ikke bruges her, og det er ikke et smagsspørgsmål:

- **Reglerne kan ikke beskytte det.** En `.read` på blobben giver alt eller
  intet. Der kan ikke være forskel på "må se kasser" og "må se historik".
- **Der kan ikke valideres.** Et felt i en JSON-klump har ingen `.validate`.
- **To brugere overskriver hinanden.** Hver skrivning skriver hele tilstanden.
  To lagermænd der klargør hver sin kasse i samme minut, taber den enes
  arbejde — uden en fejlmeddelelse.

**Forslag:** `tenants/<id>/kasser`, `/reolpladser`, `/kasseudlaan`, med regler
og validering pr. node som alt andet.

### ⚠ 2.3 Prototypen har sit eget rollesystem

`Admin · Lager · Læser · Chauffør`, med sin egen adgangsmatrix.

Beslutning 31: **rollerne er faste**, og adgang afgøres af permissions, ikke af
rollen. Unitbooking skal derfor ikke have en femte rolleverden, men permissions:

```
kasser.laes        kasser.skriv
kasseudlaan.laes   kasseudlaan.skriv
reolpladser.skriv
```

✅ **BESVARET: det er lagermedarbejderen.** Ikke chaufføren — en chauffør
kører, og den der står med kassen i hånden på lageret er en anden person med
et andet arbejde. Der er derfor oprettet en **syvende rolle**,
`lagermedarbejder`, som er den eneste ud over admin der må røre udlån.

⚠ Det gjorde også de to permissions smallere: de lå først i `BASIS_DATA` og
blev fjernet derfra. En dedikeret rolle er meningsløs, hvis alle andre roller
har det samme i forvejen.

⚠ Og prøven tvang en faktureringsbeslutning frem med det samme: en ny rolle
uden en **brugerart** ville lydløst være blevet faktureret som *desktop* — den
dyre af de to. Lagermedarbejderen er en **medarbejder**, som chaufføren: de
bruger appen samme sted og koster det samme at levere.

### ⚠ 2.4 Prototypen laver sine egne logins

Den beder brugeren oprette adgangskoden i **Firebase-konsollen** og styrer selv
navn/e-mail/rolle. Vi har `opretbruger`, `skiftrolle`, `spaerlogin` og et
brugerindeks. Prototypens brugeradministration **udgår helt**.

### ⚠ 2.5 Reolpladsen er sin egen nøgle

`"Hal 1 - Reol 2 - Fag 1 - Hylde 10 - Plads 1"` er både id og visningsnavn, og
den står **to gange på hver kasse** (`location` og `homeLocation`).

Omdøbes en hal, peger hver eneste kasse på en plads der ikke findes. Det er
`steder.js`-problemet: **ét katalog, og navnet udledes.**

**Forslag:** `reolpladser/<id>` med `hal`, `reol`, `fag`, `hylde`, `plads`, og
en `pladsnavn()` der sætter strengen sammen. Kassen peger på `pladsId`.

### ⚠ 2.6 Kundefeltet er fritekst med fire ting i

```
"SMK/4357/ Levende Landskaber/23.03.2026 – 18.10.2026/MIW"
```

Kunde, sagsnummer, udstilling, periode og initialer i ét felt. Det kan ikke
søges, ikke summeres og ikke kobles til kundekartoteket.

**Forslag:** `kundeId` (mod `kunder`), `sagsnummer`, `beskrivelse`, `fra`,
`til`. Den oprindelige streng bevares som `importtekst` på de rækker der
kommer fra Excel — så intet går tabt ved importen.

### ⚠ 2.7 41 rå farver

`npm run test:design` fejler på hver eneste farveværdi uden for `fleet.css`.
Prototypens palet skal oversættes til tokens. Statusfarver (Ledig / Booket /
Klargjort / Udlånt) er **status**, ikke kategori — beslutning 30.

---

## 3. Etaper

Rækkefølgen er valgt så hvert trin er værd at have alene.

| # | Hvad | Værdi alene | Status |
|---|---|---|---|
| 1 | **Modulet findes**: `unitbooking` i `moduler.js`, nav, regler med modulklausul, række i prislisten | Kan sælges og krydses af. ⚠ Ingen skærm endnu — nav-punktet må ikke tegnes før der er noget bag | ✅ |
| 2 | **Datamodel + regler + prøver** for `kasser`, `reolpladser`, `kasseudlaan` | Grundlaget kan ikke laves om bagefter | ✅ |
| 3 | **Kasser og reolpladser** — stamdata, opret, flyt | Man kan registrere lageret | ✅ |
| 4 | **Udlån** — søg ledige i periode, book, klargør, udlever, retur | Den operationelle kerne | ✅ |
| 5 | **Kalender og udlånsliste** — genbruger `Gitterkalender.jsx` | Overblik pr. uge | ✅ |
| 6 | **Historik** pr. kasse og pr. sagsnummer | Dokumentation | ✅ |
| 7 | **Excel-import** af de eksisterende data | Migrering fra prototypen | |
| 8 | QR-koder og rapporter | Kan vente | |

**Etape 3 er inde.** `unitbooking` står nu i sidebaren med **Kasser** og
**Reolpladser** (sidstnævnte rummer også kassetyperne — en type uden pladser at
stå på er ikke til nogen nytte, og to skærme til seks felter er to skærme for
mange). `UDEN_SKAERM` er tom igen; den fandtes præcis for at holde menupunktet
borte, indtil det førte et sted hen.

**Etape 4 er inde.** `kasseudlaanskriv` er udrullet, `kasseudlaan` er
`.write: false`, og `Udlån`-skærmen søger ledige kasser i en periode,
reserverer, klargør, udleverer og modtager retur.

⚠ **`konflikter()` afgør stadig ingenting — men den bliver nu spurgt to
gange.** Skærmen bruger den til at VISE hvad der er ledigt; serveren spørger
igen **inde i en transaktion**, og det er den der gælder. Fjernes serverens
tjek, er skærmens tjek ren dekoration. Samme forbehold som de fem disponeringstjek,
men her er den anden halvdel bygget.

⚠ **"Booket" er ikke længere en kassestatus.** Se beslutning 37 — en
reservation er et udlån, og mærkatet på kassen udledes af `kasseudlaan` med
sagsnummer og periode. Prototypens femte status er væk.

Verificeret mod den **udrullede** funktion med en rigtig lagermedarbejder-konto
i tolv punkter: booking, konflikt i begge ender af perioden, ingen genvej til
udlånt, atomisk skrivning af udlån + kasse, pladsen der forsvinder ved
udlevering og kommer tilbage på **hjempladsen** ved retur, en lukket sag der
ikke kan genåbnes, og afvisning for en chauffør.

**Etape 5 er inde.** Kalenderen er kasser × dage i et **fast, fremadrettet**
vindue på fire uger — shellens periodevælger ser bagud og hører til
rapporterne. Under den står **udlånslisten**, hvor hvert udlån optræder to
gange: den dag kassen skal ud, og den dag den skal hjem. Lageret arbejder
efter hændelser, ikke perioder; et udlån over to måneder ville ellers være
usynligt i begge de uger hvor der faktisk skulle gøres noget.

⚠ **Den ene fælde var intervallet.** Gitteret regner halvåbent `[fra, til)`;
et udlån er inklusivt i begge ender. Tegnet råt mangler den sidste dag, og
kassen ser fri ud den dag den stadig står hos museet. `halvaabent()` i
`unitbooking.js` er den ene oversættelse, og den er prøvet mod `overlapper()`
på hver kombination i ti dage — er de to uenige ét sted, viser gitteret noget
andet end konflikttjekket afviser.

**Etape 6 er inde** — og den tvang en rettelse frem i etape 4. Historikken
kunne kun kende den **planlagte** periode, og "MDT-101 har været ude 126
dage" ville være en påstand vi ikke kan stå inde for, hvis kassen kom hjem i
forvejen.

`kasseudlaanskriv` stempler derfor `udleveretMs` og `returneretMs` i selve
tilstandsskiftet, og `dageUde()` returnerer `{dage, faktisk}`. **Flaget er
vigtigere end tallet:** skærmen mærker hver varighed *målt* eller *planlagt*,
og et nøgletal viser hvor stor en andel af de afsluttede udlån vi faktisk kan
sige varigheden på. Det tal måler os selv, ikke lageret — det falder kun, hvis
nogen begynder at gå uden om systemet.

⚠ **Historikken er ikke auditloggen.** Her står hvad der skete med kasserne,
ikke hvem der trykkede. Skiftene ligger i `audit/` bag `audit.laes`, som en
lagermedarbejder ikke har — en log over hvem der har gjort hvad, er selv
følsom.

⚠ **En annulleret reservation er historik.** Nogen lovede kassen væk og trak
det tilbage; det er en oplysning. Den udelades kun på kalenderen, hvor den
ville få kassen til at se optaget ud i en periode hvor den er fri.

⚠ **Kalenderen skal genbruge `Gitterkalender.jsx`.** CLAUDE.md forbyder et nyt
kalendergitter: to gitre der læser samme interval forskelligt, opdages ikke ved
at kigge på dem.

---

## 4. Hvad jeg IKKE gør uden at spørge

- **Ændrer et rolle-preset** (punkt 2.3). Det er en beslutning.
- **Kobler kasseudlån til `bookinger`.** De ligner hinanden og er det ikke: en
  transportopgave har etaper, køretøj og chauffør. Et kasseudlån har en
  periode og en kasse. At slå dem sammen ville være beslutning 16 om igen.
- **Importerer de rigtige data.** Det er ægte kundedata fra Hizkia, og det
  hører i deres egen tenant — ikke i demo eller dev-basen.

---

## 5. Størrelsen, ærligt

Etape 1 er en halv dag. Etape 2–4 er kernen og er sammenlignelige med Flåde:
datamodel, regler, prøver, to-tre skærme med skrivning. Etape 5–8 er ovenpå.

Det er ikke noget der bliver færdigt i én omgang, og et modul der er halvt
bygget, er værre end intet: nav-punktet står der og lover noget. Derfor tegnes
`unitbooking` først i sidebaren, når etape 3 er inde.

---

## 6. Tre mockups kom til (20. august 2026)

Tre plancher for UnitBooking: **Opsætning / Kasseliste**, **Udlån &
reservationer** og **Kalender**. De viser et modul der er større end etape 1–6,
og de tilføjer to ting modellen ikke har.

### 6.1 Hvad de tre viser

| Planche | Hvad |
|---|---|
| **Opsætning / Kasseliste** | Kasselisten flyttet til Opsætning. Fire nøgletal (kasser i alt, belægningsgrad, udlånt nu, samlet volumen i m² og m³). Filtre på type og undertype. Formularen "Opret ny kasse" med kasse-id, type, **undertype**, hjemplads, status, volumen (m² og m³) og noter — og en formular *inde i* formularen: "Opret ny type", markeret **kun for opsætningsbrugere** |
| **Udlån & reservationer** | Fire nøgletal (reserveret, klargøres snart, ude nu, belægningsgrad). "Opret ny reservation" med sagsnr., kunde, type, undertype og tre datoer. "Ledige kasser i perioden" med Reservér-knap. "Aktive reservationer & udlån" med **næste handling** pr. række: Klargør → Udlever → Modtag retur |
| **Kalender** | Gitter pr. kasse × tid. Dag/uge/måned, interval 1 uge / 2 uger / 1 md., **grupperet efter kasse-id eller sag**, fremhævning pr. art (klargøring/udlån/returnering). Hover giver et lille kort; klik giver et større med **mails og fotos**. Sidepanel "Kommende klargøringer", der kan minimeres. "Åbn næsten fuldskærm" |

### 6.2 ⚠ To ting modellen ikke har

**Undertype.** `kasser` bærer i dag `type` som en fri streng. Plancherne har
`type` **og** `undertype` (Alukasse → Standard / Stor / XL), begge oprettet af
en opsætningsbruger. Det er et **katalog**, ikke to felter: en undertype hører
til én type, og en fritekst i to niveauer driver dobbelt så hurtigt som i ét.

**Volumen i to enheder.** Planchen viser m² **og** m³ pr. kasse, og et samlet
tal med en "red. volumen" ved siden af. `kasser` har i dag ingen af delene.
⚠ Og `volumen.js` findes allerede til Warehouse — den skal genbruges, ikke
skrives af.

### 6.3 ⚠ Og én ting der ligner noget, der allerede er afgjort

Planchens kalender er **det samme gitter** som Fleets driftskalender og
Disponering: ressourcer × tid, med blokke i arter. `Gitterkalender.jsx` tegner
det, og `gitter.js` regner det. CLAUDE.md: *byg ikke et kalendergitter til.*
Kalenderen her er en **anvendelse** af det gitter, ikke et nyt.

⚠ **MEN DET GJALDT IKKE HOVER OG KLIK-POPUP, OG DET STOD HER SOM OM DET GJORDE.**

Her stod: *"Det samme gælder hover og klik-popup: Fleet skal have dem (FLEET.md
etape 4–5), og de to skærme må ikke få hver sin."* Det var en **analogi** til
gitteret, og analogien holder ikke.

**Gitteret er en FORM; svævekortet er INDHOLD.** Gitteret tegner ressourcer ×
tid uanset hvad en blok betyder — derfor må der kun være ét, og derfor kan et
gitter der læser intervallet én dag forskudt, ikke opdages ved at kigge på det.
Svævekortet viser en **entitets felter**. En `opgave` og et `kasseudlaan` har
ingenting til fælles: forskellige noder, forskellige feltskemaer, forskellige
kataloger. Af de tredive linjer i Fleets `Svaevekort` er seksogtyve rent
opgave-specifikke — `arbejdstype`, `leverandoerId`, `estimeretMin`,
`prioritetFor()`.

Et fælles svævekort ville derfor skulle tage et *felt-array* ind fra begge
skærme, og så er det ikke en delt komponent længere — det er en tabel med en
ramme om. **Fleet og Unitbooking er to forretninger.**

⚠ **DET DER ER FÆLLES, ER UDSEENDET — OG DET ER DET ALLEREDE.** `.fc-svaev`
står i `fleet.css` med sin placering, sin skygge og sine to kolonner. Begge
skærme bruger de samme klasser, og en ændring af hvordan et svævekort SER ud,
sker ét sted. Der skal ingen ny abstraktion til.

### 6.4 Etaper

| # | Hvad | Værdi alene | Status |
|---|---|---|---|
| 7 | **Type og undertype som katalog** — node, regler, prøver, og de to felter på kassen | Kasser kan klassificeres som planchen viser | ✅ |
| 8 | **Volumen på kassen** — MÅL i mm, m²/m³ udledt + nøgletal | Belægning og volumen kan gøres op | ✅ |
| 9 | **Kasselisten flyttet til Opsætning** med filtre og "Opret ny kasse" | Stamdata står hvor stamdata står | ✅ |
| 10 | **Udlån & reservationer** — én skærm med næste handling pr. række | Flowet reservation → klargøring → udlevering → retur kan køres ét sted | ✅ |
| 11 | **Kalenderen** — grupperet hoved og tilstand i blokken | Overblik pr. kasse eller sag | ✅ delvist — se 6.8 |

⚠ Etape 7 først. Undertypen står i formularerne på **alle tre** plancher og i
filtrene på to af dem; bygges skærmene før katalogget, bygges de to gange.

### 6.5 Etape 7 og 8 er inde — og planchen blev fraveget to steder

**Undertypen ligger under sin type.** En egen node med et `typeId` kunne
drive: en undertype ville kunne pege på en type der var slettet, og to typer
kunne dele en undertype med samme navn. Reglen er en krydsfelt-regel —
undertypen skal høre til kassens **egen** type — og den holder også ved en dyb
skrivning af kun feltet, fordi `newData.parent()` er postens tilstand efter
skrivningen.

⚠ **"Har undertype: ja/nej" er ikke et felt.** Den er udledt af om der er
nogen. Trækassen har derfor bevidst ingen undertyper i demo-data: en type
**uden** skal kunne ses, ellers bliver feltet i praksis påkrævet.

⚠ **Og der kom ingen ny permission.** Planchen siger *"kun for
opsætningsbrugere"*. `permissions.js` har en truffet beslutning: **to**
permissions, ikke fire — `kasser.skriv` dækker stamdata (kasser, kassetyper,
reolpladser). En tredje ville være et navn der altid blev givet sammen med den.

### ⚠ Volumen blev til MÅL — planchens to felter blev tre

Planchen har `m²` og `m³` som **indtastede felter** på hver kasse. To tal
skrevet af et menneske om den samme fysiske kasse kan blive uenige, og så har
*"hvor stor er kassen"* to svar man skal vælge imellem. Målene kan de ikke:
120 × 80 × 95 cm **er** 0,96 m² og 0,91 m³.

Kassen bærer derfor `laengdeMm`, `breddeMm`, `hoejdeMm` — **de samme feltnavne
som `varer` og `carriers`**, så de tre kan læses af én funktion.
`kubikFraLinjer()` gjorde det allerede for varer; `maalFraMm()` og
`volumenIalt()` er de to nye, og de ligger i `volumen.js`.

⚠ **Det rører ikke beslutningen om afregningsgrundlaget.** `KAPACITETSGRUNDLAG`
siger stadig at man vælger ÉT af paller, m³ og m² — det handler om hvad der
faktureres. Her handler det om hvor stor en kasse er, og det er ét spørgsmål
med ét svar.

⚠ **Centimeter tastes, millimeter gemmes** — ét sted (`mmFraCm()`), som vægten
på transportlabelen. Og enten alle tre mål eller ingen: et enkelt mål alene
kan hverken give m² eller m³, men et felt der står udfyldt uden at tælle med,
ser ud som en oplysning man har.

⚠ **Dem uden mål rapporteres.** Nøgletallet skriver *"1 uden mål"* frem for at
tælle den som nul. Talte den nul, ville totalen se komplet ud mens en kasse
manglede — samme regel som en afregningslinje uden sats.

### 6.6 Etape 9 — Kasselisten er stamdata

Kasselisten ligger nu på `/opsaetning/kasser` under **Opsætning**, som planche
1 viser. Kalenderen er modulets forside og har overtaget `/unitbooking` —
samme snit som da Driftskalenderen overtog `/flaade`, da Enheder gik til
Opsætning.

⚠ **Og prisen står skrevet.** `/unitbooking/kalender` lever videre som
redirect, men et bogmærke til `/unitbooking`, sat dengang det var
**kasselisten**, lander nu på kalenderen. De to kan ikke skelnes — stien er
den samme. Det er samme omkostning som Fleet betalte, og den er billigere end
at lade forsiden være tom.

⚠ **Reolpladser blev stående under Unitbooking**, og det er ikke en
forglemmelse. Noden deles med Warehouse, og `kraeverModul` tager **én**
streng: under Opsætning med `"unitbooking"` ville hylderne forsvinde for en
kunde der kun har WMS — præcis den fælde `reolpladser.skriv` blev oprettet for
at lukke. Skal den flyttes, skal `kraeverModul` først kunne rumme to moduler.

**Undertypefiltret** tegnes kun når en type er valgt, og kun hvis den har
undertyper: en liste med alle typers undertyper blandet sammen ville have to
"Standard" der betød hver sit. Et typeskift rydder det — ellers ville
"Trækasse + XL" give en tom liste og se ud som om der ingen trækasser var.

### 6.7 Etape 10 — én tydelig handling pr. række

Skærmen fandtes: søg ledige i periode, reservér, og knapper for hvert lovligt
skift. Planchens pointe var en anden — *"Du ved altid, hvad der skal gøres
nu."*

Før stod **alle** lovlige skift som ligeværdige knapper, så "Annullér" var
lige så fremtrædende som "Klargør" — på en skærm hvor det ene sker hver dag og
det andet sjældent. Kolonnen **Næste handling** bærer nu det ene skridt
fremad; undtagelserne står i kolonnen efter.

⚠ **Skridtet er skrevet ud, ikke "første element i `UDLAAN_SKIFT`".**
Rækkefølgen dér er en visningsrækkefølge, og den dag nogen sorterer den
alfabetisk, ville "annullér" blive næste skridt — og stå som den primære
handling på hver eneste reservation. To prøver binder de to tabeller sammen i
begge retninger: hvert skridt fremad skal være et lovligt skift, og hver
tilstand med et lovligt fremadskift skal have et næste skridt.

**Undertypen kan nu søges på**, som planchens "Opret ny reservation".
⚠ Og den filtrerer kun **sammen med** typen: to typer kan have hver sin
undertype med samme nøgle — `std` findes både på Alukasse og Klimakasse — så
et filter på undertypen alene ville blande dem. `ledigeKasser()` afviser det,
og skærmen tegner ikke feltet før en type er valgt.

### ⚠ To af planchens nøgletal er ikke bygget

| Planchen | Her | Hvorfor |
|---|---|---|
| Klargøres snart (48 t) | **Klargjort** | Vores tæller dem der ER klargjort. Planchens tæller dem der SKAL klargøres inden for to døgn — det er et andet og bedre tal, men det er ikke bygget |
| Belægningsgrad 72 % | **Over tiden** | "Over tiden" er noget nogen skal handle på. Belægningsgraden er ikke bygget — se rettelsen nedenfor |

De står her frem for at blive tegnet halvt: et nøgletal der hedder noget andet
end det viser, er værre end et der mangler.

⚠ **OG BEGRUNDELSEN FOR DEN ANDEN VAR FORKERT.**

Her stod at belægningsgraden blev udeladt fra Udlån-skærmen fordi *"en procent
af kasserne i brug står allerede på Kasselisten"*. Det gør den ikke.
Kasselisten har **Kasser i alt, Ledige, Udlånt, På lager og Samlet volumen** —
tallet findes ingen steder i modulet.

Det er værre end et manglende nøgletal: det er en begrundelse der **afgjorde**
at noget ikke blev bygget, og som pegede på noget der ikke fandtes. Havde
nogen slået efter, ville de have troet at tallet var dækket ét klik væk.

⚠ **Og `belaegningPaaPlads()` i `reolplads.js` er ikke det samme.** Den svarer
om en **hylde** er optaget — et fysisk spørgsmål om lagerpladsen. Planchens
belægningsgrad er en **procent af kasserne** der er i brug. To ting med samme
ordstamme, og det er præcis sådan en forveksling opstår.

Belægningsgraden mangler altså på **begge** plancher — se listen i 6.10.

### 6.8 Etape 11 — kalenderen fik et hoved der kan læses

Planchen for kalenderen kom 20. august. Kalenderen fandtes, og **alle fire
nøgletal var allerede de rigtige** — Ud denne uge, Hjem denne uge, Bagud,
Kasser i spil. Det der manglede, var hovedet.

⚠ **Otteogtyve dage i én række kan ikke læses.** Vinduet er fire uger, og
datoen stod i hver af de otteogtyve kolonner. Planchen har **tre** rækker:
måned over uge over dag. Grupperingen flytter det man sjældent skifter op i
sin egen række, så dagen kun bærer det den ikke kan undvære.

`grupperSlots()` i `gitter.js` slår **naboslots** med samme nøgle sammen.
⚠ Kun naboer: to spænd med samme nøgle der ikke rører hinanden, bliver to
spænd — ellers ville ét august-spænd strække sig henover september.

⚠ **Niveauerne er kalderens valg, ikke gitterets.** Fleets driftskalender
viser én uge og har ingen brug for dem. Lå de i `Gitterkalender`, ville en
uges visning få en "Måned"-række med ét felt.

**Tilstanden står nu i blokken** — "Sag 4260 · Udlånt", som planchen. Farven
alene kræver at man kender paletten, og på et printet eller sort/hvidt
skærmbillede findes den ikke; så ville blokken kun sige et sagsnummer.
Rækkens pille siger hvad kassen er **nu**; blokkens siger hvad **den her
periode** er.

⚠ **Og gitteret havde ingen egen prøvefil.** `gitter.js` blev prøvet
indirekte gennem driftskalender- og disponeringsprøverne, som spørger om
deres egne spørgsmål. `test/gitter.test.mjs` er ny.

⚠ **Prøven fejlede på sin egen præmis.** "Kun naboer" brugte først lige/ulige
dato og forventede ét spænd pr. slot — men 31. august og 1. september er
**begge ulige** og er naboer, så de blev ét spænd, helt som de skulle. Koden
havde ret; prøven var forkert.

### ⚠ Tre ting fra planchen er ikke bygget

| Planchen | Her |
|---|---|
| "Udvid til 2 skærme" | Ikke bygget. Kalenderen kan åbnes i et nyt vindue fra Fleet; her er der ingen knap |
| "Udvidet visning" og interval-vælgeren "Uge" | **Længden kan nu vælges** — 1 / 2 / 4 uger, se 6.13. "Udvidet visning" er stadig ikke bygget |
| "Kommende klargøringer" som kort med Klargør-knap | Findes som **Udlånsliste** — en tabel med uge, dato, hændelse, kasse, hjemplads, sag og tilstand. Den bærer mere, men kan ikke handles på |

Den sidste er den værd at tage: planchens pointe er at man kan klargøre
direkte fra kalenderen. Knappen findes på Udlån-skærmen, og at låne den hertil
kræver at de to skærme deler den samme handling — ikke to kopier.

### 6.9 Etape 12 — en vej frem og tilbage

⚠ **Vinduet var fast, og dag niogtyve fandtes ikke.** Kalenderen viste
otteogtyve dage fra i går og kunne kun svare på ét spørgsmål — altid det
samme. Der var hverken en rulning eller en knap der førte videre; teksten sagde
endda selv at vinduet var "fast og fremadrettet", som om det var et valg.

Under gitteret sidder nu en **rullebjælke** med en pil i hver ende. Den ligger i
`fleet/Gitterkalender.jsx` og gælder derfor også Driftskalender,
Servicekalender og Disponering.

| Situation | Hvad pilen gør |
|---|---|
| Gitteret er bredere end skærmen | Ruller fire femtedele af en skærm |
| Man er ved kanten | Flytter perioden en uge |
| Alt kan ses på én gang | Flytter perioden en uge — bjælken er der stadig |
| Kalderen har ikke givet `onSkub` | Ruller kun; pilen slukkes ved kanten |

⚠ **Håndtagets bredde er et mål, ikke pynt.** Det fylder samme del af banen
som det synlige fylder af det hele. Med fast bredde ville det påstå det samme
om fire uger som om ét døgn, og så kan man ikke se på det hvor meget der ligger
udenfor.

⚠ **Kan alt ses, er der intet håndtag.** Sporet fyldes i stedet. En kontrol man
kan gribe fat i uden at der sker noget, er værre end ingen.

⚠ **Skubbet flytter en uge, ikke fire.** Springer man et helt vindue, kan et
udlån der ligger hen over kanten forsvinde uden at nogen ser det. En uge
efterlader tre ugers overlap at genkende sig i.

⚠ **Og der er en vej hjem.** Knappen **I dag** står i kortets hoved, men kun
når man ER væk. Ellers ville den sige "gå hen hvor du står".

Regnestykket — `greb()` og `skridt()` — ligger i `fleet/gitter.js` uden
React og er prøvet i `test/gitter.test.mjs`. En bjælke der peger ét sted og
ruller et andet, opdages ikke ved at kigge på den.

#### ⚠ Den fejl bjælken afslørede

`.fc-scroll` klippede ingenting. `.fc-card` og `.fc-slot` er gitter- og
flexbørn, og de har `min-width:auto` som udgangspunkt — "bliv mindst så bred
som dit indhold". Et bredt gitter skubbede derfor **kortet** bredere end
skærmen, og så rullede hele **siden** i stedet for kalenderen. Målt:
`clientWidth` 4202 ved et indhold på 4202 — den klippede aldrig noget.

Det ramte hver eneste brede tabel i `.fc-scroll`, ikke kun kalenderen.
`min-width:0` på de to er rettelsen.


### 6.10 Hvad der stadig mangler i forhold til plancherne — talt op

⚠ **DOKUMENTET HER KENDTE FEM AF TOLV.** 6.7 listede to nøgletal og 6.8 tre
ting fra kalenderen. En gennemgang af de tre skærme mod 6.1 fandt syv mere,
og den ene af de fem havde en begrundelse der pegede på noget der ikke fandtes.

Det er derfor listen står samlet her frem for spredt ud i etapeafsnittene: en
mangel der er nævnt i forbifarten under den etape hvor den opstod, kan ikke
tælles. Og en liste man ikke kan tælle, kan man ikke stole på.

#### Kalender

| Planchen | Her | |
|---|---|---|
| Gitter kasse × tid | Bygget | ✅ |
| Måned over uge over dag i hovedet | Bygget, 6.8 | ✅ |
| **Grupperet efter kasse-id ELLER sag** | Bygget — se 6.14 | ✅ |
| **Interval 1 uge / 2 uger / 1 md.** | Bygget — 1 / 2 / 4 uger. Se 6.13 om hvorfor ikke en kalendermåned | ✅ |
| **Fremhævning pr. art** (klargøring/udlån/returnering) | Blokken farves efter **tilstand** | ⚠ |
| **Hover → lille kort** | Bygget — Unitbookings EGET, se 6.15 | ✅ |
| **Klik → større kort med mails og fotos** | Findes ikke | ❌ |
| Sidepanel "Kommende klargøringer", kan minimeres | Bygget — med Klargør-knappen, se 6.16 | ✅ |
| "Åbn næsten fuldskærm" | Bygget — se 6.18 | ✅ |

⚠ **Gruppering efter sag er ikke bare andre rækker.** En sag kan have flere
kasser i den samme periode, og gitteret tegner overlap i én række som en
**KONFLIKT** — med vilje, fordi et overlap på en eksklusiv ressource er noget
`reserver()` ville afvise. En sagsrække er ikke eksklusiv, så enten skal
gitteret vide det, eller også skal en sagsrække vise noget andet end sine
enkelte udlån. Det skal afgøres før der bygges.

⚠ **Og svævekortet må ikke bygges her.** Se 6.3: Fleet skal have det samme, og
de to skærme må ikke få hver sit. Det betyder at Driftskalenderens `Svaevekort`
skal løftes op i `fleet/` — ikke at der skal skrives et til.
Mails og fotos i det store kort hører til **beslutning 20**, som er fase 0:
`sager/` står ikke i `firebase.rules.json`.

#### Udlån & reservationer

| Planchen | Her | |
|---|---|---|
| Reserveret, Ude nu | Bygget | ✅ |
| **Klargøres snart (48 t)** | Bygget — `klargoeresSnart()`, ved siden af "Klargjort" | ✅ |
| **Belægningsgrad** | Bygget — `kassebelaegning()`, ved siden af "Over tiden" | ✅ |
| Opret reservation: sagsnr., kunde, type, undertype | Bygget | ✅ |
| **Tre datoer** | Bygget — `klargoerSenest`, valgfri | ✅ |
| Ledige kasser i perioden med Reservér | Bygget | ✅ |
| Aktive udlån med **næste handling** | Bygget, 6.7 | ✅ |

⚠ **DEN TREDJE DATO OG "KLARGØRES SNART" ER DET SAMME HUL.** Planchens fjerde
nøgletal kræver at man ved HVORNÅR der skal klargøres, og modellen har ingen
klargøringsdato: `kasseudlaan` bærer `fra` og `til`. De to punkter kan ikke
bygges hver for sig, og det er den rigtige rækkefølge — feltet først, tallet
bagefter.

⚠ **Og en klargøringsdato er ikke gratis.** Den skal valideres mod `fra` (man
klargør ikke efter afhentningen), den hører i `firebase.rules.json` som resten
af udlånet, og `kasseudlaanskriv` er den eneste vej ind (beslutning 37). Det er
en regeletape, ikke et felt i en formular.

#### Opsætning / Kasseliste

| Planchen | Her | |
|---|---|---|
| Kasser i alt, Udlånt, Samlet volumen i m² og m³ | Bygget | ✅ |
| **Belægningsgrad** | Bygget — **samme** funktion som Udlån bruger | ✅ |
| Filtre på type og undertype | Bygget, 6.6 | ✅ |
| Opret ny kasse med undertype, mål, hjemplads, noter | Bygget, 6.5 og 6.6 | ✅ |
| **"Opret ny type" INDE i kasseformularen** | Ligger på **Reolpladser**-skærmen | ⚠ |

⚠ **Typeformularen er en bevidst fravigelse — men den var ikke skrevet ned.**
En kassetype er stamdata, og stamdata står hvor stamdata står; det var hele
pointen i etape 9. En formular inde i en formular betyder desuden at man kan
oprette en type midt i en halvt udfyldt kasse, og så skal den halve kasse
overleve at den anden formular gemmer. Det er værd at holde fast i — men det
er en fravigelse, og en fravigelse ingen har skrevet ned, er ikke til at skelne
fra noget nogen glemte.

#### Rækkefølgen, hvis der bygges

1. ~~**Belægningsgraden.**~~ **Bygget** — se 6.11.
2. ~~**Klargøringsdato → "Klargøres snart".**~~ **Bygget** — se 6.12.
3. ~~**Kalenderens interval-vælger.**~~ **Bygget** — se 6.13.
4. ~~**Gruppering efter sag.**~~ **Bygget** — se 6.14.
5. ~~**Svævekortet.**~~ **Bygget** — men IKKE løftet op i `fleet/`; se 6.15.
   Det store kort med mails og fotos venter stadig på beslutning 20.

### 6.11 Belægningsgraden — og hvorfor nævneren er den interessante halvdel

Planchens fjerde nøgletal står nu på **begge** skærme, og det er den **samme**
funktion: `kassebelaegning()` i `unitbooking.js`. To skærme der begge sagde
"belægningsgrad" og regnede hver sit, ville være beslutning 6 brudt — og
forskellen ville se ud som et datahul frem for to regnestykker.

⚠ **NÆVNEREN ER DE BRUGBARE KASSER, IKKE ALLE.** En kasse der er ude af drift,
er hverken i brug eller til rådighed. Talte vi den med, ville et lager hvor
halvdelen er i stykker, vise 50 % og ligne noget der stod halvt stille — mens
hver eneste brugbare kasse var ude hos en kunde.

⚠ **Men så skal antallet stå ved siden af.** Når nævneren krymper, **stiger**
procenten hver gang en kasse går i stykker. Målt på et konstrueret sæt: 5
udlånte og 5 ude af drift giver **100 %** — korrekt, og ubrugeligt alene.
Derfor giver funktionen `udeAfDrift` med tilbage, og begge kort skriver det ud.
Flaget hører til tallet, som i `dageUde()`.

⚠ **`klargjort` TÆLLER MED.** Kassen står stadig på sin hylde, men den er
pakket til en bestemt sag og kan ikke loves væk til nogen anden. Talte vi kun
de fysisk udleverede, ville lageret se ledigt ud om fredagen, hvor hver eneste
kasse var pakket til mandag.

⚠ **Og `booket` er ikke en kassestatus** — det er udlånets. En booket kasse
står som `ledig` indtil nogen klargør den. Tallet er derfor et øjebliksbillede
af **lageret**, ikke af kalenderen.

⚠ **Uden brugbare kasser er svaret `null`, ikke 0.** Nul brugbare betyder at
spørgsmålet ikke kan besvares; 0 % ville sige at lageret stod helt stille.
`pct()` skriver `—`.

⚠ **Og der er intet `MINDSTE_GRUNDLAG`,** selv om den ligner et nøgletal der
skulle have et. `beregnNoegletal()` nægter under en grænse, fordi den estimerer
en **rate** ud fra få leveringer — to og to hundrede ser ens ud i en tabel. Det
her er en **optælling** på hele populationen: er én af to kasser ude, ER
belægningen 50 %.

⚠ **Navnet er `kassebelaegning`, ikke `belaegning`.** `reolplads.js` har
`belaegningPaaPlads()` — om en **hylde** er optaget. Det er præcis de to der
blev forvekslet i begrundelsen ovenfor, og et navn der ikke kan forveksles,
kan ikke gøre det igen.

### 6.12 Klargøringsdatoen — planchens tredje dato, og det nøgletal den bærer

De to punkter var ét hul. "Klargøres snart (48 t)" tæller dem der **skal**
klargøres inden for to døgn, og modellen vidste ikke hvornår: `kasseudlaan`
bar `fra` og `til`. Feltet først, tallet bagefter.

⚠ **`klargoerSenest` ER VALGFRI, OG DET ER EN BESLUTNING.** De udlån der
allerede ligger i basen, har den ikke — et påkrævet felt ville gøre hver
eneste af dem ugyldig efter reglerne, og en rettelse af et sagsnummer ville
blive afvist på et felt ingen rørte. Samme holdning som `faktiskMin` på
opgaver (beslutning 50): **hullet tælles frem for at spærre.**

⚠ **Og derfor giver `klargoeresSnart()` `udenDato` med tilbage.** Uden det
ville tallet påstå at være en fuld optælling, og det er det ikke: et udlån
uden dato kan hverken tælles med eller fra, fordi vi ikke ved hvornår det skal
pakkes. Kortet skriver det ud. Samme greb som `udeAfDrift` ved siden af
belægningsgraden og `uden` i `volumenIalt()`.

⚠ **KUN `booket` TÆLLER.** Er udlånet klargjort, er arbejdet gjort; er det
udlånt, er kassen kørt. En tælling der tog dem med, ville **vokse af at
arbejdet blev udført** — og så kan den ikke bruges til at planlægge efter.

⚠ **DE OVERSKREDNE TÆLLER MED.** Et udlån der skulle have været pakket i går,
er ikke holdt op med at skulle pakkes. Faldt det ud af tallet fordi fristen var
passeret, ville listen blive kortere netop som den blev mere presserende, og
den kasse ville forsvinde fra den eneste skærm der viser den. `bagud` står ved
siden af, så de to kan skelnes.

⚠ **DATOEN KAN IKKE LIGGE EFTER AFHENTNINGEN.** Man pakker før kassen kører.
Reglen håndhæver det med `newData.parent().child('fra')` — postens tilstand
**efter** skrivningen — så den holder også ved en dyb skrivning af kun feltet.
Samme greb som på `til`, og som på undertypens krydsfelt-regel i 6.5.

⚠ **OG FORMULAREN FORESLÅR IKKE EN DATO.** En dato dagen før afhentningen
ville blive godkendt uden at blive læst, og så stod et gæt i noden som en
beslutning — og nøgletallet ville tælle på opdigtede datoer. Tomt er et svar.

⚠ **`null` OG `undefined` ER IKKE DET SAMME I `retUdlaan()`.** Serveren spreder
den gamle post ind over den nye, så et udeladt felt **arves**. Skal datoen
kunne ryddes igen, skal det siges eksplicit — ellers ville en rettelse hvor man
tømmer feltet, lade den gamle dato stå.

⚠ **Og formularens `vis()` fik det led Planlaegdialog har skrevet ned.**
Fejlnøglen hedder `klargoerSenest`, feltet `klargoerIso` — uden det ekstra led
ville feltet aldrig vise sin fejl, fordi det aldrig blev "rørt" under det navn
fejlen bar. Præcis den fælde står allerede beskrevet i `Planlaegdialog.jsx`;
den her formular havde den enkle udgave.

### 6.13 Interval-vælgeren — og hovedrækkerne der forsvinder af sig selv

Vinduet var låst på fire uger. Skærmen kunne svare på ét spørgsmål i én
opløsning — *"hvad sker der den her måned"* — og på otteogtyve kolonner er
dagen så smal at man tæller sig frem til den. Nu vælges længden: **1, 2 eller
4 uger.**

⚠ **FIRE UGER, IKKE "1 MÅNED", OG DET ER IKKE SJUSK.** Planchen skriver "1
md.". En kalendermåned er 28–31 dage, så et månedsvindue ville begynde og
slutte **midt i en uge** — og "Uge"-rækken i hovedet ville få en halv uge i
hver ende. Fire uger er fire hele uger, og skubbet flytter netop en uge.
Forskellen er højst tre dage; en hovedrække der ikke passer med sine egne
grupper, er en fejl man ser hver eneste gang.

⚠ **HOVEDRÆKKERNE FØLGER MED AF SIG SELV — OG DET VAR DEN EGENTLIGE OPGAVE.**
Ved én uges visning ville "Måned" og "Uge" hver få **ét felt der spænder hele
vinduet**: to rækker der siger det samme som datoen i forvejen gør, for
`slotDele()` beholder måneden i hver kolonne. Det er præcis det 6.8 advarede
imod — *"lå de i Gitterkalender, ville en uges visning få en Måned-række med ét
felt"*.

`niveauErNyttigt()` i `gitter.js` afgør det: et niveau vises kun hvis det har
**mere end én** gruppe og **færre grupper end kolonner**. Den første betingelse
fjerner rækken der siger "august" én gang; den anden fjerner en gruppering der
bare tegner dagsrækken om igen med andre ord.

⚠ **Og valget er stadig kalderens.** Kalderen siger HVILKE grupperinger der
giver mening for hans data — Fleets driftskalender har ingen. Men om en af dem
har noget at **vise**, afhænger af det vindue der er valgt lige nu, og
kolonnerne kender kun gitteret. Lå filtreringen hos kalderen, skulle hver af de
fire skærme udlede det samme, og den dag én af dem glemte det, ville en kort
visning få en tom hovedrække.

⚠ **VÆLGEREN NULSTILLER IKKE SKUBBET.** Har man bladret tre uger frem og
skifter til én uges visning, skal man se den uge man kigger på — ikke hoppe
hjem. Startdatoen står fast; det er kun længden der ændrer sig.

⚠ **OG SKRIDTET ER ÉN UGE VED ALLE TRE LÆNGDER.** Ved fire uger er det bevidst
et lille skridt: springer man et helt vindue, kan et udlån der ligger hen over
kanten forsvinde uden at nogen ser det. Ved én uges visning er et skridt så et
helt vindue — men dér er der syv kolonner, og en blok der rækker udenfor, får
sin pil. Pilen er beskyttelsen, ikke overlappet.

### 6.14 Gruppering efter sag — og den måling der skulle komme først

Planchen har "grupperet efter kasse-id **eller** sag". De to svarer på hvert
sit spørgsmål: kasserækken på *"hvornår er den her kasse optaget"*, sagsrækken
på *"hvornår er udstillingen i gang"*.

⚠ **MEN DER FANDTES INGEN DATA HVOR DE TO VILLE SE FORSKELLIGE UD.** Målt før
en linje blev skrevet: demo-sættet havde **fire sager, én kasse hver**, og den
udrullede DEV-base **tre udlån, tre sager, største sag én kasse**. Med én kasse
pr. sag tegner sagsvisningen nøjagtig det samme som kassevisningen — funktionen
ville se ud til at virke og bevise ingenting.

Og det kunne ikke ses at det manglede: hver skærm så rigtig ud. Først da
grupperingen skulle bygges, blev det tydeligt.

Sag **4412 — Nordisk Lys** er derfor kommet til: fire kasser, samme periode,
én af dem allerede udlånt. Det er sådan forretningen ser ud — §2.6 citerer selv
`SMK/4357/ Levende Landskaber/23.03.2026 – 18.10.2026/MIW`.

⚠ **OG DEN AFGØR SPØRGSMÅLET OM KONFLIKTER.** Gitteret tegner overlap i samme
række som en **konflikt** — med vilje, fordi to udlån på ÉN kasse er noget
`konflikter()` ville afvise. Men fire kasser til én udstilling i samme periode
er det **normale**. Lagde vi de fire udlån råt i sagens række, ville hver eneste
udstilling stå som fire røde konfliktblokke.

`sagsblokke()` fletter dem til én blok, der bærer **hvor mange kasser** der er i
den. Antallet i blokken er hele forskellen på de to grupperinger.

⚠ **MEN DE FLETTES KUN NÅR DE HÆNGER SAMMEN.** Går kasserne ud i bølger — to i
august, to i november — er det **to** blokke. Én blok fra august til november
ville påstå at sagen holdt kasser i tre måneder, hvor lageret var frit imellem.
Samme regel som `ledigeVinduer()`: hullet er også et svar.
⚠ Og et hul på **nul dage** er ikke et hul: slutter den ene den 10. og begynder
den anden den 11., har sagen kasser ude uden afbrydelse.

⚠ **DEN MEST BINDENDE TILSTAND VINDER.** Er én kasse ude og tre booket, er
sagen **i gang** — en blok der sagde "Booket", ville få den til at ligne noget
der endnu ikke var sket. `SAGSTILSTAND_RANG` er forløbets egen rækkefølge.

### ⚠ Og målingen fandt en uenighed der allerede stod der

**MDT-103 stod som `udlaant` — men dens eneste udlån var `returneret` fra
marts.** Altså en kasse der var ude, uden nogen der havde den.

Det er ordret den fejl `KASSE_STATUS`' hoved beskriver som grunden til at
`udlaant` ikke kan vælges i hånden: *"der ville findes en kasse der stod som
udlånt uden et udlån at pege på — og ingen kunne se hvem der havde den."*

⚠ **Selvkontrollen gik kun den ene vej.** Den spurgte udlån → kasse: er et
udlån i gang, skal kassen sige det samme. Den spurgte ikke kasse → udlån, og
det er dén retning fejlen sad i. Begge veje nu.

⚠ **Og kassen kunne ikke bare sættes til `ledig`:** dens hjemplads er optaget
af MDT-104, og en kasse på lager skal stå et sted. Den hører til i et udlån der
**er** i gang — og det er nu sag 4412.

⚠ **Selvkontrollen kører aldrig i prøverne.** Den ligger bag
`import.meta.env?.DEV` og advarer i browserens konsol, hvor ingen ser efter.
`test/unitbooking.test.mjs` prøver derfor demo-sættet direkte: mindst én sag
med flere kasser, og ingen kasse der er ude uden et udlån.

### 6.15 Svævekortet — og hvorfor 6.3 var en analogi der ikke holdt

6.3 skrev: *"Det samme gælder hover og klik-popup: Fleet skal have dem, og de
to skærme må ikke få hver sin."* Sætningen stod som en **udvidelse** af
argumentet om gitteret. Den er nu rettet, fordi de to ting ikke er ens.

**Gitteret er en FORM. Svævekortet er INDHOLD.**

Gitteret tegner ressourcer × tid uanset hvad en blok betyder — det er derfor
der kun må være ét, og derfor et gitter der læser intervallet én dag forskudt,
ikke kan opdages ved at kigge på det. Et svævekort viser en **entitets felter**.
En `opgave` og et `kasseudlaan` har ingenting til fælles: forskellige noder,
forskellige feltskemaer, forskellige kataloger.

Målt på Fleets eget `Svaevekort`: af tredive linjer er **seksogtyve** rent
opgave-specifikke — `arbejdstype`, `leverandoerId`, `estimeretMin`,
`prioritetFor()`, `OPGAVE_STATUS`. Ingen af dem findes på et udlån. Omvendt
viser Unitbookings kort `sagsnummer`, hjemplads, klargøringsfrist og
`dageUde()` — ingen af dem findes på en opgave.

Et fælles kort skulle tage et **felt-array** ind fra begge skærme. Så er det
ikke en delt komponent længere; det er en tabel med en ramme om, og hver skærm
skal alligevel bestemme hvert eneste felt. Det er ikke en genbrugskontrakt som
`Gitterkalender` — det er en indpakning der skjuler at de to skærme er to
forretninger.

⚠ **DET DER ER FÆLLES, ER UDSEENDET — OG DET VAR DET ALLEREDE.** `.fc-svaev`
står i `fleet.css` med sin placering, sin skygge og sine to kolonner. Begge
skærme bruger de samme klasser, så en ændring af hvordan et svævekort SER ud,
sker ét sted. Der skulle ingen ny abstraktion til.

⚠ **OG DER ER INTET SVÆVEKORT PÅ EN SAGSBLOK.** En sagsblok er **flere** udlån
flettet sammen (6.14); et kort der viste ét af dem, ville påstå at være hele
sagen. Ved gruppering pr. sag er kortet slået fra.

⚠ **Kortet siger om "ude" er MÅLT eller PLANLAGT.** `dageUde()` svarer
`{dage, faktisk}`, og flaget er vigtigere end tallet: uden det læses "20 dage"
som en måling, og er kassen kommet hjem i forvejen, er det forkert på en måde
ingen kan se. Beslutning 37.

**Det store klik-kort med mails og fotos er stadig ikke bygget.** Det hører til
beslutning 20, som er fase 0: `sager/` står ikke i `firebase.rules.json`.

### 6.16 Kommende klargøringer — den knap 6.8 selv pegede på

6.8 skrev om planchens sidepanel: *"Den sidste er den værd at tage: planchens
pointe er at man kan klargøre direkte fra kalenderen. Knappen findes på
Udlån-skærmen, og at låne den hertil kræver at de to skærme deler den samme
handling — ikke to kopier."*

De deler den. `kasseudlaan` er `.write: false`, og `skiftUdlaan()` er den ENE
vej ind (beslutning 37) — der findes ingen handling at kopiere. Det der **ikke**
var delt, var **ordene på knappen**: `SKIFTELABEL` og `SKIFTEFORKLARING` lå i
`Udlaan.jsx`. To skærme med hver sin etiket for det samme skift er to
forklaringer på én ting, præcis som to formuleringer af en spærring. De ligger
nu i `unitbooking.js`.

⚠ **OG SKRIDTET SLÅS OP, DET SKRIVES IKKE.** `naesteSkift()` siger hvad der
kommer efter `booket`, og det er den **samme** tabel serveren håndhæver. Skrev
panelet `"klargjort"` direkte, ville det være en knap der kunne blive ulovlig
uden at nogen rettede den. En prøve binder de to: næste skridt fra `booket`
skal være et lovligt skift efter `UDLAAN_SKIFT`.

⚠ **LISTEN ER `klargoeresSnart()` — DEN SAMME SOM NØGLETALLET** (6.12). To
lister for ét spørgsmål ville kunne blive uenige, og forskellen ville se ud som
et datahul frem for to filtre.

⚠ **DEN KAN MINIMERES, MEN DEN FORSVINDER IKKE.** Planchen har en knap. En
lukket tilstand hvor panelet var **væk**, ville skjule de kasser der haster —
netop for den der ryddede op i sin skærm. Sammenklappet står tallet stadig, og
det siger hvor mange der er **bagud**.

⚠ **OG DE UDEN FRIST STÅR PÅ SKÆRMEN.** `klargoerSenest` er valgfri, så et
udlån uden den kan hverken tælles med eller fra. Uden linjen ville listen
påstå at være fuldstændig.

### ⚠ 6.17 Art-fremhævningen kan ikke afgøres af beskrivelsen

§6.1 skriver *"fremhævning pr. art (klargøring/udlån/returnering)"*. Det er
det ene punkt tilbage der ikke kan bygges af teksten alene, og det skyldes
gitteret:

- Tre **blokke** i samme række overlapper, og gitteret tegner overlap som en
  **KONFLIKT** — med vilje (se 6.14). Tre arter pr. udlån ville altså tegne
  hver eneste reservation rød.
- Tre **segmenter inde i én blok** kræver at `Gitterkalender` kan tegne en
  blok i dele. Det er en ændring i et gitter **fire** skærme deler, og den
  skal begrundes af mere end en parentes i en tabel.
- Og "returnering" er et **tidspunkt**, ikke et spænd. Et døgn bredt? Eller en
  markering i kanten af udlånsblokken?

Blokken bærer i dag sin **tilstand** som farve og som tekst — "Sag 4260 ·
Udlånt" (6.8). Det er ikke det samme som planchens tre arter, og forskellen
skal ses på billedet frem for gættes. **Punktet venter på plancen.**

### 6.18 Næsten fuldskærm — og hvorfor "næsten" er ordet

Kalenderens problem er **bredde**. Otteogtyve kolonner skal dele skærmen med en
sidebar på 216 px og et kort med sin egen polstring, og hver kolonne der bliver
bredere, er en dato man ikke skal knibe øjnene sammen for. Planchen har derfor
en knap, og den er nu bygget.

⚠ **"NÆSTEN", OG DET ER IKKE ET KOMPROMIS.** Der er en kant hele vejen rundt,
og baggrunden bliver stående. Et element der dækker **hver eneste pixel**, ser
ud som en ny side — og så leder man efter browserens tilbageknap i stedet for
at lukke visningen. Tilbageknappen fører helt væk fra skærmen. Kanten siger at
man står **oven på** noget. En prøve fejler på `inset:0`.

⚠ **ESCAPE LUKKER DEN.** En visning der dækker skærmen og kun kan forlades med
en museklik-knap, er en fælde. Samme greb som dialogen bruger, og knappens
`title` siger det, så det ikke skal gættes.

⚠ **OG DEN LIGGER UNDER DIALOGEN.** `.fc-fuld` er z-index 50,
`.fc-dialog-baggrund` er 80. En dialog åbnet fra en fuldskærmsvisning skal
stadig kunne ses — ellers ville en Reservér-formular forsvinde bag den
kalender man åbnede den fra. En prøve læser begge tal og holder rækkefølgen.

⚠ **Skyggen er `--fc-shadow`, ikke en ny værdi.** Første forsøg havde
`0 8px 28px rgba(...)` — en kraftigere skygge, som en flydende visning godt
kunne bære. `npm run test:design` fejlede på den med det samme. Et token er en
**beslutning** (nr. 10), og en ny skyggeværdi skulle i så fald begrundes i
BESLUTNINGER.md først. Det var den ikke værd; dialogen bruger den samme.

**"Udvid til 2 skærme" er stadig ikke bygget** — det er en anden ting: at åbne
kalenderen i et nyt browservindue, som Fleets driftskalender kan
(`aabnNytVindue`). Det hører sammen med at ruten skal kunne bære sin tilstand i
URL'en, så det nye vindue åbner på den samme uge og gruppering.
