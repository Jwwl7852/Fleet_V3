# 01 — Produktkort

Dette produktkort er destilleret alene fra de 11 modul-dossierers
"Modul-resumé"-sektioner (`docs/product-audit/_dossiers/01-…` til `11-…`).
Talt op giver de 11 dossierer **14 separate modul-resuméer**, fordi tre af
dossiererne hver dækker to selvstændige moduler (09: Kunder & Priser +
Opsætning; 10: Support + Ejerkonsol/Udbyder; 11: Chaufførapp + Login), mens
dossier 01 samler fire skærme (Dashboard, Økonomi & Rapporter, Fakturacenter,
Fakturering) under ét fælles resumé. Hvert afsnit nedenfor angiver hvilket
dossier det stammer fra, så et enkelt fakta altid kan spores tilbage til sin
kilde. Status-labels (BUILT/PARTIAL/MOCK/DEMO/PLANNED/NOT_BUILT) er bevaret
ordret fra dossiererne — intet er blødt op eller pyntet på.

---

## 1. Dashboard & Økonomi (Dashboard, Økonomi & Rapporter, Fakturacenter, Fakturering)
*Kilde: dossier 01*

- **Navn:** Dashboard & Økonomi — fire skærme: Dashboard (`/`), Økonomi &
  Rapporter (`/oekonomi`), Fakturacenter (`/oekonomi/fakturacenter`),
  Fakturering (`/oekonomi/fakturering`).
- **Formål:** (1) ét operativt overbliksbillede bygget udelukkende af et
  tværmodulært KPI-aggregat (`kpi/`), aldrig af rådata; (2) et fælles,
  modul-uafhængigt sted for indgående fakturaer (Fakturacenter — modtagelse,
  destinationsmatch, godkendelse, bogføring); (3) et sted for udgående
  fakturagrundlag (Fakturering — godkendelse, låsning, eksport til
  regnskabssystem).
- **Primær brugertype:** Dashboard er alles forside (alle 7 roller lander
  der). Økonomi-undersiderne er reelt begrænset til dem med `grundlag.laes`
  og/eller `indkoeb.laes` (typisk disponent, koordinator, admin, revisor) —
  menupunkterne selv er ikke permission-gatede, men KPI-tallene under dem er
  det (via `KPI_PERM`).
- **Vigtigste opgave:** Give ledelsen/disponenten ét sted at se drift +
  økonomi uden at besøge hvert modul, og ét sted at behandle fakturaer ind
  og ud.
- **Vigtigste funktioner:** Valgbart modul-dashboard med eget widget-layout
  og "Prioriterede handlinger"; Økonomi-rapportering (KPI-kort, omkostnings-
  og dækningsgradgrafer, nøgletal pr. kategori); Fakturacenter (destinations-
  match med scoring, todelt godkendelse, bogføring); Fakturering
  (godkend/lås-kæde, eksport til Neutral JSON og CSV).
- **Undermoduler:** Dashboard (`/`), Økonomi Oversigt (`/oekonomi`),
  Fakturacenter (`/oekonomi/fakturacenter`), Fakturering
  (`/oekonomi/fakturering`).
- **Afhænger af (andre moduler):** Ingen formelt (`MODUL_KRAEVER` indeholder
  kun `booking → kunder` og `warehouse → kunder`). Funktionelt læser
  Dashboard/Økonomi kun det aggregerede `kpi/`-domæne; Fakturacenter læser
  `opgaver`, `indkoebsordrer`, `forbrugsvarer`, `koeretoejer`,
  `facility/aktiver`; Fakturering læser `grundlag`, `etaper`, `kunder`.
- **Afhænges af (hvem læser dette modul):** Ingen modul kræver `oekonomi`
  eller `dashboard`. Fakturacenteret peger dog tilbage til "Procure →
  Fakturaer" som samme node set gennem en anden linse.
- **Samlet status:** BLANDET. UI-infrastrukturen er fuldt bygget og
  konsekvent, men Dashboard/Økonomis økonomital er for størstedelens
  vedkommende **null i produktion**; Fakturacenter har ingen fungerende
  indgangskanal (ingen fillagring); Fakturering har en fuldt håndhævet
  godkend/lås/eksport-kæde, men **ingen UI-vej til at oprette et
  forløbsbaseret (booking-tur) grundlag** — kun Warehouses periodeafregning
  kalder reelt `opretGrundlag()`.
- **Overlap-mistanke:** Fakturacenter/Procure → Fakturaer (samme node, to
  linser); Dashboard "Største afvigelser" og Økonomi "Største afvigelser"
  (samme felt, bevidst delt kilde).

---

## 2. Planning / Booking
*Kilde: dossier 02*

- **Navn:** Planning (rute og RTDB-node hedder fortsat `booking`/`bookinger`
  — UI-navnet er "Planning").
- **Formål:** Fra transportforespørgsel til udført arbejde: opret en
  forespørgsel, lav 1–3 forslag, godkend ét (fire-øjne, beslutning 5),
  disponér køretøj/hænger/chauffør, følg turen via chaufførens meldinger,
  og aflever et omkostnings- og omsætningsgrundlag videre til Økonomi.
- **Primær brugertype:** Tre roller med hver sin opgave i samme flow —
  casehandler (opretter), disponent (foreslår + disponerer værksted/
  langture), koordinator (godkender/returnerer/afviser). Chaufføren
  optræder kun som afsender af statusmeldinger (uden for dette moduls
  skærme).
- **Vigtigste opgave:** Booke og gennemføre transportforløb (etaper) med en
  håndhævet fire-øjne-kontrol mellem "forslag" og "godkendelse".
- **Vigtigste funktioner:** Arbejdsliste med KPI-overblik; oprettelse af ny
  forespørgsel som kladde med serverudstedt BKG-nummer; forslag &
  godkendelse pr. etape; disponering (dagsgitter for værkstedsopgaver +
  ugesgitter for langture, kun visning); rute & status (planlagt rute og
  chaufførmeldinger, ingen GPS); bookingopsætning (omkostningssatser).
- **Undermoduler/skærme:** Oversigt, Ny forespørgsel, Forslag & reservation
  (skjult i nav), Disponering, Rute & status ("Live-kort"), Bookingopsætning.
- **Afhænger af (andre moduler):** Kunder — `MODUL_KRAEVER.booking =
  ["kunder"]`, fordi `bookinger` har et påkrævet `kundeId`.
- **Afhænges af (hvem læser dette modul):** Økonomi/Fakturering (omsætning,
  `ikkeFaktureretForloeb`, fakturagrundlag); Flåde og Facility deler samme
  `reservationer`- og `opgaver`-node; Warehouse (transportlabels udleder
  transporttype af etapekæden).
- **Samlet status:** Kerneflowet (opret → forslag → fire-øjne-godkendelse →
  etapeskift/reservation → status/opfølgning) er **BUILT** med rigtige
  Cloud Functions og RTDB-noder. Bookingopsætning (satsvedligehold) er
  **PARTIAL** — visning/beregning er ægte, men "Tilføj/Redigér sats"
  skriver ikke. Ruteoptimering og koordinator-notifikation er **NOT_BUILT**.
- **Overlap-mistanke:** Disponerings dagsgitter deler node (`opgaver`),
  skriveveje (`opgaveplanlaeg`/`opgaveflyt`/`opgavestatus`) og komponenter
  (`Gitterkalender.jsx`, `Planlaegdialog.jsx`, `Statusskifte.jsx`) med
  Flådens Driftskalender og Facilitys Servicekalender — kun `art`-feltet
  (`vaerksted` vs. `facility`) adskiller dem.

---

## 3. Workforce / Bemanding
*Kilde: dossier 03*

- **Navn:** Workforce / Bemanding (menu-label "Workforce"; modulnøgle
  `bemanding`).
- **Formål:** Overblik over bemanding og kapacitet, medarbejderstamdata,
  kompetence-/certifikatgyldighed og ferie/fravær der skal blokere
  disponeringen.
- **Primær brugertype:** Disponent/koordinator (bemandingsoverblik og
  fraværskonsekvens), admin (medarbejderkartotek, da kun admin har
  `personale.skriv`), kontor generelt (godkendelse af fraværsansøgninger).
  Chaufføren rammer to underliggende noder (`stemplinger`, `fravaer`) via
  chauffør-app-skærmene, ikke via dette modul.
- **Vigtigste opgave:** Vise hvem der er til rådighed, hvem der mangler et
  gyldigt kørekort/certifikat, og hvem der er væk.
- **Vigtigste funktioner:** Ugevisning af planlagt vs. disponeret bemanding
  (kun demo-data); kompetence-/certifikatregister med "blokerer vs.
  advarer"-skel og udløbsvarsling; fraværsliste med adgangsstyret
  årsagsfelt og en simuleret reservation; medarbejderkartotek med reelt
  oprettelses-flow.
- **Undermoduler:** Bemandingsplan (`/bemanding`), Kompetencer
  (`/bemanding/kompetencer`), Ferie & fravær (`/bemanding/fravaer`).
  Medarbejdere ligger menu-mæssigt under Opsætning
  (`/opsaetning/medarbejdere`), men er datamæssigt en del af dette modul.
- **Afhænger af (andre moduler):** Ingen — `personale`, `kompetencer` og
  `kpi` er bevidst ikke gatede noder. `fravaer`, `sensitive/fravaer` og
  `stemplinger` ER gatede til modulet `bemanding`.
- **Afhænges af (hvem læser dette modul):** Dashboard (deler
  kapacitetsgrad/ledig-kapacitet-tal); Disponering/`tjekDisponering()`
  (kompetencetjek og fraværsblokering, håndhævet server-side); Flåde/
  Facility (deler `serviceTone()`-tærskler med kompetencer).
- **Samlet status:** PARTIAL / blandet. Kompetencer og Fravær er læseskærme
  bygget mod rigtige data, Medarbejdere har et reelt oprettelses-
  skriveflow men intet redigerings-/fratrædelsesflow, og Bemandingsplanen
  er ren demo-data uden en vagtnode i datamodellen overhovedet.
- **Overlap-mistanke:** Medarbejdere (`/opsaetning/medarbejdere`) vs.
  Opsætning → Brugere & roller — to forskellige begreber (person vs.
  login), en bevidst dokumenteret forvekslingsrisiko.

---

## 4. Fleet
*Kilde: dossier 04*

- **Navn:** Fleet (dansk marketingnavn; modulnøgle, node- og
  permissionnavne er stadig `flaade`/`koeretoejer`).
- **Formål:** Ejer flådens stamdata (køretøjer/enheder af 9 arter) og
  flådens daglige drift: værksteds-/serviceopgaver, indberetninger fra
  chauffører, og disponeringsgrundlaget for om en enhed er ledig.
- **Primær brugertype:** Disponent/koordinator (driftskalender,
  planlægning), værkfører (triage af indberetninger), admin/opsætning
  (enhedskartotek).
- **Vigtigste opgave:** Holde styr på hvornår en enhed er på
  værksted/service vs. ledig til disponering, og fange fejl/skader meldt
  fra marken før de bliver et disponeringsproblem.
- **Vigtigste funktioner:** Enhedskartotek med art-styret feltskema;
  driftskalender med træk-og-slip planlægning; fem "kasser"
  (nye/afventer/planlagt/kommende/forsinkede) med en tilhørende
  Arbejdskø-skærm; indberetninger (ti hændelsesarter i to klasser);
  disponeringsregler (`kanDisponeres`, `kraevedeKompetencer`, `nedetidMs`)
  genbrugt af andre moduler.
- **Undermoduler/skærme:** Enheder (Opsætning), Driftskalender (Fleets
  forside), Indberetninger, Arbejdskø (skjult i nav).
- **Afhænger af (andre moduler):** Ingen formelt registreret i
  `MODUL_KRAEVER`. Blød afhængighed af Procure (`indkoeb`) — Driftskalenderen
  slår leverandører op via `leverandoerer`-noden, som er modulspærret på
  `indkoeb`.
- **Afhænges af (hvem læser Fleet):** Facility (deler `opgaver`-noden,
  art-filtreret), Booking/Disponering (bruger `flaade.js`s regler),
  Økonomi (læser `koeretoejer`), Indkøb (materialelinjer fra
  indberetninger bliver til lagertræk).
- **Samlet status:** **PARTIAL/delvist BUILT**. Læsevejen er solidt bygget
  for alle fire skærme. Skrivevejen er ægte for driftsopgaver og (modsat
  en forældet kommentar i filen selv) også reelt for enhedskartoteket.
  Indberetninger kan derimod **slet ikke afsluttes/oprettes fra UI endnu**
  (kun visning). Mail/sag-integrationen er fase 0.
- **Overlap-mistanke:** `opgaver`-noden deles med Facility
  (art-filtreret); `reservationer`-noden deles af fire kilder (booking,
  værksted, facility-sag, fravær); den (endnu ikke byggede) `sager`-node
  er tænkt delt mellem Fleet og Facility.

---

## 5. Facility
*Kilde: dossier 05*

- **Navn:** Facility (bygninger, anlæg, klima og servicekalender).
- **Formål:** Registrere og overvåge virksomhedens egne bygninger og
  tekniske anlæg (porte, køl/ventilation, vaskehal, ladestandere, alarm,
  truckoplader) — fejlmelding, planlægning af service, klima- og
  energiovervågning. Ejer ingen kunderelateret data.
- **Primær brugertype:** Ingen særskilt facility-rolle. Skrivning
  (`facility.skriv`, `opgaver.skriv`) ligger hos casehandler, disponent,
  koordinator og admin; lagermedarbejder, chauffør og revisor kan kun
  læse.
- **Vigtigste opgave:** Vide om en bygning/et anlæg er driftsklart, melde
  og følge fejl, booke tid hos eksterne leverandører uden dobbeltbooking,
  og dokumentere klima/energi.
- **Vigtigste funktioner:** Fejlmelding pr. anlæg med alvorsgrad;
  afledt lokationsstatus (Normal/Advarsel/Kritisk); servicekalender
  (delt gitterkomponent med Fleets Driftskalender); klimaovervågning pr.
  zone med afledt alarm; bygningsomkostninger (fem komponenter, ingen
  gemte totaler); fakturavisning (samme delte `fakturaer/`-node).
- **Undermoduler:** Overblik & fejl (`/facility`), Servicekalender
  (`/facility/servicekalender`), Klima & energi (`/facility/klima`).
  Servicedialog er en dialog inde i Servicekalender, ikke egen rute.
- **Afhænger af (andre moduler):** `MODUL_KRAEVER` nævner ikke `facility`
  — formelt kræver Facility intet andet modul. Funktionelt læses
  `personale`, `opgaver`, `leverandoerer` (Indkøb), `reservationer`,
  `fakturaer`.
- **Afhænges af (hvem læser dette modul):** `facility/aktiver` læses af
  Fakturacenter (matchsignal); `opgaver` med `art: "facility"` læses af
  Modulfakturaer og Fakturacenter.
- **Samlet status:** BLANDET/overvejende BUILT for kerneflowet
  (fejlmelding, anlægskartotek, klimaovervågning, servicebesøg-planlægning
  med ægte reservationskonflikt-kontrol), men **energi-/
  bygningsomkostningerne har ingen fundet skrivevej i UI'et** — kun
  læsning — og **leverandørkommunikation er ren visning, ingen udgående
  mail** (fase 0, beslutning 20).
- **Overlap-mistanke:** Servicekalenderen deler bogstaveligt samme
  gitterkomponent (`Gitterkalender.jsx`) og til dels samme node (`opgaver`,
  art-filtreret) som Fleets Driftskalender/Værkstedskalender og
  Disponering.

---

## 6. Procure / Indkøb
*Kilde: dossier 06*

- **Navn:** Procure (`MODUL.indkoeb`, navKey `"indkoeb"`).
- **Formål:** Indkøb, fakturaafstemning og leverandører.
- **Primær brugertype:** Casehandler/disponent/koordinator/admin
  (bestiller og godkender er bevidst forskellige personer — fire-øjne);
  enhver medarbejder kan indmelde et behov fra telefonen.
- **Vigtigste opgave:** Styre hele indkøbsprocessen fra behov til
  fakturaafstemning, med et adskilt reservedelslager (`forbrugsvarer`) til
  vognmandens egne dele.
- **Vigtigste funktioner:** Indmeld indkøbsbehov; automatisk
  leverandørforslag ud fra historik; bestillingskladde grupperet pr.
  leverandør med kopierbart mailudkast; to slåes-fra-regler for
  godkendelse; fakturamatch mod bestilling med gennemsigtig scoring;
  kontantkøb/udlæg; tre-vejs afstemning (vist med demodata);
  leverandørperformance på seks objektive nøgletal; eget reservedelslager
  med bevægelseshistorik.
- **Undermoduler/skærme:** Oversigt, Indkøbsbehov, Bestillinger,
  Godkendelser, Fakturaer, Leverandører, Varelager (7 skærme).
- **Afhænger af (andre moduler):** Ingen (`MODUL_KRAEVER` lister intet
  krav for `indkoeb`).
- **Afhænges af (hvem læser dette modul):** Økonomi læser `fakturaer/`
  gennem sit eget Fakturacenter (samme node, fælles ejerskab);
  Værkstedskalender/Facility registrerer indkøb i kontekst, men al
  godkendelse sker i Indkøb → Fakturaer.
- **Samlet status:** BUILT for hele kerneprocessen (behov → bestilling →
  godkendelse → fakturamatch → kontantkøb → varelager), med tre bevidst
  ubyggede/manuelle led: mail-afsendelse til leverandør, filupload/OCR på
  fakturaer, og selve betalingen/regnskabsintegrationen.
- **Overlap-mistanke:** `lagre` (Indkøbs eget reservedelslager) vs.
  `forbrugsvarer` (samme modul, en anden node) vs. Warehouses
  `varer`/`beholdning` (kundens 3PL-gods); `fakturaer/` delt mellem
  Procure → Fakturaer og Økonomi → Fakturacenter.

---

## 7. Unitbooking
*Kilde: dossier 07*

- **Navn:** Unitbooking (modulnøgle `"unitbooking"`).
- **Formål:** Udlejning af transportkasser: kasser, reolpladser og udlån
  pr. sag.
- **Primær brugertype:** Rollen `lagermedarbejder` — den eneste rolle ud
  over admin der må røre udlån. Rollen deler også
  `reolpladser.skriv`/`varerSkriv`/`bevaegelserSkriv` med Warehouse.
- **Vigtigste opgave:** Styre transportkasser gennem cyklussen
  reservation → klargøring → udlån → retur, og holde styr på hvilken
  reolplads hver kasse hører hjemme på og står på nu.
- **Vigtigste funktioner:** Kalender som forside (kasser/sager × tid);
  søg ledige kasser og reservér; ét-klik statusskift
  (klargør/udlevér/modtag retur/annullér); historik pr. kasse og pr.
  sagsnummer; stamdata for reolpladser og kassetyper.
- **Undermoduler:** Ingen formelle — fem skærme under én modulnøgle
  (Kalender, Udlån, Historik, Reolpladser, og Kasseliste flyttet til
  Opsætning).
- **Afhænger af (MODUL_KRAEVER):** Ingen indgang for `unitbooking` fundet
  — modulet ser ikke ud til at kræve noget andet modul (IKKE PÅVIST med
  fuld sikkerhed).
- **Afhænges af:** Warehouse deler `reolpladser`-noden.
- **Samlet status:** **BUILT.** Alle fem skærme har reelle læse- og
  skrivestier. Al skrivning af selve udlånet går udelukkende gennem Cloud
  Function `kasseudlaanskriv` (transaktionsbaseret) — en bevidst
  arkitekturbeslutning, ikke en mangel.
- **Overlap-mistanke:** `reolpladser` er en bevidst, dokumenteret
  to-modul-node (Unitbooking + Warehouse) — den eneste node i kodebasen
  med bevidst to-modul-ejerskab.

---

## 8. Warehouse
*Kilde: dossier 08*

- **Navn:** Warehouse (3PL-lagerhotel — modulnøgle `warehouse`).
- **Formål:** Opbevare ANDRES gods (kundens, ikke vognmandens eget) og
  afregne for håndtering ind, opbevaring og håndtering ud. Adskilt fra
  Indkøbs `lagre` (reservedele, en omkostning).
- **Primær brugertype:** Lagermedarbejder (skriveadgang); disponent/
  koordinator/admin for afregning/volumen; revisor/admin for indsyn.
- **Vigtigste opgave:** Modtag kundens gods ind, placér det, flyt/pluk/
  afsend det efter ordre, hold styr på hvor det er, og afregn kunden for
  håndteringen.
- **Vigtigste funktioner:** Varekartotek pr. kunde; reolpladser (delt med
  Unitbooking); bevægelsesregistrering gennem én Cloud Function;
  plukordrer med udledt fremdrift; cycle count/optælling med
  serverberegnet afvigelse; transit & placering (Modtagelse); carrier-
  overblik; transportlabels (QR + Code 128, ingen node); afregning og
  volumen (salgsestimat); sporbarhed.
- **Undermoduler/skærme (11):** Varer, Pluk & afsend, Bevægelser,
  Optælling, Modtagelse, Beholdere (Carriers), Transportlabels, Afregning,
  Volumen, Sporbarhed, Lokationer.
- **Afhænger af (andre moduler):** Kunder —
  `MODUL_KRAEVER.warehouse = ["kunder"]`. Transportlabels kræver derudover
  Booking (blødt) for at kunne udlede en transporttype.
- **Afhænges af (hvem læser dette modul):** Indkøb → Fakturaer / Økonomi →
  Fakturering godkender de fakturagrundlag Afregning opretter som kladde;
  Unitbooking deler `reolpladser`-noden.
- **Samlet status:** Kerneflowet — vare → bevægelse → beholdning → pluk →
  afsendelse, og optælling → afvigelse — er **BUILT**: alle skrivninger
  går gennem tre rigtige Cloud Functions. Afregning er **BUILT** som
  beregning + kladdeoprettelse, men opretter aldrig selv en faktura.
  Volumen er **BUILT** som ren beregner, opretter bevidst intet tilbud
  (PLANNED). Ingen af de 11 skærme er MOCK/DEMO i traditionel forstand.
- **Overlap-mistanke:** Carriers (Warehouse) vs. Kasser (Unitbooking) —
  fysisk samme koncept, bevidst adskilte noder og tilstandsmaskiner, men
  begge tælles sammen i den fælles belægningsopgørelse.

---

## 9. Kunder & Priser
*Kilde: dossier 09*

- **Navn:** Kunder & Priser (modulnøgle `kunder`, `altid: true`).
- **Formål:** Kundekartotek (kunder, aftaler, prisgrupper) og de to lag af
  prissætning — én fælles standardprisliste for platformens ydelser, og
  den enkelte kundes afvigelse fra den.
- **Primær brugertype:** Casehandler og admin (kundedialog, aftaler);
  admin alene for standardpriser; casehandler/disponent/koordinator for
  kundeafvigelser (kræver BÅDE `kunder.skriv` OG `satser.skriv`, hvor kun
  admin har det sidste i standardpresettet).
- **Vigtigste opgave:** Holde styr på hvem kunderne er, hvad deres
  aftaler siger, og hvilken pris der gælder for hvilken ydelse på hvilket
  tidspunkt — uden at en rettelse i dag ændrer en faktura fra sidste
  kvartal.
- **Vigtigste funktioner:** Kunder.jsx (KPI-kort, filtrerbar kundetabel,
  salgsprisafvigelser, tilbud der kræver opfølgning — demo-data);
  Standardpriser.jsx (ydelseskatalog, pris pr. ydelse med
  gyldigFra-historik); Kundepriser.jsx (pr.-kunde afvigelse, egen pris
  eller rabat, aldrig begge).
- **Undermoduler:** Kunder (`/opsaetning/kunder`), Standardpriser
  (`/opsaetning/priser`), Kundepriser (`/opsaetning/aftalepriser`).
  Ingen topniveaupunkt — nås kun via Opsætning-menuen.
- **Afhænger af (andre moduler):** Ingen (kunder er selv en grundnode).
  Læser desuden `kpi.oekonomi.daekningsgradPct`/`maalDaekningsgradPct`.
- **Afhænges af (hvem læser dette modul):** `booking` og `warehouse`
  kræver `kunder` (`MODUL_KRAEVER`); priserne (`satser/standard`) læses
  desuden af Warehouses Afregning/Volumen og af prismotoren
  (booking-estimater).
- **Samlet status:** BLANDET. Kunder.jsx er en fuldt fungerende
  oversigts-/rapporteringsskærm (BUILT read-side, ingen redigering af
  kundestamdata findes overhovedet på denne skærm). Standardpriser og
  Kundepriser er begge **BUILT** end-to-end. Tilbudsfunktionen er
  eksplicit ikke bygget.
- **Overlap-mistanke:** Kundens `prisgruppe`-felt filtrerer stadig, men
  bærer ikke længere en pris (kun standard + kundeafvigelse gør) —
  feltet er et levn der kan forveksles med et aktivt prislag.

---

## 10. Opsætning
*Kilde: dossier 09*

- **Navn:** Opsætning (modulnøgle `opsaetning`, `altid: true`).
- **Formål:** Samlested for stamdata, brugere/roller og integrationer —
  en "grab-bag" med vilje: Enheder (Fleet), Kasseliste (Unitbooking),
  Medarbejdere (Bemanding) og Kunder/Priser er alle flyttet hertil, fordi
  Opsætning er den ene menu enhver kunde altid har adgang til.
- **Primær brugertype:** Admin (Brugere & roller kræver `brugere.skriv`,
  kun admin-presettet har den); enhver rolle kan læse Generelt og
  Integrationer.
- **Vigtigste opgave:** Vise virksomhedens grundfakta, administrere
  logins/roller, og vise ærligt hvilke eksterne systemer der er forbundet
  (i dag: ingen).
- **Vigtigste funktioner:** Generelt.jsx (KPI-kort, "hvor rettes
  stamdata"-henvisningstabel, eksplicit READ-ONLY); Brugere.jsx
  (brugerliste, opret bruger, skift rolle, spær/åbn login, rolle-editor,
  rolle-vs-perm matrix, dashboardvisning); Integrationer.jsx (tom liste,
  med begrundelse).
- **Undermoduler (i denne dossiers scope):** Generelt (`/opsaetning`),
  Kunder/Standardpriser/Kundepriser (dækkes i eget afsnit ovenfor),
  Brugere & roller (`/opsaetning/brugere`), Integrationer
  (`/opsaetning/integrationer`). (Enheder, Kasseliste, Medarbejdere
  dækkes af andre dossierer/moduler.)
- **Afhænger af (andre moduler):** Generelt læser `facility/lokationer`
  (Facility) og modulkataloget. Brugere & roller læser `roller/`,
  `brugere/` og `dashboardvisning/` (base-noder).
- **Afhænges af (hvem læser dette modul):** Alle moduler er implicit
  afhængige af Brugere & roller, fordi tokenets `perms`-claim (mintet
  herfra) er hvad `firebase.rules.json` håndhæver alle steder.
- **Samlet status:** BLANDET, med Generelt bevidst **PARTIAL/read-only**
  og Brugere & roller **BUILT** (læs + skriv, med reelle Cloud Functions
  bag hver handling). Integrationer viser en ærlig tom liste — ikke MOCK
  i vildledende forstand, men et bevidst tomt, dokumenteret "intet bygget
  endnu".
- **Overlap-mistanke:** "Enheder", "Kasseliste" og "Medarbejdere" ligger
  fysisk i samme menu som Kunder/Priser og Brugere/Integrationer, uden
  funktionel sammenhæng — Opsætning er en navigationssamling af stamdata
  fra flere moduler, ikke ét sammenhængende modul.

---

## 11. Support
*Kilde: dossier 10*

- **Navn:** Support (dansk: "Hjælp & Support"; modulnøgle `support`).
- **Formål:** Give kunden en kanal til at oprette og følge supportsager
  mod FleetControl, og give FleetControls eget personale et overblik på
  tværs af alle kunder samt et kontrolleret, tidsbegrænset adgangsflow
  til at fejlsøge i en kundes data.
- **Primær brugertype:** To meget forskellige grupper — (a) enhver
  kunde-bruger, og (b) FleetControls eget personale (kræver
  `support.laes`).
- **Vigtigste opgave:** Lade en kunde beskrive et problem uden at kundens
  driftsdata forlader hans tenant, og lade FleetControl fejlsøge med et
  minimum af adgang til kundens rigtige data.
- **Vigtigste funktioner:** Oprettelsesformular med synlig allowliste
  over hvad der sendes med; kunde-tabel over egne sager; Supportoverblik
  (kryds-tenant tabel med KPI'er); Supportsag (tråd, tidsbegrænset
  auditudtræk, løsnings-checkliste, supportadgangs-panel).
- **Undermoduler/skærme:** Hjælp & Support (`/support`), Supportoverblik
  (`/support/overblik`), Supportsag (`/support/sag/:id`).
- **Afhænger af (andre moduler):** Ingen registreret i `MODUL_KRAEVER`.
  Modulet er `altid: true`.
- **Afhænges af:** Ingen andet modul læser `support/`-noderne. Isoleret.
- **Samlet status:** **MOCK/DEMO, FASE 0 på tværs af alle tre skærme.**
  Ingen af skærmene har en reel skrive- eller læsevej mod databasen — al
  data kommer fra `demo-support.js` og bruges **direkte**, ikke som
  fallback. De fire `support.*`-permissions findes desuden **ikke** i
  `permissions.js`/`ROLLE_PERMS` — ingen rolle, heller ikke admin, kan
  nogensinde få dem.
- **Overlap-mistanke:** Navnet "sag" kolliderer sprogligt med
  Fleet/Facilitys værksteds-/leverandørsager, men det er en **anden**
  RTDB-struktur, en anden permission-familie (`sag.*` vs. `support.*`) og
  en anden Cloud-Function-familie.

---

## 12. Ejerkonsol / Udbyder
*Kilde: dossier 10*

- **Navn:** Ejerkonsol (i koden "udbyder"; ruten er `/main` og
  `/main/priser`).
- **Formål:** FleetControls eget værktøj til at oprette, styre og
  fakturere kunder — kundeoprettelse, modul-til-/fravalg,
  abonnementstilstand, rabataftaler, første administrator-oprettelse,
  samt prislister og det månedlige fakturagrundlag.
- **Primær brugertype:** FleetControls eget personale (SaaS-leverandøren),
  IKKE en tenant-kunde. Den eneste skærm i hele appen hvor brugeren ikke
  har nogen `tenant`-claim (`bruger?.udbyder === true`).
- **Vigtigste opgave:** Oprette/administrere kundeabonnementer og
  generere det låste, revisionsklare fakturagrundlag hver måned.
- **Vigtigste funktioner:** Kundeoversigt med KPI'er og detaljepanel pr.
  kunde (moduler + rabat, abonnementstilstand, generel rabat, oprettelse
  af kundens første administrator, append-only abonnementshistorik);
  Prislister (versionerede, aldrig-rettede, CSV-eksport, sletning kun af
  ubrugte kladder); Fakturagrundlag (dan/mål, frosne fakturaopstillinger,
  CSV-eksport).
- **Undermoduler/skærme:** Konsol (`/main`), Prisliste (`/main/priser`).
- **Afhænger af (andre moduler):** Ingen i `MODUL_KRAEVER`-forstand — den
  ER systemet der tildeler moduler til andre.
- **Afhænges af:** Ingen andet modul læser udbyder-noderne. Kundens egen
  låseskærm læser samme `tenants/<id>/abonnement`-node, men via en helt
  anden vej.
- **Samlet status:** **BUILT.** Al læsning går til rigtige RTDB-noder
  (ingen demo-fallback), al skrivning går gennem ni navngivne Cloud
  Functions, som alle starter med et rigtigt server-side ejertjek
  (`kraevUdbyder`).
- **Overlap-mistanke:** Ingen reel — den eneste skærm i platformen der
  administrerer *andre* tenants, en bevidst adskilt sikkerhedsmodel.

---

## 13. Chaufførapp
*Kilde: dossier 11*

- **Navn:** Chaufførapp (route-præfiks `/app/*`; ikke et modul i
  `nav.js`, ikke en `modulnøgle`).
- **Formål:** Mobilvenlig, minimalistisk grænseflade til den enkelte
  chauffør: se dagens tur, melde status pr. stop, stemple ind/ud,
  indberette fra vejen, søge frihed.
- **Primær brugertype:** Bruger med `rolle === "chauffoer"` — den eneste
  bruger der ender her, og den eneste rute han kan nå overhovedet.
- **Vigtigste opgave:** Vise chaufføren hvad han skal i dag, og lade ham
  melde det tilbage til kontoret uden en computer.
- **Vigtigste funktioner:** Fire-korts forside; Turplan (dagens stop,
  statusmelding pr. stop, offline-kø); Indberetning (otte
  fliser/ti arter, direkte skrivning til `indberetninger`);
  Timeregistrering (ind/ud-stempling); Frihed (ansøgning om
  ferie/feriefridag/afspadsering, svar i appen).
- **Undermoduler:** Ingen — flad rutestruktur (index, `tur`, `tid`,
  `indberetning`, `frihed`).
- **Afhænger af (andre moduler):** Læser data der ejes af `booking`
  (`etaper`, `statushaendelser`), `bemanding` (`fravaer`, `stemplinger`),
  `flaade` (`indberetninger`) — men appen selv er ikke gatet af noget
  modul.
- **Afhænges af:** Ingen andre skærme — selvstændig gren, sideordnet
  AppShell.
- **Samlet status:** **PARTIAL/BUILT** — ingen skærm er MOCK/DEMO i
  drift, men Timeregistrering/Turplan/Frihed afhænger alle af en
  `personId`-kobling der kan mangle, og appen har ingen
  mail-notifikation (bevidst udskudt).
- **Overlap-mistanke:** Turplan/Indberetning/Timeregistrering/Frihed
  skriver til noder som Workforce/Bemanding- og Booking/Planning-
  dossieret også dokumenterer fra kontorsiden (`stemplinger`, `fravaer`,
  `etaper`, `statushaendelser`).

---

## 14. Login
*Kilde: dossier 11*

- **Navn:** Login (`src/moduler/Login.jsx`, rute `/login`).
- **Formål:** Autentificering før en session findes. Ligger uden for
  AppShell, Udbyderramme og Chauffoerramme.
- **Primær brugertype:** Enhver ikke-logget-ind bruger — kontor,
  chauffør, ejer bruger samme login-skærm.
- **Vigtigste opgave:** E-mail/adgangskode-login mod Firebase Auth, og en
  klar besked når kontoen findes men mangler et tenant-claim
  ("uprovisioneret").
- **Vigtigste funktioner:** `signInWithEmailAndPassword`; fejltekst-
  oversættelse pr. Firebase-fejlkode; "Uprovisioneret"-tilstand; i
  dev-miljø forudfyldes felterne med en seedet ejerkonto.
- **Undermoduler:** Ingen.
- **Afhænger af (andre moduler):** Ingen — den eneste eager-loaded skærm
  i hele appen.
- **Afhænges af:** `App.jsx` (renderer den for `!harAdgang`), indirekte
  hele produktet — der er ingen anden indgang.
- **Samlet status:** **BUILT** — reelt Firebase Auth-kald, ingen mock.
- **Overlap-mistanke:** DEV-autofyld-felterne og `Brugervaelger.jsx`
  (dev/demo-only rollevælger, teknisk en del af AppShell/sidebaren, ikke
  af Login selv) løser delvist overlappende problemer og kan forveksles
  af en ekstern reviewer.

---

## Afhængighedsoversigt

| Modul | Afhænger af | Afhænges af |
|---|---|---|
| Dashboard & Økonomi | Ingen formelt (`MODUL_KRAEVER` tom for `oekonomi`/`dashboard`); funktionelt: `kpi/`, `opgaver`, `indkoebsordrer`, `forbrugsvarer`, `koeretoejer`, `facility/aktiver`, `grundlag`, `etaper`, `kunder` | Ingen modul kræver `oekonomi`/`dashboard` |
| Planning/Booking | Kunder (`MODUL_KRAEVER.booking = ["kunder"]`) | Økonomi/Fakturering, Flåde, Facility (delt `reservationer`/`opgaver`), Warehouse (transportlabels) |
| Workforce/Bemanding | Ingen | Dashboard, Disponering/`tjekDisponering()`, Flåde/Facility (`serviceTone()`-tærskler) |
| Fleet | Ingen formelt; blød afhængighed af Procure (`leverandoerer`) | Facility (deler `opgaver`), Booking/Disponering, Økonomi, Indkøb |
| Facility | Ingen formelt (`MODUL_KRAEVER` tom); funktionelt: `personale`, `opgaver`, `leverandoerer` (Indkøb), `reservationer`, `fakturaer` | Fakturacenter (`facility/aktiver`), Modulfakturaer |
| Procure/Indkøb | Ingen (`MODUL_KRAEVER` tom for `indkoeb`) | Økonomi (`fakturaer/`), Fleet/Facility (registrerer indkøb i kontekst, godkendelse sker i Indkøb) |
| Unitbooking | Ingen fundet (IKKE PÅVIST med fuld sikkerhed) | Warehouse (deler `reolpladser`) |
| Warehouse | Kunder (`MODUL_KRAEVER.warehouse = ["kunder"]`); Transportlabels kræver Booking blødt | Indkøb/Økonomi (fakturagrundlag), Unitbooking (deler `reolpladser`), Booking (etapedata) |
| Kunder & Priser | Ingen (grundnode); læser `kpi.oekonomi.*` | Booking, Warehouse (`MODUL_KRAEVER`); Warehouses Afregning/Volumen, prismotoren |
| Opsætning | Generelt læser `facility/lokationer` og modulkataloget; Brugere & roller læser `roller/`, `brugere/`, `dashboardvisning/` | Alle moduler implicit (perms-claim mintes herfra) |
| Support | Ingen (`MODUL_KRAEVER` tom) | Ingen andet modul |
| Ejerkonsol/Udbyder | Ingen (`MODUL_KRAEVER`-forstand er ikke relevant — den ER modulsystemet) | Ingen andet modul; kundens egen låseskærm læser samme `abonnement`-node |
| Chaufførapp | Læser data ejet af `booking` (`etaper`, `statushaendelser`), `bemanding` (`fravaer`, `stemplinger`), `flaade` (`indberetninger`); ikke gatet af noget modul selv | Ingen andre skærme |
| Login | Ingen | `App.jsx` (renderer for `!harAdgang`); indirekte hele produktet |

---

## Overlap-mistanker på tværs

- **Fakturacenter (Økonomi) vs. Procure → Fakturaer:** samme
  `fakturaer/`-node, bevidst delt, to linser på samme data
  (dossier 01, 06).
- **Dashboard "Største afvigelser" vs. Økonomi "Største afvigelser":**
  samme `k.afvigelser`-felt, bevidst delt kilde — men feltet er selv
  permanent tomt i aggregeringen (dossier 01).
- **Disponerings dagsgitter vs. Flådens Driftskalender vs. Facilitys
  Servicekalender:** samme `opgaver`-node, samme skriveveje
  (`opgaveplanlaeg`/`opgaveflyt`/`opgavestatus`) og samme komponenter
  (`Gitterkalender.jsx`, `Planlaegdialog.jsx`, `Statusskifte.jsx`), kun
  adskilt af `art`-feltet (dossier 02, 04, 05).
- **Medarbejdere (`/opsaetning/medarbejdere`) vs. Opsætning → Brugere &
  roller:** to forskellige begreber (person vs. login), bevidst
  dokumenteret forvekslingsrisiko (dossier 03).
- **`reservationer`-noden:** delt af fire kilder (booking, værksted,
  facility-sag, fravær) i BASEN, ikke gatet på ét modul — historisk fejl
  hvor 37 reservationer var utilgængelige for en kunde uden Planning
  (dossier 02, 04).
- **Fleets (endnu ikke byggede) `sager`-node vs. Facilitys `sager`:**
  planlagt delt på samme måde som `opgaver`, kun teoretisk overlap i dag
  (dossier 04, 05).
- **`lagre` (Indkøb) vs. `forbrugsvarer` (Indkøb) vs. Warehouses
  `varer`/`beholdning`:** navnemæssig forvekslingsrisiko på tværs af tre
  lagerbegreber, hvoraf de to første begge hører til Indkøb-modulet uden
  at forholdet mellem dem er afklaret i den læste kode (dossier 06, 08).
- **`reolpladser`:** eneste node i kodebasen med bevidst, dokumenteret
  to-modul-ejerskab (Unitbooking + Warehouse) — et gennemtænkt
  shared-node-design, ikke en tilfældig overlapning (dossier 07, 08).
- **Carriers (Warehouse) vs. Kasser (Unitbooking):** fysisk samme
  koncept (en beholder på en hylde), bevidst adskilte noder og
  tilstandsmaskiner, men tælles sammen i den fælles belægningsopgørelse —
  ren brugerforvirringsrisiko, intet datamæssigt overlap (dossier 07, 08).
- **Kundens `prisgruppe`-felt:** filtrerer stadig i Kunder.jsx/
  Kundepriser.jsx, men bærer ikke længere en pris — et levn fra en
  tidligere prismodel (dossier 09).
- **Opsætning-menuens "grab-bag"-natur:** Enheder (Fleet), Kasseliste
  (Unitbooking) og Medarbejdere (Bemanding) ligger fysisk sammen med
  Kunder/Priser og Brugere/Integrationer uden funktionel sammenhæng —
  bevidst erkendt i kildekoden (dossier 09).
- **"Sag" i Support vs. "sag" i Fleet/Facility:** sprogligt sammenfald,
  men to adskilte RTDB-strukturer, permission-familier og
  Cloud-Function-familier — ingen delt node (dossier 10).
- **Turplan (chaufførapp) vs. kontorets Rute & status/Disponering:**
  samme `etaper`/`statushaendelser`-noder, to visninger med forskelligt
  filter (personId vs. alle) — ikke et datamæssigt overlap, men kan
  fejlagtigt læses som to uafhængige moduler (dossier 11).
- **Indberetning (chaufførapp) vs. Flåde → Indberetninger (kontor):**
  samme `indberetninger`-node, filtreret modsat vej (dossier 04, 11).
- **DEV-autofyld i Login.jsx vs. `Brugervaelger.jsx` vs.
  demo-rollevælgeren i AppShell:** tre mekanismer der visuelt/konceptuelt
  ligner hinanden, men kun `Brugervaelger` skifter en rigtig Firebase
  Auth-session (dossier 11).
