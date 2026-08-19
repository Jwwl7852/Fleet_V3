# Rollegennemgang — hvad hver rolle faktisk kan se

Der er syv roller. Det her dokument siger hvad de **faktisk** kan læse og
skrive i dag — ikke hvad presettet lover.

## ⚠ Metoden: målt, ikke påstået

`ROLLE_PERMS` siger hvad en rolle **har**. Regelfilen siger hvad en node
**kræver**. De to har været uenige før, og en matrix skrevet af ud fra koden
ville arve begge fejl.

Læsesiden herunder er derfor **målt**: der logges ind som hver af de syv
seedede DEV-brugere mod det udrullede DEV-projekt, og hver node i regelfilen
læses rigtigt. Nodelisten kommer fra regelfilen selv, så en ny node ikke kan
glemmes.

Skrivesiden er **også målt** — men i EMULATOREN, ikke i DEV. En skrivning
ville lægge affald i basen, og emulatoren kan smides væk. Den kører den samme
regelfil som er udrullet, og `npm run regler:udrul` sammenligner de to.

⚠ **Første udgave af skrivetabellen var UDLEDT af regelfilen, og den var
forkert.** `indberetninger` blev admin-only, fordi jeg læste
`(skriv OG din egen post) ELLER skrivAlle` som en simpel OG. Virkeligheden er
at enhver chauffør må oprette sin egen. En matrix man ikke kan stå inde for,
er værre end ingen — og det er derfor den nu måles frem for at udledes.

---

## Læsning — målt mod det udrullede DEV

55 stier. `ja` betyder at læsningen gik igennem; `nej` at serveren afviste.

| Node | chauff | caseha | dispon | koordi | lagerm | reviso | admin |
|---|---|---|---|---|---|---|---|
| `_findes` ⚠ | **nej** | **nej** | **nej** | **nej** | **nej** | **nej** | **nej** |
| `virksomhed` | ja | ja | ja | ja | ja | ja | ja |
| `abonnement` | ja | ja | ja | ja | ja | ja | ja |
| `moduler` | ja | ja | ja | ja | ja | ja | ja |
| `brugerlayout` | ja | ja | ja | ja | ja | ja | ja |
| `dashboardvisning` | ja | ja | ja | ja | ja | ja | ja |
| `roller` | ja | ja | ja | ja | ja | ja | ja |
| `brugere` | ja | ja | ja | ja | ja | ja | ja |
| `sensitive/bookinger` ⚠ | **nej** | **nej** | ja | ja | **nej** | **nej** | ja |
| `sensitive/kunder` ⚠ | **nej** | **nej** | **nej** | ja | **nej** | **nej** | ja |
| `sensitive/koeretoejer` ⚠ | **nej** | **nej** | ja | ja | **nej** | **nej** | ja |
| `sensitive/personale` ⚠ | **nej** | **nej** | **nej** | **nej** | **nej** | **nej** | ja |
| `sensitive/fravaer` ⚠ | **nej** | **nej** | **nej** | **nej** | **nej** | **nej** | ja |
| `sensitive/indberetninger` ⚠ | **nej** | **nej** | **nej** | ja | **nej** | **nej** | ja |
| `vaerdi/bookinger` ⚠ | **nej** | **nej** | **nej** | ja | **nej** | **nej** | ja |
| `personale` | ja | ja | ja | ja | ja | ja | ja |
| `kompetencer` | ja | ja | ja | ja | ja | ja | ja |
| `kpi/gods/current/opgaver` | ja | ja | ja | ja | ja | ja | ja |
| `kpi/gods/current/flaade` | ja | ja | ja | ja | ja | ja | ja |
| `kpi/gods/current/bemanding` | ja | ja | ja | ja | ja | ja | ja |
| `kpi/gods/current/facility` | ja | ja | ja | ja | ja | ja | ja |
| `kpi/gods/current/indkoeb` | ja | ja | ja | ja | ja | ja | ja |
| `kpi/gods/current/kunder` | ja | ja | ja | ja | ja | ja | ja |
| `kpi/gods/current/oekonomi` | ja | ja | ja | ja | ja | ja | ja |
| `kpi/gods/current/afvigelser` | ja | ja | ja | ja | ja | ja | ja |
| `kpi/gods/current/warehouse` | ja | ja | ja | ja | ja | ja | ja |
| `kpi/gods/current/disponering` | ja | ja | ja | ja | ja | ja | ja |
| `reservationer` | ja | ja | ja | ja | ja | ja | ja |
| `bookinger` | ja | ja | ja | ja | ja | ja | ja |
| `etaper` | ja | ja | ja | ja | ja | ja | ja |
| `lagre` | ja | ja | ja | ja | ja | ja | ja |
| `countere` | ja | ja | ja | ja | ja | ja | ja |
| `grundlag` | ja | ja | ja | ja | ja | ja | ja |
| `omkostninger` | ja | ja | ja | ja | ja | ja | ja |
| `satser` | ja | ja | ja | ja | ja | ja | ja |
| `opgaver` | ja | ja | ja | ja | ja | ja | ja |
| `koeretoejer` | ja | ja | ja | ja | ja | ja | ja |
| `indberetninger` | ja | ja | ja | ja | ja | ja | ja |
| `fravaer` | ja | ja | ja | ja | ja | ja | ja |
| `facility` | ja | ja | ja | ja | ja | ja | ja |
| `leverandoerer` | ja | ja | ja | ja | ja | ja | ja |
| `indkoeb` | ja | ja | ja | ja | ja | ja | ja |
| `fakturaer` | ja | ja | ja | ja | ja | ja | ja |
| `kassetyper` | ja | ja | ja | ja | ja | ja | ja |
| `reolpladser` | ja | ja | ja | ja | ja | ja | ja |
| `kasser` | ja | ja | ja | ja | ja | ja | ja |
| `kasseudlaan` | ja | ja | ja | ja | ja | ja | ja |
| `varer` | ja | ja | ja | ja | ja | ja | ja |
| `carriers` | ja | ja | ja | ja | ja | ja | ja |
| `bevaegelser` | ja | ja | ja | ja | ja | ja | ja |
| `beholdning` | ja | ja | ja | ja | ja | ja | ja |
| `enheder` | ja | ja | ja | ja | ja | ja | ja |
| `plukordrer` | ja | ja | ja | ja | ja | ja | ja |
| `optaellinger` | ja | ja | ja | ja | ja | ja | ja |
| `kunder` | ja | ja | ja | ja | ja | ja | ja |

⚠ `_findes` står med **nej** hele vejen, og det er ikke en rolleforskel — det
er en node der med vilje ikke kan læses af nogen klient. Markøren afgør om
tenanten overhovedet er provisioneret; kunne den læses, kunne man opregne
tenants. Se `rules.tenant.test.mjs`, hvor den står på nægtelisten.

### ⚠ Fundet: 48 af 55 er ens for alle syv roller

Kun **syv** stier skiller rollerne ad, og alle syv er de klassificerede
søskendenoder fra beslutning 17:

| Sti | Hvem kan læse |
|---|---|
| `sensitive/bookinger` | disponent, koordinator, admin |
| `sensitive/koeretoejer` | disponent, koordinator, admin |
| `sensitive/kunder` | koordinator, admin |
| `sensitive/indberetninger` | koordinator, admin |
| `vaerdi/bookinger` | koordinator, admin |
| `sensitive/personale` | **kun** admin |
| `sensitive/fravaer` | **kun** admin |

Alt andet er ens. En **chauffør** kan altså læse kundelisten, fakturagrundlaget,
indkøbene, satserne, prislisterne, brugerlisten, abonnementet og hvert eneste
nøgletal — herunder `kpi/<division>/current/oekonomi`.

Det er ikke en fejl i implementeringen. Det er modellen: **læse-permissionerne
ligger alle i basen**, så hver rolle har dem. Kun `audit.laes` skiller admin og
revisor fra resten, og `audit/` ligger uden for tenanten og er derfor ikke i
tabellen.

⚠ **Mekanismen fra beslutning 17 VIRKER.** Klassificeringen er den eneste
finkornede læsekontrol der findes, og den gør præcis hvad den lover. Spørgsmålet
er ikke om den virker, men om der er **for lidt** klassificeret.

---

## Skrivning — målt i emulatoren

Her er billedet det modsatte af læsesiden: **skrivningen er finkornet**, og den
er det ét sted — i reglerne.

Målingen kører i `test/rules.rollematrix.test.mjs` mod den **samme regelfil**
som er udrullet (`npm run regler:udrul` sammenligner de to, beslutning 29).
Emulatoren kan skrives i og smides væk; DEV kan ikke.

⚠ **Og fixturet prøves FØRST.** En afvisning kan komme fra en manglende
permission **eller** fra en ugyldig post, og de to ser ens ud udefra. Derfor
skriver admin hvert fixtur inden målingen: bliver det afvist, er posten
forkert, og prøven siger **det** frem for at måle videre.

Det er ikke en teoretisk forholdsregel. Første gang filen kørte, fangede den
mit eget `varer`-fixtur: `kundeId` slår op i `kunder/`, kunden fandtes ikke i
prøvetenanten, og en naiv måling ville have skrevet *"ingen rolle kan skrive
varer"* i tabellen herunder.

⚠ **Tenanten har ingen `moduler`-node.** Modulklausulerne falder tilbage på
"alt er købt", så det der måles, er **permissionen alene**. Modulsiden er
`rules.moduler.test.mjs`' ærinde.

| Node | Kræver | chauff | caseha | dispon | koordi | lagerm | reviso | admin |
|---|---|---|---|---|---|---|---|---|
| `kunder` | `kunder.skriv` | nej | **ja** | **ja** | **ja** | nej | nej | **ja** |
| `koeretoejer` | `koeretoejer.skriv` | nej | nej | **ja** | nej | nej | nej | **ja** |
| `personale` | `personale.skriv` | nej | nej | nej | nej | nej | nej | **ja** |
| `kompetencer` | `kompetencer.skriv` | nej | nej | nej | nej | nej | nej | **ja** |
| `fravaer` | `fravaer.skriv` | nej | **ja** | **ja** | **ja** | nej | nej | **ja** |
| `leverandoerer` | `indkoeb.skriv` | nej | **ja** | **ja** | **ja** | nej | nej | **ja** |
| `indkoeb` | `indkoeb.skriv` | nej | **ja** | **ja** | **ja** | nej | nej | **ja** |
| `lagre` | `lagre.skriv` | nej | nej | nej | nej | nej | nej | **ja** |
| `satser` | `satser.skriv` | nej | nej | nej | nej | nej | nej | **ja** |
| `omkostninger` | `satser.skriv` | nej | nej | nej | nej | nej | nej | **ja** |
| `varer` | `varer.skriv` | nej | nej | nej | nej | **ja** | nej | **ja** |
| `reolpladser` | `reolpladser.skriv` | nej | nej | nej | nej | **ja** | nej | **ja** |
| `brugerlayout/<uid>` | `auth.uid === $uid` | egen | egen | egen | egen | egen | egen | egen |

### ⚠ En chauffør kan ikke skrive andet end sit eget layout

Det er målt, ikke antaget — og det er den ene halvdel af modellen der virker
som den skal. Den mindst betroede rolle kan ingenting ændre.

⚠ **Med én undtagelse, og den står ikke i tabellen:** han kan oprette sin egen
**indberetning**. Reglen er `(indberetninger.skriv OG posten er din egen)
ELLER indberetninger.skrivAlle`, og den form kan en ja/nej-kolonne ikke rumme.
Den er demonstreret i `rules.indberetninger.test.mjs`.

⚠ **Og det var netop den regel der afslørede at en udledt matrix ikke duer.**
Min første tabel læste `&&` hvor der stod `||` og gjorde noden admin-only.

### 19 noder kan slet ikke skrives af en klient

`_findes`, `virksomhed`, `abonnement`, `moduler`, `dashboardvisning`, `roller`,
`brugere`, `sensitive/bookinger`, `vaerdi/bookinger`, `kpi`, `reservationer`,
`bookinger`, `etaper`, `countere`, `grundlag`, `opgaver`, `fakturaer`,
`kasseudlaan`, `bevaegelser`, `beholdning`, `enheder`, `optaellinger`.

Hver af dem har sin grund skrevet i regelfilen, og de er ikke manglende
rettigheder — det er **veje** der er lukket, fordi handlingen rører mere end
én post. Se beslutning 37, 39 og 45.

### De klassificerede søskendenoder kræver TO permissions

`sensitive/kunder` kræver `kunder.skriv` **og** `kunder.sensitiveLaes`, og
tilsvarende for de øvrige. Det er beslutning 38's greb: en `.write` kaskaderer,
så uden det andet led kunne en rolle skrive det klassificerede alene fordi den
måtte skrive det almindelige. De står ikke i tabellen ovenfor, fordi fixturerne
for dem hører sammen med `rules.klassificeret.test.mjs`.

---

## Hvad det betyder for spørgsmålet om widgets

Spørgsmålet var: *skal rollen afgøre hvilke widgets en bruger har adgang til?*

Målingen svarer at rollen i dag afgør **ingenting** om nøgletal. Beslutning 44
lukkede `kpi/` pr. **modul** — det gælder tenanten, ikke brugeren — og alle syv
roller har hver eneste læse-permission.

Et rollefilter i widgetvælgeren ville derfor være en **pæn knap**: kortet væk,
tallet åbent. Det er den værste slags kontrol, fordi den ser ud som om den
virker.

### Der er tre veje, og de er ikke lige store

**A. KPI-domænet arver nodens læse-permission.**
`kpi/<div>/current/kunder` kræver `kunder.laes`, `flaade` kræver
`koeretoejer.laes`, og så videre. Ændrer **intet** i dag — alle har dem — men
det er konsistent, og den dag en læse-permission strammes, følger nøgletallet
automatisk med. Billig, og den kan ikke tages fejl af som en løsning på
spørgsmålet.

**B. Nye læse-permissions pr. domæne.**
`oekonomi.laes`, `indkoeb.laes` og så videre, fordelt på de syv roller. Det er
dét der skal til for at rollen faktisk afgør noget. Prisen: permissions står i
**tokens**, så hver eksisterende bruger skal have et nyt claim mintet —
`skiftrolle` gør det, men det skal køres. Og fordelingen er en
**produktbeslutning**: hvem i et vognmandsfirma må se dækningsbidraget?

**C. Klassificér flere felter i stedet.**
Mekanismen fra beslutning 17 findes og virker. I stedet for nye permissions
kunne de følsomme **tal** flyttes til `vaerdi/` — som bookingernes værdier
allerede er. Det holder én mekanisme frem for to, men det er en ændring af
noden, ikke af en regel, og aggregeringen skal skrive to steder.

⚠ **Ingen af de tre kan vælges ud fra koden.** B og C er spørgsmål om hvad en
chauffør *bør* kunne se — og det er ikke et teknisk spørgsmål.

---

## Det der ikke er målt

- **De klassificerede søskendenoder er ikke i skrivematrixen.** De kræver TO
  permissions (beslutning 38), og fixturerne for dem hører sammen med
  `rules.klassificeret.test.mjs`. Kravet står citeret, men ikke målt.
- **`indberetninger` er ikke i skrivematrixen.** Reglen er `(skriv OG din egen)
  ELLER skrivAlle`, og en ja/nej-kolonne kan ikke rumme den. Den er
  demonstreret i `rules.indberetninger.test.mjs`.
- **`audit/`** ligger uden for tenanten og er ikke med. Kun admin og revisor har
  `audit.laes`.
- **Skærmenes egne `harPerm()`-kald** er ikke krydset med tabellen. En skærm kan
  skjule en knap for en rolle der godt måtte trykke på den — det er en pæn knap
  i den anden retning, og den er harmløs, men den bør kendes.
- **Ejerkonsollen** (`udbyder`-claim'et) er ikke en rolle i tenanten og står
  uden for. Se beslutning 34 og 35.
