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

⚠ **Skrivesiden er IKKE målt på samme måde**, og det står der fordi det gør en
forskel. En skrivning ville lægge affald i basen, og en fejlet skrivning kan
fejle af den **forkerte grund** — validering frem for permission. Det er
præcis den fælde `rules.division.test.mjs` advarer mod i sit eget hoved.
Skrivesiden står derfor som **regelfilens krav**, citeret frem for udledt.

Og der er en grund til ikke at udlede den: mindst én regel er ikke en simpel
OG. `indberetninger` er `(indberetninger.skriv OG posten er din egen) ELLER
indberetninger.skrivAlle`. En naiv udledning gjorde noden admin-only i en
tabel — mens virkeligheden er at **enhver chauffør må oprette sin egen**. En
matrix man ikke kan stå inde for, er værre end ingen.

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

## Skrivning — regelfilens krav

Her er billedet det modsatte: **23 af 24 skrivbare noder skiller rollerne ad.**
Skrivesiden er finkornet, og den er det ét sted — i reglerne.

| Node | Kræver | chauff | caseha | dispon | koordi | lagerm | reviso | admin |
|---|---|---|---|---|---|---|---|---|
| `_findes` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `virksomhed` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `abonnement` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `moduler` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `brugerlayout/$uid` | kun sin egen (`auth.uid === $uid`) | egen | egen | egen | egen | egen | egen | egen |
| `dashboardvisning` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `roller` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `brugere` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `sensitive/bookinger` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `sensitive/kunder` ⚠ | `kunder.skriv` + `kunder.sensitiveLaes` | **nej** | **nej** | **nej** | ja | **nej** | **nej** | ja |
| `sensitive/koeretoejer` ⚠ | `koeretoejer.skriv` + `koeretoejer.sensitiveLaes` | **nej** | **nej** | ja | **nej** | **nej** | **nej** | ja |
| `sensitive/personale` ⚠ | `personale.skriv` + `personale.sensitiveLaes` | **nej** | **nej** | **nej** | **nej** | **nej** | **nej** | ja |
| `sensitive/fravaer` ⚠ | `fravaer.skriv` + `fravaer.sensitiveLaes` | **nej** | **nej** | **nej** | **nej** | **nej** | **nej** | ja |
| `sensitive/indberetninger/$id` ⚠ | `indberetninger.skriv` + `indberetninger.sensitiveLaes` | **nej** | **nej** | **nej** | ja | **nej** | **nej** | ja |
| `vaerdi/bookinger` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `personale/$personId` ⚠ | `personale.skriv` | **nej** | **nej** | **nej** | **nej** | **nej** | **nej** | ja |
| `kompetencer/$kompetenceId` ⚠ | `kompetencer.skriv` | **nej** | **nej** | **nej** | **nej** | **nej** | **nej** | ja |
| `kpi` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `reservationer` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `bookinger` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `etaper` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `lagre` ⚠ | `lagre.skriv` | **nej** | **nej** | **nej** | **nej** | **nej** | **nej** | ja |
| `countere` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `grundlag` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `omkostninger` ⚠ | `satser.skriv` | **nej** | **nej** | **nej** | **nej** | **nej** | **nej** | ja |
| `satser` ⚠ | `satser.skriv` | **nej** | **nej** | **nej** | **nej** | **nej** | **nej** | ja |
| `opgaver` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `koeretoejer/$koeretoejId` ⚠ | `koeretoejer.skriv` | **nej** | **nej** | ja | **nej** | **nej** | **nej** | ja |
| `indberetninger/$id` ⚠ | `indberetninger.skriv` + `indberetninger.skrivAlle` | **nej** | **nej** | **nej** | **nej** | **nej** | **nej** | ja |
| `fravaer` ⚠ | `fravaer.skriv` | **nej** | ja | ja | ja | **nej** | **nej** | ja |
| `facility` ⚠ | `facility.skriv` | **nej** | ja | ja | ja | **nej** | **nej** | ja |
| `leverandoerer` ⚠ | `indkoeb.skriv` | **nej** | ja | ja | ja | **nej** | **nej** | ja |
| `indkoeb` ⚠ | `indkoeb.skriv` | **nej** | ja | ja | ja | **nej** | **nej** | ja |
| `fakturaer` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `kassetyper` ⚠ | `kasser.skriv` | **nej** | **nej** | **nej** | **nej** | ja | **nej** | ja |
| `reolpladser` ⚠ | `reolpladser.skriv` | **nej** | **nej** | **nej** | **nej** | ja | **nej** | ja |
| `kasser/$kasseId` ⚠ | `kasser.skriv` | **nej** | **nej** | **nej** | **nej** | ja | **nej** | ja |
| `kasseudlaan/$udlaanId` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `varer` ⚠ | `varer.skriv` | **nej** | **nej** | **nej** | **nej** | ja | **nej** | ja |
| `carriers` ⚠ | `carriers.skriv` | **nej** | **nej** | **nej** | **nej** | ja | **nej** | ja |
| `bevaegelser/$bevaegelseId` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `beholdning/$noegle` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `enheder/$serienummer` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `plukordrer` ⚠ | `bevaegelser.skriv` | **nej** | **nej** | **nej** | **nej** | ja | **nej** | ja |
| `optaellinger/$optaellingId` | **lukket — kun en funktion** | – | – | – | – | – | – | – |
| `kunder` ⚠ | `kunder.skriv` | **nej** | ja | ja | ja | **nej** | **nej** | ja |

⚠ **Læs `indberetninger`-rækken med forbehold.** Reglen er
`(indberetninger.skriv OG din egen post) ELLER indberetninger.skrivAlle`.
Tabellen kan ikke rumme det, og en chauffør **kan** oprette sin egen
indberetning. Se `rules.indberetninger.test.mjs`, hvor det er demonstreret.

### 19 noder kan slet ikke skrives af en klient

`_findes`, `virksomhed`, `abonnement`, `moduler`, `dashboardvisning`, `roller`,
`brugere`, `sensitive/bookinger`, `vaerdi/bookinger`, `kpi`, `reservationer`,
`bookinger`, `etaper`, `countere`, `grundlag`, `opgaver`, `fakturaer`,
`kasseudlaan`, `bevaegelser`, `beholdning`, `enheder`, `optaellinger`.

Hver af dem har sin grund skrevet i regelfilen, og de er ikke manglende
rettigheder — det er **veje** der er lukket, fordi handlingen rører mere end
én post. Se beslutning 37, 39 og 45.

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

- **Skrivning er ikke prøvet rolle for rolle mod en base.** Den rigtige måde er
  i emulatoren, hvor der kan skrives frit og ryddes op — og med **rigtige**
  poster, så en afvisning ikke kommer fra en manglende `division`. Det er en
  etape for sig.
- **`audit/`** ligger uden for tenanten og er ikke med. Kun admin og revisor har
  `audit.laes`.
- **Skærmenes egne `harPerm()`-kald** er ikke krydset med tabellen. En skærm kan
  skjule en knap for en rolle der godt måtte trykke på den — det er en pæn knap
  i den anden retning, og den er harmløs, men den bør kendes.
- **Ejerkonsollen** (`udbyder`-claim'et) er ikke en rolle i tenanten og står
  uden for. Se beslutning 34 og 35.
