# Veyro-rettelsesrunde — efterprøvbar kravstatus 15. september 2026

Denne matrix bevarer de oprindelige 36 ID'er og kravtitler fra 14. september-
PDF'en og den oprindelige audit. `Implementeret` betyder, at kravet er til
stede inden for den angivne produktgrænse; det betyder ikke, at lokal
prototypedata er blevet autoritativ serverfunktionalitet. Obligatorisk
manglende backend-, datakilde- eller integrationsbevis fastholder kravet som
`Delvist`.

Aktuel vurdering: **23 implementerede, 13 delvise, 0 ikke implementerede og 0
blokerede**.

Fælles slutgrundlag, hvor det er anført som `slutgate`: produktcommits
`97858a5fc9375af5eb6256beb6a9ecb2b868655d`,
`167d93706891543beb8a4d627b80e0632be2d3d7`,
`c14e52dcb62549fba841468711a09dc539d11d34`,
`c5bb8613aea6c5cc39221464b732ecda5622a082`,
`c03f64c118688f0d9b9d05cdd65742568c604516`,
`ff8c03aabf62b827aae3afbc62d1465a8b73642d` og
`adc63b7dedc812011f2af25e813c59726629ec21`. Det endelige browserbevis er
kørt på dette samlede grundlag. Root-lint, FLEET-lint,
designgate 11/11, FLEET 206/206, functions-paritet 29/29, root- og FLEET-build,
Rules-/platformsgate 4.629/4.629 og den integrerede browser-QA beskrevet i
`docs/VEYRO_FLEET_NAVIGATION_QA_2026_09_15.md`.

| Oprindeligt krav og reference | Status | Implementering | Faktisk UI-/browserbevis | Datakilde og backend | Adgang/tenant | Testgrundlag og commit | Præcist restarbejde/afhængighed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UX-01 Zoom, hukommelse og nulstilling — 14-9-PDF/audit UX-01 | Implementeret | Arbejdsområdezoom, kontekstafgrænset huskning og Nulstil visning findes. | Integreret 100→105→110 %; sidebar/topbjælke uændret; 100/125 % indgår i alle 160 layoutkombinationer. | Lokal bruger-, tenant- og skærmpræference; ingen forretningsdata. | Normal adminsession i `procure-auth-a`. | Slutgate; `97858a5`. | Ingen særskilt mangel. |
| UX-02 Stabil sidebar/skjult scrollbar — PDF/audit UX-02 | Implementeret | Shell og indhold zoomer separat; skjult scrollbar giver ikke teksthop. | Integreret desktop og mobil; 40/40 route-/viewport- og 160/160 layoutkombinationer uden vandret dokumentscroll. | CSS/shell, ingen serverdata. | Tilladt, afvist og anonym session prøvet. | Slutgate; `97858a5`. | Ingen særskilt mangel. |
| UX-03 Hele moduloverskriften folder — PDF/audit UX-03 | Implementeret | Moduloverskrift og undernavigation har eksisterende tastatursemantik. | Aktiv FLEET- og økonomiundermenu prøvet i integreret shell. | Ingen backend. | Tenant-/modulmenu styret af normale claims. | Slutgate; historisk implementation bevaret. | Ingen særskilt mangel. |
| UX-04 Kompakt flyout, hover/tastatur/touch — PDF/audit UX-04 | Implementeret | Normal/kompakt menu, hover/fokus/touch/ESC og tilgængelige labels findes. | Mus blev flyttet fra Fleet-ikon til undermenu uden lukning; fokus+Tab valgte underpunkt; ESC lukkede med fokusretur; touch åbnede og tryk udenfor lukkede. Fligen er centreret, og normal/kompakt indgår i 160 layoutkombinationer. | Bruger-/tenantafgrænset visningspræference. | Adminsession; kun tilladte underpunkter; ingen adgangsbypass. | Browser-QA `3120eaca`; slutgate. | Ingen særskilt mangel. |
| UX-05 Afrundet flig variant B — PDF/audit UX-05 | Implementeret | Godkendt flig, klikmål og aria-label er bevaret. | Integreret geometri verificeret ved 1440×900. | Ingen backend. | Ikke adgangsbærende. | Slutgate. | Ingen særskilt mangel. |
| UX-06 Tilbage-navigation med bevaret tilstand — PDF/audit UX-06 | Implementeret | Intern historik gemmer route, relevante filtre, valg og scroll; direkte URL får sikker fallback. | Arbejdskøfilter/tabel/valg/212 px, indberetningsfilter, enhedsfilter efter reload og Livekortvalg bevaret; direkte sagsroute → `/fleet-v2/arbejdsko`. | Serialiserbar browserhistorik og kontekstafgrænsede lokale visninger. | Normal adminsession; anonym direkte URL → login. | Navigationcommit `37c618d6079a9485c9f3e4ddd6bb2d52b2e1d8bd`; slutrettelse `97858a5`; 206/206. | Ingen særskilt mangel. |
| UX-07 Fælles dialogregler — PDF/audit UX-07 | Delvist | 11 FLEET-dialogejere bruger fælles fokusfælde, ESC/X/Annuller, busy-værn, fokusretur og ens dirty-bekræftelse; eksplicit Gem bekræftes. | Dirty manuel sag: ESC bevarer dialog/input efter afvisning; bekræftet X lukker; fokus returneres. | UI-kontrakt; domænemutationens backend varierer pr. dialog. | Prøvet som tilladt tenantbruger. | Nye dialogtests 3/3, FLEET 206/206; `97858a5`. | Auditér resterende relevante root-/ikke-FLEET-dialoger og browserprøv reelle save-/delete-fejl. |
| FC-01 Indbakke/betinget Ekstra kontrol/Arkiv — PDF/audit FC-01 | Implementeret | Tre lister og kompatible routes findes; Ekstra kontrol er konfigurationsstyret. | Integreret Indbakke, aktiv Ekstra kontrol og Arkiv med serverposter. | Serveropsætning og serverliste; ingen lokal fallback i integreret tilstand. | Normale admin- og godkendersessioner i samme tenant. | Slutgate; Fakturacenter-kontrakter. | Ingen særskilt mangel. |
| FC-02 Bliv i Indbakke efter kontrol — PDF/audit FC-02 | Implementeret | Enkeltkontrol bliver i Indbakke og vælger næste ved bekræftet succes; fejl bevarer posten. | `FC-ENKELT-OVER` blev kontrolleret, flyttet til Ekstra kontrol og efterlod brugeren i Indbakke. | Server-callable og revision; lokal demo er tydeligt særskilt. | `fakturaer.godkend` håndhævet i normal session. | Slutgate; browser-QA. | Ingen særskilt mangel. |
| FC-03 Ekstra kontrol, nettogrænse og anden person — PDF/audit FC-03 | Implementeret | Nettobeløb ekskl. moms, anden godkender, allowlist, revision og audit er implementeret. | Admins egen ekstra godkendelse blev afvist; særskilt normal godkendersession arkiverede. 90.000 netto/112.500 brutto lå under 100.000-nettogrænsen. | Autoritative callables/serverlagring; betalingsstatus forblev `modtaget`; ingen fallback. | Tenant, abonnement, permission, udpegning og anden-person-regel browser- og emulatorprøvet. | 21/21 callable-assertions, browser-QA; `5b89deda`, `c14e52dc`. | Ingen særskilt mangel. |
| FC-04 Massekontrol med alle gates — PDF/audit FC-04 | Implementeret | Filtreret omfang, én bekræftelse, revision, idempotens og synligt delsvar findes. | Tre serverposter gav 2 gennemførte/1 blokeret; UI viste konkret udfald og begrundelse pr. faktura. | Server-callable validerede hver post; over grænse → Ekstra kontrol, under → Arkiv, manglende grundlag → Indbakke. | Normal adminsessions permission/tenant; negative revision/idempotenscases i emulatorgaten. | Fakturacenter 100/100 målrettet, 21/21 callable-assertions, browser-QA; `c14e52dc`. | Ingen særskilt mangel. |
| FC-05 Match- og modulfilter — PDF/audit FC-05 | Implementeret | Match/modulfilter og fast nyeste-rækkefølge findes. | I integreret root-app gav `Matchet` fire serverposter, `Flere moduler` kun `FC-FILTER-FLERE`, og `Mangler match` kun `FC-MASSE-MANGLER-GRUNDLAG`. | Readmodel over serverposter i RTDB-emulator. | Tenantafgrænset læsning i normal session. | Browser-QA `3120eaca`; slutgate. | Ingen særskilt mangel. |
| FC-06 Uploadstatus, dublet og genforsøg — PDF/audit FC-06 | Delvist | Filnavn, lokal status, SHA-256-dubletværn og genforsøg findes kun i mærket demo. | Ikke påstået som integreret serverupload. | Permanent modtagelse, pipeline og kvittering findes ikke. | Ingen serverupload-gate at verificere. | Lokale intake-tests + slutgate. | Autoriseret permanent upload, pipeline, revision/idempotens, kvittering og emulatorbevis. |
| FC-07 Tre paneler, scroll, justering/hukommelse — PDF/audit FC-07 | Implementeret | Tre uafhængigt scrollende paneler, splittere, minimumsbredder og kontekstlagring. | Separatorens ArrowRight ændrede listebredden 22→23 %, skrev layoutet og genindlæste samme 23 %; integreret ved fire viewports uden vandret dokumentscroll. | `localStorage`-visningspræference, ikke forretningsgem. | Tenant-/bruger-/skærmscope. | Browser-QA `3120eaca`; slutgate. | Ingen særskilt mangel. |
| FC-08 Mail til fælles Opsætning — PDF/audit FC-08 | Implementeret | Mail/forbindelser ligger under fælles Opsætning. | Fælles root-navigation bevaret. | Ekstern mail deaktiveret. | Opsætning følger normal adgang. | Slutgate. | Ekstern aktivering kræver særskilt tilladelse. |
| FL-01 Klikbare KPI'er og handlingsliste — PDF/audit FL-01 | Implementeret | KPI'er og handlingsliste åbner relevante filtre og forklarer udsnit. | Integreret overblik ved fire viewports. | Lokal FLEET-readmodel med syntetiske fixtures. | Root-moduladgang verificeret. | Slutgate. | Produktionskilde dækkes af de underliggende datakrav. |
| FL-02 Dag/uge/måned/kvartal/år — PDF/audit FL-02 | Delvist | Perioder, akser og daterede observationer er implementeret. | Overblik renderet; fuldt periodeklikforløb ikke genprøvet i browser. | Kun lokal/syntetisk historik. | Lokal fixture er tenant-/databasescope, ikke serverautoritet. | Domænetests + slutgate. | Autoritativ produktionshistorik og databåret browserbevis. |
| FL-03 Månedsskift/nedetid/sidste år — PDF/audit FL-03 | Delvist | Månedsskift, manglende data, nedetid og sidste år beregnes fra registrerede poster. | Overblik bevist; komplet periodeforløb ikke browserprøvet. | Lokal repository/readmodel. | Ingen ny serveradgang. | Domænetests + slutgate. | Autoritativ status-/omkostningshistorik og integreret databåret bevis. |
| FL-04 Livekort — PDF/audit FL-04 | Delvist | Wheel/+/-zoom, klynger, enkeltvalg, popup og profilretur findes; valg bevares. | Integreret popup, profilretur og fire viewports; 0 runtimeproblemer. | Tydeligt syntetisk `fleet-v2-demo-fixture`; ingen ekstern GPS/OBD. | FLEET-moduladgang håndhævet. | Popupcommit `a04166af8172b457957f625c931dc3b60d7b8127`; browser-QA `3120eaca`; 206/206. | **Ekstern GPS/OBD er udskudt efter aftale** og er ikke en blokering for nuværende modulreview. Kravet er fortsat delvist og ikke gennemført. |
| FL-05 Fælles autoritativt enhedsregister — PDF/audit FL-05 | Implementeret | FLEET og PLANNING bruger nu samme `koeretoejer`-post. FLEET mapper hele profilen til/fra den fælles post og må ikke falde tilbage til IndexedDB, når serveradapteren er aktiv. | En syntetisk enhed blev oprettet gennem FLEET-formularen, fundet under `tenants/procure-auth-a/koeretoejer/<id>` og derefter vist i PLANNINGs Ressourcer i samme autentificerede session. | Autoritativ læse-/skrivekilde: RTDB-emulatorens fælles enhedsregister; PLANNING læser samme post. Lokale sager er fortsat tydeligt separat prototype. | Rules validerer tenant, permission og `fleetProfil`; FLEET-modul og normal login bevist. | `c5bb8613`; adaptertests 16/16; Rules 4.629/4.629; browser-QA `3120eaca`. | Permanent billedupload afventer Storage-kontrakt, men er ikke del af registerets nu verificerede fælles tekst-/stamdatakilde. |
| FL-06 Enhedsfelter — PDF/audit FL-06 | Implementeret | Indvendige mål, energikilde og fire separate valg: trækkrog, hængertræk, kran og lift. | Formularen blev udfyldt i den integrerede app; den nye enhed blev gemt og genfundet i PLANNING. | Felterne ligger i autoritativ `koeretoejer/<id>/fleetProfil` i RTDB-emulator; billed-Blob skrives ikke skjult lokalt. | Tilladt bruger; Rules afviser ukendte/ugyldige profilfelter. | `c5bb8613`; adapter-/Rules-tests; browser-QA `3120eaca`. | Permanent billedlager/Storage-kvittering er en afgrænset rest og må ikke påstås færdig. |
| FL-07 Indberetninger i tre paneler — PDF/audit FL-07 | Implementeret | Tre paneler, resize, minimumsbredder, huskning, scroll og semantik. | Integreret ved fire viewports; filterretur bevist. | Lokal FLEET-repository. | Root-moduladgang bevist. | Slutgate; `97858a5`. | Serverpersistens er ikke påstået. |
| FL-08 Manuel sag — PDF/audit FL-08 | Implementeret | Validering og inputbevaring ved lagringsfejl; dialogen følger nu fælles lukkeværn. | Dirty ESC/X/fokusretur integreret bevist. | Lokal prototypemutation. | Tilladt tenantbruger. | Dialogtests + slutgate; `97858a5`. | Eventuel serverlagring hører under fremtidig sagsadapter. |
| FL-09 Arbejdskødialoger/drag — PDF/audit FL-09 | Implementeret | Flytbar detaljedialog, genbrugt sagsmappe og mobil fuldskærm. | Ved 1920×1080 flyttede fysisk musetræk dialogen 100 px og beholdt den inden for arbejdsfladen; ved 390×844 var den 390×844 med intern auto-scroll. | Lokal repository/route. | Root-moduladgang bevist. | FLEET 206/206 + browser-QA `3120eaca`; `97858a5`. | Autoritativ mutation er ikke påstået. |
| FL-10 Godkendt sagsmappedesign — PDF-referencebillede/audit FL-10 | Implementeret | De syv gamle faner er fjernet; problem/næste handling, sagsarbejde, historik og infokolonne bevares. | Integreret: 0 faner, krævede sektioner og to kolonner; desktop og mobil screenshots. | Lokal sagsprototype; status-/fakturaafklaring vises uden opdigtet serverdata. | Moduladgang og direkte-URL-login bevist. | Slutgate; `97858a5`. | Autoritative mutationer følger FL-14/17. |
| FL-11 Kompakt arbejdskø — PDF/audit FL-11 | Implementeret | Ingen permanent Flyt sag på kort; lovlige statusveje bevares. | Integreret arbejdskø og returstate bevist. | Lokal prototype. | Tilladt session. | Slutgate. | Autoritativ sagsmutation følger FL-14. |
| FL-12 Fælles leverandører/værksteder — PDF/audit FL-12 | Implementeret | Fælles register læses uden lokal stamdatakopi; opret-og-vælg returnerer sikkert. | Fra sagsbestilling blev en syntetisk værkstedsleverandør oprettet i fælles register; retur valgte leverandøren og bevarede arbejdsbeskrivelse og mailtekst byte-for-byte. | Tenantafgrænset RTDB-register; sagskladde midlertidigt i tenant-/sagsscopet `sessionStorage`. | `leverandoerer.skriv` og sikker retursti anvendt; normal adminsession. | Browser-QA `3120eaca`; tidligere adapter-/Rules-tests + slutgate. | Ingen ekstern portalaktivering. |
| FL-13 Servicefelter og beregning — PDF/audit FL-13 | Delvist | Dato/km/timer, varsler, faste hændelser og forklarlig næste grænse findes. | Integreret ved alle fire viewports; den tomme serverprojektion afslutter nu loading korrekt. | Krav gemmes på server; historisk service og planlægning mangler adapter. | Servergrænsen har tenant-/permissiontests. | Serviceflow + slutgate; `167d9370` dækker alle seks serverprojektioners loading/fejl. | Service-/planlægningsadapter, udførelsesmutation og syntetisk migrationsforløb. |
| FL-14 Automatisk én indberetning pr. cyklus — PDF/audit FL-14 | Delvist | Cyklus, idempotens, samtidighed, gennemførsel og kontrolleret ændring/deaktivering findes servermæssigt. | Integreret Service-readmodel ved fire viewports; ingen automatisk handling fremprovokeret i browseren. | Scheduler/callables/transaktioner er serverstyrede; læseprojektion skrivebeskyttet. | Tenant, FLEET-modul og `koeretoejer.skriv` emulatorprøvet. | 17 rene adaptertests, serviceflow og slutgate. | Autoriserede sagsmutationer samt syntetisk, ikke-produktiv migration af lokale poster. |
| FL-15 Kundestyrede kategorier — PDF/audit FL-15 | Delvist | Tenantstamdata, mapping, sortering, deaktivering og snapshots findes. | Integreret kategoriskærm ved alle fire viewports. | Stamdata serverstyret; forbrugende FLEET-poster fortsat lokale. | Tenant-/permissiongrænse testet for stamdata. | Kategori-/Rules-kontrakter + slutgate. | Serverhåndhævelse for indberetnings- og økonomiposter samt migrationsfixture. |
| FL-16 OBD-statistik — PDF/audit FL-16 | Delvist | UI viser/filtrerer/eksporterer kun tilgængelige målinger og forklarer manglende forbindelse. | Integreret statistik ved fire viewports viser eksplicit, at OBD ikke er tilsluttet; Livekort viser syntetisk kilde. | Ingen valideret OBD-kilde. Kollegaens separate OBD-testprojekt er ikke og skal ikke integreres i VEYRO. | Root-moduladgang findes; ingen ekstern credential. | Statistiktests + browser-QA `3120eaca`. | **Ekstern OBD/GPS-integration er udskudt efter aftale**. Intern syntetisk funktionalitet kan fortsat prøves, men opfylder ikke den eksterne del. |
| FL-17 Samlet økonomi — PDF/audit FL-17 | Delvist | Status/kilder adskilles; kontraktperioder materialiseres, dubletter fjernes og kreditfortegn bevares. | Integreret økonomi ved alle fire viewports viser tydeligt lokalt prototyperegister. | Lokal IndexedDB; ingen Fakturacenter-/bogføringsadapter. | Ingen servermutation at autorisere endnu. | Økonomitests + slutgate. | Autoritativ adapter, serveraudit/mutation og fuld livscyklus; rigtig bogføring kræver ekstern aftale. |
| FL-18 Dansk eksport — PDF/audit FL-18 | Delvist | UTF-8 BOM, dansk decimal, sporbarhed og eksplicit netto/moms/brutto uden antaget sats. | Excel-kompatibel projektmappe visuelt kontrolleret; ikke Microsoft Excel. | Lokal filgenerering; produktionskilden leverer ikke altid eksplicit moms. | Ingen servermutation. | Eksportcommit `3e07c85ee047243fa35fe12d43d827292269614a`; slutgate. | Manuel åbning i Microsoft Excel og autoritativt momsbeløb fra produktionskilden. |
| REG-01 Rules-/sikkerhedsgate — PDF/audit REG-01 | Delvist | Relevante Rules/Functions-kontrakter dækker tenant, rolle, revision, samtidighed, idempotens og det nye fælles `fleetProfil`. | Ikke et UI-krav. | Isolerede RTDB/Storage-emulatorer; ingen ekstern service. | Negative og positive adgangstests kørt; 0 sprunget over. | Slutgate 4.629/4.629 efter `c5bb8613`. | Nye serverfunktioner for de resterende krav skal have egne grønne emulatorbeviser. |
| REG-02 Samlet tværmodulregression — PDF/audit REG-02 | Delvist | Aktuelle fælles kontrakter og root-moduler består slutgaten. | Integreret FLEET/Fakturacenter/PLANNING, adgang, handlinger, 40 viewport- og 160 layoutkombinationer bevist. | Nuværende serverkontrakter grønne; fremtidige adaptere mangler. | Anonym, uden FLEET-adgang og tilladt tenantbruger prøvet. | Slutgate 4.629/4.629; browser-QA `3120eaca`. | Endelig regression efter FC-06 og FL-13–18s resterende backend/integrationer. |
| REG-03 Komplet viewport-/zoommatrix — PDF/audit REG-03 | Implementeret | Responsiv shell, komprimeret mobilchrome, mobil undermenu og scoped overflowrettelser er implementeret. | 40/40 for ti routes ved 1920×1080, 1440×900, 390×844 og 360×800; 160/160 i normal/kompakt menu × 100/125 % zoom; dirty-dialog ved alle fire viewports. TEST-mærkning forblev synlig. | Emulatorsourcede auth/tenant/fælles data og tydeligt mærkede lokale FLEET-fixtures. | Tilladt session; adgangsskærme også fotograferet. | `c03f64c1`; browser-QA `3120eaca`; slutgate. | Ingen særskilt mangel. |

## Forklaring af ændringen fra den oprindelige audit

Den oprindelige audit talte 14 implementerede, 16 delvise, 5 ikke
implementerede og 1 blokeret. Den aktuelle 23/13-opgørelse følger disse
ID-bevægelser, ikke en omformulering af kravene:

- fra delvist til implementeret: UX-01, UX-04, UX-06, FC-03, FC-04, FL-05,
  FL-09, FL-10, FL-12 og REG-03;
- fra implementeret til delvist: FL-13, fordi den obligatoriske
  service-/planlægningsadapter fortsat mangler;
- fra ikke implementeret til delvist: FL-02, FL-03, FL-15, FL-16 og REG-02;
- fra blokeret til delvist: REG-01, fordi den fulde aktuelle gate nu er grøn,
  mens endnu ikke implementerede serverfunktioner naturligt mangler deres
  fremtidige sikkerhedsbevis.

Resultatet er matematisk 23 implementerede og 13 delvise. Den nye integrerede
browserprøve lukker UX-06s tidligere bevismangel og REG-03s fulde
viewport-/zoomrest samt FC-03/04s obligatoriske tobruger- og massebevis, men
ændrer ikke status på
krav, hvor en autoritativ datakilde, serveradapter, Microsoft Excel eller en
ekstern integration fortsat er obligatorisk.

Reviewet af `b9e6b7b76493331cc1d8222002b9c0e151b56edd` havde ret i, at FL-05
på dette tidspunkt ikke opfyldte sin fælles læse-/skrivekilde og derfor skulle
regnes som delvist. FL-05 er kun tilbageført til implementeret efter
`c5bb8613aea6c5cc39221464b732ecda5622a082` og det nye browserbevis for samme
RTDB-post i FLEET og PLANNING. Opgørelsens total er derfor uændret, mens det
tidligere utilstrækkelige acceptgrundlag er erstattet af en faktisk integration.

## Manglende kravmateriale og procesafgrænsning

Den bevarede 14-9-PDF med billeder og den oprindelige audit er læst. Det
oprindelige filnavn `Indsat markdown(20260914-190444).md` blev ikke fundet, men
brugeren leverede den 15. september en bevaret kopi som
`VEYRO-oprindelig-instruks-20260914-190444.md`. Kopien indgår som kravgrundlag
og i reviewpakken; den er behandlet som dokumentation, ikke som en ny
brugerordre. Intet manglende designvalg er rekonstrueret.

`esbuild spawn EPERM` i den normale proces-sandbox og Java-emulatorens tidligere
opstartsfejl er dokumenteret særskilt i navigationens QA. Den afsluttende
sikkerhedsgate bestod 4.629/4.629 med proceslokal JDK; ingen test blev svækket
eller sprunget over. Ingen eksisterende brugerdata blev migreret, ingen ekstern
tjeneste blev aktiveret, og ingen produktionstilstand blev ændret.
