# 04 — Data-ejerskab

Denne oversigt er syntetiseret af `src/fleet/moduler.js` (ground truth for
`NODE_MODUL`-tabellen) og de 11 modul-dossierer i `docs/product-audit/_dossiers/`.
Hvor en dossier og `moduler.js` ser ud til at være uenige, er `moduler.js`
lagt til grund, og uenigheden er noteret eksplicit.

## Mekanismen: NODE_MODUL

Hver RTDB-node der optræder i `NODE_MODUL` (i `src/fleet/moduler.js`) håndhæves
i `firebase.rules.json` med en modulklausul: en tenant uden modulet kan
hverken læse eller skrive noden (siden beslutning 34 — det er en
sikkerhedskontrol, ikke kun en salgsflade). Et barn arver sin forælders
modul (længste sti-træffer vinder), så fx `facility/lokationer` er spærret
uden selv at stå i tabellen.

**Noder der IKKE står i `NODE_MODUL` ligger i "basen"** — de er tilgængelige
for enhver tenant der overhovedet er logget ind (adgang styres i stedet af
almindelige `permissions.js`-rettigheder, ikke af modulklausulen). `moduler.js`
er eksplicit om hvorfor: fem noder står **med vilje** uden for tabellen, fordi
de hver hører til FLERE moduler, og en node der hører til to moduler ikke kan
gates af det ene uden at det andet går i stykker:

> "FEM NODER STÅR MED VILJE UDEN FOR: opgaver, satser, fakturaer,
> reservationer og sager. De hører hver til FLERE moduler."

Konkret: `opgaver` er `vaerksted` (Fleet) eller `facility` (Facility) via
`art`-feltet; `satser` bruges af både Kunder (prisgrupper) og Booking
(kalkulationspris); `fakturaer` ligger administrativt i Indkøb, men Økonomi
læser dem; `reservationer` skrives af fire kilder (booking, værksted,
facility-sag, fravær); og `sager` er tænkt delt mellem Fleet (`art: "fleet"`)
og Facility (`art: "facility"`) på samme måde som `opgaver`. `moduler.js`
dokumenterer desuden et **historisk, målt eksempel** på hvad der sker hvis man
alligevel gør det (se "Steder hvor et modul fejlagtigt ejer data" nedenfor).

Ud over de fem nævner `moduler.js` selv yderligere base-noder: `personale`,
`kpi` (aggregatet — "et modul man ikke har, har ingen tal"), samt at
`reolpladser` er den **eneste** node med eksplicit deling mellem to navngivne
moduler (`["unitbooking", "warehouse"]`) frem for slet ingen modulklausul.

---

## Entitetstabel

| Entitet | Ejes af modul | Bruges også af | Source of truth |
|---|---|---|---|
| Kunde | `kunder` (node `kunder`, `sensitive/kunder`) | Booking (påkrævet `kundeId`), Warehouse (påkrævet `kundeId`), Fakturering, prismotoren | `kunder`-noden alene. |
| Leverandør / kreditor | `indkoeb` (node `leverandoerer`) | Fakturacenter (Økonomi), Fleets Driftskalender (opslag), Facility (kategori `facility`) | `leverandoerer`-noden alene; ingen dublet fundet. |
| Køretøj / enhed (Fleet) | `flaade` (node `koeretoejer`, `sensitive/koeretoejer`) | Booking/Disponering (`kanDisponeres`), Fakturacenter (matchsignal), Økonomi | `koeretoejer`-noden alene. |
| Trailer / hænger | **Findes ikke som selvstændig node.** Modelleret som én af 9 "arter" på `koeretoejer` (to grupper: motoriseret/påhængt); en etape bærer `koeretoejIder` som liste, så en sættevogn er trækker + trailer som to poster i samme node. | — | `koeretoejer` (art-feltet). |
| Chauffør / medarbejder (stamdata) | **Base** — `personale` er bevidst IKKE i `NODE_MODUL` ("enhver abonnementskombination har medarbejdere") | Bemanding, Booking/Disponering, Fleet (kompetencekrav), chaufførapp (`brugere/<uid>/personId`-kobling) | `personale`-noden for stamdata; `brugere/<uid>` + Firebase Auth for login (se "Bruger" nedenfor) — to forskellige nøgler (`personId` vs. `uid`) for to forskellige spørgsmål ("hvem det handler om" vs. "hvem der gjorde det"). |
| Booking (forløb) | `booking` (node `bookinger`) | Økonomi/Fakturering (omsætning, faktureringsstatus) | `bookinger`; `tilstand` er afledt af etaperne, ikke en selvstændig kilde. |
| Transportforespørgsel | **Ikke en egen entitet** — er bookingens starttilstand (`kladde`), samme node som Booking. | — | `bookinger`. |
| Etape | `booking` (node `etaper`) | Disponering, Rute & status, Fakturering (spærrer godkendelse ved åben etape), Warehouses Transportlabels (typeudledning) | `etaper`; bærer `koeretoejIder`, `forslag/<id>` (nøglet, ikke array). |
| Rute | **Ikke en gemt node** — beregnes/udledes (`planlagteStop()`) af etapens `stop`-liste hver gang. | — | Afledt af `etaper/<id>/stop`. |
| Stop | `booking` (barn af `etaper/<id>/stop/<nr>`) | Chaufførappens Turplan (`statushaendelser.stopId` prøves mod netop de udledte stop) | `etaper/<id>/stop`. |
| Forslag (booking) | `booking` (barn af `etaper/<id>/forslag/<id>`, ikke egen node) | Disponering, Forslag-skærmen | Nøglet objekt på etapen; trukne forslag slettes ikke. |
| Statushændelse (chaufførmelding) | `booking` (node `statushaendelser`) | Rute & status, chaufførapp | `statushaendelser`; tidsstempel fra telefonen, ikke serveren. |
| Omkostninger (bookingens driftssatser) | `booking` (node `omkostninger`) | Bookingopsætning, prismotoren | `omkostninger`; adskilt fra `satser` (kundens salgspris) med vilje — beslutning 11. |
| Driftsopgave / Fleet-sag (værkstedsbesøg) | **Base** — `opgaver` (art `vaerksted`) er én af de fem bevidst ugatede noder | Fleets Driftskalender, Fakturacenter, Fakturering (materialelinjer) | `opgaver`. Ejerskabet afgøres af `art`-feltet, ikke af en modulklausul. |
| Facility-sag (servicebesøg) | **Base** — samme `opgaver`-node, art `facility` | Facilitys Servicekalender, Fakturacenter | `opgaver` (art-filtreret). |
| Sag (fremtidig mailtråd, Fleet/Facility) | Planlagt base-node `sager` (art `fleet`\|`facility`) — se konflikt nedenfor | — | **Modstridende dossier-oplysninger, se note nedenfor.** |
| Facility-fejl (mangelmelding) | `facility` (node `facility/fejl`) | Fakturacenter (indirekte, via anlægsreference) | `facility/fejl`; `alvor` er altid et menneskeligt valg. |
| Indberetning (chauffør-hændelse) | `flaade` (node `indberetninger`, `sensitive/indberetninger`) | Fakturacenter (matchsignal), Fakturering (materialelinjer) | `indberetninger`. |
| Indkøbsbehov | `indkoeb` (node `indkoebsbehov`) | — | `indkoebsbehov`; trin 1 af Procure-processen. |
| PO / bestilling | `indkoeb` (node `indkoebsordrer`) | — | `indkoebsordrer`; trin 2. |
| Godkendelsesregler (indkøb) | `indkoeb` (node `godkendelsesregler`) | — | `godkendelsesregler` (single-post pr. tenant). |
| Faktura (indgående) | **Base** — én af de fem bevidst ugatede noder ("fakturaer ligger i Indkøb, men Økonomi læser dem") | Procure → Fakturaer OG Økonomi → Fakturacenter (samme node, to linser) | `fakturaer`; `.write: false`, kun via `fakturamatch`/`fakturastatus`/`fakturadestination`/`kontantkoebskriv`. |
| Kreditnota | — | — | **IKKE PÅVIST.** Ingen kreditnota-node eller -logik fundet i nogen af de læste filer (dossier 06). |
| Betalt køb / kvittering (kontantkøb) | `indkoeb` (samme node `indkoeb`, felt `betalingsform: "kontant"`) | — | `indkoeb`; bevidst IKKE en egen node, for at undgå to kilder til samme beløb. |
| Materiale — reservedele (Fleet/værksted) | `indkoeb` (node `lagre`) | Fleet (forbrug på en bil, via indberetninger) | `lagre`. Forholdet til `forbrugsvarer` er **IKKE fuldt afklaret** i de læste filer (se "Dublerede datamodeller"). |
| Materiale — Procures eget forbrugslager | `indkoeb` (node `forbrugsvarer`, `forbrugsvarebevaegelser`) | Fakturacenter (lagerforslag) | `forbrugsvarer`; beholdning gemmes afledt sammen med bevægelsen, prøvet løbende mod bevægelsessummen (drift-detektor). |
| Vare (Warehouse — kundens gods) | `warehouse` (node `varer`) | — | `varer`; påkrævet `kundeId`, adskilt fra `lagre`/`forbrugsvarer` med vilje (3PL-indtægt vs. egen omkostning). |
| Lagerbeholdning (Warehouse) | `warehouse` (node `beholdning`) | Sporbarhed, Afregning | `beholdning`; summeret/skrevet kun af `bevaegelseskriv`, intet gemt totaltal. |
| Warehouse-enhed (serienummer) | `warehouse` (node `enheder`) | Sporbarhed | `enheder`; kun for serie-sporede varer, kan komme ud af trit med `beholdning` (synligt via `enhedsafvigelse()`, ikke skjult). |
| Bevægelse (Warehouse) | `warehouse` (node `bevaegelser`) | Sporbarhed (kilde til sporet), Afregning (fakturagrundlag) | `bevaegelser`; append-only, kun via `bevaegelseskriv`. |
| Plukordre | `warehouse` (node `plukordrer`) | — | `plukordrer`; `afsendt`-tilstand kun sat af `plukordreafsend`. |
| Optælling (cycle count) | `warehouse` (node `optaellinger`) | — | `optaellinger`; `.write: false` for enhver klient. |
| Carrier (Warehouse-beholder) | `warehouse` (node `carriers`) | — | `carriers`; fysisk ligner Unitbookings `kasser`, men bevidst egen node/tilstandsmaskine (se "Dublerede datamodeller"). |
| Lagerlokation / reolplads | **Delt: `["unitbooking", "warehouse"]`** — eneste node i kodebasen med eksplicit to-modul-ejerskab | Begge moduler samtidig | `reolpladser`; skrivning bruger `flet: true` for ikke at overskrive det andet moduls felter. |
| UnitBooking-kasse | `unitbooking` (node `kasser`, `kassetyper`) | — | `kasser`/`kassetyper`. |
| UnitBooking-udlån | `unitbooking` (node `kasseudlaan`) | — | `kasseudlaan`; `.write: false`, kun via `kasseudlaanskriv` (transaktion). |
| Supportticket | **Findes ikke i databasen.** Tiltænkte noder (`support/sager`, `support/beskeder`, `tenants/<t>/supportsager`) er ikke i `firebase.rules.json` — bekræftet ved direkte opslag (dossier 10). | — | Ingen — al skærmdata er `demo-support.js`, ubetinget. |
| Bruger (login) | **Base**, ingen modulklausul | Alle 59 skærme indirekte via `auth.token.perms` | Firebase Auth er den reelle sandhed; `brugere/<uid>` er kun et INDEKS skrevet parallelt af Cloud Functions (klienten kan ikke liste Auth-brugere direkte). |
| Rolle | **Base**, `.write: false` | Alle regelfiler indirekte (claims mintes herfra) | `roller/<rolle>/perms` er en KILDE, aldrig et håndhævelsespunkt — `firebase.rules.json` læser den aldrig; adgang afgøres udelukkende af `auth.token.perms`. |
| Auditlog | **Base**, egen append-only læseregel, ikke i `NODE_MODUL` | Support (kun via et afgrænset ±5-min/50-post udtræk PÅ en sag — aldrig direkte `audit.laes`) | `audit/`; skrives kun af `audit.log()`, allowlistede felter. |
| KPI-aggregat | **Base**, ikke i `NODE_MODUL` overhovedet | Alle moduler der viser nøgletal (Dashboard, Økonomi, modulernes egne KPI-rækker) | `kpi/<division>/<snapshot>/<domæne>`; adgang pr. domæne er udledt af domænets KILDE-nodes læse-permission (`KPI_PERM`), ikke af en modulklausul på selve `kpi/`. |
| Personale-kompetence | Ifølge selve `NODE_MODUL`-koden: `bemanding`. Ifølge `moduler.js`'s egen forklarende kommentar og dossier 03: base/ugatet. **Se konflikt nedenfor.** | Disponering (`tjekDisponering`), Fleet (kompetencekrav) | `kompetencer`-noden. |
| Fravær | `bemanding` (node `fravaer`, `sensitive/fravaer`) | Chaufførapp (`Frihed.jsx`, egen ansøgningsvej), Disponering (fraværsblokering — beregnet, endnu ikke skrevet automatisk, se dossier 03) | `fravaer`. |
| Stempling / timeregistrering | `bemanding` (node `stemplinger`) | Kun chaufførappens egen visning — ingen kontor-/adminskærm fandt en visning af den i de læste filer | `stemplinger/<personId>/<id>`. |
| Standardpris / prisgruppe | **Base** — `satser` er én af de fem bevidst ugatede noder ("prisgrupper hører til Kunder, kalkulationsprisen til Booking") | Bookingopsætning, Warehouses Afregning/Volumen, prismotoren generelt | `satser/standard/<ydelseId>/satser/<id>`; adgang styres af `satser.laes`/`satser.skriv`-permissions, ikke af modulklausul. |
| Kundeafvigelse (aftalepris) | `kunder` (barn af kundeposten: `kunder/<id>/priser/...`) | Prismotoren via `prisFor()` | Ligger fysisk på kunden, men logges i audit som `objekt: "satser"` for samme retention som satser. |
| Fakturagrundlag (udgående) | **Base**, `.write: false` for alle inkl. admin | Fakturering, Warehouses Afregning (opretter kladde herfra) | `grundlag`; nummereret af server-side counter. |
| Integration | **Findes ikke som node.** `INTEGRATIONER` er en hardkodet, tom JS-konstant. | — | Ingen — bevidst tomt, ingen database-repræsentation endnu. |
| Abonnement / tenant-moduler | **Base**, tenant-infrastruktur — er selve modulsystemet, ikke ejet af et modul i det | Kundens egen låseskærm (`Abonnementslaas`), Ejerkonsollen (skriver) | `tenants/<id>/moduler`, `tenants/<id>/abonnement`; `abonnementHistorik` er append-only forklaring, ALDRIG faktureringskilde (`udbyder/maalinger/<kunde>/<dato>` er det). |
| Legal hold / retention | **Base**, tenant-scoped infrastruktur | `retentionDryRun` (rapportering) | `tenants/<t>/retention/legalHold`; selve sletningen/anonymiseringen er bevidst ikke bygget (beslutning 115). |
| Brugerlayout / dashboardvisning | **Base**, brugerens/adminens egen post | Kun Dashboard | `brugerlayout/<uid>/...`, `dashboardvisning/<uid>` — ren visningsindstilling, ikke adgangskontrol. |

**Note om `kompetencer`:** `moduler.js`'s forklarende kommentar (linje
296–298) siger eksplicit at "personale, kompetencer og kpi er heller ikke
gatede" — men selve `NODE_MODUL`-koden (linje 355) skriver
`kompetencer: "bemanding"`. Det er en reel indre uoverensstemmelse i
`moduler.js` selv, ikke kun en dossier-fejl: dossier 03 følger kommentaren
("Ingen modulklausul — base-undtagelse") og modsiger dermed den kørende
kode. Da `test/rules.moduler.test.mjs` udleder de håndhævede regler af selve
`NODE_MODUL`-objektet (ikke af kommentarerne), er den funktionelle sandhed at
`kompetencer` reelt ER gatet til `bemanding` — men kommentaren burde rettes,
eller tabellen burde det, for de kan ikke begge være rigtige.

**Note om `sager` (Fleet/Facility mailtråd):** Dossier 04 (Fleet) og dossier
05 (Facility) siger begge eksplicit at `sager/` **ikke** findes i
`firebase.rules.json` endnu (fase 0, kun demo-data vist). Dossier 10
(Support) siger det modsatte: at `tenants/<t>/sager/<sagId>` **findes** i
`firebase.rules.json` (opslået direkte, linje ~1920), med fire fuldt
implementerede Cloud Functions (`sagOpret`, `sagBeskedSkriv`,
`sagKarantaeneFrigiv`, `sagAftaleBekraeft`) og at kun frontend'en
(`Sagsvisning.jsx`) er efterladt på en forældet "fase 0"-kommentar. Denne
syntese har ikke selv læst `firebase.rules.json` og kan derfor ikke afgøre
hvem der har ret — det bemærkes her som en uafklaret uenighed MELLEM
dossierer, ikke mellem en dossier og `moduler.js` (som kun bekræfter at
`sager` er TÆNKT som en delt base-node, ikke om den faktisk er udrullet).

---

## Dublerede datamodeller

- **`lagre` (Fleet/værksted reservedele) vs. `forbrugsvarer` (Procures eget
  lager) vs. Warehouses `varer`/`beholdning` (kundens gods).** Alle tre ejes
  formelt af moduler (`lagre` og `forbrugsvarer` begge af `indkoeb`,
  `varer`/`beholdning` af `warehouse`). Adskillelsen mellem Warehouse og de to
  øvrige er **DELIBERAT og veldokumenteret** (3PL-indtægt vs. egen
  omkostning — "FORVEKSL DEN IKKE MED `lagre`" står i kildekoden). Forholdet
  mellem `lagre` og `forbrugsvarer` indbyrdes (begge under Indkøb) er
  derimod **ikke afklaret** i de læste filer — kun `forbrugsvarer` har en
  fundet skærm (Varelager); ingen skærm for `lagre` blev læst i nogen
  dossier. Dette fremstår som en potentiel forvekslingsrisiko snarere end en
  bekræftet fejl.
- **`kasser` (Unitbooking) vs. `carriers` (Warehouse).** Fysisk samme slags
  beholder på samme hylder, men **DELIBERAT** adskilt i to noder med hver sin
  tilstandsmaskine og skrivepermission — begrundet eksplicit i `moduler.js`:
  "kassen udlejes pr. sag, carrieren bærer kundens gods." Begge tælles dog
  sammen i den fælles belægningsopgørelse (`belaegningPrPlads()`), så en
  bruger med begge moduler ser dem side om side på samme hylde.
- **`reolpladser` delt mellem Unitbooking og Warehouse.** **DELIBERAT**, den
  eneste node i kodebasen med formelt to-modul-ejerskab
  (`NODE_MODUL.reolpladser = ["unitbooking", "warehouse"]`), begrundet med at
  to reolnoder ville tvinge en kunde med begge moduler til at vedligeholde sit
  lager to gange. Skrivning bruger konsekvent `flet: true` for at undgå at
  det ene moduls felter (zone/type/status/temperatur) overskrives af det
  andet.
- **`opgaver` delt mellem Fleet (art `vaerksted`) og Facility (art
  `facility`).** **DELIBERAT** — én af de fem navngivne base-noder i
  `moduler.js`. Samme node, samme skrivefunktioner
  (`opgaveplanlaeg`/`opgaveflyt`/`opgavestatus`), samme delte
  `Gitterkalender.jsx`-komponent i Fleets Driftskalender, Facilitys
  Servicekalender og Bookings Disponering. Risikoen er dokumenteret som
  produktmæssig forvekslingsrisiko for en bruger med flere moduler, ikke
  datamæssig.
- **`reservationer` delt af fire kilder (booking, værksted, facility-sag,
  fravær).** **DELIBERAT i dag** (beslutning 4/92), men var oprindeligt
  **fejlagtigt gated på ét modul** — se "Steder hvor et modul fejlagtigt
  ejer data" nedenfor for det fulde, målte forløb.
- **"Sag" i Fleet/Facility vs. "Sag" i Support.** Ren **NAVNEKOLLISION**,
  ingen delt node. Support-dossieret (10) afgør dette eksplicit: forskellige
  RTDB-stier (`support/sager` — findes ikke — vs. `tenants/<t>/sager`),
  forskellige permission-navnerum (`support.*` vs. `sag.*`), og forskellige
  Cloud-Function-familier. Risikoen er udelukkende terminologisk/navigatorisk
  for udviklere, ikke en datarisiko.
- **`facility/aktiver.art` (udstyrstype) vs. `opgave.art` (`vaerksted`\|`facility`).**
  Samme feltnavn, to helt forskellige vokabularer på to forskellige noder —
  dokumenteret eksplicit i koden for at forhindre sammenblanding. Ikke en
  delt node, men en navnekollision på feltniveau.
- **`kunde.prisgruppe` (levn) vs. det faktiske to-lags prissystem
  (standardpris + kundeafvigelse).** Feltet filtrerer stadig i Kunder.jsx/
  Kundepriser.jsx, men bærer ikke længere en pris — et **levn fra en tidligere
  model**, ikke en ny dublering, men en reel forvekslingsrisiko for en bruger
  der ikke læser hint-teksten.

---

## Flere sources of truth

- **`fakturaer`-noden læst af to skærme:** Fakturacenter (Økonomi,
  `/oekonomi/fakturacenter`) og Procure → Fakturaer
  (`/indkoeb/fakturaer`). Samme node, samme matchfunktioner, forskelligt
  scope/visning — lav risiko i dag, fordi begge skærme deler
  `matchForslag()`/`foreslaaDestination()`, men enhver fremtidig ændring i
  kun den ene fil kan lade dem drive fra hinanden.
- **"Største afvigelser"** vist på både Dashboard og Økonomi. Samme
  `kpi.afvigelser`-felt, en tidligere rettet mockup-fejl (to lister med
  forskellige navne for samme beløb). Feltet er dog selv permanent tomt
  (`[]`) i aggregeringen i dag, så begge kort viser altid "Ingen afvigelser" —
  et separat problem fra selve kilde-delingen.
- **Bemandings kapacitetstal (Bemanding-skærmen) vs. Dashboard.** Historisk
  regnede de to skærme "kapacitetsgrad"/"ledig kapacitet" forskelligt (84 %
  vs. 83 %), nu samlet i `dashboards.js`s `kapacitetsgrad()`/`ledig()`
  (beslutning 71). Dokumenteret som en tilbagevendende fælde hvis en fremtidig
  ændring genindfører en lokal beregning ét sted.
- **Facilitys "estimeret omkostning" pr. anlæg (Overblik) vs. Servicekalenderens
  "Anslået omkostning"-KPI.** Begge beskriver samme underliggende beløb
  (næste planlagte besøgs beløb), men Overblik-visningens
  `estimatForAktiv()` slår op i `DEMO_SERVICEBESOEG` (hardkodet demo-data,
  ikke den hentede `opgaver`-liste), mens Servicekalenderens KPI er en ægte
  `kpi.facility`-aggregering. **Middel risiko** — dossieret markerer dette
  som en reel, ikke-fuldt-forklaret afvigelse (IKKE PÅVIST hvorfor).
- **Økonomis "Opgaver klar til fakturering" (100 % demo-data,
  `DEMO_KLAR_TIL_FAKTURERING`) vs. Fakturering (ægte `grundlag`-kladder).**
  Samme koncept i navnet, forskellig datakilde — en bruger kan opfatte dem
  som samme liste vist to steder.
- **Warehouses `beholdning` (saldo) vs. `enheder` (serie-sporede rækker).**
  To repræsentationer af samme kendsgerning for serie-sporede varer, med
  vilje ("samme klasse fejl som `bemanding.ledig`" ifølge kildekommentaren) —
  afvigelsen håndteres ved at gøre den SYNLIG (`enhedsafvigelse()`-panelet i
  Sporbarhed), ikke ved at lade én af dem tavst vinde.
- **Fleets `Modulfakturaer art="fleet"` vs. Fakturacenter/Procure-fakturaer.**
  Dokumenteret delt visning (beslutning 86), ikke duplikeret data — nævnt her
  fordi det er endnu et vindue ind i samme `fakturaer`-node, ud over de to
  ovenfor.

---

## Uklar ownership

- **`oekonomi` og `dashboard`-modulerne ejer selv INGEN node.** `moduler.js`
  siger det direkte: "oekonomi og kunder ejer ingen node hver for sig ud over
  kunder/. Økonomi læser kpi, fakturaer og satser, som alle er base. Modulet
  styrer altså kun om SKÆRMEN findes." Dette gælder tilsvarende `dashboard`.
- **`kpi/`-aggregatet har ingen modulejer i `NODE_MODUL` overhovedet.**
  Adgang pr. domæne er udledt indirekte af domænets kilde-nodes
  læse-permission (`KPI_PERM`), ikke af en modulklausul på selve `kpi/`
  (som slet ikke har nogen `.read` mere — kun `kpi/<domæne>` gør, én ad
  gangen).
- **`kompetencer` — se konflikten i Entitetstabellen ovenfor.** `moduler.js`s
  egen forklarende tekst og den kørende `NODE_MODUL`-kode modsiger hinanden.
- **`sager` (Fleet/Facility mailtråd) — se konflikten i Entitetstabellen
  ovenfor.** To dossierer (04, 05) siger noden ikke findes i reglerne endnu;
  et tredje (10) siger den gør, med fire fungerende Cloud Functions. Ikke
  afgjort af denne syntese.
- **`lagre` (Fleet/værksted reservedelslager) har ingen fundet skærm i nogen
  af de 11 dossierer.** Ejerskabet (`indkoeb`) står klart i `NODE_MODUL`, men
  hvilken skærm der administrerer den, og hvordan den forholder sig til
  `forbrugsvarer`, er **IKKE PÅVIST**.
- **`facility/omkostning`, `facility/zoner`, `facility/sensorer` er skrivbare
  ifølge reglerne (kræver `facility.skriv`), men ingen skærm i
  `src/moduler/facility/` skriver til dem.** Ejerskabet er entydigt
  (Facility), men den administrative indgang mangler eller findes uden for
  det undersøgte filsæt — **IKKE PÅVIST** hvorfra tallene reelt stammer hos
  en rigtig kunde.
- **`stemplinger` ejes entydigt af `bemanding`, men ingen kontor-/adminskærm
  i Workforce-dossieret læser eller viser noden.** Kun chaufførappens egen
  visning gør. Om en administrativ visning findes andetsteds i kodebasen er
  **IKKE PÅVIST**.
- **`personale`/`kompetencer` er base ("enhver abonnementskombination har
  medarbejdere"), men `koerehviletid.js`s `tjekKoerehviletid()`-funktion**
  (relateret til bemanding/booking-grænsefladen) blev ikke fundet kaldt fra
  nogen af Workforce-modulets fire skærme — uklart hvor forbeholdet vises for
  slutbrugeren.

---

## Steder hvor et modul fejlagtigt "ejer" data der burde være fælles

**Ét eksempel er eksplicit dokumenteret — nu rettet, men målt og beskrevet i
detalje i både `moduler.js` og dossier 02 (Booking):**

`reservationer` stod tidligere gated som `"booking"`s egen node. Det var
**målbart forkert**: `reservationer` er hele pointen i beslutning 4 —
booking, værksted, facility-sag og fravær skriver alle til den SAMME node,
netop for at de fire kan se hinandens spærringer. Gates den på `booking`,
kan en kunde med Fleet, Facility, Bemanding og Procure, men UDEN Planning,
ikke læse sine egne reservationer overhovedet.

Målt på DEV-kunden `nordvest` (netop denne modulkombination): **37
reservationer, og ikke én af dem kom fra en booking** — 18 værksted, 9
facility-sag, 10 fravær, alle med en afvist læsning. Samtidig skrev
`opgaveplanlaeg`, `facilityplanlaeg`, `opgaveflyt` og `opgavestatus` stadig
til noden for ham (admin-SDK går uden om reglerne), så han kunne oprette et
værkstedsbesøg og aldrig se det igen.

Rettelsen (beslutning 92) flyttede `reservationer` til basen, hvor den står i
dag. `moduler.js` advarer eksplicit mod at sætte den tilbage: en fremtidig
"hører til mindst ét af modulerne"-regel er "en regel ingen kan læse sig til
bagefter, og den slags regler bliver forkert ændret."

Ingen af de 11 dossierer flagger et TILSVARENDE, stadig-aktivt tilfælde i dag
— dette er derfor det ENESTE fund i denne kategori, præsenteret som et
historisk, løst eksempel på risikoklassen, ikke som et åbent problem.
