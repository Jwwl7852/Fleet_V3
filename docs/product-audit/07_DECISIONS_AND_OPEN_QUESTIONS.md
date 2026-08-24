# 07 — Beslutninger & åbne spørgsmål

Kilde: `BESLUTNINGER.md` (118 beslutninger, læst i sin helhed), `README.md` (beslutningstabel + narrative afsnit, læst i sin helhed) og `FleetControl-spoergsmaal.md` (læst i sin helhed). `CLAUDE.md` skimmet for rammesætning — det bekræfter tallet **118 trufne beslutninger** og henviser til README's "Låst rækkefølge" og til `BESLUTNINGER.md` som eneste sted begrundelserne står.

Dette dokument grupperer alle 118 beslutninger efter emne under **Besluttet**, trækker de beslutninger ud under **Midlertidigt besluttet** hvor teksten selv siger at noget afventer en fremtidig (juridisk/regnskabsmæssig/teknisk) validering, samler de spørgsmål som kildedokumenterne selv kalder ubesvarede under **Åbne spørgsmål**, og dokumenterer stedet hvor beslutningsloggen retter sig selv under **Konflikter**. Hver reference er til beslutningsnummeret i `BESLUTNINGER.md`, medmindre andet er angivet.

---

## Besluttet

### Navigation, UI & designtokens
- **1 — Flad sidebar med undermenuer.** Ingen topfaner; designsættet havde tre uforenelige navigationsmodeller, og topfane-varianten overlappede sidebaren 17 steder.
- **10 — Accent er `#125bec`.** Appen brugte `#1f5eff`, logoet og mockups `#125bec` — to blå tæt nok på at ligne en fejl.
- **12 — De to Flåde-værkstedsskærme er slået sammen.** Næsten identiske skærme gav to steder at uploade samme faktura.
- **30 — Kategorifarver er ikke statusfarver.** Fem `--fc-serie-*`-tokens adskilt fra `--bc-ok/warn/block`, valideret med dataviz-validatoren, ikke skønnet.
- **47 — Skærmen er 85 % lyst felt.** Baggrund/kort mørknet ud fra målt rå lysstyrke (58,9 % → 21 % af skærmen ved maksimum), ikke ud fra gamma-korrigeret WCAG-lysstyrke, som forfatterens eget første forsøg fejlagtigt brugte og som blev "målt ned" igen.
- **48 — Skriftstørrelser er ni tokens.** 24 løse værdier på 119 steder konsolideret; tre bevidste undtagelser uden for skalaen (label 100×200 mm, donut-SVG i viewBox-enheder, kalendersøjler).
- **66 — "Udvid til 2 skærme" er URL-baseret tilstand**, ikke `window.open`. Uge, skub, gruppering, type og undertype ligger i URL'en; tenant/division/periode gør bevidst ikke (kunne blive uenige mellem to vinduer).
- **77 — Statusfarverne stod under AA.** `--bc-ok/warn/block` mørknet til 4,5:1 (tekst) og ikoncirkler til 3:1 (WCAG 1.4.11) på alle skærme, målt par for par.
- **97 — Hver kunde hentede hele produktet.** 55 skærme lazy-loadet; startbundlen faldt fra 935 kB til 77 kB.

### Tal, beløb, afvigelser & KPI-nulhåndtering
- **2 — Beløb i hele øre, altid ekskl. moms**, `momsOere` separat felt.
- **3 — Afvigelser gemmes som (faktisk − budget).** Farven følger `betterWhen`, ikke fortegnet.
- **6 — Nøgletal fra én aggregeret node**, `kpi/`; afledte tal beregnes hos forbrugeren, aldrig gemt to steder.
- **11 — Driftsomkostning pr. km ≠ kalkulationspris pr. km.** To forskellige tal delte navn.
- **14 — `indkoebsprisafvigelse` og `salgsprisafvigelse`** har hver sit fortegn og må aldrig kaldes "prisafvigelse".
- **36 — En nul-linje dokumenterer en måling** og skal vises; platformsadgang er sin egen prislinje, frimængden hører til abonnementet.
- **60/61/62 — Hvert KPI-nulfelt skal have en skrevet grund.** To af tre "nul"-felter i `disponering` og `opgaver` viste sig at have en kilde der bare aldrig var spurgt; en prøve (`test/kpi-efterslaeb.test.mjs`) håndhæver nu at hvert null bærer én af tre navngivne grunde (ingen kilde / intet spørgsmål stillet / ingen forrige periode).
- **63/64 — Ingen skærm må læse et demosæt direkte.** Sidste ti direkte demo-opslag fjernet; lint gik fra loft til totalforbud (`demo-i-skaerm.test.mjs`).
- **68 — KPI-efterslæbet tælles ét sted.** Tallet stod forkert fire steder (51/16/16/16 mod rigtige 17); nu udledt af `udenKilde()` alene, håndhævet af `test/kpi-efterslaeb.test.mjs`.
- **71 — Et gemt afledt tal fjernes, ikke rettes.** `bemanding.ledig` (`planlagt − disponeret`) var husets eget navngivne eksempel på fejlen og lå der stadig; fjernet, ikke sat til null.
- **91 — En andel af et udsnit er ikke en andel.** `andelAfIndkoebPct` returnerer nu `null` med grunden `udsnit` når nævneren var afkortet, i stedet for en falsk procent.
- **96 — Afkortede totaler skrives som "mindst N".** 13 KPI-kort der påstod en total de reelt kun havde et udsnit af.

### Booking, etaper, reservationer & unitbooking
- **4 — Én reservationsnode.** Booking, værksted, facility og fravær skriver alle til den; værksted/fravær har højere prioritet end booking.
- **5 — Booking er en tilstandsmaskine med tre roller.** Disponenten må ikke godkende sit eget forslag.
- **7 — Satser versioneres med `gyldigFra`, overskrives aldrig.**
- **8 — Ét nummerformat `PRÆFIKS-ÅÅÅÅ-NNNNN`** fra en counter i en transaction.
- **13 — Live-kort er beholdt** (senere omdøbt Rute & status, beslutning 22) — fandtes deployet, manglede i alle 20 mockups.
- **16 — En booking er et forløb med N etaper**, som egen RTDB-node (ikke barn af bookingen, af hensyn til forespørgsler). Tilstanden ligger på etapen.
- **21 — `opgaver.art` er `vaerksted` \| `facility`**, ikke `langtur` — en langtur er en etape, ikke en tredje art.
- **37 — "Booket" er ikke en kassestatus.** Kassen har kun fire fysiske tilstande; udlån skrives kun server-side, atomisk med reservationen.
- **39 — Enheden er et eget objekt** (`enheder/<serienr>`), bevidst duplikeret mod `beholdning`, betalt med tre discipliner (atomisk skrivning, ét-enhed-pr.-bevægelse, synlig afvigelse).
- **65 — Unitbookings tre tvetydige punkter afgjort, ikke gættet.** Dag/uge/måned-granularitet følger intervallets længde automatisk (med et forbehold om præcisionstab); filterknappen filtrerer rækker på type/undertype, samme ordforråd som Kasser-skærmen; "inaktiv"-status bygges bevidst **ikke**. Tabellen i `UNITBOOKING.md` skriver nu "Afgjort" i stedet for "Ikke bygget", hvor svaret manglede, ikke koden.
- **40 — Forslaget hører på etapen.** Bookingen har ingen egen tilstandsmaskine — dens tilstand er afledt.
- **46 — En transport ER en etape.** Labelen gemmes ikke, den udledes; stregkode verificeret mod uafhængig zxing-dekoder.
- **49 — Gitteret flytter opgaver reelt** (`opgaveflyt`), erstatter en attrap-knap; DST-sikker datomatematik.
- **50 — Opgavens statusmaskine har veje mellem sine seks tilstande.** `udfoert` nås kun fra `igang`; reservationen afkortes ved tidlig afslutning, forlænges aldrig.
- **51 — Facility kan oprette sine egne servicebesøg** (`facilityplanlaeg`), sidste lukkede dør ind i `opgaver`.
- **55/56 — Booking kan oprettes og ses.** `bookingopret` skriver booking+etaper atomisk; oversigt/forslag læser nu de rigtige noder i stedet for demofiler.
- **57/58/59 — Etapemaskinens overgange har alle en dør**, forslag kan faktisk laves og trækkes tilbage (med tidsstempel, ikke sletning); loft på tre aktive forslag.
- **76 — En disponent kan sende et forslag.** `post.forslag?.length` fejlede tavst på nøglet (ikke array) data; virkede kun i demo.
- **90 — Hallen og porten er ét rum.** Booking af en facility-hal låser dens porte og omvendt.
- **92 — `reservationer` flyttet ud af modulgating.** Noden lå fejlagtigt gated til Booking-modulet; en kunde uden Booking kunne ikke læse sine egne 37 værksteds-/fraværsreservationer.

### Adgang, roller & sikkerhed
- **17 — `securityLevel` + klassificerede søskendenoder** (`sensitive/`, `vaerdi/`), aldrig som børn (en `.read` kaskaderer og kan ikke indsnævres på et barn).
- **26 — En afvist læsning er ikke et netværksproblem.** Tre tilstande adskilt: manglende database, manglende bruger, afvist af reglerne.
- **27 — Dev bruger rigtige DEV-brugere**, ikke emulator-mintede claims; seks seedede brugere, én pr. rolle; scriptet nægter at køre mod andet end DEV.
- **28 — Rollevælgeren er en brugervælger.** Claims kan ikke ændres klientside; i dev skiftes session, ikke dropdown.
- **29 — En udrulning er ikke færdig før den er efterprøvet.** `firebase.rules.json` var aldrig udrullet til DEV; `npm run regler:tjek`/`regler:udrul` sammenligner nu byte for byte.
- **31/31b — Roller tildeles; kunden kan nu redigere deres indhold.** Se **Konflikter** — 31b omgør 31 eksplicit, med to mekaniske spærringer mod at spærre sig selv ude.
- **32 — Et lukket abonnement lukker tenanten, ikke kontoen** (bevarer individuelle "spær login"-tilstande).
- **33 — Et fravalgt modul lukker sine noder, læsning og skrivning** — ikke kun sidebaren. Prisen: en kunde kan ikke længere hente egne data uden om et tilkøb.
- **38 — Kundepriser kræver to permissions** (`kunder.skriv` OG `satser.skriv`). ⚠ Kendt, accepteret restgab: en `.validate` kører ikke ved sletning, så `kunder.skriv` alene kan stadig fjerne en prisafvigelse — "afvejningen blev taget med åbne øjne", ikke lukket.
- **41 — Én snæver linter-regel** (`no-undef`, `no-unused-vars` m.fl.) efter fem separate hvide-skærm-produktionsfejl fra udefinerede navne.
- **42 — Mailmønster konsolideret i én delt fil** (`brugere-regler.js`) efter at fire kopier var kommet i utakt (`{2}` vs. `{2,}`).
- **45 — `opgaver` er reelt `.write:false`.** Vejen ind er `opgaveplanlaeg`; disciplinen stod skrevet i kommentarer længe før den blev håndhævet.
- **52 — Write-once dækker hele den underskrevne post**, ikke kun feltet — en `.validate` kan ikke se en sletning, så et slet+gen-skriv omgik den oprindelige spærring.
- **53 — Ingen node kan længere tømmes med ét kald.** Målt: 20/23 poster kunne hardslettes, 17/23 noder kunne tømmes; efter rettelsen 0 noder, 2 poster (med vilje).
- **54 — Dokumentation rettet efter 31b.** Se **Konflikter**.
- **93 — Et modul der ikke kan virke alene, sælges ikke alene** (`MODUL_KRAEVER`-afhængighedstabel).
- **94/95 — Modultjek centraliseret i `useListe`**, men se **Konflikter** — 94's løsning skabte selv en ny tvetydighed som 95 måtte rette.
- **99 — Den ene manglende sensitive-læsning logges nu.** ⚠ Stående forbehold, ikke midlertidigt: logningen er klientside-udløst (`useListe()`), og formuleringen skal derfor være "vi logger læsninger fra applikationen", ikke "vi logger alle læsninger".
- **104/105 — Tre nye læse-permissions** (`satser.laes`, `grundlag.laes`, `indkoeb.laes`), bevidst ikke tretten — en kodekommentar advarede eksplicit mod at "rette" asymmetrien bredt; se **Konflikter**.

### Data, moduler & division
- **9 — (historisk) Gods/Bus gælder hele platformen.** Omgjort af 70 — se **Konflikter**.
- **15 — Division er et felt, ikke en sti** (`gods`/`bus`/`faelles`).
- **18 (trin 1–2) — Personale og flåde er entiteter.** `personId` ≠ `uid`; `art` styrer flådeskemaet.
- **19 — Stamdata har ingen division.** Forbudt på `personale/`/`koeretoejer/` — "intet at dele op", da ingen kunde har både gods og bus.
- **44 — `kpi/` er delt pr. domæne og modul**, ikke kun tenant-medlemskab; domænet arver sin kildes læse-permission (`kunder.laes` for `kpi/.../kunder`). Rolle afgør stadig intet — se **Åbne spørgsmål**.
- **69 — Flåde- og bemandingstal krævede ingen division-opdeling.** Svaret stod i beslutning 19's første sætning: ingen kunde har begge dele.
- **70 — Gods/Bus-aksen fjernet helt.** Division og modul var "samme akse målt to gange"; feltet er nu FORBUDT (`.validate:false`), ikke bare fjernet, i alle 18 regelstier. Se **Konflikter** for forholdet til 9/15/19/44.
- **72/73 — Provisionering til en rigtig kundetenant** (ikke kun `demo`); ti skærme der så "i stykker" ud skyldtes én tom `kpi`-node efter en for bred oprydning.
- **74/75 — Systematisk eftersyn af divisionsoprydningens fald-ud**, i stedet for at vente på fejl nr. 4 (selvkontroller, en stadig-krævet Division-selector, demo-totaler der kun summerede gods-halvdelen).
- **79 — Cloud Functions skrev stadig det forbudte `division`-felt** via Admin SDK, som omgår `.validate`. Rettet i fire funktioner.
- **84/87 — Divisionsefterslæbet i `src/moduler/` lukket til nul.** 77 forekomster fundet, 26 ryddet i Procure (84), 51 i resten (87); linten dækker nu modulskærme, ikke kun shell/kontekst.
- **100/101 — Seed respekterer nu kundens moduler korrekt**, og 18 ellers utjekkede referencefelter fik hver sin dokumenterede begrundelse i `UDEN_TJEK`. Ét felt (`materialelinjer.lagerId`) forblev bevidst uden tjek — se **Åbne spørgsmål**.

### Fakturering, Procure & priser
- **18 (trin 3) — Færgetakster bruger et længdebånd på satsen** (ikke et ekstra nodeniveau), interval `(fra, til]`. Feltet `laengdeMm` var valideret i årevis, men aldrig læst — reel prisfejl på op til 1.192 kr/overfart.
- **20 — Sagsbaseret mail: sagsnummeret i emnefeltet ER integrationen.** Kun webhook-vej bygget, ikke Graph/Outlook. Se **Åbne spørgsmål** for trådretention.
- **22 — De ni skærme uden mockup fik navne og retning.** Fakturering hedder Fakturagrundlag (ingen juridisk faktura); Live-kort hedder Rute & status (ingen GPS); Kompetencer skelner lovkritisk/virksomhedskrav; Leverandører får objektive tal, ingen stjerner; Idébank fjernet fra kundeinstallation.
- **25 — Se Midlertidigt besluttet.**
- **78 — Procures planche-proces var delvist attrap.** `indkoeb`-noden er et bagudskuende købsregister, ikke en forud-flow; `indkoebsbehov`/`indkoebsordrer` lagt som `.write:false`.
- **80/81/82/83 — Procures fire trin bygget:** behov (mængde bevidst valgfrit), bestilling (én pr. leverandør, ét `update()`), godkendelse (policy, default fra, ingen selv-hævelse af egen grænse), faktura-match (score 0–100, aldrig 100 uden PO-nummer, aldrig persisteret).
- **85 — Procures eget forbrugsvarelager** (`forbrugsvarer`), 4. gang et lagernavn skal skilles fra et andet i samme kodebase (Fleet `lagre`, Warehouse `varer`/`beholdning`).
- **86 — Ét fælles Fakturacenter** på tværs af Fleet/Facility/Procure, over den eksisterende `fakturaer`-node — ingen ny node.
- **98 — Momssatsen er 25 %, uden undtagelser**, sat af ejeren 23. august 2026; eksporten var spærret indtil svaret forelå.
- **102 — Adapterlag til regnskabseksport.** Neutral model (JSON) + egen CSV (én linje pr. linje, kroner med komma, kildekolonne); bevidst ingen e-conomic/Dinero/Business Central-adapter endnu.
- **112 — Sagsbaseret mail, skive 1: den mail-uafhængige halvdel bygget** (regler, permissions, `sagOpret`/`sagBeskedSkriv`/`sagKarantaeneFrigiv`/`sagAftaleBekraeft`). Bevidst delvist — se **Åbne spørgsmål**.

### Chaufførapp & personaledrift
- **103 — Chaufføren fik en skrivevej.** `brugere/<uid>.personId` kobler login til medarbejder; tid kommer fra telefonen (ikke serveren, af hensyn til dårlig dækning); `klientId` gør gensendelse ufarlig.
- **106 — Otte hændelsesarter, delt driftshændelser/udgiftsregistreringer.**
- **107 — Stempling bygget flad, uden position.** Se **Åbne spørgsmål**.
- **108 — "Man ansøger ikke om sygdom."** Kun tre ikke-helbredsrelaterede fraværstyper kan søges af chaufføren selv; sygdom sættes kun af kontoret (GDPR-artikel 9-data).
- **109 — Indberetning kædet til den opgave den udløser**, og syv seedede poster fik rigtige ejere i stedet for placeholder-uid'er.
- **110 — Turplan-stopmodel bygget**; det aldrig-brugte `fraAdresse`/`tilAdresse`-par forbudt, ikke fjernet.
- **114 — Offline-meldingskø** for chaufførappens statusmeldinger; gensender med samme `klientId`.
- **116 — Stempeltest-fælde rettet** for lukkede vagter tidligt i ugen (samme fejlklasse som `stp-aaben` løste i den anden ende).
- **117 — Chaufføren kan kun nå `/app`.** Rettet på rollen (`erChauffoer`), ikke på hver skærm; `harAdgang` selv er urørt.
- **118 — Rettelse af hængende enhedsreference** fundet under 117's test (booking-oversigt crashede for alle roller på en slettet køretøjsreference).

### Support, sagsbaseret mail & ejerkonsol/abonnement
- **20/23/24 — Sagsbaseret mail og supportadgang.** Support er tidsbegrænset og kundestyret, ingen standardadgang; auditudtræk på sagen er ±5 min/50 poster. Se **Konflikter** for 24's rettelse af 23. Ikke bygget endnu (efter fase 1).
- **34 — Ejerkonsollen skriver aldrig direkte** — kun via Cloud Functions med `udbyder===true` som første tjek.
- **35 — Ejerskab tildeles kun via servicekontonøgle** (`npm run ejer:giv`), aldrig fra konsollen selv.
- **89 — Abonnementshistorik er append-only.** Se **Konflikter** for ABONNEMENT.md's selvmodsigelse, som denne beslutning afgjorde.

### Kvalitet, dokumentation & proces
- **43 — Widget-loftet på brugerens eget dashboard er fjernet** (var vilkårligt sat til 12 og talt forkert to steder). Afslørede samtidig at `kpi/` dengang var læsbar uden nogen permission — lukket delvist af 44.
- **67 — Tre linter-dæmpede ubrugte navne var hver en anden fejl** end "ubrugt navn": en permanent skjult filterknap, en aldrig-vist tidsstempel-note, og en reel regnefejl i dækningsgradsafvigelsen.
- **88 — README's status-tal blev målte, ikke skrevne** ("957 tests"/"27 af 30 skærme" var i virkeligheden 2619/54); nu håndhævet af `test/statustal.test.mjs`.
- **111 — Se Konflikter.**
- **113 — Se Konflikter.**

---

## Midlertidigt besluttet

Disse beslutninger er truffet — arkitekturen eller retningen ligger fast — men teksten selv siger eksplicit at det endelige svar (et tal, en udrulning af en mekanisme) afventer en fremtidig vurdering udefra.

- **115 — Retention pr. datatype: arkitekturen nu, sletningen aldrig endnu.** Fjorten retention-kategorier kortlagt (`RETENTION_KATEGORI`), hver med `periodeMaaneder: null` og `afgjort: false` — intet gættet tal. Legal hold, dry-run-simulering og hooks (`anonymiser()`, `eksporterFoerSletning()`, `slet()`) er bygget, men de tre hook-funktioner **kaster** hvis de kaldes; ingen stille no-op. Den styrende begrænsning, citeret ordret:

  > *"Byg ikke automatisk sletning eller egentlig anonymisering endnu. Det aktiveres først, når konkrete frister og behandling pr. datatype er valideret med revisor/GDPR-rådgiver."*

  Selve anonymiseringen af `personale`/`brugere` er eksplicit ikke bygget — "det spørgsmål besvares sammen med de øvrige frister."

- **Audit-retention, 24 måneder (foreløbigt tal).** Ikke sin egen nummererede beslutning, men et stående forbehold dokumenteret i beslutning 31's afsnit og gentaget i README's "Låst rækkefølge": *"Tallet er foreløbigt og skal afgøres juridisk, før den første betalende kunde er på platformen."* Bogføringsloven trækker mod 5 år for regnskabsgrundlag, GDPR mod kortere for personoplysninger — sandsynligt udfald er forskellig retention pr. posttype, ikke ét tal. Mekanismen (`auditoprydning`) kører allerede og rapporterer forfaldne partitioner, men sletter med vilje intet, fordi `RETENTION_AFGJORT` er sat til falsk for alle tre klasser. Denne sætning i README/`FleetControl-spoergsmaal.md` er skrevet før beslutning 115 (samme dag, 24. august 2026) og er nu det generelle rammeværk, som 115 formaliserede pr. datatype.

- **25 — "De fire sidste skærme — og det er ANTAGELSER, ikke afgjorte krav."** Fakturagrundlag som opgørelse (ikke faktura), materialeforbrug som salg+lagertræk, kompetencekrav fra enheden, leverandørtal med deres grundlag — alt sammen bygget, men beslutningsteksten selv klassificerer dette som **noget vi tror, ikke noget vi ved**, og siger det skal "efterprøves hos første kunde", i modsætning til de 24 foregående beslutninger som afgjorde noget kendt. Beslutning 22 og 98 har siden gjort dele af dette endeligt (fakturagrundlag-retning, momssats); resten (skadeforløbets tilstandsmaskine, hvem godkender grundlaget) står stadig som antagelse — se **Åbne spørgsmål**.

- **112 — Sagsbaseret mail, "skive 1".** Beslutningen er eksplicit fase-inddelt: kun den mail-uafhængige halvdel er bygget. `sagAftaleBekraeft`-funktionen findes, men er "ikke nåelig endnu" — ingen skriver `aftaleforslag`, før mailmodtagelsen (skive 2) er bygget.

---

## Åbne spørgsmål

Spørgsmål som kildedokumenterne selv markerer som ubesvarede — de fleste i README's tabel "Uafklaret — blokerer fase 2" og i `FleetControl-spoergsmaal.md` (ajourført 24. august 2026, jf. beslutning 113).

| Spørgsmål | Hvor det står | Hvem skal svare |
|---|---|---|
| **Retention på `sensitive/indberetninger`** — hvor længe gemmes en underskrift/skadebeskrivelse? Underskriften er både en personoplysning og et bevis, og de to peger hver sin vej. | README "Uafklaret", beslutning 115 (kategorien er kortlagt, ikke besvaret) | Jurist/DPO |
| **Skal `bus` være et modul frem for en division?** Kunden har selv peget på at "division og modul er den samme akse målt to gange." Sprængradius målt: 711 linjer i 95 `src/`-filer, 178 i `functions/`, 317 i prøver, 55 i regler. | README "Uafklaret", beslutning 69/70 | Kunden |
| **Trådens egen retentionsgrænse i sagsbaseret mail** — "samme åbne spørgsmål som audit-retention": en værkstedssag knyttet til en faktura er regnskabsgrundlag, en sag der løb ud i sandet er drift. | Beslutning 20 (detaljeafsnit) | Jurist |
| **Hvad ER `lagre`?** To betydninger i samme node: reservedelslager under Procure vs. opbevaringslokation med `prLagerdoegn`-sats. `materialelinjer.lagerId` resolver nu til en gyldig post (beslutning 92/101), men semantikken er stadig ikke afgjort — feltet har bevidst intet eksistenstjek. | README "Uafklaret", beslutning 101 | Kunden |
| **Fire-øjne på fakturagrundlag** — skal godkenderen være en anden end den der udarbejdede det? Rigtigt i en stor virksomhed, forkert hos en vognmand med to på kontoret. | README "Uafklaret" | Kunden |
| **Rollebaseret KPI-læseadgang, spor B og C** — nye læse-permissions fordelt på de syv roller, eller flere felter klassificeret i `vaerdi/`. I dag afgør rollen intet ud over de tre kommercielle læsninger (104/105); alle syv roller har `kunder.laes` osv. | Beslutning 44 (tilføjelse), `ROLLER.md` | Produktbeslutning, ikke truffet |
| **Systemspecifikt regnskabseksportformat** (e-conomic/Dinero/Business Central). Der er bevidst ingen adapter — kræver kolonnenavne fra systemets egen importvejledning eller en kontos eksempelfil. | Beslutning 102, README | Ingeniørarbejde, afventer data |
| **Stempling uden position** — spurgt, ikke besvaret. Specifikationen nævner position; beslutning 22 forbyder GPS. Modellen er holdt flad/udvidelig, så svaret ikke kræver en migrering. | Beslutning 107 | Kunden/ejeren |
| **AI-diagnose og systemstatusside for support** — eksplicit "Ikke besluttet". | Beslutning 23 | Ejeren |
| **Hvor Sagsvisning.jsx skal bo** — erstatte eller sameksistere med Værkstedskalenderens eget panel. "Besluttes ikke i forbifarten." | Beslutning 112 | Produktbeslutning |
| **Skadeforløbet** — er det sin egen tilstandsmaskine, eller følger det en almindelig driftshændelses forløb? | `FleetControl-spoergsmaal.md` Del 1, beslutning 25 | Ejeren/Dennis |
| **Opsætning → Generelt** — hvad må en kunde ændre selv, og hvad kræver et opkald til jer (afdelinger, lokationer, CVR, logo)? | `FleetControl-spoergsmaal.md` Del 1 | Ejeren/Dennis |
| **Bruger-invitation og fratrædelse** — mail med link eller manuel oprettelse? Hvem spærrer et login når en medarbejder holder op? | `FleetControl-spoergsmaal.md` Del 1 | Ejeren/Dennis |
| **Rute & status: historik-retention og kundesynlighed** — er sporing i tre uger medarbejderovervågning, der skal kunne slettes? Må kunden se sit eget gods' rute (kundeportal)? | `FleetControl-spoergsmaal.md` Del 1 | Ejeren/Dennis |
| **Fem af seks `restricted`-kontakter kan endnu ikke håndhæves.** Nævnt som stående forbehold i "Låst rækkefølge", ikke uddybet yderligere i de læste kilder. | README "Låst rækkefølge" | Teknisk efterslæb |
| **Læsningslogning er kun klientside**, ikke server-håndhævet — hører til Cloud Functions-arbejdet og er ikke bygget. | Beslutning 99, README "Låst rækkefølge" | Teknisk efterslæb |
| **GDPR-bruds-proces, SSO, dataeksport/migreringsværktøj, kunde-testinstans, "hvad hvis I bliver ramt af en bus"** — samlet i `FleetControl-spoergsmaal.md` Del 3 som spørgsmål en større kunde stiller og som er dyre at svare forkert på; ingen af dem er endeligt besvaret i kildedokumenterne. | `FleetControl-spoergsmaal.md` Del 3 | Ejeren/Dennis |

De "fem der bør besvares først" (`FleetControl-spoergsmaal.md`): eksportformat + godkender-fordeling for Fakturagrundlag, retention/kundesynlighed for Rute & status, chaufførappens næste prioritet, retention pr. datatype (delvist adresseret af beslutning 115, tal mangler stadig), og supportadgang (model besluttet i 23/24, ikke bygget).

---

## Konflikter

Steder hvor en senere beslutning eksplicit retter, omgør eller modsiger en tidligere — eller hvor et dokument viste sig at modsige sig selv.

- **Beslutning 24 retter beslutning 23.** 23 gav support "audit.laes" på kundens tenant; 24 erstatter det med et bundet ±5 minutters/50-posters udtræk på selve sagen: *"Et loft der kan hæves af den der rammer det, er ikke et loft."* Beslutning 24 er den autoritative model.

- **Beslutning 31b omgør beslutning 31.** 31 fastslog "roller er faste — man ændrer dem ikke". 31b vender det om: kunden kan nu redigere en rolles indhold, med to mekaniske spærringer (kan ikke fjerne `brugere.skriv` fra sidste rolle der har den eller fra egen rolle) og med `roller/` som **kilde**, aldrig som **håndhævelsespunkt** (reglerne læser den aldrig). Beslutning 31's oprindelige tekst er bevidst bevaret i loggen, fordi den er det eneste sted der står hvad der går galt uden spærringerne. 31b er gældende.

- **Beslutning 54 retter tre dokumenter efter 31b.** `CLAUDE.md`, `README.md` og `ARKITEKTUR.md` sagde stadig "rollerne er faste" og "der er ingen `roller/`-node" — begge sande da de blev skrevet, begge forkerte efter 31b. Den præcise tabelrække: README sagde *"rollespørgsmålet står som ikke afgjort"*, hvor *"31b afgjorde det."* Rettet med nye "sætninger der ikke må stå"-tests i `test/dokumentation.test.mjs`, som er levende betingelser — forbuddet ophører automatisk hvis koden gør sætningen sand igen.

- **Beslutning 70 sætter beslutning 9, 15 (delvist) og 44 (delvist) ud af kraft**, uden at slette dem fra loggen. Gods/Bus var ikke en selvstændig akse — kunden selv formulerede det: *"En abonnent har jo alligevel kun de moduler han vil betale for."* Feltet er nu **forbudt** (`.validate:false` på 18 stier), ikke fjernet — en slettet regel ville tillade det igen uden at nogen havde besluttet det. Beslutning 9, 15, 44 er bevidst ikke slettet fra listen: *"De var rigtige da de blev truffet, og rækken der siger hvorfor de ikke er det længere, er den eneste måde den næste kan se hvad der gik galt uden dem."*

- **Beslutning 89 dokumenterer at `ABONNEMENT.md` modsagde sig selv.** Afsnit 6 kaldte `abonnementHistorik` "værdifuld fra første dag" og hastende; afsnit 7 i samme dokument sagde *"Afsnit 2 foreslog `abonnementHistorik`. Den er droppet."* Forfatteren byggede først ud fra afsnit 6 og opdagede modsigelsen undervejs. Beslutning 89 er den autoritative afgørelse: noden bygges, append-only.

- **Beslutning 92 retter en fejlagtig modulgating, og navngiver den som beslutning 45's fejl spejlvendt.** `NODE_MODUL` gatede `reservationer` til Booking-modulet alene; en DEV-kunde uden Booking havde 37 reservationer, 0 fra booking, og kunne læse ingen af dem — inklusive sine egne værksteds- og fraværsreservationer. *"Det er beslutning 45's fejl spejlvendt: dér kunne en klient skrive den ene halvdel; her kan han ikke læse den anden."* `reservationer` flyttet til basen, ugated.

- **Beslutning 94/95: en rettelse skabte en ny, beslægtet fejl.** 94 centraliserede modultjek i `useListe`, så en kunde uden et modul stille fik en tom liste i stedet for en afvisning. 95 måtte rette konsekvensen: en tom liste så ud som "ukendt leverandør" i stedet for "spurgte aldrig", og indførte `TILSTAND.modulMangler` som en tredje, eksplicit tilstand.

- **Beslutning 100 modsiger forfatterens egen tidligere diagnose.** To tidligere statusrapporter havde konkluderet at provisioneringen ikke respekterede kundens moduler. Beslutning 100 måler igen og finder: *"Jeg havde sagt at provisioneringen ikke respekterer kundens moduler. **Det gør den.**"* Den reelle fejl var snævrere — en tekst-baseret ankersøgning i regelfils-læseren, der samme mønster går igen i (82, 83, 85, 86, 87, 100, 101).

- **Beslutning 104 er selv svaret på en advarsel skrevet ind i koden på forhånd.** En kommentar ved `bookingLaes` i `permissions.js` sagde eksplicit: *"'RET' DET IKKE ved at tilføje tretten laes-permissions mere... Skal læseadgang generelt strammes... er det en selvstændig beslutning med sin egen begrundelse, ikke en oprydning i navngivningen."* Beslutning 104 er den beslutning kommentaren efterlyste — tre permissions, ikke tretten, og kun hvor fordelingen faktisk består testen (ikke alle syv roller har dem).

- **Beslutning 111 retter en selvmodsigende testundtagelse.** To testfilers "tilladte undtagelser"-lister begrundede fraværet af et eksistenstjek på `anmoderId`/`bestillerId` med at feltet var "et login (uid), ikke en post" — hvilket direkte modsagde kommentarer allerede skrevet i `functions/index.js` og `firebase.rules.json` om at feltet netop ER et `personId`. Forfatterens egen konklusion: *"Det var ikke en forglemmelse, det var en selvmodsigelse."*

- **Beslutning 113 retter `FleetControl-spoergsmaal.md`, ikke en beslutning.** Dokumentet listede stadig "laver FleetControl fakturaen, eller producerer den et grundlag?" som åbent, selv om beslutning 22 havde svaret måneder forinden. *"Fejlen er min, ikke ejerens... en fil der ikke er opdateret, bliver læst som sandheden."* Samme fejlklasse som beslutning 54.

- **Beslutning 118 retter en fejl fundet, men bevidst ikke rettet, i beslutning 117.** 117 fandt at `moduler/booking/Oversigt.jsx` crashede for enhver rolle på en hængende køretøjsreference, men lod den stå ("det hører ikke til beslutning 117"). 118 lukker den — samme faldback-mønster som `kundeNavn`/`opgavePerson` allerede havde, som enhedsvalget manglede.

- **Beslutning 69's egen begrundelse var delvist forkert — rettet af beslutning 71.** 69 undlod at fjerne `bemanding.ledig` med begrundelsen at widget-kataloget ville brænde på en ukendt nøgle. 71 fandt: *"Det var rigtigt om mekanismen og forkert om strengen"* — widget-nøglen hed slet ikke `bemanding.ledig`, og feltet kunne fjernes uden konsekvens.
