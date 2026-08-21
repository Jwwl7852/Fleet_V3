# FleetControl 3.0

Multi-tenant TMS for danske vognmænd. Én shell, én informationsarkitektur, én
talkilde.

Udgangspunktet var 20 mockups fordelt på tre uforenelige designretninger og en
deployet v1.4. v3.0 samler dem. Alt der stod i konflikt er afgjort — de 40
beslutninger står i **[BESLUTNINGER.md](BESLUTNINGER.md)**, så du kan omgøre
dem enkeltvis i stedet for at skulle finde ud af hvorfor noget ser ud som det
gør.

| Fil | Hvad |
|---|---|
| **README.md** | Hvor projektet står, og hvordan du kommer i gang. Den her. |
| **[FLEET.md](FLEET.md)** | Fleets driftskalender: hvad der er bygget af kravlisten, og hvad der mangler |
| **[BESLUTNINGER.md](BESLUTNINGER.md)** | De 60 beslutninger med begrundelser. Læs den før du bryder med noget |
| **[EJERKONSOL.md](EJERKONSOL.md)** | Ejerkonsollen: datamodel, funktioner og de fire beslutninger bag |
| **[ABONNEMENT.md](ABONNEMENT.md)** | Abonnementsfakturering — priser, rabat og frosne fakturagrundlag. Prismodellen er **bygget**; noden og skærmen mangler |
| **[UNITBOOKING.md](UNITBOOKING.md)** | Unitbooking-modulet: hvad prototypen indeholder, syv ting der skal afgøres først, og etaperne. **Plan, ikke bygget** |
| **[ARKITEKTUR.md](ARKITEKTUR.md)** | Datamodellen: noder, konventioner, adgang, egress |
| **[ROLLER.md](ROLLER.md)** | Rollegennemgangen: hvad hver af de syv roller **faktisk** kan læse og skrive. Begge sider er MÅLT — læsning mod det udrullede, skrivning i emulatoren. ⚠ 48 af 55 læsestier er ens for alle syv; skrivningen er finkornet |
| **[SPROG.md](SPROG.md)** | Seks sprog på hele platformen. **Ikke bygget** — dokumentet er listen over hvad der IKKE må oversættes, og de tre steder kravet støder ind i en beslutning |
| **[CLAUDE.md](CLAUDE.md)** | Arbejdsregler hvis du bruger Claude Code |

## Kom i gang

```bash
npm install
cp .env.example .env.local          # DEV-nøgler. Ikke prod.
git config core.hooksPath .githooks # kører regel- og designtesten før commit
npm run dev
npm test                            # 1471 tests. Starter emulatoren.
npm run test:design                 # kun designtokens. Ingen emulator, ~0,1 s.
npm run regler:tjek                 # håndhæver databasen den regelfil du har?
npm run delt:kopier                 # laegger audit-politikken ind i functions/delt/
npm run kunde:opret -- --id x --navn "X ApS"   # opretter en TOM kunde
npm run funktioner:udrul            # udruller Cloud Functions og aabner dem
```

`core.hooksPath` skal sættes **én gang pr. klon** — hooks følger ikke med i
git. Uden den kan man committe en ændring i `firebase.rules.json` uden at have
kørt testen, og det er præcis sådan reglerne kunne ligge ugyldige fra
fundamentet i månedsvis uden at nogen opdagede det.

**Der er to Firebase-projekter.** `fleetcontrol-dev-1ac1c` er til at smide
væk; `fleetcontrol-98e11` er rigtige kunders data. Som ny udvikler peger du på
**DEV** — det gør `.env.example` allerede.

### Provisionér DEV, én gang pr. maskine

```bash
# .serviceaccount-dev.json fra Firebase-konsollen (DEV → Projektindstillinger
# → Tjenestekonti). Gitignored. Og VITE_DEV_BRUGER_KODE i .env.local.
npm run provisioner:dev
```

Scriptet sætter `tenants/demo/_findes`, opretter **seks brugere — én pr. rolle**
(plus din egen, hvis `VITE_DEV_EJER_MAIL` er sat)
med rigtige custom claims, og seeder demo-datasættene ind under de noder
skærmene læser. Uden det afviser hver eneste regel alt: `_findes` er en
forudsætning i hver `.read`, og en indlogget bruger ville se "afvist" overalt.

⚠ **To spærringer, begge mekaniske.** Scriptet afbryder hvis nøglen peger på
produktion, og hvis nøglefilen ikke er dækket af `.gitignore` — nøglen giver
fuld admin og går uden om alle regler, og en committet nøgle ligger i
historikken bagefter. Der er ikke noget `--force`. Se beslutning 27.

Rollerne afprøves ved at **skifte session**, ikke ved at skifte en dropdown:
claims kommer fra tokenet, og en klient kan ikke ændre sit eget token
(beslutning 28).

**Produktionsnøglerne findes kun i Netlify.** Appen udleder miljøet af
projekt-id'et og viser en bjælke i toppen, når du ikke er på produktion.
Havner produktionsnøgler et sted de ikke hører hjemme, bliver bjælken rød og
stribet.

Uden `.env.local` kører appen i demo-mode med datasættene i `fleet/demo-*.js`.
Ingen hvide skærme, ingen crash.

Deploy: Netlify, `npm run build` → `dist`. `netlify.toml` har SPA-fallback —
uden den giver et direkte hit på `/booking/disponering` en 404.

**Cloud Functions kører.** DEV er på **Blaze**, og den første funktion —
auditloggen i `functions/index.js` — er udrullet i `europe-west1`. Udrul med
`npm run funktioner:udrul`; den kopierer den delte politik ind i
`functions/delt/` først.

⚠ **Budgetalarmen kom FØR opgraderingen, og rækkefølgen var med vilje.** Mellem
opgradering og alarm er der et vindue hvor en løkke i en funktion kan koste
penge uden at nogen får besked. Der er alarm på **både DEV og PROD** på 50 kr,
og en oprydningspolitik på containerbillederne (3 dage) — uden den vokser
Artifact Registry stille og roligt ind i budgettet.

⚠ **Skrivning uden auditlog er ulogget skrivning.** `audit.log()` tæller fejlen
og går videre, så en skærm ikke går ned når loggen er nede. Det er rigtigt for
en læseskærm og forkert for en pilot: kunden skal kunne få svar på hvem der
ændrede hvad.

⚠ **DEV har ingen Storage-bucket** (kræver Blaze; DEV står på Spark). Skal en
skærm uploade filer, skal bucket'en oprettes i `europe-west1` sammen med en
budgetalarm. Regionen kan ikke ændres bagefter — se ARKITEKTUR.

## Beslutninger

Kort form. Begrundelserne — hvad der gik galt uden hver enkelt — står i
**[BESLUTNINGER.md](BESLUTNINGER.md)**. Et brud skal være bevidst, ikke
tilfældigt.

| # | Beslutning | Fil |
|---|---|---|
| 1 | Flad sidebar med undermenuer. Ingen topfaner | `fleet/nav.js` |
| 2 | Beløb i hele **øre**, altid ekskl. moms. `momsOere` separat | `fleet/format.js` |
| 3 | Afvigelser gemmes som (faktisk − budget). Farven følger `betterWhen` | `fleet/format.js` |
| 4 | **Én reservationsnode.** Booking, værksted, facility og fravær skriver alle til den | `fleet/reservations.js` |
| 5 | Booking er en tilstandsmaskine. Disponenten godkender ikke sit eget forslag | `fleet/booking-state.js` |
| 6 | **Nøgletal fra én aggregeret node.** Afledte tal beregnes hos forbrugeren | `fleet/useKpi.js` |
| 7 | Satser versioneres med `gyldigFra` og overskrives aldrig | `fleet/pricing.js` |
| 8 | Ét nummerformat: `PRÆFIKS-ÅÅÅÅ-NNNNN` fra counter i en transaction | `fleet/booking-state.js` |
| 9 | Gods/Bus gælder hele platformen | `fleet/AppShell.jsx` |
| 10 | Accent er `#125bec` | `fleet/fleet.css` |
| 11 | Driftsomkostning pr. km ≠ kalkulationspris pr. km | `moduler/flaade/Oversigt.jsx` |
| 12 | De to Flåde-værkstedsskærme er slået sammen | `moduler/flaade/Vaerkstedskalender.jsx` |
| 13 | Live-kort er beholdt — det findes deployet, men i ingen mockup | `moduler/booking/LiveKort.jsx` |
| 14 | `indkoebsprisafvigelse` og `salgsprisafvigelse` — aldrig bare "prisafvigelse" | `fleet/useKpi.js` |
| 15 | **Division er et felt, ikke en sti.** `gods` \| `bus` \| `faelles` | `fleet/useListe.js` |
| 16 | Kombi-transport: en booking er et forløb med N etaper. Tilstanden ligger på **etapen** | `fleet/booking-state.js` |
| 17 | **`securityLevel` + klassificerede søskendenoder** (`sensitive/`, `vaerdi/`) | `fleet/permissions.js` |
| 18 | Personale og flåde er entiteter. `personId` er ikke `uid`. **Trin 3 er lukket:** `laengdeMm` LÆSES nu — en sats kan bære et længdebånd, og færgen koster efter kajmeter | `fleet/personale.js`, `fleet/flaade.js`, `fleet/pricing.js` |
| 19 | Stamdata har ikke en division. Forbudt på `personale/` og `koeretoejer/` | `firebase.rules.json` |
| 20 | **Sagsbaseret mail:** nummeret i emnefeltet er hele integrationen | `fleet/sager.js` |
| 21 | **`opgaver.art` er `vaerksted` \| `facility`** — ikke `langtur`. En langtur *er* en etape. Køre-hviletid blokerer, men med forbehold | `fleet/opgaver.js`, `fleet/koerehviletid.js` |
| 22 | **De ni skærme uden mockup er afgjort.** Fakturering hedder **Fakturagrundlag** — FleetControl laver ikke den juridiske faktura. Live-kort hedder **Rute & status** — ingen GPS. Indberetninger deles i **driftshændelser** og **udgiftsregistreringer**. Kompetencer har **lovkritiske** (blokerer) og **virksomhedskrav** (advarer med begrundet override). Leverandører får **objektive tal, ingen stjerner**. Integrationer viser **kun det der findes**. Idébank ud af kundens installation | `fleet/integrationer.js`, `fleet/rutestatus.js` |
| 23 | **Supportadgang er tidsbegrænset og kundestyret.** FleetControl-personale har som standard **ingen** adgang. Kundens administrator giver adgang med varighed, type, formål og sagsnummer; den **udløber automatisk**, ikke ved at nogen husker det. En supportsag bærer kontekst — aldrig passwords, tokens eller feltværdier. **Ikke besluttet:** AI-diagnose og systemstatusside | *ikke bygget — efter fase 1* |
| 24 | **Support krydser tenant-grænsen — én gang, og kun her.** Sagen ligger i `support/sager/<id>` i toppen med et `tenantId`; hver tenant har en **indeksnode** til at liste sine egne. **Retter beslutning 23:** auditloggen vises som et bundet **udtræk** på sagen, ikke som adgang. ±5 minutter, højst 50 poster, ikke konfigurerbart | `fleet/support.js` |
| 25 | **De fire sidste skærme — og det er antagelser, ikke afgjorte krav.** Skal valideres hos første kunde. Et fakturagrundlag er en **opgørelse**, ikke en faktura; det **erstattes** frem for at rettes, med referencen **begge veje**, og kun grundlag uden `erstattetAfId` tæller med. **Momssatsen står pr. linje og gættes ikke** — eksport nægtes uden. En indberetning **har** en sag, den **er** ikke en sag. Materialeforbrug er **én hændelse med to posteringer**: et salg og et lagertræk. Kompetencekravet **kommer fra enheden** — alt udledt blokerer, resten advarer med begrundet override. Leverandørtal står **med deres grundlag**; under tre observationer vises ingen procent | `fleet/grundlag.js`, `fleet/indberetninger.js`, `fleet/leverandoerer.js` |
| 26 | **En afvist læsning er ikke et netværksproblem.** `permission-denied` blev oversat til demo-data og "ingen forbindelse". Tre tilstande er skilt: manglende database, manglende bruger (kendt **før** forespørgslen — den sendes ikke) og afvist af reglerne. **Opdigtede tal følger aldrig en afvisning.** Demo-data ved `auth == null` er et **stillads** gated på dev, og skal fjernes når login lander | `fleet/datatilstand.js` |
| 27 | **Dev bruger rigtige DEV-brugere mod DEV-projektet.** Claims-kæden var uprøvet i browseren — emulatoren lader dig minte et token med hvilke claims du vil, og tester derfor reglerne mod claims du selv har opfundet. Den bliver til rules-testene. Seks seedede brugere, én pr. rolle, med `perms` udledt af presettet. `_findes` er trin 1: uden markøren afviser hver regel alt. Scriptet **nægter at køre mod andet end DEV**, ikke konfigurerbart | `scripts/provisioner-dev.mjs` |
| 28 | **Rollevælgeren er en brugervælger.** Perms kommer fra tokenets claims, og en klient kan ikke ændre sit eget token — en dropdown kan derfor ikke ændre adgang, kun hvad UI'et tegner. I dev skiftes **session**: log ud, log ind som en anden seedet bruger, nyt token. I demo bevares overstyringen, hvor der ingen server er at være uenig med. Adgangsvejen selv (`harAdgang`) er **miljøuafhængig** og kræver et tenant-claim | `fleet/Brugervaelger.jsx`, `App.jsx` |
| 29 | **En udrulning er ikke færdig, før den er efterprøvet.** `firebase.rules.json` var aldrig udrullet: DEV kørte en ældre version med en kaskaderende `.read` på `tenants/$tenantId`, så hele beslutning 17 var sat ud af kraft. **Prøverne havde ret om filen og sagde intet om databasen.** `npm run regler:udrul` udruller OG sammenligner. Læsetjekket arver bevidst ikke provisioneringens produktionsspærring — mod prod er det mere værd | `scripts/tjek-regler.mjs` |
| 30 | **Kategorifarver er ikke statusfarver.** `GRAF_TONE` havde fem toner, og det så ud som om de rakte til Dashboards fem opgavestatusser — men statusfarver siger *hvor slemt det er*, kategorifarver siger *hvilken ting det er*. Genbruges de, betyder rød både "kritisk" og "den femte kategori". Fem `--fc-serie-*`, **valideret** med dataviz-validatoren, ikke skønnet | `fleet/fleet.css`, `fleet/ui.jsx` |
| 31 | **Roller var faste — nu kan kunden redigere dem (31b).** Den oprindelige beslutning står stadig i BESLUTNINGER.md, fordi den er det eneste sted der står hvad der går galt uden den. De to farer er håndteret frem for forsvundet: `brugere.skriv` kan ikke fjernes fra den sidste rolle der har den eller fra ens egen, og `roller/` er en **kilde** — aldrig et håndhævelsespunkt. Reglerne læser den aldrig; adgang afgøres stadig kun af tokenet, og en prøve håndhæver det | `fleet/permissions.js`, `firebase.rules.json`, `functions/index.js` |
| 32 | **Et lukket abonnement lukker tenanten — ikke kontoen.** At spærre kundens logins er en fælde: nogle konti er spærret *individuelt*, og ved genåbning ville man **genåbne folk der var fyret**. Statussen ligger på tenanten, hver regel kræver `aktiv`, og genåbning er ét felt. Tre noder bliver læsbare, så låseskærmen kan forklare sig — en spærring der ikke kan forklare sig selv, ligner en fejl | `firebase.rules.json`, `fleet/abonnement.js`, `App.jsx` |
| 33 | **Et fravalgt modul lukker sine noder — læsning og skrivning.** Afkrydsningen var en kommerciel kontrol; det holdt kun så længe listen tegnede en sidebar. Kan et modul **fratages**, har kunden ellers stadig data og API. ⚠ Prisen: kunden kan ikke hente sine egne data ud gennem appen, så et fravalg skal **aftales, ikke klikkes**. `opgaver`, `satser` og `fakturaer` står i basen — de hører hver til to moduler | `fleet/moduler.js`, `firebase.rules.json` |
| 34 | **Ejerkonsollen skriver ikke — den beder om det.** Fire Cloud Functions med `udbyder === true` som **første** handling; alle ejer-noder er `.write: false`. ⚠ Her — og kun her — kommer tenanten fra nyttelasten, fordi en ejerkonto **ingen** har. Prøver holder kundens og ejerens tjek adskilt, og `kundeadmin` og `opretbruger` deler ÉN oprettelse | `functions/index.js` |
| 35 | **Ejerskab tildeles ikke fra konsollen.** `udbyder`-claim'et sættes kun med servicekontonøglen (`npm run ejer:giv`). Vi er to: kunne den ene fjerne den andens claim, kunne den ene lukke den anden ude — og adgangen til at rette det var selv ejerskabet. En ejerkonto har **ingen tenant**, så spærringen er ikke en betingelse i en skærm, men fraværet af en nøgle | `scripts/ejer.mjs`, `App.jsx` |
| 36 | **En nul-linje dokumenterer en måling.** Linjer på 0 kr. blev sprunget over som støj. Det holder ikke med en frimængde: uden *"Brugere (1 · 3 inkluderet) — 0,00"* kan kunden ikke se forskel på at målingen var **nul** og at den **manglede** — og målingen kan ikke laves bagud. Kom sammen med at **platformsadgang er en egen prislinje** (ikke `dashboard`) og at **frimængden hører til abonnementet** (ikke modulet) | `fleet/priser.js`, `firebase.rules.json` |
| 37 | **»Booket« er ikke en kassestatus, og et udlån skrives kun af serveren.** En reservation **er** et udlån — står den også på kassen, er samme kendsgerning gemt to steder, og de bliver uenige. Kassen har kun sine fire **fysiske** tilstande, og klienten må kun sætte `ledig` og `udeAfDrift`; resten er følger af et udlånsskifte. `kasseudlaan` er `.write: false`: udlånet og kassen skal skrives sammen eller slet ikke, perioden skal prøves mod de andre udlån, og to lagermænd kan ramme samme sekund — derfor et konflikttjek **inde i en transaktion**. ⚠ Ingen genvej fra booket til udlånt: klargøringen er det ene sted et menneske har kassen i hånden | `fleet/unitbooking.js`, `functions/index.js` |
| 38 | **Kundens pris ligger på kunden — og kræver derfor TO permissions.** `kunder/<id>/priser/<ydelseId>/satser/<id>`: enten en egen pris eller en rabat, aldrig begge. ⚠ `.write` kaskaderer, og `kunder.skriv` har casehandler, disponent og koordinator — `satser.skriv` har kun admin. Uden en `.validate` på `priser` der **også** kræver `satser.skriv`, ville prisen kunne sættes af flere end standardprisen kan, alene fordi den lå i en anden sti. ⚠ Hullet der bliver tilbage: `.validate` kører ikke ved en **sletning**, og det kan ikke lukkes med en regel — efterprøvet mod den udrullede base, ikke udledt | `fleet/pricing.js`, `firebase.rules.json` |
| 39 | **Enheden er et eget objekt.** `enheder/<serienr>` bærer hvor ét stykke gods er — men samme kendsgerning som `beholdning`. Prisen betales tre steder: én atomisk skrivning, én enhed pr. bevægelse, og en **synlig** afvigelse | `fleet/warehouse.js`, `moduler/warehouse/Sporbarhed.jsx` |
| 40 | **Forslaget hører på etapen.** Det lå både på bookingen (tid, pris) og på etapen (enheder, chauffør) — det samme løfte to steder. Følgen: der er kun ÉN overgangstabel, og bookingen har **ingen** tilstandsmaskine — dens tilstand er afledt | `fleet/booking-state.js`, `moduler/booking/Forslag.jsx` |
| 41 | **Der er en linter, og den afgør ét spørgsmål.** `npm run build` er grøn når en underkomponent læser et navn der ikke findes — fejlen kommer først når React render'er, og så er skærmen hvid. Det er sket **fem gange**, og hver gang blev den fundet ved at klikke. Reglerne er kun dem der svarer ja eller nej; `eslint:recommended` ville være en holdning ingen har taget stilling til. ⚠ Den fandt nul manglende navne — men en afvist læsning der faldt igennem til et tomt prisgrundlag, et regnet tal der aldrig vises, og en tilstand uden en kontrol | `eslint.config.js` |
| 42 | **Mailmønsteret stod fire steder, og de var uenige.** Serveren bar `{2}` hvor klienten bar `{2,}` — et topdomæne på nøjagtig to tegn. `jorn@vognmand.dk` kunne oprettes, `jorn@vognmand.com` kunne ikke, og svaret var *"Ugyldig mailadresse"*. Det ramte både `opretbruger` og `kundeadmin`; de deler `opretKonto()`. Prøven prøvede `"lars-at-vognmand"` og så det ikke: et mailmønster fejler ikke på det grove. `brugere-regler.js` er nu en **delt** fil, ikke et spejl | `fleet/brugere-regler.js`, `scripts/kopier-delt.mjs` |
| 43 | **Brugerens eget layout har intet loft.** Der stod tolv — i `widgets.js` OG i regelfilen, hvor pladserne var talt til elleve. Begrundelsen ("tyve widgets er ikke et overblik") er en god **anbefaling** og ikke en kendsgerning om systemet, og layoutet er brugerens præference om hans EGEN skærm. Grænsen er nu kataloget selv: `valideLayout()` afviser dubletter og ukendte nøgler, så et layout aldrig kan blive længere end der er widgets. ⚠ Antallet var aldrig en adgangskontrol — og rollen er det stadig ikke, men `kpi/` er ikke længere åben: modulklausulen kom i **beslutning 44** | `fleet/widgets.js`, `firebase.rules.json` |
| 44 | **`kpi/` er delt på domæne.** Noden havde ÉN `.read` der kun krævede tenant-medlemskab — så en kunde uden Økonomi kunne læse `kpi/gods/current/oekonomi` direkte, mens sidebaren og widgetvælgeren blot SKJULTE det. `.read` ligger nu på `$division/$snapshot/$domaene` med modulets klausul, og den er VÆK fra toppen: den kaskaderer, så en `.read` på `kpi/` ville gøre klausulen til dekoration — også for admin. Prisen er at `useKpi()` henter pr. domæne. ⚠ **Og domænet arver sin kildes læse-permission** — `kunder` kræver `kunder.laes`, fordi et nøgletal ikke er mildere end sit grundlag. Det er det ENESTE led i dag: af de noder aggregeringen læser, kræver kun `kunder` en. Ændrer intet nu; guarden er at prøven udleder kravet af kildernes egne regler | `fleet/kpi-aggregering.js`, `fleet/useKpi.js`, `firebase.rules.json` |
| 45 | **`opgaver` er `.write: false` — vejen ind er `opgaveplanlaeg`.** Disciplinen stod skrevet i `opgaveplan.js`'s eget hoved (*"der skrives intet herfra direkte"*) mens reglen tillod det: casehandler, disponent, koordinator og admin har alle `opgaver.skriv`. En opgave og dens **reservation** bærer samme kendsgerning, og `reservationer` er `.write: false` — en klient kunne skrive den ene halvdel, og en opgave uden reservation ser **fri** ud i disponeringen. Permissionen består; det er vejen der er lukket (som beslutning 37). ⚠ Prisen: fjorten regelprøver flyttede til `opgaveMangler()`/`valideOpgaveplan()`, fordi de ellers ville blive grønne af den forkerte grund | `firebase.rules.json`, `functions/index.js` |
| 46 | **En transport ER en etape — og labelen gemmes ikke.** Planchen bar to id-serier for samme kendsgerning: `TRP-2024-0513` på beholderen og `BK-2026-0513` på mærkatet. Et transport-objekt ved siden af etapen ville være prototypens DE-QR 777 mod DE-KL 404 for tredje gang — alt en transport har brug for (`fraSted`, `tilSted`, `koeretoejIder`, `bookingId`) står allerede på etapen. `carriers.transportId` hed derfor forkert og stod **uden** fremmednøgle; feltet er nu `etapeId` med eksistenskontrol mod `etaper`. ⚠ Omdøbningen var gratis, fordi det blev **målt** i den udrullede DEV-base: 7 beholdere, én bar feltet, og det var den seedede demo-række. ⚠ Og stregkoden bærer ikke planchens `BK-…-C-000245` — den opfandt både et femte nummerformat (beslutning 8) og et løbenummer ved siden af beholderens eget id. ⚠ Labelen er **ingen node**: typen udledes af etapekæden, og et gemt mærkat ville drive fra sin booking | `fleet/transportlabel.js`, `firebase.rules.json` |
| 47 | **Skærmen er 85 % lyst felt — det er dét der trætter, ikke kuløren.** Et farveforslag "til at kigge på en hel dag" viste sig målt at være den palet vi allerede havde: ét RGB-trin på baggrunden, nul på kortet. ⚠ Og det trak den forkerte vej — 63,6–71,8 % af plancherne ligger over 250 i lysstyrke mod vores 58,9 %. Kortet er nu `#f4f6fa` og siden `#e4e8f0`; andelen på maksimum falder fra 58,9 % til 21 %. ⚠ Mit første forsøg (`#fbfcfe`) var for forsigtigt og blev **målt ned**: 97,3 % WCAG-lysstyrke er stadig 252 af 255 i råt lys, og skærmens gennemsnit faldt 1,4 %. ⚠ Målingen fandt en fejl der allerede stod der: `--bc-muted` på `--fc-bg` var **4,3:1 — under AA**. ⚠ Og `--bc-line` og mærkatets printbund måtte følge med, ellers forsvandt kortets kant og labelen blev printet grå | `fleet/fleet.css`, `test/design-tokens.test.mjs` |
| 48 | **Skriftstørrelser er ni tokens, ikke 24 tal spredt i filen.** Beslutning 47 pegede videre: **68 % af tegnene på dashboardet stod på 13 px eller mindre**, 37 % på 12,5 eller mindre — lille skrift med hård kontrast er den mest trættende kombination der findes. `fleet.css` havde 24 forskellige størrelser på 119 steder, otte med halve pixels (8,5 · 9,5 · 10,5 …). Samme fejl som rå farver var før beslutning 10: to tal der næsten er ens, er to lejligheder til at være uenige. Brødteksten er nu **14**, ikke 13. ⚠ Fire verdener, ikke én skala: skærmens tekst må vokse, men **mærkatet** (100 × 200 mm, afledt af 203 dpi — beslutning 46) og **donutens SVG-tekst** (`font-size:6` er seks viewBox-enheder, ikke pixels) må ikke. Ét gulv over alle 119 steder havde printet teksten ud over etiketten. ⚠ `.fc-table th` stod på **10,5 px** — hver eneste tabeloverskrift i programmet, det man læser først, var mindre end alt andet. ⚠ Kalenderens kolonne fik lov at vokse fra 30 til 34 px, fordi det blev **målt**: 180 + 28 × 34 = 1132 px mod 1240 til rådighed. Havde det ikke passet, skulle skriften være blevet stående — en kalender der ruller er værre end en med lille skrift | `fleet/fleet.css`, `test/skrift.test.mjs` |
| 49 | **Gitteret flytter opgaver — `opgaveflyt`, og attrappen er væk.** "Træk opgave hertil" kunne ikke fokuseres eller klikkes; det man ville trække, er en **opdatering** af en post, og `opgaveplanlaeg` opretter kun ("INTET id. Serveren laver push-nøglen"). ⚠ Den krævede **ingen regelændring** — `opgaver` og `reservationer` er begge `.write: false` i forvejen; det blev målt frem for antaget. ⚠ To fælder, og begge kan kun ses i et regnestykke, derfor er `flytOpdatering()` **ren**: **samme ressource er samme nøgle** (et objekt har én værdi pr. nøgle, så "null den gamle + skriv den nye" på samme sti bliver til én af delene — landede `null` sidst, forsvandt reservationen mens bilen stod på liften), og **opgaven konflikter med sig selv** (`tjekLedigMod()` filtrerer på `r.id !== ny.id`, og `reservationFraOpgave()` bærer intet id). ⚠ Og **et døgn er ikke 24 timer**: rå addition over sommertidsskiftet flytter et 07-besøg til 08. ⚠ **Blokkens tegning er ikke opgavens varighed** — en opgave uden estimat tegnes som én time, og regnedes `estimeretMin` af blokken, ville den time blive et rigtigt estimat. ⚠ **Arten flyttes ikke med**, og modulet følger den. En facility-opgave har **to** ressourcetyper: et træk fra en port til en hal skifter TYPE og rydder `aktivId` | `fleet/opgaveplan-regler.js`, `fleet/gitter.js`, `functions/index.js` |
| 50 | **Opgavens statusmaskine havde seks tilstande og nul veje imellem dem.** En driftsopgave kunne oprettes og flyttes, men aldrig meldes i gang eller udført — mens Arbejdskøen viste statusserne og `kpi.opgaver` talte dem op. ⚠ **Et statusskifte rører reservationen**, og det er derfor det er en serversag: en annulleret opgave skal give bilen fri igen, en udført skal holde op med at spærre den, og `reservationer` er `.write: false` — en klient kunne kun skrive den ene halvdel. ⚠ `udfoert` kan **kun** nås fra `igang` (et besøg meldes ikke færdigt uden at nogen har haft bilen på liften — som klargøringstrinnet i 37), man kan ikke **af-starte** et arbejde, og `udfoert`/`annulleret` er **endestationer**. ⚠ **Reservationen afkortes til nu — men forlænges ALDRIG:** løb arbejdet over sin tid, kan perioden allerede være lovet væk, og en udvidelse ville lave et overlap modellen afviser. Meldes den færdig før den begyndte, fjernes den. `afkortet: true` fordi flaget er vigtigere end tallet. ⚠ **Tre tal, tre betydninger:** `estimeretMin` er hvad vi troede, reservationens `til` hvor længe RESSOURCEN var optaget, `faktiskMin` hvor længe ARBEJDET tog — en bil kan holde på liften i seks timer og blive arbejdet på i to. ⚠ `faktiskMin` er **valgfri**, og svaret stod allerede i koden: `kpi.opgaver.udenTidsregistrering` tæller dem der mangler. Et krævet felt ville blive udfyldt med fiktion | `fleet/opgaveplan-regler.js`, `fleet/Statusskifte.jsx`, `functions/index.js` |
| 51 | **Facility kunne flytte og afslutte sine servicebesøg — men ikke oprette et.** `opgaveplanlaeg` SÆTTER `art: "vaerksted"`, så den sidste lukkede vej ind i `opgaver` krævede sin egen funktion — Servicekalenderen skrev det selv: *"En knap her ville love noget serveren afviser."* ⚠ **Ikke et art-flag**, og begge grunde er spærringer: `art` ER feltskemaet (21), og modulet er `facility` mod `flaade` — spurgte begge om Fleet, kunne en kunde der KUN har Facility, ikke planlægge sit eget besøg. ⚠ **Et anlæg ELLER et sted, ikke begge:** `ressourceId()` foretrækker aktivet, så lokationen ville stå som en påstand ingen læser — og anlæggets lokation står på anlægget. Målt: **fem af ni** demo-poster bar begge, alle fem enige med aktivets eget felt. Enten-eller er bygget ind i **vælgeren**. ⚠ **Anlæggets status spærrer ikke** — modsat en solgt bil er en port i stykker præcis det et servicebesøg findes for. ⚠ **Divisionen låses ikke til `faelles`:** opgaven bærer hvem der BETALER, og `op-013` står som `bus`. ⚠ Undervejs: `ART_FELTER.facility` lovede **mindre** end posterne bar (`estimeretMin` på alle ni, `leverandoerId` på seks, `sagId` på begge arter) — og prøven slog det modsatte fast. Et felt reservationen regnes af, kan ikke stå uden for artens skema; begge retninger prøves nu | `fleet/opgaveplan-regler.js`, `moduler/facility/Servicedialog.jsx`, `functions/index.js` |
| 52 | **Write-once var ikke write-once — man skulle bare slette først.** Underskriften på en indberetning havde `.validate: "!data.exists()"`, CLAUDE.md beskrev den som gældende, og **to prøver sagde at den holdt**. Ingen af dem slettede først — og en `.validate` køres **ikke** ved en sletning. ⚠ **Målt i emulatoren:** `remove()` underskriften, `update({underskrift:null})` og `remove()` hele den klassificerede post svarede alle TILLADT, og en ny underskrift bagefter ligeså. Brudt i to trin. Samme fejlklasse som beslutning 38 navngav for `priser`, ét niveau dybere: **en `.validate` siger hvad der må STÅ, aldrig hvad der må FORSVINDE.** ⚠ **Og det kunne ikke løses på barnet:** `.write` kaskaderer, og et strammere barn kan ikke tilbagekalde en forfaders tilladelse — beslutning 17's kendsgerning, den anden vej. ⚠ **Spærringen dækker mere end feltet:** kunne `skadeBeskrivelse` rettes bagefter, ville underskriften bevise noget andet end det der blev skrevet under på. Hele den underskrevne post er frossen — og rækkefølgen er dermed bestemt: beskrivelse først, underskrift sidst. ⚠ **Halvdelen af en spærring er en ny fejl:** hovedposten kunne stadig slettes af sin ejer, på det SAMME id, og så pegede beviset på ingenting. Den kan nu ikke slettes hvis der findes en underskrift — men en **uskreven** post må stadig trækkes tilbage, for `FORLOEB` har ingen `annulleret`. ⚠ Fundet fordi READMEs nodetabel var drevet: **fem af tolv rækker** sagde "mangler regler" om noder der havde dem, og rækken om underskriften sagde at spærringen ikke fandtes — derfor kiggede ingen på om den virkede | `firebase.rules.json`, `test/rules.indberetninger.test.mjs`, `test/dokumentation.test.mjs` |
| 53 | **Hele kunderegistret kunne slettes med ét kald.** Efter 52 målte jeg resten: **20 af 23 poster kunne hardslettes, og 17 af 23 HELE noder kunne tømmes i ét `remove()`** — af en bruger med de permissions admin i forvejen har. Kunderegistret, prisgrundlaget, alle indkøb, den klassificerede personalemappe. ⚠ **To fejl, hver sin:** `.write` lå på NODEN og kaskaderer (beslutning 17's kendsgerning, tredje gang), og der stod ingen `newData.exists()` — en `.validate` siger intet om at forsvinde (38 og 52). ⚠ **Idiomet fandtes allerede** på præcis tre noder, fordi nogen tænkte over det dér og ikke de tyve andre steder. `.write` er nu flyttet ned på postniveau på 18 stier, og de fire klassificerede satellitter fik et `$id`-led de slet ikke havde. Efter: **0 noder kan tømmes, 2 poster kan slettes.** ⚠ **`satser` er den vigtigste:** beslutning 7 siger at en sats aldrig overskrives — men den kunne SLETTES, og et prisgrundlag man kan fjerne, versionerer ingenting. ⚠ **Reglerne binder klienten, ikke servicekontoen:** en GDPR-sletning spærres ikke, den flyttes hen hvor den kan besluttes og logges. ⚠ Prøven er en ADFÆRDSPRØVE og læser stierne ud af regelfilen — den kan ikke laves til en strengsøgning, fordi `indberetninger` bærer leddet inde i et ELLER | `firebase.rules.json`, `test/rules.sletning.test.mjs` |
| 54 | **`CLAUDE.md` sagde nej til noget der var besluttet ja til.** Instruktionsfilen læses ind i hver session, og den sagde *"Rollerne er faste"* og *"der er ingen `roller/`-node at rette i"*. Begge var rigtige da de blev skrevet — **31b omgjorde dem**, og filerne fulgte ikke med. Målt: **fem passager i tre filer** sagde den gamle position, og to mere sagde at `etapeskift` "ikke findes" og at chaufføren har adgang til idébanken, som blev fjernet i 22/31. ⚠ **En forkert instruktion er værre end ingen:** den næste lader være med at bygge noget der er bygget, eller siger nej til kunden om noget der er besluttet ja til. ⚠ **Og begrundelsen for `.write: false` er en ANDEN nu** — ikke at rollerne ikke må ændres, men at det er **vejen** der er lukket: `rolleskriv` skriver noden, minter claims og kalder `revokeRefreshTokens` i én ombæring, som `opgaver` (45) og `kasseudlaan` (37). ⚠ Prøven er **ikke en ordliste**: hver forbudt sætning har en LEVENDE betingelse, så forbuddet ophører hvis koden gør sætningen sand igen. Dertil den generelle udgave — siger et dokument at en node er `.write: false`, prøves det mod regelfilen (ni steder, fire noder). ⚠ Tredje etape i træk med samme fund: **en påstand ingen prøvede** — dokumentation og regler ældes hver for sig, mens kun koden bliver kørt | `test/dokumentation.test.mjs`, `CLAUDE.md`, `ARKITEKTUR.md` |
| 55 | **Man kunne ikke oprette en booking.** Forløbets begyndelse — booking → etape → disponering → fakturagrundlag — lå på en attrap: `bookinger` og `etaper` er `.write: false`, der fandtes ingen `bookingopret`, og `naesteBookingnummer()` blev kaldt **ingen steder**. Skærmen fandtes fuldt udfyldt med to deaktiverede knapper og teksten *"Skrivning er ikke bygget endnu (fase 0)"*. ⚠ **Tre ting kan ikke gøres fra en klient:** bookingen og dens etaper skal skrives sammen, nummeret kommer fra en counter i en transaction (8), og tilstanden er **afledt** af etaperne (40). ⚠ **Én knap, ikke to:** oprettelsen laver en KLADDE; at sende til planlægning er et etapeskift og dermed et andet kald — en kæde der lykkes halvt, ville efterlade forløbet i en tilstand ingen bad om. ⚠ **Ingen reservation:** den kommer når et forslag godkendes. ⚠ Tre fund undervejs: katalogerne lå i **demofilen** (og serveren kunne slet ikke nå dem), skærmen valgte kunde ud af **demosættet** for en seedet node, og `oprettetAf` bar et **navn** hvor det skal være et uid. ⚠ **Målt i DEV: counteren stod på nul under 318 udstedte numre** — den første rigtige booking ville have fået `BKG-2026-00001`. Efterudfyldt, læst af posterne frem for gættet | `fleet/booking-state.js`, `fleet/booking.js`, `functions/index.js` |
| 56 | **En nyoprettet booking var usynlig.** Bookingoversigten læste `DEMO_BOOKINGER` **direkte** — ingen `useListe`, ingen faldbakke — så noden blev aldrig spurgt. Forslag var værre fordi den var halvt rigtig: etaper, reservationer, biler og personale kom fra noderne, men **bookingen** fra demofilen, altså to svar på ét spørgsmål i den samme visning. ⚠ **Linten fandtes og kunne ikke se det:** `demo-i-skaerm.test.mjs` tæller kun sæt for SEEDEDE noder, og `bookinger` **stod ikke i SEED** — kun `etaper` gjorde. I en frisk base pegede hver etapes `bookingId` derfor på en booking der ikke fandtes. **En lint der springer noget over, siger ikke nej — den siger ingenting.** Loftet stod grønt på 20 mens to skærme viste mockuppen; nu 17, og begge skærme står på ejerlisten. ⚠ **Counteren følger med i seedet**, sat til det højeste udstedte nummer og **læst af posterne** — ikke en optælling som nummerkilde (8), men en efterudfyldning af en tæller der aldrig blev sat. ⚠ **Etaperne hentes med `division: "alle"`:** tilstanden regnes af ALLE forløbets etaper, og en etape der faldt ud af summen, ville gøre et delvist forløb til et færdigt | `moduler/booking/Oversigt.jsx`, `moduler/booking/Forslag.jsx`, `scripts/provisioner-dev.mjs` |
| 57 | **Maskinen havde ni tilstande og én dør.** `skiftEtape()` blev kaldt fra ÉT sted — Forslag, som afgør `afventerKoord`. Seks andre overgange havde ingen knap der kunne trykkes: *Send til planlægning*, *Annullér*, *Tag af venteliste*, *Markér udført*, *Annullér etape*, *Genåbn etape*. En booking oprettet med `bookingopret` begyndte som `kladde` og kunne **aldrig komme videre**. ⚠ **Og Bookingoversigten listede dem endda** — genereret af maskinen, hvilket er rigtigt — men hver knap var `disabled` med *"Skrivning er ikke bygget (fase 0)"*. Maskinen så hel ud, netop fordi tabellen var komplet. `fleet/Etapeskifte.jsx` tegner nu de samme handlinger og kalder `etapeskift`, som afviser med den SAMME `kanSkifteEtape()` — samme snit som `Statusskifte.jsx`. ⚠ **De forslagsbærende overgange tegnes IKKE der:** et forslag laves hvor turen kan SES, og en knap der åbnede en dialog man ikke kunne udfylde, ville være en attrap — komponenten skriver i stedet HVOR man gør det. ⚠ **Begrundelsen må ikke gøre knappen grå**, for så kunne man aldrig nå at give den; dialogen spørger. Og den er fritekst der hører på etapens historik, ikke i auditloggen. ⚠ Prøven går hver overgang i tabellen igennem og kræver en dør — **en ny overgang uden en dør fejler uden at nogen har skrevet et testtilfælde** | `fleet/Etapeskifte.jsx`, `moduler/booking/Oversigt.jsx`, `test/etapeskifte.test.mjs` |
| 58 | **Forslaget kunne ikke laves.** Overgangen `afventerPlan → afventerKoord` kræver `kraeverForslag` — og intet kunne skrive et: `etapeskift` LÆSER `etape.forslag`, men skriver det aldrig, `etaper` er `.write: false`, og Forslag-skærmen VÆLGER mellem forslag der allerede findes. ⚠ **Og de lå i en form reglerne forbyder:** målt i DEV lå `et-004/forslag` med nøglerne **0, 1, 2** og sit `id` INDE i posten — RTDB har ingen arrays, `$andet: false` forbyder `id`, og `valgtForslagId` skal pege på en NØGLE der findes. Serveren fandt dem alligevel, fordi den søgte på `f.id`: server og regel var uenige om hvor identiteten bor. `forslagListe()` er nu det ene sted formen oversættes. ⚠ **`forslagskriv` er sin egen funktion, ikke et led i `etapeskift`:** et forslag er ikke et tilstandsskift, og lå skrivningen i overgangen, kunne der kun laves ÉT ad gangen — de 1–3 forslag koordinatoren skal SAMMENLIGNE, ville være umulige. ⚠ **Det spærrer ingenting** (tre forslag ville ellers spærre tre biler for én tur) — **men de fem tjek køres alligevel**, med den SAMME `spaerringerFor()` som ved godkendelsen: et forslag koordinatoren ikke kan godkende, er et løfte til en kunde der ikke kan holdes. ⚠ `booking.foreslaa`, ikke `booking.godkend` — beslutning 5. ⚠ Nummeret er det næste **ledige**, ikke `antal + 1`: ellers ville to forslag få nr. 3 hvis nr. 2 blev trukket tilbage | `fleet/booking-state.js`, `moduler/booking/Forslagsdialog.jsx`, `functions/index.js` |
| 59 | **Loftet på tre var en blindgyde.** Beslutning 58 skrev i sin egen validering *"træk et tilbage for at lave et nyt"* — og der var ingen vej tilbage. ⚠ **Værre end en irritation:** overgangen koordinatoren bruger til at bede om NYE forslag (`returneret` → *Send nye forslag*) kræver `kraeverForslag`, og de tre gamle opfyldte kravet. Etapen kunne gå frem og tilbage i al evighed med tre forslag hvoraf ingen duede. ⚠ **Det slettes ikke — det får `trukketMs` og `trukketAf`.** Ikke fordi reglerne forbyder en sletning (53 gælder klienten), men fordi et forslag koordinatoren HAR set, og som så forsvandt, ikke kan forklares et halvt år senere. ⚠ **Loftet tæller de AKTIVE — men nummeret genbruges IKKE:** pladsen bliver ledig, nummeret gør ikke, for en samtale om "forslag 2" skal blive ved med at pege på det samme. ⚠ **Reglen kan ikke hindre at `valgtForslagId` peger på noget trukket** — en `.validate` ser ét felt ad gangen — så `traekOpdatering()` rydder valget, og `etapeskift` afviser en godkendelse af et trukket forslag. ⚠ **Ikke mens koordinatoren tager stilling:** et forslag der forsvandt undervejs, ville ændre det der bliver besluttet under den der beslutter | `fleet/booking-state.js`, `functions/index.js`, `firebase.rules.json` |
| 60 | **To af tre null-felter havde en kilde — den blev bare aldrig spurgt.** `kpi.disponering` havde `ledigKapacitetPct`, `forsinkelsesrisiko` og `konflikter` på null. Etaperne bærer `etaMs` og `senestMs`, og `tjekDisponering()` er en REN funktion der kun manglede sine fire lister. ⚠ **En ETA efter fristen — ikke en frist der er overskredet:** det ene er en risiko man kan nå at gøre noget ved, det andet en kendsgerning. Og en etape uden ETA eller frist tælles ikke med; hullet står ved siden af som `udenEtaEllerFrist`, for **et lavt tal uden hullet ser ud som et rent hus**. ⚠ **En etape med tre spærringer tæller én gang** — det man handler på, er turen. ⚠ **Uden listerne er svaret `null`, ikke nul:** en aggregering der ikke fik sine biler, VED ikke at der er nul konflikter. ⚠ **`ledigKapacitetPct` bliver stående** — ikke fordi data mangler, men fordi spørgsmålet ikke er stillet færdigt: ledig i hvilken periode, målt i vogntimer, m³ eller enheder? ⚠ Undervejs: **provisioneringen og jobbet regnede ikke det samme** (dev ville vise en streg hvor natten viste et tal), og **feltniveau-prøven var ensrettet** — ti felter var allerede sluppet igennem og stod som `undefined` i demo-mode. Samme ensrettede prøve som beslutning 55 fandt for `ART_FELTER` | `fleet/kpi-aggregering.js`, `fleet/demo-kpi.js`, `scripts/provisioner-dev.mjs` |

## Struktur

```
src/
  App.jsx              alle 49 ruter, genereret efter nav.js
  firebase.js          ÉN initialisering. Moduler importerer db herfra.
  fleet/               kernen — modulerne må ikke duplikere noget herfra
    nav.js             sidebar + ruter, én kilde
    AppShell.jsx       layout: sidebar, topbar, Outlet
    FleetContext.jsx   tenant, periode, Gods/Bus
    useKpi.js          nøgletal fra kpi/. Demo-sættet ligger i demo-kpi.js
    datatilstand.js    hvorfor en skærm ikke viser rigtige tal (beslutning 26)
    useListe.js        listeopslag med division og auditering
    format.js          øre, datoer, ugenr, fortegnskonvention
    pricing.js         prismotor: satsopslag, beregning, snapshot
    reservations.js    reservationer + konfliktdetektion
    permissions.js     permission-katalog + rolle-presets. Ingen imports:
                       samme kilde som den Cloud Function der udsteder claims
    audit-regler.js    auditpolitik: vokabular, feltallowliste, retention.
                       Ingen imports — samme grund
    audit.js           audit.log() / audit.laes(). Kaster aldrig
    booking-state.js   tilstande, overgange, nummerserier
    sager.js           sagsbaseret mail: genkendelse + afsendervalidering
    personale.js       personer som entiteter
    flaade.js          arter, feltskema pr. art, kapacitet, kompetencekrav
    fravaer.js         årsager (sensitive), afledt tilstand, reservationen
    opgaver.js         art (vaerksted|facility), feltskema pr. art, status
    etaper.js          transportfelter, grænseovergange, reservationerne
    rutestatus.js      Rute & status: planlagte stop, chaufførens meldinger.
                       INGEN GPS — en melding er ikke en måling
    integrationer.js   kun det der findes. Listen er tom, og det er indholdet
    support.js         maaLaeseSag() er reglen skrevet een gang. Kontekst-
                       allowliste, auditudtrækkets faste grænse, supportadgang
    leverandoerer.js   kategorier, aftaler, afstemning. Division er tilladt her —
                       den beskriver leverandørens forretning, ikke vores
    facility.js        lokationer, aktiver, zoner. Grænsen på zonen, målingen
                       på sensoren — alarmen er afledt og gemmes aldrig
    koerehviletid.js   reglen, ikke et felt. Blokerer — med forbehold, fordi
                       vi kun kan se planen og ikke tachografen
    gitter.js          kalendergitterets regnestykke: slots, udlægning,
                       pile ved vinduets kant, overlap som konflikt
    Gitterkalender.jsx ressourcer × tid — delt af tre skærme
    demo-kpi.js        demo-nøgletal. Rent data, ingen React — så demo-filernes
                       selvkontrol også kan køres af en test
    demo-*.js          personale, flåde, fravær, sager, etaper, bookinger,
                       facility, kunder. Nodens form, ikke skærmens. Hver med
                       en selvkontrol. ⚠ Et demo-datasæt hører HER, ikke i en
                       modulfil — test/demo-kilder.test.mjs fejler på det
    Sagsvisning.jsx    sagen med faner — delt mellem Fleet og Facility
    ui.jsx             Kort, KpiKort, Tabel, Pille, Tom, Fejl, Knap, Soejlegraf
    fleet.css          tokens (udvider de eksisterende --bc-*)
  moduler/             30 skærme
```

## Status

Opdateret 9. august 2026. **Start her efter en pause.**

**Kernen er på plads.** Nitten byggeklodser i `fleet/` er i brug på tværs af
skærme, og **957 tests** kører via `npm test`. `.githooks/pre-commit` gør dem
obligatoriske dér hvor de hører til: regeltestene når `firebase.rules.json`
ændres, designtestene når `src/` ændres.
**Sikkerhedsrækkefølgen punkt 0–6 er lukket** — se Låst rækkefølge nedenfor.
Det gælder **filen**. Databasen er først dækket når `npm run regler:tjek` er grøn:
reglerne var aldrig udrullet til DEV, og prøverne kunne ikke se det (beslutning 29).

### Fem moduler har skiftet navn — og kun ét skiftede nøgle

**Flåde hedder Fleet, og Indkøb hedder Procure — men kun på skærmen.**
Ruten er stadig `/flaade` og `/indkoeb`, noden hedder stadig `indkoeb`,
permissionen stadig `indkoeb.skriv`, modulnøglen stadig `flaade`, og mappen
stadig `src/moduler/flaade/`.

Det er med vilje, og grænsen er ikke kosmetisk: modulnøglen står i hver tenants
`moduler/`-node, permissionen er **mintet ind i udstedte JWT-tokens**, og
stien står i `firebase.rules.json`. En omdøbning af dem er en datamigrering
plus en genudstedelse af alle tokens — ikke en tekstændring. Derfor skifter
**navnet**, ikke **nøglen**.

**Turtlebooking hedder Unitbooking, og det gik hele vejen** — navn, rute,
modulnøgle, filnavne og mappe. **Booking & Opgaver hedder Planning, og det
kunne ikke.** Forskellen er ikke en holdning; den blev **målt i den udrullede
base**, hver gang, før en linje blev rørt.

| Modul | Nyt navn | Nøglen skiftede | Fordi |
|---|---|---|---|
| Flåde | **Fleet** | nej | Nøglen `flaade` står i hver tenants `moduler/`-node |
| Indkøb | **Procure** | nej | Dertil noden `indkoeb/` og permissionen `indkoeb.skriv` — mintet ind i udstedte tokens |
| Turtlebooking | **Unitbooking** | **ja** | **Ingen tenant bar nøglen.** Noderne hedder `kasser`, `kasseudlaan`, `reolpladser` — ikke modulet |
| Booking & Opgaver | **Planning** | nej | Nøglen `booking` står i to prislister under `udbyder/prisliste`, og den ene er peget på af et **låst fakturagrundlag** |
| Bemanding | **Workforce** | nej | Samme prislister, samme låste fakturagrundlag. Dertil KPI-domænet `kpi/<division>/bemanding` |

⚠ **Det sidste er den vigtigste række.** Et frosset fakturagrundlag
dokumenterer hvad der blev faktureret. Omdøbes modulnøglen i den prisliste
det peger på, dokumenterer det noget andet end det der skete — og et
regnskabsbilag der er blevet uenigt med sig selv, kan ikke gøres enigt igen.
Dertil ti permissions (`booking.godkend`, `booking.opret`,
`booking.sensitiveLaes` …) i udstedte tokens, og noden `bookinger`.

**Og Fleets ting hedder nu en enhed, ikke et køretøj.** Det er ikke et
modulnavn — det er domæneordet — og halvdelen var lavet i forvejen:
`ENHEDSART` er artskataloget, knappen hed **"Ny enhed"** og kolonnen
**"Enhed"**, mens menuen sagde "Køretøjer". 37 strenge lukkede resten.
Identifikatorerne står: noden `koeretoejer`, `koeretoejId`,
`koeretoejIder`, `KOERETOEJ_STATUS` og prisfeltet `prKoeretoejOere`.

⚠ **ORDET VAR TAGET, OG DET SKAL MAN VIDE.** `enheder/` **er en node** —
Warehouses serienummer-sporede enheder, nøglet på serienummer med `vareId`,
`kundeId` og `tilstand: paaLager|afsendt`. "Enhed" betyder derfor to ting på
platformen: en lastbil i Fleet og en serienummeret vare i Warehouse.
Kollisionen er **ældre end omdøbningen** — knappen "Ny enhed" stod i Fleet i
forvejen — men den er nu synlig, og det er beslutning 11 og 14's fejl i et nyt
sted. To ting man skal holde fast i:

- Warehouse mærker **ikke** sine priser "pr. enhed". `ENHED` dér er
  `stk`, `kolli`, `palle`, `kasse`, `kg`, `m3`, og labelet er
  "Stk.", "Palle", "Kolli". De to møder derfor ikke hinanden i én tabel.
- Abonnementsprislistens akse hedder nu **"Pr. enhed"** og tæller Fleets
  enheder. Feltet bag hedder stadig `prKoeretoejOere` og står i to prislister
  som et låst fakturagrundlag peger på — labelet skiftede, tallet og feltet
  ikke.

⚠ **OG DE SIDSTE TI STRENGE BLEV FUNDET AF ET KLIK, IKKE AF ET GREP.**
For at sortere identifikatorerne fra udelukkede jeg linjer der indeholdt
`koeretoej` — og labelet stod på præcis de linjer:
`{ key: "koeretoejIder", label: "Køretøj" }`. Filteret spiste det jeg ledte
efter. Tilbage stod kolonnen i Forslag, feltet i Procure, arten
"Køretøjsskade" og **CSV-eksportens "Pr. køretøj"**.

`test/navne.test.mjs` gør det nu til en prøve i stedet for en gennemlæsning.
Den **stripper kommentarerne først** — blok, linje og JSX — og leder kun i
resten, fordi kommentarerne med vilje beholder de gamle ord: de står ved
siden af `src/moduler/flaade/` og feltet `koeretoejId`. Undtagelserne er
navngivne med en grund hver, og en prøve vælter en undtagelse der er blevet
overflødig — den fældede sin egen første, da jeg skrev én for meget.

**Reglen der falder ud af de fire:** et modulnavn kan skiftes gratis indtil
den første kunde krydser modulet af eller den første faktura peger på det.
Derefter er det en migrering af data nogen har betalt efter. Mål det i den
**udrullede** base — ikke i koden, og ikke ved at huske.

⚠ **Og derfor er det ikke en blind erstatning.** `Indkøb` som *modulnavn*
skifter til Procure; `indkøb` som *almindeligt dansk ord* gør ikke. Skærmen
siger stadig "Registrér indkøb", "Indkøb i perioden" og
"Indkøbsprisafvigelse" — det er beløb og handlinger, ikke henvisninger til et
modul. Samme skel på `Flåde` mod `flåden`: "Flåden er ikke en liste af
biler" står uændret på Fleet-skærmen, fordi sætningen handler om flåden.
Havde vi erstattet på ordet, ville tabellen have heddet "Procure i perioden".

⚠ **Skarpest på Planning.** Ordet `booking` står 417 gange i `src/`, og kun
**6** af dem var modulets navn. Resten er **tingen**: noden `bookinger`,
`bookingId`, "bookingens tilstand er afledt", `fastPrBooking`. En booking er
en transportopgave med etaper (beslutning 16) — den holder op med at hedde
det, fordi menupunktet gør det. Derfor hedder underskærmen stadig
**Bookingopsætning**: den opsætter bookinger.

Samme snit på Workforce: **Bemandingsplan** hedder stadig det, og
`kpi/<division>/bemanding` skiftede ikke — et KPI-domæne er et **feltnavn i
en node**, ikke et menupunkt. `k.bemanding.disponeret` læses af skærmen, og
et omdøbt domæne ville have slettet sig selv på vejen gennem RTDB uden at
nogen kunne se hvorfor.

Kommentarer og filhoveder beholder de danske navne — de står ved siden af
`src/moduler/flaade/` og `indkoeb/`, og en kommentar der sagde "Fleet" om
en mappe der hedder `flaade`, ville pege forkert.

### Enheder flyttede til Opsætning — og det er samme snit én gang til

Fleets menu skal kun vise det personalet **arbejder i**. Enhedskartoteket er
stamdata: en bil oprettes én gang og røres sjældent igen, mens disponenten er i
Driftskalenderen hver dag. Stod de side om side, lå den daglige skærm nummer to
i en menu hvor nummer ét knap bruges.

| | Før | Nu |
|---|---|---|
| Enheder | `/flaade` | **`/opsaetning/enheder`** |
| Driftskalender | `/flaade/vaerksted` | **`/flaade`** — Fleets forside |
| Indberetninger | `/flaade/indberetninger` | uændret |

`/flaade/vaerksted` lever videre i `REDIRECTS`. Filen bliver liggende i
`src/moduler/flaade/Oversigt.jsx`: **modulnøglen `flaade`, noden
`koeretoejer` og permissionen `koeretoejer.laes` er uændrede**, præcis som da
Flåde blev til Fleet. Det er menupladsen der flyttede, ikke ejerskabet.

⚠ **Og det koster ét led man ikke kommer på af sig selv.** `koeretoejer` er
modulspærret på `flaade` i `firebase.rules.json` — men Opsætning er
`altid: true` og kan ikke fravælges. Uden `kraeverModul: "flaade"` på
nav-punktet ville en kunde der **aldrig har købt Fleet**, få et menupunkt i sin
egen opsætning der åbner en afvist læsning. En `permission-denied` er reglerne
der *virker*; den skal bare ikke fremprovokeres af en menu vi selv har tegnet.
Ruten findes stadig — tastes den, kommer `<Datatilstand>`, ikke en hvid skærm.

**Firma- og periodevælgeren er væk fra Fleets skærme.** Driftskalenderen har sin
egen dag/uge/måned-vælger, og to periodebegreber på samme skærm er to svar på ét
spørgsmål. Stemplet "Opdateret 14.32" følger med periodevælgeren — uden perioden
er der ikke noget det er stempel på. Det er **shellen** der skjuler dem, ud fra
`skjulFirma`/`skjulPeriode` på hovedmodulet i `nav.js`: et modul der skjulte
dem selv, skulle tegne sin egen topbar, og så ejede det en af de tre ting
shellen ejer. Kontrollerne er skjult, ikke fjernet — tilstanden bliver i
`FleetContext`, så tenant, division og periode er de samme når man går tilbage
til Dashboardet.

`test/moduler.test.mjs` holder begge dele: at `kraeverModul` peger på et modul
der findes, at et flag skrevet på et **barn** vælter prøven (AppShell læser dem
af hovedmodulet og ville ignorere det i tavshed), og at Enheder stadig kræver
Fleet.

### Driftskalenderen: fem kasser, ét regnestykke

Fleets forside har fem tal — nye indberetninger, afventer planlægning,
planlagte, kommende og forsinkede — hver med en **Åbn** og en **Åbn i nyt
vindue**, der fører til arbejdskøen på `/flaade/koe?vis=<nøgle>`.

⚠ **Tallene ligger ikke i `kpi/`, og det er undtagelsen — ikke et brud.** De er
afledt af de lister skærmen alligevel henter, og "Kommende" afhænger af et
vindue **brugeren selv sætter** (1 uge / 2 uger / 1 md. / 3 mdr.). Et
aggregeret tal ville være regnet på ét vindue og stå forkert i de tre andre,
uden at nogen kunne se hvilket. Regnestykket ligger i
`fleet/driftskalender.js` — uden React, så det kan prøves.

⚠ **Hvert kort tæller præcis den liste dets "Åbn" viser.** `driftstal()`
returnerer `poster` ved siden af `antal`, og køen læser sit udsnit ud af den
samme funktion. Skrev køen sit eget filter, kunne kortet sige 18 og listen vise
14 — det er Indkøb → Fakturaer om igen.

⚠ **Tre af de fem overlapper med vilje.** Kommende og forsinkede er begge
UDSNIT af planlagte, og skærmen skriver "heraf". To tal der begge lyder som
totaler, er beslutning 11 og 14 om igen.

⚠ **En opgave uden `estimeretMin` er hverken forsinket eller til tiden.** Den
har ingen slutning, og den tælles for sig i `udenVarighed` — ikke som rettidig.
Et system der regnede den som grøn, ville sige "0 forsinkede" om en liste hvor
en del ikke kunne afgøres.

**"Afventer planlægning" er en TILSTAND, ikke et manglende tidspunkt.** Noden
kræver `startMs` (hasChildren i regelfilen), så en opgave uden tidspunkt kan
slet ikke gemmes. Tidspunktet er en pladsholder indtil nogen har taget
stilling, og opgaven tegnes i sin egen tone.

**Fleet tæller kun `art: "vaerksted"`.** `opgaver` rummer også facility-opgaver,
og de har deres egen skærm i Facility → Servicekalender, som læser den **samme
node**. Talte begge moduler dem med, ville det samme filterskift stå i to tal.
Filteret ligger i skærmen og ikke i `driftstal()`, så Facility kan kalde den med
sin egen art frem for at få sin egen kopi.

### Værkstedsbesøgene blev opgaver

`DEMO_BESOEG` i `demo-vaerksted.js` var et **datasæt nummer to for noden
`opgaver`** — filen skrev det selv i sit eget hoved. Provisioneren seedede
`opgaver`, mens Driftskalenderen tegnede demofilen: kasserne ville have talt
noden og gitteret nedenunder demosættet.

De otte poster ligger nu i `DEMO_OPGAVER` med deres oprindelige id'er (`vb-001`
… `vb-008`), fordi `il-vb-00N` i `demo-indkoeb.js` peger tilbage på dem.
`DEMO_BESOEG` findes stadig — som en **afledt visning**, så de otte filer der
læser den, er urørte.

⚠ **Det var ikke "en omdøbning", som først antaget.** Noden er lukket med
`$andet: false`, og et besøg bar fire felter den ikke kendte: `fra`, `til`,
`type` og `leverandoerId`. Vinduet blev til `startMs` + `estimeretMin`, og de to
andre er nye felter i regelfilen — `arbejdstype` (**ikke** `type`: noden har
allerede `art`, og et felt der kunne forveksles med den, er den fejl der har
kostet os to gange) og `leverandoerId` med et **opslag** i `leverandoerer/`.

⚠ **Og sammenlægningen afslørede to skjulte modsigelser med det samme:** Bil
104 havde en intern reparation midt i sit besøg hos Mercedes Greve, og Lastbil
106 et klimaservice mens den stod hos DAF. Begge var usynlige så længe de to
sæt lå hver for sig. `demo-opgaver.js` har nu selvkontrollen der fanger
opgave-mod-opgave på samme enhed — `demo-vaerksted.js` havde kun besøg mod
besøg.

### ⚠ Demo-mode var hvid — på ti skærme

`blokerer()` blokerede på tilstanden `demo`, og `<Datatilstand>` tegner med
vilje ingenting for `demo` ("miljøbjælken siger det allerede"). Hver skærm der
kombinerede de to, returnerede altså **null**: Fleet → Indberetninger, Facility
×3, Procure ×3, Kompetencer og Fakturering.

README lover det modsatte med rene ord — "Ingen hvide skærme, ingen crash" — og
fejlen var usynlig, fordi alle der arbejder på repoet har en `.env.local`.
Demo-mode er den tilstand **kunden** ser i en salgsdemo.

⚠ Det er **ikke** en lempelse af "vis ikke demo-data oven på en afvist
læsning". Den regel gælder `naegtet` og er urørt. `demo` sættes kun når der slet
ikke er en database at spørge — og opdigtede tal findes netop kun dér.

### Skærmene: 27 af 30 har indhold

| | Skærme |
|---|---|
| **Bygget (29)** | Dashboard *(referencemodul — start her når du skriver et nyt)*, Bookingopsætning, Kunder & Priser, Økonomi & Rapporter, Bemanding, Medarbejdere, Flåde, Ferie & fravær, Værkstedskalender, Disponering, Facility ×3, Booking-oversigt, Ny forespørgsel, Forslag, Indkøb ×2, Rute & status, Integrationer, Support ×3, **Fakturagrundlag**, **Indberetninger**, **Kompetencer**, **Leverandører**, **Opsætning → Generelt**, **Opsætning → Brugere & roller** |
| **Bygget som LÆSESKÆRME** | De to Opsætning-skærme viser hvad der findes — tenant, divisioner, lokationer, roller og permissions — og har **al skrivning deaktiveret med en begrundelse**. De åbne spørgsmål i `FleetControl-spoergsmaal.md` handler alle om at ændre, og de blokerer ikke en visning. Spørgsmålene står **på skærmen**, ikke kun i en fil |
| **Fjernet** | Idébank. Beslutning 22 afgjorde at den ikke hører i kundens installation; rute, skærm, `idebank.skriv` og noden i regelfilen er væk (beslutning 31) |

Hver skeletfil har en kommentar i toppen med hvad der skal bygges og hvilke
fejl fra mockuppen der skal undgås. **Læs den før du rører filen.** De tre der
venter, har fået deres produktvalg i beslutning 22 — men detaljerne mangler,
og de må ikke bygges på gæt. Se afsnittet nedenfor.

⚠ **De fire fra beslutning 25 er bygget på ANTAGELSER.** Fakturagrundlag,
Indberetninger, Kompetencer og Leverandører står på hvordan vi *tror* en
vognmand arbejder. Det står i toppen af hver fil, og det er ikke en
forsigtighedsfloskel: forløbet i `indberetninger.js`, linjearterne i
`grundlag.js` og de seks nøgletal i `leverandoerer.js` er de tre steder hvor
en forkert antagelse koster mest at rette bagefter. **Valider dem hos første
kunde, før der bygges skrivning ovenpå.**

### Beslutning 20 står i fase 0

Sagsvisningen er bygget som **visning**: fanerne Oversigt / Kommunikation /
Dokumenter / Aktiviteter med en demo-tråd på Værkstedskalender. Komponenten
ligger i `fleet/Sagsvisning.jsx`, fordi Facility skal bruge nøjagtig den samme.

Ikke bygget: modtagevej, parsing, afsendelse, scanning, Cloud Functions.
`sager/` findes ikke i `firebase.rules.json`, og derfor står `sag.laes`,
`sag.sensitiveLaes`, `sag.skriv`, `sag.karantaeneFrigiv` og
`sag.aftaleBekraeft` heller ikke i `permissions.js`. Tilføj dem i samme
ombæring som reglerne og deres tests — ikke før.

`test/sager.test.mjs` kører politikken frem for at læse den. De 39 tests fandt
straks en fejl: mønstret var versalfølsomt, så et håndtastet
`flt-2026-00381` ikke ville være blevet genkendt.

### Næste skridt, i den rækkefølge

1. ~~**Trin 3 af beslutning 18 — længdeintervaller i `satsPaa()`.**~~ **Bygget.**
   Se *Længdebåndet* nedenfor. Det der står tilbage, er ikke kode: de øvrige
   passager mangler deres bånd, og tallene er vognmandens egne.
2. **Modulabonnement.** Uafklaret: skal reglerne håndhæve abonnementet, eller
   er det kun navigation? En kommerciel grænse og en sikkerhedsgrænse giver
   meget forskellige regelfiler.
3. **Kundeportal.** ⚠ **RTDB kan ikke filtrere en forespørgsel med regler.** En
   kunde kan ikke *liste* sine egne bookinger — `.read` på `bookinger` er alt
   eller intet. Det kræver en indeksnode pr. kunde, og den beslutning skal
   træffes før portalen bygges.
4. ~~**Disponerings interaktive gitter.**~~ **Bygget** — beslutning 49.
   Dagsgitteret opretter og flytter gennem `opgaveplanlaeg` og `opgaveflyt`,
   og det samme gælder Driftskalenderen og Servicekalenderen. Ugesgitteret
   fører til **Forslag** frem for at få sin egen kopi af godkendelsen, og
   linket dertil — som pegede på en rute uden id og landede på Dashboardet —
   er rettet.
5. ~~**Opgavens statusmaskine.**~~ **Bygget** — beslutning 50. `opgavestatus`
   skifter status OG reservationens følge i én atomisk opdatering: en
   annulleret opgave giver bilen fri, en udført afkorter reservationen til nu.
   Knapperne tegnes af `OPGAVE_OVERGANGE`, ét sted, og bruges af alle tre
   skærme.
6. ~~**At OPRETTE en facility-opgave.**~~ **Bygget** — beslutning 51.
   `facilityplanlaeg` er noden `opgaver`' **fjerde og sidste** vej ind.
   Servicekalenderen har nu både en knap og et klikbart ledigt felt.
   ⚠ **Ikke et art-flag på `opgaveplanlaeg`:** `art` ER feltskemaet, og
   modulet er `facility` mod `flaade`. Spurgte begge om Fleet, kunne en
   kunde der kun har Facility, ikke planlægge sit eget servicebesøg.
   ⚠ **Det der IKKE er lukket:** en reservation på `lokation/lok-halb` og
   en på `facilityAktiv/fa-port3` er to stier, så et gulvarbejde i Hal B
   spærrer **ikke** porten i den hal — hverken her eller i `opgaveflyt`.
   Skærmen siger det rigtige; datamodellen håndhæver det ikke. En
   indeslutningsregel er sin egen beslutning: den skal gælde begge veje, i
   begge funktioner og i `tjekDisponering()`, og et halvt tjek i én af dem
   ville være værre end ingen.

### Længdebåndet — trin 3 af beslutning 18 er lukket

`laengdeMm` stod på hvert eneste køretøj, blev valideret som millimeter-integer
med en kommentar om at *"9,998 mod 10,002 afgør prisen"* — og **intet læste
feltet**. Færgen kostede det samme for en kassevogn og for et modulvogntog.

En sats kan nu bære et bånd:

```js
satser: [
  { gyldigFra, beloebOere: 133800, laengdeTilMm: 10000 },                    // indtil 10,0 m
  { gyldigFra, beloebOere: 253000, laengdeFraMm: 10000, laengdeTilMm: 18000 } // over 10,0 til 18,0 m
]
```

**Båndet ligger på satsen, ikke i et niveau for sig.** Alternativet
(`satser: { "0-10000": [...] }`) ville koste to ting: kundepriser og
omkostninger ville ikke længere have samme form, og beslutning 7 skulle skrives
om, fordi hvert bånd skal kunne versioneres for sig. Med båndet på satsen
lægges en ny post med sin egen `gyldigFra` — nøjagtig som alt andet.

**Intervallet er `(fra, til]` — øvre grænse inklusiv.** Rederierne udgiver
taksten som *"indtil 10 m"*, så et vogntog på præcis 10.000 mm hører i det
**billige** bånd. Læste vi det som `[fra, til)`, ville nøjagtig 10 m koste
1.192 kr for meget. Reglen kan ikke håndhæve det — en `.validate` ser én sats
ad gangen — så læsningen står i `satsOpslag()` og prøven holder den.

**Længden kommer fra `samletLaengdeMm()`, altså trækker PLUS trailer.** Med
bilens eget felt ville traileren være gratis på færgen. Det er samme fejl som
ét `koeretoejId` på en etape, og den ville have været usynlig: prisen ville
bare være for lav.

#### ⚠ Og den fandt en tavs fejl i `beregnBooking()`

`brug()` sprang linjen over på `if (!sats || !beloeb) return` — altså præcis de
tre tavse spring `beregnForloeb()` blev rettet for, i den funktion der ligger
lige over. En færge uden takst blev til **en tur uden færge**: totalen så
færdig ud og var for lav.

Nu står linjen der med `beloebOere: null` og `manglerSats: true`, og
`totalOere` bliver `null`. En sum med et ubesvaret led er ikke en sum — samme
regel som momssatsen der mangler og som `ikkeFaktureretOere()`.

⚠ **Skærmen skal skrive det selv.** `kr()` skelner med vilje ikke mellem
`null` og nul, fordi kun kalderen ved om nul er et svar — `kr(null)` er
`"0 kr."`. På en overfart er nul aldrig svaret, så Bookingopsætning skriver
`INTET` på linjen og på summen. Se `momsTekst()` i Fakturering for samme greb.

#### Tre grunde, ikke ét `null`

`satsOpslag()` svarer `{ sats, mangler }`, og `mangler` har hver sin rettelse:

| `mangler` | Betyder | Rettelsen |
|---|---|---|
| `"sats"` | ingen gyldig sats på datoen | opret satsen |
| `"laengde"` | posten er båndopdelt, og vi fik ingen længde | disponér en enhed på etapen |
| `"baand"` | længden falder uden for alle bånd | spørg rederiet |

Et `null` alene kan ikke skelne dem, og de tre fører hvert sit sted hen.

#### Det der står tilbage — og det er ikke kode

- **Kun Femern har bånd.** `bro:storebaelt` hedder stadig *"(lastbil 10–20 m)"*,
  og taksten **er** 10–20 m-taksten. Vi kender bare ikke broens øvrige trin, og
  et bånd vi fandt på, ville koste penge på hver eneste tur. Navnet bliver
  stående netop for at sige hvad satsen forudsætter.
- **Femern har intet bånd over 18 m.** Demo-etape `et-001` er 19.820 mm og får
  derfor *"ingen takst for den længde"* — en synlig mangel man kan handle på, i
  stedet for en pris der er 1.192 kr for lav. `et-007` har ingen bil endnu og
  får *"længden er ikke oplyst"*.
- **Tallene er vognmandens egne.** BroBizz-rabatten er progressiv på
  månedsbasis, og færgetaksterne følger en aftale. Båndene lægges når hans
  aftale er læst — ikke før.
- **Der er ingen formular til at lægge et bånd endnu.** `valideSats()` og
  `baandOverlap()` er bygget og prøvet, men Bookingopsætning viser satsarket;
  den redigerer det ikke. To bånd der dækker samme længde, er to priser på én
  tur, og `baandOverlap()` findes for at formularen kan afvise det **før**
  satsen lægges — en sats overskrives ikke bagefter.

### Disponering: dagsgitteret skriver, ugesgitteret gør ikke

To faner, to noder: dagsvisningen læser `opgaver` med art `vaerksted` (timer,
06–18), ugesvisningen læser `etaper` (døgn, syv dage, ETA over døgngrænser og
grænseovergange).

**Og de to grunde til at kun den ene skriver, er ikke den samme.**

*Dag.* Et ledigt tidsrum åbner `Planlaegdialog` med bilen og tidspunktet
udfyldt; en blok kan **trækkes** til et andet tidspunkt eller en anden bil.
`opgaveplanlaeg` og `opgaveflyt` skriver opgaven **og** dens reservation i én
atomisk opdatering — beslutning 45 og 49.

*Uge.* Her flyttes der ingenting, og det er **ikke** et hul der mangler at
blive lukket. Det man disponerer, er en **etape**, og en etape bindes ved at
godkende et **forslag** — med tid, pris, enheder og chauffør. Et træk kan ikke
udpege et forslag der ikke findes, og en skærm der lavede sit eget ud af hvor
blokken blev sluppet, ville være en anden vej til det samme felt (beslutning
40). Detaljepanelet **fører** til Forslag.

⚠ **Og linket dertil havde aldrig virket.** Det pegede på `/booking/forslag`
uden id, mens ruten er `/booking/forslag/:id` — så `path="*"` sendte brugeren
til Dashboardet. Et link der lander et sted, ser ud til at virke.

**De fem tjek kaldes — og de håndhæves nu også, men ikke her.**
`kanDisponeres()`, `kraevedeKompetencer()` + `tjekKompetencer()`, `kanBaere()`,
`tjekLedigMod()` og `tjekKoerehviletid()` ligger i `fleet/disponering.js`, ét
sted, og `etapeskift` kalder **den samme** `tjekDisponering()` og afviser med
den samme sætning. Skærmen VISER; funktionen HÅNDHÆVER. Lå kontrollen i
skærmen, kunne en direkte skrivning gå uden om den.

Attrappen er væk (beslutning 49). Dagsblokkene kan **trækkes** — og
**Shift + piletast** gør det samme, fordi en kontrol man kun kan tage fat i med
en mus, ikke er en kontrol for alle. `etaper` og `reservationer` er stadig
`.write: false` for alle; vejen ind *er* funktionerne.

⚠ **En blok der rækker ud over vinduet, kan ikke trækkes.** Samme grund som
pilene findes for: kan man ikke se hvor blokken begynder, kan man ikke sigte
efter hvor den skal hen.

#### ⚠ Fem noder blev læst fra demofilen — og rækkerne var det værste

Hovedet i `Disponering.jsx` har hele tiden sagt at dagsvisningen læser
`opgaver`. Den læste `DEMO_BESOEG` — som selv var blevet en **afledt visning**
af `DEMO_OPGAVER`, altså et demo-datasæt for en node der er seedet. De to har
ikke samme felter: besøget bar `fra`, `til` og `type`; noden bærer `startMs`,
`estimeretMin` og `arbejdstype`. **Detaljepanelet skrev derfor tomt på hver
eneste rigtige opgave** — tredje gang de feltnavne har kostet noget.

⚠ **Værre var rækkerne.** Begge gitre byggede deres rækker af
`DEMO_KOERETOEJER` og filtrerede dem på de id'er kundens etaper peger på. Hos
en rigtig kunde matcher de id'er ingenting — så **ugegitteret ville stå tomt,
uden at nogen havde slettet en bil.** Samme mønster som Bookingopsætnings egen
kopi af divisionsfilteret: usynlig indtil den ene side flytter sig.

Chaufføren, hans kompetencer og leverandørnavnet kom samme sted fra. Det er
ikke kosmetik: **en udløbet kompetence blokerer i `etapeskift`**, og skærmen
viste en anden mands beviser — skærmen sagde ja hvor serveren ville sige nej.

Fem noder læses nu med `useListe(..., { demo: … })`: `koeretoejer`,
`personale`, `kompetencer`, `leverandoerer` og `opgaver`. Loftet i
`test/demo-i-skaerm.test.mjs` er sat **30 → 23**.

⚠ **Loftet fangede det ikke — det TALTE det.** Debitten var kendt og skrevet
ned; den var bare ikke betalt. Prøven `⚠ BEGGE GITRES RÆKKER KOMMER FRA
koeretoejer` er skrevet så den fejler hvis nogen ruller det tilbage, og
efterprøvet ved at gøre netop det.

#### Hullet der står tilbage

⚠ **„De gamle opgaver mangler deres reservation" var TOMT — målt, ikke antaget.**
Her stod at opgaver oprettet før `opgaveplanlaeg` fandtes, ingen reservation
har, og at `etapeskift` derfor ikke kan se at netop de biler står på liften.
Målt på den udrullede DEV-base før en udfyldning blev bygget: **21 opgaver, 0
uden reservation, 0 uden vindue.** Provisioneren skriver dem med den SAMME
`reservationFraOpgave()`, og efter beslutning 45 findes der ingen anden vej ind
i noden. Punktet er ikke et efterslæb — det er en egenskab der holder.

En opgave uden `estimeretMin` får slet ingen reservation: `slutter()` svarer
`null` frem for at gætte et vindue, og en ressource må ikke spærres i et tidsrum
ingen har besluttet. `kanFlyttes()` afviser sådan en opgave helt — af samme
grund, og med den samme sætning på skærmen som serveren ville have svaret.

**Der er ikke flere lukkede veje.** `facilityplanlaeg` opretter et
servicebesøg (beslutning 51), og `opgaver` har dermed **fire** veje ind — alle
fire skriver opgaven og dens reservation i én atomisk opdatering. Noden bliver
`.write: false`: det er vejen der er lukket, ikke retten.

*(Her stod først at statusskiftet manglede, derefter at oprettelsen af en
facility-opgave gjorde. Begge er bygget — 50 og 51.)*

⚠ **Det der IKKE er lukket, er en indeslutningsregel.** En reservation på
`lokation/lok-halb` og en på `facilityAktiv/fa-port3` er to forskellige stier,
så et gulvarbejde i Hal B spærrer **ikke** porten i den hal — hverken i
`facilityplanlaeg` eller i `opgaveflyt`, som har haft hullet siden 49.
Servicekalenderen siger det rigtige ("lukker man hallen, er alle porte i den
også optaget"); datamodellen håndhæver det ikke. Reglen skal gælde begge veje,
i begge funktioner og i `tjekDisponering()` — et halvt tjek i én af dem ville
være værre end ingen, fordi skærmen så viste en ledighed serveren afviser i det
ene tilfælde og ikke i det andet.

### Gitterkalenderen er en genbrugskontrakt

`fleet/Gitterkalender.jsx` tegner ressourcer som rækker og tid som kolonner.
**Fire skærme bruger den samme:** Driftskalender (køretøjer × dage),
Facility → Servicekalender (lokationer og aktiver × dage), Disponering (biler ×
timer, `enhed: "time"`) og Unitbookings kalender (kasser × dage). Byg ikke et
femte gitter — to gitre der læser det samme interval forskelligt, opdages ikke
ved at kigge på dem.

⚠ **Gitteret flytter ingenting selv.** Med `onFlyt` regner det ud HVOR blokken
blev sluppet — en række og et vindue — og hvad det så betyder, er kalderens
sag. De tre første flytter `opgaver` gennem `opgaveflyt`; Unitbooking flytter
kasseudlån og har sin egen vej ind (beslutning 37). Vidste gitteret hvilken
funktion det skulle kalde, skulle den fjerde skærm rette i noget de tre andre
ejer.

Regnestykket ligger i `fleet/gitter.js` uden React, så det kan testes. To ting
der skal blive stående, også når de ser grimme ud:

- **Blokke der rækker ud over vinduet får en pil.** En værkstedsblok på tre
  uger, klippet ved kanten, læses som et kort besøg — og så planlægger nogen
  en tur i en uge hvor bilen står på værksted. Samme fejlklasse som tavs
  afkortning i `useListe`.
- **Overlap i samme række tegnes som konflikt**, ikke stablet i hver sin bane.
  På en eksklusiv ressource er et overlap noget `reserver()` ville afvise.
  Ser det pænt ud, skjuler gitteret en fejl i data.

### Det linten fandt — og de to ting der står tilbage

`npm run lint` kører seks regler, alle af den slags der svarer ja eller nej.
Begrundelsen for at der ikke er flere, står i beslutning 41. Linten kører
automatisk i `.githooks/pre-commit` når en `.js`, `.jsx` eller `.mjs` er
ændret, og `npm test` kalder den før regelprøverne.

Første gennemløb fandt **nul** `no-undef` — de fem hvide skærme var rettet i
forvejen. Fundene var alle `no-unused-vars`, og to af dem er ikke ryddet op,
fordi de er rigtige fejl med hver sin rettelse der skal kunne **klikkes**:

- **`booking/Oversigt.jsx` — `visAlle` har ingen kontrol.** `setVisAlle`
  kaldes ingen steder, så udførte, afviste og annullerede bookinger er
  permanent skjult. Fodnoten under tabellen siger *"Viser N af M hentede
  bookinger"*, så brugeren kan **se** at noget mangler uden at kunne få det
  frem. Rettelsen er en kontrol i skærmen.
- **`udbyder/Prisliste.jsx` — `sidstRettet` regnes og vises ikke.** Der står
  en kommentar om hvad tallet betyder, og tallet når aldrig skærmen. Samme
  mønster som dækningsgradsafvigelsen i Økonomi.

Begge står med en `eslint-disable-next-line` og en note i koden der peger
hertil. ⚠ **Navnene blev ikke bare fjernet:** et fjernet navn tager beviset
med sig, og så er der ingen der ved at kontrollen mangler.

Den tredje — `Bookingopsaetning.jsx`, hvor en afvist læsning faldt igennem
til et tomt satsark — er rettet. Se beslutning 41.


### Demo-data skal kontrollere sig selv

`demo-personale.js` virkede, fordi den sammenligner sig med `DEMO_KPI` i dev og
siger til, hvis en udløbsdato flyttes så Bemanding ville vise et nøgletal der
modsiger tabellen under det. **Den kontrol hører i hver ny demo-fil**, og den
skal skrives som en **test** og ikke kun som en `console.warn` — ellers fanges
den kun af en udvikler der tilfældigt har konsollen åben, og ikke af
pre-commit-hooken.

Datasættet lå før i `useKpi.js`, som importerer `FleetContext.jsx`. Det gjorde
det uindlæseligt for node, så kontrollen *kunne* ikke være en test. `DEMO_KPI`
ligger derfor nu i `fleet/demo-kpi.js` — rent data, ingen React — og
`useKpi.js` re-eksporterer det, så eksisterende importer er uberørte.

Flådens roster kan **ikke** ramme `kpi/` på samme måde: den er delt på division
(42 aktive i gods, 18 i bus), mens et køretøj ingen division har. Kontrollen er
derfor et **loft** — et udsnit må være mindre end totalen, aldrig større. Det er
beslutning 19's åbne spørgsmål der stikker op gennem demo-data.

## Det tungeste tilbage

**Cloud Functions er ikke længere flaskehalsen.** Listen er tom.

`kpiaggregering` kører natligt og regner `kpi/<division>/current` af de
rigtige noder. Den arkiverer forrige kørsel som `forrige` — deltaernes eneste
kilde — og skriver begge i én opdatering.

⚠ **34 felter er `null` — og 16 af dem er ÉT spørgsmål.** Provisioneringen
tæller dem ved hver kørsel og skelner mellem to slags: felter uden kilde og
deltaer der venter på en forrige periode (18 stk. i en frisk base — de retter
sig selv i nat). ⚠ **Tallet er MÅLT ved hver provisionering**, ikke skrevet af:
det stod på 38 længe efter at fire felter havde fået en kilde.

`udenKilde()` er ikke totalen; den er SAMLESTEDET for de kilder der mangler
helt, og den rummer nu kun `flaade` og `bemanding`. De 16 felter dér venter
på det SAMME svar: kan flåden og bemandingen deles på division? De øvrige ~18
er null INDE i beregningen, hver med sin skrevne grund — `sager/` findes ikke,
budgettet er ikke besluttet, og *ledig kapacitet* mangler en **definition**
frem for data. Så længe listen var lang og blandet, kunne man tro der var meget
tilbage at *bygge*. Der er ét spørgsmål tilbage at **besvare**. En prøve i
`test/kpi-aggregering.test.mjs` holder listen på de to domæner, så et nyt felt
ikke kan gemme sig blandt dem.

⚠ **`disponering` er nu afgjort — alle tre veje.** `forsinkelsesrisiko` og
`konflikter` HAVDE en kilde; den blev bare aldrig spurgt. Etaperne bærer
`etaMs` og `senestMs`, og de fem tjek er en ren funktion der kun manglede sine
lister. `ledigKapacitetPct` bliver stående som null — ikke fordi dataene
mangler, men fordi spørgsmålet ikke er stillet færdigt: ledig kapacitet i
hvilken periode, og målt i vogntimer, m³ eller enheder? De tre tal peger
forskellige veje. Se beslutning 60.

⚠ **Efterslæbet tælles nu på FELTNIVEAU.** Prøven sammenlignede kun
*domæner*, og seks felter gemte sig under den — `opgaver.udenTidsregistrering`,
`.klarTilFakturering`, `.udfoerteOpgaver`, `flaade.braendstofOere`,
`facility.aktiverPrArt` og `oekonomi.planlagtVedligeholdPct`. Alle seks
**læses af en skærm**, og ingen af dem blev skrevet: skærmen fik `undefined`.
Det er værre end `null`, for null er et svar formatterne kender — `num(null)`
skriver "—", mens Dashboardets `100 - undefined` blev NaN.

⚠ **Skrivning af auditposter var allerede bygget** — `audit` er en onCall, kaldt
fra `fleet/audit.js`. Den satte listen tre gange i træk uden at nogen læste den
efter.

⚠ **Retention-sletningen er bygget, og den sletter med vilje ingenting.**
`auditoprydning` kører den 1. i måneden, finder de forfaldne partitioner og
skriver dem til `udbyder/retention/<dato>` — men `RETENTION_AFGJORT` er falsk
for alle tre klasser, og så er `maaSlettes` falsk. Et job der slettede
revisionsspor på et tal ingen jurist har sagt god for, kan ikke gøre det om.
Se rækken **Audit-retention** i tabellen over åbne spørgsmål: rapporten er dét
spørgsmål, gjort synligt frem for udeladt.

⚠ **Claim-udstedelse fra `roller/` ER bygget — `rolleskriv`.** Her stod det
modsatte: at den ikke skulle bygges, fordi rollerne var faste, og at noden var
*fjernet*. **Beslutning 31b omgjorde 31**, og afsnittet her fulgte ikke med.
Noden findes i `firebase.rules.json`, kunden må redigere sine roller, og
`claimForRolle()` minter fra `tenants/<id>/roller/<rolle>/perms` med
`ROLLE_PERMS` som faldbakke.

Noden er stadig `.write: false` — men af en **anden grund** end før: det er
vejen der er lukket, ikke retten. `rolleskriv` skriver noden, minter claims og
kalder `revokeRefreshTokens` i én ombæring; kunne en klient skrive direkte,
ville node og token stå og være uenige indtil næste mint. Og `roller/` er en
**kilde**, aldrig et håndhævelsespunkt: reglerne læser den aldrig, og en prøve
falder hvis de gør.

⚠ **Bookingens tilstandsskift kom aldrig på listen igen** — det skal ikke
bygges. Bookingens tilstand er AFLEDT af etaperne (`forloebstilstand()`), og
den skrives af `etapeskift` i samme opdatering som etapeskiftet selv. En egen
funktion ville være to veje til ét felt. De berørte noder er `.write: false` indtil da —
strengere end den kontrol der skal afløse det, men ikke granulært.

⚠ **Tre ting er faldet af listen.** `grundlagskriv` tog nummerserierne,
og `etapeskift` tog etapens tilstandsskift OG reservationskonflikterne — de
to var altid den samme skrivning. De fem disponeringstjek håndhæves nu dér;
se ARKITEKTUR.

⚠ **Om nummerserierne:**
`naesteGrundlagsnummer()` tager nummeret i en transaction inde i
`grundlagskriv`, som beslutning 8 kræver. Mekanismen er den samme for de
øvrige serier; kun kaldstedet mangler. Skriv ikke en ny — genbrug counteren.

**Disponering dækker to forretninger.** Dagsvisningen er værkstedsopgaver med
varighed i timer; ugesvisningen er langtur med ETA over døgngrænser og
køre-hviletid. Det er ikke to zoomniveauer af samme datamodel — og
**beslutning 21 afgjorde hvordan de deles**: dagsvisningen læser `opgaver` med
art `vaerksted`, ugesvisningen læser `etaper`. Datamodellen er dermed på
plads; skærmen er ikke bygget.

### ⚠ Beslutning 21 rettede en modstrid i dette dokument

**README sagde i lang tid at `opgaver` skulle have en `art`
(`vaerksted` | `langtur`).** Den formulering er ældre end beslutning 16. Da
etaper kom som egen node, blev `langtur` en **dublet**: hvert felt en langtur
har brug for — `fraSted`, `tilSted`, `koeretoejId`, `personId`, `maengde`,
`senestMs`, `forslag[]` — står allerede på etapen, og `matchAabneEtaper()`
søger på **etaper**. To poster for én tildeling er præcis den fejl beslutning
16 lukkede: prototypens DE-QR 777 mod DE-KL 404.

Linjen blev båret videre uden at blive genlæst. **Beslutning 16 vandt**, og
arten er `vaerksted` | `facility`. Det står her, så man kan se at det var en
bevidst rettelse og ikke en drift — og reglerne afviser nu `langtur`, med en
test der fastholder det.

### Tre tjek der er bygget, men som intet kalder

Forudsætningerne for Disponering. Funktionerne findes og er testede;
**håndhævelsespunktet mangler**, fordi den Cloud Function der skriver en etape
ikke er skrevet. At en funktion findes er ikke det samme som at den håndhæves.

| Tjek | Funktion |
|---|---|
| Enhedskombination | `kanDisponeres()` — en trailer kan ikke køre alene |
| Kompetencer | `kraevedeKompetencer()` + `tjekKompetencer()` — en udløbet kompetence **blokerer** |
| Kapacitet | `kanBaere()` — m³ og kg hver for sig |

### ⚠ Beslutning 24 rettede beslutning 23

**Beslutning 23 sagde at supportsagen skulle "vise kundens auditlog".** Læst
som skrevet ville det have betydet at support kunne *læse* auditloggen — og
den er selv følsom: `ARKITEKTUR.md` siger udtrykkeligt at en log over hvem der
har set hvad, afslører hvilke kunder der bliver kigget på, og af hvem.

I praksis ville det være **permanent læseadgang til alle tenants' logge**,
altså det stik modsatte af hvad 23 skulle opnå.

**Rettelsen er at det er et udtræk og ikke en adgang.** En Cloud Function
henter posterne for *én bruger* i et fast vindue omkring fejltidspunktet og
skriver dem **på sagen**. Support læser sagen, aldrig `audit/`, og får aldrig
`audit.laes` på en kundes tenant.

| | |
|---|---|
| Vindue | ±5 minutter omkring fejltidspunktet |
| Loft | 50 poster. Rammes det, **siges det** — et udtræk skåret i stilhed læses som hele billedet |
| Konfigurerbart | **Nej.** Ikke af support, ikke på skærmen. Et loft der kan hæves af den der rammer det, er ikke et loft |

Det står her af samme grund som rettelsen under beslutning 21: **en synlig
rettelse er ikke det samme som drift.** Man skal kunne se at nogen tog
stilling, ikke undre sig over hvorfor teksten ikke passer med koden.

### Indeksnoden er også svaret på kundeportalen

README har længe noteret problemet under næste skridt: *"RTDB kan ikke
filtrere en forespørgsel med regler. En kunde kan ikke liste sine egne
bookinger — `.read` på `bookinger` er alt eller intet."*

**Support løser det, og mønstret er portalens svar:**

```
support/sager/<sagId>            i toppen, med et tenantId på posten
tenants/<t>/supportsager/<id>    indeks — kun id'er. Det kunden kan LISTE
```

At læse **én** post er en regel pr. post: `data.child('tenantId').val() ===
auth.token.tenant`. At **liste** kræver `.read` på forælderen — og derfor
findes indeksnoden i kundens egen tenant.

Tenant-isolationen er urørt: en kunde kan stadig ikke læse en anden kundes
sag. Vi kan, men kun med `support.laes`, som ingen kunderolle har.

Skriver man portalen senere, er det den samme figur: **posten i toppen med et
ejerfelt, plus et indeks pr. tenant.** Det er billigt at skrive ned nu og dyrt
at genopdage.

### De fem skærme der venter — og hvad de venter på

**Alle skærme med mockup er bygget**, og de ni uden har fået deres produktvalg
i **beslutning 22**. Fire af dem er dermed bygget eller ude af fase 0:

| Skærm | Status |
|---|---|
| Opsætning → Integrationer | **Bygget.** Kun det der findes — og der findes ingen. Ingen "coming soon" |
| Booking → **Rute & status** | **Bygget.** Ingen GPS: planlagt rute, meldte stop, næste stop, forventede tidspunkter |
| Opsætning → Idébank | **Fjernet fra kundens installation** — rute, skærm, permission og node. Lever videre som selvstændig `idebank.html` hos os. Beslutning 22, udført i beslutning 31 |
| Indkøb → Leverandører | Kartoteket er bygget som del af Indkøb & vareforbrug. Kun performancetallene mangler |

De **fem** der venter, venter nu på at svarene skrives ind i
**[FleetControl-spoergsmaal.md](FleetControl-spoergsmaal.md)** — retningen er
afgjort, detaljerne ikke:

| Skærm | Afgjort i beslutning 22 | Hvad der stadig mangler |
|---|---|---|
| **Økonomi → Fakturagrundlag** | FleetControl laver **ikke** den juridiske faktura. Ingen nummerserie, kreditnotaer, betalingsregistrering eller rykkere. Den producerer et godkendt, **låst** grundlag der eksporteres. Neutral intern model med adaptere: e-conomic, Dinero, Business Central, CSV. `prepared_by` og `approved_by` findes **altid**, også når det er samme person | **Kæden er bygget:** opret (Warehouse → Afregning), godkend og lås (Fakturering), alle tre gennem `grundlagskriv`. ⚠ Åbent: **momssatsen pr. linje** — der er ingen skærm der sætter den, og eksporten er spærret uden. Feltskemaet i den neutrale model, og hvilken adapter der bygges først, er også åbent. Selve afsendelsen findes ikke: `eksporter()` bygger objektet, men intet sender det nogen steder hen — låsningens **reference** er bindingen til regnskabet |
| **Flåde → Indberetninger** | To slags: **driftshændelser** (reparation, skade, dæk, service, andet) starter et forløb; **udgiftsregistreringer** (tankning, parkering, truckwash, kvittering) gør ikke. En driftshændelse **lukkes ikke** når den bliver et værkstedsbesøg — den er samme sag hele vejen til fakturaen. Skade får modpart, reg.nr., forsikringsselskab, policenr., skadenr. og ansvar | Om skadeforløbet er sin egen tilstandsmaskine |
| **Bemanding → Kompetencer** | **Lovkritiske** (C, CE, D1, D, ADR, tachograf) blokerer hårdt. **Virksomheds- og kundekrav** advarer med override der kræver begrundelse og logges. Chaufføren uploader dokumentation, kontoret godkender. Varsler konfigurerbare, default **90/30/14** dage | **Opdelingen er bygget** — `tjekKompetencer()` returnerer `{ ok, blokerende, advarende }`, og skærmen kalder den med objektformen. `ok` betyder KAN DISPONERES; advarsler gør den ikke falsk. Åbent: et foto af et ADR-kort hører i `sensitive/`, og det kræver en **Storage-bucket, som DEV ikke har** |
| **Indkøb → Leverandører** | **Ingen stjerner.** Objektive tal: leverance til tiden, fakturaafvigelse, gennemsnitlig leveringstid, prisændring 12 mdr., reklamationer, samlet køb. En score må **kun** findes hvis beregningen kan vises. Aftaler og prislister ligger på leverandøren, ét sted | **Afklaret:** fire af de seks kan beregnes af et opslag pr. leverandør — `leverandoerId` er allerede indekseret på `indkoeb` og `fakturaer`. **Svartid** kræver `sager`, som endnu ikke har regler. **Andel af indkøb** kræver en aggregering: nævneren er tenantens samlede indkøb, og summeres den af et hentet vindue, er det en total ud af et udsnit (beslutning 6). ⚠ `beregnNoegletal()` opdager det ikke — får den en liste der kun rummer én leverandør, returnerer den **100 %** med et grundlag der ser tilstrækkeligt ud |
| **Opsætning → Generelt** og **Brugere & roller** | delvist afgjort | Hvad kunden må ændre selv, er stadig åbent. Men rollespørgsmålet er **besvaret**: beslutning 31b siger ja, med to mekaniske spærringer — `brugere.skriv` kan ikke fjernes fra den sidste rolle der har den, eller fra ens egen. `rolleskriv` er vejen ind |

**Support hører efter fase 1** — se beslutning 23. Den er ikke en af de ni.

### Noder der er dokumenteret, men mangler regler

Entiteterne er afgjort og har form i `ARKITEKTUR.md` og et demo-sæt, men de
står **ikke** i `firebase.rules.json`. Det er bevidst: reglerne skrives når
skrivning bygges, så de kan testes mod noget der faktisk skriver. Uden en
regel afviser RTDB alt — der er ingen åben dør, kun en manglende.

| Node | Bemærkning |
|---|---|
| ~~`facility/lokationer`~~ | ✅ **Bygget.** Navn og type valideres; `sted` er fri tekst med vilje — stederne er denne tenants, og et katalog i regelfilen ville betyde en udrulning pr. nyt depot |
| ~~`facility/aktiver`~~ | ✅ **Bygget.** Indekseret på `lokationId`, `status` og `naesteServiceMs` |
| ~~`facility/zoner`~~ | ✅ **Bygget.** Bærer grænserne. `facility/sensorer` havde regler i forvejen |
| `sager`, `sensitive/sager` | Beslutning 20. Permissions `sag.*` mangler af samme grund |
| `support/sager`, `support/beskeder` | ⚠ I **toppen**, ikke under `tenants/` — som `audit/`, fordi `.read` kaskaderer. Reglen pr. sag sammenligner `tenantId` med claim'et |
| `tenants/<t>/supportsager` | Indeks. Kun id'er |
| `support/countere` | Global counter — sagsnumre er vores, ikke kundens |
| ~~`leverandoerer`~~ | ✅ **Bygget.** ⚠ `leverandoerId` var **allerede indekseret** på `indkoeb` og `fakturaer` — modellen regnede med noden, længe før den blev skrevet |
| `prislister/<leverandoerId>` | Beslutning 25. Ligger **for sig**, ikke på leverandøren: flere års historik skal ikke hentes med hver oversigt |
| ~~`grundlag`~~ | ✅ **Bygget.** Noden findes, Fakturering læser den, og `grundlagskriv` skriver den: opret (med nummer fra counteren), godkend og lås. Noden er `.write: false` for **alle**, også admin. ⚠ To permissions, fordi det er to handlinger: `grundlag.skriv` udarbejder, `grundlag.godkend` godkender og låser — casehandleren har kun den første |
| ~~`sensitive/indberetninger`~~ | ✅ **Bygget.** Skadebeskrivelse, modpart og **underskrift**, og `indberetninger.sensitiveLaes` findes. ⚠ Det er den ene node hvor den **mindst betroede** rolle opretter poster — chauffører skriver deres egne indberetninger |
| `sensitive/indberetninger/<id>/underskrift` | ✅ Write-once — og det holdt **ikke** af sig selv. `.validate` køres ikke ved en sletning, så underskriften kunne fjernes og skrives om i to trin. Hele den underskrevne post er nu **frossen**, og hovedposten kan ikke slettes under den. Se **beslutning 52** |

| ~~`enheder`~~ | ✅ **Bygget** (WAREHOUSE.md etape 9). `enheder/<serienr>` — ét stykke gods med sit eget serienummer. Nøglen ER serienummeret, så samme tegnregel som batchen gælder. ⚠ Noden er `.write: false` for **alle**, og der findes med vilje **ingen** `enheder.skriv`: rækken bærer samme kendsgerning som `beholdning`, og de to skrives i ÉN atomisk opdatering af `bevaegelseskriv`. To skrivere ville være to sandheder |

Listen står her, så den ikke ligger spredt i tre dokumenter. Tilføjer du en
node, hører den enten i reglerne eller på denne liste.

⚠ **Og nu prøves det.** Fem af tolv rækker sagde "mangler regler" om noder der
havde dem — og en af dem var underskriftens write-once, som derfor stod som
**ikke bygget** mens den i virkeligheden var bygget og kunne omgås. En liste
over det der mangler, er kun brugbar hvis den bliver kortere når noget bliver
bygget. `test/dokumentation.test.mjs` læser tabellen ud af README og fejler på
en node der står begge steder. Se beslutning 52.

### ⚠ `ikkeFaktureretOere` betyder noget andet efter beslutning 25

Feltet hed det samme før, men der stod ikke hvad det talte. Nu gør der:
**udført arbejde uden et låst fakturagrundlag.** Ikke "ufaktureret omsætning"
i almindelighed, og ikke summen af åbne bookinger.

Forskellen er ikke akademisk. Et forløb med en åben etape kan ikke godkendes,
og et grundlag der er erstattet, tæller ikke med — begge dele ville pynte på
tallet, hvis det blev regnet på bookinger frem for på grundlag. Aggregeringen
skal bruge `erGaeldende()` og `summer()` fra `grundlag.js`, ikke sin egen
optælling. En kopi uden det filter ser ud som en sum og er en
dobbeltfakturering.

### KPI-aggregeringens efterslæb — beslutning 6

**Reglen: et manglende KPI-tal defineres i `demo-kpi.js` — det hardkodes ikke
i en skærm.**

⚠ **Og et felt der ikke er beregnet, skal LIGNE det.** `num(null)` gav "0"
indtil nu. Så længe `kpi/` blev seedet fra demo-sættet, havde hvert felt en
værdi, og forskellen kunne ikke ses — men aggregeringen kommer til at skrive
`null` for felter hvis KILDE ikke findes: `opgaver`, `indkoeb` og `facility`
er ikke i databasen endnu. Skærmen ville have skrevet "0 åbne ordrer". Det er
ikke en tom liste; det er et ubesvaret spørgsmål. `num`, `pct` og `km` skriver
nu `INTET` (—) for null og NaN, og "0" for nul. Se `test/format.test.mjs`.

`demo-kpi.js` *er* formen på `kpi/`-noden. Definerer man feltet der, er
skærmen rigtig med det samme (`k.facility.aabneFejl`), og det eneste der
mangler er aggregeringen. Hardkoder man i stedet `num(24)` i en JSX-fil, har
man to opgaver senere: rette skærmen **og** skrive aggregeringen — og imens
står der et tal ingen kan spore.

Derfor er listen herunder **felter der skal beregnes**, ikke skærme der skal
rettes.

⚠ **Og efterslæbet er nu MÅLT.** `udenKilde()` i `kpi-aggregering.js` er
optællingen: 16 felter venter på en kilde, og **`KILDER_DER_MANGLER` er tom**.
Der er ikke flere noder uden data; de 16 felter venter på et SVAR, ikke på et
seed.
Får et domæne sin node, fjernes felterne ét sted, og prøven falder hvis
optællingen ikke følger med.

⚠ **`opgaver` var den første af dem, og den havde regler og ingen data.**
Noden er skrivbar med `opgaver.skriv` og har et indeks — men intet seedede
den, og **ingen skærm forespurgte på den**, så den stod tom uden at nogen så
det. Indekset navngav oven i købet `dato`, som ingen opgave har: de bærer
`startMs`.

⚠ **`indkoeb` var den næste, og den havde MEST af det.** Et indeks, en
validering af hver eneste feltform, et loft på prisen der fanger tre nuller
for meget, og en kommentar om hvorfor beløbet er hele øre — alt sammen om en
node der var **tom**. `fakturaer` kom med i samme ombæring: et indkøb uden
sin faktura er kun den halve historie, og `fakturaerTilGodkendelse` og
`ikkeLinkedeFakturaer` kan ikke regnes af linjerne alene. Sammen med
`opgaver` faldt efterslæbet fra 52 til 31 felter.

⚠ **Og `fakturaer` indekserede `godkendelsesstatus`, som ingen post har** —
posterne bærer `status`. Samme fejl som `opgaver."dato"`, og feltnavnet stod
oven i købet afskrevet i `leverandoerer.js`' hoved. Et indeks på et felt der
ikke findes, **fejler ikke**: RTDB henter hele noden ned og filtrerer i
klienten med en advarsel i konsollen. Regningen kommer stille.

⚠ **Indkøb-skærmen læste demofilen, ikke noden.** Den havde sin egen kopi af
divisionsfilteret — udtrykkeligt forbudt i CLAUDE.md — og kopien manglede
leddet om poster **uden** division. Den er nu på `useListe("indkoeb")` med
`vindueDage: 400`, så prisgrafens tolv måneder er dækket uden at hente hele
noden. **Det er den prøve der betyder noget:** en node med data ingen skærm
læser, er stadig en node ingen ser.

⚠ **`leverandoerer` FANDTES SLET IKKE I `firebase.rules.json`** — og det er
en anden slags hul end en node med regler og ingen data. Modellen har regnet
med den hele tiden: BÅDE `indkoeb` og `fakturaer` har indekseret
`leverandoerId` siden de blev skrevet, og `valideIndkoeb()` har hele tiden
svaret "Leverandøren findes ikke." Serveren tog imod posten alligevel — en
klientvalidering der ikke også står i reglerne, er en pæn knap. De to
fremmednøgler blev strammet **sammen** med at noden kom til, som noterne
begge steder lovede.

⚠ **Prislisten ligger PÅ leverandøren, versioneret på dato.** Den er hans
aftale med os, og `prisPaa()` slår op PÅ INDKØBETS DATO — ikke på dagens
pris. Havde leverandøren en regulering i april, ville en faktura fra marts
ellers pludselig se forkert ud målt mod "aftalen", og afvigelsen ville pege
på leverandøren frem for på os. Formen er den samme som
`satser/$gruppe/satser`, og forbeholdet derovre gælder ordret: reglen kan
ikke forbyde en overskrivning uden også at forbyde en rettelse af en tastefejl
samme dag. Den håndhæver **formen**; beslutningen håndhæves af skærmen.

⚠ **Prisafvigelserne kan derfor regnes nu**, med den SAMME `prisPaa()` som
`beregnNoegletal()` bruger pr. leverandør — og med aftaleformens grænse: en
fastaftale der afviger 4 %, er et brud; et spotkøb der gør det, er markedet.
Målt mod DEV: gods 7 afvigelser / +1,8 %, bus 1 / +3,6 %.

⚠ **En selvkontrol i `demo-indkoeb.js` kører kun i browseren.** Blokken står
under `import.meta.env?.DEV`, som er undefined i node — så `npm test` var
grøn mens skærmen var hvid, fordi kontrollen læste `DEMO_LEVERANDOERER` før
den var initialiseret. Den står nu nederst i filen. **En selvkontrol prøverne
ikke kan nå, er en kontrol der selv er uden kontrol** — det gælder alle
`demo-*.js`, ikke kun denne.

⚠ **`facility` VAR EN FORKERT DIAGNOSE — TO GANGE.**

Først stod den som en manglende kilde. Den manglede kun DATA, og de er seedet:
aktiver, zoner, sensorer, fejl og omkostningskomponenterne.

Så lagde jeg den i `UDEN_DIVISION` ved siden af flåden, fordi reglerne
udtrykkeligt **forbyder** `division` på lokationer, aktiver og fejl — og
sluttede deraf at tallene var ubesvarlige. Det var også forkert, og svaret stod
skrevet i `demo-facility.js`' hoved hele tiden: **"FACILITY ER FÆLLES.
Aktiverne er de samme uanset division, og kpi.facility er derfor identisk under
gods og bus."** `demo-kpi` bekræfter det — 287 aktiver i **begge** divisioner,
mens flåden står 42 mod 18 og bemandingen 58 mod 26.

Der er altså **to slags "ingen division"**, og demo-sættene skelnede allerede:

| | Feltet mangler | Svaret |
|---|---|---|
| **Flåden, bemandingen** | fordi det skal DELES og ingen har delt det | ubesvarligt — `null` |
| **Facility** | fordi delingen ikke giver mening | hele basen, vist begge steder |

Det er samme regel som `iDivision()`: en post uden division hører til **begge**,
ikke til ingen. At skrive `null` for facility ville have været at stille et
spørgsmål der allerede var besvaret — og holde tolv felter tomme for at få dem
til at ligne flåden.

⚠ **To felter kan alligevel deles**, og forskellen er værd at forstå:
`planlagtVedligehold` kommer fra `opgaver` og `eksterneLeverandoerer` fra
`leverandoerer` — begge noder BÆRER en division. **Aktivet er genstanden og kan
ikke deles; arbejdet på det er planlagt af en afdeling og kan.**

⚠ **Og `zonePar()` lå i en demofil uden argumenter.** Skærmene kaldte
`zonePar()` og fik demo-sættet — også efter at noden var seedet. Tredje gang
mønstret dukker op efter `linjeBeloebOere` og `medPrisliste`: et regnestykke i
en `demo-*.js` er kode der forsvinder den dag noden er rigtig. Den hedder nu
`zonePar(zoner, sensorer)` og står i `facility.js`.

✅ **Nøgletallene seedes ikke længere — de REGNES.** Provisioneringen skrev
`DEMO_KPI` til `kpi/`, og dev viste derfor mockuppens tal oven på sine egne:
"18 åbne ordrer" over en tabel med 6 rækker, "287 aktiver" over 15 hentede.
Det brød husreglen om at opdigtede tal kun findes hvor der ikke er en database
at spørge — dev **har** en. Provisioneringen henter nu noderne og kalder
`beregnKpi()`, ad samme vej som det natlige job.

⚠ **Og det afdækkede fem fejl som seedet havde skjult:**

| Hvad | Hvorfor det ikke blev set |
|---|---|
| `bemanding` fandtes **ikke** i noden, og skærmen blev hvid | RTDB **gemmer ikke null**. Er hele domænet null, forsvinder domænet — og hovedet i `kpi-aggregering.js` lovede det modsatte. `medFuldForm()` lægger formen tilbage, ét sted |
| "0 kr." i driftsomkostninger | `kr()` skelner ikke mellem nul og ubesvaret — det er en **beslutning**, og kalderen skal gate. Dashboardet gjorde det ikke |
| "— / 100 %" i planlagt vs. akut | `100 - null` er **100**, ikke NaN |
| "0,00 vs. sidste periode" | `null / 100` er **0** — divisionen gik uden om `deviation()`s gate |
| "0,0 % vs. budget" | `deviationPct()` returnerede **0** når budgettet manglede. To ubesvarede tal blev til én rosende dom |

Fællesnævneren: **et regnestykke på null giver stille et tal**, og resultatet
ser ud som en måling. `deviation()` og `deviationPct()` skriver nu `INTET` for
det ubesvarede — mens `deviation(0)` stadig er "0,0 %", fordi *uændret* er et
svar.

⚠ **To hardkodede tal stod i Dashboardet:** `n: 3` for "nye indberetninger" og
`deviation(-0.6, …)` for nedetidens afvigelse. Begge sagde det samme i hver
eneste tenant, og det sidste var en **pil** under et nøgletal der var tomt.
Felterne hedder nu `flaade.nyeIndberetninger` og `flaade.nedetidDeltaPoint` og
står i `demo-kpi.js` — kuren CLAUDE.md foreskriver.

⚠ **RESERVATIONSNODEN MANGLEDE FRAVÆRET — og serveren kunne derfor ikke se det.**

Målt på den udrullede base indeholdt `reservationer` **kun** bookinger:
7 køretøj + 6 medarbejder, og **intet fravær**. Reglen på noden siger det
modsatte: *"Skriver en reservation med kilde 'fravaer' på chaufføren, så en
syg chauffør ikke kan disponeres."*

`etapeskift` håndhæver de fem tjek mod netop den node. Et fravær der ikke står
der, findes ikke for serveren — en booking kunne lande på en sygemeldt
chauffør. Disponering-skærmen byggede sine **egne** af demo-fraværet og viste
derfor en konflikt serveren ikke kendte: **skærmen VISER, funktionen
HÅNDHÆVER**, og de to var uenige i den farlige retning.

Provisioneringen udleder dem nu med den samme `reservationFraFravaer()`, og
skærmen læser noden. Målt efter: 13 fra etaper + 10 fra fravær.

⚠ **OG SAMME FEJL STOD PÅ FORSLAG-SKÆRMEN — hvor koordinatoren GODKENDER.**
`tjekrakkerFor()` byggede sine reservationer af `DEMO_ETAPER` alene, altså
uden fravær og uden værksted, og hentede bil, chauffør og kompetencer fra
demo-sæt lukket inde i modulniveauets `bil()` og `person()`. Det er ikke
kosmetik: `enheder` går direkte ind i `kanBaere()` og `kanDisponeres()`, så
den bil der blev prøvet, var demoens.

Konsekvensen er værre her end på Disponering: skærmen ville sige **ja** hvor
serveren siger nej — og brugeren har fået at vide at det var i orden.

✅ **OG EN BIL PÅ VÆRKSTED SPÆRRER NU OGSÅ.** Opgavernes reservationer
manglede, og grunden var ikke et glemt seed: `reservationFraOpgave()` **kunne
ikke kaldes på en rigtig opgave**. Den krævede `fra`/`til`; noden bærer
`startMs` og `estimeretMin`, så hver eneste opgave kastede. At funktionen
alligevel virkede, skyldtes at alle tre kaldsteder fodrer den med et **besøg**
— som tilfældigvis har `fra`/`til`.

Resultatet: en værkstedsopgave på vores egen lift spærrede ingenting.
Prioritet **40** — den højeste af alle — fandtes kun i skærmen.

⚠ **Og det var anden halvdel af en fejl der allerede var rettet én gang.**
`opgaver`s indeks navngav `dato`, som ingen post har; jeg rettede indekset og
opdagede ikke at **modulets feltkatalog sagde det samme forkerte**. `FELT`
lovede `dato`, `varighedMin` og `estimatOere` — tre navne ingen opgave bærer.
En prøve holder nu kataloget op mod en rigtig post.

Målt efter: 13 reservationer fra etaper, 10 fra fravær, **13 fra opgaver**.
Disponerings konfliktliste gik fra 13 til 15 og siger nu *"Køretøjet er
reserveret til værksted (op-001)"*.

⚠ **VÆRKSTEDSBESØGENE MANGLER STADIG — og det er et hul, ikke en detalje.**
`besoeg` har **ingen node**. Reservationen med `kilde.type: vaerksted` og
prioritet **40** — den højeste, højere end en booking — findes derfor kun i
skærmen, og `etapeskift` kan ikke se at bilen står på liften. Skærmen bygger
dem fortsat lokalt, med noten skrevet ved siden af.

⚠ **OG SKÆRMENE BLEV STÅENDE PÅ DEMOFILEN.** Da noderne blev seedet én for
én, fulgte visningen ikke med. Målt: **47 steder** viste et demo-datasæt for
en node der var seedet.

De to der betød mest er rettet:

| Skærm | Hvad den viste |
|---|---|
| **Indkøb → Fakturaer** | Hele skærmen for `fakturaer` kørte på demo-sættet, mens `indkoeb.fakturaerTilGodkendelse` blev regnet af noden |
| **Flåde → Oversigt** | "Åbne fejl" pr. bil og de fire seneste hændelser kom fra `DEMO_INDBERETNINGER` |
| **Kompetencer** | Talte udløbne beviser — det tal der afgør om en chauffør kan disponeres — på demofilen |

⚠ **Og to hjælpetekster talte demoens længde**, i en sætning der forklarer at
listen er et *udsnit*. En forklaring der måler noget andet end det den
forklarer, er værre end ingen.

`test/demo-i-skaerm.test.mjs` er **et loft, ikke et forbud**: 40 tilbage, og
det kan kun gå ned. De fleste er navneopslag (`demoBilNavn(id)` på en række),
ikke tal — de skal væk, men én skærm ad gangen med et klik bagefter. Prøven
har desuden en hård regel: **nodens egen skærm må aldrig vise demo-sættet**.

---

⚠ **TO DEMO-DATASÆT FOR ÉN NODE — og det kostede en forkert rettelse.**

`demo-vaerksted.js` havde en `DEMO_INDKOEB` med fire værkstedsindkøb, ved
siden af `demo-indkoeb.js`' `DEMO_INDKOEBSLINJER`. Begge lå i `fleet/`, hvor
et demosæt *hører hjemme*, så `test/demo-kilder.test.mjs` så dem ikke: den
lint kiggede kun efter datasæt i **modulfiler**.

Kun det ene blev seedet. Og de delte ikke form — kopien bar `beloebOere`
direkte, som reglerne forbyder, fordi beløbet beregnes af antal × pris.

Konsekvensen stod i to tidligere etaper, begge gange behandlet som symptom:

| Hvad jeg så | Hvad jeg gjorde | Hvad det var |
|---|---|---|
| `fa-9001` pegede på `ik-001`, som ikke fandtes | Satte feltet til `null` — "en hængende reference er værre end ingen" | Linjen fandtes. Den lå i den anden fil |
| `fa-9002` var på 29.600 kr, linjen på 16.500 | Læste forskellen som afstemningsmateriale | Forkert reference — den rigtige linje lå i den anden fil |

De fire ligger nu i noden som `il-vb-00N` med `besoegId` som spor tilbage til
værkstedsbesøget, alle ni fakturaer rammer en linje, og **hvert beløb stemmer**.
Værkstedskalenderen læser noden; kolonnerne følger nodens form, ikke kopiens.

⚠ **Linten er udvidet:** to demo-filer må ikke beskrive den samme node. Prøven
er efterprøvet ved at genindføre `DEMO_INDKOEB` — den bliver rød.

⚠ **Og der skulle en NY faktura til.** Da alt matchede, kunne "faktura uden
match" ikke længere ses, og to prøver blev røde med netop den besked. `fa-9009`
er den ene uden match — en leverandørfaktura uden registrering er hele grunden
til at der afstemmes.

✅ **`indberetninger` er seedet — og den bar mere end ét manglende felt.**

| Hvad | Tilstand før |
|---|---|
| `sensitive/indberetninger` | **Fandtes ikke i regelfilen** — men CLAUDE.md beskrev dens write-once-regel for underskriften som *gældende*. En dokumenteret spærring uden håndhævelse: den stod i vejen for at nogen byggede den, og den stoppede ingenting |
| `indberetninger.sensitiveLaes` | Fandtes ikke i `permissions.js`. `indberetninger.js` bar den som `PERM_SENSITIVE_LAES_PLANLAGT` med en note om at den tilføjes "i SAMME ombæring som reglerne og deres tests" |
| Hovedpostens validering | **Kun `division`.** Alt andet frit — og det er den ene node hvor den *mindst betroede* rolle opretter poster: chauffører skriver deres egne |
| De tre klassificerede felter | Kunne skrives på hovedposten, som enhver med flådemodulet kan læse. Beslutning 17 var en konvention, ikke en spærring |
| `.indexOn` | Navngav `type`; posterne bærer `art`. **Tredje gang** efter `opgaver."dato"` og `fakturaer."godkendelsesstatus"` |
| Ejerskabstjekket | `!data.exists() \|\| oprettetAf == auth.uid` — altså kun ved **redigering**. En chauffør kunne *oprette* en indberetning i en kollegas navn. Fundet af prøven |

⚠ **Permissionen er koordinatorens alene.** Samme snit som på bookingen: den
der lukker sagen og håndterer fakturaen, skal kunne se hvad der står på spil.
Disponenten får den ikke — han skal vide *at* bilen er på værksted, ikke hvad
modparten hedder. Se **Rollegennemgang** når den tages.

⚠ **`materialelinjer.lagerId` fik IKKE et eksistenstjek**, og det er et åbent
spørgsmål frem for en forglemmelse: `lagre` beskrives i `moduler.js` som
"reservedelslageret under Indkøb", men bærer i PRISER.md døgnsatser for
*kunders* opbevaring. Demoens id'er (`lager-vaerksted`, `lager-hoved`) er
hverken det ene eller det andet. Et opslag ville låse noden fast på én læsning
uden at nogen havde besluttet hvilken.

**Venter på aggregeringen.** Felterne er defineret, skærmene læser dem
korrekt, og demo-værdierne er konsistente med de øvrige demo-datasæt:

| Felt | Hvad det skal tælle |
|---|---|
| `bemanding.medarbejdereAktive` | Aktive medarbejdere. Medarbejdere skriver "af N hentede" indtil da — listen er et udsnit |
| `bemanding.fravaerIDag` | Fraværende i dag. Ferie & fravær har ingen KpiRække indtil da |
| `facility.aabneSager`, `.aabneSagerDelta` | Åbne sager pr. lokation. ⚠ `sager/` findes ikke — beslutning 20 er fase 0, kun visning |
| `facility.klimaalarmerIDag` | Alarmer udløst i døgnet. Kræver historik — modsat *aktive* alarmer, som beregnes |
| `kunder.aktiveDeltaPct`, `.daekningsbidragDeltaPct` | Periodeafvigelser i **procent**. ⚠ Ikke det samme som dækningsgradens afvigelse mod **målet**, som er procentpoint og står under `oekonomi` — samme ord, to regnestykker, og de kan pege hver sin vej |
| `oekonomi.driftsomkostningerDeltaPct`, `.ikkeFaktureretDeltaPct` | Periodeafvigelser i **procent**. ⚠ Ikke budgetafvigelsen — den udledes af `driftsomkostningerOere − budgetOere` og må aldrig gemmes |
| `oekonomi.daekningsgradDeltaPoint` | ⚠ **Procentpoint** mod forrige periode. 68 % der bliver til 72 % er +4 point |
| `afvigelser` | **Top 5 på tværs af flåde, facility, indkøb og værksted.** Dashboards "Største afvigelser". Kan ikke udledes lokalt — den blander fire moduler |
| `warehouse.carriereUdenLokationDelta` | Ændring i uplacerede beholdere siden i går, i **antal**. ⚠ Det ENESTE warehouse-felt i `kpi/`: de fem tal på Carrier-overblik er afledt af de rækker skærmen har og beregnes hos forbrugeren (`carrieroverblik()`). Et delta kræver derimod gårsdagens tal. Antal og ikke procent — 11 beholdere der bliver til 13, er +2, og en procent af et lille tal er støj |
| `oekonomi.driftstimer` | Driftstimer i perioden. Nævner i omkostning pr. driftstime |
| `oekonomi.planlagtVedligeholdPct` | Andel planlagt vs. akut. ⚠ **Kan ikke udledes af `opgaver`**: en opgave har `art` (vaerksted \| facility) og en status, men intet felt der siger om arbejdet var planlagt eller akut. At kalde `art: vaerksted` for akut ville være et gæt — og Dashboardet regner `100 − x`, så gættet bliver til to tal der ser ud til at supplere hinanden |
| `opgaver.udfoerteOpgaver` | Udførte opgaver i perioden. Nævner i omkostning pr. opgave |

**Skal UD af aggregeringen.** Et afledt tal der er gemt, driver fra sit
grundlag:

| Felt | Hvorfor |
|---|---|
| `bemanding.ledig` | Kan beregnes af planlagt − disponeret. Beregnes hos forbrugeren |
| `facility.facilityOmkostningOere` | **Fjernet.** Summen af `facility/omkostning`s fem komponenter — `bygningsomkostningOere()` regner den hos forbrugeren, og **ingen skærm læste kpi-feltet**. Den stod på efterslæbslisten som noget der skulle beregnes; den skulle i stedet ud |

Og tre tal er **bevidst holdt ude** af `kpi/`, fordi de er afledte:
klimaalarmer *nu* (måling + zonens grænse), gennemsnitstemperatur (regnes af
sensorlisten) og bygningsomkostningen (summen af sine komponenter). Gemte man
dem, kunne de modsige de data de beskriver — og det var netop de tre fejl
Facility-mockupsene havde.

### En opgave har ingen kunde — værkstedet servicerer egen flåde

Booking-mockuppen viste `Kunde` og `Fakturerbar: Ja` på hver værkstedsopgave.
**Det er afgjort: værkstedet servicerer kun egen flåde**, og begge felter er
derfor forkerte — ikke bare unødvendige.

En kunde på en opgave ville betyde at arbejdet kunne faktureres videre, og et
beløb der ser ud som en indtægt bliver læst som en indtægt. `beloebOere` på en
opgave er en **omkostning**. Det er samme skel som beslutning 11: to tal der
begge hedder "beløb" ender med at blive lagt sammen.

Det der faktureres, er **bookinger** — transportarbejde med egen omsætning, i
fanen ved siden af. `opgaver.klarTilFakturering` tæller derfor afsluttede
**forløb**, ikke opgaver; se rækkerne i Økonomi, som er BKG-numre.

Selvkontrollen i `demo-opgaver.js` advarer, hvis `kundeId` eller `fakturerbar`
dukker op igen. Kommer de tilbage, skal det være en bevidst modelændring.

## Uafklaret — blokerer fase 2

Fase 0 er visning. Fase 1 er skrivning bag Cloud Functions. **Fase 2 er det
der forlader systemet:** eksport til regnskabet, sletning efter retention,
mails ud af huset. Listen her er kort med vilje — det er de spørgsmål der
skal have et *menneskeligt* svar, ikke et teknisk, og de kan ikke besvares af
den der skriver koden.

| Spørgsmål | Hvem svarer | Hvad det blokerer |
|---|---|---|
| **Momssatserne pr. linjeart** — hvornår er det 25 %, hvornår 0, hvornår omvendt betalingspligt? | En bogholder, **før første eksport** | Eksport af fakturagrundlag. `grundlag.js` nægter i dag eksport uden en sats pr. linje, og det er det rigtige svar så længe reglen er ukendt — men det betyder også at ingen kan eksportere |
| **Retention på `sensitive/indberetninger`** — hvor længe skal en underskrift og en skadebeskrivelse gemmes? | Jurist eller DPO | Sletning. Underskriften er både en personoplysning og et **bevis**, og de to trækker i hver sin retning: databeskyttelsen siger slet, bevisbyrden siger gem. Forældelsesfristen på et erstatningskrav er formentlig det rigtige anker, men det er ikke et gæt vi skal tage |
| **Kan flåden og bemandingen deles på division?** ⚠ Et køretøj har INGEN division (beslutning 19), og målt på den udrullede base har 0 af 16 køretøjer, 0 af 35 medarbejdere og 0 af 80 kompetencer feltet — mens 14 af 14 kunder og 8 af 8 etaper har det. `kpi/gods/flaade.aktive` kan derfor ikke regnes | Kunden, eller en beslutning | 17 flåde- og bemandingsfelter i `kpi/`, som i dag er `null`. **Tre veje:** (a) udled af ARTEN — bus og minibus er bus, resten er gods. Det er et gæt: en varevogn kan køre for busafdelingen. (b) Udled af BRUGEN — en bil hører til de divisioner den har kørt etaper for. Ægte data, men en bil der aldrig har kørt, hører ingen steder, og "ude af drift" er en status og ikke en brug. (c) Lad dem være udelte — samme tal i begge, hvilket bryder beslutning 9's mening med vælgeren |
| **Audit-retention** | Samme | ⚠ **Mekanismen er nu bygget og venter kun på tallet.** `auditoprydning` finder de forfaldne partitioner og rapporterer dem til `udbyder/retention/`; den sletter intet, fordi `RETENTION_AFGJORT` er falsk. Når juristen svarer: sæt tallet i `RETENTION_MAANEDER`, sæt flaget, og skriv begrundelsen i BESLUTNINGER.md — i den rækkefølge. Prøven `⚠ INGEN RETENTION ER AFGJORT ENDNU` falder samme dag, og det er meningen |
| **Fire-øjne på fakturagrundlag** — skal godkenderen være en anden end den der udarbejdede det? | Kunden | Ingenting endnu, men det ændrer `kanGodkende()`. Det er rigtigt i en stor virksomhed og forkert hos en vognmand med to på kontoret, hvor det ville betyde at grundlag aldrig blev godkendt. Hører som en indstilling pr. tenant — ikke som en regel vi vælger for dem |

⚠ **Ingen af de fire må besvares ved at gætte i koden.** Det er hele pointen
med at `grundlag.js` kaster frem for at sætte 25 %: et system der gætter
rigtigt ni gange ud af ti, lærer brugeren at stole på det tiende gæt.

## Låst rækkefølge

Sikkerhedsarbejdet er prioriteret én gang, og rækkefølgen ligger fast. Hvert
punkt gør det næste billigere; springer man frem, bygger man ovenpå noget der
endnu ikke holder. **Alle syv er lukket.**

| # | Punkt | Definition of done |
|---|---|---|
| 0 | `.validate` for beslutning 15 | Reglerne afprøvet i emulatoren — accept og afvisning demonstreret, ikke kun læst igennem |
| 1 | **Tenant-isolationstest** | Automatisk og permanent. Køres ved **hver** ændring i `firebase.rules.json` |
| 2 | DEV og PROD som to Firebase-projekter | Adskilte projekter, og Storage-regionen verificeret |
| 3 | **Permissions som liste frem for rolle-streng** | Håndhævet i `firebase.rules.json`, **ikke kun i frontend**. Testen skal vise at *serveren* afviser |
| 4 | Central audit-service | Append-only. En bruger med alle permissions kan hverken skrive, ændre eller slette en post |
| 5 | `securityLevel` som valideret enum | En liste kan vise en hængelås uden at hente noget klassificeret |
| 6 | Sensitive felter i separat RTDB-node | `booking.laes` alene giver hverken `sensitive/` eller `vaerdi/` |

Punkt 3 er værd at læse to gange. **En permission der kun findes i frontend, er
ikke adgangskontrol — det er en pæn knap.** Definition of done er en afvisning
fra serveren.

Tre forbehold hører til her, og de er skrevet ud i
**[BESLUTNINGER.md](BESLUTNINGER.md)** frem for at blive opdaget:
**læsningslogningen er klientside** (udløseren ligger i `useListe()`, så en
klient der ikke kalder, logger ikke), **audit-retention er ikke afgjort**
(24 mdr. er foreløbigt og skal afgøres juridisk før første betalende kunde),
og **fem af seks `restricted`-kontakter kan ikke håndhæves endnu**.

**Reglerne er deployet til DEV, ikke til PROD.** En samlet deploy til
produktion hører sammen med den første rigtige tenant-provisionering.

### Planlæg aktivitet — den første skrivning i Fleet

Driftskalenderen kan nu **oprette** en driftsopgave. Formularen er en dialog,
og den skriver **gennem serveren**: Cloud Function'en `opgaveplanlaeg` lægger
opgaven og dens reservation i **én `update()`**.

⚠ **Hvorfor en funktion, når `opgaver` er skrivbar fra klienten.** Fordi
`reservationer` er `.write: false`, og de to skal skrives sammen. Landede kun
opgaven, ville enheden have et værkstedsbesøg **uden at være spærret** — og så
ser den *fri* ud i disponeringen, hvilket er værre end en spærring man kan se.
Landede kun reservationen, ville enheden være spærret af ingenting. Dertil kan
to disponenter ramme samme sekund, og det kan et klientsidetjek ikke forhindre.

⚠ **Den overskriver ikke en booking — den afviser.** Et værkstedsbesøg har
prioritet 40, den højeste, og *kunne* slå en booking. Men at annullere en
booking betyder at skifte en **etapetilstand** med årsag og historik, og det er
`etapeskift`s arbejde. To veje ind i etapens tilstand er den "anden vej til ét
felt" beslutning 40 lukkede. Serveren svarer i stedet **hvad** der spærrer, så
turen kan flyttes først.

⚠ **Valideringen er den samme fil begge steder.** `valideOpgaveplan()` i
`fleet/opgaveplan-regler.js` står i `DELTE_FILER` og kaldes af både formularen
og funktionen. Formularen svarer *hurtigt*; serveren *afgør* — og de siger det
samme, fordi det er den samme funktion. `opgaver.js` måtte med på listen af
samme grund: kravet er transitivt.

⚠ **Ingen mail.** Mockuppens "Send bekræftelse til leverandøren" er beslutning
20, og den er fase 0: `sager/` står ikke i `firebase.rules.json`, og der er
hverken modtagevej eller afsendelse. En deaktiveret radiogruppe der sagde "ikke
bygget", ville være en attrap der opfører sig som en kontrol — formularen
skriver i stedet hvad der mangler.

**Fejl vises først når feltet er rørt** — eller når man trykker Gem, hvor de
manglende felter også navngives i én linje. ⚠ Knappen er derfor **aktiv**, også
når formularen er ugyldig: deaktiverede vi den, kunne `visAlle` aldrig udløses,
og brugeren ville se en grå knap uden at få at vide hvilke to felter der
manglede. De syv andre formularer i repoet har præcis den døde gren — de kalder
`saetVisAlle(true)` i en funktion knappen forhindrer dem i at nå. Det er en
selvstændig oprydning, men mønstret er ikke kopieret videre.

**Kasserne er forenklet:** rundt ikon øverst, ét delt **Åbn ▾** med "Åbn her" og
"Åbn i nyt vindue" i en menu. Før stod der to knapper på hvert af fem kort — ti
knapper, hvor to af dem gør næsten det samme, under et tal der skal kunne læses
på et sekund. `Delknap` ligger i `ui.jsx`.
