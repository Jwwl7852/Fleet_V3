# Planning Basic etape 2 – faste ruter og fremdriftsgrundlag

## Formål og grænse

Etape 2 udvider den rene Planning Basic-kerne med ruteskabeloner, deterministisk tidsberegning og provider-neutrale hændelsesformater. Laget har ingen Firebase-, React-, kort-, mobil- eller OBD-integration og etablerer ingen skrivevej. Fleet og Workforce ejer fortsat deres stamdata; Planning anvender typed references og allerede normaliserede providersnapshots.

Den oprindelige produktspecifikation `Planning_Basic_Produktspecifikation_v1.0.md` er uændret og byte-identisk med det godkendte produktgrundlag.

## Faste ruteskabeloner

En `ruteskabelon` er et Planning-ejet, provider-neutralt objekt med stabil reference, navn, valgfri rutetype, status, gyldighed, gentagelse, start- og slutlokation, ordnede stop, pauser, standardkrav, standardtildelinger, samlet estimat og positiv version.

Et skabelonstop har stabilt id, målreference, lokationsreference, rækkefølge, estimeret varighed, præcis én af de fire tidsformer, krav, afhængigheder og aktiv/inaktiv status. Afhængigheder peger på stabile skabelonstop-id'er; ukendte referencer, selvreferencer og tidslige cyklusser afvises. Ved materialisering omsættes referencen til dagsrutens stopforekomst-id. Rene operationer kan tilføje, fjerne, deaktivere, flytte og ændre varigheden af stop. Hver operation returnerer en ny skabelonversion og muterer ikke inputtet. Deaktivering bevarer stoppet i skabelonhistorikken; fysisk fjernelse forudsætter, at den tidligere version fortsat opbevares af et senere persistenslag.

Når en dagsrute oprettes, kopieres hele den anvendte skabelon ind i `skabelonBinding.snapshot`, og reference og version bindes eksplicit. Kun aktive stop materialiseres som stopforekomster. Efterfølgende ændring af skabelonen påvirker derfor ikke eksisterende dagsruter. Et senere persistenslag skal lagre dagsrute og snapshot atomisk; dette lag findes ikke i etape 2.

## Standardressourcer

Medarbejder og køretøj konfigureres uafhængigt med:

- `INGEN`: ingen standardreference; en konkret dagsrute må stadig tildeles en ressource.
- `FORETRUKKET`: standardreferencen anvendes som forslag og kan erstattes. Afvigelse markeres som en ikke-blokerende præference.
- `FAST`: standardreferencen skal være med på dagsruten og giver ellers et hårdt fund.

En fast reference tilsidesætter aldrig øvrige regler. Kompetence, certifikatudløb, vagt, fravær, køretøjstype, fysisk kapacitet og udstyr kontrolleres fortsat mod de normaliserede Fleet-/Workforce-/Planning-ressourcer. Køretøj er ikke generelt obligatorisk; kun et konkret krav kan gøre det nødvendigt.

## Rutetidsberegning

`beregnRutetid` modtager en dagsrute og eksplicitte køretidssegmenter. Segment-id'erne dækker:

1. Startsted til første stop.
2. Hvert par af efterfølgende stop.
3. Sidste stop til slutsted.

Der integreres ingen vejdatatjeneste. En senere provider må levere minutværdierne, men kernen kender ikke leverandøren. Beregningen lægger køretid, stopvarighed, pauser og nødvendig ventetid før fast tid eller tidsvindue sammen. Resultatet indeholder start, ankomst, servicestart og afgang pr. stop, sluttid og summer for kørsel, stop, pause, ventetid og hele ruten.

Manglende køretid eller stopvarighed gættes aldrig. Resultatet bliver `komplet: false`, den ukendte sluttid er `null`, og `mangler` samt stabile årsagskoder identificerer de konkrete segmenter eller stop. Tidsvindue-, deadline- og arbejdstidsbrud returneres som domænefund.

## Mobilregistrering

Et mobilevent dokumenterer en medarbejders arbejdshandling: `ANKOMMET` eller `AFGAAET`. Kontrakten indeholder event-id, tenant, dagsrute, stopforekomst, medarbejderreference, mobil- og modtagelsestid, position, valgfri GPS-nøjagtighed, kilden `MOBIL` og offline-/forsinkelsesmarkering.

Events deduplikeres idempotent efter id og indhold. Forskelligt indhold under samme id afvises. Events ordnes efter mobilens tidspunkt, så senere modtagelse ikke ændrer arbejdsforløbet. Ukendt tenant, rute, stop eller medarbejder, ugyldig position, urealistisk tidspunkt og afgang uden en tidligere gyldig ankomst returnerer konkrete fund. Rå hændelser slettes eller overskrives ikke af domænelaget.

## Fremdrift med og uden OBD

Planning fungerer fuldt uden OBD: ruten kan oprettes, tildeles, tidsberegnes og modtage mobilevents. Manglende OBD er ikke en valideringsfejl.

Fremdriften opdeles i tre selvstændige udsagn:

| Udsagn | Dokumentation | Kvalitet |
| --- | --- | --- |
| Arbejdsstatus | Seneste gyldige mobilevent | `BEKRAEFTET_MOBIL`, `FORAELDET` eller `UKENDT` |
| Fysisk position | Seneste frisk OBD-observation, ellers mobilens senest bekræftede position | `LIVE_OBD`, `BEKRAEFTET_MOBIL`, `FORAELDET` eller `UKENDT` |
| Forventet fremdrift | Tidsplan, aktuelt eksplicit tidspunkt og seneste mobilbekræftelse | Altid `ESTIMERET` |

Et estimat indeholder beregningsbasis og seneste bekræftelsestidspunkt og markeres eksplicit med `erLivePosition: false`. Afvigelsen mellem seneste mobilevent og det tilsvarende planlagte ankomst- eller afgangstidspunkt forskyder deterministisk den resterende tidsplan. Det må ikke vises som faktisk position.

OBD-formatet indeholder observationens id, tenant, køretøjsreference, valgfri dagsrute, observations- og modtagelsestid, position, valgfri hastighed og nøjagtighed samt kilden `OBD`. En optional normaliseret fremdriftsmarkør kan knytte leverandørens allerede fortolkede observation til et stop; Planning udfører ikke selv map matching.

## Adskilte spor og uoverensstemmelser

Mobilstatus dokumenterer en arbejdshandling. OBD dokumenterer køretøjets position og bevægelse. `sammenholdMobilOgObd` returnerer begge originale seneste objekter, tidsforskellen, de to kildeansvar og eventuelle uoverensstemmelser. Ingen kilde muterer den anden.

Etape 2 kan markere:

- Mobilankomst, mens OBD-positionen er uden for stopzonen.
- Mobilafgang, mens OBD-positionen fortsat er i stopzonen.
- OBD-bevægelse, mens mobilstatus er ankommet.
- Mobilregistrering nyere end OBD.
- Forældet eller manglende OBD.

Stopzoner og OBD-fremdriftsmarkører er providerinput. Kernen foretager kun en deterministisk afstandskontrol på allerede leverede syntetiske koordinater.

## Afvigelsesregler

Kunden kan vælge `FAELLES`, som anvender én regel på alle ruter, eller `PR_RUTETYPE`, som kræver en navngiven regel for hver anvendt rutetype. Hver regel har stabilt id, advarselsgrænse og kritisk grænse i minutter, hvor den kritiske grænse mindst svarer til advarselsgrænsen.

Afvigelsen sammenligner en faktisk mobilhændelse eller en normaliseret OBD-fremdriftsmarkør med stopplanen. Uden faktisk observation kan et eksplicit eksternt estimat anvendes, men resultatet bliver `ESTIMERET` og ikke bekræftet. Resultatet angiver minutter, stop/eventtype, niveau, datakilde, kvalitet, regel-id og forventet forskydning af efterfølgende stop.

## Redigerbare løsningsforslag

Etape 2 definerer kun kontrakten for et fremtidigt løsningsforslag: udløsende afvigelse, berørt rute og stop, foreslåede ændringer, ændrede tider, ændret kørsel, berørte ressourcer, regelbrud og livscyklusstatus. Forslaget er redigerbart og kræver eksplicit disponentgodkendelse. Et ikke-godkendt forslag må ikke markeres frigivet.

Der genereres ingen løsning. Demoen indeholder ét håndskrevet, deterministisk syntetisk forslag alene for at prøve kontrakten.

## Udskudt

- React-skærme, navigation, dashboard, kalender og mobilapp.
- Baggrundssporing og GPS-tilladelser.
- OBD-leverandør, kort, geokodning, map matching og vejbaseret køretid.
- Solver, heuristik, automatisk omplanlægning og automatisk frigivelse.
- Firebase, permissions, Database Rules, audittransport og persistence.
- Serverautoriseret idempotens, atomisk versionskontrol og endelig stopzonepolitik.

## Åbne beslutninger

- Om tidlig ankomst skal tælle som ventetid, pause eller en separat driftskategori i rapportering.
- Hvem der ejer stopzoner og normaliserede OBD-fremdriftsmarkører.
- Hvor længe mobil- og OBD-data er friske pr. rutetype.
- Om fysisk fjernelse af stop må anvendes efter en skabelon har været i drift.
- Hvilke faste tildelinger der senere kan omfattes af en kontrolleret undtagelse.
- Serverkontrakten for tenantautorisation, idempotens, godkendelse og atomisk frigivelse.
