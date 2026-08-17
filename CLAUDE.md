# Kontekst til Claude Code

FleetControl 3.0 — multi-tenant TMS for danske vognmænd. React + Vite +
React Router, Firebase Realtime Database (compat SDK), Netlify. Dansk UI,
danske variabelnavne i domænelogikken.

## Arbejdsregel

**Analyse før kode.** Læs `README.md` og `ARKITEKTUR.md` først. Foreslå en plan
og få den godkendt, før du skriver. Der er **39 trufne beslutninger** — kort
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
- Gemme beløb som float eller kroner. Øre som integer, ekskl. moms.
- Overskrive en sats. Ny post med `gyldigFra`.
- Skrive en reservation direkte. Brug `reservations.js`.
- Skifte bookingtilstand uden `kanSkifte()`.
- **Definere egne farver.** Brug tokens i `fleet.css`. Det er ikke længere en
  konvention: `npm run test:design` fejler på en farveværdi hvor som helst i
  `src/` uden for tokenfilen, og hooken kører den ved enhver ændring i `src/`.
  Et token er desuden en **beslutning** — accenten er nr. 10. Skal en værdi
  ændres, eller et token tilføjes, rettes `BESLUTNINGER.md` **først** og
  derefter snapshottet i `test/design-tokens.test.mjs`. Retter du kun
  snapshottet, har du flyttet beslutningen ind i en testfil hvor ingen leder
  efter den.
- Bruge `on()` hvor `once()` rækker.
- Hardslette regnskabsdata.
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
  med. Skal en rigtig bruger have anden adgang, ændres rollen i `roller/` og
  claim'et fornys.
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
- **Definere et demo-datasæt i en modulfil.** Det hører i `fleet/demo-*.js`.
  ⚠ **Et navn er ikke en beskyttelse.** Linten matchede før på `DEMO_`-præfikset,
  og `TILBUD`, `OPGAVER` og `FUNKTIONER` gled forbi den i tre forskellige
  skærme. Den kender nu et datasæt på sin **form**: et modul-niveau array med
  mindst tre id-bærende poster.
  Et datasæt i et modul kan ikke nås af de andre, og så laver de deres egen
  kopi — det var Bil 104 med to nummerplader. `test/demo-kilder.test.mjs`
  fejler på det, og den er skrevet fordi mønstret er dukket op **seks gange**.
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
- **Bygge drag-and-drop i Disponering før Cloud Functions.** En reservation
  skal skrives atomisk sammen med etapens `koeretoejId`, og to disponenter kan
  ramme samme sekund. Bygger du det interaktive nu, bygger du det to gange.
- **Bygge et kalendergitter til.** `fleet/Gitterkalender.jsx` tegner
  ressourcer × tid og bruges af Værkstedskalender, Servicekalender og
  Disponering. Regnestykket ligger i `gitter.js`. To gitre der læser det samme
  interval forskelligt, opdages ikke ved at kigge på dem.
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
- **Skrive en underskrift to gange.** `sensitive/…/underskrift` er write-once
  i reglerne (`!data.exists()`). En rettelse er en NY indberetning der
  henviser til den gamle. Et bevis der kan redigeres, beviser ingenting.
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
  `turtlebooking.js` **afgør ingenting** — den svarer, og skærmen bruger den kun
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
  sag, hed `warehouse` indtil etape 6 og hedder nu **`turtlebooking`** —
  netop for at de to ikke skulle hedde det samme. Det ville have været
  `lagre` mod `lager` og `bookinger` mod `bookings` for tredje gang.
  Navnet er ikke ledigt; det er optaget af noget der ikke er bygget endnu.
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
  det. Oversættelsen står ét sted i `turtlebooking.js` og er prøvet mod
  `overlapper()` på hver kombination i ti dage.
- **Skrive `isoTilMs`/`msTilIso` igen.** De står i `format.js`. Klokken er 12
  og ikke midnat, fordi `new Date("2026-08-10")` er midnat UTC — trækkes der
  en time et sted i kæden, bliver det den 9. De var skrevet af to steder, før
  Turtlebooking var ved at lave den tredje kopi.
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

- Cloud Functions mangler: reservationskonflikter, bookingtilstandsskift med
  rolletjek, nummerserier. Rules er `.write: false` på de noder.
- **Disponerings datamodel er på plads** (beslutning 21). `opgaver.art` er
  `vaerksted` | `facility` — **ikke** `langtur`. Skærmen læser to noder:
  `opgaver` med art `vaerksted` i dagsvisningen, `etaper` i ugesvisningen.
  Selve skærmen er ikke bygget.
- **Disponering har tre forudsætninger** — se ARKITEKTUR. `kanDisponeres()`,
  `kraevedeKompetencer()` + `tjekKompetencer()` og `kanBaere()` er bygget og
  testet, men **intet kalder dem**. De hører i den Cloud Function der skriver
  etapen, ikke i skærmen: ligger de i skærmen, omgår en direkte skrivning dem.
  En udløbet kompetence skal **blokere**, ikke advare.
- **Disponering skal bygges med etapemodellen i tankerne** (beslutning 16).
  Det man disponerer, er en *etape* — ikke en booking. Etaper ligger i
  `etaper/<etapeId>`, har deres egen tilstand, og `aaben` betyder at etapen
  venter på en passende tur. Skærmen skal kunne vise åbne etaper ved siden af
  planlagte, og den skal læse to noder: `etaper` og `opgaver`. Bygger du den
  med én booking = én tur, er det en migrering bagefter.
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
- **Rollerne er faste.** `roller` er `.write: false`, og det skal det blive:
  en vognmand der fjerner `booking.godkend` fra sin egen adminrolle, har lukket
  sig ude, og adgangen til at rette det var selv en permission. Se beslutning 31.
