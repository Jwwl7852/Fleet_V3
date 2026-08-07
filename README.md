# FleetControl 3.0

Samlet platform. Én shell, én informationsarkitektur, én talkilde.

Udgangspunktet var 20 mockups fordelt på tre uforenelige designretninger og en
deployet v1.4 på bookingcontrol.netlify.app. v3.0 samler dem. Alt der stod i
konflikt er afgjort — beslutningerne står nedenfor, så du kan omgøre dem
enkeltvis i stedet for at skulle finde ud af hvorfor noget ser ud som det gør.

## Kom i gang

```bash
npm install
cp .env.example .env.local          # DEV-nøgler. Ikke prod.
git config core.hooksPath .githooks # kører regeltesten før commits der rører reglerne
npm run dev
```

**Der er to Firebase-projekter.** `fleetcontrol-dev-1ac1c` er til at smide væk;
`fleetcontrol-98e11` er rigtige kunders data.

Som ny udvikler peger du på **DEV**. `.env.example` gør det allerede, og det
skal din `.env.local` også.

**Produktionsnøglerne findes kun i Netlify.** De hører ikke hjemme i en
`.env`-fil på nogens maskine, og de står derfor heller ikke i `.env.example`.
Skal du fejlsøge mod produktionsdata, så tag en kopi ned i DEV.

Appen udleder miljøet af projekt-id'et og viser en bjælke i toppen, når du
ikke er på produktion. Havner produktionsnøgler alligevel et sted de ikke
hører hjemme — en laptop eller en deploy-preview — bliver bjælken rød og
stribet.

**DEV har ingen Storage-bucket.** Den kræver Blaze, og DEV står på Spark.
Skal en skærm uploade filer, skal projektet opgraderes, bucket'en oprettes i
`europe-west1` (samme region som PROD — den kan ikke ændres bagefter), og der
skal sættes en budgetalarm samtidig. Ikke bagefter.

`core.hooksPath` skal sættes **én gang pr. klon** — hooks følger ikke med i
git. Uden den kan man committe en ændring i `firebase.rules.json` uden at have
kørt testen, og det er præcis sådan reglerne kunne ligge ugyldige fra
fundamentet uden at nogen opdagede det. Hooken kører kun når regelfilen er i
det stagede diff, så almindelige commits er upåvirkede.

Uden `.env.local` kører appen i demo-mode med datasættet i `src/fleet/useKpi.js`.
Ingen hvide skærme, ingen crash.

Deploy: Netlify, `npm run build` → `dist`. `netlify.toml` indeholder
SPA-fallback — uden den giver et direkte hit på `/booking/disponering` en 404.

**Første skridt, før du koder videre:** `git init` og en commit. 26 ruter deler
`src/fleet/` — én fejl i kernen tager hele platformen ned samtidig, og uden
version control kan du ikke rulle tilbage.

## Beslutninger

Hver af disse løste en konflikt mellem mockupsene. Vil du omgøre en, står det
i den nævnte fil.

| # | Beslutning | Hvorfor | Fil |
|---|---|---|---|
| 1 | **Flad sidebar med undermenuer. Ingen topfaner.** | Designsættet havde tre navigationsmodeller. Varianten med otte topfaner overlappede sidebaren: Service/Værkstedskalender, Lastbiler/Fleet Management, Booking/Booking — 17 elementer der pegede på hinanden. | `fleet/nav.js` |
| 2 | **Beløb i hele øre, altid ekskl. moms.** `momsOere` er et separat felt. | Procure og Flåde viste inkl. moms, Økonomi skrev "ekskl. moms". Blandes de, lægges inkl.-tal sammen med ekskl.-tal i en rapport. | `fleet/format.js` |
| 3 | **Afvigelser gemmes som (faktisk − budget).** Farven bestemmes af `betterWhen`, ikke fortegnet. | `+18.400` var rødt i Økonomi og `-18.400` rødt i Kunder & Priser. Og budgetafvigelsen stod som både `-72.560` og `+72.560` på samme side. | `fleet/format.js` |
| 4 | **Én reservationsnode.** Booking, værksted, facility-sag og fravær skriver alle til den. Værksted og fravær har højere prioritet end booking. | Tre kalendere der ikke kunne se hinanden. En bil kunne bookes til Hamburg samtidig med at den stod på værksted. | `fleet/reservations.js` |
| 5 | **Booking er en tilstandsmaskine med tre roller.** Disponenten må ikke godkende sit eget forslag. | Mockuppen viste alle tre knapper åbne for alle. Uden rolletjek er koordinatorleddet dekoration. | `fleet/booking-state.js` |
| 6 | **Nøgletal læses fra én aggregeret node.** Afledte tal beregnes hos forbrugeren. | Dashboard sagde 3 servicepunkter, Facility sagde 18. Kapacitetsgrad var 84 % og 83 %. Fakturaer til godkendelse 2 og 7. | `fleet/useKpi.js` |
| 7 | **Satser versioneres med `gyldigFra` og overskrives aldrig.** Hver booking gemmer et snapshot. | "Senest opdateret" tydede på overskrivning. Retter du km-prisen, ændrer alle historiske bookingers estimat sig — og så kan en faktura fra sidste kvartal ikke forklares. | `fleet/pricing.js` |
| 8 | **Ét nummerformat: `PRÆFIKS-ÅÅÅÅ-NNNNN`.** Fra counter i en transaction. | Fire formater i brug: `BKG-2026-00125`, `PO-2405-0876`, `WO-2024-0587`, `INV-2405-0132`. To brugte YYMM, to fuldt år. | `fleet/booking-state.js` |
| 9 | **Gods/Bus gælder hele platformen.** | Toggle fandtes kun på Økonomi-skærmen i v2.0, men på alle sider i v1.4. | `fleet/AppShell.jsx` |
| 10 | **Accent er `#125bec`.** | Appen brugte `#1f5eff`, logoet og mockupsene `#125bec`. To blå tæt nok på at ligne en fejl. | `fleet/fleet.css` |
| 11 | **Driftsomkostning pr. km ≠ kalkulationspris pr. km.** | Flåde viste 3,42 kr/km, Bookingopsætning 8,40 kr/km. Begge hed "kr/km". Den ene er uden chauffør, den anden med. | `moduler/flaade/Oversigt.jsx` |
| 12 | **De to Flåde-værkstedsskærme er slået sammen.** | Næsten identiske: begge havde værkstedskalender, fakturaformular og historik. To steder at uploade samme faktura. | `moduler/flaade/Vaerkstedskalender.jsx` |
| 13 | **Live-kort er beholdt.** | Findes deployet på `/tracking`, men mangler i alle 20 mockups. Du var ved at taste en funktion væk du allerede har bygget. | `moduler/booking/LiveKort.jsx` |
| 14 | **`indkoebsprisafvigelse` og `salgsprisafvigelse` — aldrig bare "prisafvigelse".** Leverandørsiden har `betterWhen: "lower"`, salgssiden `"higher"`. | Samme fejl som nr. 11: to tal med hvert sit fortegn for "godt" hed det samme. Indkøb betaler for meget = dårligt; en kunde betaler for lidt = også dårligt — men det ene er plus og det andet minus. Blandes de, farves halvdelen forkert. | `fleet/useKpi.js` |
| 15 | **Division er et felt, ikke en sti.** Tre værdier: `gods`, `bus`, `faelles`. Transaktioner hører til én afdeling; stamdata kan være fælles; reservationer og fravær har ingen division og arver fra ressourcen. | Sti ville give to kalendere for én chauffør med C+D — beslutning 4's fejl et niveau højere oppe. Dertil to `BKG-2026-00125`, to Kolding Kommune-poster der driver fra hinanden, og en dieselfaktura der ikke kan afstemmes mod leverandørens total. | `fleet/useListe.js` |
| 17 | **`securityLevel` og klassificerede søskendenoder.** `normal` \| `internal` \| `confidential` \| `restricted` på general. Følsomme felter ligger i `sensitive/<objekt>/<id>`, værdiansættelser i `vaerdi/<objekt>/<id>` — som søskende, ikke som børn. | En `.read` kaskaderer og kan ikke indsnævres på et barn. Som barn ville `.read` skulle flyttes ned på `<id>/general`, og så kan man ikke længere forespørge på noden — der ville ingen bookingliste være. Søskende koster ét ekstra opslag på en detaljeskærm og nul på en liste. Se afsnittet nedenfor. | `fleet/permissions.js` |
| 16 | **Kombi-transport: en booking er et forløb med N etaper.** Tilstanden ligger på etapen, ikke på bookingen. `aaben` er en tilstand med frist. Lageret er en kapacitetsressource i den samme reservationsnode. Etaper ligger som **egen node** — se afsnittet nedenfor. | Gods kan afhentes af én bil, stå på eget lager i uger, og køre videre med en anden. Etape 1 kan være reserveret mens etape 2 venter på en passende tur. Uden etaper skulle bookingen have én tilstand for to ting der sker på hver sin tid. | `fleet/booking-state.js` |

### Beslutning 17 i detaljer

**Dette er den første bevidste stramning i den låste rækkefølge.** Punkt 3
skiftede mekanisme — fra rolle-streng til permission-liste — uden at ændre
hvem der måtte hvad. Trin 2 af punkt 5+6 flytter faktisk adgang: en disponent
kan ikke længere se vurderingen på godset, og kun admin kan se årsagen til et
fravær.

Den er **gratis nu**, fordi felterne ikke findes i data endnu. Med kunder i
drift ville den have været en migrering — man skulle flytte felter ud af
eksisterende poster, mens skærme læste dem. Det er hele grunden til at gøre
det på det her tidspunkt.

**Kaskadebruddet er forudsætningen.** RTDB's `.read` kaskaderer og kan ikke
indsnævres på et barn, så en `.read` på `bookinger` ville også dække et
`bookinger/<id>/sensitive`. Men flytter man `.read` ned på
`bookinger/<id>/general`, kan man ikke længere *forespørge* på `bookinger` —
RTDB kræver læseadgang på den node man forespørger på, og så findes der ingen
bookingliste. Derfor ligger det klassificerede som **søskende**, ikke som barn:

```
tenants/<t>/bookinger/<id>              general + securityLevel
tenants/<t>/sensitive/bookinger/<id>    securityInformation, privatePickupAddress, sensitiveNotes
tenants/<t>/vaerdi/bookinger/<id>       cargoValue
```

Det koster **ét ekstra opslag på en detaljeskærm og nul på en liste.** Følsomme
data vises ikke i lister; skal en skærm bruge dem pr. række, er det reelt en
eksport, og en sum hører i `kpi/`.

**`sensitive` og `vaerdi` er sideordnede, ikke trin.** `booking.sensitiveLaes`
giver ikke `booking.vaerdiLaes`. Disponenten skal vide at godset kræver
følgebil — ikke at det er 18 millioner værd. Sikkerhedsinformation der ikke når
frem til planlæggeren, er en fælde frem for en beskyttelse; en vurdering der
når længere end nødvendigt, er en lækage.

**Presets er udgangspunkter, ikke lov.** Fordelingen nedenfor er hvad en ny
tenant får ved oprettelse. En kunde skal kunne fjerne `booking.vaerdiLaes` fra
sin disponent-rolle uden at nogen skriver kode — rollernes indhold ligger i
`tenants/<t>/roller/`, ikke i `permissions.js`. Se ARKITEKTUR.

| Rolle | sensitive | vaerdi |
|---|---|---|
| chauffoer, casehandler, revisor | – | – |
| disponent | booking, koeretoejer | – |
| koordinator | booking, koeretoejer, kunder | booking |
| admin | alle | alle |

Fraværets årsag — sygdom mod ferie er helbredsoplysning efter GDPR art. 9 —
har **kun admin**. Disponeringen skal vide *at* chaufføren er utilgængelig,
ikke hvorfor.

`securityLevel` (`normal` | `internal` | `confidential` | `restricted`) står på
general, så en liste kan vise en hængelås uden at hente noget klassificeret.

### Beslutning 16 i detaljer

Skærmene bygges senere. Datamodellen er afgjort nu, fordi den er dyr at ændre
bagefter.

**Hvorfor `etaper` er en egen node og ikke ligger under bookingen.**

Læs det her, før du "rydder op". En løs node med et `bookingId` ligner noget
der er blevet glemt, og den næste der ser den, vil flytte den ind under
`bookinger/<id>/etaper/`. Lad være.

RTDB kan kun forespørge på **børnene af én node**. Ligger etaperne under hver
sin booking, findes der ingen forespørgsel der svarer på *"hvilke etaper er
åbne lige nu?"* — og det er præcis det spørgsmål matchningen stiller hver gang
en tur oprettes eller ændres. Svaret ville være at hente samtlige bookinger med
samtlige etaper ned og lede i klienten. Det er den egress-fejl hele
`ARKITEKTUR.md`'s egress-afsnit og `useListe` er bygget for at undgå, og den
vokser med historikken: jo flere afsluttede forløb, jo dyrere bliver det at
finde de tre åbne.

Som egen node er det ét indekseret opslag:
`etaper.orderByChild("tilstand").equalTo("aaben")`.

Prisen er en fremmednøgle at holde styr på. Det er den værd.

**Hvorfor etaper ikke bare er `opgaver` med et `bookingId`.** Fordi
`opgaver.status` er et andet statsmaskineri (indberettet → planlagt → igang →
udført) end bookingflowet (kladde → afventerPlan → afventerKoord → reserveret).
Ét `status`-felt med to betydninger er nøjagtig fejlen fra beslutning 11 og 14.
Disponering læser begge noder.

**Tre fejl fra prototypen, lukket i modellen:**

1. *Planner-estimatet manglede lagerdage,* mens den endelige beregning havde
   dem — estimatet var systematisk for lavt. `beregnForloeb()` udelader aldrig
   lagerdagslinjen, og når afgangen er ukendt, bruges etapens frist. Estimatet
   fejler nu for **højt**, hvilket er den rigtige retning.
2. *Den valgte bil var uenig med sig selv:* DE-QR 777 med afgang 28/6 i
   reservationstabellen, DE-KL 404 den 24/6 i timelinen og i svaret til
   koordinatoren. Årsagen var ikke en tastefejl, men at svaret og
   reservationen var to poster. Nu skrives etapens `koeretoejId` og dens
   reservation i **én transaktion**, og timelinen læser reservationen — ikke en
   kopi. Beslutning 4 og 6 anvendt på etaper.
3. *"På lager nu 11 · 6 endnu ikke ankommet"* var tvetydigt om de 6 var en
   delmængde. To disjunkte tal, `paaLagerNu` og `forventetAnkomst`, og ingen
   total der kan læses som indeholdende begge.

Prototypens sidebar med topfaner og brandfarven `#f5a300` overtages ikke.
Beslutning 1 og 10 gælder uændret.

## Struktur

```
src/
  App.jsx              alle 27 ruter, genereret efter nav.js
  firebase.js          ÉN initialisering. Moduler importerer db herfra.
  fleet/               kernen — modulerne må ikke duplikere noget herfra
    nav.js             sidebar + ruter, én kilde
    AppShell.jsx       layout: sidebar, topbar, Outlet
    FleetContext.jsx   tenant, periode, Gods/Bus
    useKpi.js          nøgletal + demo-datasæt
    format.js          øre, datoer, ugenr, fortegnskonvention
    pricing.js         prismotor: satsopslag, beregning, snapshot
    reservations.js    reservationer + konfliktdetektion
    permissions.js     permission-katalog + rolle-presets. Ingen imports:
                       samme kilde som den Cloud Function der udsteder claims
    audit-regler.js    auditpolitik: vokabular, feltallowliste, før/efter,
                       retention. Ingen imports — samme grund
    audit.js           audit.log() / audit.laes(). Kaster aldrig
    booking-state.js   tilstande, overgange — spørger efter permission
    ui.jsx             Kort, KpiKort, Tabel, Pille, Tom, Fejl, Knap
    fleet.css          tokens (udvider de eksisterende --bc-*)
  moduler/             26 skærme
```

## Status

**Bygget (5):** Dashboard (referencemodul — start her når du skriver et nyt),
Bookingopsætning (prismotoren i brug), Kunder & Priser (første forbruger af
`useListe`), Økonomi & Rapporter (`Soejlegraf`), Bemanding.

**Skelet med mockup (11):** Booking-oversigt, Ny forespørgsel, Forslag,
Disponering, Flåde, Værkstedskalender, Facility ×3, Indkøb ×2.

**Skelet uden mockup (11):** **Medarbejdere**, Live-kort, Kompetencer,
Ferie & fravær, Indberetninger, Leverandører, Fakturering, Opsætning ×4.

`Medarbejdere` manglede i hele designsættet — og det var grunden til at
hverken Bemanding eller Kompetencer havde noget sted at hente navne fra.
Skærmen er stedet hvor en person oprettes; **Opsætning → Brugere & roller**
er stedet hvor et login oprettes. En chauffør har måske aldrig et login.
Datamodellen kom med beslutning 18.

Hver skeletfil har en kommentar i toppen med hvad der skal bygges og hvilke
fejl fra mockuppen der skal undgås.

## Det tungeste tilbage

**Disponering dækker to forretninger.** Dagsvisningen er værkstedsopgaver med
varighed i timer. Ugesvisningen er langtur med ETA over døgngrænser,
grænseovergange og køre-hviletid. Det er ikke to zoomniveauer af samme
datamodel. Giv opgaver en `art` (`vaerksted` | `langtur`) der styrer
feltskemaet, før skærmen bygges — bagefter er det en migrering.

**Cloud Functions mangler.** Tre ting kan ikke ligge i klienten: reservationers
konfliktfrihed (to disponenter kan ramme samme sekund), bookingtilstandsskift
med rolletjek, og nummerserier. Rules er sat til `.write: false` på de noder,
så de fejler tydeligt indtil funktionerne findes.

## Låst rækkefølge

Sikkerhedsarbejdet er prioriteret én gang, og rækkefølgen ligger fast. Hvert
punkt gør det næste billigere; springer man frem, bygger man ovenpå noget der
endnu ikke holder.

| # | Punkt | Definition of done |
|---|---|---|
| 0 | `.validate` for beslutning 15 | Reglerne afprøvet i emulatoren — accept og afvisning demonstreret, ikke kun læst igennem |
| 1 | **Tenant-isolationstest** | Automatisk og permanent. Køres ved **hver** ændring i `firebase.rules.json` |
| 2 | DEV og PROD som to Firebase-projekter | Adskilte projekter, og Storage-regionen verificeret |
| 3 | **Permissions som liste frem for rolle-streng** | Håndhævet i `firebase.rules.json`, **ikke kun i frontend**. Testen skal vise at *serveren* afviser — ikke at UI'et skjuler knappen |
| 4 | Central audit-service | Append-only. En bruger med alle permissions kan hverken skrive, ændre eller slette en post, og tenant A kan ikke læse tenant B's log |
| 5 | `securityLevel: normal \| internal \| confidential \| restricted` | Valideret enum på general, så en liste kan vise en hængelås uden at hente noget klassificeret. `restricted`-kontakterne beskrevet, ikke bygget |
| 6 | Sensitive felter i separat RTDB-node | `booking.laes` alene giver hverken `sensitive/` eller `vaerdi/` — den grovere permission arver ikke den finere |

Alle syv er lukket. Se **Status** nedenfor for hvad det dækker, og hvad der
stadig venter på Cloud Functions.

Punkt 3 er værd at læse to gange. En permission der kun findes i frontend, er
ikke adgangskontrol — det er en pæn knap. Definition of done er en afvisning
fra serveren.

### Forbehold: læsningslogning er klientside

Platformen logger læsning af følsomme data, og ikke kun ændringer. **Men
påstanden har et forbehold, og det skal kunne læses her frem for opdages.**

Selve auditposten skrives af en Cloud Function og er append-only — ingen kan
ændre eller slette den, heller ikke en admin. Det holder.

Men *udløseren* er klientside. `useListe()` kalder `audit.laes()` når en
følsom node hentes, og `audit.adgangNaegtet()` når serveren afviser. En klient
der ikke kalder, logger ikke. Reglerne afviser stadig — adgangskontrollen er
server-side og testet — men **sporet af en læsning afhænger af at klienten er
ærlig.**

Det betyder konkret:

- En *afvist* læsning er registreret, hvis den kom fra vores UI. En direkte
  forespørgsel mod databasen uden om appen bliver afvist, men ikke logget.
- En *gennemført* læsning logges af samme grund kun fra vores UI.

Rigtig serverlogning kræver, at følsomme læsninger går gennem en callable, der
autoriserer, skriver auditposten og **først derefter** leverer data — med
reglerne stående som anden linje, så et direkte opslag uden om funktionen
stadig afvises. Det hører i Cloud Functions-opgaven og er ikke bygget.

Indtil da: sig "vi logger læsninger fra applikationen", ikke "vi logger alle
læsninger".

### Audit-retention er ikke afgjort

Auditloggen sletter i dag efter **24 måneder** for alle tre klasser. **Tallet
er foreløbigt og skal afgøres juridisk, før den første betalende kunde er på
platformen.**

To krav trækker i hver sin retning. Bogføringsloven peger mod **5 år** for det
der rører regnskabsgrundlaget — fakturaer, indkøb, satser, bookinger. GDPR
peger mod **kortere** for personoplysninger, og en auditpost indeholder altid
mindst hvem der gjorde hvad hvornår.

Det ender sandsynligvis med **forskellig retention pr. posttype, ikke ét tal**.
Mekanismen er bygget til det: retention-klassen ligger i stien
(`audit/<tenant>/<klasse>/<år>/<måned>/`), så grænserne kan variere uden en
omskrivning — kun tallene i `RETENTION_MAANEDER` skal ændres. Klasserne er
`drift`, `regnskab` og `sikkerhed`.

Der er endnu ingen sletning: mekanismen er beskrevet, ikke bygget. Se
`ARKITEKTUR.md`.

### Hvorfor punkt 1 står så tidligt

Da punkt 0 blev afprøvet, viste det sig at `firebase.rules.json` **slet ikke
kunne indlæses**. Filen dokumenterede sig selv med `"//": "tekst"`-nøgler, og
det er ugyldigt i RTDB-regler: en nøgle uden `.`-præfiks er et stinavn og skal
pege på et objekt. Emulatoren stoppede på linje 8 — den allerførste kommentar.

Fejlen lå der fra fundamentet. Den overlevede gennemlæsning, den overlevede at
blive redigeret flere gange, og den ville have overlevet en deploy. Den blev
fundet i det sekund reglerne for første gang blev **kørt**.

Det er begrundelsen for punkt 1, og den er stærkere som konkret hændelse end
som princip: sikkerhedsregler man ikke kører, ved man ikke om virker. Derfor er
punkt 1 en test der køres ved hver ændring — ikke en note om at huske det.

### Status: hvad der er sikret, og hvad der venter

Alle syv punkter er lukket. Svaret på "hvad er sikret?" står her, så det ikke
skal samles ud af syv commits.

**Håndhævet af serveren og dækket af tests** — 84 tests, obligatoriske før
commit:

| | |
|---|---|
| Tenant-isolation | På hver node. Også mod et claim der peger på en tenant der ikke findes: `_findes` skal være sat af Admin SDK, så et forkert claim kan ikke oprette en tenant ved at skrive |
| Adgang | 28 permissions i claim'et. Ingen `auth.token.rolle` i reglerne. Ukendte eller manglende permissions giver adgang til intet |
| Klassificerede data | `sensitive/` og `vaerdi/` som søskendenoder, hver med egen permission. Den grovere arver ikke den finere |
| Auditlog | Append-only. Ingen kan skrive, ændre eller slette — heller ikke admin. Kun `audit.laes` kan læse |
| Division | Valideret felt på fem noder, forbudt på fravær |
| Miljø | DEV og PROD adskilt. Produktionsnøgler uden for et produktionsdeploy giver en rød bjælke |
| Regioner | RTDB og Storage i `europe-west1`, verificeret 7. august 2026 |

**Venter på Cloud Functions.** Indtil de findes, er de berørte noder
`.write: false` — serveren afviser altså alle, hvilket er strengere end den
kontrol der skal afløse det, men ikke granulært:

| | Konsekvens i dag |
|---|---|
| Bookingtilstandsskift med permission-tjek | `bookinger` og `etaper` kan ikke skrives af nogen |
| Udstedelse af `perms`-claims fra `roller/` | `roller/` er `.write: false`; presets i `permissions.js` er reelt autoritative |
| Skrivning af auditposter | `audit.log()` fejler; fejl tælles og advares om i dev |
| Serverlogning af følsomme læsninger | Se forbeholdet ovenfor |
| Sletning efter retention | Intet slettes endnu |
| Nummerserier, reservationskonflikter, KPI-aggregering | Som beskrevet under "Det tungeste tilbage" |
| Fem af seks `restricted`-kontakter | Kun gen-MFA kan håndhæves i regler alene. Se ARKITEKTUR |

**Reglerne er deployet til DEV, ikke til PROD.** De er ændret grundlæggende
flere gange under punkt 0–6; en samlet deploy til produktion hører sammen med
den første rigtige tenant-provisionering.

**Derefter stopper sikkerhedsarbejdet**, og næste skærme bygges i denne
rækkefølge:

> Bemanding → Ferie & fravær → Værkstedskalender → Disponering

Disponering ligger sidst, fordi den læser de reservationer som fravær og
værksted skriver. Bygges den først, disponerer den på en kalender der endnu
ikke ved noget om syge chauffører eller biler på værksted.

Se `ARKITEKTUR.md` for datamodellen og `CLAUDE.md` hvis du arbejder videre med
Claude Code.
