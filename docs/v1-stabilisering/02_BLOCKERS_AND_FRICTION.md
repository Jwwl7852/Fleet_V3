# Blockers og High Friction

Kun de to alvorlighedsgrader der reelt kan stoppe eller forvirre en almindelig bruger. POLISH og FUTURE FEATURE står i `05_POLISH_AND_FUTURE_BACKLOG.md`.

---

## BLOCKER

### B1 — Facility: "Planlæg service" kan aldrig gennemføres

**Skærm/rute:** Facility → Servicekalender → "Planlæg service"
**Reproduktion:** 100 %, ethvert forsøg, enhver ressource. Fejler med "Kunne ikke nå serveren. Intet blev ændret."

**Rodårsag (verificeret direkte i kildekoden, uafhængigt af den rapport der først fandt det):**
`functions/index.js:3950` kalder `reservationFraOpgave(post)` — men opgavens id genereres først otte linjer senere, `functions/index.js:3995` (`rod.child("opgaver").push().key`). `reservationFraOpgave()` (`src/fleet/opgaver.js:271-320`, feltet sat på linje 314) sætter `kilde.id: opgave.id` — som derfor ALTID er `undefined` på kaldetidspunktet. Dette `undefined`-felt skrives direkte ind i en RTDB `update()` på `functions/index.js:4000-4007`, og Firebase Admin SDK'ets `update()` kaster synkront på et hvilket som helst `undefined`-felt i sit argument.

**Konsekvens:** ingen tenant kan oprette et nyt servicebesøg gennem UI'et. Servicebehov → sag virker (afprøvet live); serviceplan er det trin der er brudt.

**Rettelsens form (til stabiliseringsarbejdet, IKKE udført i denne audit):** generér `opgaveId` FØR `reservationFraOpgave(post)` kaldes, og send id'et med ind (eller byg `kilde` om efter kaldet). Lille, lokal rettelse — ingen anden funktion deler dette mønster forkert (`opgaveplanlaeg`, den analoge Fleet-funktion, genererer sit id i korrekt rækkefølge).

---

### B2 — Chaufførapp: "Anmod om frihed" lover et svar der aldrig kan komme

**Skærm/rute:** Chaufførapp → Anmod om frihed (`src/moduler/app/Frihed.jsx`)

Skærmens egen tekst siger: *"Kontoret svarer her i appen — ikke på mail."* Et klik skriver en ægte `ansoegning`-post (status `"ansoegt"`) til databasen (`src/fleet/fravaer.js`, `byggAnsoegning()`, linje 302-314). Men **intet kontor-vendt skærmbillede læser eller kan besvare den**: en gennemgang af hele kodebasen finder kun to filer der overhovedet nævner `ansoegning` — datamodellen selv, og chaufførens egen indsendelsesskærm. Den eksisterende office-skærm `src/moduler/Fravaer.jsx` læser aldrig `f.ansoegning`, viser ingen "afventer"-indikator, og har ingen godkend/afvis-handling. `Medarbejdere.jsx` nævner det slet ikke.

**Hvorfor det er en BLOCKER og ikke en ærligt afsløret mangel:** andre steder i produktet, hvor noget bevidst ikke er bygget (fx Kompetencers "Overrul med begrundelse", Opsætnings skrivefunktioner), er knappen enten deaktiveret med en synlig begrundelse, eller skærmen siger direkte at funktionen ikke findes endnu. Her sker det modsatte: en aktiv knap, en reel databaseskrivning, og en tekst der lover noget systemet ikke holder.

**Rettelsens form (IKKE udført):** enten (a) byg en synlig kø/godkend-handling for `ansoegning` på `Fravaer.jsx` (den skærm der allerede findes og allerede viser fraværslisten), eller (b) hvis det er for stort til denne stabiliseringsfase, ret skærmens egen tekst så den ikke påstår et ikke-eksisterende svarløfte, og markér funktionen tydeligt som ikke færdig — samme mønster som resten af produktet allerede bruger konsekvent.

---

## HIGH FRICTION

### F1 — Rå udviklerpaneler permanent synlige på Planning's to vigtigste skærme
**Skærm:** `/booking/ny` (NyForespoergsel.jsx:279-320), `/booking/forslag/:id` (Forslag.jsx:420-483, 585-659)
For enhver rolle, ikke bagom et dev-flag: raw permission-strenge (`booking.opret`), et bogstaveligt funktionsnavn (`kanSkifteEtape()`), en rå Firebase-UID, og rå RTDB-nøgler/tidsstempler vises i selve hovedindholdet. Live-bekræftet via skærmbillede. Dette er de to skærme en casehandler/koordinator bruger allerede i dag.

### F2 — Planning's standardliste er ufiltreret og blander Fleet-værkstedsopgaver ind
**Skærm:** `/booking` (Oversigt.jsx:184)
I modsætning til Fleets egen Driftskalender (som korrekt filtrerer `art === "vaerksted"`), læser Planning's egen opgaveliste hele `opgaver`-noden uden filter. Live-bekræftet: standardfanen viser rækker som "Serviceeftersyn 250.000 km — Bil 78" under en overskrift der lover "Fra forespørgsel til udført arbejde." En bruger der lander her, ser ikke transportbookinger.

### F3 — Navigation er gated på modulkøb, ikke på rolle — flere roller ser skrivehandlinger de ikke må bruge
Disponent, revisor og casehandler ser fulde Warehouse/Unitbooking-menuer uden at have nogen af de tilhørende `.skriv`-permissions. Afvisningen sker eksplicit og forklarende server-side ("Serveren afviser — det er ikke en fejl", live-bekræftet), så det er ikke en sikkerhedslæk — men det er en dør der aldrig kan åbnes, og som en ny bruger ikke kan se er lukket, før han har prøvet. Erkendt og dokumenteret i selve kildekoden (`src/fleet/nav.js:472-503`) som en bevidst afvejning — nævnes her fordi den påvirker en almindelig brugers første indtryk.

### F4 — Godkend/Afvis-knapper i Procure viser kun deres afvisningsgrund i en hover-tooltip
**Skærm:** Godkendelser (`src/fleet/procure.js:735`)
Når den loggede bruger ikke er reglens udpegede godkender, er knapperne korrekt deaktiverede — men grunden står KUN i `title`-attributten, ikke som synlig tekst. Let at læse som "knappen er i stykker" i stedet for "jeg må ikke dette."

### F5 — Facility: en seedet demo-sag peger på en sag der ikke findes
**Skærm:** Servicekalender → sagspanel, besøget "Port 3" (Crawford Døre & Porte)
Viser "Sagen findes ikke længere, eller kunne ikke hentes" — læses som datatab af en rigtig bruger, men er et hul i seed-dataet, ikke en kodefejl (den korrekte, ægte tom-tilstand — "der er endnu ikke oprettet en sag" — virker fint og blev brugt til at oprette en rigtig sag under denne audit). Ret seed-dataet, eller fjern den dinglende reference, før DEV bruges til en demo.

### F6 — 4C's dokumentkarantæne kan efterlade permanent hængende poster
Flere `test-faktura.pdf`-uploads fra de samtidige undersøgelser under denne audit sidder fast i "Behandles" (karantæne) og kommer aldrig videre, fordi upload-til-bekræft-kæden blev afbrudt midtvejs af browser-kontention. Selve mekanismen virker korrekt når den ikke afbrydes (gen-verificeret, se `01`) — men der findes ingen synlig vej til at rydde op i eller genforsøge en hængende karantænepost. Ikke en blocker (ingen bruger rammer det ved normal brug), men værd at kende før DEV bruges til en demo, og værd at overveje en oprydnings-/udløbsmekanisme for senere.

### F7 — Koordinator-rollen samler fire uafhængige godkendelsesmagter i ét login
Booking-godkendelse, grundlag-godkendelse, indkøbs-godkendelse og faktura-godkendelse samt sagsafslutningsskøn (karantænefrigivelse, aftalebekræftelse, ekstern mailafsendelse) ligger alle på samme rolle. Hver enkelt kobling er begrundet i kildekoden, og ingen af dem er en fejl — men den samlede blast radius af én kompromitteret koordinator-konto bør være et bevidst tilvalg fra produktejeren, før rigtige kunder onboardes. Ikke en blocker for intern DEV-test.
