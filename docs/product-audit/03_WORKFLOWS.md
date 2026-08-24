# 03 — Arbejdsgange (end-to-end)

> Sammensat udelukkende af de numrerede "Workflow-observationer"-spor i de 11
> modul-dossierer (`docs/product-audit/_dossiers/`). Ingen trin er tilføjet
> eller gættet ud over hvad det pågældende dossier selv sporede; hvor et
> dossier ikke sporede et trin, står det som **IKKE PÅVIST**. Status-labels
> (BUILT/PARTIAL/MOCK/DEMO/PLANNED/NOT_BUILT) er bevaret som skrevet i kilden.

---

## Planning / Booking

Kilde: `_dossiers/02-planning-booking.md`.

Forespørgsel → match/forslag → reservation → disponering →
køretøj/chauffør/hænger → transport → faktisk tid → omkostning/CO₂:

1. **Forespørgsel oprettes** — **BUILT**. `NyForespoergsel.jsx` →
   `opretBooking()` → Cloud Function `bookingopret`. Skriver booking + én
   etape + to stop atomisk, tildeler `BKG-ÅÅÅÅ-NNNNN` fra en
   counter-transaction. Starter altid i tilstand `kladde`.
2. **Send til planlægning** — **BUILT**, men et bevidst separat kald fra
   oprettelsen (kan ikke lægges atomisk sammen). Etapeskift `kladde →
   afventerPlan` via `Etapeskifte.jsx` → `skiftEtape()` → Cloud Function
   `etapeskift`.
3. **Match/forslag** — **BUILT**. Disponenten laver 1–3 forslag pr. etape
   (enhed(er), chauffør, tider, transit, estimat) via `Disponering.jsx` →
   `Forslagsdialog.jsx` → `skrivForslag()` → Cloud Function `forslagskriv`.
   Kører de samme fem disponeringstjek som godkendelsen. Forslaget binder
   INTET — ingen reservation skrives her.
4. **Reservation/godkendelse (fire-øjne)** — **BUILT og håndhævet
   server-side** (beslutning 5). Koordinatoren (kræver `booking.godkend`,
   som disponenten bevidst IKKE har) vælger et forslag → `skiftEtape()` →
   Cloud Function `etapeskift`. Kører de fem tjek igen server-side, binder
   enhed(er) + chauffør, skriver reservation pr. ressource atomisk med
   etapens tilstandsskift og bookingens afledte tilstand.
5. **Disponering — dag (værksted) vs. uge (langture)** — Dagsgitteret
   (opgaver, art `vaerksted`) er **BUILT** med reel træk/slip og oprettelse.
   Ugesgitteret (etaper/langture) er **bevidst view-only** — reel binding
   sker udelukkende via godkendt forslag (trin 3–4), ikke via et træk i
   gitteret. Ingen automatisk/optimeret tildeling nogen steder — alt manuelt.
6. **Transport/faktisk gennemførelse** — **BUILT** som skrivevej.
   Chaufføren melder status (Cloud Function `statusmelding`, uden for dette
   moduls skærmfiler), etapen skiftes videre til `udfoert` via
   `Etapeskifte`/`etapeskift`. **INGEN GPS/sporing** (beslutning 22).
7. **Rute & status-opfølgning** — **BUILT** som ren visning. Planlagt rute,
   chaufførens meldinger, afvigelse fra plan (kun når noget faktisk kan
   måles), "sidst hørt" i minutter som erstatning for en position.
8. **Omkostning/pris** — **BUILT** som beregning og læsning
   (`pricing.js`s `beregnBooking()`/`beregnForloeb()` mod satsarket i
   `omkostninger`-noden). **Satsvedligehold (oprette/redigere en sats) er
   IKKE bygget** — "Tilføj/Redigér sats"/"Gem ændringer" på
   Bookingopsætning sætter kun lokal state, intet `gem()`/Cloud
   Function-kald findes. **CO₂/emission: IKKE PÅVIST** — intet felt,
   beregning eller UI-reference fundet.
9. **Koordinator-feedback/notifikation** — **NOT_BUILT**. Ingen mail- eller
   push-notifikation når en koordinator godkender/afviser/returnerer. Kun
   in-app synlighed for den der selv navigerer til skærmen (Oversigtens
   "Kræver handling"-liste, Disponerings detaljepanel, Forslag-skærmen).

**Yderligere sporede punkter fra Implementation-status:**
- **Direkte/dedikeret/kombi-booking:** kun ét `TRANSPORTTYPE`-dropdown-felt
  findes ("Kombineret transport" er én af flere valgmuligheder); ingen
  UI til at oprette en booking med flere strækninger direkte, selvom
  datamodellen (`post.straekninger`) understøtter det. **IKKE PÅVIST**
  nogen yderligere logik der skelner "direkte" fra "dedikeret".
- **Tidsvinduer:** **BUILT** for ønsket afhentning/levering
  (fleksibilitetsspænd) og per-stop-tidsvinduer. Kunders generelle
  åbningstider uafhængigt af en konkret booking: **IKKE PÅVIST**.
- **Ruteoptimering:** **NOT_BUILT**. Ingen søgning efter rute-/
  optimerings-/geokodningslogik gav træf. Al tildeling i Disponering er
  manuel; geografisk validering er dokumenteret som et åbent spørgsmål
  bundet til en fremtidig HERE-integration.
- **Planner-advarsler:** **BUILT**. `tjekDisponering()` samler fem tjek
  (enhedskombination, kompetencer, kapacitet, reservationskonflikt,
  køre-hviletid), vist identisk i Disponering og Forslag, håndhævet
  server-side med samme funktion.

**Samlet vurdering:** Selve transportflowet (opret → forslag → godkend →
reserver → udfør, med reelt håndhævet fire-øjne-kontrol) er brugbart
end-to-end med rigtig backend — det bedst udbyggede spor i modulet.
Ruteoptimering og koordinator-notifikation mangler helt, og
satsvedligeholdelsen i Bookingopsætning er en UI-attrap (knapperne skriver
intet). CO₂ er slet ikke modelleret.

---

## Fleet

Kilde: `_dossiers/04-fleet.md`.

Indberetning → vurdering → planlægning → leverandør/værksted → mail →
kalenderreservation → udførelse → faktura → faktisk omkostning → historik:

1. **Indberetning oprettes** (chauffør melder en hændelse) —
   **PARTIAL/IKKE PÅVIST i denne modulgennemgang.** Datamodellen findes
   fuldt ud (10 arter, 2 klasser, sensitive felter), men ingen opret-vej
   blev fundet i `src/moduler/flaade/*.jsx` selv (Fleet-modulets egne
   skærme har kun visning). Chaufførapp-dossieret (11) bekræfter separat en
   reel skrivevej derfra (se "Chaufførens dag" nedenfor) — set fra
   Fleet-modulets eget filsæt er trinnet dog IKKE PÅVIST.
2. **Vurdering/triage** — **MOCK/DEMO**. `Indberetninger.jsx` viser
   forløbstilstand og prioritet, men "Afslut"-knappen er permanent
   deaktiveret ("Fase 0: indberetninger/ skrives ikke fra klienten endnu").
3. **Planlægning (opret driftsopgave)** — **BUILT**. Cloud Function
   `opgaveplanlaeg`, kaldt fra `Vaerkstedskalender.jsx` →
   `Planlaegdialog.jsx`. Tjekker permission, abonnement, modulaktivering,
   enhedens status, skriver opgave + reservation atomart.
4. **Leverandør/værksted tildeles** — **BUILT** som datafelt
   (`leverandoerId` på opgaven, opslag mod Procures `leverandoerer`-node).
   Ingen selvstændig værksteds-tildelingsworkflow ud over dette felt.
5. **Mail (bekræftelse til værksted)** — **PLANNED/fase 0**. Ingen reel
   afsendelse findes nogen steder i `functions/index.js` (ingen SMTP/
   nodemailer/SendGrid-kald). `sager`-noden mangler i
   `firebase.rules.json`. Kun en hardkodet demo-tråd vises.
6. **Kalenderreservation** — **BUILT**. Skrives atomart med opgaven af
   `opgaveplanlaeg`/`opgaveflyt`/`opgavestatus`, vist i Driftskalenderens
   gitter.
7. **Udførelse (statusskift, evt. faktisk tid)** — **BUILT**. Cloud
   Function `opgavestatus`, kaldt fra `Statusskifte`-komponenten;
   accepterer valgfri, server-valideret `faktiskMin`.
8. **Faktura** — **BUILT, men uden for Fleet** (bevidst arkitekturvalg).
   Godkendes i Indkøb → Fakturaer; Fleet viser kun den delte visning via
   `Modulfakturaer art="fleet"`.
9. **Faktisk omkostning** — **PARTIAL**. `faktiskMin` (tid) er BUILT.
   Materialeforbrug-til-fakturagrundlag/lagertræk-logikken
   (`grundlagslinjeFraMateriale`, `lagertraekFraMateriale`) er BUILT som ren
   funktion, men ingen bekræftet UI-trigger blev fundet i de gennemgåede
   Fleet-skærme.
10. **Historik** — **BUILT**. Ingen hardsletning af enheder; afgang
    registreres med årsag; nedetid/åbne fejl regnes afledt af historiske
    indberetninger/besøg.

**Samlet vurdering:** Planlægning → reservation → udførelse er en solid,
server-håndhævet kæde. Selve indberetningens oprettelse (trin 1) og
triage/vurdering (trin 2) er ikke bygget fra Fleet-modulets egne skærme —
"triagen" er reelt kun en visning uden handling. Mail til
værksted/leverandør er slet ikke bygget (fase 0, eksplicit erkendt i
koden), og faktisk omkostning fra materialeforbrug mangler en bekræftet
UI-udløser. Faktura og historik er solide, men faktura ligger bevidst uden
for modulet.

---

## Facility

Kilde: `_dossiers/05-facility.md`.

Indberetning → vurdering → leverandørbesøg → planlægning → kommunikation →
udførelse → faktura → historik:

1. **Indberetning (fejlmelding)** — **BUILT**. `Fejlformular` i
   `Oversigt.jsx` → `gem()` → `facility/fejl/<id>`. Alvor er et
   menneskeligt valg, ikke en udledning.
2. **Vurdering** — **BUILT** som ren afledning. `lokationTilstand()`/
   `driftsforhold()` regner Normal/Advarsel/Kritisk af åbne fejl +
   anlægsstatus + klimaalarmer — intet gemt vurderingsfelt.
3. **Leverandørbesøg (valg af leverandør)** — **BUILT** som
   datakartotek-opslag (Servicedialog filtrerer `leverandoerer` på
   `kategori: "facility"`), men det **stopper ved valget** — ingen
   bekræftelse tilbage til leverandøren.
4. **Planlægning (booking af tid/reservation)** — **BUILT**.
   `planlaegFacilityopgave()` → Cloud Function `facilityplanlaeg`, atomisk
   opgave + reservation, server-håndhævet indeslutning ("hallen og porten
   er ét rum").
5. **Kommunikation (udgående mail/bekræftelse til ekstern leverandør)** —
   **IKKE BYGGET**. Eksplicit kildekode-kommentar: "INGEN MAIL … beslutning
   20 er fase 0." Ingen mailafsendelse, ingen bekræftelsesskabelon, ingen
   `sager/`-node i reglerne.
6. **Udførelse (status i felten)** — **BUILT**. `Statusskifte.jsx` +
   Cloud Function `opgavestatus`, samme mønster som Fleets
   værkstedsopgaver.
7. **Faktura** — **PARTIAL/delt med Procure**. Facility viser
   (`Modulfakturaer art="facility"`), men godkender/placerer ikke selv —
   det sker i det fælles Fakturacenter (Økonomi-modulet).
8. **Historik** — **IKKE PÅVIST**. Ingen dedikeret facility-historikskærm
   fundet i moduls filsæt.

**Yderligere hul sporet i Implementation-status:** Energistatistik
(bygningsomkostninger, `facility/omkostning`) læses og vises, men **ingen
skærm skriver til noden** — PARTIAL/hul, kan ikke bruges end-to-end af en
bruger. Klimaovervågning tilsvarende BUILT for læsning, men ingen skærm
skriver zoner/grænser/målinger (mulig IoT-integration eller provisionering,
IKKE PÅVIST).

**Samlet vurdering:** Fejlmelding → vurdering → planlægning → udførelse er
en solid, server-håndhævet kæde med ægte reservationskonflikt-kontrol.
Kommunikation til ekstern leverandør er slet ikke bygget (samme
"beslutning 20, fase 0" som Fleet), og faktura-godkendelse ligger bevidst
uden for modulet. Historik er ikke påvist, og energistatistikkens
skrivevej mangler helt.

---

## Procure

Kilde: `_dossiers/06-procure-indkoeb.md`.

Behov → leverandørforslag → antal → bestilling/PO → evt. godkendelse →
mail til leverandør → varemodtagelse → faktura → match → godkendelse →
regnskabsgrundlag (inkl. kontant/betalt køb):

1. **Behov** — **BUILT**. `Behov.jsx` → `meldBehov()` → Cloud Function
   `behovskriv`. Skriver `indkoebsbehov/<id>` med status `nyt`.
2. **Leverandørforslag** — **BUILT** (ren beregning). `foreslaaLeverandoer()`
   slår op i egen indkøbshistorik (varenummer, dernæst navn); returnerer
   `null` ("Leverandør mangler") uden træf. Ingen ekstern prisdatabase.
3. **Antal** — **BUILT**. Sættes på Bestillinger-skærmen, sendes til
   `opretBestilling()`. Behovets antal er bevidst valgfrit.
4. **Bestilling/PO** — **BUILT**. `Bestillinger.jsx` → `opretBestilling()`
   → Cloud Function `ordreskriv`. Nummerserie `BST-ÅÅÅÅ-NNNNN`, opdaterer
   behovenes status atomisk.
5. **Evt. godkendelse** — **BUILT**. `Godkendelser.jsx` → `skiftOrdre()` →
   Cloud Function `ordrestatus`. To slåes-fra-regler
   (`godkendelsesregler`, beløbsgrænse/fakturagodkendelse) kan slås helt
   fra. Selvgodkendelse er bevidst tilladt, men markeret (`selvgodkendt:
   true`).
6. **Mail til leverandør** — **MOCK/manuel, ikke sendt af systemet.**
   `mailudkast()` bygger emne+brødtekst client-side; "Kopiér udkast"
   (clipboard) er eneste systemstøtte. **Ingen Cloud Function sender mail**
   for Procure. "Markér som sendt" er et rent statusfelt (`ordrestatus` →
   `sendt`) sat af et menneske. Dokumenteret som bevidst fase 1-begrænsning.
7. **Varemodtagelse** — **BUILT** som statusskifte (`ordrestatus` →
   `modtaget`). Ingen linje-niveau modtagekontrol observeret.
8. **Faktura (modtagelse)** — **PARTIAL**. "Upload er ikke bygget endnu" —
   ingen fillagring. **IKKE PÅVIST** hvordan en faktura reelt kommer ind i
   `fakturaer/`-noden i produktion.
9. **Match** — **BUILT**, reel regelbaseret felt-matching (ikke OCR).
   `matchFaktura()` → Cloud Function `fakturamatch`. Kun
   bestillingsnummer giver 100 %-score; alt andet er en markeret "slutning".
10. **Godkendelse (faktura)** — **BUILT**. `skiftFaktura()` → Cloud
    Function `fakturastatus`. Kræver `indkoeb.godkend`.
11. **Regnskabsgrundlag** — **PARTIAL/MOCK**. "Bogfør"-knappen sætter kun
    `fakturastatus` → `bogfoert` internt — "Der sendes ikke noget til et
    regnskabssystem." Tre-vejs afstemningskortet kalder `demoAfstemning()`
    **ubetinget for alle kunder** (ikke et `useListe`-faldback) — reel
    MOCK-visning uanset Firebase-tilstand.
12. **Kontant/betalt køb** — **BUILT**. `kontantkoebskriv` Cloud Function,
    gemt som en almindelig `indkoeb`-linje med `betalingsform: "kontant"`
    (bevidst ikke en egen node). Kvittering/bilag kan ikke vedhæftes (ingen
    fillagring) — spærrer ikke.

**Samlet vurdering:** Kernekæden behov → bestilling → godkendelse →
fakturamatch → godkendelse fungerer end-to-end MED to bevidste, manuelle
brud: leverandørmailen skal sendes af et menneske uden for systemet, og
selve bogføring/betaling sker uden for systemet (ingen regnskabsintegration
noget sted). Ingen OCR/dokumentgenkendelse findes — matchning er
felt-til-felt sammenligning af allerede strukturerede data. Afstemningskortet
viser fast opdigtet data uafhængigt af Firebase-forbindelse og bør ikke
læses som en reel funktion.

---

## Warehouse

Kilde: `_dossiers/08-warehouse.md`.

Modtagelse → carrier/item → transit → lokation → bevægelser → delvis
udtagning → pluk/afgang → volumen/handling/rater:

1. **Vare og kunde oprettes** — **BUILT**. Kræver kunde valgt først
   (`kundeId` påkrævet, håndhævet klient- og regelside).
2. **Beholder (carrier) oprettes/scannes ind, status `iTransit`** —
   **BUILT** for scanning ind som en bevægelse; oprettelse af en ny
   carrier-post sker via Transportlabels' mærkatformular eller en
   `modtag`-bevægelse.
3. **Transit → placering** — **BUILT**. Cloud Function `bevaegelseskriv`
   art `putaway` sætter `pladsId` og status `paaLager` atomisk. Forslag om
   ledig plads er ægte belægningsdata, ikke gættet.
4. **Lokation (reolplads) forvaltes** — **BUILT**, delt node med
   Unitbooking (`flet:true`-skrivning bevarer det andet moduls felter).
5. **Bevægelser registreres generisk** — **BUILT**, samme Cloud Function
   som trin 3, andre `art`-værdier (modtag, flyt, pluk, afsend, retur,
   optael, justering). En bevægelse kan ikke rettes bagefter (append-only —
   en justering registreres i stedet).
6. **Delvis udtagning (pluk mod en plukordrelinje)** — **BUILT**.
   `skrivBevaegelse({art:"pluk"})`; fremdrift udledt live af bevægelserne,
   ikke af et lagret felt. Overpluk klippes bevidst ikke væk.
7. **Pluk/afgang (afsendelse)** — **BUILT**. `afsendPlukordre()` → Cloud
   Function `plukordreafsend`, som afsender de FAKTISK plukkede mængder
   læst af bevægelserne — `afsendt` kan ikke sættes direkte af klienten.
8. **Volumen/handling/rater** — Volumen: **BUILT** som ren beregner,
   **PLANNED** for selve tilbudsoprettelsen (nodeform for `tilbud` er ikke
   besluttet — intet dokument oprettes bevidst). Afregning: **BUILT** for
   linjeberegning + kladdeoprettelse af fakturagrundlag; selve
   fakturagodkendelsen ligger bevidst uden for modulet (Indkøb/Økonomi).

**Yderligere sporede punkter:** Optælling (cycle count) er **BUILT** —
serveren beregner afvigelsen, klientens forventede tal sendes aldrig med.
Sporbarhed er **BUILT** som ren visning, med et bevidst dobbeltspor:
batch-sporede varer er en beregnet visning over `bevaegelser`; serie-sporede
varer har en egen, atomisk skrevet `enheder`-node som ægte
chain-of-custody, med et synligt uenighedspanel hvis de kommer ud af trit.

**Samlet vurdering:** Hele kernekæden (vare → bevægelse → beholdning → pluk
→ afsendelse, og optælling → afvigelse) er BUILT gennem tre ægte,
server-håndhævede Cloud Functions — ingen skærm er MOCK/DEMO i betydningen
"kun demo-data selv med rigtig backend". De eneste PARTIAL/PLANNED-punkter
(kundezone-reservation, fysisk lagerkort, tilbudsoprettelse) er bevidste,
dokumenterede modelgrænser, ikke uafsluttet arbejde på det der ER bygget.
Warehouse fremstår som det mest komplette modul af de sporede kæder.

---

## UnitBooking

Kilde: `_dossiers/07-unitbooking.md`.

Reservation → klargøring → udlån → forventet retur → retur →
frigivelse/ny reservation:

1. **Reservation** — **BUILT**. Bruger søger ledige kasser i periode
   (`ledigeKasser()`), udfylder Reservationsformular, `opretUdlaan()`
   kalder Cloud Function `kasseudlaanskriv`, som validerer og skriver i en
   RTDB-transaktion der genlæser og konflikttjekker atomisk. Sagsnummer er
   påkrævet nøgle.
2. **Klargøring** — **BUILT**. `skiftUdlaan({til:"klargjort"})` fra Udlån-
   eller Kalender-skærmen, samme funktion begge steder. Server sætter
   kassestatus, kassen bliver stående på sin hylde.
3. **Udlån (udlevering)** — **BUILT**. Samme `skiftUdlaan`-mønster; server
   stempler `udleveretMs` og rydder kassens `pladsId`.
4. **Forventet retur** — **BUILT** (som beregnet visning, ikke et separat
   trin). `returneresSnart()` beregner ud fra `til`-feltet, som er
   påkrævet ved oprettelse.
5. **Retur** — **BUILT**. `skiftUdlaan({til:"returneret"})`. Server
   stempler `returneretMs`, sætter kasse til `ledig`,
   `pladsId: hjemPladsId`.
6. **Frigivelse/ny reservation** — **BUILT** (implicit). Kassen er nu
   `ledig` og fremkommer igen i søgningen. Ingen "genåbn"-funktion fra
   `returneret` — et nyt udlån oprettes fra bunden, med vilje, for at
   bevare historikkens integritet.

Hele kæden håndhæves dobbelt: klienten viser kun knapper for lovlige skift
(`UDLAAN_SKIFT`/`naesteSkift()`), serveren håndhæver den identiske tabel
(`kanSkifteUdlaan()`) — ingen observeret afvigelse mellem UI-tilbudte og
server-tilladte handlinger.

**Samlet vurdering:** Samtlige seks trin i kæden er BUILT og
end-to-end brugbare, med hele skrivevejen gennem én transaktionsbaseret
Cloud Function (`kasseudlaanskriv`) — dette er en bevidst arkitekturbeslutning
(klienten kan ikke garantere atomisk skrivning + samtidighedstjek), ikke en
mangel. Modulet fremstår som fuldt funktionsdygtigt for hele sin kerne;
eneste observerede begrænsning er at en eksisterende kassetype ikke kan
redigeres/slettes fra UI (kun oprettes).

---

## Fakturacenter

Kilde: `_dossiers/01-dashboard-oekonomi.md`.

Alle indgangskanaler → OCR/læsning → match → modul/sag/ordre → godkendelse
→ eksport:

1. **Indgangskanaler** — **IKKE bygget**. `FAKTURAKILDE` definerer fire
   tiltænkte kanaler (`mail`, `upload`, `mobil`, `sag`), alle markeret
   `bygget: false`. Skærmen viser bevidst intet upload-UI ("Ingen af
   indgangene er bygget endnu"). Ingen fillagringsløsning findes i
   platformen.
2. **OCR/læsning** — **IKKE bygget**, intet spor af nogen OCR-pipeline.
   Fakturaer kommer ind som allerede strukturerede poster i
   `fakturaer/`-noden via kilden `registreret` (en person taster dem ind
   et andet sted i systemet, Procure-modulet).
3. **Match (destinationsforslag)** — **BUILT** og relativt sofistikeret.
   `foreslaaDestination()` scorer forslag mod Fleet-/Facility-opgaver,
   Procure-ordrer og eget forbrugslager, med eksplicitte, forklarlige
   signaler. Kun et nummertræf giver 100 %; loft på 95 % ellers, minimum
   40 % for at vises. Filtreret på kundens moduler.
4. **Modul/sag/ordre-tilknytning** — **BUILT**. `saetDestination()`
   skriver destinationen via ægte Cloud Function `fakturadestination`, med
   identisk klient-/serverkontrol. En bogført faktura kan ikke flyttes.
5. **Godkendelse** — **BUILT**, todelt med vilje. "Placering" (hvor hører
   fakturaen hen) og "betalingsgodkendelse" (`indkoeb.godkend`) er to
   forskellige handlinger/permissions — bevidst skille mellem den der
   konterer og den der kan betale.
6. **Eksport** — **IKKE bygget** for indgående fakturaer. "Der sendes
   ikke noget til et regnskabssystem. Bogføring sætter tilstanden her; der
   er ingen integration." "Bogfør/eksportér"-knappen ændrer kun status
   internt. (Til sammenligning: **udgående** fakturagrundlag i
   Fakturering-skærmen HAR en ægte fileksport — CSV/JSON.)

**Yderligere sporet i samme dossier (Fakturering, komplementær kæde):**
godkend/lås/eksport-kæden for udgående fakturagrundlag er **BUILT**
og server-håndhævet, men **der er ingen fundet UI-vej i Booking/Planning
til at oprette et forløbsbaseret (booking-tur) grundlag** — kun Warehouses
periodeafregning (`Afregning.jsx`) kalder reelt `opretGrundlag()`.
Fakturering-skærmen selv har ingen "opret grundlag"-knap.

**Samlet vurdering:** Matching → destinationssætning → todelt godkendelse
er den bedst udbyggede del af hele Fakturacenter-kæden og fungerer
end-to-end på data der allerede er i basen. Indgang (mail/upload/OCR) og
regnskabsintegration for indgående fakturaer mangler helt og er tydeligt
markeret som sådan i koden — ingen skjulte attrapper fundet. Selve
tur-fakturering (booking → grundlag) mangler sin UI-indgang på trods af
færdig backend-understøttelse.

---

## Support

Kilde: `_dossiers/10-support-ejerkonsol.md`.

AI/self-service → supportsag → intern behandling → evt. supportadgang →
løsning → lukning:

1. **AI/self-service-hjælp** — **NOT_BUILT**. Ingen selvbetjeningslag findes
   før oprettelsesformularen; eksplicit fravalgt i kommentarerne ("INGEN
   AI-DIAGNOSE … en score må kun findes hvis beregningen kan vises").
2. **Kunden udfylder og forsøger at oprette en supportsag** —
   **MOCK/DEMO**. Kategorien/prioriteten/beskrivelsen kan tastes (lokal
   state), men "Opret supportsag"-knappen er permanent deaktiveret
   ("Oprettelse er ikke bygget endnu (fase 0)").
3. **Sagen dukker op i Supportoverblikket hos FleetControl** —
   **MOCK/DEMO, og strukturelt uopnåeligt**. `Supportoverblik` kræver
   `support.laes`, som ikke findes i `ROLLE_PERMS` for nogen af de syv
   roller — heller ikke admin.
4. **Intern behandling (tråd, checkliste)** — **MOCK/DEMO**.
   Kommunikation vises, men "Send svar" er deaktiveret ("Afsendelse er
   ikke bygget endnu (fase 0)").
5. **Auditudtræk til fejlsøgning** — **BUILT som ren beregningsfunktion,
   MOCK som data**. `klipUdtraek()`/`udtraekVindue()` er ægte, prøvbare
   funktioner (±5 min/50 poster, beslutning 24), men kører på
   `DEMO_AUDITUDTRAEK`, ikke et rigtigt Cloud-Function-kald.
6. **Evt. supportadgang bevilges af kundens administrator** — **PLANNED**.
   Modellen er grundigt designet (`kanGiveAdgang()`/`byggBevilling()`),
   men "Giv midlertidig adgang" er deaktiveret — ingen node, ingen regel,
   ingen Cloud Function eksisterer. Ikke reel impersonation ("log ind som
   kunde") nogen steder.
7. **Løsning** — checklisten kan kun ses, ikke afkrydses fra UI.
   **MOCK/DEMO**.
8. **Lukning af sagen** — **NOT_BUILT**. Ingen statusskift-mekanisme findes
   noget sted for supportsager.

**Kritisk fund fra samme dossier:** De fire `support.*`-permissions
(`support.opret`, `support.laes`, `support.skriv`, `supportadgang.giv`) er
**ikke** optaget i `permissions.js`/`ROLLE_PERMS` overhovedet — ingen af
de syv roller, heller ikke admin, kan nogensinde få dem. Enhver rigtig
bruger vil altid få "Din rolle har ikke [permission]". Al data i alle tre
Support-skærme kommer fra `demo-support.js` og bruges **direkte**, ikke
som `useListe`-fallback — der findes ingen `support/`-node i
`firebase.rules.json` overhovedet.

**Samlet vurdering:** Hele Support-workflowet er i dag en
visningsprototype (fase 0) fra ende til anden. Selv hvis alle knapper blev
"tændt" i UI'en i morgen, mangler både RTDB-noderne i
`firebase.rules.json`, de fire `support.*`-permissions, og enhver
tilsvarende Cloud Function. (Til sammenligning, samme dossier: Ejerkonsollens
kunde-/abonnementsstyring og Prisliste-administration er **BUILT,
brugbar ende-til-ende** — det er kun selve Support-fanen for kundevendte
supportsager der er fase 0, ikke hele modulparret.)

---

## Chaufførens dag (bonus)

Kilde: `_dossiers/11-chaufforapp-login.md`.

Login → dagens tur → statusmelding pr. stop (inkl. offline-kø) →
indberetning → stempling → fraværsansøgning:

1. **Login** — **BUILT**. `auth.signInWithEmailAndPassword` mod Firebase
   Auth, ingen mock. `App.jsx` afgør derefter rammen (`onAuthStateChanged`
   → `erChauffoer` sand ⇒ kun `/app/*`-blokken renderes).
2. **Ser dagens tur (Forside → Turplan)** — **BUILT**. Turplan henter
   `etaper` filtreret på `personId` for valgt dag, udleder stop via
   `planlagteStop()`.
3. **Melder status pr. stop, inkl. offline-kø** — **BUILT**. `meld()`
   kalder Cloud Function `statusmelding`, som slår `personId` op
   server-side og afviser ukendte felter. Ved forbindelsesfejl lægges
   meldingen i `meldingskoe.js` (localStorage, nøglet på `klientId`) og
   gensendes ved `online`-event eller manuelt — vist som "gemt — sendes
   automatisk", ikke som en fejl. En reel serverafvisning fjernes derimod
   fra køen med synlig fejlbesked. **Ingen server-side reaktion** ud over
   selve skrivningen — ingen notifikation, ingen auditpost, ingen trigger;
   kontoret opdager først en melding ved selv at genindlæse Rute & status.
4. **Evt. indberetning** — **BUILT**. Direkte `gem()`-skrivning til
   `indberetninger` (ingen Cloud Function, ejerskab håndhæves i reglen på
   `oprettetAf`). **Ingen offline-kø** for denne skrivning (kun
   statusmeldinger har `meldingskoe.js`) — IKKE PÅVIST om en indberetning
   tabes ved manglende forbindelse.
5. **Evt. klokker ind/ud** — **BUILT**. Direkte `gem()` til
   `stemplinger/{personId}/{id}`, håndhævet af regel (ejerskab på sti,
   frossen lukket vagt). Ingen offline-kø.
6. **Evt. søger fravær** — **BUILT for selve ansøgningen** (skriv/læs,
   snæver selvbetjenings-gren i reglerne: ny post, egen `personId`,
   `oensket` ∈ {ferie, feriefridag, afspadsering}, status altid `ansoegt`).
   Svar/godkendelse sker udelukkende fra kontorsiden. Mail-notifikation
   nævnt i specifikationen er **PLANNED** (fase 0 af beslutning 20),
   erstattet i UI-teksten af "svar her i appen."

**Krydstjek mod Workforce/Bemanding-dossieret (03):** selve
godkendelsestrinnet for en fraværsansøgning (kontorets `afgjortAf`/`svar`)
er **IKKE PÅVIST/IKKE BYGGET** i noget af de læste filer i Bemanding-
modulet — ingen skærm sætter `ansoegning.status = "godkendt"`. Og selv en
godkendt ansøgning blokerer **ikke automatisk** disponeringen endnu:
`reservationFraFravaer()` beregner formen, men skriver den ikke —
"hører i en Cloud Function", ikke fundet implementeret.

**Samlet vurdering:** Alle syv sporede trin i chaufførens dag har en
fungerende data-vej — chaufførappen er et af de mest konsekvent
færdigbyggede spor i hele kodebasen, inklusive en gennemtænkt offline-kø
for statusmeldinger. Det eneste gennemgående forudsætningskrav er
`brugere/{uid}/personId`; mangler koblingen, stopper Turplan,
Timeregistrering og Frihed alle med samme forklarende tomtilstand i stedet
for at fejle stille. Svagheden ligger i "de næste led": statusmeldinger
udløser ingen notifikation til kontoret, og en fraværsansøgning har ingen
bekræftet godkendelsesvej eller automatisk disponeringsspærring i det
øvrige system.
