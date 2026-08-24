# 06 — Implementation-status

Denne matrix samler de 11 modul-dossiers (`_dossiers/01-…` til `_dossiers/11-…`)
til ét tværgående billede. Status er vurderet **pr. feature, ikke pr. skærm**:
en skærm kan sagtens indeholde flere statusser samtidig (fx Fakturacenter, hvor
match/godkendelse er BUILT mens selve indgangskanalen er NOT_BUILT). Reglen for
hver status: **BUILT** = en rigtig Firebase-læse-/skrivevej findes og bruges
(direkte RTDB-skrivning via `skriv.js`/`gem()`, eller en bekræftet Cloud
Function) — også når visse underliggende tal er `null` fordi kilden mangler,
så længe skrivemekanikken selv er ægte. **PARTIAL** = skærmen er nået, men noget
i kæden persisterer ikke, mangler en skrivevej, eller mangler en integration
(fx læsning er ægte, skrivning er det ikke). **MOCK/DEMO** = data kommer
permanent fra en demo-fil (`demo-*.js`) uafhængigt af Firebase-tilstand — ikke
kun som offline-fallback. **PLANNED** = konceptet er nævnt/designet (ofte med
en synlig, forklarende deaktiveret knap), men ingen skærm/rute/node findes.
**NOT_BUILT** = intet spor findes i de læste filer. Statusserne er kopieret
**ordret** fra dossiernes egne "Implementation-status"/"Workflow-observationer"-
afsnit; hvor et dossier selv skriver "IKKE PÅVIST", er det bevaret som sådan
her i stedet for at blive rundet op eller ned.

---

## Statusmatrix

### 01 — Dashboard & Økonomi

| Feature | Status | Persistence | Teststatus | Kendte blockers/kompromiser | Kan bruges end-to-end? |
|---|---|---|---|---|---|
| Dashboard — brugerlayout (læs/skriv) | BUILT | Rigtig (`gem()` → `brugerlayout/<uid>/<dashboard>`) | IKKE PÅVIST | Ingen | Ja |
| Dashboard — KPI-kort/modulkort | PARTIAL | Rigtig læsning af `kpi/`, men de fleste `kpi.oekonomi`-felter er hardkodet `null` i aggregeringen | IKKE PÅVIST | Driftsomkostninger, budgetafvigelse, dækningsgrad, planlagt/akut vedligehold viser "—" hos en rigtig kunde; Warehouse-/Unitbooking-modulkort siger "Tallene aggregeres ikke endnu" | Nej for nøgletallene, ja for layout |
| Dashboard — "Åbne opgaver der kræver opfølgning"-tabel | MOCK | Kun frontend (`DEMO_DASHBOARD_OPGAVER` importeret direkte, ikke `useListe`) | IKKE PÅVIST | Permanent demo uanset tenant/Firebase-tilstand | Nej |
| Økonomi — KPI-kort (top) | PARTIAL | Rigtig læsning, men kun `ikkeFaktureretOere`/`-Forloeb` er reelt beregnet af data | IKKE PÅVIST | Resten af felterne er `null` med skreven begrundelse (mangler periode/budget/mål) | Nej i praksis |
| Økonomi — kategori-nedbrydning + "Opgaver klar til fakturering" | MOCK | Kun frontend (`demo-oekonomi.js`, permanent, ikke fallback) | IKKE PÅVIST | Ingen node findes for kategori-nedbrydning eller faktureringsklar-liste | Nej |
| Fakturacenter — match/placering/godkendelse/bogføring | BUILT | Rigtig (Cloud Functions `fakturadestination`, `fakturastatus`) | IKKE PÅVIST | Ingen indgangskanal (se nedenfor) — fungerer kun på fakturaer der allerede findes i basen | Ja, for eksisterende fakturaer |
| Fakturacenter — indgangskanaler (mail/upload/mobil/sag) | NOT_BUILT | Ingen (ingen fillagring i platformen) | IKKE PÅVIST | Eksplicit erkendt i koden: "Ingen af indgangene er bygget endnu" | Nej |
| Fakturacenter — eksport til regnskabssystem (indgående fakturaer) | NOT_BUILT | Ingen | IKKE PÅVIST | "Bogfør"-knap sætter kun status, ingen integration | Nej |
| Fakturering — godkend/lås/eksport (CSV/JSON) | BUILT | Rigtig (Cloud Function `grundlagskriv`, server-håndhævet, egen nummerserie) | IKKE PÅVIST | Kun Neutral (JSON)/CSV — bevidst ingen e-conomic/Dinero/Business Central-adapter | Ja |
| Fakturering — oprettelse af forløbsbaseret (booking-tur) grundlag | PARTIAL | Server understøtter (`opretGrundlag()`/`grundlagskriv` handling "opret"), men ingen UI-knap for en booking-tur | IKKE PÅVIST | Kun Warehouse Afregning kalder funktionen, altid med periode, aldrig `bookingId`; Fakturering-skærmen har ingen "opret"-knap | Nej — mangler UI-indgang for disponent |

### 02 — Planning / Booking

| Feature | Status | Persistence | Teststatus | Kendte blockers/kompromiser | Kan bruges end-to-end? |
|---|---|---|---|---|---|
| Booking-oprettelse (kladde) | BUILT | Rigtig (Cloud Function `bookingopret`, atomisk booking+etape+stop) | IKKE PÅVIST | At sende videre til planlægning er et separat, bevidst etapeskift | Ja |
| Forslag (disponent) | BUILT | Rigtig (Cloud Function `forslagskriv`) | IKKE PÅVIST | Loft på 3 aktive forslag; kører samme 5 tjek som godkendelsen | Ja |
| Godkendelse/fire-øjne (beslutning 5) | BUILT | Rigtig, server-håndhævet (`etapeskift`) | IKKE PÅVIST | Ingen | Ja |
| Disponering — dagsgitter (værkstedsopgaver) | BUILT | Rigtig (`opgaveplanlaeg`/`opgaveflyt`/`opgavestatus`) | IKKE PÅVIST | Deler node/komponenter med Fleet/Facility (se overlap-afsnit) | Ja |
| Disponering — ugesgitter (langture) | BUILT (bevidst view-only) | Rigtig visning; binding sker udelukkende via Forslag | IKKE PÅVIST | Ingen — bevidst designvalg, ikke et hul | Ja (via Forslag-skærmen) |
| Rute & status (fase 0-visning) | BUILT (ren visning) | Rigtig | IKKE PÅVIST | Ingen GPS/sporing (beslutning 22, eksplicit) | Ja, som opfølgningsværktøj |
| Bookingopsætning — satsvedligehold (opret/redigér sats) | PARTIAL | Kun frontend for skrivning (læsning/beregning er ægte) | IKKE PÅVIST | "Tilføj/Redigér sats" og "Gem ændringer" skriver intet | Nej |
| Ruteoptimering | NOT_BUILT | Ingen | IKKE PÅVIST | Bundet til en fremtidig HERE-integration, ikke fundet nogen steder | Nej |
| Koordinator-notifikation (mail/push ved godkend/afvis) | NOT_BUILT | Ingen | IKKE PÅVIST | Kun in-app synlighed; ingen mail-/notifikationslogik fundet | Nej |
| Multi-etape/"kombineret" booking i UI | PARTIAL/PLANNED | Datamodellen understøtter flere strækninger, men "Ny forespørgsel" bygger kun ét afhentnings-/leveringspar | IKKE PÅVIST | Ingen UI til at oprette en booking med flere etaper direkte | Nej |
| CO2/emission | NOT_BUILT | — | IKKE PÅVIST | Intet felt/beregning/UI fundet | Nej |

### 03 — Workforce / Bemanding

| Feature | Status | Persistence | Teststatus | Kendte blockers/kompromiser | Kan bruges end-to-end? |
|---|---|---|---|---|---|
| Bemandingsplan (ugeplan, kapacitet pr. funktion, åbne vagter) | MOCK/DEMO | Kun frontend (`DEMO_BEMANDINGSPLAN`, ingen vagtnode i datamodellen) | IKKE PÅVIST | Filens egen kommentar: "der findes ingen vagtnode i ARKITEKTUR"; "Tildel" permanent deaktiveret | Nej |
| Kompetence-/certifikattracking (visning) | BUILT | Rigtig (`useListe` mod `personale`/`kompetencer`) | IKKE PÅVIST | Samme kilde som Disponerings faktiske håndhævelse | Ja for visning |
| Kompetence-override ("Overrul med begrundelse") | NOT_BUILT | Ingen | IKKE PÅVIST | Deaktiveret knap, ingen Cloud Function fundet | Nej |
| Fraværsansøgning (skrivning) | BUILT — men kun via chauffør-appen, ikke Workforce-skærmen | Rigtig, server-håndhævet selvbetjenings-gren i reglerne | IKKE PÅVIST | Kontor-skærmens "Registrér fravær" er deaktiveret | Delvist (kun chaufføren kan ansøge) |
| Fraværsgodkendelse (kontorets svar) | NOT_BUILT | Ingen | IKKE PÅVIST | Ingen skærm sætter `ansoegning.status = "godkendt"` eller skriver `afgjortAf`/`svar` | Nej |
| Fravær → reservation (blokerer disponering automatisk) | NOT_BUILT | Ingen (kun beregnet, ikke skrevet) | IKKE PÅVIST | `reservationFraFravaer()` er eksplicit kun en visning ifølge kildens kommentar ("hører i en Cloud Function") | Nej |
| Medarbejderkartotek — oprettelse | BUILT | Rigtig (`gem()` → `personale/<id>`) | IKKE PÅVIST | Ingen | Ja for oprettelse |
| Medarbejderkartotek — redigering/fratrædelse | NOT_BUILT | Ingen | IKKE PÅVIST | Knapper findes, permanent deaktiverede | Nej |
| Køre-hviletid-check (`tjekKoerehviletid()`) | BUILT som ren funktion, men ikke kaldt fra nogen Workforce-skærm | N/A i dette modul | IKKE PÅVIST | Hører hjemme i Disponerings-flowet (Cloud Function), ikke i Workforce | N/A i dette modul |
| Stempling/timeregistrering — kontor-/adminvisning | NOT_BUILT | Rigtig node findes, men ingen kontor-skærm læser den | IKKE PÅVIST | Kun chauffør-appens egen visning fundet | Nej for kontorsiden |

### 04 — Fleet

| Feature | Status | Persistence | Teststatus | Kendte blockers/kompromiser | Kan bruges end-to-end? |
|---|---|---|---|---|---|
| Enhedskartotek (opret/redigér) | BUILT | Rigtig (`gem()` → `koeretoejer`) | IKKE PÅVIST | Uafklaret forbehold: filens egen (muligvis forældede) kommentar hævder skrivning ikke er bygget, men koden viser en fungerende write-path; regelfilens faktiske svar blev ikke efterprøvet i dette dossier | Ja, med forbehold |
| Driftskalender — opret/flyt/statusskift (værkstedsopgaver) | BUILT | Rigtig (`opgaveplanlaeg`/`opgaveflyt`/`opgavestatus`) | IKKE PÅVIST | Ingen | Ja |
| Driftskalender — mail-/sagsfaner | MOCK/DEMO | Kun frontend (`demoSagerFor()`, altid) | IKKE PÅVIST | `sager`-noden findes ikke i produktion (fase 0) | Nej |
| Indberetninger — triage/afslut (kontor) | MOCK/DEMO for skrivning, BUILT for læsning | Ingen skrivevej fra denne skærm | IKKE PÅVIST | "Afslut"-knap deaktiveret, "Fase 0: skrives ikke fra klienten endnu" | Nej |
| Indberetning-oprettelse (fra chaufførapp) | BUILT (bekræftet i dossier 11) | Rigtig (`gem()` → `indberetninger`) | IKKE PÅVIST | Ingen skrivevej fundet i Fleet-modulets egne skærme — sker fra chaufførappen | Ja, men ikke fra Fleet-modulet selv |
| Arbejdskø (prioriteret arbejdsliste) | BUILT for læsning/navigation, ingen skrivning | Rigtig læsning | IKKE PÅVIST | "Planlæg"/"Flyt" deaktiverede på denne skærm (handlingen sker i Driftskalenderen) | Ja som arbejdsliste |
| Mail til værksted/leverandør | NOT_BUILT/PLANNED | Ingen | IKKE PÅVIST | Ingen SMTP/nodemailer/SendGrid-kald fundet nogen steder | Nej |
| Faktura for værkstedsbesøg | BUILT, men uden for Fleet | Rigtig (i Indkøb → Fakturaer) | IKKE PÅVIST | Bevidst modulgrænse — "Bygg ikke en fakturagodkendelse uden for Indkøb" | Ja (i Indkøb) |
| Materialeforbrug → grundlagslinje/lagertræk | PARTIAL | Ren funktion BUILT, ingen bekræftet UI-trigger fundet | IKKE PÅVIST | Ingen | Nej (ikke bekræftet fra UI) |

### 05 — Facility

| Feature | Status | Persistence | Teststatus | Kendte blockers/kompromiser | Kan bruges end-to-end? |
|---|---|---|---|---|---|
| Anlægskartotek (opret/redigér anlæg og lokation) | BUILT | Rigtig (`gem()` → `facility/aktiver`/`facility/lokationer`) | IKKE PÅVIST | Ingen | Ja |
| Fejlindberetning | BUILT | Rigtig (`gem()` → `facility/fejl`) | IKKE PÅVIST | Ingen | Ja |
| Vurdering (afledt lokationsstatus) | BUILT (ren beregning) | N/A — afledt, intet gemt felt | IKKE PÅVIST | Ingen | Ja |
| Servicekalender — planlægning/flytning/status | BUILT | Rigtig (`facilityplanlaeg`/`opgaveflyt`/`opgavestatus`) | IKKE PÅVIST | Ingen | Ja |
| Leverandørkommunikation (mail til ekstern leverandør) | NOT_BUILT | Ingen | IKKE PÅVIST | "INGEN MAIL. Samme som Planlaegdialog: beslutning 20 er fase 0" | Nej |
| Klimaovervågning (læsning) | BUILT | Rigtig | IKKE PÅVIST | Ingen | Ja |
| Klima — skrivning af sensormålinger/zonegrænser | NOT_BUILT | Ingen skærm skriver | IKKE PÅVIST | Regler tillader det (`facility.skriv`), men ingen UI fundet | Nej |
| Energistatistik (bygningsomkostninger) | PARTIAL | Rigtig læsning, ingen skrivevej fundet | IKKE PÅVIST | Ingen "indtast forbrug"-formular fundet nogen steder i modulet | Nej |
| Servicebesøg — statusskifte | BUILT | Rigtig (`opgavestatus`) | IKKE PÅVIST | Ingen | Ja |
| Faktura (visning, delt med Fakturacenter) | BUILT for visning | Rigtig | IKKE PÅVIST | Godkendelse sker udelukkende i Fakturacenter/Økonomi | Ja (delt flow) |

### 06 — Procure / Indkøb

| Feature | Status | Persistence | Teststatus | Kendte blockers/kompromiser | Kan bruges end-to-end? |
|---|---|---|---|---|---|
| Indkøbsbehov (indmeld) | BUILT | Rigtig (`behovskriv`) | IKKE PÅVIST | Billede-/lydvedhæftning ikke bygget (ingen fillagring) | Ja |
| Leverandørforslag | BUILT (ren funktion) | N/A — regnet on-the-fly | IKKE PÅVIST | Kun egen indkøbshistorik, ingen ekstern prisdatabase | Ja |
| Bestilling/PO (oprettelse) | BUILT | Rigtig (`ordreskriv`) | IKKE PÅVIST | Ingen | Ja |
| Godkendelse (ordre) | BUILT | Rigtig (`ordrestatus`, `godkendelsesregelskriv`) | IKKE PÅVIST | Selvgodkendelse tilladt, men markeret (bevidst) | Ja |
| Mail til leverandør | MOCK/PARTIAL | Kun frontend (tekstudkast genereret client-side, kopieres manuelt) | IKKE PÅVIST | Ingen SMTP/afsenderadresse/sendespor; "Markér som sendt" er kun et statusfelt | Nej — afsendelse er manuel, uden for systemet |
| Varemodtagelse | BUILT (som statusskifte) | Rigtig (`ordrestatus` → `modtaget`) | IKKE PÅVIST | Ingen linje-for-linje modtagekontrol observeret | Ja (grov) |
| Faktura — modtagelse/upload | PARTIAL | Ingen upload-UI | IKKE PÅVIST | "Upload er ikke bygget endnu"; hvordan fakturaer ellers kommer ind i noden er IKKE PÅVIST | Nej for upload-vejen |
| Faktura — match | BUILT (felt-til-felt, ikke OCR) | Rigtig (`fakturamatch`) | IKKE PÅVIST | Ingen OCR/dokumentgenkendelse nogen steder | Ja |
| Faktura — godkendelse | BUILT | Rigtig (`fakturastatus`) | IKKE PÅVIST | Ingen | Ja |
| Regnskabsgrundlag/bogføring + tre-vejs afstemning | PARTIAL/MOCK | "Bogfør" sætter kun intern status; afstemningskortet bruger permanent demodata (`demoAfstemning()`, ubetinget) | IKKE PÅVIST | Ingen regnskabsintegration; "Der sendes ikke noget til et regnskabssystem" | Nej |
| Kontant køb/udlæg | BUILT | Rigtig (`kontantkoebskriv`) | IKKE PÅVIST | Kvittering kan ikke vedhæftes (ingen fillagring) | Ja |
| Leverandørkartotek/performance (visning) | BUILT for læsning | Rigtig | IKKE PÅVIST | Ingen skrivning (bevidst, "FASE 0: VISNING"); leverandøroprettelse IKKE PÅVIST i de læste filer | Ja for opslag |
| Varelager (`forbrugsvarer`, Procures eget reservedelslager) | BUILT | Rigtig (`forbrugsvareskriv`, `forbrugsvarebevaegelse`) | IKKE PÅVIST | Ingen | Ja |

### 07 — Unitbooking

| Feature | Status | Persistence | Teststatus | Kendte blockers/kompromiser | Kan bruges end-to-end? |
|---|---|---|---|---|---|
| Reservation (opret udlån) | BUILT | Rigtig (`kasseudlaanskriv`, transaktionsbaseret konflikttjek) | IKKE PÅVIST | Ingen | Ja |
| Klargøring | BUILT | Rigtig, samme funktion | IKKE PÅVIST | Ingen genvej fra `booket` direkte til `udlaant` (bevidst mellemtrin) | Ja |
| Udlevering | BUILT | Rigtig, server sætter `udleveretMs` | IKKE PÅVIST | Ingen | Ja |
| Forventet retur (visning) | BUILT (beregnet) | N/A — afledt af `til`-felt | IKKE PÅVIST | Ingen | Ja |
| Retur | BUILT | Rigtig, server sætter `returneretMs` | IKKE PÅVIST | Ingen vej tilbage fra `returneret` (bevidst — nyt udlån kræves for genudlån) | Ja |
| Frigivelse/ny reservation | BUILT (implicit) | Rigtig | IKKE PÅVIST | Kassen kan ikke "byttes" på et eksisterende udlån | Ja |
| Reolplads-administration (delt node med Warehouse) | BUILT | Rigtig (`gem()` med `flet:true`) | IKKE PÅVIST | Ingen slet-funktion (pladser omdøbes, slettes aldrig) | Ja |
| Kassetype-administration | BUILT for oprettelse | Rigtig (`gem()`) | IKKE PÅVIST | Redigering af eksisterende type er IKKE PÅVIST i UI | Ja for oprettelse |
| Kasseliste (kasse-CRUD) | BUILT | Rigtig (`gem()`) | IKKE PÅVIST | Ingen slet-knap (kassen slettes aldrig) | Ja |
| Historik (pr. kasse / pr. sagsnummer) | BUILT (ren visning) | Rigtig | IKKE PÅVIST | Bevidst read-only ("kan den rettes fra en skærm, dokumenterer den ingenting") | Ja |

### 08 — Warehouse

| Feature | Status | Persistence | Teststatus | Kendte blockers/kompromiser | Kan bruges end-to-end? |
|---|---|---|---|---|---|
| Varekartotek | BUILT | Rigtig (`gem()` → `varer`) | IKKE PÅVIST | `sporing` er låst efter oprettelse | Ja |
| Modtagelse (transit & placering) | BUILT | Rigtig (`bevaegelseskriv`, art `putaway`) | IKKE PÅVIST | Intet separat "modtag"-trin før placering (bevidst); "Kundens faste område" (kundezone-reservation) er PLANNED; fysisk lagerkort er ikke bygget | Ja, for det den faktisk gør |
| Beholdere (Carriers, visning) | BUILT (ren visning) | Rigtig | IKKE PÅVIST | Ingen skrivehandling på denne skærm (bevidst — dækkes af andre skærme) | Ja som opslag |
| Bevægelser (generisk registrering) | BUILT | Rigtig (`bevaegelseskriv`) | IKKE PÅVIST | Append-only; en bevægelse kan ikke rettes bagefter | Ja |
| Optælling/cycle count | BUILT | Rigtig (`optaellingskriv`) | IKKE PÅVIST | `.write: false` for enhver klient; append-only | Ja |
| Pluk & afsend | BUILT | Rigtig (`bevaegelseskriv`/`plukordreafsend`) | IKKE PÅVIST | `afsendt` kan ikke sættes direkte af klienten | Ja |
| Transportlabels (QR + Code 128) | BUILT | Rigtig for de redigerbare mærkatfelter (`carriers`); selve labelen er bevidst ikke gemt | IKKE PÅVIST | Kræver Booking-modulet for transporttype; kundens ref.nr./adresse ikke redigerbar herfra (bevidst — hører på andre `.write:false`-noder) | Ja |
| Lokationer (reolpladser, delt node med Unitbooking) | BUILT | Rigtig (`gem()` med `flet:true`) | IKKE PÅVIST | Ingen | Ja |
| Sporbarhed (parti-/enhedsopslag) | BUILT (ren visning) | Rigtig | IKKE PÅVIST | Ingen | Ja |
| Afregning (fakturagrundlag som kladde) | BUILT | Rigtig (`opretGrundlag()`, låst server-node) | IKKE PÅVIST | Godkendelse ligger uden for Warehouse (Indkøb/Økonomi, beslutning 12) — bevidst modulgrænse | Ja for kladden, faktura sker andetsteds |
| Volumen (salgsestimat) | BUILT som beregner; PLANNED for tilbudsoprettelse | N/A — ren beregning, ingen `gem()`-kald | IKKE PÅVIST | Intet tilbudsdokument oprettes (nodeform for `tilbud` ikke besluttet — bevidst udskudt) | Ja som beregner, nej for et gemt tilbud |

### 09 — Kunder & Priser / Opsætning

| Feature | Status | Persistence | Teststatus | Kendte blockers/kompromiser | Kan bruges end-to-end? |
|---|---|---|---|---|---|
| Kundekartotek (oversigt/rapportering) | BUILT for læsning | Rigtig | IKKE PÅVIST | Ingen redigering af kundestamdata fundet i det læste filsæt overhovedet | Ja som rapportering |
| Kunde-"Tilbud der kræver opfølgning" | MOCK/DEMO | Kun frontend (`DEMO_TILBUD`, læst ubetinget) | IKKE PÅVIST | Ingen `tilbud`-node findes; "Åbn"-knap deaktiveret | Nej |
| Standardpriser (ydelseskatalog) | BUILT | Rigtig (`gem()`, aldrig overskrivning — kun ny post) | IKKE PÅVIST | Ingen | Ja |
| Kundepriser (pr.-kunde afvigelse) | BUILT | Rigtig (`gem()`, to-permission-gate) | IKKE PÅVIST | Ingen sletteknap (bevidst) | Ja |
| Opsætning — Generelt | PARTIAL (bevidst læseskærm) | Ingen skrivning | IKKE PÅVIST | "Redigér virksomhedsoplysninger" deaktiveret, "ikke besluttet endnu" | Ja som visning |
| Brugere & roller (opret/skift rolle/spær/rolleredigering) | BUILT | Rigtig (5 Cloud Functions med ægte Admin SDK-kald) | IKKE PÅVIST | Ingen e-mail-invitationsflow — adgangskode vises kun én gang og gives manuelt videre | Ja |
| Integrationer (kort/brændstofkort/regnskab/løn) | MOCK/DEMO (bevidst tomt) | Ingen node findes overhovedet | IKKE PÅVIST | Hardkodet tomt array, bevidst ærligt "intet bygget endnu"-design, ikke en skjult attrap | N/A — intet at bruge |

### 10 — Support / Ejerkonsol

| Feature | Status | Persistence | Teststatus | Kendte blockers/kompromiser | Kan bruges end-to-end? |
|---|---|---|---|---|---|
| Support — AI/selvbetjeningshjælp | NOT_BUILT | Ingen | IKKE PÅVIST | Eksplicit fravalgt ("INGEN AI-DIAGNOSE") | Nej |
| Support — supportsag-oprettelse | MOCK/DEMO | Ingen node/permission findes i produktkoden | IKKE PÅVIST | "Opret supportsag" deaktiveret; `support.*`-permissions findes ikke i `permissions.js`/`ROLLE_PERMS` for nogen rolle | Nej |
| Support — Supportoverblik (intern kryds-tenant liste) | MOCK/DEMO | Ingen | IKKE PÅVIST | `support.laes` opnåelig for ingen rigtig bruger, heller ikke admin | Nej |
| Support — auditudtræk til fejlsøgning | BUILT (ren beregningsfunktion), MOCK som data | Kun demo | IKKE PÅVIST | Ingen Cloud Function for udtrækket mod `audit/` | Nej |
| Support — supportadgang/impersonation | PLANNED | Ingen | IKKE PÅVIST | Model designet (`byggBevilling()` bygger kun en forhåndsvisning); ingen node/regel/funktion | Nej |
| Sagsbaseret mail-tråd (Fleet/Facility) — backend | PARTIAL — BUILT på server, MOCK/DEMO på skærm | Rigtig backend (4 Cloud Functions), frontend-knapper deaktiverede | IKKE PÅVIST | `Sagsvisning.jsx` er stadig mærket "fase 0" på trods af at backend er fuldt bygget | Nej — frontend har ikke fulgt med backend |
| Ejerkonsol — kunde-/abonnementsstyring | BUILT | Rigtig (4 Cloud Functions med server-side ejertjek) | IKKE PÅVIST | Ingen kendte huller i selve flowet | Ja |
| Ejerkonsol — prisliste-administration | BUILT | Rigtig (5 Cloud Functions) | IKKE PÅVIST | Kun ny liste, aldrig rettelse; sletning af brugt liste afvises server-side | Ja |
| Ejerkonsol — legal hold (ikke-destruktiv del) | BUILT | Rigtig (`retentionLegalHold`) | IKKE PÅVIST | Undtager kun ét objekt fra en fremtidig sletning der endnu ikke findes | Ja |
| Ejerkonsol — retention dry-run (rapportering) | BUILT, kun for kategorier markeret `bygget: true` | Rigtig (`retentionDryRun`) | IKKE PÅVIST | Selve sletning/anonymisering findes bevidst ikke (beslutning 115) | Ja for rapportering, nej for sletning |

### 11 — Chaufførapp / Login

| Feature | Status | Persistence | Teststatus | Kendte blockers/kompromiser | Kan bruges end-to-end? |
|---|---|---|---|---|---|
| Forside (genvejskort) | BUILT | N/A — ren navigation | IKKE PÅVIST | Ingen | Ja |
| Turplan (visning + statusmelding pr. stop) | BUILT | Rigtig (Cloud Function `statusmelding`, klientside offline-kø) | IKKE PÅVIST | Kræver `personId`-kobling i `brugere/{uid}` — mangler den, stopper skærmen med forklarende tomtilstand; ingen GPS/sporing (bevidst) | Ja, når koblingen findes |
| Indberetning fra bilen | BUILT | Rigtig (`gem()` direkte til `indberetninger`) | IKKE PÅVIST | Ingen offline-kø for denne skrivning — IKKE PÅVIST om data tabes ved reel netværksfejl | Ja |
| Timeregistrering (stemple ind/ud) | BUILT | Rigtig (`gem()` direkte til `stemplinger/{personId}/{id}`) | IKKE PÅVIST | Ingen offline-kø; lukket vagt er frosset for videre skrivning | Ja |
| Frihed (fraværsansøgning) | BUILT for selve ansøgningen | Rigtig (`gem()` via snæver selvbetjenings-gren i reglerne) | IKKE PÅVIST | Mail-notifikation er PLANNED (fase 0); svar/godkendelse sker udelukkende fra kontorsiden, som selv er NOT_BUILT der (se modul 03) | Ja for ansøgning, nej for svar |
| Login | BUILT | Rigtig (Firebase Auth) | IKKE PÅVIST | "Uprovisioneret"-tilstand er generisk for alle roller, ikke chauffør-specifik | Ja |
| Adgangsbegrænsning: chauffør ser kun `/app/*` | BUILT | Rigtig, håndhævet både i rammevalg og i `firebase.rules.json` | IKKE PÅVIST | Ingen | Ja |

---

## Integrationer der faktisk virker

Bekræftet server-side (Cloud Function eller ægte Admin SDK-kald fundet i
`functions/index.js`, ikke kun et klient-kald der antages at ramme noget):

- **Fakturacenter (Økonomi):** `fakturadestination`, `fakturastatus` — destinationssætning og statusskift (dossier 01).
- **Fakturering (Økonomi):** `grundlagskriv` — godkend/lås, transaktionsbaseret nummerserie, delt regelkode med klienten (dossier 01).
- **Booking/Planning:** `bookingopret`, `forslagskriv`, `etapeskift` — atomisk oprettelse, forslagsflow, fire-øjne-godkendelse (dossier 02).
- **Fleet:** `opgaveplanlaeg`, `opgaveflyt`, `opgavestatus` — opret/flyt/statusskift af driftsopgaver, atomisk med reservationen (dossier 04).
- **Facility:** `facilityplanlaeg`, `opgaveflyt`, `opgavestatus` — servicebesøg, inkl. "hallen og porten er ét rum"-indeslutningstjek (dossier 05).
- **Procure/Indkøb:** `behovskriv`, `ordreskriv`, `ordrestatus`, `godkendelsesregelskriv`, `fakturamatch`, `fakturastatus`, `kontantkoebskriv`, `forbrugsvareskriv`, `forbrugsvarebevaegelse` (dossier 06).
- **Unitbooking:** `kasseudlaanskriv` — transaktionsbaseret, med konflikttjek inde i transaktionen (dossier 07).
- **Warehouse:** `bevaegelseskriv`, `plukordreafsend`, `optaellingskriv` — al lagerbevægelse, pluk/afsend og cycle count (dossier 08).
- **Kunder & Priser:** direkte `gem()`-skrivninger til `satser/standard` og `kunder/<id>/priser`, versioneret (aldrig overskrevet), audit-logget som `objekt: "satser"` (dossier 09).
- **Brugere & roller:** `opretbruger`, `skiftrolle`, `rolleskriv`, `dashboardvisningskriv`, `spaerlogin` — bekræftede ægte Admin SDK-kald (`auth.createUser`, `auth.setCustomUserClaims`, `auth.revokeRefreshTokens`) (dossier 09).
- **Ejerkonsol/Udbyder:** `kundeopret`, `kundemoduler`, `kundestatus`, `kundeadmin`, `prislisteopret`, `kundeabonnement`, `grundlagopret`, `maalnu`, `prislisteslet`, `retentionLegalHold`, `retentionDryRun` — alle med server-side ejertjek (`kraevUdbyder`) (dossier 10).
- **Sagsbaseret mail-tråd (Fleet/Facility), backend-laget:** `sagOpret`, `sagBeskedSkriv`, `sagKarantaeneFrigiv`, `sagAftaleBekraeft` — fuldt implementeret med rigtige permissionstjek, men frontend (`Sagsvisning.jsx`) er stadig ikke koblet på (se "Kendte blockers") (dossier 10).
- **Chaufførapp:** `statusmelding` — server slår `personId` op, tjekker ejerskab/permission, afviser ukendte felter (dossier 11).

---

## Integrationer der kun er UI

Knapper/faner/formularer der findes visuelt, men ikke har en fungerende
backend bag sig (som regel eksplicit forklaret med en deaktiveret knaps
`title`, ikke skjult):

- **Fakturacenter — "Modtag bilag":** viser bevidst ingen upload-UI; teksten siger direkte "Ingen af indgangene er bygget endnu" (dossier 01).
- **Bookingopsætning — "Tilføj sats"/"Redigér sats"/"Gem ændringer":** sætter kun lokal state, intet `gem()`-/Cloud Function-kald findes (dossier 02).
- **Bemandingsplan — "Tildel" (åbne vagter):** permanent deaktiveret, ingen vagtnode findes overhovedet (dossier 03).
- **Kompetencer — "Overrul med begrundelse":** deaktiveret, ingen Cloud Function fundet (dossier 03).
- **Ferie & fravær (kontor) — "Registrér fravær":** deaktiveret på selve kontor-skærmen (skrivning findes reelt, men kun fra chaufførappens ansøgningsflow) (dossier 03).
- **Medarbejdere — "Redigér"/"Registrér fratrædelse":** begge permanent deaktiverede (dossier 03).
- **Fleet Indberetninger — "Afslut":** deaktiveret, "Fase 0: skrives ikke fra klienten endnu" (dossier 04).
- **Fleet Driftskalender — "Kommunikation"/mail-fane:** viser kun hardkodet demo-tråd (dossier 04).
- **Facility Servicedialog — leverandørvalg:** leverandøren vælges i en ægte kartotek-dropdown, men ingen mail sendes ("INGEN MAIL", beslutning 20 fase 0) (dossier 05).
- **Facility Klima — sensormålinger/zonegrænser:** reglerne tillader skrivning, men ingen formular findes nogen steder til at oprette/redigere dem (dossier 05).
- **Facility Klima — bygningsomkostninger:** reglerne tillader skrivning, men ingen "indtast forbrug"-formular findes (dossier 05).
- **Procure Bestillinger — "Kopiér udkast" / "Markér som sendt":** mailudkast kan kun kopieres manuelt; "sendt" er kun et statusfelt, ingen reel afsendelse (dossier 06).
- **Procure Fakturaer — "Bogfør"-knap:** sætter kun intern status, "Der sendes ikke noget til et regnskabssystem" (dossier 06).
- **Procure Fakturaer — Afstemningskort (tre-vejs):** kalder `demoAfstemning()` ubetinget for alle kunder — permanent opdigtede tal, ikke en fallback (dossier 06).
- **Kunder.jsx — "Tilbud der kræver opfølgning" / "Åbn":** viser fast `DEMO_TILBUD`; knappen er deaktiveret fordi der ingen `tilbud`-node findes (dossier 09).
- **Opsætning Generelt — "Redigér virksomhedsoplysninger":** deaktiveret, "Ikke besluttet endnu" (dossier 09).
- **Opsætning Integrationer:** hardkodet, tomt array — ingen forbind-knap, ingen API-nøglefelt, ingen logoer; et bevidst ærligt tomt UI, ikke en attrap (dossier 09).
- **Support Hjælp & Support — "Opret supportsag":** deaktiveret, "ikke bygget endnu (fase 0)" (dossier 10).
- **Support Supportoverblik/Supportsag — "Send svar"/"Giv midlertidig adgang":** begge deaktiverede; hele skærmsættet viser kun `demo-support.js` (dossier 10).
- **Sagsvisning.jsx (Fleet/Facility) — "Send besked"/"Frigiv karantæne":** deaktiverede på trods af at backend-funktionerne (`sagBeskedSkriv`, `sagKarantaeneFrigiv`) rent faktisk findes og virker (dossier 10).

---

## Kendte blockers

Konsolideret fra dossiernes egne "kendte blokerer/kompromiser"-formuleringer,
grupperet pr. modul:

**01 — Dashboard & Økonomi**
- Stort set alle `kpi.oekonomi`-nøgletal (driftsomkostninger, budget, dækningsgrad, planlagt/akut vedligehold, "afvigelser") er hardkodet `null` i aggregeringen — mangler defineret periode og indtastede budgetter/mål (dossier 01, `kpi-aggregering.js`).
- Fakturacenter har ingen fungerende indgangskanal — kræver fillagring som ikke findes i platformen (dossier 01).
- Fakturering mangler en UI-vej til at oprette et forløbsbaseret (booking-tur) grundlag, selvom server-siden understøtter det (dossier 01).

**02 — Planning/Booking**
- Bookingopsætningens satsvedligehold ser redigerbar ud, men gemmer intet (dossier 02, `Bookingopsaetning.jsx`).
- Ruteoptimering og geografisk validering er bundet til en fremtidig HERE-integration, der ikke findes (dossier 02, `ARKITEKTUR.md`-reference).
- Ingen koordinator-notifikation (mail/push) ved godkend/afvis/returnér — kun in-app synlighed (dossier 02).

**03 — Workforce/Bemanding**
- Bemandingsplanen (ugeplan/kapacitet/åbne vagter) er permanent demo-data — "der findes ingen vagtnode i ARKITEKTUR endnu" (dossier 03).
- Fraværsgodkendelse (kontorets svar) og den efterfølgende blokerende reservation er ikke bygget nogen steder i de læste filer (dossier 03).
- Medarbejderredigering/-fratrædelse findes ikke fra UI (dossier 03).

**04 — Fleet**
- Ingen mail-afsendelse til værksted/leverandør findes i `functions/index.js` (dossier 04).
- Indberetningstriage kan ses, men ikke afsluttes fra kontor-skærmen (dossier 04).
- Uafklaret uoverensstemmelse mellem en (muligvis forældet) kodekommentar i `Oversigt.jsx`, der hævder enhedsskrivning ikke er bygget, og den faktiske, fungerende write-path — regelfilens svar blev ikke efterprøvet i dette dossier (dossier 04).

**05 — Facility**
- Leverandørkommunikation stopper ved valget af leverandør — "INGEN MAIL" (beslutning 20, fase 0) (dossier 05).
- Ingen UI-vej til at skrive bygningsomkostninger eller sensormålinger/zonegrænser, selvom reglerne tillader det (dossier 05).

**06 — Procure/Indkøb**
- Mail til leverandør er en manuel handling uden for systemet — kun et kopierbart udkast (dossier 06).
- Ingen upload-funktion for indgående fakturaer — uklart hvordan `fakturaer/`-noden i praksis populeres (dossier 06).
- Regnskabsgrundlag/bogføring har ingen reel regnskabsintegration; tre-vejs afstemningskortet viser permanent opdigtede tal (dossier 06).

**07 — Unitbooking**
- Ingen redigering af eksisterende kassetyper fundet i UI (kun oprettelse) (dossier 07).

**08 — Warehouse**
- Kundezone-reservation ("Kundens faste område") og et fysisk lagerkort er bevidst ikke bygget (PLANNED) (dossier 08).
- Volumen-beregneren opretter bevidst intet tilbudsdokument — nodeform for `tilbud` er ikke besluttet (dossier 08).

**09 — Kunder & Priser/Opsætning**
- Ingen redigering af kundestamdata fundet nogen steder i det læste filsæt (dossier 09).
- Ingen e-mail-invitation ved brugeroprettelse — adgangskoden vises kun én gang og skal gives videre manuelt (dossier 09).
- Integrationer-skærmen er bevidst tom — ingen integrationer er bygget (dossier 09).

**10 — Support/Ejerkonsol**
- Hele Support-modulet (sagoprettelse, intern behandling, auditudtræk, supportadgang) er fase 0/demo — de fire `support.*`-permissions findes ikke i `permissions.js`, så ingen rigtig bruger, heller ikke admin, kan nogensinde bruge det (dossier 10).
- Sagsbaseret mail (Fleet/Facility) har bygget backend, men frontenden (`Sagsvisning.jsx`) er stadig markeret "fase 0" og har alle relevante knapper deaktiveret — et lag-gab mellem backend og frontend (dossier 10).
- Retention-sletning/anonymisering er bevidst ikke bygget — kun undtagelses-/rapporteringsdelen (legal hold, dry-run) (dossier 10, beslutning 115).

**11 — Chaufførapp/Login**
- Turplan/Timeregistrering/Frihed stopper alle med samme forklarende tomtilstand, hvis `brugere/{uid}/personId`-koblingen mangler — en forudsætning appen ikke selv kan opfylde (dossier 11).
- Ingen offline-kø for Indberetning (kun statusmeldinger har `meldingskoe.js`) — uklart om data tabes ved en reel netværksfejl (dossier 11, IKKE PÅVIST).
- Ingen mail-notifikation ved svar på en fraværsansøgning — erstattet af "svar her i appen" (fase 0 af beslutning 20) (dossier 11).

---

## Features der ikke kan bruges end-to-end endnu

- **Fakturering — forløbsbaseret grundlag (Økonomi):** server-side understøttet, men ingen UI-knap findes for at oprette ét fra en booking-tur.
- **Fakturacenter — indgående fakturaer (Økonomi):** ingen indgangskanal (mail/upload/mobil/sag) findes, så kun manuelt "registrerede" fakturaer kan behandles.
- **Bookingopsætning — satsvedligehold (Planning):** "Gem ændringer" skriver intet, så satser kan reelt ikke ændres fra denne skærm.
- **Koordinator-notifikation (Planning):** ingen mail/push findes, så en koordinator opdager kun en godkendelsesanmodning ved selv at navigere til skærmen.
- **Bemandingsplan (Workforce):** ren demo-data uden vagtnode — kan ikke bruges til reel vagtplanlægning.
- **Fraværsgodkendelse (Workforce):** kontorets svar/godkendelse er ikke bygget, så en ansøgning kan aldrig blive "godkendt" i systemet.
- **Fravær → automatisk disponeringsblokering (Workforce):** reservationen beregnes, men skrives ikke, så et godkendt fravær blokerer ikke automatisk disponering.
- **Fleet Indberetninger — triage (Fleet):** kan ses, men "Afslut" er deaktiveret, så en indberetning kan aldrig lukkes fra kontorsiden.
- **Facility — leverandørkommunikation (Facility):** stopper ved valg af leverandør; ingen bekræftelse sendes tilbage.
- **Facility — bygningsomkostninger (Facility):** kan læses, men ingen UI-vej til at indtaste dem findes.
- **Procure — mail til leverandør (Procure):** kræver et menneske til at sende mailen manuelt uden for systemet.
- **Procure — faktura-upload (Procure):** ingen vej ind for en ny indgående faktura fra denne skærm.
- **Procure — regnskabsbogføring (Procure):** "Bogfør" er kun et internt statusfelt uden regnskabsintegration.
- **Warehouse — Volumen/tilbud (Warehouse):** beregner et tal, men opretter bevidst intet gemt tilbudsdokument.
- **Kunder — kundestamdata-redigering (Kunder):** ingen redigeringsformular fundet noget sted i det læste filsæt.
- **Opsætning — Generelt (Opsætning):** bevidst read-only; ingen skrivning af virksomhedsoplysninger.
- **Support — hele modulet (Support):** ingen rigtig bruger kan oprette, se eller behandle en supportsag, fordi de nødvendige permissions ikke findes i `permissions.js`.
- **Sagsbaseret mail-tråd (Fleet/Facility, delt komponent):** backend er bygget, men frontend-knapperne til at sende/frigive er stadig deaktiverede.
- **Chaufførapp — Indberetning uden `personId`-kobling (Chaufførapp):** turplan, timeregistrering og frihed stopper alle uden koblingen — kræver manuel opsætning af administrator.
