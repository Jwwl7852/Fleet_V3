# Fleet (modulnøgle: `flaade`)

Kilder læst for denne dossier: `src/moduler/flaade/Oversigt.jsx`,
`Vaerkstedskalender.jsx`, `Indberetninger.jsx`, `Arbejdskoe.jsx`;
`src/fleet/flaade.js`, `indberetninger.js`, `driftskalender.js`, `prioritet.js`,
`nav.js`, `moduler.js`; `functions/index.js` (`opgaveplanlaeg`, `facilityplanlaeg`,
`opgaveflyt`, `opgavestatus`).

---

## Modul-resumé

- **navn:** Fleet (dansk marketingnavn; modulnøgle, node- og permission-navne
  er stadig `flaade`/`koeretoejer` — se nav.js's note om at navnet skiftede
  uden at nøglen gjorde).
- **formål:** Ejer flådens stamdata (køretøjer/enheder af 9 arter) og flådens
  daglige drift: værksteds-/serviceopgaver, indberetninger fra chauffører
  (skader, reparationer, tankninger m.m.) og disponeringsgrundlaget for om en
  enhed er ledig.
- **primær brugertype:** disponent/koordinator (driftskalender, planlægning),
  værkfører (triage af indberetninger), admin/opsætning (enhedskartotek).
- **vigtigste opgave:** holde styr på hvornår en enhed er på værksted/service
  vs. ledig til disponering, og fange fejl/skader meldt fra marken før de
  bliver et disponeringsproblem.
- **vigtigste funktioner:**
  - Enhedskartotek med art-styret feltskema (9 arter i to grupper: motoriseret/påhængt).
  - Driftskalender: gitterkalender over værkstedsopgaver pr. enhed, med træk-og-slip planlægning.
  - Fem "kasser" (nye/afventer/planlagt/kommende/forsinkede) som et arbejds-overblik, med en tilhørende Arbejdskø-skærm.
  - Indberetninger: ti hændelsesarter i to klasser (driftshændelse vs. udgiftsregistrering), med sensitive underfelter (skadebeskrivelse, modpart, underskrift).
  - Disponeringsregler (`kanDisponeres`, `kraevedeKompetencer`, `nedetidMs`) som andre moduler (Booking/Disponering) også bruger.
- **undermoduler/skærme:** Enheder (Opsætning), Driftskalender (Fleets forside), Indberetninger, Arbejdskø (skjult i nav).
- **afhænger af (andre moduler):** Ingen formelt registreret i `MODUL_KRAEVER` (kun `booking`→`kunder` og `warehouse`→`kunder` findes der). Fleet har dog en *blød* afhængighed af Procure (`indkoeb`): Driftskalenderen slår leverandører op via `leverandoerer`-noden, som er modulspærret på `indkoeb`; uden Procure hentes noden slet ikke (`hent: harProcure`) og formularen siger det i stedet for at tilbyde en tom vælger.
- **afhænges af (hvem læser Fleet):** Facility (deler `opgaver`-noden, filtreret på `art`), Booking/Disponering (bruger `flaade.js`s regler: `kanDisponeres`, `kraevedeKompetencer`, `KOERETOEJ_STATUS`), Økonomi (læser `koeretoejer` og indirekte omkostningstal via kpi/), Indkøb (materialelinjer fra indberetninger bliver til lagertræk).
- **samlet status:** **PARTIAL/delvist BUILT** — læsevejen er solidt bygget for alle fire skærme. Skrivevejen er ægte for driftsopgaver (planlæg/flyt/statusskift går gennem rigtige Cloud Functions med atomar opgave+reservation) og — modsat hvad filens egen forældede kommentar hævder — reelt også for enhedskartoteket (Enheder/Oversigt.jsx kalder en ægte `gem()`-skrivning). Indberetninger kan derimod slet ikke afsluttes/oprettes fra UI endnu (kun visning, bekræftet deaktiveret knap med "Fase 0"-forklaring). Mail/sag-integrationen er fase 0 (kun visning af demo-data, ingen reel afsendelse/modtagelse).
- **overlap-mistanke:** `opgaver`-noden deles med Facility (art-filtreret), `reservationer`-noden deles af fire kilder (booking, værksted, facility-sag, fravær), `sager`-noden (endnu ikke bygget) er tænkt delt mellem Fleet og Facility (art `fleet`|`facility`). Se "Mulige overlap" nedenfor.

---

## Skærme

### Enheder / Oversigt.jsx
- **route:** `/opsaetning/enheder` (filen ligger i `src/moduler/flaade/Oversigt.jsx`, men menupunktet er flyttet til Opsætning — se note nedenfor).
- **sidenavn:** "Enheder" (nav.js), internt "Flådeoversigt".
- **hvem bruger den:** admin/den der vedligeholder stamdata — ikke den daglige disponent.
- **primært formål:** stamdataregister for flådens enheder (køretøjer, trailere osv.), med art-styret feltskema.
- **primær handling:** oprette/redigere en enhed. **Faktisk BUILT** — se note nedenfor om en stale kommentar i filen.
- **sekundære handlinger:** søgning/filtrering (art, lokation, status), se disponeringsstatus og kompetencekrav for en valgt enhed, se seneste indberetninger og de tre dyreste enheder pr. km.
- **data vist:** `koeretoejer`-noden (via `useListe`, ægte RTDB-læsning, demo-fallback `DEMO_KOERETOEJER`), aggregerede KPI-tal fra `kpi/` (aktive, ude af drift, service inden 30 dage, omkostning pr. km), samt afledte tal (`aabneFejlFor`, `nedetidDage`) beregnet lokalt af hentede `indberetninger`/`DEMO_BESOEG`.
- **data der kan ændres:** en enheds fulde stamdata (art, status, kaldenavn, model, registrering, hjemsted, længde, driftsomkostning og art-specifikke felter). **Skrivevejen er reel:** `Enhedsformular.gemNu()` kalder `gem({ sti: sti(id), data: byggKoeretoej(f), ... })` fra `src/fleet/skriv.js`, som udfører et ægte `db.ref(sti).set(data)` mod RTDB (verificeret ved læsning af `skriv.js`). ⚠ **Uoverensstemmelse fundet:** filens eget header-kommentar (linje 56) siger "SKRIVNING ER IKKE BYGGET. Knapperne står der, deaktiverede, med forklaringen." — det er ikke tilfældet i den kode der faktisk står i filen. "Ny enhed"/"Redigér"/"Registrér afgang"-knapperne er kun `disabled` når brugeren mangler `koeretoejer.skriv`-permission, ikke ubetinget. Enten er kommentaren forældet (skrivningen blev bygget efter kommentaren blev skrevet, uden at kommentaren blev opdateret), eller der er en anden spærring der ikke kunne verificeres fra klientkoden alene (fx en RTDB-regel der reelt afviser skrivningen server-side — ikke undersøgt her, da `firebase.rules.json` ikke var en del af denne moduls filliste). **IKKE PÅVIST hvorvidt regelfilen faktisk tillader skrivningen** — kun at klientkoden er fuldt kablet til en reel skriveserverkald.
- **kommer typisk fra:** Opsætning-menuen; også linket fra Driftskalenderens "Enhed" via `kaldenavn`-opslag.
- **går typisk til:** Disponering (kanDisponeres/kompetencer), Indberetninger, Økonomi (omkostning pr. km).
- **overlap med anden side:** Driftskalenderen viser også enheder (i gitterets rækker), men kun det udsnit der har aktivitet i perioden.
- **status: BUILT (klientside skrivevej er reel), med et uafklaret forbehold** — se uoverensstemmelsen ovenfor. Sat til BUILT frem for PARTIAL fordi både læsevej og skrivevej i klientkoden er fuldt kablet til RTDB via de dokumenterede mønstre (`useListe` / `gem()`); det er kun regelfilens faktiske svar der ikke blev efterprøvet i denne gennemgang.
- **demo-data:** ja — `DEMO_KOERETOEJER` (fallback i `useListe`) og `DEMO_BESOEG` (bruges direkte, ikke som fallback, til at beregne nedetid — filens egen kommentar flagger at dette er et bevidst kompromis fordi der ikke findes en anden kilde endnu for besøgshistorik i denne visning).
- **nødvendig for:** admin/opsætning (stamdata), ikke daglig drift.

### Driftskalender / Vaerkstedskalender.jsx
- **route:** `/flaade` (Fleets forside; `/flaade/vaerksted` er en legacy-redirect).
- **sidenavn:** "Driftskalender" (filnavnet er historisk "Værkstedskalender").
- **hvem bruger den:** disponent/koordinator, dagligt.
- **primært formål:** overblik og planlægning af flådens driftsopgaver (værkstedsbesøg) i en gitterkalender (dag/uge/måned pr. enhed).
- **primær handling:** "Planlæg aktivitet" (åbner `Planlaegdialog`, kalder Cloud Function `opgaveplanlaeg`); trække en blok i gitteret for at flytte en opgave (kalder `flytOpgave` → Cloud Function `opgaveflyt`).
- **sekundære handlinger:** statusskifte på en valgt opgave (`Statusskifte` → Cloud Function `opgavestatus`), se hændelsespanel med reservationens detaljer, "kommunikation"/"filer"-faner (sagsbaseret, fase 0/attrap), åbne arbejdskøen fra de fem kasser, "Åbn i nyt vindue".
- **data vist:** `opgaver` (filtreret til `art === "vaerksted"`), `indberetninger`, `koeretoejer`, `leverandoerer` (kun hvis Procure-modulet er aktivt), samt de fem afledte tal fra `driftstal()` i `driftskalender.js`.
- **data der kan ændres:** driftsopgaver — reelt, via ægte Cloud Functions (se Implementation-status). Modulfakturaer (indkøbsregistrering i kontekst) via `Modulfakturaer`-komponenten.
- **kommer typisk fra:** hovedmenuen (Fleet-punktet peger direkte hertil).
- **går typisk til:** Arbejdskø (de fem kasser), Indberetninger (link fra hændelsespanel), Indkøb → Fakturaer (godkendelse sker der, ikke her).
- **overlap med anden side:** samme gitterkalender-komponent (`Gitterkalender.jsx`) som Facility → Servicekalender og Disponering bruger; samme `opgaver`-node som Facility, filtreret på `art`.
- **status: PARTIAL/BUILT for kerneflowet** — oprettelse, flytning og statusskift af driftsopgaver er reelt BUILT (ægte serverfunktioner, atomar opgave+reservation-skrivning). Mail/sag-fanerne er MOCK/DEMO (fase 0).
- **demo-data:** ja, som `useListe`-fallback for alle fire hovednoder (`DEMO_OPGAVER`, `DEMO_INDBERETNINGER`, `DEMO_KOERETOEJER`, `DEMO_LEVERANDOERER`) — kun brugt når der ingen database er, plus `demoSagerFor("flaade")` som *altid* bruges direkte for sagspanelet (ikke fallback — sager-noden findes slet ikke i produktion, fase 0).
- **nødvendig for:** daglig drift.

### Indberetninger.jsx
- **route:** `/flaade/indberetninger`.
- **sidenavn:** "Indberetninger".
- **hvem bruger den:** værkfører/disponent, der trierer hændelser meldt fra chauffører.
- **primært formål:** se og vurdere indberetninger (reparation, skade, dæk, service, andet, tankning, parkering, truckwash, kvittering) fra chaufførappen.
- **primær handling:** "Afslut" en indberetning — **deaktiveret**, med begrundelsen "Fase 0: indberetninger/ skrives ikke fra klienten endnu."
- **sekundære handlinger:** se sensitive felter (skadebeskrivelse, modpart, underskrift) hvis brugeren har `indberetningerSensitiveLaes`; se tidsregistrering, materialeforbrug (to posteringer: faktureret/lagertrukket), brændstofforbrug (km/l regnet af to målerstande).
- **data vist:** `indberetninger`-node (ægte, ingen demo-fallback for hovedlisten), `sensitive/indberetninger/<id>` via `usePost` (kun hentet når brugeren har permission — `auditerSom` logger læsningen), `koeretoejer` (fallback-navneopslag).
- **data der kan ændres:** intet — ingen skriveknap virker.
- **kommer typisk fra:** Driftskalenderens "Se indberetninger"/hændelsespanel-link, hovedmenuen.
- **går typisk til:** ingen videre handling (skrivning mangler).
- **overlap med anden side:** ingen direkte, men "åbne fejl pr. bil" (afledt her) vises også i tabellen i Enheder/Oversigt.jsx.
- **status: MOCK/DEMO for skrivning, BUILT for læsning** — hele skærmen er reelt en visning; ingen handling persisterer. Filens egen kommentar: "APPEN ER IKKE BYGGET — FELTERNE ER."
- **demo-data:** delvist — hovedlisten (`indberetninger`) læses uden demo-fallback (ægte node), men `demoTankninger()` bruges direkte (ikke som `useListe`-fallback) til brændstofberegningen, fordi der ikke findes en selvstændig tankningsnode.
- **nødvendig for:** daglig drift (triage), men uden skrivemulighed er det reelt kun et vinduessystem — arbejdet foregår andetsteds eller slet ikke i systemet endnu.

### Arbejdskø / Arbejdskoe.jsx
- **route:** `/flaade/koe` (`skjulINav: true` — nås kun via query-parameter fra Driftskalenderens fem kasser eller "Åbn i nyt vindue").
- **sidenavn:** "Arbejdskø".
- **hvem bruger den:** disponent/værkfører, som et arbejdslistemål (ikke et selvstændigt menupunkt).
- **primært formål:** vise ét udsnit ad gangen (nye/afventer/planlagt/kommende/forsinkede) af indberetninger eller opgaver, med samme optælling som Driftskalenderens kasser (kalder samme `driftstal()`-funktion — undgår at kort og liste kan give to forskellige tal).
- **primær handling:** ingen skrivning. "Planlæg"/"Flyt"-knapper på hver række er **deaktiverede** med forklaring.
- **sekundære handlinger:** filtrere på prioritet, skifte udsnit (fane-lignende knapper med tal), sidenummerering.
- **data vist:** samme `opgaver`/`indberetninger`/`koeretoejer`/`leverandoerer` som Driftskalenderen.
- **data der kan ændres:** intet.
- **kommer typisk fra:** Driftskalenderens fem kasser (`?vis=<nøgle>&frem=<dage>`).
- **går typisk til:** "Tilbage til driftskalenderen"-link.
- **overlap med anden side:** filteret er bevidst identisk med Driftskalenderens kasser — ikke et overlap-problem, men et design der eksplicit undgår at blive et.
- **status: MOCK/DEMO for skrivning, BUILT for læsning/navigation.**
- **demo-data:** ja, samme fire fallback-sæt som Driftskalenderen.
- **nødvendig for:** daglig drift (arbejdsliste), men rent visnings-værktøj.

---

## Data-entiteter

| Entitet | RTDB-node(r) | Ejes af (NODE_MODUL) | Bruges også af | Kilde-til-sandhed-bemærkning |
|---|---|---|---|---|
| Køretøj/enhed | `koeretoejer` | `flaade` | Booking/Disponering (kanDisponeres, kompetencekrav), Facility (indirekte via opgaver på enhed), Økonomi | Ejet alene af Fleet ifølge `NODE_MODUL`. Ingen `division`-felt (fjernet, beslutning 19/70). |
| Følsomme køretøjsdata (liveGPS) | `sensitive/koeretoejer` | `flaade` | Booking (via `koeretoejer.sensitiveLaes`, som disponent/koordinator/admin har) | Søskendenode, ikke barn — fordi `.read` kaskaderer og ikke kan indsnævres på et barn. |
| Indberetning | `indberetninger` | `flaade` | Ingen anden node-ejer, men data flyder til Indkøb (lagertræk) og Fakturagrundlag (materialesalg) | Ejet alene af Fleet. |
| Følsomme indberetningsdata (skade, modpart, underskrift) | `sensitive/indberetninger` | `flaade` | — | Write-once på underskrift (`.write: "!data.exists()"`); write er dog IKKE bygget fra klienten endnu for hovedposten (fase 0-lignende status på selve indberetningsflowet). |
| Driftsopgave (værkstedsbesøg) | `opgaver` (filtreret `art === "vaerksted"`) | **Base** (ikke i NODE_MODUL — delt mellem Fleet og Facility, art afgør) | Facility (art `facility`) | Bevidst udeladt fra NODE_MODUL-tabellen; kommentar i moduler.js siger eksplicit hvorfor (art er `vaerksted` \| `facility`, beslutning 21). |
| Reservation (spærring af enhed pga. værkstedsbesøg) | `reservationer/koeretoej/<id>` | **Base** (delt af 4 kilder: booking, værksted, facility-sag, fravær — beslutning 4) | Booking/Disponering, Facility, Bemanding | Skrives kun serverside (`.write: false` for klienter), atomart med opgaven. |
| Sag (mailtråd for et værkstedsbesøg) | `sager` (planlagt, art `fleet`\|`facility`) | Ikke registreret i firebase.rules.json — **findes ikke i databasen endnu** | — | Fase 0: kun demo-data (`demoSagerFor("flaade")`) læses, aldrig den rigtige node. |

---

## Implementation-status

Sporer den fulde kæde beskrevet i audit-briefet: indberetning → vurdering → planlægning → leverandør/værksted → mail → kalenderreservation → udførelse → faktura → faktisk omkostning → historik.

1. **Indberetning (oprettelse fra chaufførapp):** Datamodellen og feltskemaet er fuldt designet i `src/fleet/indberetninger.js` (10 arter, 2 klasser, art-styret feltskema, sensitive felter). Men ingen skrivevej findes i den kodebase der blev læst her — `Indberetninger.jsx` viser kun eksisterende `indberetninger`-poster og har ingen opret-knap. Status: **PARTIAL** (model BUILT, ingen bekræftet skrivevej i klienten fundet i denne modulgennemgang — chaufførappen selv ligger uden for Fleet-modulets filer og blev ikke gennemgået her).
2. **Vurdering/triage:** `Indberetninger.jsx` viser forløbstilstand (`FORLOEB`: ny → vurderet → planlagt → paaVaerksted → afventerFaktura → afsluttet) og prioritet, men "Afslut"-knappen er **deaktiveret** med teksten "Fase 0: indberetninger/ skrives ikke fra klienten endnu." Status: **MOCK/DEMO** for selve triage-handlingen; visningen er BUILT.
3. **Planlægning (opret driftsopgave):** Cloud Function `opgaveplanlaeg` (`functions/index.js:3396`) er **reelt BUILT**: tjekker permission (`opgaver.skriv`), abonnement, modulaktivering, validerer form (`valideOpgaveplan`, delt med klienten), tjekker at enheden ikke er solgt/skrottet, bygger reservation via `reservationFraOpgave()`, tjekker ledighed (`tjekLedigMod`), og skriver opgave + reservation atomart i én `update()`. Kaldes fra `Vaerkstedskalender.jsx`'s "Planlæg aktivitet"-knap via `Planlaegdialog.jsx`.
4. **Leverandør/værksted:** `leverandoerId` er et felt på opgaven, opslået mod den modulspærrede `leverandoerer`-node (Procure). Reelt BUILT som datafelt; ingen selvstændig værksteds-tildelingsworkflow ud over dette felt.
5. **Mail:** **IKKE BUILT / fase 0.** Der er ingen `sendMail`/SMTP/nodemailer-kald nogen steder i `functions/index.js`. "Kommunikation"-fanen i Driftskalenderens hændelsespanel viser kun demo-data (`demoSagerFor("flaade")`), og `Indberetninger.jsx`s "Send bekræftelse til leverandøren" findes slet ikke som knap (kommentar i filen: mockuppens version er fjernet, "en deaktiveret radiogruppe der sagde 'ikke bygget' ville være en attrap"). I denne kodebase betyder "mail" konkret: (a) et fremtidigt sagsnummer-i-emnefelt-koncept (`sagsnummerFraEmne()` i `sager.js`), og (b) en `sager`-node som slet ikke findes i `firebase.rules.json` endnu — kun visning af hardkodet demo-tråd. Ingen reel afsendelse eller modtagelse eksisterer.
6. **Kalenderreservation:** **BUILT.** Reservationen skrives atomart sammen med opgaven af `opgaveplanlaeg`/`opgaveflyt`/`opgavestatus`, og vises korrekt i Driftskalenderens gitter (`Gitterkalender.jsx`) samt i hændelsespanelets "Reservationens påvirkning"-kort.
7. **Udførelse (statusskift):** **BUILT.** Cloud Function `opgavestatus` (`functions/index.js:3947`) skifter status via en delt tilstandsmaskine (`kanSkifteOpgave`/`OPGAVE_OVERGANGE` i `opgaveplan-regler.js`), opdaterer reservationens følge atomart, og accepterer valgfri `faktiskMin` (server-valideret ikke-negativ).
8. **Faktura:** Håndteres IKKE i Fleet-modulet selv — filens kommentar er eksplicit: "Bygg ikke en fakturagodkendelse uden for Indkøb. Værkstedskalender registrerer et indkøb i kontekst; godkendelse og afstemning sker ét sted: Indkøb → Fakturaer." `Modulfakturaer art="fleet"` viser samme fakturaer som Fakturacenteret (delt visning, ikke duplikeret data).
9. **Faktisk omkostning:** `faktiskMin` (tid) er BUILT og valgfrit via `opgavestatus`; materialeforbrug fra indberetninger giver to posteringer (salg + lagertræk), modelleret i `indberetninger.js` (`grundlagslinjeFraMateriale`, `lagertraekFraMateriale`) — men uden en bygget skrivevej fra selve indberetningsskærmen er dette **PARTIAL** (kernelogik BUILT som ren funktion, ingen bekræftet UI-trigger i de gennemgåede filer).
10. **Historik:** Enhedens `afgangMs`/`afgangAarsag` og manglende sletning (`newData.exists()`-regel) sikrer historisk sporbarhed på enhedsniveau. Nedetid og åbne fejl regnes afledt (ikke lagret) af `nedetidMs()`/`aabneFejlFor()`. Status: **BUILT** som afledt visning.

**Arbejdskø (prioritering):** `prioritet.js` definerer ét delt katalog (lav/normal/høj) for Fleet, Facility og Warehouse-pluk. En manglende prioritet returnerer eksplicit `null` (ikke "normal") og tælles separat som "uvurderet". Arbejdskøen (`Arbejdskoe.jsx`) og Driftskalenderens fem kasser bruger begge samme `driftstal()`/`sorterKoe()`-funktioner fra `driftskalender.js` — status **BUILT** som visnings-/sorteringslogik; ingen skrivning derfra.

**Driftskalender:** **BUILT** som gitterkalender-visning og som skriveflow for driftsopgaver (opret/flyt/statusskift). De fem nøgletal er bevidst *ikke* i `kpi/` (afledt af data skærmen allerede har — dokumenteret undtagelse, ikke et hul).

---

## Workflow-observationer

Fleets ende-til-ende-forløb, nummereret:

1. **Indberetning oprettes** (chauffør melder en hændelse) — **PARTIAL/IKKE PÅVIST i denne modulgennemgang.** Datamodellen findes fuldt ud (`src/fleet/indberetninger.js`), men ingen opret-vej blev fundet i `src/moduler/flaade/*.jsx`. Chaufførappens egne filer (`/app`-ruten) blev ikke læst som del af denne modulgennemgang og kan indeholde skrivevejen.
2. **Vurdering/triage** (værkfører sætter prioritet, skifter forløb til "vurderet") — **MOCK/DEMO.** `Indberetninger.jsx` viser forløb og prioritet men "Afslut"-knappen er deaktiveret ("Fase 0: indberetninger/ skrives ikke fra klienten endnu").
3. **Planlægning** (opret driftsopgave/værkstedsbesøg) — **BUILT.** `opgaveplanlaeg` (`functions/index.js:3396`), kaldt fra `Vaerkstedskalender.jsx` → `Planlaegdialog.jsx`.
4. **Leverandør/værksted tildeles** — **BUILT** som datafelt (`leverandoerId` på opgaven, opslag mod Procures `leverandoerer`-node).
5. **Mail (bekræftelse til værksted)** — **PLANNED/fase 0.** Ingen reel afsendelse findes nogen steder i `functions/index.js` (ingen SMTP/nodemailer/SendGrid-kald fundet). `sager`-noden mangler i `firebase.rules.json`. Kun demo-tråd vises. "Mail" i denne kodebase betyder pt. kun et fremtidigt emnefelt-baseret sagsnummer-koncept (`sagsnummerFraEmne()` i `sager.js`) — ingen reel mailserver-integration.
6. **Kalenderreservation** — **BUILT.** Skrives atomart med opgaven, vist i gitteret og i hændelsespanelets "Reservationens påvirkning".
7. **Udførelse (statusskift, evt. faktisk tid)** — **BUILT.** `opgavestatus` (`functions/index.js:3947`), kaldt fra `Statusskifte`-komponenten i hændelsespanelet; frigiver reservationen ved annullering/afslutning.
8. **Faktura** — **BUILT, men uden for Fleet.** Godkendes i Indkøb → Fakturaer (bevidst arkitekturvalg, ikke et hul); Fleet viser den delte visning via `Modulfakturaer art="fleet"`.
9. **Faktisk omkostning** — **PARTIAL.** `faktiskMin` (tidsforbrug) er BUILT via `opgavestatus`. Materialeforbrug-til-fakturagrundlag/lagertræk-logikken (`grundlagslinjeFraMateriale`, `lagertraekFraMateriale`) er BUILT som ren funktion i `indberetninger.js`, men ingen bekræftet UI-trigger blev fundet i de gennemgåede Fleet-skærme.
10. **Historik** — **BUILT.** Ingen hardsletning af enheder (regel: `newData.exists()`); afgang registreres med årsag; nedetid/åbne fejl regnes afledt af historiske indberetninger/besøg.

**Konklusion om mail:** Der findes ingen reel mail-afsendelse i Fleet eller i `functions/index.js` generelt (ingen søgetræf på sendMail/nodemailer/SendGrid/smtp/mailgun). "Mail" refererer i koden til en planlagt (fase 0) sagsbaseret kommunikationsmodel, hvor et sagsnummer i emnefeltet på en indgående mail skulle knytte den til en indberetning/opgave — men modtagevej, parsing og afsendelse er, ifølge kodens egne kommentarer, slet ikke bygget endnu.

---

## UI-mønstre

- **Navigation:** Flad sidebar med to niveauer (nav.js), ingen topfaner. Fleet-menuen viser bevidst kun "arbejdsskærme" (Driftskalender, Indberetninger) — enhedskartoteket er flyttet til Opsætning, med udførlig begrundelse i både `nav.js` og `Oversigt.jsx`'s filhoved om at menunøgle/node/permission (`flaade`/`koeretoejer`/`koeretoejer.laes`) er uændrede selvom menupladsen flyttede.
- **KPI/card-design:** `KpiKort`/`KpiRaekke` (runde ikoner med "ikon-N"-toner, klikbare som hele kortet er ét link — undgår link-i-link). Driftskalenderens fem "kasser" er bevidst *ikke* `KpiKort` (de har en indbygget delt-knap "Åbn"/"Åbn i nyt vindue" via `Delknap`/`DELIKON`, hvilket et link-baseret KpiKort ikke kunne rumme).
- **Tabeller:** `Tabel`-komponent med `kolonner`/`raekker`/`tom`-mønster gennemgående; rækkeklik til valg (`paaRaekke`/`erValgt`) i Indberetninger; klikbar celle-knap (ikke rækkeklik) i Enheder.
- **Filtre:** Eget `Kort` med `.fc-filtre`/`.fc-felt`, ingen "Anvend filtre"-knap (filtre virker med det samme, bevidst valg dokumenteret i kommentar). Segmenteret knapgruppe `.fc-seg` med `aria-pressed` for visningstoggles (dag/uge/måned, "Vis frem"-vindue, prioritetsfilter).
- **Modaler:** `Dialog`-komponent (`bred`-variant) bruges til hændelsespanelet fremfor et sidepanel, begrundet med pladsbehov til mailtråd/filliste.
- **Status/farve:** `Pille`-komponent med faste toner (`ok`/`warn`/`bad`/`info`), aldrig rå status-strenge; farvetoken-disciplin håndhæves af `test:design` (ikke set direkte her, men nævnt i CLAUDE.md og konsistent i al læst kode).
- **Kalenderdesign:** Delt `Gitterkalender.jsx`-komponent (rækker × tidskolonner) mellem Driftskalender, Facility → Servicekalender og Disponering; `.fc-gk-lodret` for klæbende hoved/navnekolonne ved vandret scroll; svævekort (`Svaevekort`) i stedet for native browser-tooltip.
- **Terminologi:** Konsekvent skelnen mellem "art" (køretøjstype/hændelsestype, styrer feltskema) og "status"/"forløb" (tilstand); "kaldenavn" (menneskeligt navn, fx "Bil 104") vs. "registrering" (nummerplade, det man slår op på).
- **Knap-mønstre:** Deaktiverede knapper vises ALTID med en `title`-forklaring frem for at skjules ("En skjult knap lærer brugeren at funktionen ikke findes") — konsekvent gennemført i alle fire skærme for hver ikke-byggede handling.

---

## Mulige overlap

- **Site A: Fleets Driftskalender (`opgaver`, art `vaerksted`) — Site B: Facilitys Servicekalender (`opgaver`, art `facility`).** Samme node, samme `Gitterkalender.jsx`-komponent, samme `driftstal()`-funktion (kaldt med hver sit art-filter). Risiko: hvis et sted glemmer art-filteret, tælles den anden moduls arbejde med — kodens egne kommentarer nævner dette eksplicit som "beslutning 11 og 14's fejl på tværs af moduler", dvs. et kendt, aktivt overvåget risikomønster snarere end en observeret fejl i denne gennemgang.
- **Site A: Fleets værkstedsreservationer — Site B: Booking/Facility/Bemandings reservationer, alle i `reservationer`-noden.** `reservationer` er bevidst i BASEN (ikke NODE_MODUL), fordi fire kilder skriver til den (booking, værksted, facility-sag, fravær — beslutning 4). moduler.js dokumenterer en tidligere reel fejl her: da noden fejlagtigt var gatet på `booking`, kunne en DEV-kunde med Fleet+Facility+Bemanding+Procure (ingen Planning) ikke læse 37 af sine egne reservationer. Nu rettet, men understreger at delt ejerskab på tværs af Fleet er en tilbagevendende risikoklasse i denne kodebase.
- **Site A: Fleets fremtidige `sager` (mailtråd for værkstedsbesøg) — Site B: Facilitys `sager` (samme node, art `fleet`|`facility`, jf. moduler.js's kommentar om `sager`).** Ingen af dem er bygget endnu (fase 0), men modellen er allerede designet som delt på samme måde som `opgaver` — samme overlap-risiko vil gentage sig når den bygges.
- **Site A: Fleets `Modulfakturaer art="fleet"` — Site B: Fakturacenteret (Økonomi) og Indkøb → Fakturaer.** Kommentaren i `Vaerkstedskalender.jsx` er eksplicit: "SAMME FAKTURAER SOM FAKTURACENTERET — ikke et andet sæt. Modulet ejer sagen; centeret ejer fakturaen (beslutning 86)." Dette er en dokumenteret delt visning, ikke duplikeret data — men værd at holde øje med hvis en fremtidig ændring bryder denne kobling.
- **Site A: Fleets kompetencekrav (`kraevedeKompetencer` i `flaade.js`) — Site B: Bemandings kompetenceregister.** Fleet definerer *hvilke* kompetencer en enhed kræver (afledt af art + last), men selve kompetenceposterne (udløbsdatoer, beviser) ejes af Bemanding. Ikke et datamæssigt overlap (ingen delt node), men et logisk koblingspunkt hvor Fleets regler og Bemandings data skal stemme overens for at Disponering kan blokere korrekt.
