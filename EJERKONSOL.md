# Ejerkonsollen — specifikation

Et sted hvor Jørn og Dennis opretter kunder, sætter dem på pause, opsiger dem
og tildeler moduler. **Dette er specifikationen, ikke skærmen.** Datamodellen
her er den dyreste at ændre bagefter, og derfor står den før koden.

Læs `ARKITEKTUR.md` og beslutning 17, 24, 28, 31 og 32 først. Konsollen er den
**anden** krydsning af tenant-grænsen — support var den første (beslutning 24).

---

## 0. Hvad der allerede findes

Byg det ikke om. Det er bygget, udrullet og prøvet:

| Ting | Hvor | Tilstand |
|---|---|---|
| `udbyder: true` som custom claim | `scripts/opret-kunde.mjs --giv-udbyder` | virker |
| `udbyder/kunder/<id>` — eksistensindeks | `firebase.rules.json:821` | `.read` for udbyder, `.write: false` |
| `tenants/<id>/virksomhed` og `/moduler` læsbar for udbyder | `firebase.rules.json:78,89` | virker |
| Prøver på at claim'et ikke når kundedata | `test/rules.udbyder.test.mjs` | grøn |
| Modulkataloget | `src/fleet/moduler.js` | ét sted, uden imports |
| Modullisten som kommando | `npm run kunde:moduler` | virker |
| Kundeoprettelse som kommando | `npm run kunde:opret` | virker |

⚠ **Der findes ingen `platformOwners/`-node.** Ejerskab er et claim, ikke en
node, og indekset hedder `udbyder/kunder`. Det er værd at have præcist, fordi
en spec der navngiver noget der ikke findes, får den næste til at lede.

---

## 1. Fire beslutninger — ALLE TRUFNE OG BYGGET

### Beslutning 34 — ✅ konsollen skriver ikke

Alt hvad konsollen gør, går gennem en Cloud Function med et
`udbyder`-tjek som første handling. `udbyder/kunder` er allerede
`.write: false`, og `tenants/<id>/moduler` skal blive det.

**Hvorfor det ikke er nok at stole på claim'et i browseren:** en klient der
må skrive til `tenants/<id>/moduler` for ét `<id>`, kan skrive til dem alle —
reglen kan ikke kende forskel på "min kunde" og "en anden kunde", når begge
er kunder. Serveren kan, fordi den kender handlingen.

Det er samme begrundelse som `opretbruger`, og logikken findes allerede som
scripts. Det er ikke ny logik; det er den samme flyttet et sted hen hvor en
browser kan nå den.

**Hver handling skal i auditloggen** — under **kundens** tenant,
`audit/<kundeId>/sikkerhed/`, med ejerens uid. Ikke i en separat ejerlog.
Kunden skal kunne se at hans abonnement blev ændret; det er hans abonnement.
Og én auditmekanisme frem for to.

⚠ `aarsag` er **ikke fritekst**. Allowliste: `betaling`, `kundeoensket`,
`proeveperiodeUdloebet`, `fejloprettet`. Fritekst i auditloggen er præcis det
`audit-regler.js` findes for at holde ude.

### Beslutning 32 — ✅ TRUFFET OG BYGGET

**Et lukket abonnement lukker tenanten, ikke kontoen.** Se `BESLUTNINGER.md`
nr. 32 for hele begrundelsen. Kort:

Jørn valgte **loginspærring** frem for min anbefaling om skrivespærring. Det
er bygget som en spærring på **tenanten**, ikke på kontoen — og det løser
netop den indvending jeg rejste:

> Login-spærring kan ikke rulles tilbage rent: nogle konti er spærret
> *individuelt*, og ved genåbning ville man genåbne folk der var fyret.

`tenants/<id>/abonnement/status` er `aktiv | paused | opsagt`, og **hver
eneste regel under tenanten kræver `aktiv`** — 41 steder. Brugeren kan stadig
autentificere sig, men hver læsning og skrivning afvises, og appen viser en
låseskærm. **Ingen konto røres. Genåbning er ét felt.**

Tre noder bliver læsbare — `virksomhed`, `moduler`, `abonnement` — så
låseskærmen kan skrive kundens navn og sige hvorfor.

Reglen fejler **åbent** på en manglende node, som `harModul()`. Efterprøvet
mod den udrullede base med en rigtig bruger: fjorten punkter, alle holdt.

⚠ **`opsagt` sletter ikke.** Egentlig sletning er en manuel proces med en
kontrakt bag, ikke en knap i en konsol. En knap der findes, bliver trykket
på — samme begrundelse som at `skriv.js` ikke har en `slet()`.

### Beslutning 33 — ✅ moduler håndhæves i reglerne, læsning OG skrivning

⚠ **Det her bryder en note der står i koden i dag**, og bruddet skal være
bevidst. `src/fleet/moduler.js` siger med rene ord at modulafkrydsning er en
**kommerciel** kontrol og ikke en sikkerhedskontrol, og at `harModul()`
fejler **åbent** med vilje. Det var rigtigt, da modullisten kun tegnede en
sidebar. Det holder ikke, når man kan **fratage** et modul: gør vi kun det,
har kunden stadig sine data og sit API, og modulet er ikke solgt — det er
foreslået.

**Jørn har valgt at håndhævelsen rammer BÅDE `.read` og `.write`.** Jeg
anbefalede kun skrivning; valget er truffet, og det er det stærkere af de to
kommercielt. Men det har en konsekvens der skal stå skrevet ned, fordi den
først viser sig når nogen står i den:

⚠ **En kunde der får et modul frataget, kan ikke længere hente sine egne data
ud gennem appen.** De ligger der — intet slettes — men den eneste vej til dem
går gennem servicekontoen. Fravælges Flåde for en kunde der har kørt to år,
er hans køretøjshistorik utilgængelig for ham selv fra det sekund.

**Det følger heraf, at et modul ikke må fravælges uden en aftale.** Det er
ikke en teknisk begrænsning — reglerne er ligeglade — men konsollen skal
spørge, og fravalget skal i auditloggen med en årsag. Skal en kunde have sine
data med ud, skal det ske **før** modulet slås fra.

Overvej derfor et **eksportskridt** i konsollen, før fravalget kan gennemføres.
Det er ikke med i punkt 2; det er noteret her, så det ikke bliver opdaget af
en kunde i stedet for af os.

⚠ **Reglen skal fejle ÅBENT på en manglende `moduler`-node**, præcis som
`harModul()` gør:

```
(!root.child('tenants').child($tenantId).child('moduler').exists()
 || root.child('tenants').child($tenantId).child('moduler').child('flaade').val() === true)
```

Fejlede den lukket, ville en betalende kunde hvis modulliste af en eller anden
grund manglede, stå med et system der afviser hver skrivning. Noden er
`.write: false`, så ingen kan fjerne den for at slippe udenom.

⚠ **`personale` gates IKKE af `bemanding`.** `permissions.js` siger allerede
hvorfor: personale ligger i **basen**, fordi enhver abonnementskombination har
medarbejdere. `bemanding` gater vagtplan, `fravaer` og `kompetencer`.
`kpi/` gates heller ikke — det er ét aggregat, og et modul man ikke har,
har ingen tal.

### Beslutning 35 — ✅ ejerskab tildeles ikke fra konsollen

Konsollen kan ikke give eller fjerne `udbyder`-claim'et. Det sker fortsat med
`npm run ejer:giv` fra en maskine med servicekontonøglen.

**Hvorfor:** I er to. Kunne den ene fjerne den andens claim, kunne den ene
lukke den anden ude — og adgangen til at rette det var selv ejerskabet. Det
er nøjagtig beslutning 31 om igen, bare med højere indsats.

De to ejere har i øvrigt **samme rettigheder**. Alt logges. Det er
simplere end et fire-øjne-princip, og et fire-øjne-princip med to personer er
ikke et princip — det er en aftale om altid at være to på kontoret.

---

## 2. Datamodellen

```
tenants/<kundeId>/
  _findes:     true
  virksomhed:  { navn, cvr, oprettetMs }
  abonnement:  { status, aendretMs, aendretAf, aarsag }      ← NY
  moduler:     { flaade: true, facility: true, ... }

udbyder/kunder/<kundeId>: { oprettetMs }                     ← SLANKES
```

**`status` flytter fra indekset ned til tenanten.** I dag står den i
`udbyder/kunder/<id>/status`, hvor **kunden ikke kan læse den** — og så kan
skærmen ikke fortælle ham hvorfor han ikke kan skrive. Reglernes egen note
siger det allerede: navn og moduler står under tenanten, ikke kopieret ind i
indekset, *"en kopi ville drive, og udbyderen ville se et andet navn end
kunden selv."* Status er samme slags felt.

`udbyder/kunder` bliver derefter en ren **eksistensliste**: hvilke tenants
findes, og hvornår blev de oprettet. Alt andet læses fra tenanten.

**Regler:**

| Node | `.read` | `.write` |
|---|---|---|
| `abonnement` | tenant-medlem **eller** udbyder | `false` |
| `moduler` | uændret | `false` (er allerede) |
| `udbyder/kunder` | udbyder | `false` (er allerede) |

`abonnement` skal have samme `_findes`-markørkrav som `virksomhed`, og
`status` valideres mod `^(aktiv|paused|opsagt)$`.

---

## 3. Funktionerne

Tre callables, region `europe-west1`, **små bogstaver** (en 2. generations
funktion bliver til en Cloud Run-tjeneste, og et tjenestenavn må kun være
småt — det kostede en fejlsøgning sidste gang):

| Navn | Nyttelast | Gør |
|---|---|---|
| `kundeopret` | `id, navn, cvr, moduler[]` | `_findes`, `virksomhed`, `abonnement: aktiv`, `moduler`, indekspost |
| `kundemoduler` | `id, moduler[]` | overskriver modullisten |
| `kundestatus` | `id, status, aarsag` | sætter abonnementsstatus |

Alle tre starter med `kraevUdbyder(req)` — `auth.token.udbyder === true`,
ellers `permission-denied`. Alle tre skriver en auditpost hos kunden.

**Den første administrator oprettes ikke af `kundeopret`.** Den bruger
`opretbruger`, som allerede findes og allerede returnerer et engangsløsen —
men den tager tenanten fra kalderens token, og en ejer har ikke kundens
tenant. Der skal derfor være en fjerde: `kundeadmin(id, email, navn, kode)`,
som er `opretbruger` med tenanten fra nyttelasten **og** et udbyder-tjek i
stedet for et `brugere.skriv`-tjek. Den deler kode med `opretbruger`; den
kopierer den ikke.

⚠ **`kundeopret` må ikke seede demo-data.** Det er hele pointen med den tomme
platform, og `opret-kunde.mjs` siger allerede hvorfor: en kunde der får DEMO
Transports fjorten biler ved oprettelsen, skal slette dem manuelt — og han
sletter aldrig dem alle.

---

## 4. Hvor konsollen bor

**Samme app, ruten `/main`, uden for `AppShell`.**

Shellen ejer sidebar, tenant-vælger og periodevælger, og alle tre hører til en
**kundekontekst**. Ejeren står ikke i en. Konsollen får sin egen ramme.

⚠ **`harAdgang` i `App.jsx` må ikke løsnes.** Den kræver et tenant-claim, og
det skal den blive ved med. Konsollen får en **sideordnet** betingelse:

```js
const harAdgang  = Boolean(bruger?.tenant);      // uændret
const erUdbyder  = bruger?.udbyder === true;     // ny, sideordnet
```

De to rutetræer er disjunkte. En ejer **uden** tenant-claim skal kunne bruge
`/main` og intet andet — ellers skal Dennis have en kunstig kundetenant for at
kunne logge ind, og en konto der findes for at omgå en spærring er en konto
ingen tør røre bagefter.

`bruger.udbyder` skal med i `hentBrugerContext`. Den bruges kun til at
**tegne** — håndhævelsen ligger i funktionerne og i reglerne.

---

## 5. Rækkefølge

Reglerne før skærmen. Det er din egen formulering fra Flåde-formularen:
*ellers bliver formularen den eneste kontrol, og det er hele mønstret vi har
bygget imod.*

1. ✅ **`abonnement`-noden + regler + prøver.** Gjort: 812 grønne,
   udrullet, og efterprøvet mod den udrullede base med en rigtig bruger
   (beslutning 29). Låseskærmen i `App.jsx` fulgte med.
2. ✅ **Modulhåndhævelsen i reglerne.** Gjort: `NODE_MODUL` i moduler.js, 27 regler, lint i begge retninger, udrullet og efterprøvet mod driften. Beslutning 33.
3. **De fire funktioner** + `npm run funktioner:udrul`, efterprøvet med
   rigtige konti i begge retninger: en kundeadmin skal få
   `permission-denied` på alle fire.
4. ✅ **Skærmen.** `/main`, uden for AppShell. Beslutning 35.

Punkt 1 og 2 er værdifulde alene. Punkt 4 er værdiløst uden dem.

⚠ **De fire Cloud Run-tjenester mangler invoker-bindingen.** Indtil de åbnes i
konsollen, får ALLE 401 — også en gyldig ejer. `npm run funktioner:aabn` kan
ikke sætte den: tjenestekontoen må ikke `run.services.list`. Samme skridt som
de tre første funktioner krævede.

---

## 6. Spørgsmålene

1. ~~Pause = skrivespærring eller loginspærring?~~ **Besvaret: loginspærring.**
   Bygget som en spærring på tenanten — se beslutning 32.
2. ~~Modul fravalgt = kun skrivning, eller også læsning?~~
   **Besvaret: begge dele.** Se beslutning 34 — og især konsekvensen dér:
   kunden kan ikke længere hente sine egne data ud gennem appen, så et
   fravalg skal aftales, ikke bare klikkes.
3. ~~Skal Dennis have en kundetenant?~~ **Besvaret: nej — for jer begge.**
   To rene ejerkonti uden tenant-claim. Det gør `/main` til den eneste rute
   de kan nå, og det gør spærringen ægte: en konto uden tenant kan ikke læse
   én eneste kundes data, uanset hvad en klient sender.
   ⚠ **Det betyder at `harAdgang` ikke må løsnes.** Ejerruten er sideordnet,
   ikke en udvidelse af kundens — se afsnit 4.
4. ~~Hvor længe opbevares data efter `opsagt`?~~ **Besvaret: 90 dage.**
   `OPBEVARING_DAGE` i `abonnement.js`, og datoen er **afledt** af
   `aendretMs` — ikke gemt. Et gemt `sletTidligstMs` ville drive fra sit
   grundlag i det sekund nogen genåbnede og opsagde igen.

   ⚠ **Der slettes intet automatisk, og skærmen lover det ikke.** Der står
   *"slettes tidligst den …"*, ikke *"slettes den …"*. En lovet sletning der
   ikke sker, er samme slags løgn som at kalde en afvist læsning for en
   netværksfejl — den ser rigtig ud. Skal fristen håndhæves, er det en opgave
   for sig, og den hører sammen med at auditopbevaringen heller ikke er
   afgjort (`BESLUTNINGER.md`, "Audit-retention er ikke afgjort").

---

## 7. Nodetabellen, punkt 2 mangler et svar på

Modulhåndhævelsen kræver at hver node hører til et modul. De fleste giver sig
selv. **Tre gør ikke**, og et forkert gæt låser en kunde ude af noget han har
betalt for:

| Node | Modul | Sikker? |
|---|---|---|
| `koeretoejer`, `sensitive/koeretoejer`, `indberetninger` | `flaade` | ✔ |
| `facility` | `facility` | ✔ |
| `indkoeb`, `fakturaer`, `lagre` | `indkoeb` | ✔ |
| `bookinger`, `sensitive/bookinger`, `vaerdi/bookinger`, `etaper`, `reservationer` | `booking` | ✔ |
| `fravaer`, `sensitive/fravaer`, `kompetencer` | `bemanding` | ✔ |
| `kunder`, `sensitive/kunder` | `kunder` | ✔ |
| `personale`, `sensitive/personale` | **ingen — basen** | ✔ `permissions.js` siger hvorfor: enhver abonnementskombination har medarbejdere |
| `kpi` | **ingen** | ✔ ét aggregat; et modul man ikke har, har ingen tal |
| `roller`, `brugere`, `countere`, `virksomhed`, `moduler`, `abonnement` | **ingen — basen** | ✔ |
| **`opgaver`** | ? | ⚠ `art` er `vaerksted` \| `facility` (beslutning 21). Den hører til **to** moduler |
| **`satser`** | ? | ⚠ prisgrupper hører til `kunder`, men kalkulationsprisen bruges af `booking` |
| **`fakturaer`** | ? | ⚠ ligger i Indkøb, men Økonomi læser dem |

For de tre: **min anbefaling er at lade dem være ugatede** (basen). En node
der hører til to moduler, kan ikke gates af ét af dem uden at det andet går i
stykker — og alternativet, at gate på "har mindst ét af dem", er en regel
ingen kan læse sig til bagefter.
