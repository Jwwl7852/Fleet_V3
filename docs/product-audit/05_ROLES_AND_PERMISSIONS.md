<title>Roller & Permissions</title>

# 05 — Roller & Permissions

Kilde: `src/fleet/permissions.js` (læst i sin helhed — ingen agent, ingen udledning). Dette dokument beskriver den FAKTISKE nuværende implementation, ikke en ønsket fremtidig model.

## Hvordan adgang faktisk virker

Adgang afgøres af **permissions**, ikke af rollenavnet. En rolle er en fast, foruddefineret samling permissions (`ROLLE_PERMS`), mintet ind i Firebase Auth-tokenets `auth.token.perms` som en rør-afgrænset streng ved login/rolleskift. `firebase.rules.json` og Cloud Functions tjekker kun permission-strengen — aldrig rollenavnet direkte.

Der findes **7 faste roller** i kode. Der er ingen UI til at opfinde en ottende rolle — en ny rolle er en kodeændring (`ROLLE_PERMS`), ikke et klik. En tenant KAN dog omdefinere *hvilke* permissions en given rolle har (`roller/<rolle>/perms` i basen, beslutning 31b) — standarderne nedenfor er hvad en rolle får, hvis tenanten ikke har overstyret den.

⚠ **Vigtigt for læsning af dette dokument:** Kravet fra brugeren nævnte eksempel-personaer som "Fleet-ansvarlig", "Facility-ansvarlig", "Indkøber", "Godkender", "Lageransvarlig", "Økonomi", "Read-only". Disse findes **ikke** som egne roller i koden. De nærmeste faktiske match er noteret under hver rolle nedenfor — men det er en oversættelse foretaget her, ikke noget der findes i `ROLLE_PERMS`.

## Modulmenu vs. permission — to forskellige spærringer

Sidebar-menuen (`nav.js`) skjuler et punkt hvis det bærer `kraeverModul` (tenanten har ikke købt modulet — kommerciel kontrol) eller `kraeverPerm` (rollen mangler en specifik permission — kun for de tre "kommercielle læsninger": `satser.laes`, `grundlag.laes`, `indkoeb.laes`, jf. beslutning 104/105). **For alt andet er sidebar-menuen ikke rollefiltreret** — enhver rolle ser samtlige øvrige menupunkter, og en afvist handling viser en `<Datatilstand>`-spærring i stedet for et skjult punkt. Det er en bevidst beslutning (nav.js: "en menu der mest består af døre der ikke kan åbnes, er værre end ingen menu" — men den regel gælder kun de tre kommercielle permissions, ikke resten).

Det betyder konkret: en rolle uden `booking.godkend` ser stadig disponerings-skærmen og kan stadig navigere til hvert eneste modul i sidebaren — kun selve SKRIVE-knappen (eller i nogle tilfælde hele nodens læsning) afvises server-side.

---

## De 7 roller

### 1. Chauffør (`chauffoer`)

- **Hvad:** Kører, indberetter og ser sine egne opgaver.
- **Moduler synlige i menu:** ⚠ **Reelt ingen** — siden beslutning 117 kan en chauffør slet ikke nå AppShell/sidebaren overhovedet. Han er begrænset til `/app/*` (chaufførappen), en helt separat UI-skal uden sidebar. Tabellen nedenfor beskriver hvad hans permission-sæt teknisk tillader, hvilket historisk var det der blev vist i AppShell før 117, og som stadig er det RTDB-reglerne tillader hvis nogen forsøger direkte adgang.
- **Permissions:** `BASIS_LAES` (booking.laes, kunder.laes, koeretoejer.laes, fravaer.laes, personale.laes) + `indberetninger.skriv`.
- **Primære handlinger:** Se egne ture (Turplan), melde status pr. stop, oprette egne indberetninger (skade/tank/fejl), stemple ind/ud, søge fravær.
- **Kræver særlig permission:** Intet ud over `indberetninger.skriv` — han kan ikke skrive noget andet sted i systemet.
- **Dashboards:** Ingen — chaufførappen har intet KPI-dashboard, kun "Forside" med dagens ture.
- **Administrative funktioner:** Ingen.
- **Hvorfor (fra kildekoden):** "Skriver kun indberetninger. Intet klassificeret — hverken godsets værdi, privatadresser eller kollegers fraværsårsag."

### 2. Sagsbehandler (`casehandler`) — nærmeste match til "Indkøber"/"Case-håndterer"

- **Hvad:** Opretter bookinger og holder styr på kundedialogen.
- **Moduler synlige:** Alle (ingen af hans permissions matcher noget `kraeverPerm`-forbud — han har faktisk alle tre kommercielle læsninger).
- **Permissions:** `BASIS_LAES` + `BASIS_DATA` (kunder/opgaver/fravaer/facility/indkoeb/indberetninger.skriv) + `KOMMERCIEL_LAES` (satser.laes, grundlag.laes, indkoeb.laes — alle tre) + `booking.opret`, `grundlag.skriv`, `sag.laes`, `sag.sensitiveLaes`, `sag.skriv`.
- **Primære handlinger:** Oprette booking-forespørgsler, udarbejde fakturagrundlag (men ikke godkende det), læse og skrive på sagstråde.
- **Kræver særlig permission:** Kan IKKE foreslå (`booking.foreslaa`) eller godkende (`booking.godkend`) — en booking skal gennem disponering før den bliver en tur.
- **Dashboards:** Standarddashboardet — ingen rollefiltrering af widgets fundet i `dashboardvisning.js`/`widgets.js` (bekræftes/afkræftes i modul-dossiererne, ikke gentaget her).
- **Administrative funktioner:** Ingen.

### 3. Disponent (`disponent`) — "Planner"

- **Hvad:** Planlægger ture, tildeler biler og folk.
- **Moduler synlige:** Alle undtagen **Fakturering** (kræver `grundlag.laes`, som disponenten ikke har).
- **Permissions:** `BASIS_LAES` + `BASIS_DATA` + `koeretoejer.skriv`, `booking.foreslaa`, `booking.afvis`, `booking.udfoer`, `booking.sensitiveLaes`, `satser.laes`, `indkoeb.laes` (2 af 3 kommercielle — IKKE `grundlag.laes`), `koeretoejer.sensitiveLaes`, `sag.laes` (kun general-delen).
- **Primære handlinger:** Foreslå en tur, afvise/udføre, se køretøjers live-GPS, se følgebilskrav/afhentningsadresse.
- **Kræver særlig permission:** ⚠ Har **ikke** `booking.godkend` — beslutning 5: den der foreslår, godkender ikke sit eget forslag. Ser IKKE godsets vurdering (`booking.vaerdiLaes`) eller fakturagrundlaget.
- **Dashboards:** Standard.
- **Administrative funktioner:** Ingen.

### 4. Koordinator (`koordinator`) — "Godkender"

- **Hvad:** Godkender, returnerer og lukker bookinger.
- **Moduler synlige:** Alle.
- **Permissions:** `BASIS_LAES` + `BASIS_DATA` + `booking.godkend`, `booking.returner`, `booking.afvis`, `booking.annuller`, `booking.udfoer`, `booking.sensitiveLaes`, `booking.vaerdiLaes`, alle tre `KOMMERCIEL_LAES`, `koeretoejer.sensitiveLaes`, `kunder.sensitiveLaes`, `grundlag.skriv`, `grundlag.godkend`, `indkoeb.godkend`, `indberetninger.sensitiveLaes`, alle fem `sag.*` (inkl. `sag.karantaeneFrigiv`, `sag.aftaleBekraeft`).
- **Primære handlinger:** Godkende/returnere/afvise/annullere bookinger, godkende fakturagrundlag OG indkøb, se godsets vurdering, håndtere sagstråde inkl. karantænefrigivelse og aftalebekræftelse.
- **Kræver særlig permission:** Ingen yderligere — dette er den bredeste driftsrolle uden at være admin.
- **Dashboards:** Standard.
- **Administrative funktioner:** Ingen (ingen `brugere.skriv`).
- **Bemærkning:** Den eneste driftsrolle med `indberetninger.sensitiveLaes` og den eneste der ser BÅDE fakturagrundlaget og godsets vurdering — koncentrerer meget beslutningskraft i én rolle.

### 5. Lagermedarbejder (`lagermedarbejder`) — "Lageransvarlig"/"Lagermedarbejder"

- **Hvad:** Pakker, klargør, udleverer og modtager retur på lageret (Unitbooking + Warehouse).
- **Moduler synlige:** Alle undtagen **Fakturering** (samme grund som disponenten — ingen `grundlag.laes`).
- **Permissions:** `BASIS_LAES` + `satser.laes`, `indkoeb.laes` (2 af 3), `kasser.skriv`, `kasseudlaan.skriv`, `reolpladser.skriv`, `varer.skriv`, `bevaegelser.skriv`, `carriers.skriv`, `indberetninger.skriv`.
- **Primære handlinger:** Alt operationelt i Unitbooking og Warehouse (samme mand, to moduler — bevidst ikke to roller), egne indberetninger (fx en beskadiget kasse).
- **Kræver særlig permission:** Kan IKKE oprette en booking, røre en kunde, eller se fakturagrundlaget. Kan se priser (rettet i kildekoden fra en tidligere forkert kommentar, jf. beslutning 104).
- **Dashboards:** Standard.
- **Administrative funktioner:** Ingen.
- **⚠ Iagttagelse til 08/10 (UI/overlap):** Fordi han har `satser.laes`, ser han også Bookingopsætning-menupunktet (kræver kun `satser.laes`) og hele Procure-menuen (kræver `indkoeb.laes`) — selvom intet i hans rolle-beskrivelse nævner booking- eller indkøbsadministration. Dette er et eksempel på at et administrativt/kommercielt menupunkt ligger fremme for en rolle hvis daglige arbejde er noget helt andet, fordi `kraeverPerm`-filteret er permission-baseret og ikke rolle-baseret.

### 6. Revisor (`revisor`) — "Read-only"/"Økonomi" (delvist)

- **Hvad:** Læser alt driftsdata og auditloggen. Skriver intet, nogen steder.
- **Moduler synlige:** Alle (har alle tre `KOMMERCIEL_LAES`).
- **Permissions:** `BASIS_LAES` + alle tre `KOMMERCIEL_LAES` + `audit.laes`, `sag.laes` (ikke sensitive), `retention.laes` (ikke skriv — beslutning 115/118).
- **Primære handlinger:** Læse — intet andet. Kan verificere AT auditloggen findes og hvad den registrerer, og AT et legal hold findes og hvorfor.
- **Kræver særlig permission:** Ingen skriverettighed nogen steder — bevidst designet sådan.
- **Dashboards:** Standard, alle KPI'er synlige (ingen skrive-widgets relevante).
- **Administrative funktioner:** Ingen.
- **⚠ Iagttagelse:** Fordi revisor har alle tre kommercielle læsninger, ser han ALLE de `kraeverPerm`-styrede menupunkter (Bookingopsætning, hele Procure, Fakturacenter, Fakturering, Standardpriser, Kundepriser, Warehouse Afregning/Volumen) — men enhver handling på dem afvises server-side. En revisor der klikker "Gem" hvor som helst, ser altså en permission-denied, ikke en skjult knap. Dette er konsistent med designprincippet ("menuen tier ikke for de tre"), men er værd at teste i en UI-gennemgang: er fejlbeskeden tydelig nok til at en revisor forstår HVORFOR han ikke kan gemme?

### 7. Administrator (`admin`)

- **Hvad:** Alt — `[...ALLE_PERMS]`, uden undtagelse.
- **Moduler synlige:** Alle.
- **Permissions:** Samtlige permissions i kataloget, inkl. `brugere.skriv` (den eneste rolle der har den som standard).
- **Primære handlinger:** Alt enhver anden rolle kan, plus brugeroprettelse/rolletildeling, rolleredigering (`roller/<rolle>/perms`), retention legal hold (`retention.skriv`).
- **Kræver særlig permission:** N/A.
- **Dashboards:** Alle.
- **Administrative funktioner:** Den ENESTE rolle der kan: oprette/redigere brugere og logins, ændre hvilke permissions en rolle har for tenanten, sætte/ophæve et legal hold.
- **Hvorfor (fra kildekoden):** "Har hver eneste permission. Derfor er det den rolle der skal gives færrest af."

---

## Nøglepermission der ikke må forsvinde

`brugere.skriv` (`PERM.brugereSkriv`, kaldet `NOEGLEPERM` i koden) har en dedikeret beskyttelsesfunktion, `laaserUde()`: systemet nægter eksplicit at fjerne denne permission fra den SIDSTE rolle der har den — og nægter at en bruger fjerner den fra sin egen rolle, selv hvis en anden rolle stadig har den. Uden denne beskyttelse kunne en tenant permanent låse sig selv ude af sin egen brugeradministration fra klienten. Dette er den eneste permission i kataloget med en sådan dedikeret beskyttelse.

## Kendt begrænsning: claims er ikke live

En permissions-ændring i kode (nyt medlem af et preset) rammer **ikke** eksisterende brugeres tokens automatisk — kun brugere provisioneret/rolleskiftet EFTER ændringen får den nye permission. Der findes ingen automatisk "genudsted alle claims"-mekanisme i produktion; det kræver en Cloud Function der kalder `setCustomUserClaims` + `revokeRefreshTokens` for hver bruger. Dette er dokumenteret i kildekoden selv som en kendt fælde ("Det blev fundet med brugere.skriv...").

## Roller kontra brugerens angivne persona-liste

| Bruger nævnte | Faktisk nærmeste rolle i kode | Bemærkning |
|---|---|---|
| Administrator | `admin` | Direkte match |
| Planner/disponent | `disponent` | Direkte match |
| Koordinator | `koordinator` | Direkte match |
| Fleet-ansvarlig | *(ingen egen rolle)* | Fleet-skærme er tilgængelige for enhver rolle med adgang til AppShell; der findes ingen permission der er specifik for Fleet alene |
| Facility-ansvarlig | *(ingen egen rolle)* | Samme som Fleet — ingen Facility-specifik permission eller rolle |
| Indkøber | `casehandler` (delvist) | Casehandler har `indkoeb.laes`, men ingen rolle hedder eller er dedikeret til indkøb specifikt |
| Godkender | `koordinator` (booking+grundlag+indkøb) | Godkendelse er spredt ud over flere permissions, alle samlet på koordinator-rollen — der findes ikke en separat "godkender"-rolle |
| Lageransvarlig | `lagermedarbejder` | Nærmeste match, men navnet i koden er bevidst "medarbejder" ikke "ansvarlig" — ingen skelnen mellem leder og medarbejder på lageret |
| Lagermedarbejder | `lagermedarbejder` | Direkte match |
| Chauffør | `chauffoer` | Direkte match |
| Økonomi | *(ingen egen rolle)* | De økonomirelevante permissions (`grundlag.*`, `satser.*`) er fordelt på casehandler/koordinator; der er ingen dedikeret "økonomi"-rolle |
| Read-only | `revisor` (nærmest) | Revisor er read-only, men bredere end en generisk "read-only"-rolle — han har audit- og retention-læsning specifikt |
| Support | *(ingen egen rolle)* | Support-modulet er tilgængeligt for enhver rolle med AppShell-adgang; der er ingen permission der styrer hvem der kan besvare en supportsag internt — se dossieret for Support & Ejerkonsol |
