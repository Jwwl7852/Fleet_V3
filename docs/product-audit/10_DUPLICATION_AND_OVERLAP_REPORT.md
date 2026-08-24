# 10 — Dubletter & overlap

Denne rapport samler alle observationer om dubletter, overlap og genbrug der
blev noteret undervejs i de 11 modul-dossiers
(`docs/product-audit/_dossiers/01-*.md` til `11-*.md`). Kilderne er hver
dossiers "## Mulige overlap"-sektion, "overlap-mistanke"-linjen i
"## Modul-resumé", og de enkelte skærmes "overlap med anden side"-felt i
"## Skærme". Hvor to dossiers uafhængigt af hinanden har fundet den samme
sammenhæng — fx Fakturacenter/Procure → Fakturaer, som optræder i både
dossier 01 og 06 — er observationerne slået sammen til én post der citerer
begge kilder.

Rapporten **identificerer og kategoriserer**. Den foreslår ingen løsning og
tager ingen redesignbeslutning — hver post ender ved en risikovurdering,
aldrig ved en anbefaling. Observationer som kildedossieret selv kalder
bevidst design, er taget med og mærket som sådan, ikke udeladt — en komplet
liste er mere nyttig for en ekstern reviewer end en liste kun over det
alarmerende.

---

## Funktioner der findes flere steder

**Sted A:** Disponerings dagsgitter (`/booking/disponering`, fane "Dag").
**Sted B:** Fleets Driftskalender (`/flaade`).
**Hvorfor de overlapper:** Begge læser/skriver samme `opgaver`-node (art
`vaerksted`) via de samme Cloud Functions (`opgaveplanlaeg`/`opgaveflyt`/
`opgavestatus`) og genbruger bogstaveligt de samme komponenter
(`Gitterkalender.jsx`, `Planlaegdialog.jsx`, `Statusskifte.jsx`).
**Risiko:** En bruger med adgang til begge moduler ser og kan redigere
præcis de samme værkstedsopgaver to steder — forvirring om "hvor hører
dette hjemme", og en fremtidig UI-afvigelse mellem skærmene ville dele data
uden at dele visning. (dossier 02, 04)

**Sted A:** Disponerings ugesgitter (etaper/langture).
**Sted B:** Facilitys Servicekalender (`/facility/servicekalender`).
**Hvorfor de overlapper:** Samme mønster som ovenfor — delt `opgaver`-node
(art `facility`), delt skrivevej (`facilityplanlaeg`), delt komponentsæt.
**Risiko:** Samme som ovenfor, mindre alvorlig fordi de to arter har helt
forskellige feltskemaer og derfor sjældnere forveksles i praksis. (dossier
02, 05)

**Sted A:** Fleets Driftskalender/Værkstedskalender.
**Sted B:** Facilitys Servicekalender.
**Hvorfor de overlapper:** Begge er bogstaveligt samme UI-komponent
(`Gitterkalender.jsx`) over samme `opgaver`-node, adskilt kun af
`art`-feltet — begge koncepter er "book en reparations-/servicetid" for
hver sin ressourcetype.
**Risiko:** Lav for datauenighed (koden fremhæver gentagne gange at deling
er bevidst, netop for at undgå drift), men reel produktmæssig risiko for
brugerforvirring: to selvstændige kalenderskærme i to moduler for
begrebsmæssigt samme handling. (dossier 04, 05)

**Sted A:** Bookings reservationsskrivning (kilde `booking`, prioritet 10).
**Sted B:** Fleets værkstedsreservationer (prioritet 40), Facilitys
facility-sag-reservationer (prioritet 20), Bemandings fraværsreservationer
(prioritet 30).
**Hvorfor de overlapper:** Alle fire kilder skriver til den samme
`reservationer`-basenode (bevidst delt, beslutning 4/92) for at undgå at en
enhed ser "fri" ud i én kilde mens den er optaget af en anden.
**Risiko:** Målt historisk fejl: da noden fejlagtigt var gatet på `booking`
alene, kunne en kunde med Fleet+Facility+Bemanding+Procure (ingen Planning)
ikke læse 37 af sine egne reservationer. Rettet i dag, men delt ejerskab på
tværs af moduler er dokumenteret som en tilbagevendende risikoklasse. (dossier
02, 03, 04)

**Sted A:** Warehouses "Modtagelse"-skærm (`/warehouse/modtagelse`).
**Sted B:** Warehouses generiske "Bevægelser"-skærm, art `putaway`.
**Hvorfor de overlapper:** Modtagelse er en guidet, forenklet brugerflade
oven på præcis én bevægelsesart fra det generiske Bevægelser-skema — samme
Cloud Function (`bevaegelseskriv`), samme node.
**Risiko:** Ingen datamæssig konflikt, men to indgange til samme handling
kan forvirre om hvilken skærm der er "den rigtige" for en placering.
(dossier 08)

**Sted A:** Warehouses "Pluk & afsend"-skærms plukpanel.
**Sted B:** Warehouses generiske "Bevægelser"-skærm, art `pluk`.
**Hvorfor de overlapper:** Samme forhold som ovenfor — plukpanelet er en
kontekst-bundet variant af samme `skrivBevaegelse({ art: "pluk" })`-kald som
findes generisk i Bevægelser.
**Risiko:** Lav/samme som Modtagelse-parret — to indgange til samme
handling. (dossier 08)

**Sted A:** Unitbookings Kalender og Udlån-skærmens belægningsgrad-tal.
**Sted B:** Kasseliste-skærmens belægningstal.
**Hvorfor de overlapper:** Begge kalder bevidst samme funktion
(`kassebelaegning()`), for netop at undgå at to skærme regner samme
nøgletal forskelligt.
**Risiko:** Ingen — dette er bevidst design, ikke en fejl; medtaget for
fuldstændighed. (dossier 07)

**Sted A:** Workforce → Kompetencer-skærmen.
**Sted B:** Disponerings tjek, Fleets og Facilitys `serviceTone()`-brug.
**Hvorfor de overlapper:** Alle bruger samme `tjekKompetencer()`-funktion og
samme `serviceTone()`-tærskler, eksplicit for at undgå at to skærme er
uenige om hvad der haster.
**Risiko:** Ingen i dag — bevidst design, ikke en fejl. (dossier 03, 04, 05)

**Sted A:** Booking → Forslag & reservation (`/booking/forslag/:id`).
**Sted B:** Disponering.
**Hvorfor de overlapper:** Begge viser samme etaper og kalder samme
`tjekDisponering()`-funktion.
**Risiko:** Ingen — dokumenteret som bevidst delt, ikke en kopi. (dossier
02)

**Sted A:** Procure → Godkendelser.jsx (godkendelsesregel-opsætning).
**Sted B:** Procure → Fakturaer.jsx (fakturagodkendelse styret af samme
regel).
**Hvorfor de overlapper:** Begge skærme læser samme
`usePost(null, "godkendelsesregler")`-kilde for at afgøre om
fakturagodkendelse kræves.
**Risiko:** Ingen reel divergens fundet — begge læser korrekt samme kilde;
bemærkelsesværdigt dog at håndhævelsen af reglen blev tilføjet sent
(beslutning 83). (dossier 06)

**Sted A:** Facilitys Servicedialog (planlægning af servicebesøg).
**Sted B:** Fleets Planlaegdialog.jsx (planlægning af værkstedsbesøg).
**Hvorfor de overlapper:** De to dialoger løser konceptuelt samme opgave
("book en tid på en ressource"), men er bevidst **ikke** delt — koden
begrunder eksplicit forskellen (facility-ressourcen er anlæg-eller-lokation,
ingen enhed/arbejdstype som på en værkstedsopgave).
**Risiko:** Ingen — bevidst design, ikke en fejl. Medtaget som modstykke til
de øvrige, hvor deling faktisk sker. (dossier 05)

**Sted A:** Fleets Arbejdskø-skærm (filtre på nye/afventer/planlagt/
kommende/forsinkede).
**Sted B:** Driftskalenderens fem "kasser" med samme optælling.
**Hvorfor de overlapper:** Begge kalder samme `driftstal()`-funktion, med
vilje, for at undgå at kort og liste kan give to forskellige tal.
**Risiko:** Ingen — eksplicit dokumenteret som "ikke et overlap-problem".
(dossier 04)

---

## Sider med næsten samme formål

**Sted A:** Fakturacenter (`/oekonomi/fakturacenter`, Økonomi).
**Sted B:** Procure → Fakturaer (`/indkoeb/fakturaer`).
**Hvorfor de overlapper:** Begge læser og skriver samme `fakturaer/`-node
(bevidst, u-gatet, dokumenteret som en af "tre tvetydige noder").
Fakturacenter beskriver selv forholdet som "Procure er én linse; her ses
alle destinationer."
**Risiko:** To brugergrænseflader for samme handling (destinationssætning,
godkendelse) kan i praksis give forskellige matchforslag hvis de to skærmes
matchlogik nogensinde driver fra hinanden — i dag deler de samme
funktioner, så risikoen er lav men til stede ved fremtidige ændringer i kun
den ene fil. En ekstern læser kan desuden fejlagtigt tro der er to
separate fakturasystemer, eller at en faktura godkendt i Procure ikke
tæller i Økonomi (det gør den — samme post). (dossier 01, 06)

**Sted A:** Facilitys Servicekalender.
**Sted B:** Fleets Værkstedskalender.
**Hvorfor de overlapper:** To selvstændige kalenderskærme i to forskellige
moduler for begrebsmæssigt samme handling ("planlæg et servicebesøg"), hver
med sin egen planlægningsdialog, fordi de underliggende feltskemaerne reelt
er forskellige.
**Risiko:** En bruger med begge moduler skal vide hvilken kalender der
gælder for hvad — se også tilsvarende post under "Funktioner der findes
flere steder". (dossier 04, 05)

**Sted A:** Fleets fremtidige `sager` (planlagt mailtråd for
værkstedsbesøg).
**Sted B:** Facilitys fremtidige `sager` (planlagt mailtråd for
servicebesøg).
**Hvorfor de overlapper:** `moduler.js` dokumenterer eksplicit at `sager`,
når/hvis den bygges, deler samme node med et `art`-felt (`fleet`|`facility`)
— "samme snit som opgaver".
**Risiko:** Lav for dataduplikering (arkitekturen er bevidst delt-node), men
`sager/` findes ikke i `firebase.rules.json` endnu (fase 0) — overlappet er
i dag kun teoretisk/planlagt. (dossier 04, 05)

**Sted A:** Supportsag (`Sag.jsx`, Support-modulet — "sag" betyder
supportticket).
**Sted B:** Sagsvisning.jsx (Fleet/Facility — "sag" betyder værksteds-/
leverandørsag).
**Hvorfor de overlapper:** Begge hedder "sag"/"Sagsvisning" i dansk
UI-sprogbrug, begge har en tråd og vedhæftningsscanning, og begge har et
koncept om en "godkendt" ekstern part. Reelt er det to helt adskilte
koncepter: forskellige noder (`support/sager` — findes slet ikke i reglerne
endnu — vs. `tenants/<t>/sager`, som findes), forskellige permission-
familier (`support.*` vs. `sag.*`), og ingen fælles kode.
**Risiko:** Ingen datarisiko (ingen delt node), men en reel
navngivnings-/vedligeholdelsesrisiko: to udviklere kunne forveksle "byg
supportsager" med "byg Fleet/Facility-sager" i en fremtidig
opgavebeskrivelse — især fordi Fleet/Facility-sagernes backend rent faktisk
ER bygget (`sagOpret` m.fl.), mens frontend'en (`Sagsvisning.jsx`) stadig er
mærket "fase 0, ingen afsendelse" i sine egne kommentarer. En audit der kun
læser frontend-kommentarerne, vil undervurdere hvor bygget Fleet/Facilitys
sagsflow reelt er. (dossier 10)

**Sted A:** Medarbejdere (`/opsaetning/medarbejdere`, data ejet af
Bemanding).
**Sted B:** Opsætning → Brugere & roller.
**Hvorfor de overlapper:** To forskellige entiteter der ligner hinanden — en
`personale`-post (nøglet på `personId`) repræsenterer PERSONEN, en
`brugere`-post (nøglet på `uid`) repræsenterer et LOGIN. De to menupunkter
er bevidst gjort til "naboer" i menuen, hvilket filens egen kommentar
fremhæver som en dokumenteret, bevidst håndteret forvekslingsrisiko.
**Risiko:** En fremtidig udvikler der forveksler de to felter i en ny
funktion, ville ifølge kildekoden bryde ejerskabstjek i
`firebase.rules.json` ("personId matcher aldrig et uid"). (dossier 03)

**Sted A:** Warehouse-planchernes ikke-byggede koncepter ("Overblik",
"Varemodtagelse & putaway", "Tilbud").
**Sted B:** De faktisk byggede skærme med lignende navne ("Beholdere/
Carriers", "Modtagelse", "Volumen").
**Hvorfor de overlapper:** Tre navnepar hvor planchen beskriver en bredere
funktion end den byggede skærm leverer: "Overblik" (planche, IKKE bygget)
vs. "Beholdere/Carriers" (bygget, kun beholder-opslag); "Varemodtagelse &
putaway" (planche med PO/kvalitetskontrol, IKKE bygget) vs. "Modtagelse"
(bygget, kun transit & placering); "Tilbud" (planche, IKKE bygget — intet
dokument oprettes) vs. "Volumen" (bygget, kun en beregner).
**Risiko:** Ingen overlap i selve produktet — risikoen er at LÆSE
planchedokumentationen som en beskrivelse af det byggede system, hvilket er
eksplicit adresseret i kildekodens egne kommentarer. (dossier 08)

**Sted A:** Bookingopsætning (driftsomkostningssatser: bil-km, færge/bro,
agent).
**Sted B:** Kunder & Priser (kundens salgspriser/kundeafvigelser).
**Hvorfor de overlapper:** Begge handler om "priser"/"satser" for
transportydelser, men er bevidst adskilte begreber (beslutning 11) —
driftsomkostning (hvad det koster os) vs. salgspris (hvad kunden betaler).
**Risiko:** Lav teknisk risiko (ingen delt node), men navnemæssig
forvekslingsrisiko for en bruger der ikke kender skellet. (dossier 02)

**Sted A:** Procures Varelager-skærm (`forbrugsvarer`-node).
**Sted B:** `lagre`-noden (Fleet/værksted reservedelslager, samme
`indkoeb`-modul) og Warehouses `varer`/`beholdning` (kundens 3PL-gods).
**Hvorfor de overlapper:** Alle tre er navnemæssigt "lagre". `lagre` og
`forbrugsvarer` ejes begge af modulet `indkoeb`, men kun `forbrugsvarer` er
dækket af Varelager-skærmen — forholdet mellem de to er ikke afklaret i den
læste kode. Warehouse er klart adskilt (kundens gods, kræver `kundeId`).
**Risiko:** En ekstern læser der ser "Varelager" i Procure-menuen, kan
antage det dækker ALT lager i systemet, inklusive kundegods eller
værkstedsreservedele — det gør det ikke. (dossier 06, 08)

**Sted A:** Warehouses `plukordrer`-node.
**Sted B:** Bookings `bookinger`-node.
**Hvorfor de overlapper:** Navnemæssig lighed ("hvad skal ud og hvornår"),
men bevidst forskellige begreber — en booking siger hvem der kører hvorhen,
en plukordre siger hvad der skal ud af lageret.
**Risiko:** Ingen — bevidst adskilt, dokumenteret eksplicit i kildekoden
som en afklaret distinktion, ikke en fejl. (dossier 08)

**Sted A:** Logins "uprovisioneret"-tilstand.
**Sted B:** Alle tre brugergrupper (kontor, chauffør, ejer) uden
tenant-claim.
**Hvorfor de overlapper:** Enhver bruger uden tenant-claim rammer samme
generiske besked — der er ingen rolle-specifik variant.
**Risiko:** Lav — en ekstern reviewer der forventer en tydelig
"chauffør-uden-konto"-besked kunne læse den generiske tekst som mindre
specifik end den er; ikke en funktionel fejl. (dossier 11)

---

## Widgets/tal der gentages unødigt

**Sted A:** Dashboard "Største afvigelser"-kort.
**Sted B:** Økonomi "Største afvigelser"-kort.
**Hvorfor de overlapper:** Begge læser samme `k.afvigelser`-felt fra
KPI-aggregatet — koden dokumenterer eksplicit at dette er en RETTET
mockup-fejl (før: to separate lister med forskellige navne for samme
beløb).
**Risiko:** Lav i dag (samme kilde) — men feltet `afvigelser` er selv
permanent tomt (`[]`) i aggregeringen, så begge kort altid viser "Ingen
afvigelser i perioden", hvilket kan fejlagtigt tolkes som "ingen afvigelser
findes" fremfor "afvigelsesaggregering er ikke bygget". Bevidst design for
selve delingen, ikke en fejl. (dossier 01)

**Sted A:** Bookingoversigtens KPI-kort ("Nye bookinger", "I gang i dag",
"Ikke-faktureret").
**Sted B:** Dashboard modulkort/widgets.
**Hvorfor de overlapper:** Begge læser samme `kpi/`-domæner via `useKpi()` —
den tilsigtede genbrugsmekanisme.
**Risiko:** Lav — men to steder der viser "samme" tal med lidt forskellig
ramme (fx "Ikke-faktureret" vs. et bredere økonomital) kan læses som uenige
af en bruger der ikke kender kilden. (dossier 02)

**Sted A:** Bemandings kapacitetstal (`/bemanding`).
**Sted B:** Dashboard.
**Hvorfor de overlapper:** Begge viser "kapacitetsgrad", "disponeret/
planlagt" og "chauffør disponeret/planlagt" fra samme `kpi/`-node.
**Risiko:** Historisk regnede de to skærme tallet forskelligt (84% vs.
83%), nu samlet i `dashboards.js`s `kapacitetsgrad()`/`ledig()`. En
fremtidig ændring der genindfører en lokal beregning i én af skærmene,
splitter tallene igen — kildekoden fremhæver dette gentagne gange som en
kendt fælde. (dossier 03)

**Sted A:** Dashboard modulkort for Warehouse/Unitbooking.
**Sted B:** De respektive modulers egne dashboards.
**Hvorfor de overlapper:** Begge ville i princippet vise nøgletal for samme
modul.
**Risiko:** Lav p.t. — Dashboard-kortene viser eksplicit "Tallene
aggregeres ikke endnu", så der er intet tal at være uenige om før
aggregeringen er bygget. (dossier 01)

**Sted A:** Facility "Klima nu"-kortet (Overblik).
**Sted B:** Zonetabellen (Klima-skærmen).
**Hvorfor de overlapper:** Bevidst ét og samme datasæt (`zonePar()` kaldt to
gange) vist to steder.
**Risiko:** Ingen i dag — men koden dokumenterer selv at dette var en
tidligere reel bug (to skærme viste forskellige temperaturer for samme
zoner i mockuppen), rettet ved at samle regnestykket ét sted. Bevidst
design, ikke en fejl. (dossier 05)

**Sted A:** Facilitys "estimeret omkostning" pr. anlæg (Overblik).
**Sted B:** Servicekalenderens "Anslået omkostning"-KPI.
**Hvorfor de overlapper:** Begge beskriver samme underliggende tal (næste
planlagte besøgs beløb), men Overblik regner det pr. enkelt anlæg mens
Servicekalenderens KPI er aggregeret fra `kpi.facility`.
**Risiko:** Middel — Overblik-versionen (`estimatForAktiv()`) slår
uventet op i `DEMO_SERVICEBESOEG` frem for den hentede `opgaver`-liste
skærmen selv har til rådighed, hvilket ikke er en ren demo-fallback og kan
vise et estimat der ikke svarer til et rigtigt kommende servicebesøg hos en
rigtig kunde. (dossier 05)

**Sted A:** Økonomi "Opgaver klar til fakturering".
**Sted B:** Fakturering (`/oekonomi/fakturering`), kladdeliste.
**Hvorfor de overlapper:** Begge titler antyder samme koncept ("hvad venter
på at blive faktureret").
**Risiko:** Middel — Økonomi-skærmens liste er 100% demo-data
(`DEMO_KLAR_TIL_FAKTURERING`) mens Fakturering viser ægte `grundlag`-poster
i kladdetilstand; en bruger kan opfatte de to lister som samme datakilde
vist to steder, når den ene reelt er statisk demo-indhold. (dossier 01)

**Sted A:** "Din rolle"-KPI-kort (Brugere & roller).
**Sted B:** Brugervælger (dev-miljø) og demo-rollevælgeren i AppShell.
**Hvorfor de overlapper:** Alle tre viser/lader brugeren skifte "hvilken
rolle er jeg" i samme sidebar-område, med meget forskellig
sikkerhedsbetydning (demo-rollevælgeren ændrer kun client-side visning;
Brugervælgeren skifter en rigtig Firebase Auth-session).
**Risiko:** En ekstern reviewer der sammenligner de to lister af rollenavne
i sidebaren, kan let forveksle "hvad er reel adgangsstyring" — begge er dog
dokumenteret som bevidst adskilt (beslutning 28). (dossier 09, 11)

**Sted A:** `satser/standard`-noden, læst af Bookingopsætning.
**Sted B:** Warehouses Afregning/Volumen og Kunder & Priser, samme node.
**Hvorfor de overlapper:** Alle tre bruger samme opslagsvej (`satsOpslag()`)
mod samme node — "ét opslag, ikke duplikeret".
**Risiko:** Ingen — bevidst design (én kilde), medtaget for
fuldstændighed som eksempel på korrekt undgået duplikering. (dossier 09)

**Sted A:** Fleets Enheder/Oversigt-tabel ("åbne fejl pr. bil").
**Sted B:** Fleets Indberetninger-skærm.
**Hvorfor de overlapper:** Samme afledte tal (`aabneFejlFor()`) vises i
begge skærme.
**Risiko:** Lav — begge er afledt af samme kildedata (`indberetninger`),
ingen selvstændig gemt værdi at være uenig om. (dossier 04)

---

## Administrative funktioner der ligger i arbejdsmoduler

**Sted A:** Opsætnings menu.
**Sted B:** Enheder (data ejet af Fleet), Kasseliste (ejet af Unitbooking),
Medarbejdere (ejet af Bemanding).
**Hvorfor de overlapper:** Alle tre er menu-placeret under Opsætning, fordi
Opsætning er den ene menu enhver kunde altid har adgang til — men data og
modulejerskab ligger reelt i de respektive arbejdsmoduler.
**Risiko:** Lav funktionel risiko (dette er bevidst og eksplicit erkendt i
kildekoden, bl.a. i Generelt-skærmens "hvor rettes stamdata"-henvisning),
men det betyder at "Opsætning" i UI ikke er ét sammenhængende modul, men en
navigationssamling — en erkendt navigationsudfordring, ikke en overset
fejl. (dossier 03, 09)

**Sted A:** Fleets Værkstedskalender ("Modulfakturaer art='fleet'").
**Sted B:** Indkøb → Fakturaer / Fakturacenter (Økonomi).
**Hvorfor de overlapper:** Værkstedskalenderen registrerer et indkøb "i
kontekst" af en driftsopgave, men selve godkendelsen af fakturaen ligger
bevidst udelukkende i Indkøb (beslutning 86, eksplicit i kildekoden: "Bygg
ikke en fakturagodkendelse uden for Indkøb").
**Risiko:** Ingen i dag — dette er en dokumenteret, bevidst modulgrænse
("samme fakturaer som Fakturacenteret — ikke et andet sæt"), men værd at
holde øje med hvis en fremtidig ændring bryder koblingen mellem de to
visninger. (dossier 01, 04)

**Sted A:** `stemplinger`-noden, ejet af modulet Bemanding.
**Sted B:** Ingen skærm i Workforce/Bemanding-modulet viser den — kun
chaufførappens egen Timeregistrering.jsx læser og skriver den.
**Hvorfor de overlapper:** En administrativ funktion (se/godkende
timeregistrering) findes i praksis kun i medarbejder-/arbejdsmodulet
(chaufførappen), ikke i det modul der formelt ejer dataen.
**Risiko:** Ikke bekræftet som et hul (en administrativ visning kunne findes
uden for de undersøgte filer), men ingen af de fire Workforce-skærme eller
chaufførapp-dossieret fandt en kontor-/adminvisning af stemplinger — et
datasæt uden modul-internt vindue for kontorpersonale, hvis ikke. (dossier
03, 11)

**Sted A:** Bemandingsplanens ugeoverblik og "Tildel"-knap (`/bemanding`).
**Sted B:** Reel vagtplanlægning (foregår, hvis den foregår, uden for
systemet).
**Hvorfor de overlapper:** Skærmen er tiltænkt en disponent-arbejdsgang
(planlagt vs. disponeret bemanding), men er permanent demo-data fordi der
ingen vagtnode findes i datamodellen.
**Risiko:** Skærmen er reelt ubrugelig til drift i dag — funktionen
"ligger" nominelt i arbejdsmodulet, men er ikke bygget derinde endnu.
(dossier 03)

---

## Data der tilsyneladende bliver vedligeholdt flere steder

**Sted A:** `fakturaer`-noden, vedligeholdt fra Fakturacenter (Økonomi).
**Sted B:** Samme node, vedligeholdt fra Procure → Fakturaer.
**Hvorfor de overlapper:** Bevidst delt, u-gatet basenode — "to linser" på
samme data, ingen dobbelt lagring.
**Risiko:** Se posten under "Sider med næsten samme formål" — teknisk set
ingen duplikering (samme node), men to skærme der begge kan skrive til den
gør fremtidig divergens i matchlogik en risiko at holde øje med. (dossier
01, 06)

**Sted A:** `reolpladser`-noden, vedligeholdt fra Unitbookings
Reolpladser-skærm.
**Sted B:** Samme node, vedligeholdt fra Warehouses Lokationer-skærm.
**Hvorfor de overlapper:** Bevidst, begrundet to-modul-ejerskab — "Unitbookings
transportkasser og Warehouses kundegods står på de samme hylder". Skrivning
bruger `flet: true` netop for ikke at overskrive det andet moduls felter
(zone, type, status, temperatur) på samme plads-post.
**Risiko:** Lav — et rent, gennemtænkt shared-node-design, ikke en
begrebsduplikering. Permissionen (`reolpladserSkriv`) er desuden bevidst
afkoblet fra `kasser.skriv` for at undgå at gate den delte node på ét
moduls rettighed. (dossier 07, 08)

**Sted A:** Fleets kompetencekrav-logik (`kraevedeKompetencer()` i
`flaade.js`).
**Sted B:** Bemandings kompetenceposter (udløbsdatoer, beviser).
**Hvorfor de overlapper:** Fleet definerer HVILKE kompetencer en enhed
kræver (afledt af art + last); selve kompetencedataen ejes og vedligeholdes
af Bemanding.
**Risiko:** Ikke et datamæssigt overlap (ingen delt node), men et logisk
koblingspunkt hvor Fleets regler og Bemandings data skal stemme overens for
at Disponering kan blokere korrekt — en fremtidig ændring i det ene sted
uden hensyn til det andet kunne bryde koblingen. (dossier 04)

**Sted A:** Carriers-noden (Warehouse) — beholdere, kundens gods.
**Sted B:** Kasser-noden (Unitbooking) — transportkasser, udlejet pr. sag.
**Hvorfor de overlapper:** Fysisk samme grundkoncept (en beholder på en
reolplads), bevidst adskilte noder og tilstandsmaskiner, men tælles sammen
i den fælles belægningsopgørelse (`belaegningPrPlads()`) og vises side om
side i Lokationer-skærmens "Kasser/carriers"-kolonne.
**Risiko:** Ingen teknisk/datamæssig sammenblanding (allerede adskilt med
en eksplicit begrundelse i kildekoden), men reel brugerforvirring hos en
kunde med begge moduler: fysisk identiske beholdere på samme hylder, to
forskellige skærme til at administrere dem. (dossier 07, 08)

**Sted A:** `tenants/<id>/abonnement`, skrevet af Ejerkonsollen.
**Sted B:** Samme node, læst af kundens egen låseskærm
(`Abonnementslaas`).
**Hvorfor de overlapper:** Én skrivevej (via Cloud Function `kundestatus`),
én adskilt læsevej for kunden selv via hans eget tenant-claim.
**Risiko:** Lav/ingen — tiltænkt og korrekt design; nævnt kun for
fuldstændighedens skyld, da opgaven bad om at spore databerøring mellem
modulerne. (dossier 10)

---

## Workflows der hopper unødigt mellem moduler

**Sted A:** Turplan (chaufførapp, `/app/tur`).
**Sted B:** Kontorets Rute & status/Disponering (Booking/Planning).
**Hvorfor de overlapper:** Samme underliggende `etaper`/
`statushaendelser`-noder, to visninger med hvert sit filter (personId vs.
alle) og hver sin handlingsradius (chauffør melder status; kontor skifter
etapetilstand).
**Risiko:** Ikke et datamæssigt overlap i betydningen "to kilder til samme
tal" — men en reviewer der sammenligner de to skærmbilleder, kunne
fejlagtigt tro de var to uafhængige moduler frem for to vinkler på samme
data. (dossier 02, 11)

**Sted A:** Indberetning fra chaufførappen (`/app/indberetning`).
**Sted B:** Flåde → Indberetninger (kontorets arbejdskø).
**Hvorfor de overlapper:** Samme `indberetninger`-node, filtreret modsat
vej (chauffør: egne `oprettetAf === uid`; kontor: alle). Ejerskabet ligger
hos Fleet-modulet, ikke chaufførappen.
**Risiko:** Lav — bevidst design (samme node, to filtrerede visninger),
men indberetningsskærmens "Afslut"-knap er samtidig deaktiveret på
kontorsiden (fase 0), så en chaufførs indberetning kan i dag ende i en
kontorvisning ingen kan handle på. (dossier 04, 11)

**Sted A:** Fravaer.jsx (kontorets fraværsvisning; "Registrér
fravær"-knap deaktiveret).
**Sted B:** app/Frihed.jsx (chaufførens ansøgningsskærm, som REELT kan
skrive til samme `fravaer`-node via en anden regelgren — selvbetjening).
**Hvorfor de overlapper:** Begge læser/skriver samme `fravaer`-node, men
kun den ene skærm har en fungerende skrivevej i dag.
**Risiko:** En bruger der kun kender kontorsiden, ville tro
fraværsregistrering slet ikke er bygget — den er, bare ikke fra den skærm
de kigger på. Godkendelsessiden (kontorets svar på en ansøgning) er
desuden ikke bygget nogen steder i de læste filer. (dossier 03, 11)

**Sted A:** Kunder.jsx's "Tilbud der kræver opfølgning"-kort (permanent
demo-data, `DEMO_TILBUD`).
**Sted B:** Booking → "Ny forespørgsel" (`/booking/ny`), som kortets
"Åbn"-knap logisk ville føre til.
**Hvorfor de overlapper:** Der findes ingen `tilbud`-node i datamodellen
endnu; workflowet ("se et tilbud der kræver opfølgning → book det")
stopper før det når det andet modul.
**Risiko:** Lav — knappen er tydeligt deaktiveret med forklaring, men er
den eneste komponent i sit dossiers scope der viser demo-data OGSÅ i en
produktions-forbundet tilstand, en afvigelse fra platformens ellers
konsekvente demo-data-disciplin. (dossier 09)

**Sted A:** `SUPPORT_KONTEKST`-allowlisten (Support-modulet, hvad der må
sendes ud af en tenant til en supportsag).
**Sted B:** `sager.js`s `parter[]`-mekanisme (Fleet/Facility, hvad der må
sendes til en ekstern part på en værksteds-/leverandørsag).
**Hvorfor de overlapper:** Begge er allowlister der løser samme
underliggende spørgsmål ("hvad må forlade tenanten ad en ekstern kanal"),
bygget helt uafhængigt af hinanden i to moduler.
**Risiko:** Lav i dag (ingen datadeling), men et eksempel på at samme
princip er implementeret to gange i stedet for ét sted. (dossier 10)

---

## Funktioner der måske burde være fælles platformfunktioner

**Sted A:** `Gitterkalender.jsx`.
**Sted B:** Bruges allerede af Fleets Driftskalender, Facilitys
Servicekalender, Disponering og Unitbookings Kalender.
**Hvorfor de overlapper:** Ressource×tid-planlægning er allerede bygget som
ÉN delt platformkomponent, nævnt gentagne gange på tværs af dossiererne som
det der forhindrer "to gitre der læser samme interval forskelligt".
**Risiko:** Ingen — bevidst design, medtaget som positivt eksempel på at
platformfunktionalitet allerede er samlet ét sted i dette tilfælde.
(dossier 02, 04, 05, 07)

**Sted A:** `tjekDisponering()`/`tjekKompetencer()`/`serviceTone()`.
**Sted B:** Bruges af Disponering, Fleet og Facility.
**Hvorfor de overlapper:** Endnu et eksempel på en reelt delt
platformfunktion (ét sted, flere forbrugere) frem for parallelle,
potentielt divergerende implementeringer.
**Risiko:** Ingen — bevidst design, positivt eksempel. (dossier 03, 04, 05)

**Sted A:** Kompetencekrav-logik (hvilke kompetencer en enhedstype
kræver, i Fleet).
**Sted B:** Kompetencedata (udløbsdatoer, beviser, i Bemanding).
**Hvorfor de overlapper:** To halvdele af samme spørgsmål ("må denne
medarbejder køre denne enhed") ligger i to moduler uden en delt node
mellem dem.
**Risiko:** Lav i dag (koblingen er logisk, ikke datamæssig, og håndhæves
korrekt server-side i `tjekDisponering()`), men et muligt kandidatområde
for en fælles "kompetencekrav"-platformfunktion frem for en logisk
sammenhæng vedligeholdt i to kildefiler. (dossier 04)

**Sted A:** `MOMSSATS` (FleetControls fakturering af vognmanden, i
Prisliste/Ejerkonsol).
**Sted B:** `MOMSSATS_SALG` (vognmandens fakturering af sin egen kunde, i
Fakturering/Økonomi).
**Hvorfor de overlapper:** To forskellige konstanter med næsten samme navn
og samme forretningsdomæne (moms), i hver sin fil.
**Risiko:** Dokumenteret som tidligere reelt forvekslet én gang
(beslutning 91) — samme klasse fejl som andre nær-identiske navne i
kodebasen. Ikke en aktiv fejl i dag, men en navngivningsrisiko. (dossier
10)

**Sted A:** `DEV_UDFYLD` i Login.jsx (forudfylder én seedet konto).
**Sted B:** `Brugervaelger.jsx` (skifter reel Firebase Auth-session mellem
seks seedede dev-roller) og demo-rollevælgeren i AppShell (kun
client-side visning, ingen tokenskift).
**Hvorfor de overlapper:** Tre mekanismer løser delvist overlappende
problemer ("vælg hvem jeg tester som i udvikling/demo") med meget
forskellig sikkerhedsbetydning.
**Risiko:** Lav — alle tre er dokumenteret i koden som bevidst adskilte
(beslutning 28), men en reviewer der kun ser én af de tre, kunne overse at
der findes to andre, mere vidtgående mekanismer et andet sted i
produktet. (dossier 09, 11)

---

## Optælling

**Total antal overlap-observationer i denne rapport: 51**

Fordelt på kategori:

| Kategori | Antal |
|---|---|
| Funktioner der findes flere steder | 12 |
| Sider med næsten samme formål | 10 |
| Widgets/tal der gentages unødigt | 10 |
| Administrative funktioner der ligger i arbejdsmoduler | 4 |
| Data der tilsyneladende bliver vedligeholdt flere steder | 5 |
| Workflows der hopper unødigt mellem moduler | 5 |
| Funktioner der måske burde være fælles platformfunktioner | 5 |
| **I alt** | **51** |

Fordelt på vurdering:

| Vurdering | Antal |
|---|---|
| Bevidst design, ikke en fejl (risiko vurderet "ingen"/lav og eksplicit dokumenteret som tilsigtet) | 19 |
| Mulig risiko (lav til middel, ikke eksplicit affærdiget som tilsigtet) | 32 |
| **I alt** | **51** |

Ingen af observationerne i denne rapport er opstået i selve
konsolideringsarbejdet — alle 51 stammer direkte fra de 11 dossiers egne
"Mulige overlap"-sektioner, "overlap-mistanke"-linjer eller
skærm-for-skærm "overlap med anden side"-felter. Hvor to dossiers
uafhængigt fandt samme sammenhæng, er de slået sammen til én post (mest
markant: Fakturacenter/Procure → Fakturaer i dossier 01+06, og
Driftskalender/Servicekalender-trekanten i dossier 02+04+05).
