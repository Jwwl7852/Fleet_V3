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
| 21 | **`opgaver.art` er `vaerksted` \| `facility`** — ikke `vaerksted` \| `langtur`. Feltskemaet pr. art står i `fleet/opgaver.js`, ikke i reglerne. Køre-hviletid er en **regel**, ikke et felt: den blokerer, men svaret bærer altid et forbehold, fordi vi kun kan se planen og ikke tachografen. | README foreslog `langtur`, men den formulering er ældre end beslutning 16. Da etaper kom som egen node, blev `langtur` en **dublet**: `fraSted`, `tilSted`, `koeretoejId`, `personId`, `maengde`, `senestMs` og `forslag[]` står allerede på etapen, og `matchAabneEtaper()` søger på etaper. To poster for én tildeling er præcis prototypens DE-QR 777 mod DE-KL 404, som beslutning 16 lukkede. Den ægte artsforskel i noden er hvad arbejdet udføres **på**: et køretøj eller et facility-aktiv. | `fleet/opgaver.js` |
| 22 | **De ni skærme uden mockup er afgjort.** Fakturering hedder **Fakturagrundlag** — FleetControl laver ikke den juridiske faktura. Live-kort hedder **Rute & status** — ingen GPS. Kompetencer skelner lovkritiske (blokerer) fra virksomhedskrav (advarer). Leverandører får objektive tal, ingen stjerner. Idébank ud af kundens installation. | Ni skærme stod som skeletter uden tegning, og de måtte ikke bygges på gæt. Navnene var det vigtigste: "Fakturering" lovede en juridisk faktura vi ikke laver, og "Live-kort" lovede en sporing der ikke findes. Et navn der lover for meget, bliver til en fejlmelding. | `fleet/integrationer.js`, `fleet/rutestatus.js` |
| 23 | **Supportadgang er tidsbegrænset og kundestyret.** FleetControl-personale har som standard **ingen** adgang. Kundens administrator giver adgang med varighed, type, formål og sagsnummer; den udløber **automatisk**. En supportsag bærer kontekst — aldrig passwords, tokens eller feltværdier. | Standardadgang for supportere er den slags der aldrig bliver lukket igen. En adgang der udløber fordi nogen skal huske det, er ikke tidsbegrænset. Og en supportsag er en **ny kanal ud af systemet**: et kundenavn i konteksten har forladt kundens tenant. Derfor allowliste, ikke blokliste. **Rettet af 24.** | *ikke bygget — efter fase 1* |
| 24 | **Support krydser tenant-grænsen — én gang, og kun her.** Sagen ligger i `support/sager/<id>` i toppen med et `tenantId`; hver tenant har en **indeksnode** til at liste sine egne. Auditloggen vises som et bundet **udtræk** på sagen: ±5 minutter, højst 50 poster, ikke konfigurerbart. | RTDB kan sammenligne et felt på den post der læses mod claim'et, men kan ikke **filtrere** en forespørgsel på det — derfor indeksnoden. **Retter 23:** 23 gav support `audit.laes` på kundens tenant, og det er for meget. Et loft der kan hæves af den der rammer det, er ikke et loft. Indeksnoden er samtidig svaret på kundeportalen. | `fleet/support.js` |
| 25 | **De fire sidste skærme — og det er ANTAGELSER, ikke afgjorte krav.** Et fakturagrundlag er en **opgørelse**, ikke en faktura; det erstattes frem for at rettes, med referencen **begge veje**. Momssatsen står pr. linje og **gættes ikke**. En indberetning **har** en sag. Materialeforbrug er **én hændelse med to posteringer**. Kompetencekravet **kommer fra enheden**. Leverandørtal står **med deres grundlag**. | De 24 foregående afgjorde noget vi **vidste**; denne afgør noget vi **tror**, og den skal derfor efterprøves hos første kunde frem for brydes bevidst. De tre steder hvor et forkert gæt koster mest: forløbet i `indberetninger.js`, linjearterne i `grundlag.js`, de seks nøgletal i `leverandoerer.js`. Hvor et gæt ville koste penge, gætter vi ikke — momssatsen blokerer eksporten frem for at antage 25 %. | `fleet/grundlag.js`, `fleet/indberetninger.js`, `fleet/leverandoerer.js` |

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


## Beslutning 21 i detaljer

### Den rettede en modstrid i vores egen dokumentation

README sagde i lang tid: *"Giv opgaver en `art` (`vaerksted` | `langtur`) der
styrer feltskemaet, før skærmen bygges."* Den formulering er **ældre end
beslutning 16**, og den blev båret videre uden at blive genlæst.

Da etaper kom som egen node, blev `langtur` en **dublet**. Hvert eneste felt en
langtur har brug for, står allerede på etapen:

```
fraSted · tilSted · koeretoejId · personId · maengde · senestMs
forslag[] · valgtForslagId
```

Og `matchAabneEtaper()` finder åbne ture med
`orderByChild("tilstand").equalTo("aaben")` **på `etaper`**. Lå langturen også
i `opgaver`, ville matchningen enten overse den eller finde to poster for én
tur.

**Den afgørende grund er en fejl beslutning 16 allerede lukkede.** Prototypen
viste DE-QR 777 med afgang 28/6 i reservationstabellen og DE-KL 404 den 24/6 i
timelinen — ikke en tastefejl, men to poster for samme tildeling. Svaret var:
*der må ikke være to steder at være uenige.* En langtur som både opgave og
etape genåbner præcis det, for `koeretoejId` og `personId` ville stå begge
steder.

**Beslutning 16 vandt.** Reglerne afviser nu `langtur` som art, og der er en
test der fastholder det.

### De to noder forbliver to

Beslutning 16 begrundede adskillelsen med statsmaskineriet, ikke med formen:

| | |
|---|---|
| `opgaver.status` | indberettet → planlagt → igang → afventer → udfoert |
| `etaper.tilstand` | kladde → afventerPlan → afventerKoord → reserveret → udfoert |

Ét `status`-felt med to betydninger er beslutning 11 og 14 om igen. `art`
ændrer ikke det argument. **Disponering læser begge noder** — dagsvisningen er
`opgaver` med art `vaerksted`, ugesvisningen er `etaper`.

Bemærk også at `opgaver.afventer` og `etaper.aaben` ikke er det samme: her
venter arbejdet på en reservedel, dér venter godset på en passende tur.

### Hvad arten så skelner

Den ægte artsforskel i noden er hvad arbejdet udføres **på**:

| | `vaerksted` | `facility` |
|---|---|---|
| Ressource | et køretøj | et aktiv eller en lokation |
| Kun art | `koeretoejId`, `varighedMin`, `omkostningstype`, `besoegId` | `aktivId`, `lokationId` |

Skemaet står i `fleet/opgaver.js` som `ART_FELTER`, samme mønster som flåden.
Reglerne håndhæver kun `art` og `division` — at kode hvert felts lovlige arter
ind i RTDB-regler ville gøre filen ulæselig uden at gøre noget sikrere.

Langturens felter — `etaMs`, `graenseovergange[]`, `kunDanmark`, `passager{}` —
hører på **etaper**, hvor forløbet står, og hvor `beregnForloeb()` allerede
regner på passagerne.

### Køre-hviletid er en regel, ikke et felt

4,5 timers kørsel før 45 minutters pause. 9 timers daglig køretid, 10 højst to
gange om ugen. 56 timer om ugen. Tallene står i `GRAENSE` i
`fleet/koerehviletid.js`.

**Den blokerer.** En overtrædelse er en bøde til vognmanden, ikke en advarsel,
og en advarsel man kan klikke videre fra er ikke en kontrol. Håndhævelsen hører
i den Cloud Function der skriver etapen — samme sted som `kanDisponeres()`,
`tjekKompetencer()` og `kanBaere()`.

Man gemmer ikke *"overholder køre-hviletid: ja"* på en etape. Et gemt flag
ville drive fra planen i det sekund nogen flytter en tur, og så står der grønt
på noget der er blevet ulovligt.

#### ⚠ Forbeholdet er en returværdi, ikke en note

**Vi kan kun se planen.** Hvad chaufføren faktisk har kørt, står på
tachografen, som vi ikke har adgang til. `tjekKoerehviletid()` returnerer
derfor `forbehold` på **hvert eneste svar — også de grønne**, og teksten er
skrevet til at stå på skærmen:

> planen overtræder ikke reglen — vi kan ikke se tachografen

Et grønt flueben ved siden af en bøde er værre end ingen kontrol. Læses vores
markering som *"chaufføren er lovlig"*, har vi gjort skade frem for gavn. Der
er tests der fastholder at forbeholdet følger med på et `ok`-svar, og at
teksten ikke lover mere end vi kan vide.

**Forudsætningen for at fjerne forbeholdet er tachografdata** — se ARKITEKTUR.
Det er formentlig en større opgave end kortintegrationen: der er ingen
standard, og hver producent har sit eget format.

## Beslutning 25 i detaljer

### ⚠ Den er antagelser, ikke afgjorte krav

Det er ikke en forsigtighedsfloskel, og det står i toppen af hver af de tre
filer. De 24 foregående beslutninger afgjorde noget vi **vidste** — en
modstrid mellem to mockups, en fejl i en model, en sikkerhedsgrænse. Beslutning
25 afgør noget vi **tror**: hvordan en vognmand opgør en tur, hvordan en
reparation bevæger sig fra melding til afsluttet, og hvilke seks tal han styrer
sine leverandører efter.

Forskellen betyder noget for hvordan man bryder med den. De andre beslutninger
skal brydes bevidst. Denne skal **efterprøves** — og de tre steder hvor et
forkert gæt koster mest at rette bagefter, er forløbet i `indberetninger.js`,
linjearterne i `grundlag.js` og de seks nøgletal i `leverandoerer.js`.

Valider dem hos første kunde, før der bygges skrivning ovenpå.

### Et fakturagrundlag er en opgørelse, ikke en faktura

Fakturaen dannes i regnskabssystemet, og fakturanummeret hører dér. Byggede vi
den her, ville vi konkurrere med e-conomic om noget de gør bedre — og tallet
ville stå to steder.

Grundlaget er derimod vores: det er os der ved hvad bilen kørte, hvem der sad i
den, og hvad der blev brugt. Det er præcis den arbejdsdeling der gør at
`GRL-ÅÅÅÅ-NNNNN` ikke er et fakturanummer og aldrig må blive læst som et.

### ⚠ RETTELSE 1: referencen går begge veje

Det oprindelige krav skrev referencen i **én** retning: det nye grundlag peger
tilbage på det gamle. Rettelsen: **to veje, og kun grundlag uden
`erstattetAfId` tæller med.**

    nyt.erstatterId        peger BAGUD   → "hvad rettede denne?"
    gammelt.erstattetAfId  peger FREM    → "gælder denne stadig?"

Uden den fremadrettede kan man ikke se på et gammelt grundlag om det stadig
tæller — man skal søge hele mængden igennem efter noget der peger på det. Det
ville virke i en test med tre poster og fejle stille i produktion, hvor
optællingen ikke går den vej. Og fejlen er ikke kosmetisk: begge poster ville
tælle med i summen, og **en rettelse ville blive en fordobling.**

`summer()` filtrerer derfor på `erGaeldende()`, og enhver optælling skal gå
gennem den. En kopi uden det filter ser ud som en sum og er en
dobbeltfakturering.

**Fundet under bygningen:** første udkast af `erstat()` returnerede
`erstattetAfId: null` med en kommentar om at kalderen satte den bagefter. Det
er fordoblingen indbygget i den funktion der skal forhindre den — en regel der
kun holder hvis kalderen husker en kommentar, er ikke en regel. `push()`
udleverer nøglen før skrivningen, så `nytId` kræves nu op front, og begge
halvdele bygges samme sted og skrives atomisk.

Bemærk også at **tilstanden ikke ændres** på det erstattede grundlag. Et låst
grundlag forbliver låst — det *er* blevet eksporteret, og det kan ikke gøres
usket. "Erstattet" er ikke en tilstand; det er svaret på et andet spørgsmål.

### ⚠ RETTELSE 2: indberetningen HAR en sag — den ER ikke en sag

Det oprindelige krav skrev at indberetningen *er* en sag. Det ville kollidere
to tilstandsmaskiner:

| | Handler om | Tilstande |
|---|---|---|
| **Sagen** (beslutning 20) | kommunikationen med værkstedet | åben / afventer svar / afsluttet |
| **Indberetningen** | arbejdet | ny → vurderet → planlagt → på værksted → afventer faktura → afsluttet |

En mail kan være besvaret uden at bilen er repareret, og bilen kan være
repareret uden at nogen har svaret. Slås de sammen, kan man ikke udtrykke
nogen af delene. Forbindelsen er ét felt: `sagId`.

`afventerFaktura` er en **egen** tilstand og ikke en variant af `paaVaerksted`.
Bilen er tilbage i drift, arbejdet er gjort, men pengesiden er ikke lukket.
Uden den ville indberetningen enten stå som "på værksted" med en bil der
kører, eller som "afsluttet" med en faktura der aldrig kom — og listen ville
være ubrugelig som huskeliste.

### ⚠ RETTELSE 3: feltnavnene er danske

`udarbejdetAf` / `godkendtAf`. Ikke `preparedBy` / `approvedBy`.
Domænelogikken er dansk hele vejen, og et enkelt engelsk felt midt i en dansk
post er den slags der breder sig. Begge er **uid** — hvem der *gjorde* noget —
og ikke `personId`; se beslutning 18.

### Momssatsen gættes ikke

Den står **pr. linje**, og eksporten nægtes uden.

Det ville være nemt at sætte 25 som standard. Det er den danske sats, og det
ville være rigtigt de fleste gange. Men "de fleste gange" er ikke godt nok:
udlandskørsel, EU-handel med omvendt betalingspligt og momsfri persontransport
har ikke 25. Rammer vi forkert, er det ikke en visningsfejl — det er en
momsangivelse der er forkert, og den opdages af SKAT frem for af os.

**Et system der gætter rigtigt ni gange ud af ti, lærer brugeren at stole på
det tiende gæt.**

Satserne og hvornår hver især gælder, skal bekræftes af en bogholder **før
første eksport**. Se README's liste over hvad der blokerer fase 2. Indtil da er
feltet påkrævet og tomt — det tvinger et menneske til at tage stilling, hvilket
er det rigtige svar så længe vi ikke kender reglen.

### Der afrundes pr. linje, ikke på totalen

Kunden lægger linjerne sammen i hånden. Det er præcis hvad man gør, når man er
uenig — og hvis den viste total så afviger med to øre fra summen af de viste
linjer, er der et tal på skærmen der ikke kan genfindes.

Prøven i `test/grundlag.test.mjs` er valgt så de to metoder faktisk *er*
uenige (5,01 mod 5,00). Første udkast brugte et regnestykke der gik op, og så
beviste prøven ingenting.

### Chaufførappens tre datatyper — felterne nu, appen senere

Appen bygges ikke nu. Felterne lægges alligevel i modellen, fordi den skal
være rigtig **før** appen kommer: bygges de først når appen er der, skal
Indberetninger laves om, og så er der allerede data i produktion der ikke
passer.

**1. Tidsregistrering bærer to slags tidspunkter.** `ankomstMs` er hvornår det
skete; `registreretMs` er hvornår det blev tastet. En chauffør der taster på
stedet, og en der taster hjemmefra om aftenen, afgiver en *iagttagelse*
henholdsvis en *erindring*. Gemmer vi kun ét tidspunkt, kan ingen bagefter se
hvilken slags man har med at gøre — og det er netop det spørgsmål der kommer,
når kunden bestrider ventetiden på fakturaen.

**2. Underskriften er write-once.** Reglen er
`"underskrift": { ".write": "!data.exists()" }` — ikke en konvention. En
underskrift er et **bevis**; kan den redigeres bagefter, beviser den
ingenting, og så er der ingen grund til at indsamle den. Den er samtidig en
personoplysning om en der ikke er vores medarbejder — modtageren på
lossepladsen har ikke sagt ja til noget hos os — og ligger derfor i
`sensitive/`.

En rettelse er et **tillæg**, ikke en redigering: en ny indberetning der
henviser til den gamle, præcis som et låst fakturagrundlag erstattes frem for
at rettes. Begge steder er begrundelsen den samme — dokumentet er allerede
blevet vist til nogen udenfor.

Navnet er påkrævet. En krusedulle uden et navn kan man ikke stille spørgsmål
til.

**3. Materialeforbrug er én hændelse med to posteringer.**

| | Hvad det er | Hvor det havner |
|---|---|---|
| **Salget** | hvad kunden skal betale | en linje på fakturagrundlaget |
| **Forbruget** | hvad det kostede os | et lagertræk i Indkøb |

De har forskellige beløb (der skal være en avance), forskellige modtagere og
forskellige tidspunkter. Slås de sammen, fakturerer man enten til kostpris
eller bogfører sin salgspris som en omkostning — og dækningsgraden bliver
forkert uden at noget ser forkert ud. Det er beslutning 11 om igen.

Linjen bærer derfor to referencer, `grundlagslinjeId` og `lagertraekId`, som
hver især sættes **én** gang. Er den første sat, afvises et nyt kald frem for
at lave linje nummer to: **en gentagelse må ikke blive en fordobling** — samme
princip som to-vejs-referencen på grundlaget.

### Koblingen mellem appen og økonomien

Det er det første sted chaufførappens data møder regnskabet, og tre ting kunne
være gået galt:

**Skalaen.** `MAENGDE_SKALA` *importeres* fra `grundlag.js` frem for at blive
skrevet af. To skalaer ville fakturere tusind gange for meget eller for lidt,
og fejlen opdages ikke i en test — den opdages på fakturaen.

**Salgsprisen er ikke kostprisen.** Indkøbsprisen står lige der i lagerlinjen,
og bruger man den som sats, forsvinder avancen på hver eneste materialelinje
uden at noget ser forkert ud: tallene stemmer, fakturaen går igennem, og
dækningsgraden falder af grunde ingen kan pege på. `satsOere` kræves, af samme
grund som momssatsen.

**Materiale på egen bil kan ikke faktureres.** En reparation på vores egen
lastbil har ingen booking og dermed ingen kunde. Uden det tjek kunne
materialeforbrug fra eget værksted blive til en linje på en tilfældig kundes
grundlag — den slags opdages af kunden, ikke af os.

Prøven bruger `grundlag.js`' egen `validerLinje()` frem for et håndskrevet
forventet objekt. En test der gentager modellen, kan ikke opdage at de to er
uenige.

### Kompetencekravet kommer fra enheden

Reglen er skarpere end beslutning 22's "lovkritisk mod virksomhedskrav": **alt
hvad `kraevedeKompetencer()` udleder af enheden og godset, blokerer. Alt andet
advarer med en begrundet override.** Linjen er hvad kravet *kommer fra*.

Det flyttede to beviser fra advarende til blokerende:

* **EU-kvalifikationsbeviset** følger af at køre erhvervsmæssigt med C eller D
  — det kan altså udledes af arten, præcis som C og tachografkort kan.
* **Kranførerbeviset** er lovpligtigt over 8 tonmeter, og kravet kommer fra
  *bilens kran*. Samme mønster som ADR fra godset.

Førstehjælp blev stående som advarende: der findes ingen bil der gør
førstehjælp til en betingelse for at køre.

⚠ **To slags "har ikke", og de må ikke forveksles.** At *arten* kan have en
kran, er et andet spørgsmål end om *denne bil* har en. Blandes de, kræver vi
kranbevis af hver eneste lastbil.

**Begrundelsen for en override står i objektets historik — ikke i
auditposten.** `begrundelse` må ikke tilføjes til `LOGBARE_FELTER`;
allowlisten findes netop for at holde fritekst ude af loggen, og en auditpost
der lækker, er værre end ingen. Auditposten får at der *skete* en override, af
hvem og på hvilken kompetence. Ikke hvorfor. Det står som en kommentar i
`personale.js`, så ingen tilføjer feltet i god tro.

### Et nøgletal uden sit grundlag er vildledende

"50 % til tiden" betyder noget helt andet ved to leveringer end ved to
hundrede — men i en tabel ser de ens ud, og så skifter man leverandør på
grundlag af én forsinkelse.

Hvert af de seks tal bærer derfor `grundlag` (antallet det er regnet på), og
værdien er `null` under tre observationer. Skærmen skriver **"for lidt
grundlag"** frem for en streg: en streg læses som nul eller som "ingen
problemer".

To undtagelser, begge med en grund:

* **Manglende fakturaer har ingen grænse.** Det er en optælling, ikke et
  gennemsnit — én manglende faktura *er* én manglende faktura, og en tærskel
  ville skjule den første. Det er netop den man skal rykke for.
* **En ubesvaret sag tæller ikke med i svartiden.** Den har ingen svartid, den
  har en alder. Regnede vi den med som en meget lang svartid, ville tallet
  blande "de svarer langsomt" med "de har ikke svaret".

**Samme tal, to betydninger:** en prisafvigelse på 4 % er et brud på en
fastaftale og helt almindeligt på et spotkøb. Farven kommer derfor fra
aftaleformen, ikke fra tallet. En tabel der farver dem ens, lærer indkøberen at
ignorere farven.

**Prislisten er en historik, ikke et opslagsværk** (beslutning 7). Et køb i
marts måles mod martsprisen. Overskrev vi prisen ved en regulering, ville en
faktura fra marts pludselig se forkert ud, og afvigelsen ville pege på
leverandøren frem for på os. Et opslag på en vare der ikke fandtes endnu, giver
`null` — ikke den nyeste pris som trøstepræmie, for et opslag der altid svarer,
kan ikke skelne "ukendt" fra "kendt".

⚠ **Varenummeret er nøglen, ikke varenavnet.** "Motorolie 5W30", "Motorolie
5w-30" og "Olie 5W30" er samme vare for et menneske og tre for en maskine. Det
er Bil 104 med to nummerplader, denne gang på en oliedunk.

### To fejl fundet under bygningen, som er værd at kende

**Jeg opfandt et `forloebId`.** Et forløb *er* en booking, og etaperne bærer
`bookingId`. Værre var at jeg skrev mit eget `tilstand === "aaben"`-filter,
mens `forloebstilstand()` allerede svarer på det — samme regel to steder, hvor
den ene driver. Det er nøjagtig divisionsfilterets fejl fra beslutning 19.
Tjekket går nu gennem den eksisterende funktion, og en prøve holder fast i
konsekvensen: en **annulleret** etape spærrer ikke faktureringen, hvilket et
hjemmestrikket filter ville have overset.

**Jeg skrev `beregnNoegletal()` mod en forestillet dataform.** Den læste
`beloebOere`, `datoMs` og `prisOere`. De rigtige indkøbslinjer hedder `dato`,
`antal` og `prisPrEnhedOere`, og beløbet *beregnes* af antal × pris. Havde jeg
rettet demo-data efter funktionen frem for omvendt, ville tallene have været
rigtige lige indtil de mødte produktion. Der er nu en prøve der bruger den
faktiske form — de øvrige prøver i filen ville have bestået, selv om koden
ikke kunne læse et eneste rigtigt indkøb.


## 26. En afvist læsning er ikke et netværksproblem

`useKpi` og `useListe` oversatte **enhver** fejl til demo-data plus teksten
*"Viser demo-data — ingen forbindelse til databasen."* Også en
`permission-denied` fra sikkerhedsreglerne.

Det er forkert på den værst tænkelige måde. Reglerne afviste læsningen — det er
systemet der **virker** — og appen kaldte det et netværksproblem og fyldte
skærmen med opdigtede tal. Den dag en regel er for stram i produktion, ser en
kunde befolkede skærme med tal der ikke er deres, og en besked om at internettet
driller. Fejlen ville ikke blive rapporteret som en adgangsfejl, og den ville
ikke blive fundet ved at kigge.

Tre tilstande er skilt, og pointen er at de opdages på **to forskellige
tidspunkter**:

| Tilstand | Hvornår kendt | Skærmen viser |
|---|---|---|
| `demo` — ingen database konfigureret | Før forespørgslen | Demo-data. Ingen besked; miljøbjælken siger det allerede |
| `uautentificeret` — ingen bruger | **Før** forespørgslen | Demo-data mærket *"Ikke logget ind"* — **kun i dev**. Forespørgslen sendes ikke |
| `naegtet` — logget ind, afvist af reglerne | Kun bagefter | Årsagen, med ordet afvist. **Aldrig tal** |

At `auth == null` er en tilstand man kender **op front**, er det der gør
adskillelsen ren. Den skal ikke fanges som en fejl: forespørgslen sendes slet
ikke, og så er der ingen påstand om netværket at komme til at fremsætte.

Logikken ligger i `fleet/datatilstand.js` som en ren funktion uden React, så den
kan prøves — samme grund som `gitter.js`. Teksten ligger i `<Datatilstand>` i
`ui.jsx`, ét sted: den stod før i 32 kald og var **allerede** drevet, for
Dashboard sagde *"der er ikke forbindelse"* mens de øvrige fjorten sagde *"ingen
forbindelse"*.

⚠ **Der stod et STILLADS her, og det er fjernet.** Indtil beslutning 27 gav
`auth == null` demo-data i dev, fordi der ikke fandtes noget login-flow, og en
tom app ville have betydet at nogen lavede en hurtig overstyring for at kunne
arbejde. Grenen var gated på `miljoe === "dev"`, og fjernelsesbetingelsen stod
skrevet her: den skulle væk, når login landede.

**Den er indfriet.** Login kom med beslutning 27, og grenen forsvandt i samme
commit. `dataTilstand()` tager ikke længere et `miljoe`-argument — der er ikke
noget tilbage, funktionen skal kende sit miljø for, og dermed heller ikke noget
sted at gøre undtagelsen igen. Prøven i `test/datatilstand.test.mjs` blev
**vendt om frem for slettet**: at betingelsen faktisk blev indfriet, og kan ses
indfriet, er det der gør den næste midlertidige gren troværdig.

Efter det betyder `uautentificeret` noget snævrere. Rutevagten i `App.jsx`
slipper ingen ind uden session, så ser man tilstanden inde på en skærm, døde
sessionen mens man kiggede — og `<Datatilstand>` siger det.

**Ét tilfælde er bevidst urørt:** en tom `kpi/`-node giver stadig demo-tal.
Det er ikke samme sag — serveren *har* svaret, og der står bare ikke noget
endnu, fordi KPI-aggregeringen mangler (se efterslæbet i README). Falder det
bort før aggregeringen findes, står hele appen tom for en bruger der er logget
korrekt ind.

## 27. Dev bruger rigtige DEV-brugere. Emulatoren er til reglerne

Claims-kæden var **helt uprøvet i browseren**. Tenant-isolationen hviler på
custom JWT claims — `auth.token.tenant` og den rør-afgrænsede
`auth.token.perms` — og kæden *bruger oprettes → claims sættes → token fornys →
reglerne læser dem* var kun afprøvet i emulatoren.

Emulatoren lader dig minte et vilkårligt token med hvilke claims du vil. Det er
præcis det rigtige til at prøve **reglerne**, og den bliver dér. Men det
springer det led over hvor fejlene sidder: at claim'et rent faktisk bliver sat,
at det overlever en tokenfornyelse, og at reglerne læser det, der faktisk står
i det. Man tester reglerne mod claims man selv har opfundet.

Med rigtige brugere i `fleetcontrol-dev-1ac1c` prøves hele kæden, i det miljø
der er bygget til at smide væk, uden at der indføres et tredje miljø ved siden
af DEV og PROD.

Prisen er `scripts/provisioner-dev.mjs`. Det er ikke ekstraarbejde — det er
onboarding af en tenant, skrevet første gang.

**Seks brugere, én pr. rolle i `ROLLE_PERMS`.** Listen i `fleet/dev-brugere.js`
er *udledt* af presetsene og kan derfor ikke være usynkron med dem. `perms`
bygges med `permStrengFraRolle()` — aldrig i hånden. En seedet disponent med
sit eget sæt permissions ville betyde, at man afprøvede noget andet end det man
leverer, og det er beslutning 5's fejl flyttet ned i provisioneringen.

`revokeRefreshTokens()` kaldes ved hvert claim-skift. Uden det beholder en
allerede indlogget session sine gamle claims, indtil tokenet udløber: man ville
tro, man havde ændret adgangen, og den gamle ville stadig virke. Det er den
værste fejltilstand, fordi den ser ud som om den lykkedes.

⚠ **`tenants/<id>/_findes` er trin 1, ikke en detalje.** Hver eneste `.read` i
reglerne kræver markøren. Uden den afviser alt, og en korrekt indlogget bruger
ville se "afvist" på hver skærm — login ville gøre appen *mere* tom, ikke
mindre. Det var derfor seeding hørte med i den samme opgave.

⚠ **Scriptet nægter at køre mod andet end DEV, og det er ikke konfigurerbart.**
Ingen flag, ingen miljøvariabel, intet `--force`. Samme begrundelse som loftet i
beslutning 24: en spærring der kan hæves af den der rammer den, er ingen
spærring. Et seed-script der kan pege på produktion, skriver testdata i rigtige
kunders base — og det opdages først når en kunde ringer.

Kun de noder, skærmene faktisk læser, seedes. Et seedet datasæt, ingen skærm
rører, driver fra sin kilde uden at nogen ser det.

## 28. Rollevælgeren er en brugervælger, fordi claims ikke kan ændres klientside

Perms kommer fra tokenets claims. **En klient kan ikke ændre sit eget token.**
En dropdown kan derfor pr. definition ikke ændre adgang — kun hvad UI'et
tegner. Det er ikke et forbud der gælder ét bestemt sted; det er en umulighed
der gælder overalt hvor der er en server.

Rollevælgeren har været gatet forkert **to gange**, og begge gange blev
symptomet rettet i stedet for årsagen:

1. Først på `demoMode` alene. Så var den usynlig i dev, hvor en udvikler
   normalt kører — og det så ud som en fejl.
2. Så på "ikke produktion". Så var den synlig i dev, hvor den viste knapper
   serveren afviser, og hvor det så ud som om man skiftede sin egen adgang.

Den underliggende fejl var at kalde den en *rollevælger*. Det man vil, er at se
platformen som en anden rolle **og få serveren til at være enig**. Det kan kun
ske ved at skifte session.

**I dev: log ud, log ind som en anden seedet DEV-bruger, hent nyt token.** Så
skifter perms fordi *tokenet* skifter, og det er præcis dér man kan se om UI og
regler er enige. `fleet/Brugervaelger.jsx`, kun når `miljoe === "dev"`.

**I demo bevares overstyringen** — dér er der ingen server at være uenig med,
og at kunne vise platformen som en disponent er hele pointen med en demo.
`rolleskifte` er derfor tilbage på `miljoe === "demo"`, men denne gang af den
rigtige grund og ikke fordi ingen havde tænkt over dev.

Formuleringen i CLAUDE.md er rettet med. Der stod "no-op i produktion", hvilket
beskriver en **adfærd** — og en adfærd kan man fortolke sig uden om. Der står nu
*hvorfor*: claims kommer fra tokenet. Så er der ikke noget at fortolke, og ingen
genindfører genvejen om et halvt år, fordi den ser praktisk ud.

⚠ **Adgangsvejen selv er miljøuafhængig.** `harAdgang` i `App.jsx` kræver et
tenant-claim — ikke "en bruger", og ikke "ikke produktion". En bruger uden claim
må ingenting, så at lukke den ind i shellen ville give en app hvor hver eneste
læsning bliver afvist. Der er med vilje ikke en dev-variant og en prod-variant:
det er den slags forskel der får en spærring til at gælde alle andre steder end
dér hvor den betyder noget. Den eneste tilbageværende miljøafhængighed er, om
brugervælgeren **tegnes**.

En bruger der er logget ind uden tenant-claim, får sin egen besked. Det sker
hver gang provisioneringen kun er kørt halvt, og "forkert adgangskode" ville
sende folk i gang med at nulstille en kode der virker.

## 29. En udrulning er ikke færdig, før den er efterprøvet

`firebase.rules.json` var **aldrig udrullet til DEV**. Databasen kørte en ældre
version med en `.read` på `tenants/$tenantId`. En `.read` kaskaderer ned over
alt under sig, og et strammere barn kan ikke tilbagekalde den — så hele
klassificeringen fra beslutning 17 var sat ud af kraft. Seks noder fandtes slet
ikke: `sensitive`, `vaerdi`, `personale`, `kompetencer`, `roller`, `$klasse`.

En `chauffoer` uden `personale.sensitiveLaes` kunne læse `sensitive/personale`.
Reglerne var rigtige hele tiden. **De kørte bare ikke.**

⚠ **De 591 prøver havde ret om FILEN og sagde intet om DATABASEN.** De kører mod
emulatoren med den lokale fil. Ingen af dem kunne have fanget det, og ingen af
dem er forkerte. Det er projektets kernefejl i en ny form — en kontrol der
findes i repoet, men ikke i virkeligheden. Præcis som reglerne der var ugyldige
fra fundamentet, og som "en kontrol der kun findes i frontend, er ikke
adgangskontrol, men en pæn knap".

`npm run regler:tjek` henter `/.settings/rules.json` fra den kørende database og
sammenligner. `npm run regler:udrul` udruller **og** efterprøver: CLI'ens
*"released successfully"* siger at kaldet lykkedes, ikke at databasen nu
indeholder din fil.

Sammenligningen er **tekstuel**, fordi Firebase returnerer filen byte-identisk —
kommentarer, indrykning, rækkefølge. Efterprøvet: 29.548 tegn ud, 29.548 ind.
Ingen JSON-parsing, ingen semantisk diff der selv kan tage fejl. Kun linjeskift
normaliseres, så en frisk klon på Windows ikke fejler falsk på CRLF.

Rapporten peger på **første afvigende linje med begge sider**. En besked der kun
siger "de er forskellige", sender folk i gang med at diffe i hånden — og så
bliver tjekket noget man springer over.

⚠ **Læsetjekket arver bevidst IKKE produktionsspærringen.** Provisioneringen
nægter at køre mod produktion, fordi den **skriver**. Det her er en ren læsning,
og mod produktion er den *mere* værd end mod DEV: dér er konsekvensen af drift
en kunde der ser data, de ikke må se. Kopierede vi spærringen ind af vane, ville
vi gøre den vigtigste kontrol umulig præcis dér hvor den betyder mest. En
spærring hører til den handling der er farlig, ikke til projektet.

**Hvor den fyrer af sig selv, og hvor den ikke gør.** Provisioneringen kører
tjekket til sidst og advarer — det er dér man sætter et miljø op, og dér hullet
stod ubemærket. `pre-commit` advarer også, men **blokerer ikke**: på det
tidspunkt *er* drift forventet, for man har lige rettet filen. En blokering
ville lære folk at bruge `--no-verify`, og så ryger regeltesten med.

Tjekket kan ikke ligge i `npm test` — det kræver netværk og en servicekontonøgle.
Det er altså ikke fuldt mekanisk, og det skal ikke påstås at være det. Det er
mekanisk dér hvor det kan være det.

## 30. Kategorifarver er ikke statusfarver

`GRAF_TONE` havde præcis fem toner — brand, neutral, ok, warn, bad — og det så
ud som om de rakte til Dashboards fem opgavestatusser. Det gør de ikke, og
sammenfaldet i antal er et tilfælde.

**De to paletter gør forskellige ting.** Statusfarver siger *hvor slemt det er*:
grøn er i orden, rød er kritisk. Kategorifarver siger *hvilken ting det er*:
blå er ikke bedre end orange. Genbruges statusfarverne som serie 4 og 5, kommer
rød til at betyde både "kritisk" og "den femte kategori" — og så holder
brugeren op med at læse rød som en advarsel nogen af stederne.

Konkret ville *Planlagt* have fået rød, fordi den var den femte tone der var
tilbage. Det er samme fejl som en tabel der farver prisafvigelsen ens for en
fastaftale og et spotkøb: to betydninger, én farve, og farven bliver til pynt.

Fem `--fc-serie-*` i `fleet.css`, adskilt fra `--bc-ok` / `--bc-warn` /
`--bc-block`. Slot 1 er `var(--bc-accent)` og ikke en kopi af `#125bec` —
beslutning 10 forbliver den eneste kilde til brandblåen.

⚠ **Paletten er valideret, ikke skønnet.** `dataviz`-skillens validator er kørt
mod den hvide flade: lysbånd, chroma, CVD-adskillelse (værste nabopar ΔE 9,1
protan) og normalsyn (ΔE 19,6) består alle. Tre af farverne ligger under 3:1 i
kontrast mod fladen, og den advarsel **forpligter** til synlige labels — derfor
bærer donutens legende antal og procent som tekst. Den er ikke pynt, den er
lettelsen.

Rækkefølgen: **rettelsen her først**, derefter snapshottet i
`test/design-tokens.test.mjs`. Retter man kun snapshottet, har man flyttet
beslutningen ind i en testfil hvor ingen leder efter den — se beslutning 10.

### Tre paletter, ikke to

Handlingsboksene på Dashboard krævede en **tredje**, og grunden er værd at
kende, fordi den bestemmer hvornår validatorens gulve gælder.

| Palet | Farven er | Bundet af gulvene? |
|---|---|---|
| `--bc-ok` / `--bc-warn` / `--bc-block` | tilstand | nej — de er reserverede |
| `--fc-serie-*` | **identitet i en graf** | **ja** |
| `--fc-ikon-*` | forstærkning på et felt | nej |

Mockuppens fem handlingsfarver **dumper** som seriepalet: rød↔orange måler
ΔE 7,1 og blå↔lilla 13,4, begge under gulvet på 15 hvor selv fuldt farvesyn kan
skelne. Under `--pairs all` — som fem felter side om side er — klarer kun de
**tre** første slots gulvet i det hele taget.

De bruges alligevel, og det er ikke en undtagelse fra reglen: **farven bærer
ikke betydningen her.** Hver boks har et tal, en tekst og et link. Gulvene
gælder encoding, ikke pynt. Havde vi lagt dem i `--fc-serie-*`, ville den næste
graf have arvet en palet der ikke kan bestå — derfor to navnerum.

⚠ **Tonen hedder sin plads, ikke sin farve.** `tone: "ikon-2"`, ikke
`tone: "orange"`. Designtesten fangede det sidste: `"orange"` er et CSS-farvenavn
i en strengliteral, og linten så det som en hardkodet farve. Den havde ret af en
bedre grund end sin egen — et navn der siger farven, lyver den dag paletten
ændres.

## 31. Roller er faste. Man tildeler dem — man ændrer dem ikke

`tenants/<id>/roller/` blev bygget som en node med et `perms`-array, altså
som noget der kunne redigeres. Det skal det ikke være hos kunden.

**En vognmand der fjerner `booking.godkend` fra sin egen adminrolle har lukket
sig selv ude af sit eget system.** Det er ikke en teoretisk fejl — det er den
mest almindelige måde at ødelægge en rolleadministration på, og den rammer
netop den der prøver at stramme op. Der findes ingen vej tilbage fra klienten:
adgangen til at rette rollen var selv en permission.

Kunden tildeler derfor blandt seks faste roller — chauffør, sagsbehandler,
disponent, koordinator, revisor, administrator — og ændrer ikke hvad de
indeholder. Skal en rolle betyde noget andet, er det en ændring i
`permissions.js` og i regelfilen, ikke et klik.

⚠ **Beslutningen var allerede håndhævet, den var bare ikke skrevet ned.**
`roller` er `.write: false` i `firebase.rules.json` og har været det hele
tiden. Det er værd at bemærke, fordi det er den rigtige rækkefølge: spærringen
lå i reglerne, og skærmen kunne derfor ikke komme til at love noget serveren
ville afvise. Havde den kun ligget i frontend, havde det ikke været
adgangskontrol men en pæn knap.

**Idébanken røg ud i samme ombæring.** Beslutning 22 afgjorde at den ikke hører
i kundens installation; ruten stod der stadig med et tomt skelet. Nu er ruten,
skærmen, `idebank.skriv` og selve `idebank`-noden i regelfilen væk. En node
ingen skærm læser, med en skriverettighed hver chauffør har, er død overflade —
og død overflade er noget nogen finder på at bruge til noget.

Prøverne fulgte med: "chaufføren kan kun indberette og skrive i idébanken" hed
sådan, fordi det var sandt. Den hedder nu "chaufføren kan KUN indberette", og
listen er udtømmende, så en ny skrivepermission på chaufføren fælder den.

---

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

---

## 32. Et lukket abonnement lukker tenanten — ikke kontoen

Ejerkonsollen skal kunne sætte en kunde **på pause** og **opsige** ham. Den
nærliggende måde er at spærre hans logins: sæt `disabled` på hver konto.

**Det er en fælde, og fælden er genåbningen.** Nogle af kundens konti er
spærret *individuelt* — folk der er fratrådt, en konto der blev misbrugt. Når
abonnementet åbnes igen, skal netop de blive ved med at være spærrede. Den
tilstand findes ikke noget sted, når man har overskrevet den. **Man ville
genåbne folk der var fyret**, og ingen ville opdage det før de loggede ind.

Spærringen ligger derfor på **tenanten** og rører ingen konto:

```
tenants/<id>/abonnement/status = aktiv | paused | opsagt
```

og hver eneste regel under tenanten kræver `aktiv`. Brugeren kan stadig
autentificere sig — men han kommer ikke ind, fordi der ikke er noget at komme
ind til. **Genåbning er ét felt**, og ingen per-bruger-tilstand er gået tabt.

Skal en konkret bruger ud, findes knappen allerede: **Spær login** i
Opsætning → Brugere & roller. Den er pr. bruger, den husker sin tilstand, og
den kan rulles tilbage.

**Ingen af de tre tilstande sletter noget.** `opsagt` er ikke en sletning —
egentlig sletning er en manuel proces med en kontrakt bag, ikke en knap i en
konsol. Samme begrundelse som at `skriv.js` ikke har en `slet()`: en funktion
der findes, bliver kaldt.

### Tre noder bliver læsbare, og det er med vilje

`virksomhed`, `moduler` og `abonnement` beholder deres læseregel. Uden dem kan
låseskærmen hverken skrive kundens navn eller sige hvorfor han er lukket — og
**en spærring der ikke kan forklare sig selv, ligner en fejl.** Så ringer
kunden og siger at systemet er nede.

`abonnement` er `.write: false`. En kunde der kan sætte sin egen status til
`aktiv`, er ikke på pause.

### Den fejler åbent, som `harModul()`

En tenant **uden** `abonnement`-node er aktiv. Alternativet var at en kunde
oprettet før feltet fandtes står med et system der afviser alt — og han har
betalt. Noden kan ikke fjernes for at slippe udenom; den er `.write: false`.

`erAktiv()` i `abonnement.js` fejler åbent på nøjagtig samme måde, og de to
**skal** være enige: er klienten strengere end serveren, viser vi en låseskærm
oven på en database der svarer fint.

### ⚠ Den første prøve havde ingen tænder

Klausulen står **41 steder** i `firebase.rules.json` — én pr. regel. Den
første prøve probede kun noderne på øverste niveau, og da klausulen blev
fjernet fra `sensitive/kunder/.write` som efterprøvning, **blev suiten grøn**.

Prøven er nu en **lint der læser regelfilen**: hver regel der bærer
`_findes`-markøren, skal også bære abonnementsklausulen. Den navngiver den
regel der mangler den. En adfærdsprøve kan kun se de stier nogen huskede at
skrive ned — og det er præcis derfor hullet var der.

Efterprøvet mod den **udrullede** base med en rigtig bruger, ikke kun mod
filen (beslutning 29): fjorten punkter, alle holdt.

---

## 33. Et fravalgt modul lukker sine noder — læsning og skrivning

Modulafkrydsningen var en **kommerciel** kontrol og ikke en sikkerhedskontrol.
Det stod i rene ord i `moduler.js`: en kunde uden Facility der tastede
`/facility`, så sin egen tomme node — en salgsflade, ikke et databrud.

**Det holdt så længe listen kun tegnede en sidebar.** Det holder ikke, når
ejerkonsollen kan **fratage** et modul: gør vi kun det, har kunden stadig sine
data og sit API, og modulet er ikke solgt — det er foreslået.

`NODE_MODUL` i `moduler.js` er tabellen, og reglerne følger den. Håndhævelsen
rammer **både `.read` og `.write`** — 27 regler.

### ⚠ Prisen, som skal stå skrevet ned

**En kunde der får et modul frataget, kan ikke hente sine egne data ud gennem
appen.** De ligger der — intet slettes — men eneste vej til dem går gennem
servicekontoen. Fravælges Flåde for en kunde der har kørt to år, er hans
køretøjshistorik utilgængelig for ham selv fra det sekund.

Derfor: **et fravalg skal aftales, ikke bare klikkes.** Konsollen skal spørge,
fravalget skal i auditloggen med en årsag, og en eksport hører **før**
fravalget.

Jeg anbefalede kun at spærre skrivning, netop for at kunden kunne komme til
sit eget. Jørn valgte begge dele, og det er det stærkere kommercielt. Valget
står her sammen med prisen, så den næste ikke skal gætte hvad der blev vejet.

### Tre noder står med vilje i basen

`opgaver`, `satser` og `fakturaer` hører hver til **to** moduler:

| Node | Hvorfor to |
|---|---|
| `opgaver` | `art` er `vaerksted` \| `facility` (beslutning 21) |
| `satser` | prisgrupper hører til Kunder, kalkulationsprisen til Booking |
| `fakturaer` | ligger i Indkøb, men Økonomi læser dem |

En node der gates af det ene modul, går i stykker i det andet. Alternativet —
"har mindst ét af modulerne" — er en regel ingen kan læse sig til bagefter, og
den slags regler bliver forkert ændret.

`personale` og `kompetencer`… `personale` er base, fordi enhver
abonnementskombination har medarbejdere (det stod allerede i `permissions.js`).
`kpi` er ét aggregat: et modul man ikke har, har ingen tal.

### Den fejler åbent

En tenant **uden** `moduler`-node har alt. Samme retning som `harModul()` og
som abonnementsklausulen — en kunde oprettet før listen fandtes skal ikke stå
med et system der afviser alt.

### ⚠ To fejl undervejs, begge værd at kende

**Første patch erstattede på udtrykkets TEKST.** Flere regler har nøjagtig
samme udtryk, så `replace()` traf den første forekomst — altså en anden node.
Fem noder fik ingen klausul, og fem fik en de ikke skulle have. Rettet ved at
patche efter **position** i filen.

**Første prøve fejlede af den forkerte grund.** Skrivningen til
`facility/aktiver` blev afvist, fordi `lokationId` skal pege på en lokation
der findes — ikke fordi modulet manglede. En prøve der er rød af den forkerte
grund, bliver grøn af den forkerte grund næste gang.

Linten går **begge veje**: hver node i tabellen skal have klausulen, og ingen
node uden for den må have en. Kom klausulen ved et uheld på `personale`, ville
en kunde uden Bemanding ikke kunne se sine egne medarbejdere.

Efterprøvet mod den **udrullede** base med en rigtig bruger: nitten punkter,
alle holdt.

---

## 34. Ejerkonsollen skriver ikke — den beder om det

Alt hvad konsollen gør — opret kunde, sæt på pause, opsig, tildel moduler,
opret den første administrator — går gennem en Cloud Function med
`udbyder === true` som **første** handling.

**Hvorfor det ikke er nok at stole på claim'et i browseren:** en klient der må
skrive til `tenants/<id>/moduler` for ét `<id>`, kan skrive til dem alle.
Reglen kan ikke kende forskel på "min kunde" og "en anden kunde", når begge
er kunder. Serveren kan, fordi den kender handlingen.

`udbyder/kunder` og `tenants/<id>/{moduler,abonnement,virksomhed}` er alle
`.write: false`. Et udbyder-claim i en browser kan ikke skrive én byte.

### ⚠ Her — og kun her — kommer tenanten fra nyttelasten

Overalt ellers står der at tenanten kommer fra tokenet. Det gælder stadig for
kundens egne funktioner, og af den hårdeste grund der findes: en admin hos
kunde A der selv måtte oplyse tenanten, kunne oprette en administrator hos
kunde B.

Ejeren er undtagelsen, og det er ikke en opblødning: **en ejerkonto har slet
ingen tenant i sit token.** Der er ikke noget at tage. Derfor bærer
`udbyder`-claim'et hele adgangen, og en prøve holder de to adskilt — kundens
funktioner må ikke røre `kraevKundeId`, og ejerens må ikke røre
`kraevBrugeradmin`.

### Én oprettelse, to adgangskontroller

`kundeadmin` og `opretbruger` deler `opretKonto()`. De har forskellig
adgangskontrol — kundens admin må kun sin egen tenant, ejeren må hvilken som
helst — og **samme** oprettelse. To kopier ville drive, og den ene ville
glemme at skrive brugerindekset eller at sætte claims.

### Hver handling logges hos kunden

`audit/<kundeId>/sikkerhed/` med ejerens uid — ikke i en separat ejerlog.
Kunden skal kunne se at hans abonnement blev ændret; det er hans abonnement.
Og én auditmekanisme frem for to.

`aarsag` er en **allowliste**: `betaling`, `kundeoensket`,
`proeveperiodeUdloebet`, `fejloprettet`. Fritekst i auditloggen er præcis det
`audit-regler.js` findes for at holde ude.

---

## 35. Ejerskab tildeles ikke fra konsollen

`udbyder`-claim'et sættes kun med servicekontonøglen — `npm run ejer:giv`.
Konsollen kan hverken give eller fjerne det, og en prøve fastholder at ingen
ejerfunktion skriver `udbyder: true`.

**Hvorfor:** vi er to ejere. Kunne den ene fjerne den andens claim, kunne den
ene lukke den anden ude — og adgangen til at rette det var selv ejerskabet.
Det er nøjagtig beslutning 31 om igen (rollerne er faste, fordi en admin der
fjerner sin egen permission har låst sig ude), bare med højere indsats.

Det er ikke besværligt nok til at genere nogen to gange om året, og præcis
besværligt nok til at ingen gør det ved et uheld.

### En ejerkonto har ingen tenant

`harAdgang` i `App.jsx` kræver et tenant-claim, og den betingelse løsnes
**ikke**. En ejerkonto kan derfor ikke nå kundeshellen overhovedet — og
reglerne sammenligner `auth.token.tenant === $tenantId`, så den kan ikke læse
én eneste kundes data uanset hvad klienten sender.

**Spærringen er ikke en betingelse i en skærm; den er fraværet af en nøgle.**

De to ejere har **samme rettigheder**, og alt logges. Et fire-øjne-princip med
to personer er ikke et princip — det er en aftale om altid at være to på
kontoret.

---

## 36. En nul-linje dokumenterer en måling. Den vendes tilbage

`linjerForPeriode()` sprang linjer på 0 kr. over. Begrundelsen stod i koden og
var ikke dum: *"en linje på nul kroner er støj på en faktura."*

**Den holder ikke, når der er en frimængde.**

Abonnementet inkluderer tre desktopbrugere. En kunde med én desktopbruger
skal have linjen:

```
Brugere (1 · 3 inkluderet)      1      149,00      —      0,00
```

Uden den linje **kan kunden ikke se forskel på at målingen var nul og at den
manglede.** Og det er netop den forskel der betyder noget: målingen kan ikke
laves bagud (beslutning om højeste antal), så en manglende dag er en fejl der
ikke kan repareres. En faktura der tier om det, skjuler den eneste ting man
kunne have reageret på.

Det er samme argument som `dageMaalt` ved siden af `dageFaktureres` på
grundlaget: to tal der ser ens ud på en total, men betyder noget forskelligt.

### Hvad der stadig springes over

Ikke alt nul vises. En **modul- eller køretøjslinje uden sats** udelades
fortsat: der er ingen aftale om den, og den ville ikke dokumentere en måling —
den ville dokumentere at vi ikke sælger noget.

Reglen er derfor ikke "vis alle nuller", men: **vis linjen når der ER blevet
målt noget, uanset hvad det kostede.** Det er `altidVis` i `laeg()`, og den
sættes kun på brugerlinjerne.

### To ting kom med i samme ombæring

**Platformsadgang er en egen prislinje, ikke `dashboard`-modulet.** Et
katalogpunkt der både er en skærmsektion i sidebaren og en prislinje på en
faktura, er én ting med to betydninger — og linjen skulle hedde
"Platformsadgang" på fakturaen og "Dashboard" i menuen.

**Frimængden hører til platformsadgangen, ikke til modulet.** En bruger er ét
login hos kunden, ikke ét pr. modul: lå frimængden på modulet, ville en kunde
med fire moduler à "3 inkluderet" have **tolv** gratis brugere, og han ville
ikke kunne se hvorfor.

⚠ **Det flyttede også selve brugerprisen.** En faktura har én linje pr.
brugerart, og en linje kan kun have **én** stk.pris — den kan ikke være summen
af fire modulers satser. `prBrugerOere` ligger derfor på platformen, og
reglerne **afviser** feltet på et modul. Modulerne beholder deres månedspris
og køretøjspris.
