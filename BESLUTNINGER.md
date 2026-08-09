# Beslutninger

**README har oversigten — her står begrundelserne.** Hver af disse løste en
konflikt mellem de 20 mockups, eller lukkede et hul der først blev synligt da
modellen blev skrevet ned.

Vil du omgøre en, står det i den nævnte fil. Læs rækken først: der er 20
trufne beslutninger, og et brud på en af dem skal være bevidst frem for
tilfældigt. Kolonnen **Hvorfor** er ikke pynt — den er det eneste sted der
står hvad der gik galt uden beslutningen, og uden den ligner de fleste af dem
vilkårlige valg man lige så godt kunne lave om.

## Oversigt

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
| 15 | **Division er et felt, ikke en sti.** Tre værdier: `gods`, `bus`, `faelles`. Transaktioner hører til én afdeling. Reservationer og fravær har ingen og arver fra ressourcen. **Undtaget af beslutning 19:** personale og køretøjer har slet ingen division. | Sti ville give to kalendere for én chauffør med C+D — beslutning 4's fejl et niveau højere oppe. Dertil to `BKG-2026-00125`, to Kolding Kommune-poster der driver fra hinanden, og en dieselfaktura der ikke kan afstemmes mod leverandørens total. | `fleet/useListe.js` |
| 16 | **Kombi-transport: en booking er et forløb med N etaper.** Tilstanden ligger på etapen, ikke på bookingen. `aaben` er en tilstand med frist. Lageret er en kapacitetsressource i den samme reservationsnode. Etaper ligger som **egen node** — se afsnittet nedenfor. | Gods kan afhentes af én bil, stå på eget lager i uger, og køre videre med en anden. Etape 1 kan være reserveret mens etape 2 venter på en passende tur. Uden etaper skulle bookingen have én tilstand for to ting der sker på hver sin tid. | `fleet/booking-state.js` |
| 17 | **`securityLevel` og klassificerede søskendenoder.** `normal` \| `internal` \| `confidential` \| `restricted` på general. Følsomme felter ligger i `sensitive/<objekt>/<id>`, værdiansættelser i `vaerdi/<objekt>/<id>` — som søskende, ikke som børn. | En `.read` kaskaderer og kan ikke indsnævres på et barn. Som barn ville `.read` skulle flyttes ned på `<id>/general`, og så kan man ikke længere forespørge på noden — der ville ingen bookingliste være. Søskende koster ét ekstra opslag på en detaljeskærm og nul på en liste. Se afsnittet nedenfor. | `fleet/permissions.js` |
| 18 | **Personale og flåde er entiteter.** Nøglen i `personale/` er et `personId`; `uid` er et valgfrit felt, der sættes hvis personen får et login. Flåden er ikke en liste af biler: `art` styrer skemaet, og en påhængt enhed kan ikke disponeres alene. Begge ligger i **basen** — enhver abonnementskombination har medarbejdere og materiel. | Modellen dækkede ikke det den påstod. Chauffører fandtes kun som navne i en kompetencetabel, så hverken Bemanding eller Kompetencer havde et sted at hente dem fra, og bus-divisionen havde ingen enhedstype at pege på. Bytter man `uid` og `personId` om, holder ejerskabstjekket i reglerne op med at virke: `oprettetAf === auth.uid` matcher aldrig et personId, og en chauffør har måske slet intet login. En person findes før sit login og efter det — kontoen lukkes ved fratrædelse, men en reservation fra tre år siden skal stadig kunne opløses til et navn. | `fleet/personale.js`, `fleet/flaade.js` |
| 19 | **Stamdata har ikke en division.** En medarbejder er defineret ved sine **kompetencer**, et køretøj ved sin **art**. Feltet er derfor forbudt på `personale/` og `koeretoejer/` — ikke bare valgfrit. `faelles` bevares på **kunder**, hvor værdien betyder at kundens forretning går på tværs. | Ingen abonnent har både gods og bus. En busvognmand har kun ét sæt tal, så der var aldrig noget at dele op. En påhængsvogn eller en varevogn kan tilhøre begge slags vognmænd, og det er præcis derfor feltet ikke sagde noget: det skulle udfyldes på hver bil uden at kunne begrundes på nogen af dem — og så blev det læst af nogen. Valgfrit havde ikke været nok; et felt der må stå der, bliver tastet. Omgør delvist beslutning 15. | `firebase.rules.json` |
| 20 | **Sagsbaseret mail: nummeret i emnefeltet er hele integrationen.** En sag får et nummer fra beslutning 8's counter — `FLT` i Fleet, `FAC` i Facility. Nummeret sættes i emnet, modtageren svarer normalt i Outlook, `Re:` bevarer det, og svaret lægges på sagen. Indgående mail er **uautentificeret input**: afsenderen valideres mod sagens parter, alt andet i karantæne. | Alternativet var en Outlook-integration hos hvert værksted og hver leverandør — altså hos nogen der ikke er vores kunde og ikke har nogen grund til at installere noget. Et emnefelt virker hos alle, i dag, uden at modtageren gør noget anderledes. Prisen er at kanalen står åben mod internettet, og det er dét afklaringerne nedenfor handler om. | `fleet/sager.js` |

## Beslutning 16 i detaljer

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

## Beslutning 17 i detaljer

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

## Beslutning 20 i detaljer

Fem afklaringer. De fire første handler alle om det samme: **kanalen står åben
mod internettet**, og det er den eneste indgang i platformen der gør.

**1. Numrene kommer fra beslutning 8, ikke fra et nyt system.**
`naesteBookingnummer()` er generaliseret til `naesteNummer(db, path,
{ praefiks, serie })`; bookingnumre er nu en wrapper om den, så eksisterende
tællere er urørte. To adskilte serier — `countere/sagFlt/<år>` og
`countere/sagFac/<år>` — så FLT kan stå på 00381 mens FAC står på 00127.

**Konsekvensen skal læses som den er: et sagsnummer er en adresse, ikke en
hemmelighed.** Serien er fortløbende, så findes FLT-2026-00381, findes 00382
også. Det er i orden — men kun fordi nummeret aldrig i sig selv giver adgang
til noget. Læg ikke et tilfældigt token ind i formatet for at "stramme op";
det ville bryde beslutning 8 og alligevel ikke flytte kontrollen derhen hvor
den hører hjemme.

**2. Afsenderen valideres, ikke nummeret.** Tre udfald, og der findes bevidst
ikke et fjerde der hedder *sandsynligvis i orden*:

| Udfald | Betingelse | Hvad der sker |
|---|---|---|
| `kendt` | DMARC-alignet envelope-afsender står på sagens `parter[]` | Lægges på tråden |
| `karantaene` | Gyldigt nummer, ukendt afsender | Eget afsnit i UI'et — **ikke** i tråden |
| `afvist` | Intet eller tvetydigt nummer, eller DMARC ≠ pass | Skrives aldrig i tenanten. `audit.adgangNaegtet` |

Matchet sker på **envelope-afsenderen** (Return-Path), aldrig på `From:` —
den header er fritekst afsenderen skriver selv.

`sagsnummerFraEmne()` læser **kun emnefeltet, aldrig brødteksten**. En
brødtekst indeholder citerede tidligere mails, og en af dem kan bære et andet
sagsnummer; læste vi den, kunne en fremmed videresende en gammel tråd og få
sin besked lagt på en sag han aldrig har haft med at gøre. To *forskellige*
numre i samme emne giver `null` — der findes ikke et rigtigt svar på hvilken
sag beskeden hører til, og et gæt ville lægge den på en tilfældig af de to.

**Karantænen vises ikke i tråden.** Ikke gråtonet, ikke sammenklappet. Samme
regel som at en udløbet kompetence blokerer frem for at advare: renderes
beskeden inline, læser mennesket den og handler på den. Frigivelse kræver
`sag.karantaeneFrigiv` og tilføjer adressen til **den ene sags** parter — ikke
til leverandørkartoteket, så rækkevidden af en fejl svarer til rækkevidden af
beslutningen.

Demo-sagen viser hvorfor DMARC ikke er nok: karantænebeskeden har `dmarc:
pass`. DMARC beviser at afsenderen ejer det domæne han skriver fra — ikke at
han er den rigtige part. `mercedes-greve-service.dk` er ikke
`mercedes-greve.dk`, og forskellen er præcis sådan et fakturasnyderi ser ud.

**Vedhæftninger scannes før de gemmes**, og `maaHentes()` er falsk for alt der
ikke er `ren`. Fejler scanneren, bliver status stående på `afventerScan` —
aldrig "antaget ren". En scanner der er nede, må gøre systemet ubrugeligt; den
må ikke gøre det utroværdigt. Brødtekst renderes som **tekst**: ingen
`dangerouslySetInnerHTML`, ingen fjernbilleder (en sporingspixel fortæller
afsenderen at sagen blev åbnet).

**3. Modtagevejen: dedikeret adresse med webhook. Graph som tilvalg.**

| | Dedikeret adresse + webhook | Microsoft Graph |
|---|---|---|
| Onboarding | Én integration, virker for alle tenants dag ét | Admin consent pr. kunde — en IT-samtale, ikke en afkrydsning |
| Hvor mailen bor | Hos os. Kundens Outlook har intet spor | I kundens egen postkasse — deres arkiv, deres eDiscovery |
| Databehandler | Mailtjenesten bliver underdatabehandler. Skal i DPA og ligge i EU | Ingen tredjepart på indholdet |
| Afsenderadresse | Vores domæne, medmindre kunden delegerer et subdomæne med MX. SPF/DKIM for udgående | Kundens rigtige adresse. Ingen leveringsopsætning |
| Driftsrisiko | Få bevægelige dele. Testbar i DEV uden en kunde | Change notifications udløber og skal fornyes; delta-query som net. Flere tavse fejltilstande |
| Blokerende | Nej | Ja — en tenant kan stå fast på en person vi ikke kan nå |

Graph-adgangen skal scopes med en `ApplicationAccessPolicy` til den ene
postkasse. Beder man om `Mail.Read` uden scope, beder man om læseadgang til
hele virksomhedens mail, og den samtale ender aftalen.

Vi bygger **kun webhook-vejen**, bag adapteren `indgaaendeMail(raw) →
normaliseretBesked`, så Graph kan tilføjes uden at røre sagsmodellen. To
modtageveje hvor den ene er utestet, er værre end én.

**4. Tråden hører i `sensitive/`. Retention er ikke afgjort.**

Brødteksten er fritekst udefra. Den *vil* indeholde navne og telefonnumre, og
den vil før eller siden indeholde en helbredsoplysning — *"Jens er sygemeldt,
han kan ikke hente bilen"*. Vi kan ikke klassificere det vi ikke skriver selv,
så det klassificeres samlet. Delingen følger beslutning 17 præcist: general
bærer nummer, tilstand, parter og tællere så listen kan forespørges;
brødtekst, karantæne og den citerede aftalesætning ligger i `sensitive/`. Ét
ekstra opslag når en sag åbnes, nul på en liste.

**To retentioner der ikke er den samme.** `RETENTION_MAANEDER` styrer
auditpartitionerne. Tråden er forretningsdata under `tenants/`, og der slettes
intet i dag.

- Auditposten om en modtaget besked er `drift`. **`emne` må ikke på
  `LOGBARE_FELTER`** — det er fritekst fra internettet, og allowlisten findes
  netop for at holde fritekst ude. Kun `nummer`, `sagId`, `afsenderStatus`, `ms`.
- Trådens egen grænse **er ikke afgjort**, og det er samme åbne spørgsmål som
  audit-retention: en værkstedssag knyttet til en faktura er
  regnskabsgrundlag, en sag der løb ud i sandet er drift.
- **Karantæne slettes hårdt efter 30 dage.** Det er uautentificeret input fra
  en fremmed; der er intet behandlingsgrundlag for at gemme det, og det er det
  ene sted en hård sletning er den rigtige — det er ikke regnskabsdata.

**5. En aftale i en mail bliver et forslag, ikke en reservation.**

*"Vi kan tage bilen 18/8 kl. 08.00"* skal kunne blive en reservation. Men
mailen er **ikke** en femte `kilde.type` i beslutning 4's node. Den
reservation der til sidst skrives, er et **værkstedsbesøg** og har
`kilde.type: vaerksted` med prioritet 40. Fik den sin egen lave prioritet,
ville en bekræftet værkstedsaftale tabe til en booking — og en bil på værksted
kan ikke køre, uanset hvad disponenten har lovet. Sporet bevares med
`kilde.viaSagId`, ikke ved at ændre `kilde.type`.

Mailen er derimod en femte kilde til et **forslag**, og det er samme mønster
som `matchAabneEtaper()`: automatikken skriver aldrig selv.
`reservationFraAftale()` kaster på alt der ikke er `tilstand: "aftalt"`.

Og datoen er et **gæt**. "18/8" kan læses to veje, og "næste tirsdag" kan ikke
læses af nogen maskine med sikkerhed. Derfor bærer forslaget altid
`udtrukketSaetning`: den sætning tidspunktet blev læst ud af, står ved siden af
feltet, så mennesket kan se hvad maskinen gættede — og selv sætte tidspunktet.
**Aldrig forudfyldt og bekræftet i ét klik.**

#### Hvad der ikke er bygget

Fase 0 er **visning**. Der er ingen modtagevej, ingen parsing, ingen
afsendelse og ingen Cloud Function. Sagen på Værkstedskalender kommer fra
`fleet/demo-sag.js`, som har nodens form.

`sager/` findes **ikke** i `firebase.rules.json` endnu, og derfor står
`sag.laes`, `sag.sensitiveLaes`, `sag.skriv`, `sag.karantaeneFrigiv` og
`sag.aftaleBekraeft` heller ikke i `permissions.js`. Det er med vilje:
permission-kataloget siger selv at man ikke tilføjer en permission uden et
sted der spørger efter den, og en permission der kun findes i frontend er en
pæn knap. De fem tilføjes i samme ombæring som reglerne og deres tests.


## Sikkerhedsarbejdet i detaljer

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
| Division | Valideret og **påkrævet** felt på seks noder — `etaper`, `lagre`, `opgaver`, `indberetninger`, `indkoeb`, `kunder`. **Forbudt** på fire: `fravaer`, `kompetencer` og — efter beslutning 19 — `personale` og `koeretoejer`. Linjen sagde tidligere "fem noder, forbudt på fravær"; det var forkert allerede før 19, hvor tallene var otte og to |
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
