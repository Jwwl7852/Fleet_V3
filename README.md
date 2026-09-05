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
| **[BESLUTNINGER.md](BESLUTNINGER.md)** | De 122 beslutninger med begrundelser. Læs den før du bryder med noget |
| **[EJERKONSOL.md](EJERKONSOL.md)** | Ejerkonsollen: datamodel, funktioner og de fire beslutninger bag |
| **[ABONNEMENT.md](ABONNEMENT.md)** | Abonnementsfakturering — priser, rabat og frosne fakturagrundlag. Prismodellen er **bygget**; noden og skærmen mangler |
| **[UNITBOOKING.md](UNITBOOKING.md)** | Unitbooking-modulet: hvad prototypen indeholder, syv ting der skal afgøres først, og etaperne. **Bygget** — tilbage er mails og fotos i klik-kortet, som venter på beslutning 20 |
| **[ARKITEKTUR.md](ARKITEKTUR.md)** | Datamodellen: noder, konventioner, adgang, egress |
| **[ROLLER.md](ROLLER.md)** | Rollegennemgangen: hvad hver rolle **faktisk** kan læse og skrive. Begge sider er MÅLT — læsning mod det udrullede, skrivning i emulatoren. ⚠ Målt mod SYV roller, fra før casehandler blev konsolideret ind i koordinator (beslutning 120) — der er nu SEKS, og dokumentet selv flagger at det bør genmåles |
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

⚠ **DEV har en Storage-bucket siden Skive 4C** (`europe-west1`, Regional —
DEV er bekræftet Blaze, ikke Spark som her stod før; se ARKITEKTUR).
`storage.rules` lukker al direkte klient-SDK-adgang; fakturabilag går
gennem fire Cloud Functions med kortlivede signerede URL'er. Se
docs/security-compliance/09_FILE_STORAGE_SECURITY_GATE.md.

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
| 9 | ~~Gods/Bus gælder hele platformen~~ **Omgjort af 70** — aksen er fjernet | `fleet/AppShell.jsx` |
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
| 61 | **Tre bare nuller — to af dem havde en kilde.** `kpi.opgaver` havde fire null-felter; kun `udfoerteOpgaver` havde sin begrundelse skrevet ned. **Et null uden en grund kan ikke skelnes fra et felt nogen har glemt.** ⚠ `forsinkede` er *"skulle være færdig nu"*, ikke *"startede for sent"* — `startMs + estimeretMin` mod nu, og en opgave uden estimat tælles ikke med: den har ingen slutning at være forsinket i forhold til. ⚠ `nyeBookinger` måles fra `forrige.beregnetMs` — samme periode som deltaerne — og er **null ved første kørsel, ikke nul**. ⚠ `udenTidsfrist` bliver stående: noden har hverken feltet eller spørgsmålet, og den nærmeste udlægning tælles allerede som `uplanlagte`. **De to slags null — ingen kilde og intet spørgsmål — ser ens ud i noden og er det ikke.** ⚠ **Rækkefølgen er kontrakten:** jobbet destrukturerer `Promise.all` efter POSITION, og et opslag indsat i midten ville have givet `koeretoejer` bookingerne uden at noget fejlede | `fleet/kpi-aggregering.js`, `functions/index.js`, `scripts/provisioner-dev.mjs` |
| 62 | **Hvert null skal have en grund — og nu kræver en prøve det.** Beslutning 60 og 61 fandt det samme to gange: felter der stod som `null` uden en linje begrundelse, og hvor kilden havde ligget der hele tiden. Der var **tretten** tilbage — fem under `kunder`, otte under `oekonomi`. ⚠ **Tre slags null ligner hinanden i noden:** ingen KILDE (noden findes ikke), intet SPØRGSMÅL (definitionen mangler), ingen FORRIGE (deltaen venter på i nat). Prøven kræver ikke at man vælger den rigtige — kun at man **skriver hvilken**. Den kan ikke afgøre om begrundelsen er sand; den kan afgøre om nogen har taget stilling. ⚠ Fundet undervejs: `driftsomkostningerOere` stod med *"uden `indkoeb`"* længe efter at noden var seedet — **kilden manglede ikke, perioden gjorde**; `kunder.daekningsbidragOere` mangler sit ene led og ville give hver kunde 100 % margin; `driftstimer` er tre spørgsmål i ét navn; og `planlagtPct`/`akutPct` supplerer hinanden til 100, så **et gæt i det ene bliver til en løgn i det andet** | `fleet/kpi-aggregering.js`, `test/kpi-aggregering.test.mjs` |
| 63 | **Indkøb rangerede leverandører på opdigtede fakturaer.** `beregnNoegletal()` fik `fakturaer: DEMO_FAKTURAER` to steder — i top 5-listen og i hele performancetabellen — mens `fakturaer` er en seedet node. **Et forkert grundlag er her ikke en visningsfejl; det er en anbefaling om hvem man skal handle med.** ⚠ Dertil to navneopslag lagt som MODUL-KONSTANTER af demofilen (`ktNavn`, `lvNavn`): hos en rigtig kunde matcher de ingenting, og **en tabel med tomme navne ligner data der mangler**. Tredje gang i denne omgang. ⚠ Og registreringsformularen tilbød **demobiler og demosteder** — serveren ville afvise et valg skærmen selv havde givet, som i beslutning 55. ⚠ **Én ting bliver i demofilen med en grund:** `DEMO_LEVERANDOERSAGER`, fordi `sager/` slet ikke findes (beslutning 20 er fase 0) — et tomt array ville give hver leverandør nul reklamationer, og nul ser ud som en måling. Loftet i `demo-i-skaerm.test.mjs`: **17 → 10** | `moduler/indkoeb/Oversigt.jsx`, `Fakturaer.jsx`, `Leverandoerer.jsx` |
| 64 | **Loftet er nul — og Rute & status havde stået tom for alle.** `demo-i-skaerm.test.mjs` gik **30 → 23 → 20 → 17 → 10 → 0** over seks etaper; den er ikke længere et loft man kan pege på en undtagelse i. ⚠ **Den sidste skærm var i stykker på en måde ingen kunne se:** LiveKort filtrerede på `e.koeretoejId` — **et felt ingen etape har**. Feltet hedder `koeretoejIder` siden sættevognen kom til, og målt: **0 af 8** etaper har entalsformen. Filteret matchede ingenting, og skærmen stod tom for alle, også i demo. Det fejlede ikke; det viste bare ingenting — samme klasse som `opgaver`' indeks der navngav `dato`. **Et forkert feltnavn er tavst.** ⚠ **To sæt læses stadig direkte og tælles ikke med:** `DEMO_LEVERANDOERSAGER` og `demoHaendelser` — deres noder findes ikke, og et tomt array ville give "nul reklamationer" og "ingen meldinger", som begge ser ud som målinger. ⚠ Og syvende gang: **en underkomponent kan ikke se den ydres variable** — hvert opslag der flyttede ind i komponenten, skulle sendes med som prop | `test/demo-i-skaerm.test.mjs`, `moduler/booking/LiveKort.jsx` m.fl. |
| 65 | **Unitbookings tre tvetydige punkter — afgjort, ikke gættet.** De stod som *"ikke bygget"*, hvilket lyder som noget nogen skal nå, og var noget nogen skulle **svare** på. ⚠ **Dag/Uge/Måned:** granulariteten er en FØLGE af intervallet — 1 og 2 uger med dage, 4 uger med **ugekolonner** (fem i stedet for otteogtyve). To vælgere om tid ville tvinge brugeren til at forstå forskellen på "hvor langt" og "hvor fint". **Prisen står på skærmen:** en ugekolonne kan ikke skelne et 3-dages udlån fra et 7-dages, og det er MÅLT i en prøve. ⚠ **Ugen begynder mandag** (`getDay()` giver 0 for søndag), og **en uge er ikke 7 × 24 timer** over sommertidsskiftet. ⚠ **Filtre-knappen filtrerer RÆKKERNE** på type og undertype — samme ordliste som Kasser-skærmen. Ikke blokkene: et filter der fjernede blokke, ville lade rækken stå tom, og **en tom række ligner en ledig kasse**. ⚠ **"Inaktiv" bygges ikke:** et gitter med hundrede rækker hvoraf seks har en blok, skjuler de seks — og skærmen skriver det, for **en udeladelse man kan se, er et valg; en man ikke kan se, er en fejl** | `fleet/gitter.js`, `moduler/unitbooking/Kalender.jsx`, `UNITBOOKING.md` |
| 66 | **"Udvid til 2 skærme" var ikke en knap — det var en URL.** Planchens sidste ubyggede knap, og 6.18 havde allerede skrevet hvorfor: ruten skal kunne bære sin tilstand. ⚠ **Et nyt vindue er en ny indlæsning** — al `useState` begynder forfra, så uden URL'en ville den anden skærm åbne på fire uger fra i dag og alle kasser, mens den første stod på uge 36 grupperet på sag. **To skærme der viser hver sit er det stik modsatte af "udvid".** Visningen ligger nu i `?uger`, `?skub`, `?gruppering`, `?type`, `?undertype` — samme greb som Arbejdskøen — og giver samtidig et link man kan sende. ⚠ **Tre ting ligger IKKE i URL'en:** tenant/division/periode (de er i localStorage, og to steder kunne blive uenige), `fuld` (den initialiseres fra `?fuld=1`, men **et tastetryk skal ikke skrive i adresselinjen**), og `arter` (den skjuler ingenting, så det andet vindue viser aldrig MINDRE — den sikre retning). ⚠ `replace: true`, ellers skal man trykke tilbage ti gange for at komme ud af kalenderen. ⚠ Og knappen vises ikke i fuldskærm: **et vindue åbnet bag et overlay ser ud som om intet skete** | `moduler/unitbooking/Kalender.jsx`, `test/gitter-uge.test.mjs` |
| 67 | **Tre navne linten fandt fik en kontrol, ikke en sletning.** Beslutning 41 skrev hvorfor de ikke bare blev fjernet — *"et fjernet navn tager beviset med sig"* — men en `eslint-disable` er en **udsættelse, ikke en beslutning**, og den kan sidde i årevis. ⚠ **`booking/Oversigt.jsx`: det værste var fodnoten.** `setVisAlle` blev aldrig kaldt, så afsluttede forløb var permanent skjult — mens teksten under tabellen sagde *"Viser N af M hentede bookinger"*. **Brugeren fik at vide at der var noget han ikke kunne se, og der var ingen vej til det**; at skjule i stilhed havde været bedre. Standarden blev IKKE vendt om (listen er en arbejdsliste), og knappen siger **hvor mange** — *"Vis 3 afsluttede"* er en oplysning, *"Vis alle"* er en indstilling man ignorerer. Tallet tælles af den **genberegnede** tilstand, ikke af det gemte felt. ⚠ **`udbyder/Prisliste.jsx`:** `sidstRettet` blev regnet med en kommentar der forklarede tallet **til ingen**. Nu i kortets krop — ikke som en ny prop på det DELTE `Kort` — og teksten siger *"sidst lagt"*, ikke *"gælder fra"*: en liste kan lægges i dag og gælde fra næste kvartal. ⚠ **`Oekonomi.jsx`: her lå en rigtig fejl under.** README talte to fund; koden havde tre, og det tredje var ikke "samme mønster" — `daekningsgradPct - maalDaekningsgradPct` er `x − null = x`, altså et **null der ser ud som en måling**, og gaten i `deviation()` nås aldrig. Den var **usynlig så længe tallet ikke blev vist**. Et ubrugt navn kan altså også være et forkert regnestykke, og man finder kun det andet ved at spørge hvorfor navnet stod der. ⚠ Prøven er **tosidet**: navnet skal bruges OG dæmpningen være væk — ellers kan fundet "rettes" ved at slette navnet | `booking/Oversigt.jsx`, `udbyder/Prisliste.jsx`, `Oekonomi.jsx`, `test/linten-fandt.test.mjs` |
| 68 | **Et tal der stod fire steder var forkert tre af gangene.** Antallet af KPI-felter uden kilde: `CLAUDE.md` sagde **51**, README og kodekommentaren sagde **16**, og `udenKilde()` returnerede **17**. ⚠ **CLAUDE.md var 34 for høj** — i den fil der OVERSTYRER hvordan der arbejdes. ⚠ **Et for højt efterslæb er ikke en afrunding:** tallet er det eneste der siger hvor meget der mangler, og en opgave der ser tre gange så stor ud, bliver ikke taget. Den anden vej er lige så slem — 16 hvor der er 17 er ét felt ingen leder efter (`flaade.nedetidDeltaPoint`). ⚠ **Og fejlen var kendt:** README beskriver præcis driften et afsnit længere oppe (*"det stod på 38 længe efter at fire felter havde fået en kilde"*), og svaret dengang var at rette i hånden — derfor drev det igen. Tallet læses nu **ud af `udenKilde()`**, og en omformulering får prøven til at fejle med vilje. ⚠ **Dertil et hul der aldrig var der:** *"de GAMLE opgavers reservation"* stod som en opgave; målt på DEV er det **27 opgaver, 0 uden reservation**. **En beskrevet opgave der ikke findes, koster mere end en manglende** — den næste bygger et udfyldningsscript mod en node der er `.write: false`. Vagten er levende: løsnes `.write`, må sætningen komme tilbage | `test/kpi-efterslaeb.test.mjs`, `test/dokumentation.test.mjs`, `CLAUDE.md`, `README.md` |
| 69 | **Flåden og bemandingen ventede aldrig på data — svaret stod i beslutning 19's første sætning.** Sytten felter havde stået null med begrundelsen *"kan de deles på division?"* Det lyder som et spørgsmål om HVORDAN; det var et spørgsmål om OM, og 19 svarede nej for længe siden: *"ingen abonnent har både gods og bus … der var aldrig noget at dele op."* ⚠ **De tre udledninger blev MÅLT på DEV, ikke vurderet:** efter brugen er **død** (15 af 16 køretøjer og 29 af 35 medarbejdere har aldrig været på en etape), hjemsted er en **garage** og ikke en afdeling (Kolding har fire trækkere og en buschauffør), og arten er kun et gæt hvis man tvinger den til at være binær. ⚠ **Ni felter regnes nu** — og funktionerne tager **ingen division-parameter**, fordi en parameter der ikke kan bruges, får den næste til at tro at den kan. ⚠ **Fælderne:** en solgt bil er ikke ude af drift, en overskreden service er ikke "inden 30 dage", fraværet er en PERIODE, disponeret er PERSONER og ikke etaper, `driftPrKmOere` er en SATS (lagt sammen kunne tallet **aldrig afvige fra budgettet, fordi det ER budgettet**), og nedetid af `paaVaerksted / aktive` er et øjebliksbillede klædt ud som en periode. ⚠ **Og det der gør den større end sine ni felter:** `udenKilde()` gik 17 → 0, men **kun ni blev besvaret** — de otte flyttede ind i funktionerne. **Et efterslæb der bliver mindre af at et null flytter sig, er ikke blevet mindre.** Optællingen ligger nu på noden | `fleet/kpi-aggregering.js`, `functions/index.js`, `test/flaade-bemanding.test.mjs` |
| 70 | **Gods/Bus var ikke en akse — den var modulerne, målt to gange.** Fire beslutninger (9, 15, 19, 44), ~1260 linjer og et felt i hver transaktion, for en opdeling kunden allerede havde i sine MODULER. ⚠ **Aksen fortalte det selv, fire gange:** filteret var slået fra på **141 af 158** kaldsteder; `udenDivision: true` slog den fra for **et helt modul** (en undtagelse der er nødvendig for et helt modul, er ikke en undtagelse — det er en oplysning om at reglen er forkert); filterets vigtigste led var *"en post UDEN division hører til BEGGE"*, altså svaret man giver **når aksen ikke passer på dataene**; og demo-sættet havde en **kontrol der vogtede at de to grene var ens**. ⚠ **Tre etaper, fordi regel og data skal flytte sammen:** `kpi/<division>` var et **wildcard**, så en klient der læste et niveau højere uden reglen, ville ramme en anden regel — og regnede vi ét sæt tal mens posterne bar feltet, ville de 16 bus-indkøb blive filtreret væk **og tallet se rigtigt ud**. ⚠ **Feltet er FORBUDT, ikke fjernet:** en manglende regel ville TILLADE det, og aksen ville vende tilbage som data. ⚠ **Og det dyreste fund:** `kunder` og `etaper` validerede **kun** division, så al validering forsvandt med feltet — en kunde blev gyldig som et tomt objekt, og en pris kunne hænge på et kundeId der var tastet forkert. **Et felt der fjernes, kan være det eneste der holder noden oppe** | `firebase.rules.json`, `fleet/AppShell.jsx`, `fleet/liste.js`, `fleet/kpi-aggregering.js`, `test/division-fjernet.test.mjs` |
| 71 | **Husets navngivne fejl lå der stadig — og migreringen der skulle koste, fandtes ikke.** `bemanding.ledig` var EKSEMPLET: ni steder i koden henviser til den som *den* kendte fejl (*"et gemt afledt tal driver fra sit grundlag"*), og feltet lå i `kpi/` imens. ⚠ **Beslutning 69 lod den blive med en begrundelse der var rigtig om mekanismen og forkert om strengen:** widget-nøglen hedder `ledigKapacitet`, ikke feltnavnet — og kataloget kunne I FORVEJEN pege på en `afledt:` i stedet for et `felt:`. **Migreringen var aldrig prisen; prisen var at læse hvad der faktisk stod.** Gemte forsider er urørte. ⚠ **`Dashboard.jsx` gik uden om `kortTal()`** og slog widgets op med `kpiVaerdi(kpi, w.felt)` direkte — en afledt widget ville have tegnet en streg: **et tal der findes, vist som et der ikke gør.** ⚠ **Og etapen fandt en fejl den ikke ledte efter:** `Bemanding.jsx` regnede kapacitetsgraden råt — `48 / null` er **Infinity**, `null / 58` er **0** — mens `kapacitetsgrad()` har haft gaten hele tiden. To skærme, samme tal, to regnestykker, og den ene forkert. ⚠ **Gaten i `ledig()` havde ingen prøve:** jeg fjernede den og kørte suiten — **ingen** faldt. Samme fund som divisionsfilteret i 70. ⚠ Feltet er **fjernet, ikke sat til null**: et null ville betyde "vi prøvede og kunne ikke" | `fleet/dashboards.js`, `fleet/widgets.js`, `moduler/Dashboard.jsx`, `moduler/Bemanding.jsx`, `fleet/kpi-aggregering.js` |
| 72 | **En kunde med syv moduler og nul rækker — og en besked der sagde noget forkert.** `nordvest` stod med tre noder og ingen data, mens skærmen skrev *"en aggregering der endnu ikke er bygget"*. **Den ER bygget** — den kører hver nat og regner 44 felters værd — og beskeden stod på den skærm en ny kunde ser FØRST. ⚠ **Provisioneren tager nu `--tenant=<id>`,** og to ting er anderledes for en kunde: **ingen brugere** (DEV-konti med kendte adgangskoder hører ikke i en kundes tenant) og **seedet følger kundens moduler** — mappingen **læses ud af regelfilen**, ikke en liste nummer to. ⚠ **Og et seed må ikke OPRETTE en tenant:** `kundeopret` skriver også posten i `udbyder/kunder`, som natjobbet henter sin tenantliste fra — en seedet tenant ville få data og aldrig få nøgletal. ⚠ **En afledt post arver ikke sit modulfilter af sig selv:** første kørsel skrev **13 reservationer på etaper der ikke fandtes** (tretten enheder OPTAGET af en tur ingen kunne slå op) og en **bookingtæller på 318** hos en kunde uden bookinger. ⚠ **Og seedet fandt hullet fra 70:** elleve skrivestier satte stadig `division` — `omkostninger.js` endda ubetinget med `|| "faelles"`. **CLAUDE.mds advarsel spejlvendt: en regel der afviser noget klienten stadig skriver.** ⚠ Ni nøgletal regnet efter mod rådataene: **ni af ni stemmer** | `scripts/provisioner-dev.mjs`, `fleet/ui.jsx`, `test/seed-tenant.test.mjs` |
| 73 | **Ti skærme så i stykker ud af én manglende node — og fire havde deres data i behold.** `kpi`-noden var tom, fordi beslutning 70's oprydning slettede grenene for BEGGE tenants og kun den ene blev genskabt. ⚠ **Rapporten delte sig præcis på en linje i koden:** Dashboard/Workforce/Planning/Disponering *"tomt"* (de returnerede på `if (!k)` **før** første tabel), mens Kompetencer/Indberetninger/Servicekalender/Klima/Procure *"manglede nøgletal"* — og opførte sig rigtigt. ⚠ **Kriteriet fandtes i forvejen** i `datatilstand.js`: *"har skærmen noget under nøgletallene som den læser DIREKTE fra basen? Har den det, må den ikke blokere."* Det listede seks undtagelser; målt har Dashboard og Økonomi **0** `useListe`-kald, mens Kunder, Bemanding, Booking-oversigten og Disponering har 1, 1, 6 og 7. **Reglen var rigtig og anvendt forkert på fire af seks — den værste slags fejl at få øje på, for begrundelsen står der.** Prøven regner nu kriteriet UD af skærmene. ⚠ **Én ændring bar de fire:** `useKpi` sætter `medFuldForm({})` frem for `null` ved en tom node, så felterne skriver INTET og tabellerne tegnes. **Men en afvisning giver stadig `null`** — ingen tal oven på en permission-denied (beslutning 26) | `fleet/useKpi.js`, `fleet/datatilstand.js`, fire skærme, `test/tom-kpi.test.mjs` |
| 74 | **En selvkontrol der skulle advare om et forkert tal, gjorde Planning til en hvid side.** `demo-oekonomi.js` slog op i `DEMO_KPI[division]` efter at aksen var fjernet (70) — opslaget gav `undefined`, og `.oekonomi` på det KASTEDE. ⚠ **Kontrollen kører på MODULNIVEAU**, så undtagelsen skete mens modulet blev indlæst: hver skærm der importerer `omkostningsserie()` blev blank. ⚠ **En kontrol der skal advare, må aldrig kunne fejle hårdere end det den advarer om.** Den fandtes for at fange et forkert TAL; prisen blev en app der ikke startede. Der var **23 selvkontroller, 19 uden værn** — alle går nu gennem `selvkontrol()`, som fanger og **advarer om sig selv** (et tavst catch ville gøre en kontrol der er holdt op med at virke, til en ingen savner). Efterprøvet med en `null.kaster()`. ⚠ **Og fejlen kom fra et sted prøverne ikke kigger:** `import.meta.env?.DEV` er falsk under node, så kontrollerne kører aldrig i suiten. 2335 prøver var grønne. Prøven kan derfor kun kræve **vejen**, ikke resultatet. ⚠ Dertil tre døde kontroller der advarede om at `division` MANGLEDE — vendt om — og en tekst der pegede på afdelingsvælgeren, som blev fjernet i 70 | `fleet/selvkontrol.js`, 20 demo-filer, `test/demo-kilder.test.mjs` |
| 75 | **Faldet fra beslutning 70, gennemgået frem for afventet.** Aksefjernelsen havde produceret fejl tre gange (72, 72, 74) — tre gange er et mønster, ikke uheld. ⚠ **`Planlaegdialog` tegnede en PÅKRÆVET "Division"-vælger** til et felt reglerne afviser, og som hverken valideringen eller skrivningen kendte. **En formular er det sted en beslutning bliver til noget nogen taster** — et felt der overlever dér, er dyrere end et i en kommentar. ⚠ **Fire selvkontroller kom frem da `selvkontrol()` holdt op med at lade dem kaste:** to advarede FALSK ved hver indlæsning (`inden30 !== undefined` er altid sandt), to var tavst døde. Dertil `demo-etaper` med otte falske pr. indlæsning, og `demo-facility` der krævede en lokation på et besøg hvor den er VALGFRI — fem falske, hele tiden. **Konsollen gik fra 24 advarsler, mest forkerte, til 11 der alle siger noget: støj lærer folk at lade være med at læse.** ⚠ **Demo-tallene var stadig gods-halvdelen** for bemanding, indkøb og kunder — lagt sammen, **undtagen `underbemandede`**, som er AFLEDT og regnes af det samlede grundlag: 6+2 gav 8, planen giver 7. ⚠ Og en genvej der beholdt den gamle FORM (`div = "alle"` → `DEMO_KPI["alle"]`) **arvede den gamle fejl** | `fleet/Planlaegdialog.jsx`, seks demo-filer, `fleet/demo-kpi.js` |
| 76 | **En disponent kunne aldrig sende et forslag — og det virkede i demo.** `kanSkifteEtape()` talte med `post.forslag?.length > 0`, men forslagene er NØGLET på deres eget id i noden (beslutning 58): `.length` er `undefined`, og `undefined > 0` er falsk. **Tre forslag på etapen gav *"Der skal være mindst ét forslag."*** Tre overgange var lukkede i produktion. ⚠ **Demo-sættet bærer dem som en ARRAY**, så fejlen var usynlig præcis dér hvor man leder. ⚠ **Og den ramte serveren:** `etapeskift` kalder samme funktion på nodeform — skærm og server var ENIGE, og begge tog fejl. Enighed er ikke rigtighed. ⚠ **Fælden stod skrevet ned ordret i 58** (*"Brug forslagListe(); den er det ene sted formen oversættes"*) — **en regel man har skrevet ned, er ikke en regel man har håndhævet**, så prøven forbyder MØNSTRET og ikke de fem forekomster. ⚠ Dertil tre kontroller der kiggede forkert (`demo-bookinger` spurgte om en booking med et forslag — flyttet til etapen i 40; `demo-facility` kaldte `zonePar()` uden argumenter, så 16,90 blev til null; `demo-indberetninger` manglede to TOMME poster, uden hvilke man kan læse af hængelåsen at der skete en skade) og ét ægte datafund: `et-006` var reserveret på en bil på værksted. ⚠ Og prøven råbte først ad den rigtige kode — **en prøve der råber ad det korrekte, bliver slået fra** | `fleet/booking-state.js`, `test/forslagform.test.mjs`, fire demo-filer |
| 77 | **Statusfarverne stod under AA på hver eneste skærm.** Beslutning 47 satte metoden — *mål skærmen, bedøm den ikke* — men regnestykket blev lavet i hånden, én gang, på de par man kom i tanke om. Målt på **hvert par der faktisk bruges sammen** lå **otte** under kravet. ⚠ **De seks værste er ORDENE:** `.fc-pill-ok` sætter statusfarven som `color`, ikke som en prik — "Udført", "Forsinket", "Afventer" ER farven, og de stod på **3,1–4,1:1** mod AA's 4,5. Det er den tekst en disponent scanner ned gennem syvogtyve rækker. ⚠ **Kuløren er bevaret, kun lyset skruet ned** — til den MINDSTE værdi der når kravet mod BEGGE flader, fundet trin for trin frem for valgt fordi den så rigtig ud. ⚠ **Ikonerne har en ANDEN grænse:** 3:1 for et ikke-tekstligt element, ikke 4,5. Gul lå på **1,80:1** — den værste måling i paletten. ⚠ **Og rangbadgen kunne ikke reddes ved at flytte et token:** hvid tekst fejler på gul (2,00:1), mørk tekst fejler på rød — **ingen tekstfarve klarer alle tre**. At mørkne paletten til 4,5 ville gøre gul til brun på hvert KPI-kort **for to skærmes skyld**; badgen bruger nu den bløde flade med brødtekst (9,2–9,7:1). ⚠ **Og fladen er en color-mix AF farven selv**, så den mørkner MED: første forsøg regnede mod den gamle flade og landede på 2,98 — under kravet, efter en rettelse der skulle nå det. **Målingen fangede min egen rettelse** | `fleet/fleet.css`, `test/kontrast.test.mjs`, `test/design-tokens.test.mjs` |
| 78 | **Procures plancher viser en proces der ikke fandtes.** Femtrinsoverskriften — Behov → Bestilling → Godkendelse → Faktura → Afstemning — og **trin 1–3 fandtes ikke som noget som helst**: `indkoeb`-noden er LINJER der allerede er købt, altså en registrering bagud. ⚠ **Og varelageret var jeg ved at få galt fat i:** jeg foreslog at fjerne det fra menuen, fordi `varer` tilhører `warehouse`. Kunden rettede — **Warehouses varer er KUNDERNES gods (3PL), Procures er vores eget** — og koden sagde det i forvejen i `Varer.jsx`. Procures varelager får sin egen node, `forbrugsvarer`, med beholdning afledt af bevægelser (39). ⚠ **Etape 1:** `indkoebsbehov` og `indkoebsordrer`, begge `.write: false` — vejen er lukket, ikke retten, fordi et behov der bliver til en ordre ændrer TO poster. Nummerserien `BST-ÅÅÅÅ-NNNNN` på en tæller, ikke en optælling (8). ⚠ **Reglerne kunne SLET IKKE indlæses:** `toInt()` findes ikke i RTDB, og emulatoren sagde det i første kørsel — den fejl der engang overlevede i månedsvis fordi ingen kørte reglerne. ⚠ **Og seks prøver målte ingenting mens de så grundige ud:** `withSecurityRulesDisabled` slår også `.validate` fra. **På en node med `.write: false` kan en regelprøve kun måle at vejen er lukket** — formen hører i `valideBehov()`/`valideOrdre()`, som CLAUDE.md havde skrevet ned om `opgaver` i forvejen | `firebase.rules.json`, `fleet/procure.js`, `test/procure.test.mjs`, `test/rules.procure.test.mjs` |
| 79 | **Serveren skrev stadig et felt reglerne forbyder — og ingenting sagde fra.** Fire Cloud Functions satte `division` efter beslutning 70, og `grundlagskriv` gjorde det **ubetinget** med `|| "faelles"`. ⚠ **Det er den farligste udgave:** admin-SDK'et går uden om ALLE regler, også `.validate`. En klient får en `permission-denied` og opdager det; **en funktion får ingenting**, og feltet lander i noden i tavshed. ⚠ Dertil tre læsere i skærmene — `Disponering` tegnede en **"Division"-etiket med en tom værdi**, `LiveKort` skrev **"Ture i gods"** af en konstant og ikke af et valg — og alle tre læste `FleetContext`'s `const division = "gods"`, som jeg lod stå i 70's etape 1 fordi feltet dengang var påkrævet. **En værdi ingen læser, er en akse der ligger og venter.** ⚠ **Og prøven holdt liv i den:** den krævede at konstanten fandtes, med noten *"men kun indtil etape 3"*. Etape 3 kørte; kommentaren blev ikke læst, og **prøven stod grøn om noget der var færdigt**. En prøve der beskriver et mellemstadie, skal selv kunne se at det er ovre. ⚠ Og min vagt faldt på **sin egen forklaring** — femte gang den fælde dukker op: en prøve der læser kilde som tekst, skal strimle kommentarer først | `functions/index.js`, `fleet/FleetContext.jsx`, `fleet/audit-regler.js`, `test/division-fjernet.test.mjs` |
| 80 | **Behovet melder sig ind — Procures trin 1.** `behovskriv`, indbakken grupperet på kilde, og indmeldingen ved siden af. ⚠ **Responsiv, ikke en app:** `auto-fit` med et minimum, samme greb som `.fc-kpis`, så spalterne klapper sammen uden en media query. ⚠ **Antallet er VALGFRIT, og det er en beslutning** — den der melder ind, ved hvad han mangler, ikke hvor mange der er i en pakke, og **et gættet antal ville gå med i en bestilling**. Det trækker tre ting med: skærmen skriver `—` og ikke `0`, feltet sendes som `undefined` fordi **`Number("") === 0`**, og `behovTilLinje()` kaster frem for at gætte 1. ⚠ **Et afvist behov slettes ikke** — uden grunden er afvisningen en tavshed, og den samme mangel meldes ind igen i næste uge. ⚠ **Og linten henførte sættet forkert:** den tog det FØRSTE navnematch, så `DEMO_INDKOEBSBEHOV` blev henført til `indkoeb` — det ramte i samme øjeblik noden blev født, og ville ramme igen for `indkoebsordrer`. Længste match vinder nu. ⚠ **Skærmen viste nul, og det var rigtigt:** noden fandtes og var tom, og demo-sættet er kun en faldbakke når der ingen database er (56, 64). Den manglede et seed | `functions/index.js`, `fleet/behov.js`, `moduler/indkoeb/Behov.jsx`, `fleet/demo-procure.js` |
| 81 | **Bestillingen samles — Procures trin 2.** Kladden med automatisk leverandørforslag, `ordreskriv`, og e-mailudkastet. ⚠ **Forslaget er et OPSLAG, ikke en anbefaling:** hvem har leveret præcis den vare før, og hvad kostede den. Findes svaret ikke, er svaret `null` — planchen har en egen tilstand for det, og den findes fordi svaret findes. ⚠ **Senest, ikke billigst** — en pris fra 2019 er ikke et tilbud. ⚠ **Varenummeret slår navnet, og forslaget siger hvilket:** et navnetræf kan være to varer med samme ord, og to lige stærke formuleringer ville gøre den svage til den stærke. ⚠ **Én ordre pr. leverandør** — et nummer der dækkede flere, kunne ikke bruges som reference på nogen af fakturaerne. ⚠ **Serveren bygger linjen af BEHOVET**, og ordren og behovenes tilstand lander i én `update()`. ⚠ **Udkastet sendes ikke, og skærmen siger det** — en knap der lagde mailen i en kø der ikke findes, er værre end ingen knap. ⚠ **Og demo-sættet kunne ikke vise sin egen funktion:** ingen af de ti åbne behov matchede en indkøbslinje, så hver linje viste "Leverandør mangler". Et demo-sæt hvor en funktion kun kan ses *fejle*, er ikke et demo-sæt | `fleet/procure.js`, `fleet/bestilling.js`, `moduler/indkoeb/Bestillinger.jsx`, `functions/index.js`, `scripts/provisioner-dev.mjs` |
| 82 | **Godkendelsen — Procures trin 3.** Beløbsgrænse, kø og `indkoeb.godkend`. ⚠ **Reglen kan slås FRA, og det er en funktion** — kunden bad om det, og standarden er fra, så en eksisterende kunde ikke får en kø han ikke har bedt om. ⚠ **Men den der rammer loftet, må ikke kunne hæve det:** `godkendelsesregelskriv` kræver `brugere.skriv`, ikke `indkoeb.skriv`, og `ordrestatus` læser grænsen af NODEN — kom den ind udefra, var tjekket omgået i ét hop. ⚠ **`indkoeb.godkend` var planlagt, ikke glemt** — `PERM_GODKEND_MIDLERTIDIG` er væk. ⚠ **Nul er ikke "slået fra":** en aktiv regel uden grænse spærrer ALT (fejler lukket), for 0 og uendelig ser begge ud som "slået til" og er hinandens modsætning. ⚠ **Godkendt automatisk er ikke godkendt** — under grænsen får ordren `godkendtAutomatisk: true` og INTET `godkendtAf`; et uid dér ville påstå at en person kiggede. ⚠ **Godkenderen må godkende sit eget** — ellers var hans egne ordrer en blindgyde — men det markeres. ⚠ **Og to felter landede i `grundlag` i stedet for `indkoebsordrer`:** `godkendtAf`/`godkendtMs` står i begge noder, så ankret fandtes to steder. Et anker der findes to steder, er ikke et anker | `fleet/procure.js`, `fleet/godkendelse.js`, `moduler/indkoeb/Godkendelser.jsx`, `functions/index.js`, `firebase.rules.json`, `scripts/provisioner-dev.mjs` |
| 83 | **Fakturaen finder sin bestilling — Procures trin 4.** Match, godkendelse og kontantkøb. ⚠ **Scoren er en påstand om sikkerhed:** den regnes af navngivne signaler, skærmen viser HVILKE der slog til, og **kun et bestillingsnummer giver 100 %** — alt andet er en slutning, og en slutning må ikke se ud som en kendsgerning ved siden af en Bekræft-knap. ⚠ **Scoren gemmes ikke** — afgørelsen gør. ⚠ **En anden leverandørs ordre foreslås aldrig:** beløb + dato alene gav 55 %, og et forslag over halvdelen bliver bekræftet for at komme videre. ⚠ **Planchen sammenlignede INKL. moms med EKSKL. moms** — det samme tal med to mærkater, 25 % ved siden af, systematisk. ⚠ **Et kontantkøb er en `indkoeb`-linje, ikke en node ved siden af** (etapeplanen sagde en node; det blev omgjort): en egen node ville være den samme kendsgerning to steder, og hvert beløb i modulet skulle huske at lægge dem sammen. **Betalingsformen er et felt, ikke en status** — "kontant" i `fakturastatus` ville lade købet vente på en faktura der aldrig kommer. ⚠ **Og ankret fandtes to steder igen** — `indkoebId` står i både `grundlag` og `fakturaer`; patchen tæller nu træffene og nægter at skrive | `fleet/procure.js`, `fleet/faktura.js`, `moduler/indkoeb/Fakturaer.jsx`, `functions/index.js`, `firebase.rules.json` |
| 84 | **Overblikket — Procures femte skærm, og hvad den afslørede.** Procesbånd, fem kort og indbakken. ⚠ **Fire tal regnes af listerne** (undtagelsen i CLAUDE.md), og "kræver handling" er ikke "findes" — et bestilt behov ligger på en ordre. ⚠ **Det femte kan ikke regnes:** `forbrugsvarer` findes ikke, og Warehouses lager er KUNDENS gods — et tal derfra ville bede os bestille noget en kunde mangler. `null` med sin grund; efterslæbet 44 → 45. ⚠ **Planchen viste to tal to gange** — bunden er derfor genveje uden tal. ⚠ **Og det nye kort afslørede et nul der var løgn:** `ordnPaa: "dato"` på en node hvis datofelt hedder `fakturadatoMs`. RTDB fejler ikke — listen kom hjem TOM, og "0 uden match" ser ud som en afstemning der går op. ⚠ **Divisionsaksen levede i skærmene: 77 forekomster i 17 modulfiler.** Værst et **påkrævet** Division-felt på en node hvis regel FORBYDER feltet — vejen ind var lukket i begge retninger, og linten kiggede aldrig i `src/moduler/`. Procure ryddet (−26), resten står som et loft der kun må gå ned | `moduler/indkoeb/Oversigt.jsx`, `fleet/kpi-aggregering.js`, `test/division-fjernet.test.mjs`, `test/overblik.test.mjs` |
| 85 | **Varelageret — fjerde gang et lagernavn skal skilles fra et andet.** `forbrugsvarer` er VORES egne handsker og strækfilm; `varer` er Warehouses **kundegods** med påkrævet `kundeId`, `lagre` er reservedelslageret, og `warehouse` er reserveret. Alternativet — at regne kortet af Warehouse — ville bede os bestille noget en KUNDE mangler. ⚠ **Retningen kommer af ARTEN, ikke af et fortegn:** fire arter, altid positivt antal — et minus på et forbrug ville trække to gange. ⚠ **En optælling SÆTTER**, den lægger ikke til; uden den art skal den der tæller, regne forskellen i hovedet, og en fejl dér ser bagefter ud som svind. ⚠ **En negativ beholdning spærres ikke** — det skete jo, og en afvisning ville lade den rigtige hændelse gå tabt for at beskytte et tal der allerede var galt. ⚠ **Rækken og tallet i én `update()`** (39), men driften mellem dem vises på skærmen (71). ⚠ **Minimum er valgfrit, og manglen tælles** — "0 under minimum" betyder ellers både "fyldt op" og "ingen grænse". ⚠ **Og tre warehouse-prøver ankrede på hele regelfilen** og målte den forkerte node | `fleet/forbrugsvarer.js`, `fleet/varelager.js`, `moduler/indkoeb/Varelager.jsx`, `functions/index.js`, `firebase.rules.json` |
| 86 | **Fakturacenteret — ét sted, én sandhed.** Alle fakturaer ind ét sted; systemet foreslår destinationen. ⚠ **Ingen ny node** — `fakturaer/` ER den fælles node, og regelfilen sagde hvorfor: den har med vilje ingen modulklausul. ⚠ **Men noden er fælles og skærmen er ikke:** `oekonomi` ER et modul (målt, ikke antaget — min første prøve påstod det modsatte). En kunde uden Økonomi ser stadig sine fakturaer gennem Procures linse; det han mangler, er den TVÆRGÅENDE visning. ⚠ **`ordreId` var ét moduls svar på et fælles spørgsmål** → `destinationArt` + `destinationId`. Flade felter, fordi `.indexOn` kun kan pege på et direkte barn. Målt: 20 fakturaer, alle seedede — billigt nu, dyrt senere. Og `ordreId` betød i forvejen TO ting (indkøbsordre og **plukordre**). ⚠ **Ingen warehouse-destination:** 3PL er kundens gods, som VI fakturerer for — der kommer ingen leverandørfaktura ind på den forretning. Arten hedder `lager`. ⚠ **Kun et nummer giver 100 %**, og bilen genkendes på kaldenavn/plade — ikke på vores id, som leverandøren aldrig har set. ⚠ **Og et filnavn er ikke en placering:** `flaade/Oversigt.jsx` er trods navnet Opsætning → Enheder | `fleet/fakturacenter.js`, `moduler/oekonomi/Fakturacenter.jsx`, `fleet/Modulfakturaer.jsx`, `functions/index.js`, `firebase.rules.json` |
| 87 | **Divisionsefterslæbet — aksen levede i skærmene, ikke i reglerne.** 70 fjernede aksen, 79 tog resten i shellen og reglerne, og to prøvefiler var grønne hele vejen — **fordi ingen af dem læste `src/moduler/`**. En lint der springer noget over, siger ikke nej; den siger ingenting (2. gang, jf. 56). ⚠ **Og det var ikke kosmetik:** `facility/Servicedialog.jsx` havde et **påkrævet** Division-felt på `opgaver`, hvis regel har `.validate: false` på feltet — **servicebesøg kunne ikke oprettes**, i begge retninger. Opsætning → Generelt havde et kort der sagde **"Divisioner: Gods og bus"** til kunden. Fire filtre sammenlignede `x.division === division`, hvor **begge sider var `undefined`** — en no-op der så ud som en afgrænsning. `Kunder.jsx` skrev altid "i godsafdelingen". Værkstedskalenderen sendte `&division=undefined` i en URL ingen læste. To navne løj: `iDivision`, `opgaverIDivision`. ⚠ **Loftet er nu et forbud** — nul levende forekomster, med én undtagelse for de syv sætninger der forklarer at feltet ikke findes (en prøve der råber ad det korrekte, bliver slået fra). Dertil: **ingen skærm må destrukturere `division` ud af `useFleet()`** — det havde alle seks fund til fælles, og **en destrukturering af et felt der ikke findes, er tavs**. ⚠ **"Moduler: 0" var tredje gang** en manglende `moduler`-node blev læst som INGEN i stedet for ALLE (56, 86, 87) — set på skærmen, ikke i koden. ⚠ **Og jeg slettede for meget:** patchens anker spændte til filens sidste `});` og åd de ti oprindelige prøver; genskabt fra git | 14 modulskærme, `test/division-fjernet.test.mjs` |
| 88 | **Status-afsnittet — et tal ingen prøve holder, driver.** README's Status er dét afsnit dokumentet selv beder én læse efter en pause. Det stod med **957 tests** da der var 2619, og med **27 af 30 skærme** da der var 54 — og overskriften og tabellen to linjer under den var uenige med hinanden, 27 mod 29. ⚠ **Ingen af tallene var løgn da de blev skrevet.** De blev det af at produktet voksede: Warehouse med elleve skærme, Unitbooking med fire, Procure med fire nye. **Et tal skrevet i hånden kan kun blive forkert.** ⚠ **Samme fejlklasse som 52**, som er grunden til at `dokumentation.test.mjs` findes: en drevet tabel sagde at en spærring MANGLEDE, og derfor kiggede ingen på om den virkede. Den fil vogtede tabellen; tallene ved siden af var uvogtede. ⚠ **`statustal.test.mjs` læser nu skærmtallet ud af `nav.js`** — det ene sted en rute kan opstå — og prøvefiltallet ud af `test/`, og kræver at hver række, totalen OG overskriften siger det samme. ⚠ **Det samlede prøvetal står der ikke længere:** det kan kun måles ved at KØRE suiten, og **en prøve kan ikke tælle sig selv**. ⚠ **Og tre lag backslash forsvandt undervejs** — `\|` → `|` → `|`, og `/*/g` → `/*/g`. Tabellen læses nu med `split("|")`, og filen er skrevet direkte frem for genereret | `README.md`, `test/statustal.test.mjs` |
| 89 | **Abonnementshistorikken — og et dokument der modsagde sig selv.** `tenants/<id>/abonnementHistorik`, append-only, skrevet af fire funktioner i SAMME opdatering som ændringen. ⚠ **Første fund var ikke kode:** ABONNEMENT.md sagde begge dele om noden — afsnit 6 kaldte den hastende, afsnit 7 skrev at den var **droppet**. ⚠ **Afsnit 7 havde ret om sit eget:** regningen tælles i `udbyder/maalinger`, som kom EFTER afsnit 2 blev skrevet. To kilder til ét dagsantal driver — `bemanding.ledig` med penge på. ⚠ **Men den lukkede et spørgsmål den ikke havde stillet:** *"auditloggen svarer på hvem"*. Målt: `kundemoduler` skriver kun de FRAVALGTE i en note på 120 tegn, rabatten står som fri tekst uden et "før", og retention er 24 mdr. mod bogføringens fem år. ⚠ **Derfor: hvem, hvad, før, efter og hvorfor — aldrig et dagsantal**, og en prøve forbyder generatoren at læse den. ⚠ **`rabat` er tredje art og stod ikke i forslaget:** `linjerForPeriode()` får ÉN `rabatBps` for hele perioden, så **en rabat sat den 20. prissætter også de nitten dage der er gået** — i tavshed. ⚠ **Posterne udledes af FORSKELLEN, ikke af kaldet** — konsollen gemmer hele modulsættet hver gang, og en log fuld af hændelser der ikke skete, kan ikke forklare en regning. ⚠ **Kun udbyderen læser den:** `aarsag` står i posten, og *"hvorfor han er lukket, hører i en samtale"*. Niende regel med udbyder-claim'et. ⚠ **Og en rod-opdatering er et `set()` på hver af sine nøgler** — `tenants/<id>/abonnement` som nøgle ville tørre rabatten væk, samme fælde som filen allerede advarede om én etage nede | `fleet/abonnement.js`, `functions/index.js`, `firebase.rules.json`, `moduler/udbyder/Konsol.jsx` |
| 90 | **Hallen og porten er ét rum — indeslutningen.** `reservationFraOpgave()` har siden 51 båret sætningen *"lukker man hallen, er alle porte i den også optaget"* — og datamodellen håndhævede den ikke. En reservation på `lokation/lok-halb` og en på `facilityAktiv/fa-port3` er to STIER, og `tjekLedigMod()` ser kun én ad gangen: to håndværkere kunne bookes ind i samme rum. ⚠ **`indeslutninger()` + `tjekLedigIndesluttet()`** i den delte `reservations.js`, brugt af `facilityplanlaeg` OG `opgaveflyt`. ⚠ **Begge veje** — var den kun den ene, ville rækkefølgen afgøre udfaldet. ⚠ **Ingen kaskade mellem søskende:** port 3 spærrer ikke port 5, ellers lukkede ét besøg et helt anlægsområde. ⚠ **Og ingen reservation pr. port:** det er KONTROLLEN der er udvidet, ikke posterne — N poster for ét arbejde ville drive fra hinanden første gang én blev flyttet. ⚠ **Konflikten siger hvor den kom fra** (`viaRessourceId`): *"Ressourcen er optaget"* på en port der står tom, er ubrugelig. ⚠ **Og `kanOverskrive` kræver dem alle** — ellers rydder en tving det ene og efterlader det andet. ⚠ **Skærmen tegner hallens blok som en SKYGGE** på de porte den lukker, i samme liste som `ledigeVinduer()` regner af — ét regnestykke, to visninger. ⚠ **`tjekDisponering()` fik den ikke, og det er MÅLT:** en etape binder kun `koeretoej` og `medarbejder`, som ingen indeslutning har. Et kald dér ville være en no-op der lignede dækning. ⚠ **To prøver holdt den gamle form i live** — én krævede ordret `tjekLedigMod(`, én krævede PRÆCIS én sti under `reservationer/`. **En prøve der tæller, siger nej til en udvidelse den ikke har en mening om** | `fleet/reservations.js`, `functions/index.js`, `facility/Servicekalender.jsx`, `test/indeslutning.test.mjs` |
| 91 | **En andel af et udsnit er ikke en andel.** `beregnNoegletal()` rangerer leverandører, og to af de seks tal var forkerte på hver sin usynlige måde. ⚠ **Andelen blev regnet af et hentet vindue** — `vindueDage: 400, graense: 500` — så en afkortet liste gav *en total ud af et udsnit* (beslutning 6). **Grundlaget afslørede det ikke, fordi det tælles på TÆLLEREN:** en liste med kun én leverandør gav **100 %** med et grundlag der så tilstrækkeligt ud. ⚠ **Og begge skærme HAVDE oplysningen** — `useListe` svarer `afkortet`, og Indkøbsoversigten skriver den endda ud under tabellen, og sendte så den samme liste ind som nævner. Den sande oplysning lå ét felt væk fra det forkerte tal. ⚠ **Svartiden lånte et demo-datasæt** ved siden af kundens rigtige indkøb, med begrundelsen *"et tomt array ville vise nul reklamationer"* — **og den præmis holder ikke:** `maal(0, 0)` giver `null`, ikke nul. En undtagelse der hvilede på en påstand ingen havde prøvet. **"Der er ingen node" er ikke i sig selv en grund til opdigtede tal** — grunden skal være at der ingen DATABASE er (26). Listen går fra to sæt til ét. ⚠ **Og "for lidt grundlag" stod i hvert eneste tomme felt.** Der er TRE grunde — *for lidt*, *et udsnit*, *ingen kilde* — og de peger på hver sin handling: vent, hent bredere, byg noden. `MAALING_AARSAG` ét sted, og en prøve kræver at hvert tal uden værdi bærer en kendt grund | `fleet/leverandoerer.js`, `moduler/indkoeb/Leverandoerer.jsx`, `Oversigt.jsx` |
| 92 | **Reservationer var bookingens — og låste en kunde ude af sine egne data.** `NODE_MODUL` sagde `reservationer: "booking"`, og reglen håndhævede det. Men noden er hele pointen i **beslutning 4**: booking, værksted, facility-sag og fravær skriver til den SAMME node, så de fire kan se hinanden. ⚠ **Målt på DEV-kunden `nordvest`** (Fleet, Facility, Bemanding, Procure — ingen Planning): **37 reservationer, og ikke én fra en booking** — 18 værksted, 9 facility-sag, 10 fravær, **alle låst for ham**. ⚠ **Og systemet skrev dem for ham:** de fire veje ind i `opgaver` skriver opgaven OG dens reservation med admin-SDK, som går uden om reglerne. Han kunne oprette et værkstedsbesøg og aldrig se det igen — beslutning 45 spejlvendt. ⚠ **Fundet ved at spørge basen, ikke ved at læse tabellen:** et script gik hver node i `NODE_MODUL` igennem og spurgte om tenanten havde DATA i en node hans moduler ikke ejer. Svaret var én. Noden flytter i **basen** hos `opgaver`, `satser` og `fakturaer` — tre var fire. ⚠ **Og målingen fandt to referencer der pegede på ingenting:** `materialelinjer.lagerId = "lager-hoved"` (lagrene hedder `lag-*`) og `ind-006.indkoebId = "ink-2026-0844"` (linjerne hedder `il-*`) — **tre id-konventioner for to noder**, begge seedet ud. **51 af 72 referencefelter i regelfilen har et eksistenstjek; 21 har ikke**, og `demo-referencer.test.mjs` kræver nu at hvert `*Id` i et seedet sæt enten rammer en post eller står med en grund | `fleet/moduler.js`, `firebase.rules.json`, `test/demo-referencer.test.mjs`, `demo-indberetninger.js` |
| 93 | **Et modul der ikke kan virke alene, sælges ikke alene.** `kundemoduler` tog imod enhver kombination af kendte moduler — og **Planning uden Kunder er umulig**, ikke forbudt: `bookinger` har et PÅKRÆVET `kundeId`, og modulklausulen lukker `kunder` for en kunde der ikke har modulet. Han kan ikke oprette én eneste booking, og det ville først vise sig hos ham. ⚠ **Kravene er UDLEDT af regelfilen, ikke skrevet af:** et modul M kræver N, hvis en node M ejer har et påkrævet felt der peger på en node N ejer. Svaret er to — `booking → kunder` og `warehouse → kunder` (`varer`, `enheder`, `plukordrer` har alle et påkrævet `kundeId`). ⚠ **Og et felt prøven ikke kender, kan skjule et krav** — den kræver at hvert påkrævet `*Id` har en kendt målnode, og fandt straks `plukordrer.afsendCarrierId`. ⚠ **Delt ejerskab er ikke et krav:** `reolpladser` ejes af BÅDE unitbooking og warehouse, og første udgave læste det som *"unitbooking kræver warehouse"* — et krav der ville have kostet kunden et modul han ikke skal bruge. ⚠ **Der tilføjes ikke automatisk:** at slå `kunder` til for ham ville enten forære et modul væk eller fakturere for noget han ikke bad om. Serveren AFVISER, i **begge** veje ind, og siger hvad der mangler. ⚠ **Det er ikke nav-punkternes `kraeverModul`**, som skjuler et menupunkt — en skjult menu ville bare gøre et ubrugeligt modul usynligt. ⚠ **Målt før håndhævelsen:** ingen tenant bryder kravet, så ingen blev låst ude bagfra. Fundet undervejs: **36 steder** hvor en skærm læser en node et andet modul ejer — de fleste er legitime, og **reglerne er den eneste kilde der kan skelne** en afhængighed fra en pyntedetalje | `fleet/moduler.js`, `functions/index.js`, `moduler/udbyder/Konsol.jsx`, `test/modulkrav.test.mjs` |
| 94 | **Mekanismen var bygget og blev brugt 6 steder ud af 36.** `useListe` bar fra begyndelsen sætningen om at en node spærret af et fravalgt modul ikke skal spørges — og `hent: false` var bygget til netop det. Målt: **36 steder hvor en skærm læser en node et andet modul ejer, 6 med vagten.** En kunde med Fleet men uden Procure fik en `permission-denied` på `leverandoerer` hver gang han åbnede Arbejdskøen. ⚠ **Beslutning 44 siger hvorfor:** *"hver sideindlæsning ville udløse en håndfuld permission-denied, og en afvisning skal betyde noget"* — `useKpi()` løste det allerede med `laesbareDomaener()`. ⚠ **Og værre end støj:** med `auditerSom` sat skrev hver afvisning en **auditpost om nægtet adgang**. En log fuld af hændelser der ikke er hændelser, gør den rigtige umulig at finde. ⚠ **Rettelsen ligger ÉT sted** — i hooken, ikke på 30 kaldsteder: **et krav der skal huskes 30 gange, bliver glemt 30 gange.** Og den spørger SLET IKKE frem for at fange afvisningen bagefter; en fanget afvisning har allerede kostet forespørgslen og auditposten. ⚠ **Opslaget følger STIEN:** skærmene læser `facility/lokationer`, tabellen har `facility` — kun det fulde navn ville gøre halvdelen af Facility til en base-node. Længste træffer vinder, så `sensitive/indberetninger` ikke afgøres af `sensitive`. ⚠ **Basen svarer `null`, ikke `[]`** — en tom liste ville betyde "ejet af ingen moduler", altså aldrig læsbar. ⚠ Og fjerde gang: **en manglende `moduler`-node betyder ALLE** (56, 86, 87, 94) | `fleet/useListe.js`, `fleet/moduler.js`, `test/modulopslag.test.mjs` |
| 95 | **En tom liste fordi modulet mangler, er ikke en tom liste.** 94 fik `useListe` til at holde op med at spørge om modulspærrede noder — rigtigt — **men listen blev tom, og tom er tvetydigt.** `leverandoerNavn()` slog op i den og skrev **"ukendt leverandør (lv-hydra)"** på hver værkstedsopgave hos en kunde uden Procure: en påstand om at hans data er i stykker, fremsat af et opslag der aldrig havde noget at slå op i. ⚠ **Funktionens egen begrundelse var rigtig og gjaldt ikke her:** *"et id der ikke kan slås op, er en fejl i data"* — sandt når vi HAR kartoteket, meningsløst når vi ikke har spurgt. ⚠ **Reglen: et opslag i en TOM liste er ikke et mislykket opslag.** Tom liste → id'et råt; liste med rækker og intet træf → stadig en anklage, for så havde vi kartoteket. ⚠ **`TILSTAND.modulMangler` siger hvorfor.** Den er **ikke** `naegtet` — en afvisning betyder at nogen skal se på rettighederne, et manglende modul at nogen skal ringe til os. ⚠ **Den blokerer aldrig en skærm:** noden hører sjældent til skærmens eget modul, og blokerede den, ville en kunde uden Procure miste hele sin Fleet-arbejdskø fordi et leverandørnavn ikke kunne slås op — `ikkeAggregeret`-fælden om igen. Men den vejer tungere end `ok` i `vaerste()`, og lettere end `naegtet`. Og den viser **aldrig** demo-data. ⚠ **Teksten nævner modulet ved NAVN** — kunden skal kunne sige hvilket når han ringer — og har **ingen genprøv-knap**: der er intet at prøve igen. ⚠ **Lærestregen: rettelser flytter fejl.** 94 fjernede en afvisning og en auditpost og skabte en tom liste, som blev til en anklage ét lag længere ude. **Spørg hvad der står i stedet**, hver gang noget holder op med at fejle | `fleet/datatilstand.js`, `fleet/useListe.js`, `fleet/leverandoerer.js`, `fleet/ui.jsx` |
| 96 | **Tretten nøgletalskort påstod en total de ikke havde.** Beslutning 6 navngav fejlen — *en total ud af et udsnit* — og 91 fandt den ét sted. Målt bredt: **13 KpiKort** talte en liste med `graense` op og satte tallet frem som en kendsgerning om virksomheden: *"Varer i alt"*, *"Udlån i alt"*, *"Kasser i alt"*. ⚠ **Værst stod der `note="hele historikken"`** under et tal talt op af en liste med loft på **1000** — ikke bare forkert, men en forsikring om præcis det der ikke gjaldt. ⚠ **Oplysningen fandtes allerede:** `useListe` har altid svaret `afkortet`, og dens eget hoved siger *"skriv det til brugeren — tavs afkortning opdages først når nogen spørger hvorfor en booking mangler"*. Tredje gang i træk at rettelsen består i at BRUGE et svar der lå ét felt væk (91, 94, 96). ⚠ **`mindst(n, afkortet)`: en nedre grænse er en kendsgerning, en total vi ikke kan stå inde for er forkert på en måde ingen kan se.** Den skjuler ikke tallet bag en streg — afkortningen er en oplysning om VORES hentning, ikke om kundens data. ⚠ **Et delmængdetal ER en nedre grænse** (de uhentede pladser er enten optagne eller frie), **men ANDELEN er det ikke** — `optagne / pladser.length` udgår, og noten siger hvorfor. ⚠ **Og nævneren i en NOTE er også et tal:** fem kort havde et ærligt tal og et afkortet i noten (*"af 500"*, *"73 % af pladserne"*). ⚠ **Kravet gælder KpiKort, ikke hvert `.length`** — et tal i en tabelrække beskriver rækkerne, et tal i et nøgletalskort beskriver kunden, og **en lint der råber ad alt, bliver slået fra** | `fleet/format.js`, 9 skærme, `test/afkortede-totaler.test.mjs` |
| 97 | **Hver kunde hentede hele produktet.** Byggeriet havde advaret hver gang: **1.586 kB i ét bundt**, heraf **935 kB vores egen kode**. En vognmand med Fleet og Facility hentede Warehouses elleve skærme, Unitbookings fire, Procures syv og ejerkonsollen — hver gang han åbnede appen, over mobilnettet i en lastbil. ⚠ **Samme sætning som 94 og 95, et lag længere ude:** en kunde skal ikke betale for et modul han ikke har. Dér var det forespørgsler; her er det kilobytes. ⚠ **55 skærme hentes nu med `lazy()`:** vores egen kode i startbundtet gik **935 kB → 77 kB** (26 kB pakket), og hver skærm koster 3–27 kB når den åbnes. ⚠ **`firebase` (481 kB) og `react` står for sig** — de skifter kun ved en opgradering, og vi udruller ofte. **Men `fleet/` splittes IKKE ud:** en chunk der altid hentes, kan lige så godt ligge i indgangen. ⚠ **Grænsen ligger i AppShell om `<Outlet />`, ikke om rutetræet.** React venter ved den NÆRMESTE — lå den om `<Routes>`, ville sidebar, topbar og periodevælger blive tegnet om ved hvert skift, og **en shell der blinker, føles som en app der genstarter**. ⚠ **Login er ikke doven:** den tegnes uden for shellen, altså uden en grænse, og ville vise et tomt vindue. ⚠ **Og `lazy()` fejler farligt:** en fil uden default-eksport bygger fint og kaster **først når ruten åbnes** — `rutedeling.test.mjs` læser alle 55 filer, så ingen skal klikke sig gennem dem | `src/App.jsx`, `fleet/AppShell.jsx`, `vite.config.js`, `test/rutedeling.test.mjs` |
| 98 | **Momssatsen er 25 % — spørgsmålet blev stillet og besvaret.** `grundlag.js` har siden beslutning 25 nægtet at gætte satsen, og eksporten var spærret for ALLE: *"et system der gætter rigtigt ni gange ud af ti, lærer brugeren at stole på det tiende"*. **Ejeren svarede 23. august 2026: 25 %, uden undtagelser.** ⚠ **Forbeholdet blev rejst FØR svaret — det er forskellen på en beslutning og en antagelse.** International kørsel er som udgangspunkt momsfritaget (momsloven §34), og demo-grundlaget havde netop en `Skagen → Oslo`-linje der stod tom med præcis den begrundelse. Spørgsmålet blev stillet med den sætning i hånden. ⚠ **`MOMSSATS_SALG` er det ene sted tallet står**, og `byggGrundlag()` sætter det ved OPBYGNINGEN, ikke ved visningen — ellers ville et grundlag fra marts få nye tal den dag satsen ændres. ⚠ **En sats der allerede står, røres ikke — heller ikke 0:** en nul-sats er et SVAR, ikke et manglende felt. ⚠ **Og værnet i `kanEksportere()` består**, nu som værn frem for arbejdstrin: der lå 1 af 8 linjer uden sats i basen, og en eksport er en kanal UD af systemet. ⚠ **Så blev eksporten koblet til en knap:** `eksporter()` havde stået siden 25 og **var kaldt ingen steder**, fordi momsen spærrede den. Fakturering har nu *Hent som JSON* — den NEUTRALE model, ikke en adapter (hvilket regnskabssystem der kommer først, er stadig åbent) — og den **låser ikke**: at hente en fil er ikke at bogføre den. ⚠ **Tre prøver holdt mellemstadiet på plads** og måler nu at satsen bliver SAT. Fjerde gang en prøve om et åbent spørgsmål falder netop da svaret kommer — og det er meningen | `fleet/grundlag.js`, `fleet/eksport.js`, `moduler/Fakturering.jsx`, `demo-grundlag.js` |
| 99 | **Den ene læsning der virkelig skulle logges, blev ikke logget.** `audit.js` siger om `laes()`: *"det er den del der plejer at mangle, og den RA-kunder spørger om"*. Den plejede at mangle: `sensitive/fravaer` bar `auditerSom`, **`sensitive/indberetninger` gjorde ikke** — samme hook, samme slags node, ét ord til forskel. ⚠ **Og det var den værste af de to:** skadebeskrivelse, modpart, forsikringsselskab, policenummer og en underskrift, frosset af beslutning 52 og bag sin egen `sensitiveLaes`. ⚠ **Det er ikke et adgangsproblem** — reglerne afviste allerede den der ikke måtte. Det der manglede, var sporet af de læsninger der gik IGENNEM. ⚠ **Fundet ved en måling der først gav et falsk svar:** *skriver nogen funktion uden at logge?* sagde **15 af 40** — indtil jeg så at `grundlagskriv` kalder `logGrundlag()`. Der er **syv** log-hjælpere, og med dem alle er svaret **0 af 40**. **En måling der ikke kender kodens egne navne, måler sig selv** (tredje gang, jf. 91 og 96) — jeg havde nær skrevet en beslutning om femten ulogede skrivninger der ikke fandtes. ⚠ **`sensitivlaesning.test.mjs`** kræver `auditerSom` på hvert `sensitive/`-opslag, at samme node hedder det samme overalt (`objekt` er fri tekst, og to navne giver et udtræk der ser komplet ud), at en **afvisning** også logges, og at det er **antallet** der logges — ellers er loggen selv en kopi af de følsomme data. ⚠ **Efterprøvet i begge retninger:** rettelsen taget ud igen, linten faldt. **En lint man ikke har set fejle, ved man ikke om virker** | `moduler/flaade/Indberetninger.jsx`, `test/sensitivlaesning.test.mjs` |
| 100 | **Seedet respekterede modulerne — undtagen dér hvor et anker fandtes to steder.** Jeg havde sagt at provisioneringen ignorerede kundens moduler. **Det gjorde den ikke** — `harModulet()` har været der hele tiden. Diagnosen var for grov, og målingen viste hvor. ⚠ **Regel-læseren tog det FØRSTE tekstfund:** `"beholdning"` findes både som node og som et FELT i `forbrugsvarer`, feltet står først og har ingen `.read` — så svaret blev *"hører til alle"*, og `nordvest` fik **seks beholdningsposter** han aldrig kan læse. **Sjette gang et anker findes to steder** (82, 83, 85, 86, 87), denne gang i funktionen der skulle beskytte mod det. Reglerne læses nu som JSON. ⚠ **Og prøven havde aldrig spurgt om `beholdning`** — den prøvede syv noder, og alle syv gik godt. Kravet er nu at opslaget er enigt med `NODE_MODUL` for HVER node. ⚠ **En node kan høre til basen og alligevel bære fremmede poster:** `grundlag` er basens, men de fire demo-grundlag bar `bookingId` og `kundeId`. `seedbarePoster()` afgør det pr. post, og **reglen afgør hvordan** — et PÅKRÆVET felt udelader posten (`grundlag` kræver `kundeId`), et VALGFRIT nulles (`indberetninger` kræver ikke `bookingId`; en kunde uden Planning har udmærket indberetninger). ⚠ **Målt før og efter gen-seedning:** hængende referencer **4 → 0**, grundlagslinjer uden momssats **1 → 0**, noder sprunget over hos nordvest **11 → 12**. `demo` mistede ingenting — et filter der ikke rører den fuldt udstyrede tenant, gør kun det det skal. ⚠ **Og min egen diagnose skulle rettes, ikke bekræftes:** jeg havde skrevet i to statusrapporter at seedet ignorerede moduler. **En diagnose er også en påstand der skal måles** | `scripts/provisioner-dev.mjs`, `test/seed-tenant.test.mjs`, `test/demo-referencer.test.mjs` |
| 101 | **Tjekket der kunne sættes, og de atten der ikke kunne.** 92 målte at **51 af 72 referencefelter** har et eksistenstjek; resten stod ingen steder, og **forskellen på "besluttet" og "glemt" kunne ikke ses**. Etapen kunne først tages efter 100 ryddede basen — et opslag mod data der peger på ingenting, ville have spærret skrivninger. Målt bagefter: **0 overtrædelser**. ⚠ **To tjek sat:** `underskrift.personId` → `personale` (posten er FROSSET, så et blindt id står der for altid på det ene dokument der skal bevise noget) og `indberetninger.bookingId` → `bookinger` (koblingen mellem en skade og turen der forvoldte den). **Begge felter er stadig VALGFRIE** — en `.validate` køres ikke på et felt der ikke er der. ⚠ **Atten kan ikke:** målnoden findes ikke (5 — `sagId`, `bilagId` i Storage), feltet peger på et **login** (2), eller vejen ind er lukket og funktionen slår referencen op (10). **Kravet er ikke at alle tjekkes — det er at hvert felt har taget stilling**, og linten kræver en begrundelse, at den forsvinder når tjekket kommer, og at flertallet faktisk ER tjekket. ⚠ **Og ét felt afslørede at min egen rettelse var halv:** `lagre` kaldes tre steder *reservedelslageret*, mens `pricing.js` slår op i den for **lagerophold med døgnsatser** — to betydninger, én node. I 92 rettede jeg demolinjen til `lag-kolding`, som er en OPBEVARINGSLOKATION. **Referencen resolver; semantikken gør ikke.** Spørgsmålet står nu på listen over det der kræver et menneskeligt svar. ⚠ **Syvende gang et anker spændte for bredt:** `rules.lagre.test.mjs` skar regelfilen som TEKST fra `"lagre"` til `"bookinger"` og faldt på en kommentar i en helt anden node. Kravet var rigtigt, udsnittet var forkert — den læser nu JSON | `firebase.rules.json`, `test/referencetjek.test.mjs`, `test/rules.lagre.test.mjs` |
| 102 | **Adapterlaget — og de tre formater jeg ikke fandt på.** 98 gav eksporten en knap, og den producerede JSON. **En bogholder vil ikke have JSON.** `grundlagseksport.js` oversætter den neutrale model; Fakturering har nu **Neutral (JSON)** og **Regneark (CSV)**. ⚠ **Og den neutrale model bar INGEN dato.** Version 1 gav nummer, kunde, beløb og linjer — ikke ét tidspunkt. **Et bilag uden dato kan ikke bogføres**, for datoen afgør momsperioden. Det blev først synligt da eksporten skulle bruges: **så længe `eksporter()` blev kaldt ingen steder, kunne manglen ikke mærkes** — præcis som momssatsen. `udarbejdetMs` og `godkendtMs` betyder ikke det samme, og det er den sidste der er bilagsdatoen; `periode` skal med, fordi et lagerafregningsgrundlag har intet `bookingId`. **Versionen bumpet til 2** selv om der kun er lagt felter til: en modtager der validerer strengt, afviser et ukendt felt. ⚠ **Der er BEVIDST ingen e-conomic-adapter.** Jeg kender ikke deres importskema, og en opfundet kolonnerække er samme fejl som en gættet momssats — filen ser rigtig ud og fejler i den anden ende, eller importerer HALVT. En prøve forbyder at der sniger sig en ind uden at nogen har skrevet hvor skemaet kom fra. ⚠ **CSV'en: én række pr. linje, INGEN totalrække** — en totalrække bliver til en fakturalinje i den anden ende, altså én faktura på det dobbelte. Beløb i **kroner med komma** (en importør der læser `1240000` som kroner, fakturerer 1,24 mio.), antal som `1,5` og ikke `1500`, og **kilden i en kolonne** fordi spørgsmålet altid er *"hvilken tur var det?"*. ⚠ **Og jeg gav i går en JSON-fil navnet `.csv`:** `filnavn()` hardkodede endelsen. **Filendelsen er en påstand om indholdet**, og den var forkert i et døgn | `fleet/grundlagseksport.js`, `fleet/grundlag.js`, `fleet/eksport.js`, `moduler/Fakturering.jsx` |
| 103 | **Chaufføren fik en app — og et login fik endelig et navn.** `rutestatus.js` har kunnet LÆSE meldinger siden beslutning 22 — otte typer, `naesteStop()`, `stilhedMin()` — og **der var ingen der kunne skrive dem**: `statushaendelser` stod hverken i regelfilen eller i seedet. Rute & status viste *"Ingen meldinger"* på hver eneste tur, for alle. Hele læsesiden var bygget færdig og ventede på en skrivevej der ikke fandtes. ⚠ **Blokeringen: `brugere/<uid>` bar email, navn og rolle — og intet der sagde hvilken MEDARBEJDER kontoen er.** Etapen bærer et `personId`, tokenet et `uid`, og de to mødtes ingen steder. Feltet ligger på **brugerposten**, ikke på personale-posten: den er nøglet på uid, så en regel kan slå op i O(1) — omvendt skulle den **scanne**, og det kan RTDB ikke. Valgfrit, for en admin er ikke nødvendigvis en medarbejder. ⚠ **Vejen er lukket af en grund reglen ikke kan dække:** en regel kan sammenligne to felter, ikke afgøre om en etape er chaufførens — det kræver opslaget. Permissionen er `booking.laes`, **ikke** en skrivepermission: at melde hvor man er, er ikke at ændre turen, og **ejerskabet er det der afgrænser**. ⚠ **Tidspunktet kommer fra TELEFONEN — det modsatte af `udleveretMs`.** Forskellen er forbindelsen: sattes tiden på serveren, ville en melding sendt kl. 14 stå kl. 16 fordi det var da dækningen kom igen, og `stilhedMin()` ville sige at vi *lige* havde hørt fra ham. `klientId` er NØGLEN, ikke et `push()`: en gensendelse rammer den samme post. ⚠ **Demosættet var arrays** — beslutning 76 om igen, hvor tre overgange var lukkede i produktion mens de virkede i demo — **og bar et `sted`-felt reglen ikke har**: stedet står i den planlagte rute, og en melding uden `stopId` har intet kendt sted. ⚠ **Appen er en RAMME, ikke et modul uden sidebar** (som ejerkonsollen): med seks permissions ville elleve af tolv menupunkter føre til en afvist læsning. Adgangsvejen er uændret — rammen afgør hvad der TEGNES. **Knapperne sorteres, de spærres ikke:** virkeligheden kommer ikke i rækkefølge, og en knap der er væk, tvinger chaufføren til at melde noget der ikke passer. ⚠ **Ingen auditpost, med vilje:** meldingen ER sit eget spor, og en kopi ville være `bemanding.ledig` igen. ⚠ **Og ottende og niende gang et anker spændte for bredt:** en prøve forbød `type: kortStreng(d.type` i HELE functions/index.js, en anden enhver `<Suspense>` efter `{!harAdgang &&`. Begge krav var rigtige, begge udsnit for store. ⚠ **Og ni kald mod DEV fandt to fejl prøverne ikke kunne se:** et forbudt felt gav **OK** (`byggMelding()` havde filtreret det væk FØR prøven kørte — klienten sendte noget systemet ikke forstår og fik ja), og undtagelsen for disponenten tjekkede **`booking.skriv`, en permission der ikke findes** — grenen kunne aldrig fyre, så han fik at vide at HANS bruger manglede et medarbejderkort. **En prøve mod filen ville have været grøn i begge tilfælde** | `fleet/rutestatus.js`, `moduler/app/MinTur.jsx`, `functions/index.js`, `firebase.rules.json`, `test/statusmelding.test.mjs` |
| 104 | **En tilladelse for at ændre en pris, og ingen for at læse den.** Chaufførappen (103) rejste spørgsmålet uden at stille det: jeg byggede en skærm på den præmis at rollen er afgrænset, og målte så hvad den kan læse. **39 af 51 læsbare noder krævede ingen permission overhovedet**, og **femten domæner har en `.skriv` og ingen `.laes`** — en chauffør kunne læse hver pris, hvert fakturagrundlag og hvert leverandørvilkår. Tenantgrænsen holdt (det er punkt 1, en helt anden mekanisme); **inden for virksomheden var der ingen.** ⚠ **Det stod skrevet at det ikke var besluttet:** noten ved `bookingLaes` advarede mod at tilføje "tretten laes-permissions alle presets alligevel skulle have" og sagde at en stramning kræver **sin egen beslutning med sin egen begrundelse**. Derfor **tre** og ikke femten — og advarslens rigtige krav er nu en prøve: **en læse-permission alle syv roller har, er ikke en spærring.** Chaufføren får ingen af de tre; disponenten og lagermedarbejderen to af tre (ikke `grundlag.laes` — *en disponent skal kunne planlægge en tur uden at kunne se hvad kunden betalte for den forrige*). ⚠ **Målingen rettede to gæt:** `permissions.js` påstod at lagermedarbejderen ikke kan "se en pris" — han kunne dem alle, og hans EGNE skærme kræver det (Warehouses Afregning prissætter håndtering); og `leverandoerer` læses af **elleve** skærme, også uden for Procure. ⚠ **Nøgletallene fulgte med af sig selv**, og det var hele pointen med `KPI_PERM`: noten over den lovede at *"den dag en læse-permission strammes, følger nøgletallet med"*. Jeg skrev ikke ét led i hånden — prøven udledte dem af kildernes egne regler og opremsede de manglende. ⚠ **Og spærringen fandt en domænegrænse der var tegnet forkert:** `opgaver` ville have kostet en disponent **seksten driftstal for ét faktureringstal**, fordi `klarTilFakturering` lå dobbelt — samme tal som `oekonomi.ikkeFaktureretForloeb`, forsvaret med *"én beregning, to navne"*. Den begrundelse holdt så længe et domæne bare var en mappe; **et domæne er den enhed adgangen afgøres på**. Feltet er samlet i økonomi. ⚠ **Målt mod den udrullede base med fem rigtige logins:** chaufføren 0/8 kommercielle noder og 6/10 KPI-domæner — og **6/6 af de noder chaufførappen bruger**, for en spærring der rækker for langt, ville have lukket gårsdagens app. De **tolv** øvrige står åbne med en grund hver i `test/laeseadgang.test.mjs`; `brugere` kan ikke lukkes, fordi `personId` står der | `fleet/permissions.js`, `fleet/kpi-aggregering.js`, `firebase.rules.json`, `test/laeseadgang.test.mjs` |
| 105 | **Atten døre der ikke kunne åbnes — og stregen der betød to ting.** 104 gav ti noder en læse-permission; målt bagefter havde **18 af 59 skærme mindst én afvist læsning for en chauffør**. Han så alle 54 menupunkter. Det er nøjagtig den sætning jeg brugte to dage før til at nægte chaufførappen en sidebar — *en menu der mest består af døre der ikke kan åbnes, er værre end ingen menu* — og jeg havde ikke holdt den op mod den skærm alle andre bruger. ⚠ **Og det er ikke længere "en pæn knap".** Beslutning 43 og 44 afviste et rollefilter med begrundelsen *kortet væk, tallet åbent*; præmissen var at **ingen regel spurgte om rollen**. Nu gør ti noder det, og en prøve håndhæver at `kraeverPerm` kun må sættes på en permission reglen faktisk kræver. **Menuen tier, adgangen ændres ikke:** ruten findes uændret, og en prøve kræver at `App.jsx` IKKE filtrerer ruter — et dybt link skal ende i en forklaring, ikke i en 404. ⚠ **Feltet sættes hvor skærmens EMNE er spærret**, ikke hvor den tilfældigvis læser en spærret node: Disponering slår op i `leverandoerer` for at skrive et NAVN, og blokerer på nøgletallene — ikke på kartoteket. Det blev målt. De tre undtagelser står med en skreven grund. ⚠ **Og et toppunkt over en tom liste er værre end ingen menu:** uden `indkoeb.laes` er alle syv Procure-punkter væk, så overskriften går med. **18 → 3 for chaufføren, 0 for alle andre.** ⚠ **Den anden halvdel: `medFuldForm()` fylder null i, og `num()` skriver —.** Den streg betød *ikke beregnet*; nu betyder den også *ikke hentet*. **To kendsgerninger, ét tegn**, og en chauffør mistede fire af ti domæner på forsiden uden at der stod hvorfor. `useKpi` kendte kun den halve historie — `afviste` var dem vi SPURGTE om — så `utilgaengeligeDomaener()` skiller grundene ad: **`modul` betyder ring til os, `perm` betyder se på rettighederne**. `<Kpiadgang>` er ÉN linje på femten skærme; fire bannere ville være støj, og støj bliver slået fra. ⚠ **Tredje sted samme præmis var overhalet:** vælgeren bød en chauffør "Procure" — en side af streger — med en kommentar der selv sagde *"tallene i `kpi/` var læsbare for ham i forvejen"*. Alle tre var sande da de blev skrevet: **en begrundelse i koden har en holdbarhed, og den udløber uden at nogen får besked.** ⚠ Og set efter i browseren fandt jeg at banneret arvede `.fc-empty` og stod centreret midt i luften som en fejlmeddelelse | `fleet/nav.js`, `fleet/AppShell.jsx`, `fleet/useKpi.js`, `fleet/ui.jsx`, `test/navadgang.test.mjs`, `test/kpiadgang.test.mjs` |
| 106 | **Otte fliser, fire arter — dokumentationen beskrev noget ingen havde bygget.** Ejeren viste hvordan chaufførappen skal se ud: fire kort, og under Indberetning et gitter med otte fliser. `HAENDELSE_ART` havde **fire arter** — fire fliser havde ingen art at skrive. ⚠ **Og README havde beskrevet de otte hele tiden**, med et skel koden ikke kendte: *driftshændelser starter et forløb; udgiftsregistreringer gør ikke.* Den omvendte fejl af den sædvanlige — ikke kode uden dokumentation, men **dokumentation uden kode** — og usynlig, fordi ingen skærm havde brug for de manglende arter. ⚠ **Skellet er om der er et arbejde at følge:** en revnet rude bevæger sig gennem seks tilstande; en parkeringsbillet er et beløb og en dato. Reglen krævede `forloeb` af dem alle, så en tankning stod med "Ny" og fyldte kontorets arbejdsliste med bilag. `.validate` kræver nu feltet af netop de arter der har et — og ordlisten står to steder, fordi en RTDB-regel ikke kan importere kataloget, så en prøve udleder den. ⚠ **`andet` hører i DRIFT:** en chauffør der ikke kan sætte navn på det han ser, har set noget der skal VURDERES. ⚠ **Fliserne er ikke arterne** — otte mod ti, med vilje: noden skal være præcis, knappen hurtig. `Skade` spørger ét spørgsmål mere (enhedsskade og godsskade har hvert sit feltskema og er begge sensitive), og `kvittering` har ingen flise, fordi en kvittering altid er FOR noget og flisen ville stjæle halvdelen af tankningerne. ⚠ **Forsiden viser kun de kort der fører et sted hen** — 105's regel én skærm længere inde. ⚠ **Sendt gennem appen, ikke kun gennem prøver:** en rigtig parkeringsbillet på 85,50 kr landede som `omkostningOere: 8550` **uden `forloeb`**. Kørslen fandt to fejl prøverne ikke kunne se: **listen sagde nul mens kvitteringen sagde sendt** (`useListe` er et `once()`-opslag), og **jeg skrev øreomregningen selv** — mens `oereFraKroner()` har stået i format.js siden beslutning 2 og kan to ting mere, heriblandt tusindtalsseparatoren, hvor min gav NaN. ⚠ **Og prøvernes egen kommentarfjerner åd rutetræet:** ruten `path="/app/*"` indeholder `/*`, så den naive stripper åd resten af App.jsx, og to prøver meldte at hver eneste skærm manglede en rute. Målt: **32 prøvefiler med hver sin kopi i syv varianter** — `erGyldigMail()` igen. `test/kode.mjs` er nu den ene; 30 latente kopier står tilbage | `fleet/indberetninger.js`, `moduler/app/Forside.jsx`, `moduler/app/Indberetning.jsx`, `firebase.rules.json`, `test/kode.mjs` |
| 107 | **Stemplinger — og navnet der var taget to gange.** Anden af de fire skærme i specifikationen. ⚠ **Navnet blev målt først:** `vagter/` er RESERVERET til en vagtplan (*hvad vi aftalte*), og `tidsregistrering` er et FELT på en indberetning (*et andet ur*). Det ville være **tredje gang** to ting hed det samme — `lagre` mod `lager`, `bookinger` mod `bookings`, `warehouse` mod `warehouse`. Noden hedder `stemplinger`, fordi navnet siger hvordan posten OPSTÅR; arbejdstiden regnes af den og gemmes ikke. ⚠ **Stien er det der gør reglen mulig:** `statushaendelser` blev en Cloud Function fordi ejerskabet lå INDE i posten (103); her står `personId` i STIEN, så reglen kan slå `brugere/<uid>/personId` op. Vejen behøver ikke være lukket, og der skal ikke stå en funktion der ikke gør andet. **Han læser kun sine egne** — `.read` på `$personId`, ikke på beholderen, som ville kaskadere. **En lukket vagt er frosset** (`.write` afvist ved `udMs`), med leddet på POSTEN som underskriften i 52. ⚠ **Tre tal der ikke må gøres op:** en åben stempling har **ikke nul minutter** (én åben vagt gør hele ugen uopgjort, og skærmen siger hvorfor); **åben er ikke "i dag"** (en nattur ville ellers give en post nummer to oven i den han havde); og en vagt **over et døgn afvises, den afkortes ikke** — at gætte midnat ville være en måling vi fandt på. Timer skrives med kolon: 7,5 er ikke syv timer og fem minutter. ⚠ **Ingen position.** Specifikationen siger at den registreres, beslutning 22 siger INGEN GPS — spørgsmålet er stillet og ikke besvaret, så der er ingen koordinater i modellen, reglen eller demosættet, og en prøve afviser dem. **Formen spærrer ikke for svaret:** flade felter, så `indLat` kan lægges til uden at røre en post. Og **skærmen siger det** frem for at tie. ⚠ **Beholderen brød tre prøver, alle med rette:** nodelisten krævede en `.read` på noden, provisionerens modulopslag gik OP i træet og svarede "hører til alle" (et Workforce-seed ville lande hos en kunde uden modulet), og modulprøven læste beholderen som admin og fik afvist. ⚠ **Og to fejl kun skærmen viste:** den åbne demovagt var **61 timer** gammel og kunne derfor ikke stemples ud, og knappen blev **hvid på hvid** under musen, fordi `.fc-btn:hover` er to klasser og vinder over én — `.fc-btn-primaer:hover` findes af nøjagtig samme grund | `fleet/stempling.js`, `moduler/app/Timeregistrering.jsx`, `firebase.rules.json`, `test/stempling.test.mjs` |
| 108 | **Man ansøger ikke om sygdom.** Fjerde kort i chaufførappen. `fravaer` krævede `fravaer.skriv`, som ingen chauffør har. ⚠ **Den oplagte løsning var umulig:** `art` er en helbredsoplysning (GDPR art. 9) og bor i `sensitive/fravaer`, hvis `.write` kræver **både** `fravaer.skriv` OG `fravaer.sensitiveLaes` — *"kan man ikke læse feltet, skal man heller ikke kunne overskrive det i blinde"* (17). Så kom sætningen der løste det: **det han søger om — ferie, feriefridag, afspadsering — er ikke én af dem en helbredsoplysning.** Ansøgningen bærer et `oensket` på BASISNODEN, begrænset til de tre og UDLEDT af `helbred`; kontoret sætter `art` i den følsomme node ved godkendelse. ⚠ **`oensket` og `art` er ikke samme felt to steder:** det ene er hvad han BAD OM, det andet hvad der blev REGISTRERET — som `estimeretMin` mod `faktiskMin`. ⚠ **To nye arter**, fordi `feriefridag` og `afspadsering` ikke fandtes og ville lande som `andet` — *en afspadseringssaldo kan ikke gøres op af poster der hedder andet*. ⚠ **Fire led i reglen, hvert prøvet ved at vise hvad der sker uden det:** personId (han kunne søge fri for en kollega), status (han kunne godkende sin egen), kontorets svarfelter (en ansøgning ville se afgjort ud), og `!data.exists()` (han kunne genåbne en AFVIST). **Målt mod den udrullede base med et rigtigt login:** to gik igennem, seks blev afvist. ⚠ **En ansøgning spærrer ingenting** (59's figur), og **et fravær uden `ansoegning` er kontorets egen registrering** — hvert eksisterende opfører sig som før. ⚠ **Svaret kommer i appen, ikke på mail:** beslutning 20 er fase 0, og en tekst der lovede en mail, ville love noget der ikke kan sendes. ⚠ **Og to datofejl — kun den ene var min:** `isoTilMs()` giver kl. 12 med vilje, men et fravær er hele dage, så "til og med den 9." blev vist som **"05.10 – 10.10 · 5 dage"** (datoerne modsagde antallet). Og `varighedDage()` regnede `ceil((til-fra)/86400000)` — **23.–27. oktober gav 6 dage**, fordi sommertidsskiftet gør fem døgn til 121 timer. Den fejl ramte to gange om året i to skærme og var der i forvejen | `fleet/fravaer.js`, `moduler/app/Frihed.jsx`, `firebase.rules.json`, `test/rules.ansoegning.test.mjs` |
| 109 | **Indberettet — og de syv poster ingen kunne eje.** Ejeren viste hvordan listen skal se ud: kort med art · enhed, beskrivelse, statuspille, og en linje der siger *hvornår driften har planlagt dem*. Tre ting manglede. ⚠ **Der var ingen kobling** mellem en melding og det besøg den udløste: `opgaver` bar `besoegId` og `sagId` og **intet felt der pegede på indberetningen** — mens forløbet har tilstandene `planlagt` og `paaVaerksted`, som **forudsætter et besøg**, uden at nogen kunne sige hvilket. Retningen er valgt: opgaven peger på indberetningen, fordi `indberetninger` er skrivbar fra klienten og et `opgaveId` dér kunne sættes af chaufføren selv. ⚠ **Skærmen sagde "0 sendt" mens der lå fire han havde skrevet.** Målt: **alle syv seedede indberetninger havde et pladsholder-uid** — omskrivningen dækkede indkøbsordrer og -behov, ikke `indberetninger`. Det er ikke kosmetisk: ejerskabstjekket er `oprettetAf === auth.uid`, så **ingen kunne rette sin egen indberetning**. Og **to pladsholdere stod slet ikke i tabellen** — `rigtigt()` svarer null for en ukendt og **springer over, tavst**. Målt efter: 0 tilbage. ⚠ **Og der er to Lars'er:** `uid-lars` er casehandleren, `larsAage` er chaufføren som kontoen er koblet til (103). De ligner hinanden fuldstændig, og det var derfor hans egne observationer lå på kontorets konto. ⚠ **To vokabularer, ét katalog:** "Ny" betyder for kontoret at ingen har vurderet den; for chaufføren der selv sendte den, betyder det *vi har modtaget den*. Feltet står i FORLOEB ved siden af tilstanden — en tabel i appen ville være to vokabularer for én tilstandsmaskine, og den dag et forløb fik et trin mere, ville nøglen stå råt. ⚠ **Han ser HVORNÅR, ikke altid HVEM:** værkstedets navn kræver `indkoeb.laes`, som en chauffør ikke har efter 104. **Men stedet må han se** — han er den der kører bilen derhen — og en dato uden et sted er ikke en besked man kan handle på. ⚠ **ÅBENT:** `uid-anders` bruges i demo-procure sammen med `anmoderId: "andersNielsen"`, en medarbejder der ikke findes i personalet; undtagelseslisten kalder feltet "et uid, ikke et personId" | `firebase.rules.json`, `fleet/opgaver.js`, `fleet/indberetninger.js`, `moduler/app/Indberetning.jsx`, `scripts/provisioner-dev.mjs` |
| 110 | **To felter for ét spørgsmål — og det designede var det ubrugte.** Sidste af de fire skærme: Turplanen, med nummererede stop, tidsvindue, adresse, telefon og gods. ⚠ **Målt i den udrullede base:** `fraSted`/`tilSted` stod på **8 af 8** etaper, blev læst af **ti filer** — og står slet ikke i regelfilens feltliste. `fraAdresse`/`tilAdresse` stod på **2 af 8**, var **struktureret og valideret på hvert led** — og blev **skrevet af ingenting**. Den designede form var aldrig taget i brug, mens et fritekstfelt reglerne ikke nævner, bar hele driften. ⚠ **Det kunne ligge sådan fordi `etaper` er `.write: false`:** kun functions skriver, og Admin-SDK'et går uden om `.validate`, så en feltliste der ikke passer til dataene, giver aldrig en fejl. Transportmærkatet trykte oven i købet adressen — den faldt bare tilbage på stedsnavnet, så det så rigtigt ud. ⚠ **Stedet bliver, adressen flytter:** `fraSted` er et NAVN til prissætning; et stop er en adresse man kan køre til. `fraAdresse` er nu `.validate: false` — **forbudt, ikke fjernet**, som `division` i 70. ⚠ **`planlagteStop()` har ÉT svar:** de eksplicitte stop når etapen har dem, ellers den udledte rute — `statushaendelser.stopId` prøves mod netop den funktion (103), og to svar ville lade en melding pege på et stop den ene kendte og den anden ikke. Med mere end to stop lægges grænsen ikke ind: hvor den hører på et multi-drop, er et gæt. ⚠ **Og der ER en skrivevej:** `bookingopret` skriver de to stop — uden det havde vi lavet `fraAdresse` om igen. Navnet er stedet, indtil nogen taster en adresse; vi gætter ingen gade. ⚠ **"Mangler scan" er fraværet af en melding**, ikke et felt — et `scannetMs` ville være samme kendsgerning to steder. ⚠ **Og "54 paller" er ikke paller:** de samme tolv op og af er tolv paller og fireogtyve løft. Tallet hedder **håndteringer**; "24 paller" om en tur med 12 ville få en chauffør til at læsse forkert. ⚠ **To fejl kun skærmen viste:** opgørelsen læste `stopListe()` mens kortene tegnes af `planlagteStop()` — *"0 tilbage · 0 færdige" over tre kort hvoraf det ene var meldt*, altså præcis den fejl funktionen blev lavet om for at undgå. Og nummereringen talte grænsen med: **"1, (grænse), 3"**. ⚠ **Og en prøve der ikke kunne fejle:** `{3, 1, 2}` beviste intet, fordi JS selv ordner heltalsnøgler — målt ved at fjerne sorteringen | `fleet/stop.js`, `fleet/rutestatus.js`, `moduler/app/Turplan.jsx`, `firebase.rules.json`, `test/stop.test.mjs` |
| 111 | **Undtagelsen der modsagde de to filer den var lavet af.** Beslutning 110's åbne punkt: `demo-procure.js` skrev `anmoderId: "andersNielsen"` — en medarbejder der ikke findes i `DEMO_PERSONALE`. Referencen slap igennem fordi `anmoderId` stod i to prøvers undtagelseslister som *"et login (uid), ikke en post"* — mens `functions/index.js` og `firebase.rules.json` begge, ved siden af feltet, kalder det et **personId**. ⚠ **Fem opdigtede navne, ikke ét:** kun `metteSoerensen` var reelt et `DEMO_PERSONALE`-id; `andersNielsen`, `larsPetersen`, `michaelHansen` og `mikkelLarsen` pegede på ingenting. Rettet i tre lag: reglen fik samme eksistenstjek som andre `personId`-felter, `FELT_NODE` fik de to felter mappet til `personale`, og dataene blev rettet til rigtige id'er (`andersNielsen` → `larsAage`, samme binding `uid-anders` allerede har) | `firebase.rules.json`, `fleet/demo-procure.js`, `scripts/provisioner-dev.mjs`, `test/demo-referencer.test.mjs`, `test/referencetjek.test.mjs` |
| 112 | **Sagsbaseret mail, skive 1 — fuldt specificeret, aldrig bygget.** Beslutning 20's datamodel, politik (`fleet/sager.js`, 39 tests) og fase-0-skærm har stået siden — kun databasen manglede. `sager`/`sensitive/sager` fik regler (ugated som `opgaver` — `art` er `fleet`\|`facility`), fem `sag.*`-permissions fordelt efter hvem der ARBEJDER sagen (casehandler+koordinator skriver, disponent kun læser, koordinator alene godkender karantæne og aftaler), og fire funktioner (`sagOpret`, `sagBeskedSkriv` — kun udgående, `sagKarantaeneFrigiv`, `sagAftaleBekraeft`) der alle kalder sagerpolitikkens egne funktioner. ⚠ **`sagAftaleBekraeft` er bygget, men ikke nåelig:** intet i skive 1 skriver et `aftaleforslag` — kun den ubyggede mail-udtrækning gør. ⚠ **Og skærmen blev IKKE koblet på**, som planlagt: `Sagsvisning.jsx` viste sig aldrig at være importeret nogen steder — fase 0 byggede den færdig og monterede den aldrig. At koble ingen til rigtige data løser intet; hvor den skal bo er en skærm-placering, ikke en rettelse | `firebase.rules.json`, `permissions.js`, `moduler.js`, `functions/index.js`, `scripts/kopier-delt.mjs`, `audit-regler.js`, `test/sager-funktioner.test.mjs` |
| 113 | **Et spørgsmål der allerede var besvaret.** Jeg stillede ejeren *"motor eller grundlag?"* fra `FleetControl-spoergsmaal.md`s liste over blokerende spørgsmål — og fik svaret **grundlag**, som **beslutning 22** allerede havde afgjort, længe før. Fejlen var min: jeg holdt spørgsmålet op mod et dokument der selv sagde det stod åbent, ikke mod `BESLUTNINGER.md` eller README, hvor svaret stod. ⚠ **Samme klasse fejl som 54:** en fil der ikke er opdateret, bliver læst som sandheden. Rettelsen er dokumentet — `FleetControl-spoergsmaal.md`s "De ni skærme" er ført ajour med beslutning 22, og kun de sub-spørgsmål der reelt er åbne, står tilbage | `FleetControl-spoergsmaal.md` |
| 114 | **Meldingen der ikke længere tabes uden forbindelse.** `statusmelding` er det ENESTE sted i chaufførappen der reelt var skrøbeligt offline — et Cloud Function-kald har intet af databasens egen genopkobling, og fejlede `fetch`, var meldingen væk. Beslutning 103 havde allerede bygget modellen til det (`klientId` gør en gensendelse ufarlig) uden at bygge køen: *"køen er ikke bygget — appen er ikke offline — men modellen skal kunne bære den."* `meldingskoe.js` bygger den nu: fejler kaldet af en forbindelsesgrund, lægges meldingen lokalt og sendes igen automatisk. ⚠ **En afvisning fra SERVEREN lægges IKKE i køen** — `invalid-argument` m.fl. betyder meldingen blev vurderet og afvist, og en gensendelse ville kun gentage den. ⚠ **Og en ventende melding tæller ikke som "færdig"** — det tal er målt, ikke gættet; chaufføren ser i stedet en tredje, ikke-alarmerende tilstand. 10 nye tests, ren politik uden firebase. Fandt undervejs: `Forside.jsx`s kommentar sagde stadig "to skærme er ikke bygget" om en app der har haft alle fire siden beslutning 108 | `fleet/meldingskoe.js`, `moduler/app/Turplan.jsx`, `moduler/app/Forside.jsx`, `fleet/fleet.css`, `test/meldingskoe.test.mjs` |
| 115 | **Retention pr. datatype — arkitekturen nu, sletningen aldrig endnu.** Jørn afviste én global retention (var 24 mdr. for alt): regnskabsdata trækker mod 5 år (bogføringsloven), personoplysninger mod kortere (GDPR) — samme tal for begge er forkert for begge. Bestillingen: fastlæg kategorierne og arkitekturen nu, valider de konkrete frister med revisor/GDPR-rådgiver bagefter — og **byg ikke automatisk sletning eller anonymisering endnu**. `retention-regler.js`: 14 kategorier kortlagt til rigtige noder (fire findes ikke i produktet — GPS, AI-diagnose, support — og står med tom nodeliste), hver med `periodeMaaneder: null` og `afgjort: false`, ingen gættede tal. ⚠ **Auditloggens egen retention (audit-regler.js) dupliceres ikke** — kategorien `auditlog` peger på den. Bygget: legal hold (`.write: false`, kun `retentionLegalHold`, kræver BÅDE laes og skriv), og `retentionDryRun` — en REN simulering der svarer "hvad ville X måneder betyde i dag" uden at røre noget, med id'er i svaret, ikke fulde poster. ⚠ **`anonymiser()`/`eksporterFoerSletning()`/`slet()` findes som hooks der KASTER hvis de kaldes** — ingen stille no-op. `spaerlogin` fik et `spaerretMs` den manglede, bevaret af `skiftrolle`. 29 nye tests | `fleet/retention-regler.js`, `firebase.rules.json`, `permissions.js`, `functions/index.js`, `test/retention-regler.test.mjs`, `test/retention-funktioner.test.mjs` |
| 116 | **Stempling i fremtiden — samme fælde som stp-aaben løste, i den anden ende.** Et checkpoint-commit blokerede på pre-commit-hooken: `stp-tir` fejlede med "Tidspunktet ligger i fremtiden," fordi den regnede tirsdag i INDEVÆRENDE uge — og den 24. august 2026 er en mandag, så "tirsdag denne uge" er i morgen. Rettet: de tre lukkede vagter regnes nu fra forrige uge, som unconditionally er forbi uanset ugedag — samme greb som `stp-aaben` bruger `idagKl()` for unconditionally at være i dag. Ikke fundet af retention-arbejdet; fundet fordi hooken nægtede at lade en kendt fejl glide med | `fleet/demo-stemplinger.js` |
| 117 | **Chaufføren må kun nå /app.** `Chauffoerramme` var sideordnet AppShell siden beslutning 103, men kun for forsidens kort — intet forhindrede en chauffør i selv at navigere til en kontor-rute. `erChauffoer` (samme "sideordnet, ikke en udvidelse"-mønster som `erUdbyder`) udelukker nu AppShell-blokken og sender ham til `/app` i stedet, ved en catch-all der IKKE går til "/" (ville loope tilbage i den blok han lige blev udelukket fra). ⚠ **`harAdgang` selv er urørt** — reglerne kender kun tokenet, ikke rollen. `/app/*` er ikke begrænset til kun chauffører. Verificeret **live** i en kørende DEV-session, ikke kun i tests: chauffør-login lander på /app, direkte forsøg på /booking og / sender begge tilbage. ⚠ **Fandt undervejs en urelateret, allerede eksisterende fejl:** `Oversigt.jsx` (Booking) crasher for enhver rolle — en opgave peger på et køretøj der ikke findes, og `.sort()` kaster på det resulterende `null`. Ikke rettet, kun noteret | `App.jsx`, `test/chaufforadgang.test.mjs` |
| 118 | **Oversigtens enhedsvalg — den hængende reference fra 117 rettet.** `opgaveEnhed(id)` svarer `null` for et `koeretoejId` der ikke længere findes, og enhedsvalget sorterede med `.localeCompare` direkte på det — en blank hvid skærm for enhver rolle. ⚠ **`kundeNavn` og `opgavePerson` faldt allerede tilbage til id; kun enhedsvalget manglede det.** Rettet til samme mønster: `opgaveEnhed(id) \|\| id`. Ikke undersøgt: hvorfor referencen hænger i første omgang | `moduler/booking/Oversigt.jsx`, `test/oversigt-haengende-enhed.test.mjs` |
| 119 | **Den hostede DEV-brugerskifter sendte alle roller til chaufførskærmen.** Første interne v1-test fandt at ethvert rolleskifte endte på chaufførappen — men `uid`/`tenant`/`rolle`/`perms` var KORREKTE efter hvert skifte; fejlen var hvilken RUTE browseren stod på. `TilLogin`/`EfterLogin` husker "kom fra" i browserens egen history-state, og `DevTesterVaelger.jsx` ligger bevidst uden for `<BrowserRouter>` — så var forrige identitet chauffør (sad på `/app`, åben for enhver med adgang siden 117, ikke kun chauffører), overlevede `fra: "/app"` under den næste, helt anden identitet. ⚠ **Løsningen er IKKE at lukke `/app` for andre end chauffører** (117 står urørt, håndhævet af `test/chaufforadgang.test.mjs`) — den er at rydde det forældede "fra" med `window.history.replaceState()`, en ren browser-API uden en Router at være uenig med. Verificeret **live**: admin → koordinator → disponent → lagermedarbejder → revisor → chauffør, claim for claim, korrekt shell hver gang | `functions/index.js`, `moduler/DevTesterVaelger.jsx`, `App.jsx` |
| 120 | **casehandler konsolideret ind i koordinator.** Ejernes beslutning efter første test: de to repræsenterer samme praktiske rolle. Alle referencer kortlagt FØR noget blev fjernet — permissions, provisionering, 16 testfiler, levende docs. ⚠ **Fundet og rapporteret FØR fjernelse:** casehandler havde `booking.opret`, koordinator havde det ikke — uden en rettelse kunne kun admin oprette en booking. Ejerne valgte at give koordinator permissionen: en bevidst, smal overførsel, ikke en bred udvidelse. ⚠ **Bryder ikke fire-øjne-reglen fra beslutning 5** — den handler om FORSLAGET (disponent har `booking.foreslaa` uden `booking.godkend`), ikke om forespørgslen; koordinator har stadig ikke `booking.foreslaa`, så den der foreslår og den der godkender er stadig to roller. Historiske beslutninger (denne tabel, `BESLUTNINGER.md`s egne numre) er IKKE omskrevet — de beskriver hvad der var sandt dengang | `permissions.js`, `dev-brugere.js`, `booking-state.js`, `functions/index.js`, `provisioner-dev.mjs`, `provisioner-v1-test-brugere.mjs`, 16 testfiler, `ARKITEKTUR.md`, `PRISER.md` |
| 121 | **Chaufførappens tre ugatede handlinger fik en permission — og admin kan ikke længere indskrænkes.** Turplan (`etaper`), Timeregistrering (`stemplinger`) og Anmod om frihed (`fravaer`-ansøgningen) var alle ejerskabs- eller modulstyrede uden nogen permission — kunne ikke slås fra pr. rolle. Fire nye permissions lagt OVEN PÅ ejerskabstjekket, ikke i stedet for det. ⚠ **Revisor får IKKE de to nye `.skriv`-permissions** — presettet må stadig ikke indeholde én eneste skrivning. ⚠ **`etaper.laes` kaskaderede ind i KPI'et** — `opgaver`, `disponering` og `oekonomi` arver kravet fra deres kilde (beslutning 44/104's regel), men ingen reel bruger mister adgang, fordi alle fem driftsroller har permissionen som standard. ⚠ **Og et selvstændigt fund:** intet forhindrede at admin blev indskrænket via `roller/admin` — rettet i `permsForTenant()` og afvist direkte i `rolleskriv` | `permissions.js`, `kpi-aggregering.js`, `functions/index.js`, `firebase.rules.json`, `Brugere.jsx`, `Turplan.jsx`, `Timeregistrering.jsx`, `Frihed.jsx` |
| 122 | **Automatisk sag+ticketnummer ved indberetning, selvstændig prioritering, og en synlig "afventer planlægning".** Ny Cloud Function `indberetningIndsend` opretter en indberetning og — kun for driftshændelser — en sag med ticketnummer atomisk i én `update()`, samme figur som `opgaveplanlaeg`. `.write` kræver nu `data.exists()` for at oprette; redigering er urørt. ⚠ **Skadebeskrivelse/modpart afvises eksplicit** — Admin-SDK'et ignorerer `.validate`, så en ukritisk videreførelse ville kunne skrive klassificeret indhold på en ugatet node. ⚠ **Disponenten fik `indberetningerSkrivAlle`** (tilføjelse, ikke overførsel — koordinator beholder den) for selv at kunne prioritere. ⚠ **"Afventer planlægning" er en EGEN kasse** (`vurderet`), ikke slået sammen med den eksisterende opgave-baserede `afventer` — samme kilde-skel som `nye` allerede håndhæver | `functions/index.js`, `firebase.rules.json`, `permissions.js`, `audit-regler.js`, `indberetningplan.js`, `Indberetningtriage.jsx`, `driftskalender.js`, `Indberetning.jsx`, `Overblik.jsx`, `Arbejdskoe.jsx` |

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

Opdateret 22. august 2026. **Start her efter en pause.**

⚠ **TALLENE HERUNDER ER MÅLTE, IKKE SKREVNE.** Der stod *957 tests* og
*27 af 30 skærme* i månedsvis; der var 2619 og 54. Overskriften og tabellen
under den var endda uenige med hinanden — 27 mod 29 — og det er dét afsnit
man læser efter en pause. Et forkert tal i Status er samme fejlklasse som
beslutning 52: en drevet tabel sagde at en spærring manglede, og derfor
kiggede ingen på om den virkede.

**Derfor står der ikke længere et tal her som ingen prøve holder.**
`test/dokumentation.test.mjs` læser skærmtallet ud af `nav.js` og
prøvefiltallet ud af `test/`, og fejler hvis README siger noget andet. Det
samlede antal prøver står der IKKE: det kan kun måles ved at køre suiten, og
et tal ingen prøve kan holde, hører ikke i et dokument der bliver læst som
en kendsgerning.

**Kernen er på plads.** Byggeklodserne i `fleet/` er i brug på tværs af
skærme, og **163 prøvefiler** kører via `npm test`. `.githooks/pre-commit`
gør dem obligatoriske dér hvor de hører til: regeltestene når
`firebase.rules.json` ændres, designtestene når `src/` ændres.
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

### Skærmene: 64 i alt, og alle har indhold

⚠ **Overskriften sagde "27 af 30" mens tabellen under den sagde "Bygget
(29)".** To tal om det samme, i to linjer med et blankt mellemrum imellem,
og begge forkerte. De blev skrevet dengang Warehouse, Unitbooking og
Procures fire nye skærme ikke fandtes — og så voksede produktet fra dem.

**Tallet læses nu ud af `nav.js`**, som er det ene sted en rute kan opstå
(en skærm uden nav-post kan ikke nås, og en nav-post uden skærm er en menu
der fører til ingenting). `test/dokumentation.test.mjs` fejler hvis rækkerne
herunder ikke passer med katalogets.

Skive 2A (V1-redesign) grupperer disse i sidebaren under fire overskrifter —
Fælles, Driftsmoduler, Administration, Hjælp — men grupperingen er et
render-lag i `AppShell.jsx` (`gruppe`-feltet pr. punkt), ikke en ny
node/permission. Kunder og Fakturaer & bilag er nu egne topniveaupunkter
(tidligere børn under hhv. Opsætning og Økonomi & Rapporter) med samme
`kraeverModul`/`kraeverPerm` og samme rute som før — kun menupladsen flyttede.

| Modul | Skærme | |
|---|---|---|
| Dashboard | 1 | referencemodulet — start her når du skriver et nyt |
| Kunder | 1 | Skive 2A: flyttet ud af Opsætning til en fælles arbejdsindgang. Samme `kraeverModul: "kunder"` |
| Fakturaer & bilag | 1 | Skive 2A: flyttet ud af Økonomi & Rapporter. Samme rute og samme `kraeverPerm: "indkoeb.laes"` — overgangstilstand, se nav.js |
| Leverandører | 1 | Skive 4B: flyttet ud af Procure — fælles platform-masterdata for Fleet, Facility og Procure. Samme rute (`/indkoeb/leverandoerer`), ny `kraeverPerm: "leverandoerer.laes"` |
| Økonomi / Fakturagrundlag | 2 | begge børn skjulte (Overblik siden V1: LATER, Fakturagrundlag siden masteropgave §5: sat på pause). Fakturacenter er flyttet til Fælles > Fakturaer & bilag. Ruten findes stadig, kun menuen tier |
| Planning | 6 | heraf Forslag & reservation som skjult detaljerute |
| Fleet | 8 | Fleet TARGET (masterbrief §1/§9, produktejer-review 2026-09-01): kun Overblik (sti `/flaade`, samme som toppunktet selv) er ikke `skjulINav` — og tegner alligevel ingen undermenu, da AppShell kræver mindst to synlige børn for en chevron. De øvrige syv — Driftskalender, Indberetninger, Udgifter (TARGET-punkt 3, bygget 2026-09-05 — ren sammenstilling af `opgaver` og `fakturaer`, ingen ny node), Servicebog, Statistik, Kontakter, Arbejdskø (kun "åbn i nyt vindue") — er skjulte. Navigation mellem alle otte sker i modulets egen `ModulNav`-fanebjælke øverst på hver skærm (fleet/modulfaner.js), ikke i sidebaren. Enheder vises også i fanebjælken, men er stadig samme nav.js-punkt under Opsætning — ingen dobbelttælling |
| Facility | 6 | Facility TARGET (samme masterbrief §1, produktejer-review 2026-09-02): kun Overblik (sti `/facility`, samme som toppunktet selv) er ikke `skjulINav`. De øvrige fem — Service & reparation (Servicekalender.jsx, uændret indhold), Inventar, Planlagt, Statistik og Klima & energi (V1: LATER) — er skjulte. Navigation mellem de fire første sker i modulets egen `ModulNav`-fanebjælke øverst på hver skærm (fleet/modulfaner.js's FACILITY_FANER); Klima er ikke en fane i bjælken, fordi den er eksplicit uden for V1 |
| Procure | 7 | Procure TARGET (samme masterbrief §1, produktejer-review 2026-09-02): kun Overblik (sti `/indkoeb`, samme som toppunktet selv) er ikke `skjulINav`. De øvrige seks — Bestillinger (behov, kladder og godkendelse samlet), Varer, Arkiv, Statistik, Match & kontantkøb og Varelager — er skjulte. Navigation mellem de fire første sker i modulets egen `ModulNav`-fanebjælke øverst på hver skærm (fleet/modulfaner.js's PROCURE_FANER); Match & kontantkøb og Varelager er ikke faner i bjælken, nået via kontekstuelle links i stedet — Leverandører er stadig flyttet til Fælles |
| Warehouse | 11 | modulet med flest skærme |
| Unitbooking | 4 | Kalender, Udlån, Historik, Reolpladser |
| Workforce | 3 | heraf Bemandingsplan som skjult detaljerute (V1: LATER) |
| Opsætning | 10 | heraf Kundepriser pr. kunde og Integrationer som skjulte detaljeruter (V1: LATER). Kunder er flyttet til Fælles. Godkendelsesregler er ny (Procure TARGET trin 4) — administrations-UI'et for Procures godkendelsesregler, flyttet ud af Godkendelser.jsx |
| Hjælp | 3 | heraf Supportoverblik og Supportsag som skjulte detaljeruter |
| **I alt** | **64** | **38 i menuen, 26 skjulte detaljeruter** |

| | |
|---|---|
| **Bygget som LÆSESKÆRME** | Opsætning → Generelt og Brugere & roller viser hvad der findes — tenant, moduler, lokationer, roller og permissions — og har **al skrivning deaktiveret med en begrundelse**. De åbne spørgsmål i `FleetControl-spoergsmaal.md` handler alle om at ændre, og de blokerer ikke en visning. Spørgsmålene står **på skærmen**, ikke kun i en fil |
| **Kun demo-data** | De tre Support-skærme læser `demo-support.js` direkte, fordi `support/sager` ikke findes i `firebase.rules.json`. Det er lovligt netop dér hvor der ingen node er at spørge — se beslutning 64 |
| **Fjernet** | Idébank. Beslutning 22 afgjorde at den ikke hører i kundens installation; rute, skærm, `idebank.skriv` og noden i regelfilen er væk (beslutning 31) |
Hver skeletfil har en kommentar i toppen med hvad der skal bygges og hvilke
fejl fra mockuppen der skal undgås. **Læs den før du rører filen.**

⚠ **"Alle har indhold" er ikke det samme som "alle er færdige".** Fem
skærme venter stadig på et SVAR frem for på kode — se *De fem skærme der
venter* nedenfor. De har fået deres produktvalg i beslutning 22; det er
detaljerne der mangler, og de må ikke bygges på gæt.

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
   ⚠ **Indeslutningen er nu lukket — beslutning 90.** En reservation på
   `lokation/lok-halb` og en på `facilityAktiv/fa-port3` er stadig to
   stier, men ét fysisk rum: `indeslutninger()` siger hvilke andre stier
   der beskriver samme rum, og `tjekLedigIndesluttet()` kører tjekket mod
   dem alle. Begge veje, i **begge** funktioner — og Servicekalenderen
   tegner hallens blok som en skygge på de porte den lukker, så skærmen
   ikke tilbyder en tid serveren afviser.

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

⚠ **SKIVE 3A FLYTTEDE DAGSGITTERET TIL FLEET.** Afsnittet herunder beskriver
hvordan de to gitre opførte sig da de begge boede i `Disponering.jsx` — den
historie og de bugs den fanger, er ægte og står derfor uændret. Men
dagsvisningen (opgaver med art `vaerksted`, `Planlaegdialog`, `flytOpgave()`,
`kanFlyttes()`) findes ikke længere i den fil: den flyttede til
`flaade/Vaerkstedskalender.jsx`, som allerede havde nøjagtig den samme
kalender. To skærme der planlagde samme node, var to steder at være uenige om
den — se **Canonical-home-reglen** nedenfor. `Disponering.jsx` er nu kun
ugevisningen (etaper), plus at den stadig BYGGER værkstedets reservationer ind
i sit konflikttjek, af den samme `reservationFraOpgave()` — en bil på løftet
skal stadig spærre en tur, selvom skærmen ikke længere tegner den.

To faner, to noder: dagsvisningen læste `opgaver` med art `vaerksted` (timer,
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

⚠ **Indeslutningsreglen er bygget — beslutning 90.** En reservation på
`lokation/lok-halb` og en på `facilityAktiv/fa-port3` er to forskellige stier
og ét fysisk rum. Hullet havde stået siden 49 i `facilityplanlaeg` og
`opgaveflyt`, mens `reservationFraOpgave()` hele tiden bar sætningen *"lukker
man hallen, er alle porte i den også optaget"*. Skærmen sagde det rigtige;
datamodellen håndhævede det ikke.

`indeslutninger()` i `reservations.js` siger hvilke andre stier der beskriver
samme rum; `tjekLedigIndesluttet()` kører `tjekLedigMod()` mod dem alle og
mærker hver konflikt med **hvor** den kom fra. Tre ting er værd at kende:

- **Begge veje.** Var den kun den ene, ville rækkefølgen afgøre udfaldet: book
  hallen først, og porten kunne stadig tages.
- **Ingen kaskade mellem søskende.** To porte i samme hal er uafhængige. Ellers
  ville ét servicebesøg lukke et helt anlægsområde.
- **Ingen reservation pr. port.** Et blok på hallen er ÉN reservation; det er
  KONTROLLEN der er udvidet. N poster for ét arbejde ville drive fra hinanden
  første gang én blev flyttet — `bemanding.ledig` igen.

⚠ **Og `tjekDisponering()` fik den ikke, fordi den ikke kan bruge den.** En
etape binder `koeretoej` og `medarbejder` (`reservationerFraEtape()`) —
ingen af dem har en indeslutning, og `indeslutninger()` svarer `[]` for dem.
Et kald dér ville være en no-op der lignede dækning. Målt frem for antaget.

### Canonical-home-reglen — Skive 3A

VIEW_COMPOSITION, ikke ny datamodel, serverlogik eller forretningsregel: tre
arbejdsopgaver havde fået en parallel flade, og Skive 3A gav hver af dem
præcis ét kanonisk hjem.

| Arbejde | Kanonisk hjem |
|---|---|
| Værkstedsopgave (planlæg, flyt, statusskift) | Fleet → **Driftskalenderen** |
| Transportforslag / godkendelse | Planning → **Disponering** |
| Facility-service | Facility → **Servicekalenderen** |

**Alt andet er et deep link eller en kontekstuel indgang, ikke en alternativ
arbejdsflade.** To konsekvenser af det:

- `/booking/forslag/:id` og `/flaade/koe` findes stadig som RUTER — et
  bogmærke, et link fra en kollega eller "Åbn i nyt vindue" skal virke uden
  at man først har klikket sig ind fra den rigtige skærm. Men koden bag dem
  (`ForslagOgReservation` i `Forslag.jsx`, `ArbejdskoeIndhold` i
  `Arbejdskoe.jsx`) er den SAMME komponent som det panel Disponering
  henholdsvis Driftskalenderen åbner — der er ingen kopi at drive fra.
- En skærm der opdager at den reelt har brug for at EJE et andet moduls
  arbejde (skrive dets node, gentage dets filter), er ikke længere en
  kontekstuel indgang — den er begyndt at blive en parallel flade, og hører
  hjemme i en ny beslutning, ikke en stiltiende udvidelse.

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

### Det linten fandt — og hvorfor et ubrugt navn ikke bare slettes

`npm run lint` kører seks regler, alle af den slags der svarer ja eller nej.
Begrundelsen for at der ikke er flere, står i beslutning 41. Linten kører
automatisk i `.githooks/pre-commit` når en `.js`, `.jsx` eller `.mjs` er
ændret, og `npm test` kalder den før regelprøverne.

Første gennemløb fandt **nul** `no-undef` — de fem hvide skærme var rettet i
forvejen. Fundene var alle `no-unused-vars`, og **de er alle rettet nu**. Men
måden de blev rettet på, er pointen.

⚠ **Navnene blev ikke bare fjernet.** Et fjernet navn tager beviset med sig, og
så er der ingen der ved at kontrollen mangler. De stod derfor et stykke tid med
en `eslint-disable-next-line` og en note — hvilket er det rigtige den dag, men
**en dæmpning er en udsættelse, ikke en beslutning**, og den kan sidde i årevis.

- **`Bookingopsaetning.jsx`** — en afvist læsning faldt igennem til et tomt
  satsark. Rettet i beslutning 41.
- **`booking/Oversigt.jsx` — `visAlle` havde ingen kontrol.** Afsluttede
  forløb var permanent skjult, mens fodnoten sagde *"Viser N af M hentede
  bookinger"* — **brugeren fik at vide at der var noget han ikke kunne se, og
  der var ingen vej til det.** Har nu en knap der siger hvor mange.
- **`udbyder/Prisliste.jsx` — `sidstRettet` blev regnet og vist ingen
  steder.** Står nu øverst i "Prislister", med teksten *"sidst lagt"* frem for
  *"gælder fra"*.
- **`Oekonomi.jsx` — dækningsgradsafvigelsen.** ⚠ **Den stod her som en
  bisætning** (*"samme mønster"*) og var ikke registreret som et fund. Den bar
  **en fejl mere:** `daekningsgradPct - maalDaekningsgradPct` er `x − null = x`
  — et `null` der ser ud som en måling, og gaten i `deviation()` nås aldrig.
  Den var **usynlig så længe tallet ikke blev vist**.

⚠ **Et navn linten klager over, kan være et ubrugt navn OG et forkert
regnestykke** — og man finder kun det andet ved at spørge hvorfor navnet stod
der. `test/linten-fandt.test.mjs` er tosidet: navnet skal **bruges**, og
dæmpningen skal være **væk**. Ellers kan fundet "rettes" ved at slette navnet.
Se beslutning 41 og 67.


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

⚠ **33 felter er `null` — og 16 af dem er ÉT spørgsmål.** Provisioneringen
tæller dem ved hver kørsel og skelner mellem to slags: felter uden kilde og
deltaer der venter på en forrige periode (18 stk. i en frisk base — de retter
sig selv i nat). ⚠ **Tallet er MÅLT ved hver provisionering**, ikke skrevet af:
det stod på 38 længe efter at fire felter havde fået en kilde.

`udenKilde()` er ikke totalen; den er SAMLESTEDET for de kilder der mangler
helt, og den er nu **tom**: flåden og bemandingen fik deres kilde i beslutning
69, og der er ingen node uden data tilbage. De øvrige er null INDE i
beregningen, hver med sin skrevne grund — `sager/` findes ikke, budgettet er
ikke besluttet, og *ledig kapacitet* mangler en **definition**
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
| **Økonomi → Fakturagrundlag** | FleetControl laver **ikke** den juridiske faktura. Ingen nummerserie, kreditnotaer, betalingsregistrering eller rykkere. Den producerer et godkendt, **låst** grundlag der eksporteres. Neutral intern model med adaptere: e-conomic, Dinero, Business Central, CSV. `prepared_by` og `approved_by` findes **altid**, også når det er samme person | **Kæden er bygget:** opret (Warehouse → Afregning), godkend og lås (Fakturering), alle tre gennem `grundlagskriv`. ✅ **Momssatsen er besvaret** (25 %, beslutning 98), og **adapterlaget er bygget** (102): `grundlagseksport.js` oversætter den neutrale model, og Fakturering har to knapper — **Neutral (JSON)** og **Regneark (CSV)**. CSV'en er én række pr. linje, dansk Excel, med kilde-kolonne, og kan importeres i alle tre systemer ved at mappe kolonner. ⚠ **Åbent: et SYSTEMSPECIFIKT format.** Der er bevidst ingen e-conomic-, Dinero- eller Business Central-adapter — jeg kender ikke deres importskemaer, og en opfundet kolonnerække er samme fejl som en gættet momssats: filen ser rigtig ud og fejler i den anden ende, eller importerer HALVT. **Hvad der skal til:** kolonnenavnene og deres rækkefølge fra systemets egen importvejledning, eller en eksempelfil fra en konto. ⚠ Og der er stadig ingen **afsendelse**: filen hentes i browseren, og låsningens **reference** er bindingen til regnskabet |
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
| ~~`sager`~~, ~~`sensitive/sager`~~ | ✅ **Bygget** (beslutning 112). `sag.*`-permissionerne er fordelt på rollerne. Ugated som `opgaver` — `art` er `fleet`\|`facility`. Modtagevej, parsing, afsendelse og scanning (skive 2) mangler stadig — se ARKITEKTUR.md |
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

⚠ **Og efterslæbet er nu MÅLT — men ikke dér hvor det stod.**

Her stod at `udenKilde()` **er** optællingen. **Det var den aldrig.**
Samlestedet rummer én slags null — de helt ukendte kilder — og på sit højeste
stod den på 17, mens det færdige objekt havde 45. Resten var null INDE i
regnestykkerne, hver med sin grund, og de tæller lige så meget for den der
venter på tallet.

⚠ **Det blev synligt da flåden og bemandingen fik deres kilde** (beslutning
69): `udenKilde()` gik **17 → 0**, men kun ni af de sytten blev BESVARET. De
otte flyttede ind i `flaadetal()` og `bemandingstal()`. **Et efterslæb der
bliver mindre af at et null flytter sig, er ikke blevet mindre** — og havde
tallet stået på samlestedet, ville efterslæbet have set lukket ud.

Optællingen ligger derfor på det `beregnKpi()` faktisk returnerer: uden inddata
står **44** felter som null i noden. Med demo-basens rigtige data og en forrige
kørsel er tallet **31** — forskellen er deltaerne, som kun mangler en kørsel
mere. `KILDER_DER_MANGLER` er fortsat tom: der er ingen node uden data.

⚠ **Og tallet er ikke skrevet i hånden.** Det stod fire steder og var forkert
tre af gangene — `CLAUDE.md` sagde **51**, README og kodekommentaren **16**, og
`udenKilde()` **17**. Afsnittet ovenfor beskriver præcis den drift (*"det stod
på 38 længe efter at fire felter havde fået en kilde"*), og svaret dengang var
at rette i hånden. Det drev igen. `test/kpi-efterslaeb.test.mjs` regner nu
tallet og kræver at teksterne siger det samme. Se beslutning 68 og 69.

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
| ~~**Momssatserne pr. linjeart**~~ | ~~En bogholder~~ | ✅ **BESVARET 23. august 2026: 25 %, uden undtagelser.** Truffet af ejeren. `MOMSSATS_SALG` i `grundlag.js`, sat af `byggGrundlag()`, så en linje ikke længere kan mangle sin sats. ⚠ **Forbeholdet blev rejst og fravalgt:** international kørsel er som udgangspunkt momsfritaget (momsloven §34), og demo-grundlaget havde netop en `Skagen → Oslo`-linje der stod tom med den begrundelse. Spørgsmålet blev stillet med den sætning i hånden. Siger en bogholder en dag noget andet, er `MOMSSATS_SALG` det ene sted tallet står. Se beslutning 98 |
| **Retention på `sensitive/indberetninger`** — hvor længe skal en underskrift og en skadebeskrivelse gemmes? | Jurist eller DPO | Sletning. Underskriften er både en personoplysning og et **bevis**, og de to trækker i hver sin retning: databeskyttelsen siger slet, bevisbyrden siger gem. Forældelsesfristen på et erstatningskrav er formentlig det rigtige anker, men det er ikke et gæt vi skal tage |
| **Skal `bus` være et MODUL frem for en division?** ⚠ Divisionsspørgsmålet for flåden og bemandingen er **besvaret** (beslutning 69): ingen abonnent har både gods og bus, så de deles ikke. Men det efterlader et større spørgsmål kunden selv rejste — en abonnent har alligevel kun de moduler han betaler for, så **division og modul er den samme akse målt to gange** | Kunden | Målt sprængradius: **711 linjer i 95 `src/`-filer**, 178 i `functions/`, 317 i prøverne og 55 i reglerne — plus at `kpi/` **er stiformet** efter division (`kpi/<division>/<snapshot>/<domaene>`, beslutning 44). Det er to migreringer og ikke én etape. ⚠ Og de fem `.validate`-noder der KRÆVER division (`bookinger`, `etaper`, `lagre`, `opgaver`, `indberetninger`, `indkoeb`, `kunder`) skal have et svar hver |
| **Audit-retention** | Samme | ⚠ **Mekanismen er nu bygget og venter kun på tallet.** `auditoprydning` finder de forfaldne partitioner og rapporterer dem til `udbyder/retention/`; den sletter intet, fordi `RETENTION_AFGJORT` er falsk. Når juristen svarer: sæt tallet i `RETENTION_MAANEDER`, sæt flaget, og skriv begrundelsen i BESLUTNINGER.md — i den rækkefølge. Prøven `⚠ INGEN RETENTION ER AFGJORT ENDNU` falder samme dag, og det er meningen |
| **Hvad ER `lagre`?** Tre steder i koden kalder den *reservedelslageret under Procure*; `pricing.js` slår op i `satsark.lagre[lagerId]` for **lagerophold** med `prLagerdoegn`-satser. To betydninger, én node | Kunden | ⚠ **Ingen eksistenstjek på `materialelinjer.lagerId`** — et opslag ville låse den ene læsning fast uden at nogen havde valgt. Beslutning 92 fik referencen til at RESOLVE (`lag-kolding`), men den peger nu på en opbevaringslokation, og en reservedel kommer fra et reservedelslager. **Referencen resolver; semantikken gør ikke.** Se beslutning 101 |
| **Fire-øjne på fakturagrundlag** — skal godkenderen være en anden end den der udarbejdede det? | Kunden | Ingenting endnu, men det ændrer `kanGodkende()`. Det er rigtigt i en stor virksomhed og forkert hos en vognmand med to på kontoret, hvor det ville betyde at grundlag aldrig blev godkendt. Hører som en indstilling pr. tenant — ikke som en regel vi vælger for dem |

⚠ **Ingen af dem må besvares ved at gætte i koden**, og momssatsen er beviset
på at det virker: den stod tom i månedsvis, eksporten var spærret for alle, og
den 23. august blev spørgsmålet **stillet og besvaret** — 25 %, uden
undtagelser. Et system der gætter rigtigt ni gange ud af ti, lærer brugeren at
stole på det tiende gæt; et system der spærrer, får spørgsmålet stillet.

⚠ **Og forbeholdet blev rejst FØR svaret, ikke bagefter.** International kørsel
er som udgangspunkt momsfritaget (momsloven §34), og det stod i koden med en
`Skagen → Oslo`-linje. Svaret kom med den sætning i hånden. **Det er forskellen
på en beslutning og en antagelse.**

## Divisionsefterslæbet — lukket i beslutning 87

Gods/Bus-aksen blev fjernet i **beslutning 70** og fik sine sidste rester ryddet
i **79** — i shellen, konteksten, `useListe`, Cloud Functions, reglerne og
auditlisten. Prøven `test/division-fjernet.test.mjs` dækkede præcis de steder.

⚠ **Og den kiggede aldrig i `src/moduler/`.** Målt da Procures overblik blev
bygget: **77 levende forekomster i 17 modulfiler** — kode, ikke kommentarer.

⚠ **En lint der springer noget over, siger ikke nej — den siger ingenting.**
Samme sætning som `demo-i-skaerm.test.mjs` bærer om `bookinger` (beslutning
56). Anden gang mønstret koster noget.

| | Antal | Hvor |
|---|---|---|
| Målt (beslutning 84) | **77** | 17 modulfiler |
| Ryddet i Procure (84) | −26 | `indkoeb/Oversigt.jsx`, `indkoeb/Leverandoerer.jsx` |
| Ryddet i resten (87) | −51 | 14 modulskærme |
| **Tilbage** | **0** | — |

**`DIVISIONSLOFT` findes ikke længere.** Tallet er nul for hele
`src/moduler/`, og det er et **forbud**, ikke et loft: et loft kan ikke
opdage at aksen kommer tilbage ét sted mens den forsvinder et andet.

⚠ **Én undtagelse, og den er ikke en lempelse.** Syv sætninger forklarer at
feltet IKKE findes — på Enheder, Medarbejdere, Facility, Procure og
Opsætning. De skal blive: de er det eneste sted en læser får at vide hvorfor
der ikke er en gods/bus-vælger, og **en prøve der råber ad det korrekte,
bliver slået fra.** `FORKLARER_FRAVAERET` i prøven er den undtagelse.

⚠ **Og den anden prøve er den der virkelig lukker døren:** ingen skærm må
destrukturere `division` ud af `useFleet()`. Alle fundene havde det til
fælles. Konteksten holdt op med at levere feltet i 79, men **en
destrukturering af et felt der ikke findes, fejler ikke** — den giver
`undefined`, tavst. Det er derfor de kunne blive stående.

Hvad de 51 faktisk var, står i beslutning 87. Kort: et **påkrævet**
Division-felt i `facility/Servicedialog.jsx` på en node hvis regel forbyder
feltet (servicebesøg kunne ikke oprettes, i begge retninger), et
nøgletalskort på Opsætning → Generelt der sagde **"Divisioner: Gods og bus"**
til kunden, fire filtre der sammenlignede to `undefined`, `Kunder.jsx` der
altid skrev "i godsafdelingen", et `&division=undefined` i en URL ingen
læste, og to variabelnavne der løj.
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
