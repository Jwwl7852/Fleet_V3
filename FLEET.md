# Fleet — plan

Fleets forside er **Driftskalenderen**: fem kasser med det der venter, og et
gitter med det der er planlagt. Den er bygget; det her er listen over hvad der
mangler, og hvad der allerede står.

**Denne fil er planen, ikke koden.** CLAUDE.md: *analyse før kode.*

---

## 1. Kravlisten holdt op mod koden

Kravene kom 20. august 2026. Det meste var bygget i forvejen — det står her,
så ingen bygger det to gange.

### 1.1 Generelt

| # | Krav | Status |
|---|---|---|
| G1 | Valg af firma og "seneste" fjernes fra alle undermoduler under Fleet | 🔧 Gods/Bus-vælgeren skal skjules i Fleet. ⚠ "Seneste" er ikke afklaret — se 3.1 |
| G2 | Enheder flyttes til Opsætning | ✅ Ligger på `/opsaetning/enheder`. Driftskalenderen overtog `/flaade` |
| G3 | Kun de undermoduler personalet arbejder i, vises | ✅ `Arbejdskø` er `skjulINav` og nås fra kasserne; Enheder er flyttet |

### 1.2 De fem kasser

| # | Krav | Status |
|---|---|---|
| K1a | Nye indberetninger, åbn i nyt eller samme vindue, tre prioritetsniveauer | ✅ Lav/Mellem/Høj + "Ikke vurderet" (`prioritetsfordeling()`), og "Åbn" har en menu med begge veje |
| K1b | Afventer — ikke planlagt i driftkalenderen | ✅ |
| K1c | Planlagt — planlagt i driftkalenderen | ✅ |
| K1d | Kommende, med brugervalgt interval frem | ✅ 1 uge / 2 uger / 1 md. / 3 mdr. (`FREMAD`) |
| K1e | Forsinkede | ✅ |

⚠ **Kasserne ligger ikke i `kpi/`, og det er undtagelsen — ikke et brud.**
"Kommende" afhænger af et interval brugeren selv sætter; et aggregeret tal
ville være regnet på ét vindue og stå forkert i de tre andre. Se
`fleet/driftskalender.js`.

### 1.3 Selve kalenderen

| # | Krav | Status |
|---|---|---|
| K2a | Dag / uge / måned | ✅ `VISNING` |
| K2b | Linjerne er for høje — komprimér | 🔧 **Mangler.** Se 2.1 |
| K2c | Åbn kalenderen i eget vindue, med scroll ved mange enheder | ✅ "Åbn i nyt vindue" på kalenderkortet; `fc-gk-lodret` giver scroll |
| K2d | Hover over en opgave giver et view af hvad der sker | 🔧 **Mangler** |
| K2e | Klik åbner en popup med mails, fotos m.m. | 🔧 **Delvist.** Fotos findes; mails gør ikke — se 3.2 |

---

## 2. Det der skal bygges

### 2.1 K2b — linjehøjden

⚠ **Den kan ikke vurderes på et tomt gitter.** Skærmen står i dag med *"Ingen
driftsopgaver i perioden"* og *"0 af 16 enheder"*, fordi demo-opgaverne ikke
falder i indeværende uge. En højde sat efter et tomt gitter er et gæt.

Rækkefølgen er derfor: skaf data i vinduet først, mål, og komprimér bagefter.
Højden hører i `Gitterkalender.jsx`, som **deles** af Værkstedskalender,
Servicekalender og Disponering — en højde sat her rammer alle tre, og det er
med vilje (CLAUDE.md: byg ikke et kalendergitter til).

### 2.2 K2d — hover

Et view af opgaven uden at åbne den. Skal bære det samme som popup'ens
hoved, så de to ikke kan blive uenige.

### 2.3 K2e — popup

Klik på opgaven åbner den. Fotos findes i forvejen på indberetningen.
**Mails findes ikke** — se 3.2.

### 2.4 G1 — Gods/Bus i Fleet

⚠ **Knappen gør reelt ingenting i Fleet.** Beslutning 19: stamdata har ikke en
division, og `personale/` og `koeretoejer/` bærer feltet **forbudt**. En
divisionsvælger over Fleets skærme er derfor en *pæn knap* — den skifter en
tilstand ingen af skærmene læser.

Den skjules i Fleet. ⚠ Den må **ikke** fjernes globalt: beslutning 9 siger
Gods/Bus gælder hele platformen, og Booking, Økonomi og Disponering læser den.

---

## 3. Åbent

### 3.1 ⚠ "Seneste" — ikke fundet

Kravet siger *"valg af firma og seneste"* øverst i sidebaren. Deroppe står
fire ting: brandet, `version 3.0`, tenantnavnet (**ren tekst**, ikke en
vælger) og Gods/Bus. Der er ingen "seneste".

Gods/Bus er afklaret (2.4). "Seneste" er **ikke** — og der gættes ikke på et
menupunkt.

### 3.2 ⚠ Mails i popup'en kræver beslutning 20's fase 1

Sagsbaseret mail er **fase 0 — kun visning**. `sager/` står ikke i
`firebase.rules.json`, og derfor findes hverken `sag.laes` eller `sag.skriv` i
`permissions.js`. Modtagevej, parsing, afsendelse og scanning mangler.

En mail-fane på popup'en uden noget bag ville være en attrap der opfører sig
som en kontrol — samme fejl som en deaktiveret radiogruppe der siger "ikke
bygget". Enten bygges fase 1 først, eller også skriver popup'en frem at
mailsporet ikke findes endnu.

---

## 4. Etaper

| # | Hvad | Værdi alene | Status |
|---|---|---|---|
| 1 | **Gods/Bus skjult i Fleet** (G1, delvist) | En knap der ikke gør noget, forsvinder | ✅ |
| 2 | **Data i gitteret** — demo-opgaver der falder i indeværende uge | Kalenderen kan overhovedet ses arbejde | ✅ Provisioneren kørt |
| 3 | **Linjehøjden komprimeres** (K2b), målt på et fyldt gitter | Flere enheder på skærmen ad gangen | ✅ 68 → 44 px |
| 4 | **Hover-view** (K2d) | Man kan se hvad en blok er uden at åbne den | |
| 5 | **Klik-popup** (K2e) med fotos — og mailsporet skrevet frem som manglende | Opgaven kan åbnes fra kalenderen | |
| 6 | **Mails i popup'en** — kræver beslutning 20 fase 1 | Sagens korrespondance samlet | *afventer 3.2* |

Etape 1 er små. Etape 2 er den der låser resten op: uden data i vinduet kan
hverken højde, hover eller popup prøves i browseren — og en kalenderændring
der kun er set på et tomt gitter, er ikke efterprøvet.

---

## 5. Etape 1–3 er inde

**Gods/Bus er skjult i Fleet.** Flaget står i `nav.js` som `udenDivision` og
læses af shellen — betingelsen hører på modulet, ikke på en rute i AppShell.
⚠ Tilstanden **røres ikke**: vælgeren skjules, den nulstiller ikke divisionen.
Et skjult felt der samtidig ryddede valget, ville sende brugeren tilbage til
Gods uden at nogen havde trykket.

### ⚠ Og det tomme gitter var ikke kalenderens fejl

Skærmen stod med *"Ingen driftsopgaver i perioden"*. Demo-opgaverne bruger
relative datoer (`iDag(8,0)`), så de burde ligge i dag — men skærmen læser den
**udrullede** base, ikke demo-filen. Målt i DEV: opgaverne var seedet **18.
august** og lå derfor 2–3 dage før vinduet. Kun én af tretten faldt i den
kommende uge.

**Seedet demo-data med relative datoer ældes.** Det er ikke særligt for
`opgaver` — hver node med `iDag()` eller `dag(n)` fryser på seed-tidspunktet, og
en dev-base der har stået en uge, ser tom ud på hver kalenderskærm.

⚠ **Og opgaverne kan ikke seedes alene.** `reservationer` bygges af **tre**
kilder — etaper, fravær og opgaver — med de samme funktioner `etapeskift`
bruger. Skrives kun opgaverne, driver reservationerne fra dem, og en opgave
uden sin reservation ser FRI ud i disponeringen. Derfor kørte hele
`provisioner:dev`. Prisen er, at den fornyer tokens: man bliver logget ud og
skal logge ind igen.

### ⚠ Linjehøjden var navnets, ikke indholdets

Målt i browseren på et fyldt gitter: rækken var **68 px**, mens blokbåndet kun
er 30. Navnekolonnen stablede tre ting lodret — navn (17), undertekst (17) og
statuspille (23) plus polstring.

Pillen står nu ved siden af navnet, og rækken er to linjer: **44 px**. Halvanden
gang så mange enheder i samme højde. Pillen er samtidig mindre *her og kun her*
— formen er den samme, størrelsen følger stedet.

⚠ Ændringen ligger i `Gitterkalender.jsx` og rammer derfor også
**Servicekalender og Disponering**. Det er med vilje (CLAUDE.md: byg ikke et
kalendergitter til), men det skal ses efter i de to andre skærme.
