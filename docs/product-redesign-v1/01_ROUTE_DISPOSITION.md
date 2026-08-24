<title>Route Disposition — alle 62 skærme</title>

# 01 — Route-disposition (V1-oprydning)

**Status:** Planlægning. 0 ændringer i produktkode, Firebase-regler, Cloud
Functions eller data er foretaget for at producere dette dokument.

**Kilder:** `FleetControl_V1_product_blueprint.md` (autoritativ produkt-
beslutning, LÅST — #, Modul, Nuværende skærm, Route, Beslutning, Nyt hjem og
V1-handling er kopieret ordret derfra og ikke ændret), krydsrefereret mod
`docs/product-audit/02_SCREEN_INVENTORY.md` (§-henvisninger nedenfor) og
`docs/product-audit/06_IMPLEMENTATION_STATUS.md` (modul-afsnit ##, samme
numre som dossiererne), samt `00_AUTHORITATIVE_PRODUCT_RULES.md` for de to
verificerede konflikter (Fleet/Facility `sager` og `kompetencer`-gating).

Hvor kilderne selv skriver "IKKE PÅVIST", er det bevaret som sådan. Change-
type-tags er tildelt efter de syv definitioner i opgavebeskrivelsen; en række
har kun de tags den reelt kræver.

---

## 1 — Dashboard — `/`
**Modul:** Dashboard & fælles · **Beslutning:** FINISH · **Nyt hjem:** Dashboard
**V1-handling:** Behold som eneste indgang. Vis modulvælger kun ved 2+ aktive moduler. Maksimér handlingskøen, fjern permanente demo-widgets og gør sekundære widgets sammenklappelige.
**Nuværende status:** PARTIAL. Brugerlayout (læs/skriv) BUILT; de fleste `kpi.oekonomi`-felter er hardkodet `null`; "Åbne opgaver der kræver opfølgning"-tabellen er permanent MOCK (`DEMO_DASHBOARD_OPGAVER`, ikke fallback). Kilde: 02_SCREEN_INVENTORY §1.1, 06_IMPLEMENTATION_STATUS ##01.
**Change-type:** VIEW_COMPOSITION, HIDE_ONLY
**Begrundelse:** VIEW_COMPOSITION fordi modulvælgerlogik og sammenklappelige sekundære widgets er en omstrukturering af eksisterende dashboard-data, ikke ny data; HIDE_ONLY fordi den permanente demo-opgavetabel skal fjernes helt, ikke erstattes af en ny funktion.
**Note (Korrektion 6):** `DASHBOARDS`-kataloget (`src/fleet/dashboards.js`), som denne skærms modulvælger tegner kort fra, mangler i dag et Planning/booking-kort. Målplanen tilføjer `{ key: "booking", label: "Planning" }` med kun ægte data (bookinger uden plan, "Kræver handling"-lister og det allerede beregnede `kpi.disponering`-domæne) — ingen ny række blandt de 62, kun et nyt kort på denne skærm.

## 2 — Økonomi & Rapporter — `/oekonomi`
**Modul:** Dashboard & fælles · **Beslutning:** LATER · **Nyt hjem:** Økonomi > Rapporter
**V1-handling:** Skjul fra V1-navigationen indtil KPI-kilder, perioder, budgetter og rapportdata er ægte. Bevar koden som senere rapporthub.
**Nuværende status:** PARTIAL/MOCK-hybrid. Kategori-nedbrydning og "Opgaver klar til fakturering" er permanent demo-data (`demo-oekonomi.js`); totalrækken bruger delvist null KPI-felter. Kilde: 02_SCREEN_INVENTORY §1.2, 06_IMPLEMENTATION_STATUS ##01.
**Change-type:** HIDE_ONLY
**Begrundelse:** Ren fjernelse fra navigationen uden anden strukturel ændring — koden og routen forbliver urørt, blot ikke tilgængelig fra menuen.

## 3 — Fakturacenter — `/oekonomi/fakturacenter`
**Modul:** Dashboard & fælles · **Beslutning:** FINISH · **Nyt hjem:** Fakturaer & bilag
**V1-handling:** Gør til fælles platformfunktion, uafhængig af Procure-abonnement. Byg drag-and-drop/fillagring først; invoice-mail og OCR kan følge som kanaler.
**Nuværende status:** BUILT for match/godkendelse/bogføring (Cloud Functions `fakturamatch`/`fakturadestination` og `fakturastatus`, i dag internt gated på `indkoeb.skriv`/`indkoeb.godkend`). Indgangskanaler (mail/upload/mobil/sag) NOT_BUILT — "Ingen af indgangene er bygget endnu". Verificeret i 00_AUTHORITATIVE_PRODUCT_RULES (Korrektion 2): `fakturaer`-noden har i dag INGEN permission overhovedet på `.read` (kun auth+tenant+aktivt abonnement, `firebase.rules.json` linje ~2916-2925). Kilde: 02_SCREEN_INVENTORY §1.3, 06_IMPLEMENTATION_STATUS ##01.
**Change-type:** PERMISSION_MODEL, BACKEND_REQUIRED
**Begrundelse:** PERMISSION_MODEL fordi Fakturacenter i dag reelt er ugated på læsning mens skrivning sker under Procure-navnet `indkoeb.*`, men skal blive en fælles platformfunktion uafhængig af Procure-abonnement (produktgrundlov 4) — Korrektion 2 indfører i stedet den nye, minimale familie `fakturaer.laes`/`fakturaer.skriv`/`fakturaer.godkend` (samme rollefordeling som i dag under de gamle `indkoeb.*`-navne, så ingen mister eller får adgang dag 1); BACKEND_REQUIRED fordi drag-and-drop/fillagring er en helt ny server-side kapacitet der ikke findes i platformen i dag.

## 4 — Fakturering — `/oekonomi/fakturering`
**Modul:** Dashboard & fælles · **Beslutning:** FINISH · **Nyt hjem:** Økonomi > Fakturagrundlag
**V1-handling:** Behold godkend/lås/eksport. Tilføj kanonisk oprettelse fra afsluttet booking/tur og brug navnet Fakturagrundlag konsekvent.
**Nuværende status:** BUILT for godkend/lås/eksport (Cloud Function `grundlagskriv`). PARTIAL for forløbsbaseret oprettelse: serveren understøtter `opretGrundlag()`/handlingen "opret", men ingen UI-knap findes for en booking-tur — kun Warehouse Afregning kalder funktionen i dag. Kilde: 02_SCREEN_INVENTORY §1.4, 06_IMPLEMENTATION_STATUS ##01.
**Change-type:** VIEW_COMPOSITION, NAVIGATION_ONLY
**Begrundelse:** VIEW_COMPOSITION fordi den manglende "opret fra booking-tur"-knap kun kræver at koble en ny UI-handling til en allerede eksisterende, virkende server-funktion; NAVIGATION_ONLY for den konsekvente omdøbning til "Fakturagrundlag".

## 5 — Planning-overblik — `/booking`
**Modul:** Planning · **Beslutning:** FINISH · **Nyt hjem:** Planning > Overblik
**V1-handling:** Gør siden transportorienteret. Fjern værksteds-/facility-opgaver fra arbejdslisten og vis kun bookinger, etaper, manglende plan og transportafvigelser.
**Nuværende status:** BUILT. Kilde: 02_SCREEN_INVENTORY §2.1.
**Change-type:** VIEW_COMPOSITION
**Begrundelse:** Arbejdet er at filtrere/omkomponere hvad der allerede vises på en færdigbygget skærm — ingen ny data eller backend, kun hvilket udsnit der tegnes.

## 6 — Ny forespørgsel — `/booking/ny`
**Modul:** Planning · **Beslutning:** FINISH · **Nyt hjem:** Planning > Ny forespørgsel
**V1-handling:** Behold, men færdiggør direkte/dedikeret/kombi, tidsvinduer, by før adresse og flere etaper via transit/lager. Avanceret automatisk optimering er ikke V1-krav.
**Nuværende status:** BUILT for kladdeoprettelse (Cloud Function `bookingopret`). Multi-etape UI PARTIAL/PLANNED — datamodellen understøtter flere strækninger/stop, men skærmen bygger i dag kun ét afhentnings-/leveringspar. Kilde: 02_SCREEN_INVENTORY §2.2, 06_IMPLEMENTATION_STATUS ##02.
**Change-type:** VIEW_COMPOSITION
**Begrundelse:** Datamodellen (etaper/stop) understøtter allerede det efterspurgte — arbejdet er at bygge UI der udnytter den eksisterende form, ikke at ændre den.

## 7 — Forslag & reservation — `/booking/forslag/:id`
**Modul:** Planning · **Beslutning:** MERGE · **Nyt hjem:** Disponering > højre panel/dialog
**V1-handling:** Funktionen bevares, men ikke som selvstændig arbejdsskærm/menu. Åbn forslag, tjek og godkendelse i kontekst fra Disponering; behold route som deep link.
**Nuværende status:** BUILT (Cloud Function `forslagskriv`, `etapeskift`). Kilde: 02_SCREEN_INVENTORY §2.3, 06_IMPLEMENTATION_STATUS ##02.
**Change-type:** VIEW_COMPOSITION
**Begrundelse:** Samme data, samme `tjekDisponering()`-håndhævelse og stort set samme komponenter (Disponering kalder allerede samme funktion) — kun sammensætningen ændres, fra egen route til panel; ruten forbliver som deep link, så ingen ROUTE_REDIRECT.

## 8 — Disponering — `/booking/disponering`
**Modul:** Planning · **Beslutning:** FINISH · **Nyt hjem:** Planning > Disponering
**V1-handling:** Fjern dagsgitteret for værkstedsopgaver. Fokusér på ruter, etaper, køretøj, chauffør og hænger. V1 kan være manuelt assisteret; fuld ruteoptimering ligger senere.
**Nuværende status:** BUILT for dagsgitteret (deler node/funktioner/komponenter med Fleets Driftskalender). Ugesgitteret BUILT som bevidst view-only. Kilde: 02_SCREEN_INVENTORY §2.4, 06_IMPLEMENTATION_STATUS ##02.
**Change-type:** VIEW_COMPOSITION, HIDE_ONLY
**Begrundelse:** HIDE_ONLY for selve fjernelsen af dagsgitteret fra denne skærm (det bevares uændret i Fleets Driftskalender); VIEW_COMPOSITION for at omfokusere resten af skærmen på ruter/etaper.

## 9 — Rute & status — `/booking/live-kort`
**Modul:** Planning · **Beslutning:** KEEP · **Nyt hjem:** Planning > Ture & status
**V1-handling:** Behold som ærlig statusvisning uden GPS. Overvej navnet Ture & status for at undgå live-kort-forventning.
**Nuværende status:** BUILT som ren visning, ingen GPS/sporing (bevidst). Kilde: 02_SCREEN_INVENTORY §2.5, 06_IMPLEMENTATION_STATUS ##02.
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** Kun en mulig omdøbning af menupunkt/titel — ingen route-, komponent- eller datamodelændring.

## 10 — Bookingopsætning — `/booking/opsaetning`
**Modul:** Planning · **Beslutning:** MOVE · **Nyt hjem:** Opsætning > Planning > Omkostninger & regler
**V1-handling:** Fjern fra daglig Planning-menu. Færdiggør persistering af satser før V1; skjul faner der ikke er bygget.
**Nuværende status:** PARTIAL. Læsning/beregning BUILT; "Tilføj sats"/"Redigér sats"/"Gem ændringer" sætter kun lokal state — intet `gem()`/Cloud Function-kald findes. Kilde: 02_SCREEN_INVENTORY §2.6, 06_IMPLEMENTATION_STATUS ##02 ("Integrationer der kun er UI").
**Change-type:** NAVIGATION_ONLY, BACKEND_REQUIRED
**Begrundelse:** NAVIGATION_ONLY for flytningen til Opsætning-menuen; BACKEND_REQUIRED fordi satsvedligehold i dag slet ikke gemmer noget — der findes ingen skrivevej at flytte, kun en attrap-knap.

## 11 — Bemandingsplan — `/bemanding`
**Modul:** Workforce · **Beslutning:** LATER · **Nyt hjem:** Workforce > Bemandingsplan (senere)
**V1-handling:** Skjul i V1. Skærmen er ikke en driftsfunktion uden en rigtig vagtnode. Genintroducér først med ægte plan, tildeling og kapacitetsberegning.
**Nuværende status:** MOCK/DEMO for selve bemandingsplanen — ingen vagtnode findes i datamodellen; KPI-kort og kompetenceliste er BUILT. Kilde: 02_SCREEN_INVENTORY §3.1, 06_IMPLEMENTATION_STATUS ##03.
**Change-type:** HIDE_ONLY
**Begrundelse:** V1-handlingen er udelukkende at skjule skærmen; en fremtidig vagtnode (DATA_MODEL) og tildelingslogik (BACKEND_REQUIRED) hører til en senere genintroduktion, ikke til denne oprydningsrunde.

## 12 — Kompetencer — `/bemanding/kompetencer`
**Modul:** Workforce · **Beslutning:** FINISH · **Nyt hjem:** Workforce > Kompetencer
**V1-handling:** Behold oversigt og varslinger. Tilføj en kanonisk vedligeholdelsesvej for kompetencer/beviser; avanceret override kan vente.
**Nuværende status:** BUILT for læsning; "Overrul med begrundelse" NOT_BUILT i UI (deaktiveret). Verificeret i 00_AUTHORITATIVE_PRODUCT_RULES: noden er korrekt modul-gatet til Bemanding i både `NODE_MODUL` og de deployede regler — der er intet sikkerhedshul (konflikt B). Yderligere verificeret (Korrektion 8): `.write` på `kompetencer/$kompetenceId` tillader ALLEREDE direkte klient-skrivning med kun `kompetencer.skriv`, og `byggOverride({personId, kompetence, begrundelse, bruger})` i `src/fleet/personale.js` er en FÆRDIG byggefunktion — den kaldes bare aldrig fra UI'et. Kilde: 02_SCREEN_INVENTORY §3.2, 06_IMPLEMENTATION_STATUS ##03.
**Change-type:** VIEW_COMPOSITION
**Begrundelse:** Ingen PERMISSION_MODEL-ændring kræves for adgang (allerede korrekt spærret, jf. verificeret konflikt B). Korrektion 8 retagger denne række **`BACKEND_REQUIRED` → `VIEW_COMPOSITION`**: både skrivevejen (`.write`-reglen) og byggefunktionen (`byggOverride()`) findes allerede færdige — det manglende er udelukkende UI der kalder dem. (Kun admin har `kompetencer.skriv` i dag; en bredere rollefordeling er en separat, fremtidig `PERMISSION_MODEL`-tilføjelse, ikke en forudsætning for denne rækkes V1-arbejde.)

## 13 — Ferie & fravær — `/bemanding/fravaer`
**Modul:** Workforce · **Beslutning:** FINISH · **Nyt hjem:** Workforce > Fravær
**V1-handling:** Byg kontorets godkend/afvis-svar og den automatiske reservation, der blokerer disponering. Bevar følsom årsag separat.
**Nuværende status:** PARTIAL. Læsning BUILT. Fraværsansøgning BUILT — men kun via chaufførappen. Fraværsgodkendelse (kontorets svar) NOT_BUILT; fravær → reservation (den blokerende skrivning) NOT_BUILT — kun beregnet, ikke skrevet. Kilde: 02_SCREEN_INVENTORY §3.3, 06_IMPLEMENTATION_STATUS ##03.
**Change-type:** BACKEND_REQUIRED, VIEW_COMPOSITION
**Begrundelse:** BACKEND_REQUIRED fordi hverken godkendelsesskrivningen (`ansoegning.status`/`afgjortAf`/`svar`) eller den blokerende reservationsskrivning findes som Cloud Function i dag; VIEW_COMPOSITION for at aktivere "Registrér fravær"/godkend-UI på kontorskærmen, som i dag er permanent deaktiveret.

## 14 — Medarbejdere — `/opsaetning/medarbejdere`
**Modul:** Workforce · **Beslutning:** MOVE · **Nyt hjem:** Opsætning > Medarbejdere
**V1-handling:** Placeringen er administrativt rigtig, men færdiggør redigering, fratrædelse og tydelig kobling mellem person og login.
**Nuværende status:** PARTIAL. Oprettelse BUILT (`gem()` → `personale/<id>`); "Redigér" og "Registrér fratrædelse" permanent deaktiverede i UI. Verificeret i 00_AUTHORITATIVE_PRODUCT_RULES (Korrektion 8): `.write` på `personale/$id` tillader ALLEREDE direkte klient-skrivning med `personale.skriv`, og `PERSONALE_STATUS` har allerede `fratraadt` som gyldig tilstand — fratrædelse er en almindelig feltopdatering via samme `gem()`-kald som oprettelse, ingen ny Cloud Function. Kilde: 02_SCREEN_INVENTORY §3.4, 06_IMPLEMENTATION_STATUS ##03.
**Change-type:** VIEW_COMPOSITION
**Begrundelse:** Ingen navigationsændring reelt kræves — route og Nyt hjem er identiske med i dag, så "MOVE" er allerede opfyldt positionsmæssigt. Korrektion 8 retagger denne række **`BACKEND_REQUIRED` → `VIEW_COMPOSITION`**: skrivevejen for både redigering og fratrædelse findes allerede (samme `.write`-regel, samme `gem()`, `fratraadt` allerede en gyldig status) — det reelle arbejde er UI der aktiverer de deaktiverede knapper og gør person↔login-koblingen tydelig.

## 15 — Enheder — `/opsaetning/enheder`
**Modul:** Fleet · **Beslutning:** KEEP · **Nyt hjem:** Opsætning > Fleet > Enheder
**V1-handling:** Behold som stamdata, ikke som Fleet-hovedmenu. Verificér rules/write-path og fjern forældede kommentarer.
**Nuværende status:** BUILT — klientside skrivevej (`gem()`) er reel, men med uafklaret forbehold: filens egen (muligvis forældede) kommentar hævder skrivning ikke er bygget, og den deployede regelfils faktiske svar er IKKE PÅVIST i dette dossier. Kilde: 02_SCREEN_INVENTORY §4.1, 06_IMPLEMENTATION_STATUS ##04.
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** V1-handlingen kræver ingen strukturel ændring — kun en verifikation af noget der allerede virker og fjernelse af en misvisende kommentar; placeringen er allerede korrekt.

## 16 — Driftskalender — `/flaade`
**Modul:** Fleet · **Beslutning:** KEEP · **Nyt hjem:** Fleet > Driftskalender
**V1-handling:** Behold som Fleets primære arbejdsflade. Kalenderen skal dominere siden; fem handlingstal skal være kompakte og åbne samme arbejdskø/panel.
**Nuværende status:** PARTIAL/BUILT. Kerneflowet (opret/flyt/statusskift) er ægte (`opgaveplanlaeg`/`opgaveflyt`/`opgavestatus`); mail-/sagsfaner er MOCK/DEMO (fase 0). Kilde: 02_SCREEN_INVENTORY §4.2, 06_IMPLEMENTATION_STATUS ##04.
**Change-type:** VIEW_COMPOSITION
**Begrundelse:** At lade de fem handlingstal åbne "samme arbejdskø/panel" forudsætter at Arbejdskø (række 18) indlejres her som panel — samme data, ny sammensætning.

## 17 — Indberetninger — `/flaade/indberetninger`
**Modul:** Fleet · **Beslutning:** FINISH · **Nyt hjem:** Fleet > Indberetninger
**V1-handling:** Byg triage: prioritet, vurdering, planlæg aktivitet, afvent, afslut og kobling til Fleet-sag. Dette er et V1-blokerende hul.
**Nuværende status:** MOCK/DEMO for skrivning ("Afslut" deaktiveret, "Fase 0: skrives ikke fra klienten endnu"), BUILT for læsning. Den forudsatte "Fleet-sag"-kobling har ifølge 00_AUTHORITATIVE_PRODUCT_RULES faktisk et deployeret backend (`sagOpret`, `sagBeskedSkriv`, `sagKarantaeneFrigiv`, `sagAftaleBekraeft` — alle live i DEV); hullet ligger i frontend (`Sagsvisning.jsx` er stadig "fase 0"-mærket). Rettet i Korrektion 7: **indgående mail → `sagOpret` er IKKE V1-blocking** for denne række — det er en senere, separat sikkerhedsskive (punkt D, uden for V1-kritisk vej), ikke en forudsætning for triagen. Den V1-relevante mail-opgave for Fleet/Facility er i stedet en fælles UDGÅENDE mailfunktion + logning (Korrektion 7, punkt B+C — delt med Procure, se række 25). Kilde: 02_SCREEN_INVENTORY §4.3, 06_IMPLEMENTATION_STATUS ##04, 00_AUTHORITATIVE_PRODUCT_RULES §A og Korrektion 7.
**Change-type:** BACKEND_REQUIRED, VIEW_COMPOSITION
**Begrundelse:** BACKEND_REQUIRED for selve triage-handlingerne (afslut/planlæg aktivitet — ingen Cloud Function fundet) og for en fælles UDGÅENDE mailfunktion for Fleet/Facility (Korrektion 7, punkt B) — IKKE for indgående mail, som Korrektion 7 eksplicit udskyder til en senere skive og forbyder at kræve i Skive 3's Definition of Done; VIEW_COMPOSITION for at koble `Sagsvisning.jsx`s deaktiverede knapper til det allerede eksisterende, virkende sags-backend. Se mismatch-note nedenfor — det er en mindre og anderledes afgrænset BACKEND_REQUIRED-mængde end "V1-blokerende hul" umiddelbart antyder.

## 18 — Arbejdskø — `/flaade/koe`
**Modul:** Fleet · **Beslutning:** MERGE · **Nyt hjem:** Driftskalender > arbejdskø/drawer
**V1-handling:** Bevar filtreringslogikken, men skjul som selvstændig skærm. Åbn samme kø fra de fem kort i driftskalenderen.
**Nuværende status:** MOCK/DEMO for skrivning ("Planlæg"/"Flyt" deaktiverede — handlingen sker fra Driftskalenderen), BUILT for læsning/navigation. Kilde: 02_SCREEN_INVENTORY §4.4, 06_IMPLEMENTATION_STATUS ##04.
**Change-type:** VIEW_COMPOSITION, HIDE_ONLY
**Begrundelse:** Samme filtreringslogik og data flyttes ind som panel i Driftskalenderen (VIEW_COMPOSITION); den selvstændige skærm/route fjernes fra navigationen (HIDE_ONLY).

## 19 — Overblik & fejl — `/facility`
**Modul:** Facility · **Beslutning:** KEEP · **Nyt hjem:** Facility > Overblik
**V1-handling:** Behold som modul-forside. Prioritér åbne fejl og driftsstatus; reducer sekundære kort og demoafhængige estimater.
**Nuværende status:** BUILT for anlægs-/fejlregistrering; KPI-række/aktivfordeling PARTIAL. "Estimeret omkostning" pr. anlæg slår i praksis op i `DEMO_SERVICEBESOEG` i stedet for den hentede opgaveliste, hvilket kan afvige fra Servicekalenderens tal for samme begreb. Kilde: 02_SCREEN_INVENTORY §5.1, §"Steder hvor samme information findes flere steder".
**Change-type:** VIEW_COMPOSITION
**Begrundelse:** At reducere sekundære kort og rette estimatet til at bruge den samme, allerede tilgængelige opgaveliste som Servicekalenderen er en omkomponering af eksisterende data, ikke en ny datakilde.

## 20 — Servicekalender — `/facility/servicekalender`
**Modul:** Facility · **Beslutning:** KEEP · **Nyt hjem:** Facility > Servicekalender
**V1-handling:** Behold. Samme kalenderdesign som Fleet, men tydeligt med anlæg/lokation som ressourcer.
**Nuværende status:** BUILT. Deler allerede `Gitterkalender.jsx` med Fleets Driftskalender og Disponering. Kilde: 02_SCREEN_INVENTORY §5.2, 06_IMPLEMENTATION_STATUS ##05.
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** Den efterspurgte fælles kalenderdesign er allerede opfyldt (delt komponent) — ingen strukturel ændring resterer ud over evt. label-justering.

## 21 — Klima & energi — `/facility/klima`
**Modul:** Facility · **Beslutning:** LATER · **Nyt hjem:** Facility > Klima & energi (tilvalg senere)
**V1-handling:** Skjul indtil zone-/sensoropsætning og omkostningsinput eller integration er reelt. Må ikke fremstå som færdig monitorering uden datakilde.
**Nuværende status:** BUILT for læsning; NOT_BUILT for skrivning af sensormålinger/zonegrænser og bygningsomkostninger — reglerne tillader det, men ingen UI findes. Kilde: 02_SCREEN_INVENTORY §5.3, 06_IMPLEMENTATION_STATUS ##05.
**Change-type:** HIDE_ONLY
**Begrundelse:** V1-handlingen er udelukkende at skjule menupunktet; den fremtidige skrivevej for sensormålinger (BACKEND_REQUIRED) hører til en senere genintroduktion.

## 22 — Servicedialog — `Dialog` (i Servicekalender)
**Modul:** Facility · **Beslutning:** KEEP · **Nyt hjem:** Servicekalender > dialog
**V1-handling:** Behold som kontekstuel dialog. Standardisér knapper, leverandørkontakt og næste handling med Fleet-dialogen uden at tvinge samme feltskema.
**Nuværende status:** BUILT. Opretter reelt via `facilityplanlaeg`. Ingen mail sendes ("beslutning 20 er fase 0"). Kilde: 02_SCREEN_INVENTORY §5.4, 06_IMPLEMENTATION_STATUS ##05.
**Change-type:** VIEW_COMPOSITION
**Begrundelse:** At standardisere knapper/næste-handling med Fleets `Planlaegdialog.jsx` uden at ændre feltskema er en ren UI-konsistensopgave på eksisterende komponenter.

## 23 — Procure-overblik — `/indkoeb`
**Modul:** Procure · **Beslutning:** FINISH · **Nyt hjem:** Procure > Overblik
**V1-handling:** Behold proceslinjen, men gør siden til en handlingsindbakke. Vis kun behov, ordrer, godkendelser, lav lagerbeholdning og fakturaer der kræver handling.
**Nuværende status:** BUILT. Kilde: 02_SCREEN_INVENTORY §6.1.
**Change-type:** VIEW_COMPOSITION
**Begrundelse:** Ren filtrering/omkomponering af allerede hentet data til en indbakke-visning — ingen ny data eller skrivevej.

## 24 — Indkøbsbehov — `/indkoeb/behov`
**Modul:** Procure · **Beslutning:** FINISH · **Nyt hjem:** Procure > Behov
**V1-handling:** Behold og gør mobilvenlig. Understøt enkel melding fra snedkeri/lager/kontor; foto/lyd er senere, men tekst, vare og antal skal virke nu.
**Nuværende status:** BUILT (`behovskriv`) — tekst/vare/antal virker allerede i dag. Foto-/lydvedhæftning eksplicit ikke bygget (kræver fillagring). Kilde: 02_SCREEN_INVENTORY §6.2, 06_IMPLEMENTATION_STATUS ##06.
**Change-type:** VIEW_COMPOSITION
**Begrundelse:** Kernefunktionen er allerede BUILT — arbejdet er responsivt/mobilvenligt layout på eksisterende komponent, ikke ny data eller backend.

## 25 — Bestillinger — `/indkoeb/bestillinger`
**Modul:** Procure · **Beslutning:** FINISH · **Nyt hjem:** Procure > Bestillinger
**V1-handling:** Behold leverandørforslag og gruppering. Byg reel mailafsendelse med PO-nummer, bestiller og krav om PO-nummer på fakturaen.
**Nuværende status:** BUILT for kladdeoprettelse (`ordreskriv`). PARTIAL for afsendelse — "Systemet sender ikke udkastene", intet SMTP/afsenderadresse; "Markér som sendt" er kun et statusfelt. Kilde: 02_SCREEN_INVENTORY §6.3, 06_IMPLEMENTATION_STATUS ##06.
**Change-type:** BACKEND_REQUIRED, DATA_MODEL
**Begrundelse:** BACKEND_REQUIRED fordi reel mailafsendelse (SMTP/afsenderadresse) ikke findes nogen steder i platformen i dag; DATA_MODEL fordi et krav om PO-nummer på fakturaen sandsynligvis kræver et nyt/valideret felt på `fakturaer`-noden i reglerne. Jf. Korrektion 7/10 (Skive 4D) bør denne mailafsendelse undersøges som SAMME fælles mailinfrastruktur som Fleet/Facilitys udgående mail (række 17, Skive 3D), ikke som to separate implementeringer.

## 26 — Godkendelser — `/indkoeb/godkendelser`
**Modul:** Procure · **Beslutning:** KEEP · **Nyt hjem:** Procure > Godkendelser
**V1-handling:** Behold den operationelle kø. Flyt opsætning af beløbsgrænse/godkender til Opsætning > Procure, men vis aktiv regel på siden.
**Nuværende status:** BUILT — godkendelsesreglerne (`godkendelsesregelskriv`) redigeres i dag direkte på denne operationelle skærm. Kilde: 02_SCREEN_INVENTORY §6.4, 06_IMPLEMENTATION_STATUS ##06.
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** Både kø og regelskrivning er allerede BUILT — arbejdet er udelukkende at flytte regelopsætningens menuplacering, med et vist-øjeblikkeligt-udsnit tilbage på den operationelle side.

## 27 — Procure-fakturaer — `/indkoeb/fakturaer`
**Modul:** Procure · **Beslutning:** MERGE · **Nyt hjem:** Fakturaer & bilag, filter=Procure
**V1-handling:** Fjern parallel fakturaskærm. Route kan redirecte til det fælles Fakturacenter med Procure-filter.
**Nuværende status:** BUILT. Læser/skriver bevidst samme `fakturaer/`-node som Fakturacenter (dokumenteret som "TRE TVETYDIGE NODER" — bevidst delt). Skrivning sker i dag under `indkoeb.skriv`/`indkoeb.godkend`; Korrektion 2 i 00_AUTHORITATIVE_PRODUCT_RULES indfører i stedet den fælles `fakturaer.laes`/`.skriv`/`.godkend`-familie, som begge forbrugere (denne skærm og Fakturacenter, række 3) skal bruge. Kilde: 02_SCREEN_INVENTORY §6.5, §"Steder hvor samme information findes flere steder".
**Change-type:** ROUTE_REDIRECT, VIEW_COMPOSITION, PERMISSION_MODEL
**Begrundelse:** ROUTE_REDIRECT fordi blueprintet eksplicit foreslår at routen redirecter; VIEW_COMPOSITION for Procure-filteret som skal eksistere som et filtreret view inde i Fakturacenter; PERMISSION_MODEL fordi denne skærm og Fakturacenter deler samme `fakturaer/`-node og derfor skal migreres SAMTIDIGT til Korrektion 2's nye `fakturaer.*`-familie — de kan ikke gates uafhængigt af hinanden.

## 28 — Leverandører — `/indkoeb/leverandoerer`
**Modul:** Procure · **Beslutning:** MOVE · **Nyt hjem:** Fælles stamdata > Leverandører
**V1-handling:** Gør basisleverandør/kreditor fælles for Fleet, Facility og Procure. Procure kan tilføje performance, prislister og indkøbshistorik som faner. Byg CRUD.
**Nuværende status:** MOCK/DEMO for skrivnings-UI (bevidst, "FASE 0: VISNING"), BUILT for læsning inkl. performance-nøgletal og prisliste-historik. Verificeret i 00_AUTHORITATIVE_PRODUCT_RULES (Korrektion 8): `.write` på `leverandoerer/$leverandoerId` tillader ALLEREDE direkte klient-skrivning — kun en opret/redigér-FORM mangler i UI'et, ingen ny Cloud Function. Kilde: 02_SCREEN_INVENTORY §6.6, 06_IMPLEMENTATION_STATUS ##06.
**Change-type:** NAVIGATION_ONLY, PERMISSION_MODEL, VIEW_COMPOSITION
**Begrundelse:** NAVIGATION_ONLY for flytningen til fælles stamdata-menu; PERMISSION_MODEL fordi Korrektion 3 vælger **Model B** for `leverandoerer` (samme mønster som `satser`/`grundlag`/`indkoeb`/`fakturaer`, fremfor Model A's inline-OR-mønster som kun bruges ét sted i kodebasen i dag): noden flytter til basen, fuldt ugatet, med nye dedikerede `leverandoerer.laes`/`leverandoerer.skriv`-permissions (samme rollefordeling som Korrektion 2's `fakturaer.laes`/`.skriv`) — det gør Fleet-/Facility-kunder uden Procure fuldt funktionelle på de elleve skærme der allerede læser leverandørkartoteket i dag, uafhængigt af `indkoeb.laes`; **`BACKEND_REQUIRED` → `VIEW_COMPOSITION`** (Korrektion 8) fordi skrivevejen allerede findes åben — arbejdet er en opret/redigér-formular på en eksisterende `.write`-regel, ikke ny backend. Performance/prislister som Procure-faner kræver ikke DATA_MODEL, da disse felter allerede findes og vises.

## 29 — Varelager — `/indkoeb/varelager`
**Modul:** Procure · **Beslutning:** KEEP · **Nyt hjem:** Procure > Forbrugsvarer
**V1-handling:** Behold, men omdøb tydeligt til Forbrugsvarer & eget lager for ikke at blive forvekslet med Warehouse-kundegods.
**Nuværende status:** BUILT. Kilde: 02_SCREEN_INVENTORY §6.7, 06_IMPLEMENTATION_STATUS ##06.
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** Kun et menupunkt-/titelnavn ændres — ingen route-, komponent- eller datamodelændring.

## 30 — Kalender (Unitbooking) — `/unitbooking`
**Modul:** Unitbooking · **Beslutning:** FINISH · **Nyt hjem:** Unitbooking > Kalender & udlån
**V1-handling:** Gør til samlet arbejdsflade med ny reservation, ledighedssøgning, klargøring, udlevering og retur i paneler/dialoger.
**Nuværende status:** BUILT. Klargøring findes allerede som direkte handling fra kalenderen; ledighedssøgning/reservation ligger i dag på Udlån-skærmen (række 31). Kilde: 02_SCREEN_INVENTORY §7.1, 06_IMPLEMENTATION_STATUS ##07.
**Change-type:** VIEW_COMPOSITION
**Begrundelse:** Samme underliggende funktion (`skiftUdlaan`/`opretUdlaan`) og data — arbejdet er at indlejre Udlåns paneler i Kalender-skærmen.

## 31 — Udlån — `/unitbooking/udlaan`
**Modul:** Unitbooking · **Beslutning:** MERGE · **Nyt hjem:** Kalender & udlån
**V1-handling:** Flyt søg ledige/reservér og næste handling ind i Kalender. Route kan åbne kalenderen med udlånspanelet aktivt.
**Nuværende status:** BUILT. Kilde: 02_SCREEN_INVENTORY §7.2, 06_IMPLEMENTATION_STATUS ##07.
**Change-type:** VIEW_COMPOSITION, ROUTE_REDIRECT
**Begrundelse:** VIEW_COMPOSITION for indlejringen af søg/reservér-panelet i Kalender; ROUTE_REDIRECT fordi blueprintet foreslår at routen skal åbne kalenderen med panelet aktivt (en parametriseret redirect).

## 32 — Historik — `/unitbooking/historik`
**Modul:** Unitbooking · **Beslutning:** KEEP · **Nyt hjem:** Unitbooking > Historik
**V1-handling:** Behold som read-only dokumentation pr. kasse og sag.
**Nuværende status:** BUILT (ren visning). Kilde: 02_SCREEN_INVENTORY §7.3, 06_IMPLEMENTATION_STATUS ##07.
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** Ingen ændring kræves ud over evt. uændret menuplacering — skærmen er allerede den kanoniske, bevidst read-only historik.

## 33 — Reolpladser — `/unitbooking/reolpladser`
**Modul:** Unitbooking · **Beslutning:** MERGE · **Nyt hjem:** Opsætning > Lagerlokationer
**V1-handling:** Slå sammen med Warehouse Lokationer til én fælles lokationsskærm med modulbestemte felter og samme shared node.
**Nuværende status:** BUILT. Deler allerede `reolpladser`-noden med Warehouse Lokationer via `flet:true`-skrivning ("Eksplicit delt node med Warehouse"). Kilde: 02_SCREEN_INVENTORY §7.4, 06_IMPLEMENTATION_STATUS ##07.
**Change-type:** VIEW_COMPOSITION, NAVIGATION_ONLY
**Begrundelse:** Datamodellen er allerede fælles (samme node, samme flet-skrivning) — arbejdet er at kombinere de to skærme til én (VIEW_COMPOSITION) og placere den ét sted i Opsætning-menuen (NAVIGATION_ONLY). Se spejlrække 45.

## 34 — Kasseliste — `/opsaetning/kasser`
**Modul:** Unitbooking · **Beslutning:** KEEP · **Nyt hjem:** Opsætning > Unitbooking > Kasser & typer
**V1-handling:** Behold som stamdata. Saml kassetyper/undertyper her og færdiggør redigering af eksisterende typer.
**Nuværende status:** BUILT for kasse-CRUD. Kassetype-administration BUILT for oprettelse; redigering af eksisterende type er IKKE PÅVIST i UI (ikke bekræftet fraværende, men ikke fundet). Kilde: 02_SCREEN_INVENTORY §7.5, 06_IMPLEMENTATION_STATUS ##07.
**Change-type:** VIEW_COMPOSITION
**Begrundelse:** Skrivevejen (`gem()`) er generisk og findes allerede for oprettelse — den manglende redigerings-UI er sandsynligvis kun en manglende formular på eksisterende funktion, ikke en ny backend.

## 35 — Varer — `/warehouse`
**Modul:** Warehouse · **Beslutning:** MOVE · **Nyt hjem:** Warehouse > Varer
**V1-handling:** Opret en ny Warehouse-forside. Flyt varekartoteket til en tydelig underside; det bør ikke være modulets landingsside.
**Nuværende status:** BUILT. Kilde: 02_SCREEN_INVENTORY §8.1, 06_IMPLEMENTATION_STATUS ##08.
**Change-type:** NAVIGATION_ONLY, VIEW_COMPOSITION
**Begrundelse:** NAVIGATION_ONLY for at flytte varekartoteket til underside; VIEW_COMPOSITION fordi en ny Warehouse-forside skal komponeres af eksisterende data (samme mønster som `Dashboard.jsx`-referencen), ikke bare et menupunkt.

## 36 — Pluk & afsend — `/warehouse/pluk`
**Modul:** Warehouse · **Beslutning:** KEEP · **Nyt hjem:** Warehouse > Pluk & afsend
**V1-handling:** Behold som guidet daglig arbejdsgang.
**Nuværende status:** BUILT. Kilde: 02_SCREEN_INVENTORY §8.2, 06_IMPLEMENTATION_STATUS ##08.
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** Ingen ændring ud over evt. justeret placering i den nye Warehouse-menustruktur.

## 37 — Bevægelser — `/warehouse/bevaegelser`
**Modul:** Warehouse · **Beslutning:** MOVE · **Nyt hjem:** Warehouse > Mere > Bevægelser
**V1-handling:** Behold som avanceret/generisk værktøj og historik, men fjern fra den primære daglige menu for standardlagermedarbejdere.
**Nuværende status:** BUILT. Kilde: 02_SCREEN_INVENTORY §8.3, 06_IMPLEMENTATION_STATUS ##08.
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** Kun menuplacering flyttes til en "Mere"-undermenu — samme route, komponent og data.

## 38 — Optælling — `/warehouse/optaelling`
**Modul:** Warehouse · **Beslutning:** KEEP · **Nyt hjem:** Warehouse > Optælling
**V1-handling:** Behold som særskilt, kontrolleret flow.
**Nuværende status:** BUILT. Kilde: 02_SCREEN_INVENTORY §8.4, 06_IMPLEMENTATION_STATUS ##08.
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** Ingen strukturel ændring — skærmen er allerede uændret placeret som ønsket.

## 39 — Modtagelse — `/warehouse/modtagelse`
**Modul:** Warehouse · **Beslutning:** KEEP · **Nyt hjem:** Warehouse > Modtagelse
**V1-handling:** Behold som den kanoniske vej ind for ankommet gods og putaway.
**Nuværende status:** BUILT. Kilde: 02_SCREEN_INVENTORY §8.5, 06_IMPLEMENTATION_STATUS ##08.
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** Ingen ændring — allerede kanonisk indgang.

## 40 — Beholdere — `/warehouse/carriers`
**Modul:** Warehouse · **Beslutning:** KEEP · **Nyt hjem:** Warehouse > Beholdere
**V1-handling:** Behold som opslag og indholdsoverblik; tilføj konteksthandlinger til label, flyt og historik.
**Nuværende status:** BUILT (ren visning, bevidst uden skrivehandling). Kilde: 02_SCREEN_INVENTORY §8.6, 06_IMPLEMENTATION_STATUS ##08.
**Change-type:** VIEW_COMPOSITION
**Begrundelse:** Konteksthandlingerne (label, flyt, historik) findes allerede som selvstændige skærme/funktioner — arbejdet er at indlejre genveje til dem her, ikke at bygge ny data eller backend.

## 41 — Transportlabels — `/warehouse/labels`
**Modul:** Warehouse · **Beslutning:** MERGE · **Nyt hjem:** Beholdere/Modtagelse > Print label
**V1-handling:** Bevar labelmotoren, men gør den kontekstuel fra beholderen eller modtagelsen. Route kan forblive deep link, ikke primært menupunkt.
**Nuværende status:** BUILT. Kilde: 02_SCREEN_INVENTORY §8.7, 06_IMPLEMENTATION_STATUS ##08.
**Change-type:** VIEW_COMPOSITION, HIDE_ONLY
**Begrundelse:** VIEW_COMPOSITION fordi labelmotoren indlejres kontekstuelt i Beholdere/Modtagelse; HIDE_ONLY fordi den fjernes som primært menupunkt (routen bevares som deep link, ikke redirect).

## 42 — Afregning — `/warehouse/afregning`
**Modul:** Warehouse · **Beslutning:** MOVE · **Nyt hjem:** Økonomi > Fakturagrundlag > Warehouse
**V1-handling:** Behold logikken, men fjern økonomiarbejde fra lagermedarbejderens primære menu.
**Nuværende status:** BUILT (`opretGrundlag()`). Kilde: 02_SCREEN_INVENTORY §8.8, 06_IMPLEMENTATION_STATUS ##08.
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** Kun menuplacering flyttes fra Warehouse til Økonomi — samme route, logik og data.

## 43 — Volumen — `/warehouse/volumen`
**Modul:** Warehouse · **Beslutning:** MOVE · **Nyt hjem:** Kunder & Priser > Lagerkalkulator
**V1-handling:** Behold som salgs-/tilbudskalkulator, ikke som lagerdrift. Et gemt tilbud er senere.
**Nuværende status:** BUILT som beregner; PLANNED for tilbudsoprettelse (bevidst udskudt, ingen nodeform besluttet for `tilbud`). Kilde: 02_SCREEN_INVENTORY §8.9, 06_IMPLEMENTATION_STATUS ##08.
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** V1-handlingen kræver kun flytning af menuplacering; det gemte tilbud er eksplicit udskudt til senere (uden for denne rundes scope).

## 44 — Sporbarhed — `/warehouse/sporbarhed`
**Modul:** Warehouse · **Beslutning:** KEEP · **Nyt hjem:** Warehouse > Sporbarhed
**V1-handling:** Behold som særskilt compliance-/opslagsskærm.
**Nuværende status:** BUILT (ren visning). Kilde: 02_SCREEN_INVENTORY §8.10, 06_IMPLEMENTATION_STATUS ##08.
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** Ingen ændring — allerede separat og korrekt placeret.

## 45 — Lokationer — `/warehouse/lokationer`
**Modul:** Warehouse · **Beslutning:** MERGE · **Nyt hjem:** Opsætning > Lagerlokationer
**V1-handling:** Slå sammen med Unitbooking Reolpladser til ét fælles stamdatavindue. Bevar modulfelter og flet-skrivning.
**Nuværende status:** BUILT. Delt node med Unitbooking (`flet:true`). Kilde: 02_SCREEN_INVENTORY §8.11, 06_IMPLEMENTATION_STATUS ##08.
**Change-type:** VIEW_COMPOSITION, NAVIGATION_ONLY
**Begrundelse:** Spejler række 33: datamodellen er allerede fælles — arbejdet er UI-sammenlægning (VIEW_COMPOSITION) og ny fælles menuplacering (NAVIGATION_ONLY).

## 46 — Kunder — `/opsaetning/kunder`
**Modul:** Kunder & priser · **Beslutning:** FINISH · **Nyt hjem:** Kunder
**V1-handling:** Flyt ud af Opsætning for roller der arbejder med kunder. Byg opret/redigér og gør kundeprofilen til hjem for kontakt, aftaler og priser.
**Nuværende status:** BUILT for læsning/rapportering. INGEN redigering af kundestamdata fundet nogen steder i det læste filsæt; skærmen har i dag intet topniveaupunkt og nås kun via Opsætning-menuen. Kilde: 02_SCREEN_INVENTORY §9.1, 06_IMPLEMENTATION_STATUS ##09.
**Change-type:** NAVIGATION_ONLY, BACKEND_REQUIRED, VIEW_COMPOSITION
**Begrundelse:** NAVIGATION_ONLY for at give Kunder et topniveaupunkt uden for Opsætning; BACKEND_REQUIRED fordi der ingen skrivevej (opret/redigér) findes for kundestamdata i dag; VIEW_COMPOSITION fordi kundeprofilen skal blive hjem for Kundepriser (række 48) som en fane.

## 47 — Standardpriser — `/opsaetning/priser`
**Modul:** Kunder & priser · **Beslutning:** MOVE · **Nyt hjem:** Opsætning > Priser > Standardpriser
**V1-handling:** Behold versioneret prislogik, men placér som adminfunktion.
**Nuværende status:** BUILT (`gem()`, aldrig overskrivning, kun ny post). Kilde: 02_SCREEN_INVENTORY §9.2, 06_IMPLEMENTATION_STATUS ##09.
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** Kun undermenu-placering under Opsætning > Priser ændres — logikken er uændret.

## 48 — Kundepriser — `/opsaetning/aftalepriser`
**Modul:** Kunder & priser · **Beslutning:** MERGE · **Nyt hjem:** Kunder > Kundeprofil > Priser
**V1-handling:** Bevar funktionalitet og deep link, men gør prisafvigelsen til en fane på kundens profil frem for separat hovedskærm.
**Nuværende status:** BUILT. Kilde: 02_SCREEN_INVENTORY §9.3, 06_IMPLEMENTATION_STATUS ##09.
**Change-type:** VIEW_COMPOSITION
**Begrundelse:** Samme node-familie og funktionalitet, kun indlejret som fane på en kundeprofil (der selv skal bygges, jf. række 46) — deep link bevares, ingen redirect.

## 49 — Generelt — `/opsaetning`
**Modul:** Opsætning · **Beslutning:** FINISH · **Nyt hjem:** Opsætning > Virksomhed
**V1-handling:** Gør til et reelt admin-center. V1 skal mindst kunne ændre virksomhedsnavn, adresse, CVR/org.nr., logo, standardlokation og fakturaoplysninger.
**Nuværende status:** PARTIAL — bevidst LÆSESKÆRM: "Redigér virksomhedsoplysninger" er deaktiveret med begrundelsen "Ikke besluttet endnu". Kilde: 02_SCREEN_INVENTORY §9.4, 06_IMPLEMENTATION_STATUS ##09, CLAUDE.md §"Kendte huller".
**Change-type:** BACKEND_REQUIRED, DATA_MODEL
**Begrundelse:** BACKEND_REQUIRED fordi ingen skrivevej findes for virksomhedsoplysninger i dag; DATA_MODEL fordi felter som CVR/org.nr., logo og fakturaoplysninger sandsynligvis kræver ny/udvidet feltvalidering på tenant/virksomhed-noden i `firebase.rules.json`.

## 50 — Brugere & roller — `/opsaetning/brugere`
**Modul:** Opsætning · **Beslutning:** KEEP · **Nyt hjem:** Opsætning > Brugere & adgang
**V1-handling:** Behold. Tilføj separat navigation/dashboard-synlighed pr. bruger uden at erstatte serverpermissions.
**Nuværende status:** BUILT for fem Cloud Functions (`opretbruger`, `skiftrolle`, `rolleskriv`, `dashboardvisningskriv`, `spaerlogin`). **Dashboard-synlighed pr. bruger findes allerede** via `dashboardvisning`-noden og `dashboardvisningskriv` — se mismatch-note nedenfor. Rettet/afgjort i 00_AUTHORITATIVE_PRODUCT_RULES (Korrektion 1): den fremtidige navigationssynlighed pr. bruger må IKKE bæres af permissions (en permission som `satser.laes`/`indkoeb.laes` siger hvad en ROLLE må, ikke hvad der skal stå i ÉN brugers menu) — den skal genbruge `dashboardvisning`-mønstret uændret, som en sideordnet node (fx `navvisning/<uid>`). Kilde: 02_SCREEN_INVENTORY §9.5, 06_IMPLEMENTATION_STATUS ##09, CLAUDE.md, 00_AUTHORITATIVE_PRODUCT_RULES Korrektion 1.
**Change-type:** DATA_MODEL, BACKEND_REQUIRED, VIEW_COMPOSITION
**Begrundelse:** Dashboard-delen er allerede BUILT og kræver intet; det der reelt mangler er en tilsvarende SYNLIGHEDSMEKANISME for almindelige navigationspunkter (i dag kun `kraeverModul`/`kraeverPerm`, ikke pr.-bruger) — Korrektion 1 kræver at den genbruger `dashboardvisning`s fire garantier (standard = vist, kun et eksplicit `false` skjuler, kan ikke skjule det hele, læses ALDRIG af en firebase-regel) frem for at opfinde en ny model eller lade en permission bære synligheden. Det kræver et nyt felt (DATA_MODEL), en skrivefunktion efter samme Cloud-Function-mønster som `dashboardvisningskriv` (BACKEND_REQUIRED) og UI i denne skærm (VIEW_COMPOSITION).

## 51 — Integrationer — `/opsaetning/integrationer`
**Modul:** Opsætning · **Beslutning:** LATER · **Nyt hjem:** Opsætning > Integrationer (når første findes)
**V1-handling:** Skjul den tomme side i V1. Vis først menupunktet når mindst én reel integration eller konkret tilmeldingsfunktion findes.
**Nuværende status:** MOCK/DEMO i snæver forstand (hardkodet tomt array), men bevidst ærligt design — "FleetControl taler ikke med nogen fremmede systemer endnu". Kilde: 02_SCREEN_INVENTORY §9.6, 06_IMPLEMENTATION_STATUS ##09.
**Change-type:** HIDE_ONLY
**Begrundelse:** Ren fjernelse fra V1-navigationen — siden er allerede en ærlig, tom visning uden andet at rette.

## 52 — Hjælp & Support — `/support`
**Modul:** Support · **Beslutning:** HIDE · **Nyt hjem:** Hjælp > kontakt/guide
**V1-handling:** Skjul den nuværende demo-prototype. Erstat midlertidigt med en enkel side med guides, e-mail og telefon; genintroducér sagssystemet når dataflowet er bygget.
**Nuværende status:** MOCK/DEMO. `support.opret` findes ikke i `ROLLE_PERMS`/`permissions.js`, så ingen rigtig bruger kan bruge skærmen i dag. Rettet i 00_AUTHORITATIVE_PRODUCT_RULES (Korrektion 4): routen `/support` skal IKKE skjules — den forbliver reachable som en ny, minimal V1-erstatning (en ærlig, statisk hjælpeside med guide + kontaktoplysninger, ingen demo-supportsagsdata vist). Kilde: 02_SCREEN_INVENTORY §10.1, 06_IMPLEMENTATION_STATUS ##10.
**Change-type:** VIEW_COMPOSITION
**Begrundelse:** Korrektion 4 retagger denne række **`HIDE_ONLY` → `VIEW_COMPOSITION`**: den nuværende `Hjaelp.jsx`s demo-visning erstattes af en ærlig, statisk side (guide + kontakt) på SAMME route — intet nyt backend-behov, og i modsætning til de to underliggende rækker #53 (Supportoverblik) og #54 (Supportsag), som forbliver `HIDE_ONLY`, forsvinder denne route ikke fra navigationen.

## 53 — Supportoverblik — `/support/overblik`
**Modul:** Support · **Beslutning:** HIDE · **Nyt hjem:** Intern supportkonsol (senere)
**V1-handling:** Må ikke være synlig i kundeproduktet før permissions, noder og rigtige sager findes.
**Nuværende status:** MOCK/DEMO. `support.laes` findes ikke i `permissions.js` for nogen rolle, heller ikke admin. Kilde: 02_SCREEN_INVENTORY §10.2, 06_IMPLEMENTATION_STATUS ##10.
**Change-type:** HIDE_ONLY
**Begrundelse:** Ren fjernelse fra kundeproduktets navigation — resten (permissions/noder/sager) er eksplicit udskudt til senere.

## 54 — Supportsag — `/support/sag/:id`
**Modul:** Support · **Beslutning:** HIDE · **Nyt hjem:** Intern/kunde supportsag (senere)
**V1-handling:** Skjul indtil oprettelse, tråd, adgangsbevilling og lukning er end-to-end.
**Nuværende status:** MOCK/DEMO. Alle fire relevante permissions findes ikke i `permissions.js`. Kilde: 02_SCREEN_INVENTORY §10.3, 06_IMPLEMENTATION_STATUS ##10.
**Change-type:** HIDE_ONLY
**Begrundelse:** Ren fjernelse fra navigationen (skjult i sidebar allerede i dag) — ingen anden strukturel ændring i denne runde.

## 55 — Konsol (Ejerkonsol) — `/main`
**Modul:** Internt · **Beslutning:** KEEP · **Nyt hjem:** Udbyderramme > Kunder
**V1-handling:** Behold som internt værktøj, fysisk og navigationsmæssigt adskilt fra kundeproduktet.
**Nuværende status:** BUILT. Allerede egen renderingsgren, ikke via `nav.js` — adskillelsen er allerede opfyldt. Kilde: 02_SCREEN_INVENTORY §10.4, 06_IMPLEMENTATION_STATUS ##10.
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** Ingen ændring — adskillelsen fra kundeproduktet er allerede reel.

## 56 — Prisliste — `/main/priser`
**Modul:** Internt · **Beslutning:** KEEP · **Nyt hjem:** Udbyderramme > Priser & fakturagrundlag
**V1-handling:** Behold internt og versionsstyret.
**Nuværende status:** BUILT. Kilde: 02_SCREEN_INVENTORY §10.5, 06_IMPLEMENTATION_STATUS ##10.
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** Ingen ændring kræves.

## 57 — Forside (Chaufførapp) — `/app`
**Modul:** Chaufførapp · **Beslutning:** FINISH · **Nyt hjem:** Chaufførapp > Forside
**V1-handling:** Behold separat mobilskal, men gør dagens vigtigste handling og eventuelle advarsler tydeligere end fire ens kort.
**Nuværende status:** BUILT (ren visning/navigation). Kilde: 02_SCREEN_INVENTORY §11.1, 06_IMPLEMENTATION_STATUS ##11.
**Change-type:** VIEW_COMPOSITION
**Begrundelse:** Ren omprioritering af hvilket eksisterende kort/advarsel der fremhæves — ingen ny data eller route.

## 58 — Turplan — `/app/tur`
**Modul:** Chaufførapp · **Beslutning:** KEEP · **Nyt hjem:** Chaufførapp > Turplan
**V1-handling:** Behold som kerne. Offline-køen er et stærkt mønster; gør næste stop og manglende melding tydelig.
**Nuværende status:** BUILT inkl. klientside offline-kø (`meldingskoe.js`), ingen GPS/sporing (bevidst). Kilde: 02_SCREEN_INVENTORY §11.2, 06_IMPLEMENTATION_STATUS ##11.
**Change-type:** VIEW_COMPOSITION
**Begrundelse:** Visuel fremhævning af næste stop/manglende melding på allerede hentet data — ingen ny funktion.

## 59 — Indberetning (Chaufførapp) — `/app/indberetning`
**Modul:** Chaufførapp · **Beslutning:** FINISH · **Nyt hjem:** Chaufførapp > Indberetning
**V1-handling:** Behold og tilføj offline-sikkerhed samt materialeforbrug, fotos/kvittering når fillagring er klar. Kontorets triage skal kobles på samme post.
**Nuværende status:** BUILT for grundlæggende indberetning (`gem()` direkte, ikke Cloud Function). Ingen offline-kø for denne skrivning fundet (IKKE PÅVIST om data tabes ved netværksfejl). Materialeforbrug → grundlagslinje PARTIAL (ren funktion BUILT, ingen bekræftet UI-trigger). Foto/kvittering kræver fillagring (NOT_BUILT platformbredt). Kilde: 02_SCREEN_INVENTORY §11.3, 06_IMPLEMENTATION_STATUS ##04, ##11.
**Change-type:** BACKEND_REQUIRED, VIEW_COMPOSITION
**Begrundelse:** BACKEND_REQUIRED for offline-sikkerheden (findes ikke for denne skrivning i dag) og for fillagringen fotos/kvittering forudsætter; VIEW_COMPOSITION for koblingen til kontorets triage (række 17), som skal pege på samme post.

## 60 — Timeregistrering — `/app/tid`
**Modul:** Chaufførapp · **Beslutning:** KEEP · **Nyt hjem:** Chaufførapp > Tid
**V1-handling:** Behold som valgfri Workforce-funktion. Senere kræves kontoroversigt/godkendelse.
**Nuværende status:** BUILT (`gem()` direkte til `stemplinger/{personId}/{id}`). Ingen kontor-skærm læser i dag noden. Kilde: 02_SCREEN_INVENTORY §11.4, 06_IMPLEMENTATION_STATUS ##03, ##11.
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** V1-handlingen kræver ingen ændring — kontoroversigt/godkendelse er eksplicit udskudt til "senere" og altså uden for denne rundes scope.

## 61 — Frihed — `/app/frihed`
**Modul:** Chaufførapp · **Beslutning:** FINISH · **Nyt hjem:** Chaufførapp > Frihed
**V1-handling:** Behold ansøgningen, men luk kæden med kontorets svar og automatisk disponeringsblokering.
**Nuværende status:** BUILT for selve ansøgningen (selvbetjenings-gren). Kontorets svar/godkendelse NOT_BUILT (samme hul som række 13); mail-notifikation ved svar eksplicit ikke bygget (fase 0), erstattet af "svar her i appen". Kilde: 02_SCREEN_INVENTORY §11.5, 06_IMPLEMENTATION_STATUS ##03, ##11.
**Change-type:** BACKEND_REQUIRED, VIEW_COMPOSITION
**Begrundelse:** Samme underliggende hul som række 13 — BACKEND_REQUIRED for godkendelses- og reservationsskrivningen, VIEW_COMPOSITION for at vise kontorets svar i appen (allerede designet UI-plads, kun data mangler).

## 62 — Login — `/login`
**Modul:** Adgang · **Beslutning:** KEEP · **Nyt hjem:** Login
**V1-handling:** Behold fælles login. Skjul dev-autofyld/rollevælgere fuldstændigt uden for DEV.
**Nuværende status:** BUILT (reelt Firebase Auth-kald). Ifølge CLAUDE.md er dev-forudfyldning allerede bundet til `miljoe === "dev"` og rollevælgeren til `miljoe === "demo"` — adgangsvejen (`harAdgang`) afhænger uændret kun af tenant-claim, aldrig af miljø. Kilde: 02_SCREEN_INVENTORY §11.6, CLAUDE.md §"Det du ikke må gøre".
**Change-type:** NAVIGATION_ONLY
**Begrundelse:** Miljøbetingelsen findes allerede korrekt i arkitekturen — V1-handlingen er en verifikation af at ingen dev-affordance er synlig i produktion, ikke en ny mekanisme.

---

## Optælling af change-types

| Change-type | Antal rækker (af 62) |
|---|---:|
| NAVIGATION_ONLY | 25 |
| VIEW_COMPOSITION | 34 |
| ROUTE_REDIRECT | 2 |
| PERMISSION_MODEL | 3 |
| DATA_MODEL | 3 |
| BACKEND_REQUIRED | 10 |
| HIDE_ONLY | 10 |

En række kan bære flere tags (bl.a. derfor summer kolonnen til 87, ikke 62).
**Tallene er opdateret efter de 10 autoritative rettelser** i
`00_AUTHORITATIVE_PRODUCT_RULES.md`: Korrektion 8 verificerede at Kompetencer
(#12), Medarbejdere (#14) og Leverandører (#28) allerede har en åben
`.write`-skrivevej og kun mangler UI, så alle tre gik fra `BACKEND_REQUIRED`
til `VIEW_COMPOSITION` (BACKEND_REQUIRED 13→10, VIEW_COMPOSITION 33→34);
Korrektion 4 gjorde tilsvarende Hjælp & Support (#52) fra `HIDE_ONLY` til
udelukkende `VIEW_COMPOSITION` (HIDE_ONLY 11→10); Korrektion 2 og 3's nye
`fakturaer.*`- og `leverandoerer.*`-permissionfamilier gav Procure-fakturaer
(#27) og Leverandører (#28) en `PERMISSION_MODEL`-tag (PERMISSION_MODEL 2→3).
Læsning: knap under halvdelen af skærmene (25/62) er ren menu-/label-flytning
uden nogen kode-, permission- eller datamodelrisiko. Den næststørste gruppe
(34/62, over halvdelen) er UI-omkomponering af data og funktioner der allerede
findes — risikoen her er primært regressionstest af eksisterende flows, ikke
ny udviklingsrisiko. Kun 10 rækker kræver reelt nyt server-side arbejde
(BACKEND_REQUIRED), og kun 3+3=6 rækker rører permission- eller datamodel-
laget — det er her det tekniske hovedparten af risikoen for skive-planen
ligger, ikke i navigationsoprydningen.

---

## Rækker hvor blueprintets antagelse og audittens fund ikke stemmer overens

**Række 50 — Brugere & roller (`/opsaetning/brugere`).** Blueprintets
V1-handling lyder "Tilføj separat navigation/dashboard-synlighed pr. bruger
uden at erstatte serverpermissions" — formuleringen "tilføj" antyder at
mekanismen slet ikke findes i dag. Auditten (02_SCREEN_INVENTORY §9.5,
06_IMPLEMENTATION_STATUS ##09) og CLAUDE.md viser derimod at
**dashboard-synlighed pr. bruger allerede er BUILT**: noden `dashboardvisning`
og Cloud Function `dashboardvisningskriv` findes og er én af de fem
verificerede, ægte handlinger på denne skærm. Det der reelt mangler, er en
tilsvarende mekanisme for almindelige NAVIGATIONSpunkter (sidebar/`nav.js`),
ikke for dashboardet. Konsekvens for skive-planen: opgaven er smallere end
blueprint-teksten antyder — dashboard-delen skal ikke bygges, kun
navigations-delen. **Opdateret af Korrektion 1:** navigations-delen er nu
afgjort, ikke kun identificeret — den skal være en direkte udvidelse af
`dashboardvisning`-mønstret (en sideordnet `navvisning/<uid>`-node med
samme fire garantier), og eksplicit IKKE en permission. Det løser samtidig
02's og 05's tidligere indbyrdes modstrid om hvorvidt permissions kan bære
navigationssynlighed (de kan ikke — en permission som `satser.laes`/
`indkoeb.laes` siger hvad en ROLLE må, ikke hvad der skal stå i én brugers
menu).

**Række 17 — Indberetninger (`/flaade/indberetninger`), med afsmitning på
række 59 (Chaufførapp Indberetning) og Fleet/Facility "kommunikation"
generelt.** Blueprintet mærker denne række "Dette er et V1-blokerende hul"
og beder om at "bygge triage ... og kobling til Fleet-sag" i en formulering
der læses som om hele sagsfunktionen mangler. 00_AUTHORITATIVE_PRODUCT_RULES
§A (verificeret konflikt A) viser at Fleet/Facility `sager`-backend'en
(`sagOpret`, `sagBeskedSkriv`, `sagKarantaeneFrigiv`, `sagAftaleBekraeft`)
**allerede er deployeret og virker** i DEV — det tidlige auditmateriale
(dossier 04/05), som blueprintets "V1-blokerende hul"-formulering
tilsyneladende læner sig op ad, tog fejl af netop dette. Det reelle,
resterende hul er smallere: (a) frontend `Sagsvisning.jsx` er stadig
"fase 0"-mærket og skal kobles til det eksisterende backend
(VIEW_COMPOSITION, ikke ny backend for selve sags-handlingerne), og (b) en
fælles UDGÅENDE mailfunktion for Fleet/Facility/Procure mangler reelt
(BACKEND_REQUIRED, ægte hul, Korrektion 7 punkt B). **Rettet af Korrektion
7:** den INDGÅENDE mail-vej ind i `sagOpret` (reply-routing/webhook) er
ligeledes et ægte hul, men er eksplicit IKKE V1-blocking — det er en
senere, separat sikkerhedsskive (punkt D), og Skive 3's Definition of Done
må ikke kræve den. Denne tidligere uklarhed mellem audit-materialet og
00_AUTHORITATIVE_PRODUCT_RULES er nu afgjort af Korrektion 7's rækkefølge
(A: Sagsvisning → eksisterende backend, B: udgående mail, C: logning på
sag/ordre, D: indgående — senere, uden for V1). Skive-planlægningen bør
skelne mellem disse tre niveauer, så der ikke bruges tid på at genopfinde et
backend der allerede findes, og så indgående mail ikke fejlagtigt blokerer
V1.
