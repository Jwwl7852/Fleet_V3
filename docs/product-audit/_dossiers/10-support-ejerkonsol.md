# Support (modulnøgle: `support`) og Ejerkonsol/Udbyder (ingen modulnøgle — separat rutetræ)

Kilder læst for denne dossier: `src/moduler/support/Hjaelp.jsx`, `Overblik.jsx`,
`Sag.jsx`; `src/moduler/udbyder/Konsol.jsx`, `Prisliste.jsx`;
`src/fleet/support.js`, `demo-support.js`, `sager.js`, `Sagsvisning.jsx`,
`udbyder.js`, `udbyder-regler.js`, `abonnement.js`, `retention-regler.js`,
`moduler.js`, `permissions.js`, `nav.js`; `src/App.jsx` (`Udbyderramme()`,
`erUdbyder`-blokken, ruteopsætning); `functions/index.js` (`kundeopret`,
`kundemoduler`, `kundestatus`, `kundeadmin`, `prislisteopret`,
`kundeabonnement`, `grundlagopret`, `maalnu`, `prislisteslet`,
`retentionLegalHold`, `retentionDryRun`, samt til sammenligning `sagOpret`,
`sagBeskedSkriv`, `sagKarantaeneFrigiv`, `sagAftaleBekraeft`);
`firebase.rules.json` (opslag på `support`, `sager`).

---

## Modul-resumé

### Support

- **navn:** Support (dansk: "Hjælp & Support").
- **formål:** Give kunden en kanal til at oprette og følge supportsager mod
  FleetControl, og give FleetControls eget personale et overblik på tværs af
  alle kunder samt et kontrolleret, tidsbegrænset adgangsflow til at
  fejlsøge i en kundes data. Ifølge `moduler.js`: "Hjælp og sager med
  FleetControl."
- **primær brugertype:** to meget forskellige grupper på samme modul —
  (a) enhver kunde-bruger (Hjælp & Support-siden er `altid: true`, ligger i
  den normale AppShell), og (b) FleetControls eget personale
  (Supportoverblik/Supportsag, kræver `support.laes`).
- **vigtigste opgave:** lade en kunde beskrive et problem uden at kundens
  driftsdata (feltværdier, kundenavne, beløb) forlader hans tenant, og lade
  FleetControl fejlsøge med et minimum af adgang til kundens rigtige data.
- **vigtigste funktioner:**
  - Oprettelsesformular med kategori/prioritet/beskrivelse og en synlig
    allowliste over hvad der faktisk sendes med (`SUPPORT_KONTEKST`).
  - Kunde-tabel over egne sager (indeks pr. tenant).
  - Supportoverblik: kryds-tenant tabel med KPI'er (åbne, afventer kunde,
    afventer intern, kritiske), filtrerbar på kunde/status.
  - Supportsag: tråd, et tidsbegrænset **auditudtræk** (±5 min, maks 50
    poster, ét sted i tiden — beslutning 24, IKKE en generel auditadgang),
    en manuelt skrevet løsnings-checkliste, og et supportadgangs-panel
    (kunden bevilger, tidsbegrænset, med formål og sagsnummer).
- **undermoduler/skærme:** Hjælp & Support (`/support`), Supportoverblik
  (`/support/overblik`), Supportsag (`/support/sag/:id`).
- **afhænger af (andre moduler):** Ingen registreret i `MODUL_KRAEVER`.
  Modulet er `altid: true` (kan ikke fravælges), som Dashboard og Opsætning.
- **afhænges af:** Ingen andet modul læser `support/`-noderne. Isoleret.
- **samlet status: MOCK/DEMO, FASE 0 på tværs af alle tre skærme.** Ingen af
  de tre skærme har en reel skrive- eller læsevej mod databasen — se
  Implementation-status. Al data kommer fra `demo-support.js` og bruges
  **direkte**, ikke som `useListe`-fallback (der findes intet
  `support/`-node-opslag noget sted i produktkoden). Desuden er `support.*`
  (fire permissions: `support.opret`, `support.laes`, `support.skriv`,
  `supportadgang.giv`) **ikke** optaget i `permissions.js`/`ROLLE_PERMS` —
  ingen af de syv roller (heller ikke admin) kan nogensinde få dem, fordi
  admin er `[...ALLE_PERMS]` og disse fire strenge ikke er en del af
  `ALLE_PERMS`. Enhver rigtig bruger vil derfor altid få "Din rolle har ikke
  [permission]" — inklusive administratoren.
- **overlap-mistanke:** Navnet "sag" kolliderer sprogligt med Fleet/Facilitys
  værksteds-/leverandørsager (`sager.js`/`Sagsvisning.jsx`), men det er en
  **anden** RTDB-struktur, en anden permission-familie (`sag.*` vs.
  `support.*`) og en anden Cloud-Function-familie (`sagOpret` m.fl. findes;
  intet tilsvarende `support*`-kald findes i `functions/index.js`). Se
  "Mulige overlap".

### Ejerkonsol / Udbyder

- **navn:** Ejerkonsol (i koden "udbyder"; ruten er `/main` og
  `/main/priser`).
- **formål:** FleetControls eget værktøj til at oprette, styre og fakturere
  kunder — kundeoprettelse, modul-til-/fravalg, abonnementstilstand
  (aktiv/pause/opsagt), rabataftaler, første administrator-oprettelse, samt
  prislister og det månedlige fakturagrundlag.
- **primær brugertype: FleetControls EGET personale (SaaS-leverandøren),
  IKKE en tenant-kunde.** Det er den eneste skærm i hele appen hvor
  brugeren ikke har nogen `tenant`-claim overhovedet
  (`bruger?.udbyder === true`, `beslutning 35`). Konsekvensen er
  arkitektonisk, ikke kun kosmetisk: `harAdgang` i `App.jsx` lukker denne
  konto ude af hele kundeshellen (AppShell, sidebar, tenant-/periodevælger),
  og appen render'er i stedet et helt separat, minimalt rutetræ (se
  Udbyderramme() og `erUdbyder`-blokken i `App.jsx`).
- **vigtigste opgave:** oprette/administrere kundeabonnementer og generere
  det låste, revisionsklare fakturagrundlag hver måned.
- **vigtigste funktioner:**
  - Kundeoversigt med KPI'er (kunder/aktive/lukkede) og en detaljepanel pr.
    kunde: moduler + rabat pr. modul, abonnementstilstand (med tekst om at
    en pause/opsigelse faktisk koster/sparer penge fra dags dato), generel
    rabat, oprettelse af kundens første administrator (engangs-adgangskode
    vist én gang), samt en append-only abonnementshistorik (hvem/hvad/hvorfor).
  - Prislister: versionerede, aldrig-rettede prislister (`gyldigFraMs`
    ≠ `oprettetMs`), CSV-eksport, sletning kun af ubrugte kladder (serveren
    afviser sletning af en liste der er brugt til et opgjort grundlag).
  - Fakturagrundlag: "Dan fakturagrundlag for periode" og "Mål alle kunder
    nu" (måling kan ikke laves bagud), frosne fakturaopstillinger pr. kunde,
    CSV-eksport af linjer (aldrig af totaler).
- **undermoduler/skærme:** Konsol (`/main`), Prisliste (`/main/priser`).
- **afhænger af (andre moduler):** Ingen i `MODUL_KRAEVER`-forstand (den
  spiller ikke inde i kundens modulsystem — den ER systemet der tildeler
  moduler til andre).
- **afhænges af:** Ingen andet modul læser udbyder-noderne (de er kun
  læsbare for `udbyder === true`-claimet). Kundens egen visning af sit
  abonnement (låseskærmen, `Abonnementslaas` i `App.jsx`) læser
  `tenants/<id>/abonnement` direkte — samme node ejerkonsollen skriver til,
  men via en helt anden læsevej (kunden læser sin egen tenant, ejerkonsollen
  skriver via Cloud Function).
- **samlet status: BUILT.** Al læsning går til rigtige RTDB-noder
  (`db.ref(...).once("value")`, ingen `useListe`, ingen demo-fallback,
  ingen mock-array noget sted i disse to filer). Al skrivning går gennem
  ni navngivne Cloud Functions (`kundeopret`, `kundemoduler`, `kundestatus`,
  `kundeadmin`, `prislisteopret`, `kundeabonnement`, `grundlagopret`,
  `maalnu`, `prislisteslet`), som alle findes, alle starter med
  `kraevUdbyder(req)` (et rigtigt server-side ejertjek) og alle skriver til
  RTDB-noder der reelt er `.write: false` for enhver klient. Konsollen selv
  skriver aldrig én byte direkte.
- **overlap-mistanke:** Ingen reel — det er den eneste skærm i platformen
  der administrerer *andre* tenants, og det er en bevidst, adskilt
  sikkerhedsmodel (egen claim, egne tre læsbare noder pr. kunde, egen
  ramme). Se "Mulige overlap" for den eneste indirekte berøring (kundens
  egen låseskærm læser samme `abonnement`-node).

---

## Skærme

### Hjælp & Support / Hjaelp.jsx
- **route:** `/support` (nav-key `hjaelp`, `altid: true`-modul).
- **sidenavn:** "Hjælp & Support".
- **hvem bruger den:** enhver kunde-bruger med `support.opret` — men se
  status: den permission findes ikke i `ROLLE_PERMS`, så i praksis ingen.
- **primært formål:** oprette en supportsag (kategori, prioritet,
  beskrivelse, vedhæftning) og se kundens egne sagers status.
- **primær handling:** "Opret supportsag" — knappen er **permanent
  deaktiveret** med teksten "Oprettelse er ikke bygget endnu (fase 0)."
- **sekundære handlinger:** vælge kategori/prioritet, se en synlig,
  filtreret liste over hvilken kontekst der ville blive sendt med
  (`kontekstFilter()` mod `SUPPORT_KONTEKST`-allowlisten), læse forklaring
  om at FleetControl ikke har standardadgang til kundens data.
- **data vist:** `DEMO_SUPPORTSAGER` filtreret på `tenantId` (via
  `demoIndeksFor()`) — **altid** demo-data, ingen `useListe`, intet
  `support/`-node-opslag findes i filen.
- **data der kan ændres:** intet. Formularfelterne opdaterer kun lokal
  `useState`; der er ingen `gem()`/Cloud-Function-kald noget sted i filen.
- **kommer typisk fra:** hovedmenuen (Support-punktet).
- **går typisk til:** enkelte sager (`/support/sag/:id`).
- **overlap med anden side:** ingen direkte — men se "kontekst"-mekanismen
  vs. Fleet/Facilitys `sager.js`-parter-mekanisme (begge er allowlister af
  hvad der må "forlade" tenanten, bygget helt uafhængigt af hinanden).
- **status: MOCK/DEMO.** Ren visning; ingen læse- eller skrivevej til en
  rigtig database.
- **demo-data:** ja, altid — `DEMO_SUPPORTSAGER`/`demoIndeksFor()` fra
  `demo-support.js`, brugt direkte og ubetinget (ikke en `useListe`-fallback).
- **nødvendig for:** ville være daglig drift-relevant (support er en
  vedvarende kundebehov), men er reelt ubrugelig i dag — ingen kan oprette
  en sag herfra.

### Supportoverblik / Overblik.jsx
- **route:** `/support/overblik`.
- **sidenavn:** "Supportoverblik".
- **hvem bruger den:** tiltænkt FleetControls eget personale, kræver
  `support.laes`.
- **primært formål:** kryds-tenant liste over alle supportsager, med
  KPI-optælling (åbne/afventer kunde/afventer intern/kritiske) og
  filtrering på kunde og status.
- **primær handling:** ingen skrivehandling på denne skærm — den er ren
  visning/navigation ind i enkelte sager.
- **sekundære handlinger:** filtrere på kunde/status.
- **data vist:** `DEMO_SUPPORTSAGER` (filtreret via `maaLaeseSag()` — samme
  funktion som den tiltænkte RTDB-regel ville bruge) og `DEMO_TENANTS`.
  Bevidst design: den viser kun det en rigtig regel ville give, selv i demo.
- **data der kan ændres:** intet.
- **kommer typisk fra:** Support-undermenuen.
- **går typisk til:** Supportsag.
- **overlap med anden side:** ingen. Er den eneste skærm i platformen der
  (konceptuelt) er tiltænkt at vise mere end én tenant ad gangen — en
  bevidst, dokumenteret undtagelse fra tenant-isolationen (håndhævet af
  `support.laes`, som *ikke* er nogen kunderolle).
- **status: MOCK/DEMO.** Da `support.laes` ikke findes i `permissions.js`,
  vil `maaSe = harSupportPerm(bruger, PERM_SUPPORT_LAES)` være `false` for
  **enhver** rigtig bruger, inklusive admin — skærmen viser derfor altid
  spærringsteksten ("Din rolle har ikke support.laes") for enhver rigtig
  bruger. Kun i demo, hvor rollen kan overstyres klientside
  (`saetDemoRolle`), kan man se selve tabellen — og selv der er data'en
  hardkodet.
- **demo-data:** ja, altid.
- **nødvendig for:** ville være FleetControls interne driftsværktøj, men er
  i dag uden reel funktion.

### Supportsag / Sag.jsx
- **route:** `/support/sag/:id` (skjult i nav, tilgået fra links).
- **sidenavn:** "Supportsag".
- **hvem bruger den:** kunden (hvis sagen er hans egen) eller FleetControl
  (med `support.laes`).
- **primært formål:** vise sagstråd, kontekst, et tidsbegrænset
  aktivitetsudtræk og et supportadgangs-panel.
- **primær handling:** ingen fungerende — "Send svar" (kræver
  `support.skriv`) og "Giv midlertidig adgang" (kræver `supportadgang.giv`
  hos kundens egen administrator) er begge permanent deaktiverede med
  "… er ikke bygget endnu (fase 0)."
- **sekundære handlinger:** se "Kundens aktivitet omkring fejlen"
  (auditudtræk, ±5 min/maks 50 poster om ÉN bruger — beregnet af
  `klipUdtraek()`, en ren funktion), se en menneskeskrevet
  løsnings-checkliste (ingen AI/score), se supportadgangs-status
  (aktiv/udløbet, med nedtælling).
- **data vist:** `demoSupportsag(id)`, `demoBeskeder()`, `demoUdtraek()`,
  `demoBevilling()` — alt fra `demo-support.js`, ingen ægte node.
- **data der kan ændres:** intet reelt. `byggBevilling()` bygger kun en
  **forhåndsvisning** af hvad der *ville* blive skrevet — funktionen
  skriver ikke, den kastes/vises kun.
- **kommer typisk fra:** Hjælp & Support eller Supportoverblik (link på
  sagsnummeret).
- **går typisk til:** ingen videre skærm — er slutpunktet.
- **overlap med anden side:** se "Mulige overlap" — sammenlign eksplicit
  med Fleet/Facilitys `Sagsvisning.jsx`, som er en helt anden komponent
  for et helt andet "sag"-begreb.
- **status: MOCK/DEMO.** Samme mønster som de to andre skærme: fase-0-visning
  uden database-tilknytning, og de fire relevante permissions
  (`support.laes`, `support.skriv`, `supportadgang.giv`) findes slet ikke i
  `permissions.js`, så adgangstjekkene i skærmen er altid falske for en
  rigtig bruger.
- **demo-data:** ja, altid.
- **nødvendig for:** tiltænkt daglig support-drift; reelt ubrugelig i dag.

### Konsol / Konsol.jsx
- **route:** `/main` (uden for AppShell — se `Udbyderramme()` i `App.jsx`).
- **sidenavn:** "Ejerkonsol" (header-teksten i `Udbyderramme`).
- **hvem bruger den:** en konto med `bruger.udbyder === true` — FleetControls
  eget personale, ikke en tenant-kunde.
- **primært formål:** oprette nye kunder, styre deres modulafkrydsning og
  rabatter, styre abonnementstilstand, oprette kundens første administrator.
- **primær handling:** "Opret kunde" (kalder `opretKunde()` →
  `kundeopret`-funktionen), "Gem moduler" (kalder `saetModuler()` →
  `kundemoduler`), "Sæt til [status]" (kalder `saetStatus()` →
  `kundestatus`), "Opret administrator" (kalder `opretKundeadmin()` →
  `kundeadmin`).
- **sekundære handlinger:** "Gem rabatter" (pr. modul, kalder
  `saetAbonnement({rabatModulBps})`), "Gem rabat" (generel, kalder
  `saetAbonnement({rabatBps})`), se append-only abonnementshistorik pr.
  kunde (`tenants/<id>/abonnementHistorik`, hentet on-demand).
- **data vist:** kundeindeks `udbyder/kunder` + pr. kunde
  `tenants/<id>/virksomhed`, `tenants/<id>/moduler`,
  `tenants/<id>/abonnement` (tre rigtige `db.ref().once("value")`-kald pr.
  kunde), samt historik-noden on-demand.
- **data der kan ændres:** kundens moduler, rabat pr. modul, generel rabat,
  abonnementstatus + årsag, og oprettelse af kundens første administrator —
  **alt sammen reelt persisteret**, via de fire nævnte Cloud Functions.
- **kommer typisk fra:** login som udbyder-konto (egen renderingsgren i
  `App.jsx`, ikke via nav.js).
- **går typisk til:** Prisliste (`/main/priser`, via et eksplicit link i
  kortets `handling`-slot — konsollen har ingen sidebar, så uden linket ville
  prissiden kun være nåbar for den der kender URL'en).
- **overlap med anden side:** kundens egen låseskærm
  (`Abonnementslaas`/`erAktiv()` i `App.jsx`) læser samme
  `tenants/<id>/abonnement`-node som konsollen skriver til — den eneste
  indirekte kobling mellem de to rutetræer.
- **status: BUILT.** Ægte læsning + ægte skrivning via Cloud Functions med
  et rigtigt server-side ejertjek (`kraevUdbyder`); ingen demo-fallback i
  filen (kun en klientside oversættelse af "ingen Firebase-app" til en
  "Demo-tilstand"-besked, som kun rammes hvis der slet ikke er nogen
  Firebase-konfiguration).
- **demo-data:** nej — ingen `DEMO_`-array bruges. ("Demo-tilstand"-teksten
  i `kald()` er en fejlbesked for manglende forbindelse, ikke mock-data.)
- **nødvendig for:** FleetControls interne salgs-/onboarding- og
  kontostyringsproces — ikke en del af nogen kundes daglige drift.

### Prisliste / Prisliste.jsx
- **route:** `/main/priser`.
- **sidenavn:** "Priser & fakturagrundlag".
- **hvem bruger den:** samme udbyder-konto som Konsol.
- **primært formål:** lægge nye, versionerede prislister og danne det
  månedlige, låste fakturagrundlag pr. kunde.
- **primær handling:** "Læg prislisten" (kalder `opretPrisliste()` →
  `prislisteopret`), "Dan fakturagrundlag for [periode]" (kalder
  `opretGrundlag()` → `grundlagopret`, kun aktiv når perioden er slut).
- **sekundære handlinger:** "Mål alle kunder nu" (`maalNu()` → `maalnu`,
  eksplicit ikke en bagudrettet reparation), "Slet" en ubrugt prisliste
  (`sletPrisliste()` → `prislisteslet`, serveren afviser hvis listen er
  brugt til et opgjort grundlag), CSV-eksport af prislister og
  grundlagslinjer, print.
- **data vist:** `udbyder/prisliste`, `udbyder/fakturagrundlag`,
  `udbyder/kunder` + `tenants/<id>/virksomhed/navn` — alle via rigtige
  `db.ref().once("value")`-kald, med tre **adskilte** try/catch-blokke
  (bevidst: en afvist læsning på ét datasæt må ikke skjule et andet, jf.
  filens egen note om en tidligere fejl hvor "ingen adgang" blev læst som
  "ingen prislister").
- **data der kan ændres:** nye prislister (aldrig rettelse af en
  eksisterende — en ny pris er altid en ny liste med en dato), sletning af
  ubrugte kladder, dannelse af fakturagrundlag.
- **kommer typisk fra:** link fra Konsol.
- **går typisk til:** ingen videre skærm — viser resultatet (frosne
  fakturaopstillinger) direkte på siden.
- **overlap med anden side:** ingen i kundeappen (prislisten er kun
  synlig/redigerbar fra ejerkonsollen). `MOMSSATS` her (FleetControls
  faktura til vognmanden) er bevidst en anden konstant end `MOMSSATS_SALG`
  (vognmandens faktura til hans egen kunde) — nævnt i CLAUDE.md som en
  tidligere reel forveksling, ikke noget der findes i disse filer i dag.
- **status: BUILT.** Samme mønster som Konsol: ægte læsning, ægte skrivning
  via fem Cloud Functions, ingen beregning foretages klientside (beløb vises
  som de blev frosset på det genererede dokument).
- **demo-data:** nej.
- **nødvendig for:** FleetControls interne fakturerings-/regnskabsproces.

---

## Data-entiteter

| Entitet | RTDB-node(r) | Ejes af (jf. `NODE_MODUL`) | Bruges også af | Kilde-til-sandhed-bemærkning |
|---|---|---|---|---|
| Supportticket (`support/sager`) | **Tiltænkt:** `support/sager/<sagId>` (top-niveau, med `tenantId`-felt), `support/beskeder/<sagId>/<id>`, `tenants/<t>/supportsager/<id>` (indeks). **Faktisk i dag:** ingen af disse noder findes i `firebase.rules.json` — bekræftet ved opslag ("support" giver ingen træf i regelfilen). | Står **ikke** i `NODE_MODUL` (kan ikke stå der — noden findes ikke i reglerne endnu). `moduler.js` markerer modulet `support` som `altid: true`, men det styrer kun UI-synlighed, ikke en RTDB-node. | Ingen — al data i skærmene kommer fra `demo-support.js`, aldrig fra en `useListe`-forespørgsel. | Der er ingen kilde til sandhed endnu; hele konceptet er designet (`support.js`) men uimplementeret i data-laget. |
| Sag/case (Fleet/Facility, til sammenligning) | `tenants/<t>/sager/<sagId>` — **findes** i `firebase.rules.json` (linje ~1920, `.write: false`), plus en klassificeret satellit `sensitive/sager/<sagId>` (kræver `sag.sensitiveLaes`). | Uden for `NODE_MODUL` (base-node) med vilje — kommentaren i `moduler.js` siger eksplicit: "`sager` art er `fleet` \| `facility` … og en værkstedssag hænger typisk på netop en opgave (beslutning 20/112)". | Fleet (`art: "fleet"`, præfiks FLT) og Facility (`art: "facility"`, præfiks FAC) via den delte `Sagsvisning.jsx`-komponent. **Ikke** brugt af Support-modulet. | Backend er reelt bygget: `sagOpret`, `sagBeskedSkriv`, `sagKarantaeneFrigiv`, `sagAftaleBekraeft` findes alle i `functions/index.js` og skriver til den rigtige node med rigtige permissionstjek. Frontend'en (`Sagsvisning.jsx`) er dog stadig mærket "BESLUTNING 20, fase 0 — VISNING, INGEN AFSENDELSE" og har alle send-/frigivelses-knapper deaktiverede — et backend/frontend-gab (se "Mulige overlap"). |
| Tenant / kunde-abonnement (ejerkonsollens perspektiv) | `udbyder/kunder/<id>` (indeks — kun `oprettetMs`), `tenants/<id>/virksomhed`, `tenants/<id>/moduler`, `tenants/<id>/abonnement`, `tenants/<id>/abonnementHistorik` (append-only log). | Ikke en del af `NODE_MODUL` (kunde-/abonnementsdata er ikke modulspærret internt — det ER modulsystemet). Læses af en udbyder-konto via en helt separat regel-gren (`udbyder === true`-claimet), ikke via tenant-modulklausulen. | Kundens egen låseskærm (`Abonnementslaas` i `App.jsx`) læser `tenants/<id>/abonnement` for sin egen tenant. | `abonnementHistorik` er **eksplicit ikke** faktureringskilden (CLAUDE.md, beslutning 89) — den daglige måling i `udbyder/maalinger/<kunde>/<dato>` er det. Historikken forklarer hvem/hvorfor; målingen forklarer hvor mange dage. |
| Legal hold / retention | `tenants/<t>/retention/legalHold/<id>` (skrevet af `retentionLegalHold`); `RETENTION_KATEGORI` i `retention-regler.js` er en statisk, ren beskrivelse (ingen node) af 14 datakategorier, hver med `periodeMaaneder: null` og `afgjort: false`. | Ikke i `NODE_MODUL` — retention er tenant-scoped infrastruktur, ikke et forretningsmodul. | `retentionDryRun` læser de noder en kategori peger på (fx `grundlag`, `fakturaer` for `regnskabsdata`) for at simulere hvad en hypotetisk periode ville ramme — rører intet. | Kategorierne `supportData` og `supportAdgangslog` har begge `bygget: false, noder: []` — retention-rammen bekræfter selv at Support-noderne ikke findes endnu. Selve sletningen/anonymiseringen (`anonymiser()`, `eksporterFoerSletning()`, `slet()`) kaster altid — bevidst, ikke et hul (beslutning 115). |

---

## Implementation-status

- **AI/self-service hjælp:** **NOT_BUILT.** Ingen AI-diagnose findes noget
  sted i Support-modulet, og det er eksplicit fravalgt i kommentarerne
  ("INGEN AI-DIAGNOSE. Der er ingen model … en score må kun findes hvis
  beregningen kan vises"). `RETENTION_KATEGORI.aiDiagnose` bekræfter:
  `bygget: false, noder: []`. Løsningsforslaget på en sag er en
  menneskeskrevet checkliste, ikke selvbetjening.
- **Supportsag-oprettelse:** **MOCK/DEMO.** Formularen findes
  (`Hjaelp.jsx`), men "Opret supportsag"-knappen er permanent deaktiveret
  ("ikke bygget endnu (fase 0)"), og der findes ingen `support/`-node i
  `firebase.rules.json` at skrive til, og ingen Cloud Function for det.
- **Intern behandling (Supportoverblik/Supportsag):** **MOCK/DEMO.** Samme
  begrundelse — ren visning af `demo-support.js`, og de fire
  `support.*`-permissions findes ikke i `permissions.js`, så adgangstjekkene
  i skærmene er strukturelt uopnåelige for enhver rigtig token, uanset rolle.
- **Supportadgang/impersonation:** **PLANNED.** Modellen er grundigt
  designet i `support.js` (tidsbegrænset, kunde-bevilget, formål +
  sagsnummer, auto-udløb, ingen selvbevilling), og skærmen viser en
  forhåndsvisning af hvad der *ville* blive skrevet (`byggBevilling()`) —
  men ingen node, ingen regel, ingen Cloud Function eksisterer. Der er ikke
  tale om reel impersonation (ingen "log ind som kunde"-funktion nogen
  steder i kodebasen) — kun et fremtidigt, kunde-styret adgangsflag.
- **Sagsbaseret mail-tråd (Fleet/Facility, ikke Support):** **PARTIAL,
  BUILT på serveren, MOCK/DEMO på skærmen.** `functions/index.js` har fire
  fuldt implementerede Cloud Functions (`sagOpret`, `sagBeskedSkriv`,
  `sagKarantaeneFrigiv`, `sagAftaleBekraeft`) med rigtige permissionstjek
  (`sag.skriv`, `sag.sensitiveLaes`, `sag.karantaeneFrigiv`,
  `sag.aftaleBekraeft`), og `tenants/<t>/sager` findes i
  `firebase.rules.json`. Men `Sagsvisning.jsx` (den delte komponent Fleet og
  Facility bruger) er stadig mærket "fase 0 — VISNING, INGEN AFSENDELSE" og
  har alle relevante knapper (send besked, frigiv karantæne) hardkodet
  deaktiverede med den tekst. Frontend'en har med andre ord ikke fulgt med
  backend'en. **Dette er ikke en del af Support-modulet** — nævnes her kun
  fordi navnet "sag" ellers let forveksles med Supportsag (se "Mulige
  overlap").
- **Ejerkonsollens kunde-/abonnementsstyring:** **BUILT, brugbar
  ende-til-ende.** Oprettelse, modulstyring, rabat, abonnementstatus og
  første-admin-oprettelse går alle gennem rigtige, autoriserede Cloud
  Functions med en ægte historik-log. Ingen kendte huller i selve flowet.
- **Prisliste-administration:** **BUILT, brugbar ende-til-ende.**
  Versionering, aldrig-destruktiv redigering (ny liste i stedet for
  rettelse), fakturagrundlags-generering og sletningsbeskyttelse (server
  afviser sletning af en brugt liste) er alle reelle.
- **Legal hold:** **BUILT (den ikke-destruktive del).**
  `retentionLegalHold` sætter/ophæver reelt en undtagelsespost i
  `tenants/<t>/retention/legalHold`, med rigtigt permissionstjek
  (`retention.skriv` **og** `retention.laes`, som i praksis kun admin har —
  revisor har kun `retention.laes`). Dette er hele funktionens omfang: at
  undtage ét objekt fra en fremtidig sletning der endnu ikke findes.
- **Retention dry-run:** **BUILT (rapportering), men kun for kategorier
  markeret `bygget: true`.** `retentionDryRun` kræver `retention.laes`,
  tager en **hypotetisk** `periodeMaaneder` fra kalderen (læser **ikke**
  `RETENTION_KATEGORI[...].periodeMaaneder`, som stadig er `null` for alle
  14 kategorier) og rapporterer hvor mange poster der ville rammes, hvor
  mange der er undtaget af et legal hold, og hvor mange der er for unge.
  **Selve sletningen/anonymiseringen findes bevidst ikke** —
  `anonymiser()`, `eksporterFoerSletning()` og `slet()` i
  `retention-regler.js` kaster alle en fejl der eksplicit siger de
  aktiveres først når en periode er sat OG juridisk afgjort pr. kategori
  (beslutning 115). Dette er dokumenteret som en **bevidst, kendt
  begrænsning** — ikke en forglemmelse: filens egen kommentar kalder det
  "hooks: stedet den fremtidige mekanisme kobles på, ikke den fremtidige
  mekanisme selv."

---

## Workflow-observationer

### 1. Support: AI/self-service → supportsag → intern behandling → evt. supportadgang → løsning → lukning

1. **AI/self-service-hjælp** — **NOT_BUILT.** Ingen selvbetjeningslag findes
   før oprettelsesformularen; kunden går direkte til en manuel formular.
   (`Hjaelp.jsx`, ingen relevant import/komponent.)
2. **Kunden udfylder og forsøger at oprette en supportsag** —
   **MOCK/DEMO.** Kategorien/prioriteten/beskrivelsen kan tastes ind
   (lokal `useState`), men "Opret supportsag"-knappen er `disabled` med
   teksten "Oprettelse er ikke bygget endnu (fase 0)."
   (`Hjaelp.jsx` linje ~108-114.)
3. **Sagen dukker op i Supportoverblikket hos FleetControl** —
   **MOCK/DEMO, og strukturelt uopnåeligt.** Selv hvis trin 2 virkede, ville
   `Supportoverblik` kræve `support.laes`, som ikke findes i
   `ROLLE_PERMS` for nogen rolle. (`Overblik.jsx` linje 41;
   `permissions.js`, ingen `support.*`-nøgler.)
4. **Intern behandling (tråd, checkliste)** — **MOCK/DEMO.** Kommunikation
   vises (`Traad`-komponenten), men "Send svar" er `disabled` med
   "Afsendelse er ikke bygget endnu (fase 0)." (`Sag.jsx` linje ~141-145.)
5. **Auditudtræk til fejlsøgning** — **BUILT som ren beregningsfunktion,
   MOCK som data.** `klipUdtraek()`/`udtraekVindue()` i `support.js` er
   ægte, prøvbare, rene funktioner der korrekt klipper til ±5 min/50 poster
   — men de kører på `DEMO_AUDITUDTRAEK`, ikke et rigtigt Cloud-Function-kald
   mod `audit/`. Ingen Cloud Function for udtrækket findes i
   `functions/index.js`.
6. **Evt. supportadgang bevilges af kundens administrator** —
   **PLANNED.** `kanGiveAdgang()`/`byggBevilling()` er design, ikke
   funktion — "Giv midlertidig adgang" er `disabled` med
   "Bevilling er ikke bygget endnu (fase 0)." (`Sag.jsx` linje ~334-337.)
7. **Løsning** — checklisten kan i dag kun ses, ikke afkrydses fra UI (ingen
   skriv-handling knyttet til `checkliste`-arrayet i `Sag.jsx`). **MOCK/DEMO.**
8. **Lukning af sagen (statusskift til `loest`/`lukket`)** —
   **NOT_BUILT.** Ingen statusskift-mekanisme (knap, funktion eller
   Cloud Function) findes noget sted for supportsager.

**Samlet:** Hele Support-workflowet er i dag en visningsprototype (fase 0)
fra ende til anden. Selv hvis alle knapper blev "tændt" i UI'en i morgen,
mangler både RTDB-noderne i `firebase.rules.json`, de fire
`support.*`-permissions i `permissions.js`/`ROLLE_PERMS`, og enhver
tilsvarende Cloud Function.

### 2. Ejerkonsol: hvordan en udbyder-bruger ser og styrer en kundes abonnement/moduler

1. **Login som udbyder-konto** — **BUILT.** `App.jsx` genkender
   `bruger.udbyder === true` og render'er `Udbyderramme` med et separat,
   to-rute rutetræ (`/main`, `/main/priser`) i stedet for AppShell.
2. **Se kundelisten** — **BUILT.** `hentKunder()` i `Konsol.jsx` slår
   `udbyder/kunder` op og henter derefter `virksomhed`/`moduler`/`abonnement`
   for hver kunde direkte fra `tenants/<id>/…` (tre rigtige RTDB-kald pr.
   kunde, ingen demo-fallback).
3. **Åbne én kunde og se/ændre moduler** — **BUILT.** Afkrydsningsfelterne
   sammenlignes mod nuværende moduler; "Gem moduler" er kun aktiv når noget
   reelt er ændret og `manglendeKrav()` (fra `moduler.js`) ikke rapporterer
   et uopfyldt modulkrav (fx Planning uden Kunder). Trykket kalder
   `saetModuler()` → Cloud Function `kundemoduler`, som selv genchecker
   kravene server-side før skrivning.
4. **Se/ændre rabat pr. modul eller generel rabat** — **BUILT**, som et
   **bevidst adskilt** klik fra modulændringen (to knapper, "Gem moduler"
   og "Gem rabatter") fordi de to handlinger har forskellig virkningstid
   (modul: øjeblikkeligt; rabat: først næste opgørelse). Kalder
   `saetAbonnement()` → Cloud Function `kundeabonnement`.
5. **Se/ændre abonnementstatus (aktiv/pause/opsagt)** — **BUILT.**
   Advarselstekst vises om at pause/opsigelse faktisk påvirker fakturering
   fra dags dato (ikke bare en visuel lås). Kalder `saetStatus()` → Cloud
   Function `kundestatus`.
6. **Oprette kundens første administrator** — **BUILT.** Genererer et
   engangs-kodeord (`nytLoesen()`), viser det præcis én gang, kalder
   `opretKundeadmin()` → Cloud Function `kundeadmin`.
7. **Se abonnementshistorik** — **BUILT, hentet on-demand.** Append-only,
   viser hvem/hvad/hvorfor — eksplicit **ikke** faktureringsgrundlaget
   (det er den daglige måling, et andet system).
8. **Videre til Prisliste for at se/lægge priser** — **BUILT.** Et
   eksplicit link findes i konsollens `handling`-slot, fordi der ingen
   sidebar er.

**Hvad ejerkonsollen KAN gøre (bekræftet i kode):** oprette kunder, tildele
og fratage moduler, sætte generel rabat og rabat pr. modul, sætte
abonnementstatus (med årsag), oprette kundens første administrator, lægge
nye prislister, danne/måle fakturagrundlag, se historik. **Hvad den ikke
kan:** rette en eksisterende prisliste (kun ny liste), slette en brugt
prisliste, se eller ændre andet end de tre nævnte tenant-noder (den har
ingen indblik i kundens driftsdata — booking, flåde osv.).

---

## UI-mønstre

- **Navigation:** Support ligger inde i den normale sidebar
  (`nav.js`-nøgle `support`, tre børn: `hjaelp`, `supportOverblik`,
  `supportSag` — sidstnævnte `skjulINav: true`). Ejerkonsollen har **ingen
  sidebar, ingen tenant-vælger, ingen periodevælger** — `Udbyderramme()` i
  `App.jsx` er en minimal `<header class="fc-top">` med kun brand-navn,
  "Ejerkonsol"-label, brugerens e-mail og en logud-knap; alt andet er ét
  `<main class="fc-slot">`. Dette er en strukturelt anden UI-skal end
  samtlige andre skærme i appen (også chaufførappens `Chauffoerramme` og
  kundeshellens AppShell er nærmere hinanden end nogen af dem er
  Udbyderramme).
- **Card/KPI-design:** Begge moduler genbruger de fælles `Kort`, `KpiKort`,
  `KpiRaekke`-komponenter fra `ui.jsx` — samme visuelle sprog som resten af
  appen, selv om Ejerkonsollen render'es udenfor AppShell.
- **Tabeller:** Fælles `Tabel`-komponent overalt (Supportoverblikkets
  kryds-tenant-liste, Konsollens kundeliste, Prislistens historik og
  grundlagsrækker).
- **Filtre:** Supportoverblik har to `<select>`-filtre (kunde, status).
  Prisliste har periode-input og en "vis moduler uden pris"-checkbox.
- **Modaler/paneler:** Ingen modal-dialoger — begge moduler bruger
  inline-ekspansion (klik "Åbn"/"Vis satser" folder et panel ud under
  rækken) i stedet for et overlay.
- **Statusfarver:** Fælles `Pille`-komponent med de samme tone-navne som
  resten af appen (`ok`/`info`/`warn`/`bad`) — fx `SUPPORT_STATUS`,
  `ABONNEMENT`, `VEDHAEFTNING_TONE` mapper alle til denne palet, ikke
  friteksts-farver.
- **Knapper:** Fælles `Knap`-komponent (`variant="primaer"`/sekundær). Et
  gennemgående mønster i Support: en `disabled`-knap bærer altid en
  `title`-forklaring på HVORFOR (fx "Afsendelse er ikke bygget endnu (fase
  0)."), aldrig en stum grå knap.
- **Terminologi:** Dansk gennemgående. "Sag" bruges i to helt forskellige
  betydninger i kodebasen (supportsag vs. værksteds-/leverandørsag) uden
  noget fælles komponentnavn eller node — se "Mulige overlap". Ejerkonsollen
  bruger konsekvent "kunde" (aldrig "tenant") i UI-tekst, mens koden internt
  bruger `tenant`/`tenantId`.

---

## Mulige overlap

- **Site A: Supportsag (`Sag.jsx`, "sag" = supportticket).**
  **Site B: Sagsvisning (`Sagsvisning.jsx`, "sag" = værksteds-/leverandørsag
  for Fleet/Facility).**
  **Hvorfor mistanken opstår:** begge hedder "sag"/"Sagsvisning"-relateret i
  dansk UI-sprogbrug, begge har en tråd, begge har vedhæftningsscanning, og
  begge har et koncept om at en ekstern part kan blive "godkendt"/"kendt"
  (Support: ingen sådan mekanisme endnu; Fleet/Facility: `vurderAfsender()`
  mod `parter[]`).
  **Afgørelse: DET ER TO ADSKILTE KONCEPTER, INGEN DELT NODE.**
  - Support: `support/sager/<id>` (tiltænkt, topniveau, tenant-krydsende) +
    `tenants/<t>/supportsager` (indeks). **Ingen af disse findes i
    `firebase.rules.json`** — bekræftet ved direkte opslag.
  - Fleet/Facility: `tenants/<t>/sager/<id>`, med `art` begrænset til
    `SAG_ART = { fleet, facility }` i `sager.js` — **"support" er ikke en
    gyldig værdi i `SAG_ART`**, og der er ingen sti hvor de to noder kunne
    kollidere. Noden **findes** i `firebase.rules.json`.
  - Permissionerne er også adskilte navnerum: `sag.laes`/`sag.skriv`/…
    (Fleet/Facility, findes i `permissions.js`) vs.
    `support.laes`/`support.skriv`/… (Support, findes **ikke** i
    `permissions.js`).
  - `Sag.jsx` (Support) importerer udelukkende fra `support.js` og
    `demo-support.js` — aldrig fra `sager.js` eller `Sagsvisning.jsx`.
  - **Risiko:** ikke en datarisiko (ingen delt node), men en
    **navngivnings-/vedligeholdelsesrisiko** — to udviklere kunne let
    forveksle "byg supportsager" med "byg Fleet/Facility-sager" i en
    fremtidig opgavebeskrivelse, især da Fleet/Facility-sagerne (backend)
    faktisk ER bygget (`sagOpret` m.fl.), mens Support-sagerne slet ikke er
    påbegyndt i data-laget. En læser der kun ser "sag er fase 0" i én af de
    to sammenhænge (fx den ældre note i CLAUDE.md om beslutning 20) kan let
    tro det gælder begge.

- **Site A: Sagsvisning.jsx (frontend-tekst "fase 0, ingen afsendelse").**
  **Site B: `sagOpret`/`sagBeskedSkriv`/`sagKarantaeneFrigiv`/
  `sagAftaleBekraeft` (backend, fuldt implementeret med permissionstjek og
  RTDB-regler).**
  **Hvorfor:** Dette er ikke et overlap mellem to sider, men en intern
  **uoverensstemmelse mellem lag** i samme feature — nævnt her fordi den
  blev fundet under research af "sag"-forvekslingen ovenfor, og fordi den
  direkte påvirker hvor pålidelig "fase 0"-kommentarer i frontend-kode er
  som kilde til sandhed om hele feature-status. Backend'en er kommet
  længere end frontend-kommentarerne antyder.
  **Risiko:** en fremtidig audit der kun læser `Sagsvisning.jsx`s egne
  kommentarer (uden at tjekke `functions/index.js` og
  `firebase.rules.json`) vil undervurdere hvor bygget Fleet/Facilitys
  sagsflow reelt er.

- **Site A: Ejerkonsollens skrivning til `tenants/<id>/abonnement`.**
  **Site B: Kundens egen låseskærm (`Abonnementslaas` i `App.jsx`), som
  læser samme node.**
  **Hvorfor:** dette er den eneste reelle databerøring mellem de to
  rutetræer i denne dossier.
  **Risiko:** lav/ingen — det er tiltænkt og korrekt design (én
  skrivevej via `kundestatus`, én, adskilt læsevej for kunden selv via
  hans eget tenant-claim); nævnes kun for fuldstændighedens skyld, da
  opgaven bad om at spore afhængigheder mellem modulerne.

- **Ingen overlap fundet mellem Ejerkonsollens modulstyring og noget
  kunde-modul.** Ejerkonsollen skriver `tenants/<id>/moduler`, som er den
  SAMME node ethvert modul i kundeappen læser via `harModul()`
  (`moduler.js`) — men det er tiltænkt: det er selve mekanismen der styrer
  kundens modulsæt, ikke et utilsigtet dobbeltansvar.
