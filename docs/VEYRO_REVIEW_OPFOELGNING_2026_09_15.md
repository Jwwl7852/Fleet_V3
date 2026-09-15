# VEYRO-review — opfølgning 15. september 2026

Dette dokument afstemmer `VEYRO-review-2026-09-15.md` mod den aktuelle kode.
Reviewet og den bevarede oprindelige instruks er kravgrundlag og bevismateriale;
de er ikke behandlet som selvstændige instruktioner, der kan udvide brugerens
aktuelle ordre.

## Version og afgrænsning

- Arbejdsmappe: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-integration`.
- Branch: `codex/veyro-integration-v1`.
- Reviewets rapporterede HEAD: `b9e6b7b76493331cc1d8222002b9c0e151b56edd`.
- Produktrettelser efter reviewet:
  - `c5bb8613aea6c5cc39221464b732ecda5622a082` — fælles enhedsregister mellem FLEET og PLANNING;
  - `c03f64c118688f0d9b9d05cdd65742568c604516` — komprimeret mobilchrome;
  - `ff8c03aabf62b827aae3afbc62d1465a8b73642d` — mere synligt arbejdsindhold på smal mobil;
  - `adc63b7dedc812011f2af25e813c59726629ec21` — Warehouse med normal titelkapitalisering.
- Endelig browserharness og browserkørsel: `adc63b7dedc812011f2af25e813c59726629ec21`.

Ingen ekstern tjeneste, produktionstilstand, deployment eller migration af
eksisterende brugerdata indgår.

## Afstemning af reviewfund

| Reviewfund | Resultat | Konkret bevis |
| --- | --- | --- |
| FL-05 var ikke et fælles autoritativt register | Enig på reviewets `b9e6b7b`; rettet | FLEETs aktive serveradapter læser og skriver nu `tenants/<tenant>/koeretoejer`; PLANNING projicerer samme poster. Browseren oprettede en syntetisk enhed i FLEET, fandt den i RTDB og viste den i PLANNING. Ingen IndexedDB-fallback anvendes ved aktiv serveradapter. |
| Mobilen brugte for meget plads før arbejdsindhold | Enig; rettet | Hovedindholdets top faldt fra reviewets ca. 340 px til 125 px på FLEET og 126 px i Fakturacenter ved både 390×844 og 360×800. Arbejdskøens nøgletal står 2×2 ved 360 px, så den første sag er synlig uden at fjerne TEST-mærkningen. Et 390×844-forløb åbnede og lukkede en filtreret sag og vendte tilbage med filter og sag bevaret. |
| UX-04 manglede handlingsbevis | Enig; bevis tilføjet | Mus: ikon→undermenu forblev åben. Tastatur: fokus åbnede, Tab ramte `Overblik`, ESC lukkede med fokusretur. Touch åbnede, tryk udenfor lukkede. |
| FL-09 manglede faktisk træk | Enig; bevis tilføjet | Træk i header ved 1920×1080 flyttede dialogen 100 px og holdt hele dialogen inden for rammen. Ved 390×844 var den fuldskærm med intern scroll. |
| FC-05 manglede målrettede match-/modulfiltre | Enig; bevis tilføjet | `Matchet` gav fire poster; `Flere moduler` gav kun `FC-FILTER-FLERE`; `Mangler match` gav kun `FC-MASSE-MANGLER-GRUNDLAG`. |
| FC-07 manglede panelpersistence | Enig; bevis tilføjet | Separatorens ArrowRight ændrede 22→23 %, skrev versionssat layout i `localStorage`, og reload viste fortsat 23 %. |
| FL-12 manglede leverandørretur | Enig; bevis tilføjet | Syntetisk værksted blev oprettet gennem fælles leverandørregister, valgt ved retur, og arbejdsbeskrivelse/mailtekst var uændrede. |
| Ekstern OBD/GPS skulle ikke blokere modulreview | Enig; status præciseret | FL-04/16 står fortsat delvise, men den eksterne del er `udskudt efter aftale`. Kollegaens separate OBD-projekt er ikke integreret. Syntetiske interne data er tydeligt mærkede. |
| `WAREHOUSE` brød sidebjælkens navngivning | Enig; rettet efter visuel feedback | Sidebjælkens aktive navigationsmetadata viser nu `Warehouse`, mens interne domænenavne og skærmtitler er uberørte. Den målrettede menutest og det integrerede screenshot `29-sidebar-warehouse-1440x900.png` dokumenterer resultatet. |

To fejl under udvikling af browserharnessen var ikke produktfejl:

- Efter ESC havde Fleet-knappen allerede fokus; et nyt programmatisk `.focus()`
  udløser korrekt ingen ny fokusbegivenhed. Prøven flytter nu fokus væk og
  tilbage, før genåbning kontrolleres.
- Leverandørprøvens generelle `querySelector('select')` ramte AppShells
  rolle-/bruger-vælger. Afgrænsning til `.assignment-page select` viste, at
  leverandørvalget og begge kladdefelter var korrekte.

## FL-05 — nuværende acceptgrundlag

FL-05 blev først behandlet som delvist, i overensstemmelse med reviewet. Det er
først markeret implementeret igen efter følgende sammenhængende bevis:

1. `mapSharedUnitToFleet` og `mapFleetUnitToShared` dækker den fælles ID- og
   feltkontrakt, inklusive `fleetProfil`.
2. FLEETs gemmevej kalder den eksisterende autoriserede RTDB-skriveadapter og
   genindlæser serverlisten; den gemmer ikke en skjult lokal kopi.
3. Rules validerer tenant, skrivepermission og den indlejrede profil, herunder
   de fire separate udstyrsbooleans.
4. En browseroprettet enhed blev læst direkte fra emulatorstien og derefter
   vist af PLANNING fra samme serverkilde.

Permanent billedupload er fortsat en afgrænset Storage-rest og beskrives ikke
som færdig. Den gør ikke den fælles tekst-/stamdatakilde lokal igen.

## Kontrolsumafvigelsen for Livekort

Den oprindelige kildefil og filen inde i den oprindelige ZIP er byteidentiske:

- sti: `artifacts/veyro-rettelsesrunde-2026-09-15/browser/07-livekort-1920x1080.png`;
- længde: `1.094.052` bytes;
- SHA-256 for kildefilen: `a66ccba09be51f6e31e5a2687803bfa66e06a75ae609aac5ccfcc7b04b9d41bf`;
- SHA-256 for ZIP-entry: `a66ccba09be51f6e31e5a2687803bfa66e06a75ae609aac5ccfcc7b04b9d41bf`;
- reviewets hash for den separat uploadede fil: `ab096203714f44d14ccc2a3df03122a13bb83bf3ef3e8aab44ed5d7c3fe627d5`.

Afvigelsen er dermed ikke i repositoryets original eller i den afleverede ZIP.
Den uploadede enkeltfil er andre bytes, sandsynligvis erstattet eller
genkodet under udpakning/overførsel; uden den konkrete uploadfil kan den sidste
mekanisme ikke fastslås. Den nye pakke indeholder originalfilen, ny manifesthash
og et nyt aktuelt Livekort-billede med separat navn og hash.

## De 13 fortsat delvise krav

| ID | Fungerer nu | Konkret rest | Påvirker nuværende visuelle/funktionelle review? | Art |
| --- | --- | --- | --- | --- |
| UX-07 | FLEET-dialoger har ESC/X/Annuller, dirty-værn og fokusretur | Resterende root-/ikke-FLEET-dialogaudit samt browserbevis for reelle save-/delete-fejl | Ja, for de ikke reviderede dialoger; de viste FLEET-forløb kan vurderes | Intern UI/backend |
| FC-06 | Lokal intake viser filstatus, SHA-256-dublet og genforsøg | Permanent autoriseret upload, pipeline, revision/idempotens og kvittering | Nej for den viste prototype; ja for endelig intakeaccept | Senere backend |
| FL-02 | Periodevisninger og akser virker på syntetisk historik | Autoritativ produktionshistorik og databåret browserbevis | Nej for layoutreview | Senere backend/data |
| FL-03 | Månedsskift, nedetid og sidste år beregnes lokalt | Autoritativ status-/omkostningshistorik | Nej for layoutreview | Senere backend/data |
| FL-04 | Livekort, popup, valg og profilretur virker med tydelig fixture | Rigtig GPS/OBD-kilde | Nej; ekstern del er udskudt efter aftale | Ekstern, udskudt |
| FL-13 | Servicefelter, næste grænse og serverkrav findes | Service-/PLANNING-adapter, udførelsesmutation og syntetisk migrationstest | Delvist for end-to-end service, ikke for den viste formular | Senere backend |
| FL-14 | Servercyklus, idempotens og samtidighed er implementeret | Autoriserede sagsmutationer og syntetisk migrationsforløb | Nej for visuelt review | Senere backend |
| FL-15 | Kategoristamdata er serverstyret | Serverhåndhævelse hos forbrugende indberetnings-/økonomiposter | Nej for stamdata-UI; ja for endelig dataintegritet | Senere backend |
| FL-16 | Statistik håndterer manglende OBD og syntetiske målinger | Valideret ekstern OBD-kilde | Nej; ekstern del er udskudt efter aftale | Ekstern, udskudt |
| FL-17 | Økonomi adskiller status/kilder og håndterer dubletter/kreditfortegn | Fakturacenter-/bogføringsadapter, serveraudit og livscyklus | Nej for layoutreview; ja for endelig økonomifunktion | Senere backend/ekstern |
| FL-18 | Dansk eksport med BOM, decimal og eksplicit netto/moms/brutto | Autoritativ momskilde og manuel Microsoft Excel-kontrol | Nej for layoutreview | Data/ekstern manuel test |
| REG-01 | Aktuel sikkerhedsgate er 4.629/4.629 | Nye resterende serverfunktioner skal have egne grønne gates | Nej på aktuelt grundlag | Fremtidig gate |
| REG-02 | Aktuelle kontrakter og integrerede browserforløb er grønne | Slutregression efter de resterende adaptere | Nej på aktuelt grundlag | Fremtidig gate |

Den samlede status er fortsat **23 implementerede og 13 delvise**. Tallet er
ikke gjort grønnere ved at fjerne eksterne eller obligatoriske backenddele.
Den endelige visuelle godkendelse afventer brugerens gennemgang af den nye
aflevering.
