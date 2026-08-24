<title>Data- og permissionpåvirkning</title>

# 04 — Data- og permissionpåvirkning

⚠ **Denne runde er kun planlægning. 0 ændringer i produktkode,
`firebase.rules.json`, Cloud Functions eller data er foretaget for at
producere dette dokument.** Kilder: `FleetControl_V1_product_blueprint.md`,
`00_AUTHORITATIVE_PRODUCT_RULES.md`, `docs/product-audit/04_DATA_OWNERSHIP.md`,
`docs/product-audit/05_ROLES_AND_PERMISSIONS.md`,
`docs/product-audit/10_DUPLICATION_AND_OVERLAP_REPORT.md`, samt direkte
læsning af `src/fleet/moduler.js`, `src/fleet/nav.js`,
`src/fleet/permissions.js` og de relevante uddrag af `firebase.rules.json`.

## Metodenote

For hver blueprint-beslutning der plausibelt rører data eller adgang,
identificerer dette dokument PRÆCIS hvad der skal ændres — og lige så
vigtigt, hvad der IKKE skal:

- **RTDB-nodestruktur / `NODE_MODUL`** (`src/fleet/moduler.js`) — hvilket
  modul en node er spærret til.
- **`firebase.rules.json`** — den udrullede håndhævelse af samme spærring,
  plus eventuelle permission-krav på selve `.read`/`.write`.
- **`permissions.js`/`ROLLE_PERMS`** — hvilke permissions en rolle har som
  standard.
- **Ren UI-omlægning** — `src/fleet/nav.js` (menuplacering, `kraeverModul`,
  `kraeverPerm`) og selve skærmkomponenterne, uden at røre nogen af de tre
  ovenstående.

**Tilføjet efter pre-implementation review (Korrektion 8):** før noget i
dette dokument klassificeres som krævende ny backend (`BACKEND_REQUIRED`),
er det verificeret at ingen eksisterende `.write`-regel eller byggefunktion
allerede dækker behovet. Se afsnittet "Skriveveje verificeret" nedenfor for
de to konkrete eksempler dette rettede i denne runde (Kompetencer,
Medarbejdere).

De fire første kategorier er sikkerhedsrelevante og kræver
`npm run test:rules` (obligatorisk, jf. `CLAUDE.md`) plus
`npm run regler:udrul` — de er ikke "bare en tekstændring i en JSON-fil".
Den sidste kategori er en frontend-omlægning uden sikkerhedskonsekvens.

**Hovedkonklusionen, fastslået allerede her:** langt de fleste MERGE/MOVE-
beslutninger i blueprintet er rene UI-omlægninger, fordi de underliggende
delte noder allerede findes (jf. `04_DATA_OWNERSHIP.md`s dokumentation af
`reolpladser` som eneste to-modul-node, og af `fakturaer`, `satser`,
`opgaver`, `reservationer`, `sager` som bevidst placeret i basen). Det
de-risker en stor del af oprydningsplanen: den ændrer navigation og
sidekomposition, ikke databasens sikkerhedsmodel, i de fleste tilfælde.

---

## Navigationssynlighed — et tredje, uafhængigt lag (Korrektion 1)

Præciseret efter pre-implementation review, og rettende en tvetydighed en
tidligere runde af dette dokumentsæt efterlod: der er ikke to lag i denne
plan (data/regler og UI), men **tre** — og navigationssynlighed er hverken
det ene eller det andet.

- **`permissions.js`/`ROLLE_PERMS`** afgør hvad en ROLLE MÅ. En
  lagermedarbejder har `satser.laes`/`indkoeb.laes`, fordi hans EGNE
  skærme (Warehouse Afregning/Volumen) kræver prisopslag — det gør ham
  IKKE automatisk berettiget til et menupunkt for hele Procure eller
  Bookingopsætning.
- **`firebase.rules.json`** håndhæver samme spærring på selve dataen.
- **Navigationssynlighed er et TREDJE lag**, og det bæres IKKE af de to
  ovenstående og kræver derfor INGEN `permissions.js`/`ROLLE_PERMS`-ændring.
  Mekanismen findes allerede, bygget til dashboards, og skal genbruges
  uændret: `dashboardvisning/<uid>` (`src/fleet/dashboardvisning.js`,
  Cloud Function `dashboardvisningskriv`) har fire egenskaber en fremtidig
  navigationssynlighed skal genbruge PRÆCIS:
  1. Standard = alt tenanten har købt (ingen indstilling = vist).
  2. Kun et eksplicit `false` skjuler noget.
  3. Kan ikke skjule det hele (`skjulerAlt()`-vagten).
  4. **Læses ALDRIG af nogen firebase-regel** — mekanisk garanteret af en
     dedikeret prøve, `test/dashboardvisning.test.mjs`, der fælder enhver
     regel som refererer noden. Filens egen overskrift siger det direkte:
     *"DET ER EN VISNING, IKKE EN ADGANG."*

**Målbillede:** en sideordnet node, fx `navvisning/<uid>`, sat af admin via
samme Cloud-Function-mønster. En fremtidig `test/navvisning.test.mjs` vil
håndhæve de samme fire garantier efter nøjagtig samme mønster som
`dashboardvisning.test.mjs` — én prøve der fælder enhver regel som
refererer noden.

**Det dette afgør konkret i denne plan:** lagermedarbejderens synlighed af
Bookingopsætning/Procure-menupunkter — tidligere et åbent spørgsmål om
hvorvidt det krævede en `PERMISSION_MODEL`-ændring — kræver det **ikke**.
Permissions rører intet; fixet er udelukkende i dette nye visningslag,
sat pr. bruger/preset, præcis som `dashboardvisning` allerede gør det for
dashboards. Samme princip gælder enhver anden "skjul menupunkt X for
rolle Y, uden at ændre hvad Y faktisk må"-beslutning i oprydningsplanen.

---

## Ingen datamodel-ændring nødvendig (ren UI-omlægning)

| # | Beslutning | Hvorfor det er UI-only | Change-type |
|---:|---|---|---|
| 7 | Forslag & reservation → panel i Disponering | Begge skærme viser allerede samme etaper og kalder samme `tjekDisponering()` (`10_DUPLICATION…md`, "Booking → Forslag … / Disponering", risiko "Ingen — dokumenteret som bevidst delt"). Forslaget ligger på etapen (`etaper/<id>/forslag/<id>`), ikke i en selvstændig node. At vise det i et panel frem for en selvstændig route ændrer intet i noden. Ruten bevares som deep link. | VIEW_COMPOSITION + ROUTE_REDIRECT (for den gamle selvstændige route) |
| 10 | Bookingopsætning → Opsætning > Planning | Læser/skriver `satser`/`omkostninger`, begge allerede base/booking-ejede noder med uændret gating (`kraeverPerm: "satser.laes"` i `nav.js` i dag). Kun menuplaceringen flytter. | NAVIGATION_ONLY |
| 14 | Medarbejdere → Opsætning | Allerede placeret der i dag (`nav.js`: `/opsaetning/medarbejdere`). `personale` er en bevidst BASE-node ("enhver abonnementskombination har medarbejdere", `moduler.js` linje 296-298 og `04_DATA_OWNERSHIP.md`). Ingen flytning at foretage — kun verifikation af at placeringen allerede er rigtig, plus CRUD-finish. **Rettet ved Korrektion 8:** `.write` på `personale/$id` tillader allerede redigering/fratrædelse med kun `personale.skriv`, og `PERSONALE_STATUS.fratraadt` er allerede en gyldig tilstand — fratrædelse er en almindelig feltopdatering via samme `gem()`-kald. Ren `VIEW_COMPOSITION`, ikke `BACKEND_REQUIRED`. | NAVIGATION_ONLY (allerede opfyldt) |
| 26 | Godkendelser: policy-opsætning → Opsætning > Procure | `godkendelsesregler` er én post pr. tenant, ejet af `indkoeb`, læst identisk af både Godkendelser- og Fakturaer-skærmen (`10_DUPLICATION…md`: "Ingen reel divergens fundet — begge læser korrekt samme kilde"). Kun UI'et der VISER/REDIGERER reglen flytter til Opsætning; den operationelle kø bliver i Procure og læser stadig samme post. Ingen ny permission — `indkoeb.godkend`/`indkoeb.laes` er uændrede. | VIEW_COMPOSITION |
| 27 | Procure-fakturaer → Fakturaer & bilag (filter=Procure) | Samme `fakturaer`-node, som allerede er `.read`-tilgængelig for enhver tenant-bruger uden modulklausul og uden permission-krav (verificeret direkte i `firebase.rules.json`, linje 2916-2924: kun `auth != null` + tenant-match + aktivt abonnement). De to skærme deler allerede `matchForslag()`/`foreslaaDestination()` (`10_DUPLICATION…md`). Route kan rendes redirecte. | ROUTE_REDIRECT |
| 31 | Udlån → Kalender & udlån | `kasseudlaan` er uændret ejet af `unitbooking`, skrevet udelukkende via `kasseudlaanskriv`. Kun søg-ledig/reservér-panelet flytter ind i kalenderskærmen; samme Cloud Function, samme node. | VIEW_COMPOSITION |
| 33 | Reolpladser → Opsætning > Lagerlokationer (merge med Warehouse Lokationer) | `reolpladser` er allerede eksplicit `NODE_MODUL.reolpladser = ["unitbooking", "warehouse"]` — den ENESTE node i kodebasen med formelt to-modul-ejerskab, skrevet med `flet: true` netop for at de to moduler ikke skal overskrive hinandens felter (`moduler.js` linje 373-382, `04_DATA_OWNERSHIP.md`, `10_DUPLICATION…md`: "et rent, gennemtænkt shared-node-design"). At vise ét vindue i stedet for to ændrer INTET i node eller regler — kun hvilken(e) skærm(e) der renderer den samme kilde. | VIEW_COMPOSITION |
| 41 | Transportlabels → kontekstuel fra Beholdere/Modtagelse | Labelmotoren har ingen egen node — "typen udledes af etapekæden, felterne slås op, intet gemmes" (`nav.js` kommentar ved `warehouseLabels`). At gøre den kontekstuel ændrer ikke noget datalag, kun hvorfra den åbnes. Route bevares som deep link. | VIEW_COMPOSITION + ROUTE_REDIRECT |
| 45 | Lokationer → Opsætning > Lagerlokationer (merge med Unitbooking Reolpladser) | Identisk sag som #33, set fra Warehouse-siden — samme delte `reolpladser`-node. De to blueprint-rækker peger på ÉT sammenlagt vindue over ÉN node, ikke to migreringer. | VIEW_COMPOSITION |
| 48 | Kundepriser → Kundeprofil > Priser-fane | Kundeafvigelsen ligger allerede fysisk på kunden (`kunder/<id>/priser/...`), logget i audit som `objekt: "satser"` (`04_DATA_OWNERSHIP.md`). `kraeverModul: "kunder"` og `kraeverPerm: "satser.laes"` er uændrede i dag (`nav.js` linje 352-357) — kun visningen flytter fra selvstændig topskærm til en fane på kundeprofilen. Deep link bevares. | VIEW_COMPOSITION |

---

## Reel datamodel-påvirkning

### #28 — Leverandører → fælles stamdata (Fleet, Facility, Procure)

Sammen med #3 (Fakturacenter, se nedenfor) er dette nu **en af to**
blueprint-beslutninger i det undersøgte sæt der kræver en reel
`NODE_MODUL`/`firebase.rules.json`/`PERMISSION_MODEL`-ændring. (En
tidligere runde af dette dokument beskrev det som "den eneste" — rettet
ved Korrektion 2/3 i `00_AUTHORITATIVE_PRODUCT_RULES.md`.)

**I dag:** `NODE_MODUL.leverandoerer = "indkoeb"` (`moduler.js` linje 321,
med eksplicit begrundelse: "modsat `fakturaer`, som står i basen fordi to
skærme rører den — en leverandør røres kun af Indkøb"). Den deployede regel
(`firebase.rules.json` linje ~2440) håndhæver **både** modulklausulen
(kræver `moduler/indkoeb === true`) **og** `.read: indkoeb.laes`. Samtidig
dokumenterer både reglens egen kommentar og `04_DATA_OWNERSHIP.md`
eksplicit at noden allerede **læses af elleve skærme, også uden for
Procure**: Disponering, Servicekalender, Arbejdskøen og Værkstedskalender
slår alle op i kartoteket for at vise et leverandørnavn.

**Konsekvens i dag:** en tenant med Fleet og/eller Facility, men UDEN
Procure, får en afvist læsning på `leverandoerer` fra de fire skærme
ovenfor. `useListe`s `modulerForNode()`-mekanisme (beslutning 94) gør det
til en stille `modulMangler`-tilstand snarere end en fejl, men resultatet
er at disse kunder reelt ikke kan se leverandørnavne i deres egne
arbejdsskærme — præcis den tilstand blueprintets "fælles stamdata for
Fleet, Facility og Procure" skal rette.

**Model A vs. Model B (Korrektion 3, begge modeller verificeret i kørende
regler — en tidligere runde af dette dokument overvejede kun implicit
"behold `indkoeb.laes`", uden at stille de to modeller op mod hinanden):**

| | Model A — reolpladser-mønstret | Model B — satser/grundlag/indkoeb/fakturaer-mønstret |
|---|---|---|
| Mekanisme | Inline OR direkte i regelteksten: `moduler/unitbooking === true \|\| moduler/warehouse === true` (`firebase.rules.json` linje ~3109-3110) | Fuldt ugatet base-node + dedikeret kommerciel læse-/skrivepermission, uafhængig af modulkøb |
| Udbredelse i kodebasen i dag | Ét sted (`reolpladser`) — det ENESTE formelle to-modul-ejerskab | Nu fire noder: `satser`, `grundlag`, `indkoeb`(-relaterede), og `fakturaer` (jf. Korrektion 2) |
| Løser semantisk uafhængighed af `indkoeb.laes`? | Nej — kræver stadig en omdøbning for at signalere at Procure ikke ejer dataen alene | Ja, gratis som del af selve mønsteret |

**Valgt: Model B**, af tre grunde (Korrektion 3): (1) det er allerede det
etablerede mønster for præcis denne klasse problem, snart brugt fire
gange; (2) Model A løser ikke problemet ALENE; (3) `moduler.js`s egen
kommentar advarer eksplicit mod at udvide "hører til mindst ét
modul"-mønstret ud over dets ene, bevidste undtagelse (reolpladser): *"en
regel ingen kan læse sig til bagefter, og den slags regler bliver forkert
ændret."*

**Hvad der PRÆCIST skal ændres (punkt 3 er rettet — en tidligere runde
konkluderede "sandsynligvis ingen ændring"; det er forkert):**

1. **`src/fleet/moduler.js` (`NODE_MODUL`):** flyt `leverandoerer` ud af
   `indkoeb`-linjen og ind i basen — en **sjette** navngiven undtagelse ved
   siden af `opgaver`, `satser`, `fakturaer`, `reservationer`, `sager`,
   efter nøjagtig samme begrundelsesmønster ("en node der hører til flere
   modulers arbejdsgange, kan ikke gates af det ene uden at de andre går i
   stykker").
2. **`firebase.rules.json`:** fjern modulklausulen på `leverandoerer`s
   `.read`/`.write`. `npm run test:rules` er obligatorisk efter ændringen
   (jf. `CLAUDE.md`), fordi `test/rules.moduler.test.mjs` udleder de
   håndhævede regler direkte af `NODE_MODUL`-objektet og vil fejle indtil
   de to filer stemmer overens.
3. **`permissions.js`/`ROLLE_PERMS` — RETTET: dette KRÆVER en ændring.**
   Model B betyder dedikerede `leverandoerer.laes`/`leverandoerer.skriv`
   oprettes — IKKE et fortsat lån af `indkoeb.laes`, som en tidligere
   runde antog. Rollefordeling foreslås identisk med Korrektion 2's
   `fakturaer.laes`/`.skriv` (casehandler, disponent, koordinator,
   lagermedarbejder, revisor, admin for `.laes`), i tråd med hvem der
   FAKTISK bruger Disponering/Servicekalender/Arbejdskøen/
   Værkstedskalender i dag (`05_ROLES_AND_PERMISSIONS.md`) — ingen mister
   eller får adgang dag 1, kun navnet på hvad de har afkobles fra Procure.

**Risiko ved migrering:** lav på dataniveau (ingen felter ændres, ingen
poster flyttes — kun en gate der løsnes og en permission der omdøbes), men
sikkerhedsrelevant nok til at kræve fuld regelkørsel og en bevidst
udrulning, ikke en stille redeploy. Den reelle risiko er ikke tab af data,
men (a) at CRUD på leverandører — **rettet ved Korrektion 8:** `.write` på
`leverandoerer/$leverandoerId` tillader ALLEREDE direkte klient-skrivning i
dag, så det er IKKE `BACKEND_REQUIRED`; kun en opret/redigér-FORM mangler i
UI'et (`VIEW_COMPOSITION`) — og (b) at Fleet/Facility-brugere i mellemtiden
kan SE en leverandør de endnu ikke kan RETTE fra UI'et, hvilket er en
ufærdig-flade-risiko af samme klasse som blueprintets regel 10 advarer
imod. Change-type samlet: `PERMISSION_MODEL`/`DATA_MODEL` +
`VIEW_COMPOSITION` (jf. skive 4B i `00_AUTHORITATIVE_PRODUCT_RULES.md`).

### #3 — Fakturacenter som fælles platformfunktion, uafhængig af Procure-abonnement

**SUPERSEDERET af Korrektion 2 (`00_AUTHORITATIVE_PRODUCT_RULES.md`).** En
tidligere runde af dette dokument konkluderede "dette kræver INGEN
`NODE_MODUL`- eller `firebase.rules.json`-ændring, kun en `nav.js`-fix" —
den faktuelle observation var korrekt (`fakturaer` er i dag en af de
bevidst ugatede base-noder, `firebase.rules.json` linje ~2916-2925 kræver
kun `auth != null` + tenant-match + aktivt abonnement, INTET
permission-krav), men konklusionen "derfor intet at gøre ud over nav.js"
er forkert. At GØRE Fakturacenter til en reel, delt platformfunktion
kræver at det åbne spørgsmål lukkes: kodens egen kommentar efterlyser selv
svaret — *"Skal den gates, skal permissionen hedde noget der DÆKKER BEGGE
FORBRUGERE"* (Procure→Fakturaer og Økonomi→Fakturacenter) — og at lade
noden blive stående helt uden permission er ikke en bevidst
arkitekturbeslutning, det er det uafklarede hul koden selv peger på.

Skrivning sker i dag via tre Cloud Functions, alle `indkoeb.*`-gated:
`fakturamatch`/`fakturadestination` (`indkoeb.skriv`), `fakturastatus`
(`indkoeb.skriv` for statusskift, `indkoeb.godkend` for
betalingsgodkendelse).

**Ny, minimal permission-familie** (samme navnekonvention som
`satser.laes`/`grundlag.laes`/`indkoeb.laes`, beslutning 104):

| Permission | Erstatter | Foreslået rollefordeling |
|---|---|---|
| `fakturaer.laes` | (ingen — var åben) | casehandler, disponent, koordinator, lagermedarbejder, revisor, admin |
| `fakturaer.skriv` | `indkoeb.skriv` i `fakturamatch`/`fakturadestination` | casehandler, disponent, koordinator, admin |
| `fakturaer.godkend` | `indkoeb.godkend` i `fakturastatus` (betalingsgodkendelse) | koordinator, admin |

Rollefordelingen er bevidst identisk med hvem der FAKTISK har adgang i dag
under de gamle `indkoeb.*`-navne — ingen mister eller får adgang dag 1,
kun navnet på hvad de har afkobles fra Procure.

**Hvad der PRÆCIST skal ændres (rettet — dette er nu `PERMISSION_MODEL`,
ikke længere ren `NAVIGATION_ONLY`):**

1. **`firebase.rules.json`:** tilføj perm-tjek til `fakturaer`s `.read`
   (i dag intet krav). `npm run test:rules` obligatorisk efter ændringen.
2. **Tre Cloud Functions' interne perm-tjek:** `fakturamatch` og
   `fakturadestination` skifter fra `indkoeb.skriv` til `fakturaer.skriv`;
   `fakturastatus` skifter fra `indkoeb.skriv`/`indkoeb.godkend` til
   `fakturaer.skriv`/`fakturaer.godkend`.
3. **`permissions.js`/`ROLLE_PERMS`:** tilføj de tre nye permissions,
   fordelt som i tabellen ovenfor.
4. **`test/laeseadgang.test.mjs`:** opdatér `LUKKET`-tabellen — den nævner
   i dag slet ikke `fakturaer`, fordi noden bevidst har stået udenfor
   governance-testen som en af "de tre tvetydige noder". Med en reel
   `.laes` skal noden ind under testens dækning som enhver anden gated
   node.
5. **`src/fleet/nav.js`** (stadig nødvendigt, som tidligere beskrevet):
   løft `fakturacenter` ud af `oekonomi`-gruppen til sit eget
   altid-synlige topmenupunkt, i tråd med målbilledets "Fælles: Dashboard
   · Kunder · Fakturaer & bilag · Økonomi / Fakturagrundlag"
   (`00_AUTHORITATIVE…md`), og skift `kraeverPerm` fra `indkoeb.laes` til
   `fakturaer.laes`.

Effekten på hvem der reelt kan se skærmen forbliver i praksis lille —
rollefordelingen ovenfor er identisk med i dag, og chaufføren har siden
beslutning 117 slet ikke adgang til AppShell/sidebaren — men ÆNDRINGEN i
sig selv er sikkerhedsrelevant (en ny `.read`-gate på en tidligere helt
åben node) og kræver fuld regelkørsel og en bevidst udrulning, ikke en
stille redeploy. Change-type: `PERMISSION_MODEL` +
`NAVIGATION_ONLY`/`ROUTE_REDIRECT` (jf. skive 4A i
`00_AUTHORITATIVE_PRODUCT_RULES.md`).

---

## Permission-model påvirkning

### #26 — Godkendelser-policy til Opsætning > Procure

Ingen permission-ændring. Både den operationelle kø (der bliver i Procure)
og opsætningsskærmen (der flytter) læser samme `godkendelsesregler`-post
via samme `usePost(null, "godkendelsesregler")`-kald (`10_DUPLICATION…md`).
`indkoeb.laes` (læs) og hvad end der i dag kræves for at redigere reglen
(ikke fundet som en separat named permission i det læste
`permissions.js`-udtræk — antages dækket af `indkoeb.godkend`/generel
skriveadgang; **IKKE PÅVIST** i detalje i denne runde, bør bekræftes i
Skive 4 før implementering) er uændret af en ren menuflytning.

### #46 — Kunder flyttes ud af Opsætning

Direkte besvarelse af opgavens spørgsmål: **kræver ingen
permission-ændring.** `kunder.laes` (`PERM.kunderLaes`) indgår i
`BASIS_LAES`, som ALLE syv roller får som en del af deres standardsæt —
inklusive `chauffoer` (`permissions.js` linje 359-363, bekræftet for hver
af de syv rolle-presets i linje 377-553). Der findes altså ingen rolle i
dag der IKKE allerede kan læse kundedata; kun `kraeverModul: "kunder"`
(kommerciel spærre — har tenanten overhovedet købt kunde-modulet) afgør om
menupunktet vises, og den er uændret af at flytte det fra Opsætning-grenen
til et nyt topmenupunkt.

**Den ene reelle nuance:** i dag ligger "Kunder" som `kunderOversigt` inde
under Opsætning (`nav.js` linje 338-340), hvor det kun ses af brugere der i
forvejen navigerer ind i en administrativ menu. At gøre det til et
ligeværdigt topmenupunkt ("Kunder — kun når relevant") ØGER dets synlighed
og opdagelighed for alle roller, men ikke deres FAKTISKE adgang — den var
allerede universel via `BASIS_LAES`. Dette er præcis den type ændring
`CLAUDE.md` advarer om at holde adskilt: "navigationssynlighed … er en
ANDEN mekanisme end permissions" — synligheden ændres bevidst, sikkerheden
er allerede der og upåvirket.

### #3 (Fakturacenter) og #28 (Leverandører)

Se de to punkter under "Reel datamodel-påvirkning" ovenfor — begge har en
permission-dimension der er behandlet der for at undgå at sagen splittes
over to sektioner.

---

## Migrationsbehov

**Rettet efter pre-implementation review:** en tidligere runde af dette
dokument fandt "kun ét reelt migrationsbehov af substans" (#28
Leverandører). Det er nu **to**: #28 Leverandører og #3 Fakturacenter (se
begge ovenfor). Fakturacenter kom til ved Korrektion 2, som lukker det
åbne permission-spørgsmål koden selv efterlyser, i stedet for at lade
`fakturaer` forblive helt ugated. Ingen af de to er en datamigrering i
klassisk forstand — ingen felter omdøbes, ingen poster flyttes, intet
slettes:

- **#28 Leverandører** er en **gate-lempelse**: `leverandoerer` flytter
  fra ét modul-ejerskab til basen, på præcis samme måde som
  `reservationer` gjorde det i beslutning 92 (dokumenteret i `moduler.js`
  og `04_DATA_OWNERSHIP.md`s "Steder hvor et modul fejlagtigt ejer
  data"-afsnit) — det historiske forbillede for netop denne klasse
  rettelse i denne kodebase — plus en ny dedikeret
  `leverandoerer.laes`/`.skriv`-permission (Model B).
- **#3 Fakturacenter** er en **gate-stramning i den anden retning**: en
  hidtil helt ugated node (`fakturaer`) får sin første `.read`-permission
  nogensinde, plus at tre Cloud Functions' interne perm-tjek omdøbes fra
  `indkoeb.*` til `fakturaer.*`. Ingen felter på selve fakturaposterne
  ændres.

Dette er i tråd med kodebasens etablerede disciplin (`CLAUDE.md`):

- **Additiv, ikke destruktiv.** Ingen felter fjernes eller omdøbes på
  `leverandoerer`- eller `fakturaer`-posterne. Eksisterende data er
  allerede i den rigtige form; kun læse-/skriveretten (og i
  Fakturacenters tilfælde: hvilken permission der kræves) ændres.
- **Ingen hard-delete, nogensinde** — ikke relevant her, da intet slettes,
  men nævnt for fuldstændighed: ville en fremtidig oprydning ønske at
  fjerne `indkoeb`-ejerskabet helt fra kommentarer/dokumentation, skal selve
  dataen stadig stå urørt.
- **Regelændring kræver `npm run test:rules` FØR commit, ingen undtagelser**
  — også selvom ændringen "kun" fjerner en modulklausul. `CLAUDE.md` er
  eksplicit om at netop den slags — en tilsyneladende lille
  regelændring — historisk har været den fejltype der overlevede måneder
  udeteceret, fordi ingen kørte suiten.
- **Udrulning er et separat trin fra filændringen** — `npm run
  regler:udrul`, ikke `firebase deploy` alene, jf. beslutning 29.

**Ingen andre af de 16 vurderede beslutninger kræver et migrationsskridt.**
Det skal siges ærligt, fordi opgaven bad om det: langt størstedelen af
blueprintets MOVE/MERGE-rækker er navigations- og komponent-omlægninger
oven på data der allerede er korrekt formet og korrekt delt.

---

## Fravær → reservation (Korrektion 9) — ny kalder, ikke ny mekanisme

Ikke en af de 16 vurderede MOVE/MERGE-beslutninger, men rejst i denne
runde fordi blueprintet forudsætter at et godkendt fravær kan blokere
ressourcer (ligesom en booking, et værkstedsbesøg eller en facility-sag
gør det i dag). Den fremtidige skrivning genbruger den **eksisterende**
delte reservationsmotor (`src/fleet/reservations.js`, spejlet i
`functions/delt/reservations.js`): `reserver(db, path, ny, opts)`,
`tjekLedig()`/`tjekLedigMod()`/`tjekLedigIndesluttet()`, og en
`PRIORITET`-tabel der **allerede indeholder** `fravaer: 30` (mellem
`vaerksted: 40` og `facilitySag: 20`) — fraværsprioriteten er altså
allerede designet ind i motoren, ubrugt indtil videre. Mønsteret for at
koble en ny kilde på er etableret to gange (`reservationFraOpgave()`,
`reservationFraAftale()`), og en fremtidig `reservationFraFravaer(post)`
følger samme mønster: en ny, lille byggefunktion der kalder den SAMME
delte `reserver()` — **ikke** en femte, selvstændig
reservationsmekanisme. `PRIORITET.fravaer = 30` kræver ingen ændring.

Dette sænker risikoprofilen sammenlignet med "endnu en uafhængig skriver
ind i en delt node" — men sænker den ikke til nul, og det er værd at
flage (jf. `05_IMPLEMENTATION_SLICES.md`s egen risikoanalyse):
`reservationer` er netop den base-node hvor en historisk mis-gating
faktisk skete (beslutning 92 — `nordvest`-kunden havde 37 reservationer
låst, fordi noden fejlagtigt stod som bookingens alene). Enhver NY kilde
ind i den delte node fortjener samme omhu som de fire eksisterende, selv
om motoren og prioritetstabellen begge er genbrug. Ingen `NODE_MODUL`-
eller `firebase.rules.json`-ændring er identificeret i denne runde — kun
en ny Cloud Function/byggefunktion, når fraværsgodkendelse rent faktisk
bygges.

---

## Planning-dashboard (Korrektion 6) — additiv katalogudvidelse

Heller ikke en af de 16 vurderede MOVE/MERGE-beslutninger, men relevant
for datapåvirkning: `DASHBOARDS`-kataloget (`src/fleet/dashboards.js`,
i dag 7 indgange: Samlet, flaade, facility, indkoeb, warehouse,
unitbooking, bemanding) får en ny `{ key: "booking", label: "Planning" }`-
indgang. Dette er en **additiv** ændring — en ny post i et array — ikke en
brydende datamodel-ændring. Det underliggende KPI-domæne
`kpi.disponering` (modul `booking`, kilde `etaper`, beregnet af
`disponeringstal()` i `kpi-aggregering.js`) findes allerede og er reelt
(ikke `null`), så der skal ikke bygges ny aggregeringslogik — kun
eksponering via kataloget plus en ny dashboardskærm-komposition
(`VIEW_COMPOSITION`) der samler bookinger uden plan (samme kilde som
Booking-oversigtens eksisterende læsning), forslag/godkendelser der
kræver handling (samme kilde som Oversigtens "Kræver handling"-liste), og
det allerede beregnede `kpi.disponering`-domæne. Ingen permanente
demo-KPI'er, og ingen ny `PERMISSION_MODEL`- eller `NODE_MODUL`-ændring.

---

## Sammenfatning: hvilke MOVE/MERGE-beslutninger er "gratis" vs. "koster"

| Blueprint-# | Beslutning | Kræver DATA_MODEL/PERMISSION_MODEL-ændring? | Hvis ja, hvad |
|---:|---|---|---|
| 3 | Fakturacenter → fælles platformfunktion, uafhængig af Procure | **Ja** (rettet ved Korrektion 2 — tidligere runde sagde "Nej") | `fakturaer` er i dag ugated på `.read` (intet permission-krav overhovedet) — det er selve hullet der skal lukkes. Ny `fakturaer.laes`/`.skriv`/`.godkend`; ny `.read`-gate i `firebase.rules.json`; tre Cloud Functions (`fakturamatch`, `fakturadestination`, `fakturastatus`) omdøbes fra `indkoeb.*` til `fakturaer.*`; `test/laeseadgang.test.mjs`s `LUKKET`-tabel opdateres; plus `nav.js`: løft ud af `oekonomi`-gruppen, skift `kraeverPerm` til `fakturaer.laes`. |
| 7 | Forslag & reservation → panel i Disponering | Nej | Samme `etaper/forslag`-node, samme `tjekDisponering()`. Ren VIEW_COMPOSITION. |
| 10 | Bookingopsætning → Opsætning > Planning | Nej | Samme `satser`/`omkostninger`, uændret `kraeverPerm`. Ren menuflytning. |
| 14 | Medarbejdere → Opsætning | Nej | Allerede korrekt placeret; `personale` er allerede base. Kun verifikation. |
| 26 | Godkendelser-policy → Opsætning > Procure | Nej | Samme `godkendelsesregler`-post, samme permissions; kun UI splittes i kø (Procure) + opsætning (Opsætning). |
| 27 | Procure-fakturaer → Fakturaer & bilag (redirect) | Nej* | Samme `fakturaer`-node. Ren ROUTE_REDIRECT — routingen selv koster intet. *Arver dog automatisk den nye `fakturaer.laes`-gate fra #3/Korrektion 2 når den slice lander; ingen selvstændig permission-arbejde for #27. |
| 28 | Leverandører → fælles stamdata (Fleet/Facility/Procure) | **Ja** | Model B valgt (Korrektion 3), ikke reolpladser-mønstrets inline OR: flyt `leverandoerer` fra `NODE_MODUL.indkoeb` til basen — bliver **6. bevidst ugatede base-node**; fjern modulklausul i `firebase.rules.json`; **ny** dedikeret `leverandoerer.laes`/`.skriv` (IKKE et fortsat lån af `indkoeb.laes`, som en tidligere runde antog). Kræver `npm run test:rules` + `regler:udrul`. |
| 31 | Udlån → Kalender & udlån | Nej | Samme `kasseudlaan`-node/funktion. Ren VIEW_COMPOSITION. |
| 33 | Reolpladser → Opsætning > Lagerlokationer | Nej | `reolpladser` er allerede formelt to-modul-ejet (`["unitbooking","warehouse"]`), `flet: true`. Ren VIEW_COMPOSITION. |
| 41 | Transportlabels → kontekstuel | Nej | Ingen egen node i dag. Ren VIEW_COMPOSITION/ROUTE_REDIRECT. |
| 42 | Afregning → Økonomi > Fakturagrundlag > Warehouse | Nej* | Samme `bevaegelser`/`grundlag`. *Kræver at det eksplicitte `kraeverModul: "warehouse"` bevares på selve menupunktet, da det mister den implicitte arv fra Warehouse-gruppen ved at blive reparentet. |
| 43 | Volumen → Kunder & Priser > Lagerkalkulator | Nej* | Samme `satser`-opslag. *Samme forbehold som #42 — eksplicit `kraeverModul: "warehouse"` skal tilføjes ved reparentering. |
| 45 | Lokationer → Opsætning > Lagerlokationer (merge m. Reolpladser) | Nej | Identisk sag som #33 — samme node, set fra den anden skærm. |
| 46 | Kunder → ud af Opsætning | Nej | `kunder.laes` er allerede i `BASIS_LAES` for alle 7 roller. Kun synlighed/opdagelighed ændres, ikke adgang. |
| 47 | Standardpriser → Opsætning > Priser | Nej | Allerede korrekt placeret i `nav.js` i dag (`/opsaetning/priser`). Kun verifikation. |
| 48 | Kundepriser → Kundeprofil > Priser-fane | Nej | Data ligger allerede på kunden (`kunder/<id>/priser`), uændret `kraeverModul`/`kraeverPerm`. Ren VIEW_COMPOSITION. |

**Total (rettet efter pre-implementation review): 14 af 16 vurderede
beslutninger er "gratis" (ingen DATA_MODEL- eller PERMISSION_MODEL-ændring)
— 2 (#3 Fakturacenter og #28 Leverandører) kræver reelt arbejde i
`firebase.rules.json`/`PERMISSION_MODEL`. En tidligere runde af dette
dokument talte kun #28 og friede #3 med "kun en `nav.js`-fix" — det var en
korrekt observation om dagens ugatede tilstand, men en forkert konklusion
om hvad der kræves for at gøre Fakturacenter til en reel, forsætligt delt
platformfunktion (Korrektion 2). Ingen af de to koster en feltmigrering:
#28 er en gate-lempelse (modulklausul fjernes), #3 er en gate-stramning (en
hidtil helt åben `.read` får sit første permission-krav) — begge erstatter
desuden Procure-specifikke `indkoeb.*`-navne med domænespecifikke
(`leverandoerer.*`/`fakturaer.*`) permissions, samme mønster begge veje.**
