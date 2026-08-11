# Warehouse — plan

`Warehouse.html` er en færdig prototype: **Turtlebooking, Hizkia Denmark**.
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

To ting med samme navn er beslutning 11 og 14 om igen — og det er den fejl der
har kostet mest i dette repo. **Forslag:** modulet hedder `warehouse`, og
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
rollen. Warehouse skal derfor ikke have en femte rolleverden, men permissions:

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
| 1 | **Modulet findes**: `warehouse` i `moduler.js`, nav, regler med modulklausul, række i prislisten | Kan sælges og krydses af. ⚠ Ingen skærm endnu — nav-punktet må ikke tegnes før der er noget bag | ✅ |
| 2 | **Datamodel + regler + prøver** for `kasser`, `reolpladser`, `kasseudlaan` | Grundlaget kan ikke laves om bagefter | ✅ |
| 3 | **Kasser og reolpladser** — stamdata, opret, flyt | Man kan registrere lageret | ✅ |
| 4 | **Udlån** — søg ledige i periode, book, klargør, udlever, retur | Den operationelle kerne | |
| 5 | **Kalender og udlånsliste** — genbruger `Gitterkalender.jsx` | Overblik pr. uge | |
| 6 | **Historik** pr. kasse og pr. sagsnummer | Dokumentation | |
| 7 | **Excel-import** af de eksisterende data | Migrering fra prototypen | |
| 8 | QR-koder og rapporter | Kan vente | |

**Etape 3 er inde.** `warehouse` står nu i sidebaren med **Kasser** og
**Reolpladser** (sidstnævnte rummer også kassetyperne — en type uden pladser at
stå på er ikke til nogen nytte, og to skærme til seks felter er to skærme for
mange). `UDEN_SKAERM` er tom igen; den fandtes præcis for at holde menupunktet
borte, indtil det førte et sted hen.

⚠ **`konflikter()` i `warehouse.js` afgør stadig ingenting.** Den svarer på om en
periode støder sammen med et eksisterende udlån, og den er testet — men intet
kalder den endnu, og håndhævelsen hører i den Cloud Function der skriver
udlånet. Ligger den i skærmen, går en direkte skrivning uden om den. Samme
forudsætning som de fem disponeringstjek. Det er etape 4.

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
`warehouse` først i sidebaren, når etape 3 er inde.
