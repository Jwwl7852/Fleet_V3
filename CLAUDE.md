# Kontekst til Claude Code

FleetControl 3.0 — multi-tenant TMS for danske vognmænd. React + Vite +
React Router, Firebase Realtime Database (compat SDK), Netlify. Dansk UI,
danske variabelnavne i domænelogikken.

## Arbejdsregel

**Analyse før kode.** Læs `README.md` og `ARKITEKTUR.md` først. Foreslå en plan
og få den godkendt, før du skriver. Der er **57 trufne beslutninger** — kort
form i README, begrundelserne i `BESLUTNINGER.md`. Brud på dem skal være
bevidste, ikke tilfældige, og begrundelsen er det eneste sted der står hvad
der gik galt uden beslutningen. Læs den relevante række, før du bryder noget.

Rækkefølgen for sikkerhedsarbejdet er også låst — se **Låst rækkefølge** i
README. Tag punkterne i orden, og spring ikke frem.

**Enhver ændring i `firebase.rules.json` kræver at `npm run test:rules` kører
grønt, før der committes.** Ingen undtagelser, heller ikke for en kommentar —
det var netop en kommentar der gjorde reglerne ugyldige fra fundamentet, og
fejlen overlevede i månedsvis, fordi ingen kørte dem. `npm test` kører samme
suite. Hooken i `.githooks/pre-commit` fanger det automatisk, hvis
`core.hooksPath` er sat.

## Det du ikke må gøre

- Kalde `firebase.initializeApp()` i et modul. Importér `db` fra `src/firebase.js`.
- Lave en sidebar, tenant-vælger eller periodevælger i et modul. Shellen ejer dem.
- Beregne nøgletal ud af rådata i et modul. Brug `useKpi()`.
- **Hardkode et tal i en skærm, fordi feltet mangler i `kpi/`.** Definér det i
  `demo-kpi.js` — den fil *er* nodens form. Så er skærmen rigtig, og det
  eneste der mangler er aggregeringen. Hardkoder du, har du to opgaver senere
  i stedet for én. Tilføj feltet til KPI-efterslæbet i README.
  **Undtagelsen:** er tallet *afledt* af data skærmen allerede har — en
  gennemsnitstemperatur, en aktiv alarm, en sum af komponenter — så beregn det
  hos forbrugeren og læg det **ikke** i `kpi/`. Et gemt afledt tal driver fra
  sit grundlag; det er fejlen i `bemanding.ledig`.
- Skrive en afvigelse som streng. Brug `deviation()` fra `format.js`.
- **Lade aggregeringen gætte et felt uden kilde.** `beregnKpi()` skriver
  `null` for de 51 felter hvis kilde ikke findes — og feltet UDELADES ikke:
  står det med null, kan man se af noden at spørgsmålet er stillet. Får et
  felt en kilde, fjernes det fra `udenKilde()` ét sted.
  ⚠ Og **flåden og bemandingen kan ikke deles på division**: stamdata bærer
  ikke feltet (beslutning 19). At udlede det af arten ville være et gæt.
- **Regne en KPI i jobbet.** `beregnKpi()` er ren og kender ingen database,
  så hele regnestykket kan prøves uden en emulator. Jobbet henter noderne og
  kalder den — regner det selv, kan det kun prøves ved at køre det.
- **Regne videre på et `null`.** `100 - null` er 100, `null / 100` er 0, og
  `!budget ? 0` er 0. Hver gang ser resultatet ud som en **måling**, og gaten
  i `num()`/`deviation()` nås aldrig, fordi tallet er blevet rigtigt på vejen.
  Dashboardet skrev "— / 100 %", "0,00 vs. sidste periode" og "0,0 % vs.
  budget" for tre felter der aldrig var regnet. Tjek med `Number.isFinite()`
  **før** regnestykket, ikke efter.
- **Tro at `null` overlever en skrivning til RTDB.** Det gør det ikke: feltet
  **slettes**, og er hele domænet null, forsvinder domænet. `bemanding` fandtes
  ikke i noden efter første rigtige aggregering, og Bemanding-skærmen blev
  hvid på `k.bemanding.disponeret`. Formen lægges tilbage af `medFuldForm()`
  i `kpi-aggregering.js`, kaldt ét sted — i `useKpi`.
- **Lade et ikke-beregnet tal se ud som nul.** `num`, `pct` og `km` skriver
  `INTET` (—) for `null` og `NaN`, og "0" for nul. En tom liste er et svar;
  et felt aggregeringen ikke kunne regne, er et ubesvaret spørgsmål. Skriver
  du din egen markør — "n/a", "ingen data" — fejler `test/format.test.mjs`:
  den næste ville tro der var forskel, og ingen af dem kan søges frem.
- Gemme beløb som float eller kroner. Øre som integer, ekskl. moms.
- Overskrive en sats. Ny post med `gyldigFra`.
- Skrive en reservation direkte. Brug `reservations.js`.
- Skifte en etapetilstand uden `kanSkifteEtape()`. Der er ingen `kanSkifte()`
  på en booking længere — beslutning 40: bookingens tilstand er afledt.
- **Definere egne farver.** Brug tokens i `fleet.css`. Det er ikke længere en
  konvention: `npm run test:design` fejler på en farveværdi hvor som helst i
  `src/` uden for tokenfilen, og hooken kører den ved enhver ændring i `src/`.
  Et token er desuden en **beslutning** — accenten er nr. 10. Skal en værdi
  ændres, eller et token tilføjes, rettes `BESLUTNINGER.md` **først** og
  derefter snapshottet i `test/design-tokens.test.mjs`. Retter du kun
  snapshottet, har du flyttet beslutningen ind i en testfil hvor ingen leder
  efter den.
- **Sætte en `font-size` i px.** Skalaen er ni tokens — `--fc-t-tight` (11) til
  `--fc-t-4xl` (34) — og brødteksten er `--fc-t-m`, **14 px, ikke 13**. Filen
  havde 24 forskellige størrelser på 119 steder, otte med halve pixels, fordi
  hver skærm valgte et tal der så rigtigt ud dér; 68 % af tegnene på
  dashboardet stod på 13 px eller mindre. `test/skrift.test.mjs` fejler på et
  råt tal uden for `:root`.
  ⚠ **Tre steder står med vilje uden for skalaen**, og de står med navn og
  begrundelse i prøven: mærkatet er 100 × 200 mm fysisk (beslutning 46), og
  donutens `font-size:6` er seks **viewBox-enheder**, ikke pixels — et
  px-token dér gør tallet dobbelt så stort som figuren. Hører din størrelse
  virkelig udenfor, så skriv begrundelsen; kan du ikke det, hører den i
  skalaen. Se beslutning 48.
- Bruge `on()` hvor `once()` rækker.
- **Hardslette noget som helst — og tro at `skriv.js` forhindrer det.** Det
  gør den ikke: `db.ref().remove()` går uden om klientbiblioteket. Reglerne
  er det eneste der gælder, og de sagde intet: **20 af 23 poster kunne
  hardslettes, og 17 af 23 HELE noder kunne tømmes i ét kald**, målt i
  emulatoren. `.write` hører på **posten**, ikke på noden — den kaskaderer —
  og den skal ende på `&& newData.exists()`. De to steder hvor en sletning
  ER besluttet, står i `test/rules.sletning.test.mjs`. Se beslutning 53.
- Lægge division i stien. Det er et felt: `gods` | `bus` | `faelles`.
- **Bruge `uid` og `personId` i flæng.** `uid` er hvem der *gjorde* noget:
  `indberetninger.oprettetAf` og auditloggen. `personId` er hvem det *handler
  om*: reservationer, fravær, opgaver, etaper, kompetencer. Bytter du om,
  holder ejerskabstjekket i reglerne op med at virke —
  `data.child('oprettetAf').val() === auth.uid` sammenligner med et uid, og et
  personId matcher aldrig. En chauffør har måske slet intet login.
- Tilføje en `audit.skriv`-permission, eller flytte `audit/` ind under
  `tenants/`. Loggen er append-only og har sin egen læseregel — begge dele
  ville ophæve det. Skal du logge, så kald `audit.log()`.
- Skrive fritekst i en auditpost. Kun felter på allowlisten i
  `audit-regler.js` må få deres værdi med.
- **Røre `firebase.rules.json` uden at køre `npm run test:rules` bagefter.**
  Ingen undtagelser, heller ikke for en kommentar. Reglerne var ugyldige fra
  fundamentet og kunne slet ikke indlæses — det overlevede gennemlæsning og
  flere redigeringer, og blev først fundet da de blev kørt.
- **Give en langtur en plads i `opgaver`.** En langtur *er* en etape — alle
  dens felter står allerede der, og `matchAabneEtaper()` søger på `etaper`.
  To poster for én tildeling er prototypens DE-QR 777 mod DE-KL 404, som
  beslutning 16 lukkede. Reglerne afviser `art: "langtur"`.
- **Fjerne forbeholdet fra `tjekKoerehviletid()`.** Svaret bærer altid
  `forbehold`, også når `ok` er true, fordi vi kun kan se planen og ikke
  tachografen. Et grønt flueben ved siden af en bøde er værre end ingen
  kontrol. Forudsætningen for at fjerne det er tachografdata — se ARKITEKTUR.
- **Give support `audit.laes` på en kundes tenant, eller udvide
  auditudtrækket.** Udtrækket er ±5 minutter og højst 50 poster, bundet til
  én bruger, og det ligger **på sagen** — support læser aldrig `audit/`.
  Grænsen må ikke gøres konfigurerbar: et loft der kan hæves af den der
  rammer det, er ikke et loft. Beslutning 24 rettede 23 netop på det punkt.
- **Lægge en feltværdi i en supportsags kontekst.** `SUPPORT_KONTEKST` er en
  allowliste. En supportsag er en ny kanal UD af systemet, og et kundenavn i
  den har forladt kundens tenant.
- **Lade en rolleoverstyring klientside ændre hvad brugeren MÅ.** Perms kommer
  fra tokenets claims. En klient kan ikke ændre sit eget token, og derfor kan
  `saetDemoRolle()` pr. definition ikke ændre adgang — kun hvad UI'et tegner.
  Det er ikke et forbud der gælder i produktion; det er en **umulighed** der
  gælder overalt hvor der er en server. Overstyringen i `effektivBruger` er
  derfor kun meningsfuld i **demo**, hvor der ingen server er at være uenig
  med. Skal en rigtig bruger have anden adgang, tildeles en anden af de syv
  roller med `skiftrolle`, som minter claim'et og kalder
  `revokeRefreshTokens`.
  ⚠ **Og claim'et mintes fra TENANTENS EGEN rolle, ikke fra konstanten.**
  Her stod "fra `ROLLE_PERMS`" og "der er ingen `roller/`-node at rette i" —
  begge dele blev omgjort af **beslutning 31b**. Noden findes, kunden må
  redigere sine roller, og `claimForRolle()` læser
  `tenants/<id>/roller/<rolle>/perms`. `ROLLE_PERMS` er standarden man falder
  tilbage på når noden mangler, ikke svaret.
  I dev skifter man **session**, ikke visning: `fleet/Brugervaelger.jsx` logger
  ud og ind som en anden seedet DEV-bruger, så perms skifter fordi *tokenet*
  skifter. `rolleskifte` er `miljoe === "demo"` — rør ikke den betingelse.
  Se beslutning 28.
- **Lade adgangsvejen afhænge af miljøet.** `harAdgang` i `App.jsx` kræver et
  **tenant-claim**, ikke "en bruger" og ikke "ikke produktion". Der må ikke være
  en dev-variant og en prod-variant: det er den slags forskel der får en
  spærring til at gælde alle andre steder end dér hvor den betyder noget. Det
  eneste der må afhænge af miljøet, er om brugervælgeren **tegnes**.
- **Vise demo-data oven på en afvist læsning.** En `permission-denied` er
  reglerne der **virker** — den må ikke oversættes til "ingen forbindelse" og
  fyldes ud med opdigtede tal. Brug `dataTilstand()` fra `datatilstand.js` og
  `<Datatilstand>` fra `ui.jsx`; skriv ikke din egen fejltekst i en skærm.
  Opdigtede tal findes **kun** hvor der ikke er en database at spørge. Der stod
  et dev-stillads ved `auth == null`; det blev fjernet med login, som beslutning
  26 lovede. Genindfør det ikke — `dataTilstand()` kender ikke sit miljø, og det
  er med vilje. Se beslutning 26 og 28.
- **Skrive et feltnavn i et modul uden at holde det op mod noden.**
  `opgaver.js`' `FELT` navngav `dato`, `varighedMin` og `estimatOere`; noden
  bærer `startMs`, `estimeretMin` og `beloebOere`. Skærmene spurgte
  `harFelt()` og fik **ja til felter der var tomme**. Værre: `reservationFraOpgave()`
  krævede `fra`/`til`, så den kunne **aldrig** kaldes på en rigtig opgave — en
  bil på værksted spærrede ingenting, og `etapeskift` kunne disponere den.
  Funktionen virkede kun fordi alle kaldsteder fodrede den med et BESØG.
  Nodens navne gælder: de står i reglerne, i `.indexOn` og på hver post.
- **Tro at `demo-i-skaerm.test.mjs` fanger enhver demo-visning.** Den tæller
  kun sæt for noder der står i `SEED`. `bookinger` gjorde ikke — kun `etaper`
  — så Bookingoversigten kunne læse demofilen direkte, og loftet stod grønt
  imens. **En lint der springer noget over, siger ikke nej; den siger
  ingenting.** Seeder du en node, hører sættet i `NODE_FOR`, og nodens egen
  skærm på ejerlisten. Se beslutning 56.
- **Vise et demo-datasæt for en node der ER seedet.** Da noderne blev seedet
  én for én, blev skærmene stående på demofilen: Indkøb → Fakturaer viste ni
  demo-fakturaer mens `indkoeb.fakturaerTilGodkendelse` blev regnet af de
  rigtige — to svar på samme spørgsmål, ét klik fra hinanden.
  `useListe(node, { demo: DEMO_X })` er den rigtige vej: sættet bruges KUN når
  der ingen database er. `test/demo-i-skaerm.test.mjs` tæller brugen uden for
  den faldbakke, og **nodens egen skærm må aldrig vise noget andet end noden**.
- **Lave et demo-datasæt nummer to for den samme node.** `demo-vaerksted.js`
  havde en `DEMO_INDKOEB` ved siden af `demo-indkoeb.js`' `DEMO_INDKOEBSLINJER`
  — begge i `fleet/`, hvor et demosæt hører hjemme, så linten så dem ikke.
  Kun det ene blev seedet, og de delte ikke engang form: kopien bar
  `beloebOere` direkte, som reglerne forbyder.
  ⚠ **Og det koster en forkert rettelse.** En faktura pegede på en linje der
  "ikke fandtes" — den lå i den anden fil — så referencen blev sat til `null`
  med en pæn begrundelse. Symptomet blev behandlet; årsagen stod.
  `test/demo-kilder.test.mjs` fejler nu på to sæt for én node.
- **Definere et demo-datasæt i en modulfil.** Det hører i `fleet/demo-*.js`.
  ⚠ **Et navn er ikke en beskyttelse.** Linten matchede før på `DEMO_`-præfikset,
  og `TILBUD`, `OPGAVER` og `FUNKTIONER` gled forbi den i tre forskellige
  skærme. Den kender nu et datasæt på sin **form**: et modul-niveau array med
  mindst tre id-bærende poster.
  Et datasæt i et modul kan ikke nås af de andre, og så laver de deres egen
  kopi — det var Bil 104 med to nummerplader. `test/demo-kilder.test.mjs`
  fejler på det, og den er skrevet fordi mønstret er dukket op **seks gange**.
- **Sætte et retention-tal og slette på det.** `RETENTION_MAANEDER` er 24 for
  alle tre klasser, og det er FORELØBIGT — bogføringsloven trækker mod fem år,
  GDPR mod kortere. `RETENTION_AFGJORT` er et selvstændigt felt af netop den
  grund: `retentionFor()` svarer hvor længe, `retentionErAfgjort()` svarer om
  vi tør handle på det. `auditoprydning` sletter kun når flaget er sandt og
  rapporterer ellers til `udbyder/retention/`. Et slettet auditspor kan ikke
  skaffes igen — samme regel som den manglende momssats: vi gætter ikke.
  Sæt tallet, sæt flaget, og skriv begrundelsen i BESLUTNINGER.md — i den
  rækkefølge.
- **Lægge en auditpost i en rapport under `udbyder/`.** Rapporten bærer kun
  tenant, klasse, år, måned og et ANTAL. En post kopieret derud havde forladt
  kundens tenant — det er den grænse beslutning 24 holder, og reglens
  `$andet: false` håndhæver den.
- **Lægge et forslag på bookingen.** Det hører på ETAPEN, med alle sine
  felter — tid, pris, enheder og chauffør. Det lå begge steder indtil
  beslutning 40, og for et forløb med én etape var det det samme løfte
  skrevet to steder. Og derfor: **der er ingen `kanSkifte()`, `byggSkifte()`
  eller `tilgaengeligeHandlinger()` på en booking.** Bookingens tilstand er
  afledt af etaperne og skrives af `etapeskift`; en tilstandsmaskine der
  kunne sætte den direkte, ville være en anden vej til ét felt. Og en funktion
  der findes, bliver kaldt.
- **Skrive de fem disponeringstjek af.** De ligger i `fleet/disponering.js`,
  ét sted, og både Disponering og `etapeskift` kalder `tjekDisponering()`.
  Serveren afviser med den SAMME sætning skærmen viste — to formuleringer af
  én spærring er to forklaringer på én ting. Skærmen VISER; funktionen
  HÅNDHÆVER. Ligger kontrollen i skærmen, går et direkte kald uden om den.
- **Give en etape ét `koeretoejId`.** Feltet er `koeretoejIder`, en liste:
  en sættevogn er trækker PLUS trailer, og `kanDisponeres()` afviser en
  trailer uden trækkende enhed. Med ét id kunne den regel aldrig udløses, og
  traileren fik ingen reservation — så den så fri ud i hele turen. Hver enhed
  får sin egen reservation i samme `update()`.
- **Prøve en kompetence mod `Date.now()`.** Den skal gælde når TUREN kører.
  Et ADR-bevis der udløber på tirsdag, er gyldigt når disponenten trykker og
  udløbet når turen kører på fredag. `tjekDisponering()` bruger etapens
  slutning — et bevis der udløber midt i turen, er udløbet på hjemvejen.
- **Regne en etapes VINDUE som køretid.** En tur til Paris løber over 40
  timer, og chaufføren sover undervejs. Etapen bærer `koerselMin`, og en
  langtur uden det SPÆRRES — den gættes ikke, som en momssats ikke gættes.
  Og pausereglen ADVARER: en plan siger hvor meget der køres, ikke hvor
  pauserne ligger. Dagens og ugens sum blokerer uændret.
- **Regne en flytnings nye varighed ud af blokkens tegning.** Et gitter giver
  en opgave uden estimat ÉT SYNLIGT MINIMUM — én time — så den kan ses og
  klikkes. Regner du `estimeretMin` af `blok.til - blok.fra`, bliver den time
  til et **rigtigt estimat**, og ressourcen er spærret i et tidsrum ingen har
  besluttet. Det er præcis den standardlængde `reservationFraOpgave()` nægter
  at gætte, ind ad bagdøren. Skærmene sender **kun** starten; `kanFlyttes()`
  afviser en opgave uden estimat helt. En prøve læser alle tre skærme som tekst
  og fejler på `estimeretMin` i et `flytOpgave`-kald. Se beslutning 49.
- **Skrive en opgave uden om `opgaveflyt`, eller lade den skifte art.**
  `opgaveplanlaeg` SÆTTER `art: "vaerksted"`, fordi den opretter; `opgaveflyt`
  BEVARER opgavens egen, fordi en flytning laver ingen ny post. En funktion der
  kunne skifte arten, ville kunne lave en værkstedsopgave om til en
  facility-opgave — to feltskemaer, én post, og ingen af dem passer bagefter.
  ⚠ **Og modulet følger arten:** `vaerksted` → `flaade`, `facility` →
  `facility`. Spørger du altid om Fleet, kan en kunde der kun har Facility,
  ikke flytte sine egne servicebesøg.
  ⚠ **Regnestykket ligger i `flytOpdatering()`, ikke i funktionen.** To fælder
  kan kun ses dér: **samme ressource er samme nøgle** (et objekt har én værdi
  pr. nøgle, så "null den gamle + skriv den nye" på samme sti bliver til én af
  delene — og reservationen kan forsvinde mens bilen står på liften), og
  **opgaven konflikter med sig selv** (`tjekLedigMod()` filtrerer på
  `r.id !== ny.id`, og `reservationFraOpgave()` bærer intet id).
- **Forlænge en reservation når et arbejde løb over sin tid.** `opgavestatus`
  AFKORTER ved `udfoert` — `min(til, nu)` — og forlænger **aldrig**. Løb
  arbejdet over, kan perioden allerede være lovet væk til en booking, og en
  udvidelse ville lave et overlap datamodellen afviser og gitteret tegner som
  en konflikt der ikke er nogens skyld. Overskridelsen ses på opgaven, hvor
  `faktiskMin` er større end `estimeretMin`.
  ⚠ **Og flaget er vigtigere end tallet.** Uden `afkortet: true` kan man ikke
  se forskel på et besøg der VAR kort og et der SLUTTEDE tidligt. Hvad planen
  sagde, står på opgaven som `startMs + estimeretMin` — læg det ikke på
  reservationen også.
- **Regne `faktiskMin` af reservationens vindue.** Tre tal, tre betydninger:
  `estimeretMin` er hvad vi TROEDE (og det reservationen regnes af),
  reservationens `til` er hvor længe RESSOURCEN var optaget, og `faktiskMin` er
  hvor længe ARBEJDET tog. En bil kan holde på liften i seks timer og blive
  arbejdet på i to, fordi en reservedel manglede.
  ⚠ **Og `faktiskMin` er VALGFRI.** Et krævet felt ville blive udfyldt med
  fiktion af den der ikke ved det, og tallet bruges til at vurdere estimater.
  `kpi.opgaver.udenTidsregistrering` TÆLLER dem der mangler — hullet er
  synligt frem for spærret. Fjern ikke den tælling: uden den er valgfriheden
  bare et hul ingen kan se. Se beslutning 50.
- **Tegne knapper til et ETAPESKIFT i en skærm.** `fleet/Etapeskifte.jsx`
  tegner dem af `tilgaengeligeEtapeHandlinger()`, og `etapeskift` afviser med
  den SAMME `kanSkifteEtape()`.
  ⚠ **De forslagsbærende overgange hører ikke der.** *Send forslag*, *Foreslå
  matchet tur* og *Godkend valgt forslag* kræver et forslag på etapen, og et
  forslag laves hvor turen kan SES — i Disponering og Forslag. En knap andre
  steder ville åbne en dialog man ikke kunne udfylde.
  ⚠ **Og begrundelsen må ikke gøre knappen grå:** så kunne man aldrig nå at
  give den. Dialogen spørger, og teksten hører på etapens historik — ikke i
  auditloggen. Se beslutning 57.
- **Tegne statusknapper i en skærm.** `fleet/Statusskifte.jsx` tegner dem af
  `OPGAVE_OVERGANGE`, og serveren afviser med den SAMME `kanSkifteOpgave()`.
  En knap uden en overgang er en pæn knap; en overgang uden en knap er en vej
  ingen kan finde. Fire skærme viser den samme opgave — byggede hver sin
  knaprække, ville den ene tilbyde et skift serveren afviser.
  ⚠ **Og der er ingen begrundelse ved annullering.** `etapeskift` kræver en,
  fordi en annulleret TUR er en aftale med en kunde der brydes; en driftsopgave
  er vores egen disposition. Vigtigere: en begrundelse ville være fritekst på
  vej mod auditloggen, og allowlisten findes for at holde tastet tekst ude.
- **Bygge et kalendergitter til.** `fleet/Gitterkalender.jsx` tegner
  ressourcer × tid og bruges af Driftskalender, Servicekalender, Disponering
  **og Unitbookings kalender**. Regnestykket ligger i `gitter.js`. To gitre der
  læser det samme interval forskelligt, opdages ikke ved at kigge på dem.
  ⚠ **Og gitteret flytter ingenting selv.** Med `onFlyt` svarer det HVOR
  blokken blev sluppet; hvilken funktion det så betyder, er kalderens sag — de
  tre første kalder `opgaveflyt`, Unitbooking har sin egen vej ind
  (beslutning 37). Læg ikke et funktionsnavn ind i gitteret.
  ⚠ **En blok der rækker ud over vinduet, kan ikke trækkes.** Samme grund som
  pilene findes for: kan man ikke se hvor den begynder, kan man ikke sigte.
- **Lægge millisekunder til for at flytte en blok en dag.** Et døgn er ikke
  altid 24 timer — ved sommertidsskiftet er det 23 eller 25, og et
  værkstedsbesøg der begynder kl. 07, ville begynde kl. 08 efter flytningen.
  `traekTil()` bevarer blokkens forskydning INDE I sin kolonne og lægger den på
  målkolonnens begyndelse. Samme grund som `slots()` bygges med `Date`.
- **Bygge en fakturagodkendelse uden for Indkøb.** Værkstedskalender
  registrerer et **indkøb** i kontekst; godkendelse og afstemning sker ét sted:
  Indkøb → Fakturaer. `fakturaer/` er i øvrigt `.write: false`. To
  godkendelsesflows er beslutning 12 om igen.
- **Skrive divisionsfilteret igen.** Det står i `useListe` — og reglen er
  ikke bare "valgt division plus fælles": en post **uden** division vises i
  **begge**, ikke i ingen. Bookingopsætning havde sin egen kopi uden det led,
  og fejlen var usynlig indtil beslutning 19 fjernede feltet fra bilerne —
  så ville biltabellen stå tom i både Gods og Bus, uden at nogen havde
  slettet en bil. Samme regel to steder, hvor den ene kopi driver.
- **Læse et sagsnummer ud af brødteksten i en mail.** Kun emnefeltet — en
  brødtekst bærer citerede tidligere mails med andre sagsnumre, og så kan en
  fremmed videresende en gammel tråd og lande på en sag han intet har med at
  gøre. `sagsnummerFraEmne()` i `sager.js`.
- **Vise en karantæneret besked i tråden.** Ikke gråtonet, ikke sammenklappet.
  Renderes den inline, læser mennesket den og handler på den — samme regel som
  at en udløbet kompetence blokerer frem for at advare.
- Tilføje `emne` til `LOGBARE_FELTER`. Det er fritekst fra internettet, og
  allowlisten findes for at holde fritekst ude af auditloggen.
- Give en mail-aftale sin egen `kilde.type` i reservationsnoden. Det man
  reserverer, er et **værkstedsbesøg** — `kilde.type: vaerksted`, prioritet 40.
  Ellers taber en bekræftet værkstedsaftale til en booking. Sporet er
  `kilde.viaSagId`.
- **Lægge et grundlag sammen uden `erGaeldende()`.** Brug `summer()` fra
  `grundlag.js`. Et erstattet grundlag findes stadig, og tæller begge med, har
  du dobbeltfaktureret. En rettelse må ikke være en fordobling — og referencen
  går **begge veje**, så `erstat()` kræver `nytId` op front.
- **Sætte en momssats fordi den mangler.** Ikke 25, ikke 0. Eksporten nægtes
  uden — det er det rigtige svar, indtil en bogholder har svaret. Et system
  der gætter rigtigt ni gange ud af ti, lærer brugeren at stole på det tiende.
- **Gøre en materialelinje til én postering.** Salget på fakturagrundlaget og
  lagertrækket i Indkøb er to. Slås de sammen, fakturerer du til kostpris
  eller bogfører din salgspris som en omkostning. Og `MAENGDE_SKALA`
  **importeres** fra `grundlag.js` — to skalaer fakturerer 1000× forkert.
- **Skrive en underskrift to gange — eller slette den først.** En underskrevet
  post er FROSSET: `sensitive/indberetninger/$id` afviser enhver skrivning når
  der findes en `underskrift`, og hovedposten kan ikke slettes under den.
  ⚠ **Leddet står på `$id`, ikke på feltet.** `.write` kaskaderer, så et
  strammere barn kan ikke tilbagekalde en forfaders tilladelse — og en
  `.validate` køres slet ikke ved en sletning. Feltets `!data.exists()` alene
  kunne omgås i to trin: slet, og skriv om. Det blev målt.
  ⚠ **Rækkefølgen er dermed bestemt:** beskrivelse og modpart FØRST,
  underskrift SIDST. En rettelse er en NY indberetning der henviser til den
  gamle. Se beslutning 52.
- **Tro at en `.validate` beskytter mod en SLETNING.** Den siger hvad der må
  STÅ, aldrig hvad der må FORSVINDE. Skal noget ikke kunne fjernes, hører det
  i den `.write` der tillader skrivningen — og `newData` er posten EFTER, også
  når det er et barn eller hele posten der forsvinder. Beslutning 38 og 52.
- **Vise et nøgletal uden sit grundlag.** `beregnNoegletal()` returnerer
  `null` under `MINDSTE_GRUNDLAG`, og skærmen skal skrive "for lidt
  grundlag" — ikke en streg. To leveringer og to hundrede ser ens ud i en
  tabel, og så skiftes leverandør på grundlag af én forsinkelse.
- **Rette `firebase.rules.json` uden at udrulle bagefter.** Prøverne siger noget
  om **filen**; databasen håndhæver det **udrullede**. De to var ude af sync i
  månedsvis, og en kaskaderende `.read` i den udrullede version satte hele
  beslutning 17 ud af kraft uden at én prøve blev rød. Brug `npm run
  regler:udrul` — ikke `firebase deploy` alene. Se beslutning 29.
- **Skrive til databasen uden om `skriv.js`.** Der er én vej ind, som der er
  én vej ud i `useListe`. Kalder tyve skærme `db.ref().set()` selv, bygger de
  også hver sin fejlhåndtering — og så er det tilfældigt hvilke der husker at
  logge og at kunne forklare en afvisning. **En afvist skrivning er ikke en
  netværksfejl:** `permission-denied` betyder at reglerne virker, og
  "prøv igen" lærer brugeren at systemet er i stykker.
- **Tilføje en `slet()` til `skriv.js`.** Regnskabsdata hardslettes ikke, og
  der skal heller ikke findes en vej til det i klienten — en funktion der
  findes, bliver kaldt. En post tages ud af drift med en status og en årsag.
  En prøve læser filen som tekst og fejler på `slet`, `.remove()` og
  `set(null)`.
- **Skrive en klientvalidering der ikke også står i `firebase.rules.json`.**
  Validering i en formular findes for at svare hurtigt, ikke for at afgøre
  noget. Er de to uenige, er reglerne rigtige — og en kontrol der kun findes i
  frontend, tillader før eller siden noget serveren skulle have stoppet.
- **Redigere `functions/delt/`.** Det er en KOPI, lagt af
  `npm run delt:kopier`. Firebase deployer kun `functions/`-mappen, så en
  import op gennem træet fejler i skyen — ved deploy, ikke ved test. Retter du
  kopien, filtrerer klienten mod én allowliste og serveren mod en anden, og
  serveren vinder i tavshed. `test/functions-delt.test.mjs` fanger det.
- **Skrive et kasseudlån uden om `kasseudlaanskriv`.** `kasseudlaan` er
  `.write: false`, og det er ikke en manglende rettighed —
  lagermedarbejderen **har** `kasseudlaan.skriv`. Det er vejen der er lukket:
  et udlån ændrer **to** poster (udlånet og kassen), perioden skal prøves mod
  de andre udlån, og to lagermænd kan ramme samme sekund. `konflikter()` i
  `unitbooking.js` **afgør ingenting** — den svarer, og skærmen bruger den kun
  til at vise hvad der er ledigt. Håndhævelsen ligger i en transaktion inde i
  funktionen. Se beslutning 37.
- **Give en kasse status `booket`.** Den findes ikke. En reservation **er** et
  udlån, og et flag på kassen ville være samme kendsgerning gemt to steder —
  `bemanding.ledig` i ny forklædning. Kassen har kun sine fysiske tilstande,
  og `SELVVALGT_KASSE_STATUS` er de to en klient må sætte: `klargjort` og
  `udlaant` er **følger** af et udlånsskifte. Reglen håndhæver det i begge
  retninger, så en udlånt kasse heller ikke kan meldes hjem uden om udlånet.
- **Fjerne klargøringen som eget trin.** Der er ingen genvej fra `booket` til
  `udlaant` i `UDLAAN_SKIFT`. Klargøringen er det ene sted hvor et menneske
  har kassen i hånden og kan se om den er hel; springes den over, opdages en
  skade først hos museet, hvor den ikke kan afgøres. Og der er ingen vej
  tilbage fra `returneret` — skal kassen ud igen, er det et nyt udlån.
- **Tage navnet `warehouse` til noget.** Det er **reserveret** til et kommende
  modul: blandede varer ind og ud af et lager, med afregning for håndtering
  ind, opbevaring og håndtering ud. Modulet der lejer transportkasser ud pr.
  sag, hed `warehouse` indtil etape 6, derefter `turtlebooking`, og hedder
  nu **`unitbooking`** — netop for at de to ikke skulle hedde det samme. Det
  ville have været `lagre` mod `lager` og `bookinger` mod `bookings` for
  tredje gang. Navnet er ikke ledigt; det er optaget af noget der ikke er
  bygget endnu.
  ⚠ **`Turtlebooking` er stadig navnet på PROTOTYPEN** (Hizkia Denmark) —
  det er deres produkt, ikke vores modul. Ret det ikke i UNITBOOKING.md.
  ⚠ **Og begge omdøbninger var kun billige fordi ingen tenant bar
  modulnøglen.** Det blev målt i den udrullede base, ikke antaget. Noderne
  (`kasser`, `kasseudlaan`, `reolpladser`) og permissionerne skiftede
  ingen af gangene — de står i kundens data og i tokens, og de er dyre.
  Skal et modulnavn skiftes igen, sker det **før** den første kunde krydser
  modulet af, eller slet ikke.
- **Vise en udlånsvarighed uden at sige om den er målt eller planlagt.**
  `fra`/`til` er AFTALEN; `udleveretMs` og `returneretMs` er hvad der skete,
  og de sættes af **serveren** i selve tilstandsskiftet — et tidspunkt en
  browser må oplyse, kan sættes til hvad som helst. `dageUde()` returnerer
  `{dage, faktisk}`, og **flaget er vigtigere end tallet**: uden det læses
  "20 dage" som en måling, og er kassen kommet hjem i forvejen, er det
  forkert på en måde ingen kan se. Samme forbehold som
  `tjekKoerehviletid()` bærer.
- **Tegne et udlån på et gitter uden `halvaabent()`.** Gitteret regner
  halvåbent `[fra, til)`; et udlån er inklusivt i begge ender. Tegnes det
  råt, mangler den SIDSTE dag, og kassen ser fri ud den dag den stadig står
  hos museet — et gitter der er én dag forskudt, opdages ikke ved at kigge på
  det. Oversættelsen står ét sted i `unitbooking.js` og er prøvet mod
  `overlapper()` på hver kombination i ti dage.
- **Skrive `isoTilMs`/`msTilIso` igen.** De står i `format.js`. Klokken er 12
  og ikke midnat, fordi `new Date("2026-08-10")` er midnat UTC — trækkes der
  en time et sted i kæden, bliver det den 9. De var skrevet af to steder, før
  Unitbooking var ved at lave den tredje kopi.
- **Skrive en enhed uden for `bevaegelseskriv`'s ene `update()`.** `enheder/`
  er `.write: false` for alle, og der findes med vilje **ingen**
  `enheder.skriv`. Rækken bærer den SAMME kendsgerning som `beholdning` — det
  ene som rækker, det andet som et tal — og de to skrives atomisk sammen eller
  slet ikke. Deler du skrivningen i to kald, kan halvdelen lande, og så er
  uenigheden vores egen. Beslutning 39.
  Af samme grund bærer en bevægelse af en **serie-sporet** vare præcis **én**
  enhed: bar den ti, skulle ét serienummer bestemme ti enheders skæbne. Og
  `enhedsafvigelse()` skal blive ved med at stå **på skærmen** — en drift der
  ikke kan ses, bliver ikke rettet. En uenighed er en manglende bevægelse, ikke
  et tal der skal rettes.
- **Give en enhed en `pladsId`.** Hylden er BEHOLDERENS adresse, som på
  beholdningsposten. To steder til samme kendsgerning driver fra hinanden
  første gang nogen flytter beholderen.
- **Fjerne et navn linten klager over uden at spørge hvorfor det stod der.**
  `no-unused-vars` fandt nul glemte imports værd at nævne — men den fandt en
  afvist læsning der faldt igennem til et TOMT prisgrundlag, et tal der regnes
  og aldrig vises, og en `visAlle` hvis `setVisAlle` ingen steder kaldes.
  Fjerner du navnet, er fundet væk og fejlen tilbage. De to sidste står med en
  `eslint-disable-next-line` og en note — se README under *Det linten fandt*.
  Og linten er ikke en stilgennemgang: første gennemløb fjernede undervejs 387
  afsluttende kommaer ingen regel havde bedt om, og begravede de rigtige fund.
  Se beslutning 41.
- **Skrive mailmønsteret af.** Der er ét, det hedder `erGyldigMail()` og står i
  `brugere-regler.js` — som nu er en **delt** fil, ikke et spejl. Det stod fire
  steder og gav tre svar: serveren afviste alt hvis topdomæne ikke var på
  nøjagtig to tegn, så `@vognmand.dk` kunne oprettes og `@vognmand.com` kunne
  ikke. En prøve læser filerne som tekst og fejler på en kopi nummer to.
  Se beslutning 42.
- **Prissætte en færge uden vogntogets længde.** En færge tager betaling efter
  kajmeter: Rødby–Puttgarden er 1.338 kr for 10 m og 2.530 kr for 18 m. En sats
  kan bære `laengdeFraMm`/`laengdeTilMm`, og `satsOpslag()` svarer
  `{ sats, mangler }` — de tre grunde (`sats`, `laengde`, `baand`) har hver
  sin rettelse, og et `null` alene kan ikke skelne dem.
  ⚠ **Intervallet er (fra, til] — øvre grænse INKLUSIV**, fordi rederierne
  skriver "indtil 10 m". Præcis 10.000 mm er det BILLIGE bånd; læste du det
  omvendt, kostede nøjagtig 10 m 1.192 kr for meget. Reglen kan ikke håndhæve
  det — en `.validate` ser én sats ad gangen — så læsningen står ét sted og
  har en prøve.
  ⚠ **Og et bånd der ikke findes, er ikke den nærmeste pris.** Falder længden
  uden for alle bånd, er svaret INGEN sats. En båndløs sats ved siden af må
  heller ikke redde opslaget: så ville indførelsen af bånd gøre prisen forkert
  i tavshed. Længden kommer fra `samletLaengdeMm()` — trækker PLUS trailer.
  Se beslutning 18, trin 3.
- **Sætte et loft på brugerens eget layout.** Der stod tolv widgets, i BÅDE
  `widgets.js` og regelfilen. Begrundelsen — "tyve widgets er ikke et
  overblik" — er en god **anbefaling** og ikke en kendsgerning om systemet, og
  det er forskellen der afgør om noget hører i en regel. Forsiden er brugerens
  egen præference om hans EGEN skærm; derfor skrives den med
  `auth.uid === $uid` og ikke af en funktion. Grænsen er kataloget:
  `valideLayout()` afviser dubletter og ukendte nøgler.
  ⚠ **Og antallet er ikke en adgangskontrol.** Hvad en bruger må SE, afgøres
  af kundens **moduler** — som siden beslutning 44 SPÆRRER `kpi/` pr. domæne —
  og af `dashboardvisning`, som stadig kun SKJULER.
  ⚠ **Men rollen afgør stadig ingenting.** Modulklausulen gælder TENANTEN,
  ikke brugeren, og alle syv roller har hver eneste læse-permission. Et
  rollefilter i widgetvælgeren ville derfor stadig være en **pæn knap**:
  kortet væk, tallet åbent. Skal rollen afgøre adgang, kræver det nye
  læse-permissions fordelt på rollerne — se beslutning 43 og 44.
- **Læse `kpi/` i ét kald.** Noden har ingen `.read` længere — den ligger på
  `kpi/<division>/<snapshot>/<domaene>` med modulets klausul, og en læsning af
  forælderen afvises for ALLE, også admin. `useKpi()` henter pr. domæne og
  spørger kun om dem `laesbareDomaener()` siger ja til; ellers ville hver
  sideindlæsning udløse en håndfuld `permission-denied`, og en afvisning skal
  betyde noget.
  ⚠ **Og `.read` må ikke komme tilbage på `kpi/`.** Den kaskaderer, så ét kald
  ville give alle ti domæner og gøre klausulen til dekoration. Nye domæner
  skal i `KPI_DOMAENE` i `kpi-aggregering.js` — et domæne aggregeringen
  skriver, men kataloget ikke kender, bliver aldrig hentet af klienten.
  ⚠ **Og domænet arver sin kildes læse-permission.** `KPI_KILDER` siger hvad
  hvert domæne er REGNET af, og `KPI_PERM` er udledt af det — i dag kun
  `kunder` → `kunder.laes`. Får et domæne en ny kilde, skal begge med;
  prøven udleder kravet af kildernes egne regler og fejler ellers.
  ⚠ **Rollen afgør stadig reelt ingenting**, fordi alle syv roller har hver
  eneste læse-permission. `dashboardvisning` er derfor stadig en VISNING —
  og det der ville lave det om, er hvis en REGEL slog op i indstillingen.
  Se beslutning 44 og ROLLER.md.
- **Skrive en opgave uden om `opgaveplanlaeg`.** `opgaver` er `.write: false`,
  og det er ikke en manglende rettighed — casehandler, disponent, koordinator
  og admin HAR alle `opgaver.skriv`, og funktionen kræver den. Det er vejen
  der er lukket, som på `kasseudlaan` (37) og `enheder` (39).
  En opgave og dens RESERVATION bærer den samme kendsgerning: at enheden er
  optaget. `reservationer` er `.write: false`, så en klient kunne kun skrive
  den ene halvdel — og **en opgave uden reservation ser FRI ud i
  disponeringen** mens bilen står på liften. Det er beslutning 4's fejl.
  ⚠ **Begge de lukkede veje er nu genåbnet med hver sin funktion:**
  `facilityplanlaeg` opretter et servicebesøg (beslutning 51) og
  `opgavestatus` skifter status (50). Løsn ikke `.write` igen.
  ⚠ **Og `.validate` på `opgaver` kan ikke nås af en klient længere.** Blokken
  beskriver stadig formen serveren skal overholde, men håndhævelsen ligger i
  `opgaveMangler()` og `valideOpgaveplan()`. Skriv ikke en regelprøve der
  "afviser" en opgave — den ville være grøn fordi skrivningen er lukket, ikke
  fordi posten var forkert. Se beslutning 45.
- **Basere adgangskontrol på rollen, hvis det egentlig er en permission.**
  Spørg hvad handlingen kræver, ikke hvem brugeren er. Og håndhæv det i
  `firebase.rules.json` — en kontrol der kun findes i frontend, er ikke
  adgangskontrol, men en pæn knap.

## Sikkerhedsregler

```bash
npm run test:rules     # starter emulatoren, kører suiten, lukker den ned
```

Obligatorisk ved hver ændring i `firebase.rules.json`. Suiten dækker sig selv
ind: nodelisten i `test/rules.tenant.test.mjs` læses ud af regelfilen, så en ny
node med en for løs regel fejler uden at nogen har husket at skrive et
testtilfælde. Tilføjer du en ny node, skal du derfor forvente at suiten siger
noget om den.

Testene skal også kunne fejle. Vil du efterprøve det, så løsn `.read` på
`tenants/$tenantId` til `auth != null` og kør igen — fem tests skal falde.

## Når du bygger et modul

`src/moduler/Dashboard.jsx` er referencen. Kopiér mønsteret derfra:
`useKpi()` → `Henter`/`Fejl` → `KpiRaekke` med `KpiKort` → `Kort` med `Tabel`.

Hver skeletfil har en kommentar i toppen med hvad der skal bygges og hvilke
fejl fra mockuppen der skal undgås. Læs den før du rører filen.

## Tilføj en rute

Kun i `src/fleet/nav.js` og `src/App.jsx`. Sidebaren genereres fra nav.js, så de
kan ikke komme ud af sync.

## Kendte huller

- **Cloud Functions: nummerserien er hel.** Reservationskonflikter
  (`tjekLedigMod()` i `etapeskift` og `kasseudlaanskriv`) og etapens
  tilstandsskift med rolletjek (`etapeskift` — bookingens tilstand er AFLEDT,
  beslutning 40) er der. Og `bookingopret` skriver nu bookingen OG dens etaper
  i én opdatering med nummeret fra `naesteBookingnummer()` — som stavedes
  forkert her (`…Nummer`) og blev kaldt ingen steder. Se beslutning 55.
  ⚠ **Oprettelsen laver en KLADDE.** At sende den til planlægning er et
  etapeskift og dermed et andet kald; de to kan ikke lægges sammen atomisk.
  ⚠ **Og den skriver ingen reservation** — den kommer når et forslag
  godkendes.
- **`opgaver` har nu FIRE veje ind, og ingen der er lukket.**
  `opgaveplanlaeg` opretter en værkstedsopgave, `facilityplanlaeg` et
  servicebesøg, `opgaveflyt` flytter en opgave af begge arter, og
  `opgavestatus` skifter dens status — alle fire skriver opgaven OG dens
  reservation i én `update()`. Løsn ikke `.write` igen: det er stadig
  vejen der er lukket, ikke retten. Se beslutning 45, 49, 50 og 51.
  ⚠ **Det der ikke holdes af datamodellen:** en reservation på
  `lokation/<id>` og en på `facilityAktiv/<id>` er to stier, så et
  gulvarbejde i en hal spærrer ikke portene i den. Skærmen siger det
  rigtige; reglen findes ikke. En indeslutningsregel er sin egen
  beslutning — byg den ikke halvt i én funktion.
- **Disponering er BYGGET som visning, og de fem tjek håndhæves — i
  `etapeskift`, ikke i skærmen.** `kanDisponeres()`, `kraevedeKompetencer()`
  + `tjekKompetencer()`, `kanBaere()`, `tjekLedigMod()` og
  `tjekKoerehviletid()` samles i `tjekDisponering()`, som BEGGE sider kalder.
  Skærmen VISER; funktionen HÅNDHÆVER. Læg dem ikke i skærmen: en direkte
  skrivning ville gå uden om. En udløbet kompetence **blokerer**.
  `opgaver.art` er `vaerksted` | `facility` — **ikke** `langtur`
  (beslutning 21), og det man disponerer er en **etape** (beslutning 16).
  ⚠ **Det interaktive gitter ER bygget** — beslutning 49. Dagsgitteret
  opretter og flytter opgaver; **ugesgitteret flytter ikke etaper**, og det er
  ikke et hul: en etape bindes ved at GODKENDE ET FORSLAG, og et træk kan ikke
  udpege et forslag der ikke findes. Gitteret **fører** til Forslag.
  ⚠ **Det der står tilbage, er de GAMLE opgavers reservation.**
  `opgaveplanlaeg` og `opgaveflyt` skriver den nu, men poster fra før de
  funktioner fandtes, har ingen — så `etapeskift` kan ikke se at netop de biler
  står på liften. Skærmen bygger prioritet 40 i browseren for at kunne VISE
  konflikten; serveren kender den ikke. En bagudrettet udfyldning er sin egen
  opgave. Se README.
- **Sagsbaseret mail (beslutning 20) er fase 0 — kun visning.** Modtagevej,
  parsing, afsendelse og scanning mangler. `sager/` findes ikke i
  `firebase.rules.json`, og derfor står `sag.laes`, `sag.sensitiveLaes`,
  `sag.skriv`, `sag.karantaeneFrigiv` og `sag.aftaleBekraeft` heller ikke i
  `permissions.js`. Tilføj dem i samme ombæring som reglerne og deres tests —
  ikke før.
- 7 skærme har ingen mockup. Byg dem ikke på gæt — spørg. **Opsætning → Generelt
  og Brugere & roller er bygget som LÆSESKÆRME**: de viser kun hvad der findes,
  al skrivning er deaktiveret med en begrundelse, og de åbne spørgsmål står på
  skærmen. Det er mønstret for de resterende — en visning kræver ikke et svar
  på hvordan man ændrer.
- **Idébanken findes ikke længere i kundens installation.** Rute, skærm,
  `idebank.skriv` og `idebank`-noden er fjernet (beslutning 22, udført i 31).
  Genindfør den ikke — den lever som selvstændig `idebank.html`.
- **Tro at rollerne er faste.** Det var beslutning 31, og **31b omgjorde
  det**: kunden må redigere hvad en rolle indeholder. De syv NAVNE er stadig
  faste — man opfinder ikke en ottende.
  ⚠ `roller` er stadig `.write: false`, men af en ANDEN grund end før: det er
  **vejen** der er lukket, ikke retten. `rolleskriv` er den ene vej ind, og den
  minter claims og kalder `revokeRefreshTokens` i samme ombæring — kunne en
  klient skrive noden direkte, ville node og token stå og være uenige indtil
  næste mint. Samme ordning som `opgaver` (45) og `kasseudlaan` (37).
  ⚠ **Og `roller/` er en KILDE, aldrig et HÅNDHÆVELSESPUNKT.**
  `firebase.rules.json` må aldrig slå op i noden — adgang afgøres udelukkende
  af `auth.token.perms`, og en prøve falder hvis en regel nævner `roller`.
  ⚠ **To ting kan ikke lade sig gøre**, og spærringen ligger i funktionen:
  `brugere.skriv` kan ikke fjernes fra den sidste rolle der har den, og heller
  ikke fra ens egen. En admin der vil degradere sig selv, skal have en anden
  admin i huset. Se beslutning 31 og 31b.
