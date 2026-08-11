# Ejerkonsollen — specifikation

Et sted hvor Jørn og Dennis opretter kunder, sætter dem på pause, opsiger dem
og tildeler moduler. **Dette er specifikationen, ikke skærmen.** Datamodellen
her er den dyreste at ændre bagefter, og derfor står den før koden.

Læs `ARKITEKTUR.md` og beslutning 17, 24, 28 og 31 først. Konsollen er den
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

## 1. Fire beslutninger, der skal træffes før koden

### Beslutning 32 (foreslået) — konsollen skriver ikke

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

### Beslutning 33 (foreslået) — pause lukker skrivningen, ikke døren

Tre tilstande: `aktiv`, `paused`, `opsagt`. **Ingen af dem sletter data.**

`paused` og `opsagt` afviser **skrivning** i `firebase.rules.json`. Læsning
består. Skærmen viser en bjælke der siger hvorfor.

**Jeg anbefaler dette frem for "login afvises", og det er en uenighed værd at
skrive ned:**

1. **Login-spærring kan ikke rulles tilbage rent.** Den ville skulle sætte
   `disabled` på hver konto — og når abonnementet genåbnes, skal de konti der
   var spærret **individuelt** blive ved med at være det. Den tilstand findes
   ikke noget sted efter man har overskrevet den. Man ville genåbne folk der
   var fyret.
2. **Kunden er dataansvarlig, I er databehandler.** Hans bogføringsmateriale
   har opbevaringspligt hos ham. Et betalingsskænderi er ikke en grund til at
   han ikke kan se sine egne tal.
3. **Skrivespærring er ét greb i reglerne** — `&& erAktiv($tenantId)` på hver
   `.write` — og det er mekanisk, ensartet og prøvbart. Login-spærring er en
   ny mekanisme ved siden af den der findes.

Skal en konkret bruger ud, findes knappen allerede: **Spær login** i
Opsætning → Brugere & roller. Den er per bruger, den husker sin tilstand, og
den kan rulles tilbage.

⚠ **`opsagt` sletter ikke.** Egentlig sletning er en manuel proces med en
kontrakt bag, ikke en knap i en konsol. En knap der findes, bliver trykket
på — det er samme begrundelse som at `skriv.js` ikke har en `slet()`.

### Beslutning 34 (foreslået) — moduler håndhæves i reglerne, på skrivning

⚠ **Det her bryder en note der står i koden i dag**, og bruddet skal være
bevidst. `src/fleet/moduler.js` siger med rene ord at modulafkrydsning er en
**kommerciel** kontrol og ikke en sikkerhedskontrol, og at `harModul()`
fejler **åbent** med vilje. Det var rigtigt, da modullisten kun tegnede en
sidebar. Det holder ikke, når man kan **fratage** et modul: gør vi kun det,
har kunden stadig sine data og sit API, og modulet er ikke solgt — det er
foreslået.

**Håndhævelsen rammer `.write`, ikke `.read`.** En kunde der nedgraderer, kan
ikke længere arbejde i modulet — men han kan stadig se og eksportere det han
selv har lagt ind. Læsespærring ville betyde at et opsagt abonnement holder
kundens egne data som gidsel, og det er hverken pænt eller lovligt sikkert.

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

### Beslutning 35 (foreslået) — ejerskab tildeles ikke fra konsollen

Konsollen kan ikke give eller fjerne `udbyder`-claim'et. Det sker fortsat med
`kunde:opret --giv-udbyder` fra en maskine med servicekontonøglen.

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

1. **`abonnement`-noden + regler + prøver.** `npm run test:rules` grøn,
   `npm run regler:udrul`, og efterprøvet mod den udrullede base — prøverne
   siger noget om filen, databasen håndhæver det udrullede (beslutning 29).
2. **Modulhåndhævelsen i reglerne.** Kræver en tabel `MODUL[x].noder` i
   `moduler.js` og en prøve der udleder sig af den, så en ny node uden
   modultilknytning fejler. Klausulen står ordret i mange noder — det er
   repoets kendte fejlmønster, og prøven er det eneste der holder dem ens.
3. **De fire funktioner** + `npm run funktioner:udrul`, efterprøvet med
   rigtige konti i begge retninger: en kundeadmin skal få
   `permission-denied` på alle fire.
4. **Skærmen.**

Punkt 1 og 2 er værdifulde alene. Punkt 4 er værdiløst uden dem.

---

## 6. Fire spørgsmål jeg ikke kan svare på

1. **Pause = skrivespærring (min anbefaling) eller loginspærring?**
   Se beslutning 33. Vælger du login, skal reversibiliteten løses først.
2. **Modul fravalgt = kun skrivning spærret (min anbefaling), eller også
   læsning?** Læsespærring er en kommerciel beslutning med en juridisk
   konsekvens; jeg gætter den ikke.
3. **Skal Dennis have en kundetenant?** Min anbefaling: nej — ren ejerkonto
   uden tenant-claim.
4. **Hvor længe opbevares data efter `opsagt`?** Skærmen skal skrive en dato
   til kunden, og jeg opfinder ikke en opbevaringsfrist. Den hører sammen med
   at auditopbevaringen heller ikke er afgjort — se `BESLUTNINGER.md`,
   "Audit-retention er ikke afgjort".
