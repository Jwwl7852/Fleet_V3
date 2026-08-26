# End-to-end resultater

Otte navngivne kæder blev afprøvet mod den kørende DEV-app. For hver: verdikt, hvor den evt. brød, og hvad der rent faktisk blev set (skærmbillede/data), ikke kun kode.

---

## Planning — request/booking → forslag → godkendelse → disponering → reservation → status/turplan

**Verdikt: arkitektonisk sammenhængende og konsistent kodet ende-til-ende. Ikke 100 % klik-verificeret live pga. delt browser-session, men ingen fund der modsiger at kæden virker.**

- Booking-oprettelse **live-bekræftet**: formularen tager imod input, er permission-gated (`booking.opret`), og skriver atomisk (booking + første etape) via én Cloud Function med et transaktionelt bestillingsnummer.
- Alle etapeovergange kommer fra ÉN tabel (`ETAPE_OVERGANGE`, `src/fleet/booking-state.js:128-169`), brugt identisk af den generiske overgangsskærm, forslagsskærmen og selve Cloud Function'en — ingen klientvej uden om, fordi `etaper`/`reservationer` er `.write:false` for alle roller inkl. admin.
- De fem disponeringstjek (ressourceledighed, kompetencer, kapacitet, ressourcekonflikt, køre-/hviletid) ligger ét sted (`src/fleet/disponering.js:81-254`) og bruges af både skærm og server. Kompetencetjekket måler mod etapens SLUTTIDSPUNKT, ikke `Date.now()`. Køre-/hviletidstjekket bærer eksplicit forbeholdet om at kun PLANEN kan ses, ikke tachografen — både som data-felt og som synlig UI-tekst.
- Ingen af de fem tjek fandtes skippable fra UI'et.

**Fund fra denne kæde:** se `02` — rå udviklerpaneler på to nøgleskærme, og Planning's ufiltrerede standardliste.

---

## Fleet — chaufførindberetning → kontortriage → planlæg aktivitet → Driftskalender → afslutning/sag

**Verdikt: samme arkitektoniske disciplin som Planning, kæden hænger sammen.**

- Kontor-triage-skærmen (`Indberetninger.jsx`) genererer sine handlingsknapper af den samme tilstandstabel (`FORLOEB`) som håndhæves server-side.
- "Planlæg aktivitet" skriver opgave OG reservation atomisk i ét kald — lukker eksplicit den kendte fælde hvor en opgave uden sin reservation ser fri ud i disponeringen.
- Driftskalenderen (`Vaerkstedskalender.jsx`) filtrerer korrekt på `art === "vaerksted"` og tilbyder både statusskift og sagskobling.
- **Status-ærlighed bekræftet:** en indberetning kan ikke afsluttes ("Afslut") før enten en omkostning er registreret, en indkøbsordre er koblet, eller en eksplicit "ingen omkostning"-begrundelse er givet — knappen er deaktiveret med den konkrete grund indtil da.

**Fund:** stale/modstridende kildekodekommentarer der påstår case-mail ikke er bygget (den er, siden Skive 3D) — forvirrer fremtidige udviklere, ikke slutbrugere. POLISH, se `05`.

---

## Facility — servicebehov → serviceplan → kalender → sag

**Verdikt: BRYDER ved trin 2 (serviceplan). BLOCKER.**

- "Meld fejl" (servicebehov) **live-bekræftet**: opretter en reel fejl, dukker straks op i "Åbne fejl".
- Servicekalenderens læseside (eksisterende besøg, leverandør, status, sagspanel) **live-bekræftet** at virke.
- Sag-oprettelse fra et servicebesøg **live-bekræftet** ende-til-ende: en rigtig sag (FAC-2026-00002) blev oprettet gennem den tomme-tilstand-knap.
- **"Planlæg service" (oprette et NYT servicebesøg) fejler 100 % af tiden**, bekræftet både live og direkte i kildekoden (se `02_BLOCKERS_AND_FRICTION.md` for præcis linje). Kæden kan derfor ikke gennemføres i dag fra "servicebehov" til "serviceplan".

---

## Procure — behov → ordre → evt. godkendelse → rigtig ordremail → modtagelse → fakturamatch/godkendelse

**Verdikt: GENNEMFØRT ende-til-ende, inkl. den nye rigtige afsendelse (Skive 4D).**

Live-verificeret hele vejen, med en rigtig ordre (BST-2026-00044, Hydra-Grene Kolding, 5.370 kr):
1. Behov → bestilling (kladde) — virker.
2. Godkendelse: både den manuelle vej (skiftede rolle til den udpegede godkender, `koordinator`, efter at admin-kontoen korrekt blev afvist som godkender) og den automatiske vej under beløbsgrænsen — begge bekræftet.
3. **"Send ordre"**: dialogen viste modtageren hentet live fra leverandørens stamdata (`kolding@hydra-grene.dk`), et sprogvalg (da/sv/en), beregnet emne og fuld brødtekst. Afsendelse lykkedes; ordren gik fra **Godkendt → Sendt**.
4. Modtagelse ("Markér som modtaget") og fakturamatch/godkendelse (både placerings- og betalingsgodkendelse) virker.
5. Leverandører, inkl. det nye "Sprog for ordremail"-felt, virker som både visnings- og redigeringsfelt.

**Eksplicit bekræftet, som efterspurgt:** den gamle falske "Markér som sendt" findes IKKE længere (bekræftet i kilde: `ORDRE_OVERGANGE.godkendt` har ingen vej til `sendt`; bekræftet live: en godkendt ordres eneste handlinger er "Send ordre" og "Annullér"). Succes-teksten er "Ordren er accepteret til afsendelse." — aldrig "leveret".

---

## Fakturaer — fælles faktura → relation til modul → match → godkendelse → dokumentbilag

**Verdikt: GENNEMFØRT ende-til-ende, inkl. dokumentbilag (gen-verificeret af undertegnede efter en oprindelig, tvetydig rapport fra én af de parallelle undersøgelser).**

- Match/destination/to-trins-godkendelse (placering + betaling) **bekræftet virkende**, med transparente match-signaler og ærlige blokeringsårsager.
- DEV-begrænsningsteksten om manglende malware-scanning **bekræftet vist ordret og korrekt**, præcis hvor den skal stå.
- **Dokumentupload → karantæne → validering → frigivelse → rigtigt kortlivet download-link**: en af de parallelle undersøgelser rapporterede at et uploadet bilag ikke dukkede op igen — undertegnede gentestede dette isoleret (uden samtidig browsertrafik fra andre agenter) og bekræftede at hele kæden virker korrekt: filen gik fra "Behandles" til "Tilgængelig", "Åbn" gav en ægte, korrekt udformet Google Cloud-signeret URL med 5-minutters udløb (`X-Goog-Expires=300`) på den kanoniske sti, og "Deaktivér" virkede og var idempotent (et andet forsøg på at deaktivere en allerede-deaktiveret fil blev korrekt afvist med en klar fejltekst). Den oprindelige rapport skyldtes efter alt at dømme den delte browser-session under de syv samtidige undersøgelser.

**Fund:** flere efterladte, ubekræftede test-uploads ("test-faktura.pdf") sidder fast i "Behandles" (karantæne) fra de samtidige agenters afbrudte forsøg — se `05` (POLISH/DEV-oprydning).

---

## Warehouse — eksisterende kerneflows

**Verdikt: kerneflows virker, ingen BLOCKER.**

Live-bekræftet: varekartotek, bevægelsesregistrering (form + historik), optælling (med ærlig "for lidt grundlag" i stedet for et opdigtet nøjagtighedstal), modtagelse, beholdere, transportlabels, lokationer, afregning (ærlig tom-tilstand), volumenberegner (nægter at fabrikere en manglende takst), sporbarhed, pluk & afsend (formularen åbner og virker, ingen døde knapper). Dashboard-kortets "Nøgletal er endnu ikke tilgængelige" er en ærlig, korrekt sætning — ikke en fejl, men underdriver at modulets EGET hjem har rige, rigtige nøgletal (POLISH, se `05`).

## Unitbooking — eksisterende kerneflows

**Verdikt: kerneflows virker, ingen BLOCKER.**

Live-bekræftet: kalender/gitter med korrekt inklusiv datovisning (og en ærlig afkortnings-markør når en blok strækker sig uden for det synlige vindue), booking/udlån-liste med præcis ét lovligt næste-skridt pr. række (ingen genvej fra Booket til Udlånt), klargør/udlevér/modtag-retur-kæden matcher tilstandstabellen i kilden, delt hylde-struktur konsistent mellem Unitbooking og Warehouse.

---

## Driver (Chaufførapp) — tur/status/offline-kø + indberetning + øvrige V1-funktioner

**Verdikt: en chauffør kunne bruge app'en til sit daglige flow i dag, MED ÉN BLOCKER (leave-request, se ovenfor og `02`).**

Live-bekræftet: chrome-løs `/app`, fire kort, ingen sidebar (med vilje). Turplan viser reelle stop fra disponering, statusknapper pr. stop, en ægte, synlig offline-kø ("X meldinger venter på forbindelse" + reel "Prøv igen nu"-genforsøg). Timeregistrering: ét-knaps ind/ud-skifte, låser en vagt efter udstempling. Indberetning: 8 kategorifliser bekræftet, "Skade" grener korrekt til køretøjs- vs. godsskade før formularen åbnes. **Ingen GPS/positionslækage fundet nogen steder** — både Forside og Turplan siger eksplicit "Der registreres ingen position"/"Der er ingen sporing", og navigation åbner telefonens egen Google Maps i stedet for et internt kort.
