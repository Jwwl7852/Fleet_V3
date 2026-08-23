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
| 18 | **Personale og flåde er entiteter.** Nøglen i `personale/` er et `personId`; `uid` er et valgfrit felt, der sættes hvis personen får et login. Flåden er ikke en liste af biler: `art` styrer skemaet, og en påhængt enhed kan ikke disponeres alene. Begge ligger i **basen** — enhver abonnementskombination har medarbejdere og materiel. | Modellen dækkede ikke det den påstod. Chauffører fandtes kun som navne i en kompetencetabel, så hverken Bemanding eller Kompetencer havde et sted at hente dem fra, og bus-divisionen havde ingen enhedstype at pege på. Bytter man `uid` og `personId` om, holder ejerskabstjekket i reglerne op med at virke: `oprettetAf === auth.uid` matcher aldrig et personId, og en chauffør har måske slet intet login. En person findes før sit login og efter det — kontoen lukkes ved fratrædelse, men en reservation fra tre år siden skal stadig kunne opløses til et navn. ⚠ **Trin 3 stod åbent i månedsvis, og det kostede penge hver dag:** `laengdeMm` blev valideret som millimeter netop fordi 9,998 mod 10,002 afgør en færgetakst — og intet læste feltet. Se afsnittet nedenfor. | `fleet/personale.js`, `fleet/flaade.js` |
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

### Et fjerde token: `--fc-overlay`

Driftskalenderens hændelsespanel er **modalt** — det lægger sig over skærmen,
og baggrunden bag det skal dæmpes. Uden dæmpning kan man ikke se hvad der er
aktivt: panelet ser ud som endnu et kort på siden, og man klikker videre i
tabellen nedenunder uden at forstå hvorfor der ikke sker noget.

Værdien er `rgba(16,26,48,.44)` — **sidebarens navy** (`--fc-navy`,
`#101a30`) ved 44 %, ikke en neutral sort. En sort overlay gør alle farver
under sig grå-brune; en navy overlay lader accenten blive blå. Det er samme
flade der allerede ligger i `--fc-shadow`, så skyggen under panelet og
dæmpningen bag det er den samme farve i to styrker.

⚠ **Det er ikke en statusfarve, og det er ikke en kategorifarve.** Det er en
FLADE — den betyder ingenting, den fjerner bare opmærksomhed. Derfor står den
ikke i `--fc-serie-*` eller `--fc-ikon-*`: begge de paletter *encoder*
noget, og validatorens gulve gælder dem. En overlay har intet at være læsbar
imod.

⚠ **Og den er et token frem for en rå `rgba()` i reglen.** Der findes præcis
ét sted der dæmper baggrunden i dag; skulle der komme et til, ville to
overlays i hver sin opacitet være to forskellige svar på "hvor meget skal der
dæmpes" — og forskellen ses kun når de to står åbne efter hinanden.
`test/design-tokens.test.mjs` fejler på en farveværdi hvor som helst i
`src/` uden for tokenfilen, så alternativet var ikke "en rå værdi", det var
"en rå værdi på undtagelseslisten".

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

Kunden tildeler derfor blandt **syv** faste roller — chauffør,
lagermedarbejder, sagsbehandler, disponent, koordinator, revisor,
administrator — og ændrer ikke hvad de indeholder. Skal en rolle betyde noget
andet, er det en ændring i `permissions.js` og i regelfilen, ikke et klik.

⚠ **Der stod SEKS her indtil Unitbooking kom.** `lagermedarbejder` blev tilføjet
fordi prototypen ville lade chaufføren udlevere og modtage kasser — og en
chauffør kører; den der står med kassen i hånden på lageret, er en anden
person med et andet arbejde. **Det er sådan en rolle skal komme til:** som en
ændring i koden, med en begrundelse, prøver og fornyede claims — ikke som et
felt en kunde kan rette.

⚠ Og den kostede med det samme en anden beslutning: en ny rolle uden en
**brugerart** i `priser.js` ville lydløst være blevet faktureret som
*desktop*, den dyre af de to. Prøven fangede det i samme kørsel.

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

### 31b. Omgjort: kunden kan redigere sine roller — med to spærringer

**Kunden har bedt om det, og beslutningen er truffet igen med åbne øjne.** En
vognmand vil kunne tildele sine medarbejdere adgang efter stilling uden at
skulle bede os om en kodeændring for hver variant. Afsnittet ovenfor bliver
stående, fordi det er det eneste sted der står **hvad der går galt uden
beslutningen** — og de to farer er ikke forsvundet. De er håndteret.

#### Hvad vi opgav

Roller er ikke længere faste. `permStrengFraRolle()` læste fra en **konstant**
i `permissions.js`; claims mintes nu fra `tenants/<id>/roller/<rolle>/perms`.
Der ligger altså et opslag i basen mellem "hvem er du" og "hvad må du", hvor
der før var en kodelinje.

Prisen er konkret og skal kendes: **en ændring i en rolle skal genudstede
claims for HVER bruger med den rolle**, plus `revokeRefreshTokens` på dem alle.
Gør den ikke det, virker den gamle adgang indtil tokenet udløber af sig selv —
den fejltilstand `skiftrolle` allerede advarer imod, fordi den *ser ud som om
den lykkedes*.

#### Fare 1: at låse sig selv ude — nu spærret mekanisk

> *"En vognmand der fjerner `booking.godkend` fra sin egen adminrolle har
> lukket sig selv ude af sit eget system. Der findes ingen vej tilbage fra
> klienten: adgangen til at rette rollen var selv en permission."*

Det er stadig sandt, og derfor kan **to ting ikke lade sig gøre**:

1. `brugere.skriv` — den permission der giver adgang til at redigere roller —
   kan ikke fjernes fra den **sidste** rolle der har den.
2. Man kan ikke fjerne den fra **sin egen** rolle, heller ikke selv om en anden
   rolle også har den. En admin der vil degradere sig selv, skal have en anden
   admin i huset til at gøre det.

Spærringen ligger i den Cloud Function der skriver, ikke i skærmen. En kontrol
der kun findes i frontend, er en pæn knap — og her ville den pæne knap koste
kunden adgangen til sit eget system.

#### Fare 2: to håndhævelsespunkter — undgået ved at noden ikke er ét

Den anden indvending stod i regelfilen, og den er den stærkere af de to:

> *"en node der KUNNE bestemme hvad en bruger må, ville være et andet
> håndhævelsespunkt end tokenet — og to håndhævelsespunkter er ét for mange."*

Der er et svar på den, og det er **hele designet**:

> `roller/` er en **KILDE**, aldrig et **HÅNDHÆVELSESPUNKT**.

Konkret betyder det tre ting:

- `firebase.rules.json` læser **aldrig** `roller/`. Ingen regel må slå op i
  noden for at afgøre noget; adgang afgøres fortsat udelukkende af
  `auth.token.perms`. **En prøve håndhæver det** — finder den en regel der
  refererer `roller`, falder den.
- Noden er `.write: false`. Den skrives kun af `rolleskriv`, som minter claims
  i samme ombæring. Kunne en klient skrive den direkte, ville noden og tokenet
  kunne stå og være uenige indtil næste mint.
- Rækkefølgen i funktionen er: validér → skriv noden → mint claims → tilbagekald
  tokens. Fejler mintningen, er noden rettet og tokenet ikke — derfor logges
  det, og rollen kan skrives igen.

Så længe den regel holder, er der stadig **ét** sted adgang afgøres: tokenet.
Noden er det sted man *redigerer* hvad der næste gang bliver mintet ind i det.

#### Det der ikke ændrede sig

- **De syv rollers NAVNE er stadig faste.** Man redigerer hvad en rolle
  indeholder; man opfinder ikke en ottende. En ny rolle er stadig en ændring i
  koden — med en begrundelse, prøver og en **brugerart i `priser.js`**, ellers
  bliver den lydløst faktureret som *desktop*, den dyre af de to.
- **Permissions-kataloget er stadig lukket.** Man kan kun sætte permissions der
  står i `ALLE_PERMS`. En ukendt streng i en rolle ville være en adgang ingen
  regel kender — altså en adgang til ingenting, som *ser ud* som om den gav
  noget.
- **Chaufføren kan stadig kun det han kan** som udgangspunkt. Kunden kan give
  ham mere; det er dét der er hele pointen. Prøven der hedder "chaufføren kan
  KUN indberette" prøver derfor **standardrollen** i `ROLLE_PERMS`, ikke hvad
  en given tenant måtte have gjort ved sin.

⚠ **Og `ROLLE_PERMS` forsvinder ikke.** Den er **standarden**: det en ny tenant
får, og det en rolle falder tilbage på hvis noden mangler. En tenant uden
`roller/` opfører sig præcis som før — og dét er hvad der gør ændringen sikker
at udrulle.

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


## 37. "Booket" er ikke en kassestatus. Og udlånet skrives kun af serveren

Prototypen gav en transportkasse fem statusser: *Ledig, Booket, Klargjort,
Udlånt, Ude af drift*. Unitbooking etape 4 fjernede den ene af dem og lukkede
hele `kasseudlaan` for klienten. Begge dele kom af det samme spørgsmål:
**hvem ejer kendsgerningen?**

### Booket

Spørgsmålet blev stillet direkte, og svaret var: *"Booket betyder at en
sagsbehandler har reserveret."*

Det afgjorde sagen. En reservation **er** et udlån — den har en periode, et
sagsnummer og en person der oprettede den, og alt det står allerede i
`kasseudlaan`. Et `booket`-flag på kassen ville være **samme kendsgerning
gemt to steder**, og så bliver de uenige. Det er `bemanding.ledig` i ny
forklædning: et gemt afledt tal der driver fra sit grundlag.

Kassen har derfor kun de tilstande den **fysisk** kan være i:

```
ledig · klargjort · udlaant · udeAfDrift
```

En kasse der er reserveret til oktober, står i august stadig på sin hylde og
er **ledig**. Reservationen vises som et mærkat udledt af `kasseudlaan` — med
**sagsnummer og periode**, hvilket er mere end et bart "Booket" nogensinde
fortalte. Prisen er en ekstra læsning i Kasser-skærmen. Det er den rigtige
pris: et flag kunne kun sige *at* kassen var lovet væk, ikke til hvem.

⚠ **Klienten må kun sætte to af de fire.** `klargjort` og `udlaant` er
**følger** af et udlånsskifte, ikke valg. Formularen tilbyder kun `ledig` og
`udeAfDrift`, og reglen håndhæver det samme — begge veje:

```
newData.val() === data.val()
|| (newData.val().matches(/^(ledig|udeAfDrift)$/)
    && (!data.exists() || data.val().matches(/^(ledig|udeAfDrift)$/)))
```

Første led lader en **uændret** status blive stående, så man kan rette en note
på en kasse der er ude. Sidste led kræver at **både** den gamle og den nye
værdi er klientens egne — uden det matcher `ledig` også når kassen kommer FRA
`udlaant`, og så kan en kasse meldes hjem uden om udlånet, mens udlånet stadig
siger at museet har den. **Den fejl var i den første version af reglen, og den
blev fundet af en prøve, ikke af en gennemlæsning.**

### Udlånet

`kasseudlaan` er `.write: false`. Ikke fordi lagermedarbejderen mangler en
rettighed — han **har** `kasseudlaan.skriv`, og den blev der ikke fjernet.
Det er **vejen** der er lukket, fordi handlingen ikke kan udføres rigtigt fra
en klient:

1. **Et udlån ændrer TO poster.** Udlånet og kassen skal skrives sammen eller
   slet ikke. Skrives kun den ene, står en kasse som udlånt uden et udlån at
   pege på — og ingen kan se hvem der har den.
2. **Perioden skal prøves mod de andre udlån.** `konflikter()` er ren og
   prøvet, men den **afgør ingenting** — den svarer. Ligger tjekket i skærmen,
   kan det gås uden om med en direkte skrivning, og så er det dekoration.
   Samme forbehold som de fem disponeringstjek.
3. **To lagermænd kan ramme samme sekund.** Et læs-så-skriv uden lås ville
   lade begge bookinger passere hver sin kontrol og lande oven på hinanden.
   Det er DE-QR 777 mod DE-KL 404 igen, denne gang med en kasse.

`kasseudlaanskriv` gør derfor konflikttjekket **inde i en transaktion på
listen**: den genlæser og kører kroppen igen, hvis nogen nåede at skrive
imens. Prisen er at hele noden læses og skrives pr. booking. Vokser den ud
over det, er svaret et **indeks pr. kasse — ikke et svagere tjek.**

⚠ **Serveren prøver mod DEN SAMME fil som skærmen.** `unitbooking.js` er
kopieret til `functions/delt/`, og `valideUdlaan()`, `kanSkifteUdlaan()` og
`konflikter()` er de samme funktioner begge steder. Skrev serveren sin egen
afskrift, ville skærmen sige ja og serveren nej — uden at nogen kunne se
hvorfor. Det er syvende fil efter det mønster.

⚠ **Modul og abonnement prøves også i funktionen.** Admin-SDK'et går uden om
reglerne, og reglerne er det eneste sted de to spærringer ellers står. Uden de
tjek ville funktionen være en åben dør rundt om både modulafkrydsningen og
loginspærringen — en kunde på pause kunne skrive videre gennem den.

### To ting i tilstandsmaskinen der ligner pedanteri

**Der er ingen genvej fra `booket` til `udlaant`.** Klargøringen er det ene
sted hvor et menneske har kassen i hånden og kan se om den er hel. Springes
den over, går kassen ud af huset uden at nogen har set på den, og skaden
opdages hos museet — hvor den ikke kan afgøres. Det koster ét klik.

**Der er ingen vej tilbage fra `returneret`.** Kassen er kommet hjem; skal den
ud igen, er det et **nyt** udlån med sin egen periode. En genåbnet post ville
betyde at historikken kunne skrives om bagefter.

### Hvad der kom med i samme ombæring

⚠ **`valideKasse()`s regel om at en udlånt kasse ikke optager en reolplads
stod kun i frontend.** Den har været skrevet siden etape 2 og blev først
håndhævet nu — fundet af en prøve i etape 4, to etaper efter. En kontrol der
kun findes i klienten, er ikke adgangskontrol.

⚠ **`isoTilMs`/`msTilIso` er flyttet til `format.js`.** De var skrevet af i
`personale.js` og i Indkøb, og en tredje kopi var på vej ind med Unitbooking.
Klokken er 12 og ikke midnat: `new Date("2026-08-10")` er midnat UTC, og
trækkes der en time et sted i kæden, bliver det den 9.

⚠ **`kasseId` kom på `LOGBARE_FELTER` — `sagsnummer` gjorde ikke.** Kassens id
er en kontrolleret reference som `koeretoejId`; sagsnummeret er 40 tegn en
sagsbehandler har tastet, og allowlisten findes for at holde tastet tekst ude
af auditloggen.

## 38. Kundens pris ligger på kunden — og derfor kræver den to permissions

Standardprisen ligger i `satser/standard/<ydelseId>/satser/<id>`. Kundens
afvigelse kunne have ligget samme sted, som en gruppe ved siden af standard.
Den ligger i stedet på **kunden**:

```
kunder/<kundeId>/priser/<ydelseId>/satser/<satsId> = {
  gyldigFra,
  beloebOere,   // egen pris — ELLER
  rabatBps      // rabat på standardprisen
}
```

Prisen hører til aftalen, og aftalen hører til kunden. Læsningen følger
kunden med `kunder.laes`, og en pris kan ikke komme til at hænge på et
kundeId der ikke findes — kundens egen `.validate` kræver `division`, og den
gælder også en skrivning dybt nede i undertræet.

### ⚠ Men `.write` kaskaderer, og det flyttede i stilhed hvem der må sætte en pris

`tenants/<id>/kunder` er skrivbar med `kunder.skriv`, og den permission
ligger i `BASIS_DATA`: **casehandler, disponent og koordinator har den alle.**
`satser.skriv` har **kun admin**. Lagt ind under `kunder/` uden videre kunne
enhver der må rette en kundes adresse, også give kunden 30 % rabat — mens
standardprisen krævede admin. Det er ikke en rettighed nogen havde besluttet
at give; det er en der fulgte med stien.

Man kan ikke stramme et barn under en åben `.write`. Man **kan** lægge en
`.validate` — den kan læse `auth`, og den kører for hele stien:

```json
"priser": {
  ".validate": "auth != null && auth.token.perms != null && auth.token.perms.contains('|satser.skriv|')"
}
```

At forfaderens `.validate` også kører ved en **dyb enkeltfelt-skrivning** var
det led hele placeringen stod og faldt med. Det er derfor en prøve og ikke en
antagelse: `test/rules.kundepriser.test.mjs` skriver til
`…/satser/<id>/rabatBps` som en bruger med `kunder.skriv` alene og kræver en
afvisning. Kunne man gå udenom ved at gå dybt nok ned, var konstruktionen
pynt.

### ⚠ Hullet der bliver tilbage, og som ikke kan lukkes her

**`.validate` kører ikke ved en sletning.** En bruger med `kunder.skriv` alene
kan derfor **fjerne** en kundes prisafvigelse, selv om hun hverken kan sætte
eller ændre den. Det er efterprøvet mod den udrullede base — ikke udledt: en
seedet casehandler slettede en rabat som admin lige havde skrevet.

Det kan ikke lukkes med en regel. En `.write: false` på et barn ophæver ikke
en åben `.write` længere oppe, og reglerne kan ikke udtrykke "de børn der var
her, skal stadig være her". **Den eneste fuldstændige lukning er at flytte
prisen ud af `kunder/`** — altså den anden placering. Afvejningen blev taget
med åbne øjne: sletningen fjerner en aftale og opfinder ingen, den kræver
`kunder.skriv` i forvejen, og klienten har ingen vej til den — `skriv.js` har
ingen `slet()`, og skærmen har ingen sletteknap.

En halv spærring blev fravalgt af samme grund som et halvt momsbeløb: den
ville se ud som en beskyttelse.

### Enten en egen pris eller en rabat — aldrig begge

To felter der begge kan sætte prisen, er to svar på samme spørgsmål, og så
bliver det tilfældigt hvilket der vinder. Reglerne afviser en post med begge
og en post med ingen af dem.

Forskellen mellem de to er hele grunden til at der skal vælges: **en rabat
følger standardprisen, en egen pris gør ikke.** Ændres standarden i morgen,
flytter rabatkunden sig med; den med sin egen pris bliver stående.

### ⚠ En rabat på en standardpris der mangler, er `null` — ikke 0

15 % af ingenting er ikke nul kroner; det er det samme ubesvarede spørgsmål
med et tal foran. Regnede `prisFor()` den til 0, ville en glemt standardpris
blive til en **gratis ydelse** hos præcis den kunde der havde forhandlet sig
til en rabat. Samme regel som momssatsen der mangler.

Og opslaget sker ét sted. `prisFor()` bygger på `satsPaa()` og
`rabatteretSatsOere()` — den skriver ingen af dem af. En procentregning mere
ville være en afrundingsregel mere.

---

## 39. Enheden er et eget objekt — og prisen betales tre steder

Et serienummer kunne have været det samme som en batch: et parti på præcis én
enhed, lagt i beholdningsnøglen hvor batchen står. Ingen ny node, ingen ny
kendsgerning, og "hvor er SN-4711" ville have været et opslag i data der
allerede fandtes.

Det blev i stedet **`enheder/<serienr>`**, med enhedens vare, kunde, beholder
og tilstand:

```
enheder/SN-4711 = { vareId, kundeId, carrierId, tilstand }
beholdning/CRR-100246__v-tool-1256___ = { antal: 3000 }
```

Begrundelsen er at en enhed har sin egen historie, sin egen tilstand og sin
egen skæbne — et rigtigt WMS modellerer den sådan, og alt hvad man senere vil
kunne sige om ét stykke gods (garanti, reparation, ejerskifte, skade) hænger
på enheden og ikke på et tal.

### ⚠ Men de to noder bærer den SAMME kendsgerning

`beholdning` siger *hvor mange*. `enheder` siger *hvilke*. Det er to
repræsentationer af én ting, og det er præcis den klasse fejl `bemanding.ledig`
var: to steder der kan komme ud af trit, hvor kun det ene bliver rettet.

Alternativet — serienummeret som batch — havde ikke den svaghed overhovedet.
**Valget er truffet med den viden**, og prisen er derfor betalt eksplicit tre
steder. Ingen af dem er en detalje der kan ryddes op i senere:

| # | Betalingen | Hvor | Hvad der sker uden |
|---|---|---|---|
| 1 | Enhedsrækken skrives i **samme `rod.update()`** som bevægelsen og beholdningen. RTDB's multi-path update er atomisk | `bevaegelseskriv` | To kald er to udfald. Halvdelen af skrivningerne kunne lande, og uenigheden ville være vores egen |
| 2 | En bevægelse af en serie-sporet vare bærer **præcis én enhed** | `valideBevaegelse()` | Ét serienummer skulle bestemme ti enheders skæbne. De ni ville være usporede bag et tal der så rigtigt ud |
| 3 | `enhedsafvigelse()` sammenholder tallet med rækkerne, og **skærmen viser det** | Sporbarhed | En drift der ikke kan ses, bliver ikke rettet. Så er den ekstra node bare et andet sted at tage fejl |

Derfor er noden også `.write: false` for **alle**, og der findes med vilje
**ingen `enheder.skriv`**. Det er ikke en manglende rettighed — det er vejen
der er lukket, som ved `kasseudlaan` (beslutning 37). Kunne en klient skrive
rækken alene, var betaling 1 spildt i samme øjeblik.

### Og uenigheden er ikke et tal der skal rettes

Samme holdning som ved en negativ saldo og ved optællingens afvigelse: de to
kilder skrives sammen, så en uenighed betyder at **en bevægelse ikke er
landet** — eller at nogen har skrevet uden om `bevaegelseskriv`. Find
bevægelsen. En optælling retter saldoen, men ikke enhederne, og en skærm der
tilbød at "rette" tallet ville skjule årsagen.

⚠ **Demo-sættet skal være enigt med sig selv.** Er det ikke det, står
afvigelsespanelet rødt fra dag ét, og så lærer man at rødt er
normaltilstanden — hvorefter en rigtig uenighed hos en kunde forsvinder i
støjen fra vores egen. `demo-lager.js` kontrollerer det selv, og
`sporbarhed.test.mjs` fejler på det.

Se WAREHOUSE.md punkt 9.

---

## 40. Forslaget hører på etapen — og bookingen har ingen tilstandsmaskine

Et forslag lå to steder. På **bookingen** med afhentning, levering, transittid,
prisestimat og note; på **etapen** med enheder og chauffør. For et forløb med
én etape — hvilket er alle demo-forløbene på nær ét — var det det samme løfte
skrevet to steder.

Det er mønstret der har kostet mest i dette repo. `lagre` mod `lager`,
`bookinger` mod `bookings`, Bil 104 med to nummerplader, `warehouse` mod
`warehouse`. `test/demo-kilder.test.mjs` findes for at fange det, og den fangede
det ikke her, fordi de to ikke hed det samme.

**Det man disponerer, er en etape** (beslutning 16). Forslaget ligger derfor på
etapen, med *alle* sine felter, og bookingen bærer ingen.

```
etaper/<etapeId>/forslag/<forslagId> = {
  nr, koeretoejIder: { <id>: true }, personId,
  afhentningMs, leveringMs, transitTimer, estimatOere, note
}
etaper/<etapeId>/valgtForslagId
```

### ⚠ Følgen: der er kun én overgangstabel

`OVERGANGE` stod ved siden af `ETAPE_OVERGANGE` — to næsten identiske tabeller,
hvor bookingens manglede `aaben` og ellers var den samme. Kommentaren under den
sagde selv *"Én kontrol, to tabeller. Ellers driver reglerne fra hinanden"* —
men **to tabeller er hvordan de driver.**

Den er væk, og med den `kanSkifte()`, `byggSkifte()` og
`tilgaengeligeHandlinger()`. Ikke som oprydning, men fordi:

- bookingens tilstand er **afledt** (`forloebstilstand()`) og skrives af
  `etapeskift` i samme opdatering som etapeskiftet;
- en tilstandsmaskine der kunne sætte den direkte, ville være en anden vej til
  et felt der har ét sted at komme fra;
- **en funktion der findes, bliver kaldt.** `kanSkifte()` havde nøjagtig én
  kalder tilbage, og den skrev ikke — den ville have gjort det, næste gang
  nogen byggede videre på Forslag-skærmen.

`TILSTAND` bliver stående: de ti navne er de samme for et forløb og en etape,
og et forløb skal kunne tegnes med sin pille.

### Hvad det ændrede i skærmene

| Skærm | Før | Nu |
|---|---|---|
| **Forslag** | Bookingens forslag, knapper deaktiveret (fase 0) | Etapens forslag, **live** gennem `etapeskift`. Etapevælger, fordi et forløb med flere etaper godkendes én ad gangen |
| **Booking-oversigt** | Handlinger pr. *booking* | Handlinger pr. **etape** — bookingens tilstand er ikke noget nogen skifter |
| **Ny forespørgsel** | `kanSkifte()` | `kanSkifteEtape()` — en forespørgsel bliver til et forløb med mindst én etape |

⚠ **Forslag-skærmen viser nu også de fem tjek for det valgte forslag, før man
trykker.** Serveren kører dem igen og afviser med samme sætning, men at se dem
først er forskellen på at vælge rigtigt og at få en fejl man ikke vidste var
mulig. `fs-c` i demo-sættet rammer med vilje en reservationskonflikt.

### ⚠ Og det afslørede at DEV løj om lageret

En `reserveret` etape har reservationer — men de skrives **kun** af
`etapeskift`, og provisioneringen sprang dem over. Hver eneste bil så derfor fri
ud i dev, og den første probe godkendte to ture på samme chauffør uden at
konflikttjekket sagde noget. Det lignede en fejl i tjekket; det var en fejl i
dataene.

Provisioneringen udleder dem nu af etaperne med **den samme**
`reservationerFraEtape()` som funktionen bruger. To udgaver ville betyde at dev
viste et lager der var reserveret på én måde og produktion på en anden.

### ⚠ Tilføjelse til 31: `roller/`-noden er væk

Beslutningen blev truffet, og noden blev liggende. `tenants/<id>/roller/` stod
i regelfilen som `.write: false` *"indtil den Cloud Function der udsteder
claims, findes"* — og README førte den funktion som en af de otte der manglede.

Den skal ikke findes. Det er den samme beslutning, læst til ende: er rollerne
faste, er der ikke noget at udstede claims **fra**. Claim'et kommer fra
`ROLLE_PERMS` i koden, mintet af `skiftrolle` og af provisioneringen, og
`revokeRefreshTokens` gør en nedgradering øjeblikkelig.

Noden var tom. Ingen skrev den, ingen læste den — kun to kommentarer nævnte
den. Det er ordret den døde overflade beslutningen selv fjernede idébanken for:

> En node ingen skærm læser, med en skriverettighed hver chauffør har, er død
> overflade — og død overflade er noget nogen finder på at bruge til noget.

⚠ **Og prøverne bar antagelsen videre.** Der stod *"roller/ skal være
`.write: false` indtil claim-udstedelsen findes"* og *"åbnes noden for admin
med `roller.skriv`, SKAL den her test opdateres"* — en test der forberedte en
funktion beslutningen havde afskaffet. De prøver spørger nu om det rigtige: at
noden ER væk, at claim'et kommer fra presettet, og at der ikke findes et opslag
i `roller/` nogen steder i `functions/`.

**Der er kun ét håndhævelsespunkt: tokenet.** En node der *kunne* bestemme hvad
en bruger må, ville være et andet — og to håndhævelsespunkter er ét for mange.

## 41. Der er en linter, og den afgør ét spørgsmål

`npm run build` er **grøn** når en underkomponent læser et navn der ikke findes
i dens scope. Vite oversætter filen fint; fejlen sker først når React render'er
komponenten — og så er skærmen hvid.

Det er sket **fem gange**, hver gang i en underkomponent langt nede i en fil
der ellers virkede:

| Navnet | Filen |
|---|---|
| `KILDER` | `indkoeb/Leverandoerer.jsx` |
| `sensitivt` | `flaade/Indberetninger.jsx` |
| `useListe` | `flaade/Vaerkstedskalender.jsx` |
| `etaper` | `booking/Uplanlagte.jsx` |
| `biler` | `Forslagstabel` |

Hver eneste blev fundet ved at **klikke** skærmen. Prøverne så dem ikke — de
prøver domænelogikken, ikke JSX'en — og buildet så dem ikke. Det er den
dyreste måde at finde en fejl på, og den finder kun det man kommer forbi.

`no-undef` afgør det statisk, for hele træet, på under et sekund.

### ⚠ Og derfor står der så få regler

Fristelsen er `eslint:recommended` og 400 rettelser. Det ville være en anden
opgave. Repoet har egne konventioner, de er skrevet ned og begrundet **her**,
og en regelpakke der er uenig med dem, ville enten blive slået fra igen eller
stille ændre koden efter en mening ingen har taget stilling til.

Reglerne er dem der svarer med ja eller nej — findes navnet, eller findes det
ikke — og ikke dem der har en holdning:

    no-undef, no-unused-vars (kun imports og lokale, ikke argumenter),
    no-dupe-keys, no-dupe-class-members, no-unsafe-negation, no-unreachable

`no-use-before-define` stod der og blev fjernet igen: ni fund, nul fejl. Alle
ni var samme mønster — en `const`-pilfunktion kaldt inde i en anden funktions
krop, udført længe efter modulet er indlæst. Reglen kan ikke se forskel på
"kaldes senere" og "læses nu", og **en regel der kun råber forkert, bliver
slået fra** — og så fanger den heller ikke den ene gang den har ret.

`no-unused-vars` ser med vilje ikke på argumenter. En ubrugt parameter er tit
meningen — en render-funktion der får `(raekke, indeks)` og bruger den ene.
Klagede linten over dem, ville man sætte `_` foran halvdelen af koden for at
gøre værktøjet tilfreds, og så har det ændret koden uden at finde en fejl.

### ⚠ Den fandt ingen manglende navne — og fire andre ting

Nul `no-undef`. De fem kendte var rettet i forvejen. Fundene var alle
`no-unused-vars`, og de delte sig i fire slags:

1. **Glemte imports efter en omskrivning** — det store flertal, uden
   betydning.
2. **En regnet værdi der aldrig når skærmen.** `Prisliste.jsx` regner
   `sidstRettet`, med en kommentar om hvad tallet betyder, og viser det ikke.
   Samme mønster som dækningsgradsafvigelsen i Økonomi.
3. **En tilstand uden en kontrol.** `booking/Oversigt.jsx` har `visAlle`, og
   `setVisAlle` kaldes ingen steder — så udførte, afviste og annullerede
   bookinger er **permanent** skjult, mens fodnoten under tabellen siger
   *"Viser N af M hentede bookinger"*. Brugeren kan se at noget mangler og
   ikke få det frem.
4. **En afvist læsning der faldt igennem til et tomt svar.**
   `Bookingopsaetning.jsx` regnede `tilstand` og importerede `Datatilstand` —
   og brugte ingen af dem. Blev `omkostninger` afvist af reglerne, viste
   skærmen et **tomt satsark** frem for at sige hvorfor. Det er beslutning 26
   brudt på det værst tænkelige sted: arket er et prisgrundlag, og et
   manglende færgetillæg er ikke en tom tabel man undrer sig over — det er et
   tilbud der er for billigt.

Punkt 4 er rettet. Punkt 2 og 3 står, med en note i koden og en
`eslint-disable-next-line` der peger på den: rettelsen er en kontrol der skal
tegnes og klikkes, og et navn der bare fjernes, tager beviset med sig.

⚠ **De to sidste er grunden til at reglen ikke blev sat til `warn`.** En
advarsel havde stået i outputtet og var blevet der.

### ⚠ Og linten kostede næsten en fejl til

Første gennemløb fjernede undervejs **387 afsluttende kommaer** i 45 filer —
en stilændring ingen regel bad om, og som begravede de femten rigtige fund i
et diff på 471 linjer. Værre: den samme omgang ændrede ejerkonsollens
mailmønster fra `{2,}` til `{2}`. Se beslutning 42.

**Et værktøj der rydder op, skal kunne gøre rede for hver linje det rører.**
Kan det ikke det, er oprydningen selv en ændring ingen har besluttet.

## 42. Mailmønsteret stod fire steder, og de var uenige

Serveren afviste enhver adresse hvis topdomæne ikke var på **nøjagtig to
tegn**. `functions/index.js` bar `/^[^\s@]+@[^\s@]+\.[^\s@]{2}$/` hvor klienten
bar `{2,}`.

Følgen: `jorn@vognmand.dk` kunne oprettes. `jorn@vognmand.com` kunne ikke —
formularen sagde ja, og serveren svarede *"Ugyldig mailadresse"* uden at sige
hvad der var galt med adressen. Det ramte **både** kundens egen
brugeroprettelse (`opretbruger`) og ejerkonsollens førsteadmin (`kundeadmin`);
de deler `opretKonto()`.

Der var fire kopier i alt, og de gav tre forskellige svar:

| Fil | Mønster | Godtager |
|---|---|---|
| `fleet/brugere-regler.js` | `{2,}` | `.dk`, `.com` |
| `functions/index.js` | `{2}` | kun `.dk` |
| `udbyder/Konsol.jsx` (inline) | `{2}` | kun `.dk` |
| `fleet/dev-brugere.js` | `+` | også `.d` |

⚠ **Hvorfor ingen opdagede det.** Prøven i `skrivning.test.mjs` prøvede
`"lars-at-vognmand"` — en adresse uden krøllet a. Et mailmønster fejler ikke
på det grove; det fejler på det almindelige, og `.dk` virkede. Og filens egen
kommentar sagde *"⚠ SPEJLER FUNKTIONEN"* — men **et spejl kan ikke opdage sin
egen drift**.

Rettelsen er den samme som `kopier-delt.mjs` findes for: `brugere-regler.js`
står nu i `DELTE_FILER`, serveren **importerer** `erGyldigMail` og
`MINDSTE_KODE`, og de tre afskrifter er væk. `test/functions-delt.test.mjs`
håndhæver at kopien er byte-identisk, og en prøve læser de fem filer som tekst
og fejler på et mailmønster nummer to.

⚠ **Kodekravets prøve var samme fælde, en tand mildere.** Den læste efter
teksten `kode.length < 12` i `functions/index.js` og holdt dermed to tal i
sync. Et tal der holdes i sync af en prøve, er stadig to tal — funktionen
importerer nu konstanten, og prøven læser efter importen.

## Beslutning 18 i detaljer — trin 3: længdebåndet

De to første trin gjorde personale og flåde til entiteter. Det tredje har stået
åbent siden, og det var det eneste af dem der kostede penge hver dag.

`laengdeMm` stod på hvert eneste køretøj. Det blev valideret som
millimeter-integer, med en kommentar der forklarede hvorfor:

> Længden er millimeter som integer — færgetakster har grænser ved 10 og 20 m,
> og 9,998 mod 10,002 afgør prisen.

Og **intet læste feltet**. `satsPaa()` tog den nyeste gyldige sats og gav den
til alle. Færgen kostede det samme for en kassevogn på 5,99 m og for et
modulvogntog på 19,8 m.

Rødby–Puttgarden: **1.338 kr for 10 m, 2.530 kr for 18 m.** Forskellen er
1.192 kr pr. overfart, og den gik den forkerte vej — den faste takst på 2.150
kr var for høj for en solovogn og for lav for et vogntog. Det er værst på det
sidste: estimatet var for lavt på præcis de ture hvor der er mindst luft.

### Båndet ligger PÅ satsen

```js
satser: [
  { gyldigFra, beloebOere: 133800, laengdeTilMm: 10000 },
  { gyldigFra, beloebOere: 253000, laengdeFraMm: 10000, laengdeTilMm: 18000 },
]
```

Alternativet var et niveau mere i noden — `satser: { "0-10000": [...] }` — og
det ville have kostet to ting:

1. **Kundepriser og omkostninger ville ikke længere have samme form.**
   `satser/$gruppe/$postId/satser` og `omkostninger/$id/satser` valideres i dag
   med de samme regler, og reglens egen kommentar siger *"Samme form som en
   kundesats"*. Videresælger vognmanden færgen, er det det samme spørgsmål om
   kajmeter, og to modeller ville betyde to svar.
2. **Beslutning 7 skulle skrives om.** Stiger taksten for de lange vogntog,
   skal det korte bånd stå uændret. Med båndet på satsen er det bare en ny post
   med sin egen `gyldigFra` — nøjagtig som alt andet. Med båndet som et niveau
   over satsen skulle versioneringen findes op igen, ét niveau nede.

### ⚠ Intervallet er (fra, til] — og det er ikke en smagssag

Rederierne udgiver taksten som *"indtil 10 m"* og *"over 10 m til 18 m"*. Et
vogntog på præcis 10.000 mm hører derfor i det **billige** bånd.

Læste vi det som `[fra, til)`, ville nøjagtig 10 m koste 1.192 kr for meget —
og det er nøjagtig den grænse længden gemmes i millimeter for. Havde feltet
været meter som float, ville spørgsmålet slet ikke kunne stilles: 10,0 mod
10,0000001 er ikke en grænse, det er en afrundingsfejl.

⚠ **Reglen kan ikke håndhæve læsningen.** En `.validate` ser én sats ad gangen
og kan ikke sammenligne to. Den håndhæver formen — millimeter som helt tal — og
læsningen står i `satsOpslag()` med sin prøve. Det er samme arbejdsdeling som
`kanSkifteEtape()`: reglerne holder formen, funktionen holder betydningen.

### ⚠ Og en båndløs sats redder ikke opslaget

Første udgave brugte `gyldige.find((s) => iLaengdebaand(s, laengdeMm))`. Det
ser rigtigt ud, og det er forkert: `iLaengdebaand()` svarer **sandt** for en
sats uden bånd, fordi en sats uden bånd dækker alle længder.

Stod der en gammel fast takst tilbage ved siden af de nye bånd, ville den
altså redde opslaget for enhver længde — og så ville indførelsen af bånd gøre
prisen forkert i **tavshed**, hvilket er præcis den fejl båndet skulle lukke.
Kandidaterne filtreres nu på `harLaengdebaand` først.

Prøven fandt det med det samme, fordi den var skrevet efter den sætning der
stod i kommentaren i forvejen. Det er værd at holde fast i: kommentaren vidste
det, koden gjorde ikke.

### ⚠ Det afslørede en tavs fejl i beregnBooking()

`brug()` sprang linjen over på `if (!sats || !beloeb) return`. Det er de samme
tre tavse spring som `beregnForloeb()` blev rettet for — i funktionen lige over,
med en ⚠-note i toppen om netop dét. En færge uden takst blev til **en tur uden
færge**: totalen så færdig ud, og den var for lav.

Nu står linjen der med `beloebOere: null` og `manglerSats: true`, og
`totalOere` bliver `null`. En sum med et ubesvaret led er ikke en sum.

⚠ **Og skærmen skal skrive det selv.** `kr()` skelner med vilje ikke mellem
`null` og nul — kun kalderen ved om nul er et svar, og `kr(null)` er
`"0 kr."`. På en overfart er nul aldrig svaret. Bookingopsætning skriver
`INTET` på linjen og på summen, som `momsTekst()` i Fakturering.

### Tre grunde, ikke ét null

`satsOpslag()` svarer `{ sats, mangler }`:

| `mangler` | Betyder | Rettelsen |
|---|---|---|
| `"sats"` | ingen gyldig sats på datoen | opret satsen |
| `"laengde"` | posten er båndopdelt, og vi fik ingen længde | disponér en enhed |
| `"baand"` | længden falder uden for alle bånd | spørg rederiet |

Samme greb som forbeholdet i `tjekKoerehviletid()`: begrundelsen er en
**returværdi**, ikke en note. Et `null` alene kan ikke skelne de tre, og de
fører hvert sit sted hen.

### Hvad der IKKE blev gættet

Femern har bånd til 18 m og **intet derover**. Vi kender ikke taksten, og det
nærmeste bånd er ikke svaret — et system der gætter rigtigt ni gange ud af ti,
lærer brugeren at stole på det tiende. Demo-etape `et-001` er 19.820 mm og får
derfor *"ingen takst for den længde"*.

Det er med vilje at det står sådan i demo-sættet. Samme grund som Kølehus
Odense uden døgnsats: kan "mangler takst" ikke ses i dev, opdages den først
hos en kunde.

`bro:storebaelt` hedder stadig *"(lastbil 10–20 m)"*. Taksten **er**
10–20 m-taksten; vi kender bare ikke broens øvrige trin. Navnet bliver stående
for at sige hvad satsen forudsætter, og båndene lægges når vognmandens egen
BroBizz-aftale er læst — rabatten er progressiv på månedsbasis, så tallene er
hans og ikke vores.

## 43. Brugerens eget layout har intet loft

Der stod et loft på **tolv** widgets, og det stod to steder: `MAKS_WIDGETS` i
`widgets.js` og et mønster i `firebase.rules.json`, hvor pladserne var talt til
elleve. Begrundelsen var skrevet ud begge steder:

> ⚠ ET LOFT, OG DET ER IKKE VILKÅRLIGT. Tyve widgets på én forside er ikke et
> overblik — det er en liste man scroller i, og så holder man op med at kigge
> på den.

Det er en god **anbefaling**. Det er ikke en kendsgerning om systemet, og det
er forskellen der afgør om noget hører i en regel.

Layoutet er brugerens egen præference om sin **egen** skærm — det er netop
derfor det skrives af klienten med `auth.uid === $uid` og ikke af en Cloud
Function. En grænse han ikke kan hæve, er en beslutning vi har taget på hans
vegne, og den kan ikke begrundes med andet end smag. Vognmanden med to
skærme på væggen har ikke det samme overblik som ham med en bærbar.

### ⚠ Der er stadig en øvre grænse — den er bare ikke et tal vi fandt på

`valideLayout()` afviser ukendte nøgler og dubletter. Et layout kan derfor
aldrig blive længere end **kataloget**, og kataloget står ét sted: `WIDGETS`.
Konstanten hedder nu `ANTAL_WIDGETS` og er *afledt* af listen frem for skrevet
ved siden af den — et tal man skal huske at rette, bliver ikke rettet.

Reglen kan ikke slå op i et katalog og prøver derfor kun **formen**: en kort
streng pr. plads, og pladsen skal være et tal. Det er efterprøvet mod den
udrullede base med en rigtig brugers token — alle 21 widgets gemmes, og en
plads der ikke er et tal afvises stadig.

⚠ **Loftet SKULLE fjernes begge steder.** Havde vi kun rettet `widgets.js`,
ville serveren have afvist en widget skærmen lod brugeren sætte ind — og
fejlen ville komme ved **Gem**, ikke ved klikket. Prøven i
`test/widgets.test.mjs` læser regelfilen og holder de to sammen; den er
skrevet om frem for slettet.

### ⚠ Og hvad en bruger må SE, er ikke det samme spørgsmål

Antallet var aldrig en adgangskontrol, og fjernelsen ændrer derfor ingen
adgang. Men det er værd at skrive hvad der så ER gaten, fordi svaret ikke er
det man skulle tro:

| Gate | Hvad den gør | Hvad den ikke gør |
|---|---|---|
| Kundens **moduler** | Skjuler widgets for moduler kunden ikke har købt | Spærrer ikke tallet — det er en kommerciel kontrol (beslutning 33) |
| `dashboardvisning` | En administrator skjuler et dashboard for én bruger | Spærrer ikke — den hedder derfor en **visning**, ikke en adgang |
| Brugerens **rolle** | Afgør hvad han må i resten af systemet | Afgør i dag **ingenting** om widgets |

⚠ **`kpi/` var læsbar for enhver indlogget bruger i tenanten** da det her
blev skrevet. Ingen permission, ingen modulklausul.

**Beslutning 44 lukkede halvdelen af det** — dagen efter. Hvert domæne bærer nu
sit MODULS klausul, så en kunde uden Økonomi ikke kan læse tallet. Den anden
halvdel står: der er stadig ingen PERMISSION, modulet gælder TENANTEN, og en
chauffør i et firma der HAR Økonomi, kan derfor stadig læse
`tenants/<id>/kpi/<division>/current/oekonomi` direkte.

⚠ **Og det er værd at bemærke hvordan det blev fundet.** Sætningen stod FIRE
steder — her, i README, i `dashboardvisning.js` og i CLAUDE.md — og beslutning
44 gjorde tre af dem forkerte uden at nogen prøve fejlede. En påstand der er
skrevet af fire gange, bliver ikke rettet fire gange. Det er samme mønster som
mailmønsteret i beslutning 42, bare i prosa.

Skulle rollen afgøre hvilke widgets en bruger har **adgang** til — og ikke
bare hvilke han bliver **tilbudt** — er det `kpi/` der skal deles op pr.
domæne med en permission eller en modulklausul på hver. Det er en selvstændig
ændring: `useKpi()` læser hele noden i ét kald, og en delvist afvist læsning
er en `permission-denied`, som `dataTilstand()` behandler som blokerende.

Indtil da ville et rollefilter i widgetvælgeren være en **pæn knap**: det
ville skjule kortet og lade tallet stå åbent. Det er den værste slags kontrol,
fordi den ser ud som om den virker — samme fælde som mockuppens
"Dashboardadgange", der blev til `dashboardvisning` netop for at navnet ikke
skulle love mere end platformen holder.

## 44. `kpi/` er delt på domæne — en visning blev til en spærring

`kpi/` havde ÉN `.read`, og den krævede kun tenant-medlemskab. Ingen
permission, ingen modulklausul. Følgen stod skrevet ned i `dashboardvisning.js`
længe før den blev lukket:

> `kpi/` er læsbar for ENHVER indlogget bruger i tenanten. En bruger der
> "nægtes" Warehouse-dashboardet, kan stadig læse
> `tenants/<id>/kpi/<division>/warehouse` direkte.
>
> Vil man have den rigtige spærring, er det `kpi/` der skal deles op — pr.
> domæne, med en permission eller en modulklausul på hver.

To ting var altså kun skjult, ikke spærret:

1. **Modulet.** En kunde uden Økonomi kunne læse `kpi/gods/current/oekonomi` —
   netop det tal han ikke havde købt adgang til at se en skærm for. Sidebaren
   skjulte modulet (beslutning 33), widgetvælgeren skjulte kortet. Ingen af
   delene rørte tallet.
2. **Dashboardvisningen.** En administrators afkrydsning skjuler et dashboard
   for én bruger; den spærrer det ikke.

Punkt 1 er lukket her. Punkt 2 er stadig en visning — og det er med vilje, se
nedenfor.

### Hvert domæne bærer sit modul

```
kpi/<division>/<snapshot>/<domaene>     .read: tenant + abonnement + modul
```

⚠ **`.read` SKULLE væk fra toppen.** Den kaskaderer: blev den stående, ville
klausulen på domænet være ren dekoration — ét kald mod
`kpi/<division>/current` ville give alle ti domæner. Prøven der vogter det, er
den vigtigste i `test/rules.kpi.test.mjs`, og den prøver også **admin**: det
er ikke en rettighed, det er en vej.

⚠ **Modulnavnet ER domænenavnet for syv af ti**, og det er nyttigt frem for
tilfældigt: reglen kan ikke slå op i et katalog, men den kan skrive
`moduler.child($domaene)`. De tre undtagelser står eksplicit:

| Domæne | Modul | Hvorfor |
|---|---|---|
| `opgaver` | *ingen* | Spænder værksted (flaade) OG facility |
| `afvigelser` | *ingen* | Indkøbs- OG salgsprisafvigelse (beslutning 14) |
| `disponering` | `booking` | Domænet er opkaldt efter skærmen, modulet efter forretningen |

De to uden modul er samme carve-out som noderne `opgaver`, `satser` og
`fakturaer` i beslutning 33: en klausul på ét modul ville lukke tallet for en
kunde der har det andet. Listen står i `KPI_DOMAENE` i `kpi-aggregering.js`, og
en prøve holder den op mod `demo-kpi.js` — et domæne aggregeringen skriver men
kataloget ikke kender, ville blive skrevet af serveren og aldrig hentet af
klienten.

### ⚠ Prisen: der findes ikke ét kald der henter det hele

`useKpi()` henter nu **pr. domæne**, parallelt. Forælderen kan ikke læses, og
det gælder også admin. Det er prisen for at kunne spærre ét domæne, og den er
betalt ét sted.

`laesbareDomaener()` er den samme liste reglen håndhæver, så klienten kun beder
om det den må få — ellers ville hver sideindlæsning udløse en håndfuld
`permission-denied` i konsollen, og **en afvisning skal betyde noget**.

⚠ **Og formen lægges stadig på — også på et afvist domæne.** Uden det ville
`k.oekonomi.budgetOere` kaste, og en skærm blive hvid hos en kunde der bare
mangler et modul. Følgen er at et afvist domæne ser ud som et der ikke er
**regnet**: begge skriver INTET (—). De to er ikke det samme, og forskellen
ligger i `afviste` ved siden af tallene.

### ⚠ Rollen afgør stadig ingenting — og det skal skrives, ikke antages

Modulklausulen gælder **tenanten**, ikke brugeren. To brugere i samme firma ser
nøjagtig det samme, og hver af de syv roller har hver eneste læse-permission —
`koeretoejer.laes`, `personale.laes`, `kunder.laes`, `booking.laes`,
`fravaer.laes` ligger alle i basen. Kun `audit.laes` skiller admin og revisor
fra resten.

Derfor er `dashboardvisning` **stadig** en visning og ikke en adgang, og
navnet holder. Prøven i `dashboardvisning.test.mjs` er skrevet om til at
vogte netop den linje: den kræver nu at domænet HAR en modulklausul, og at det
IKKE har en permission. Den dag der står `perms.contains` i udtrykket, skal
skærmens tekst og navnet med.

Skal rollen afgøre hvad en bruger må se, kræver det **nye læse-permissions**
fordelt på de syv roller — en produktbeslutning om hvem der ser pengene, og en
der koster en ombæring af tokens, fordi perms står i claims. Det er
rollegennemgangen, og den er ikke truffet her.

### ⚠ Tilføjelse til 44: domænet arver sin kildes læse-permission

Beslutning 44 lukkede `kpi/` pr. **modul**. Det gælder tenanten. `ROLLER.md`
viste at rollen derefter stadig afgjorde ingenting, og pegede på tre veje. Den
her er **A**, og den er den eneste af de tre der kunne vælges uden at gætte:

> Et nøgletal er ikke mildere end sit grundlag. Må en bruger ikke læse
> `kunder/`, skal han heller ikke kunne læse ANTALLET af kunder ad bagvejen.
> Et aggregat er stadig kundens data — det er bare talt op.

`kpi/<division>/<snapshot>/<domaene>` kræver nu, ud over modulet, de
læse-permissions som de noder domænet er **regnet af** kræver.

### ⚠ Og det er ÉT led i dag — det er ikke en halv løsning

`KPI_KILDER` i `kpi-aggregering.js` siger hvad hvert domæne er regnet af. Det
er en **kendsgerning om `beregnKpi()`**, læst ud af funktionen:

| Domæne | Kilder | Kræver |
|---|---|---|
| `kunder` | `kunder` | **`kunder.laes`** |
| `opgaver` | `opgaver`, `etaper`, `grundlag` | — |
| `oekonomi` | `etaper`, `grundlag` | — |
| `disponering` | `etaper` | — |
| `indkoeb` | `indkoeb`, `fakturaer`, `leverandoerer` | — |
| `facility` | `facility`, `opgaver`, `leverandoerer` | — |
| `flaade` | `fakturaer`, `indkoeb`, `indberetninger` | — |
| `bemanding`, `warehouse`, `afvigelser` | *ingen kilde* | — |

Af de noder aggregeringen faktisk læser, er `kunder` den **eneste** der kræver
en læse-permission. At skrive flere led ville være at gate på noget der ikke er
grundlaget.

⚠ **`flaade` peger IKKE på `koeretoejer`.** Kun ét flaadefelt kan regnes, og det
kommer fra indkøbet: brændstoffet er en indkøbslinje, og den bærer en division
hvor bilen ikke gør. Det er samme skel som i beslutning 19.

⚠ **Tre domæner har ingen kilde overhovedet** — `bemanding`, `warehouse` og
`afvigelser` står med `null` eller en tom liste. Et tomt grundlag kræver ingen
permission, og det ville være en påstand at give det en.

### ⚠ Det ændrer intet i dag — værdien er guarden

Alle syv roller har `kunder.laes`, så ingen mister noget. Ledet er der for at
den dag en læse-permission strammes, følger nøgletallet med **af sig selv**
frem for at skulle huskes.

Og for at det ikke kan drive: `test/rules.kpi.test.mjs` **udleder** kravet af
regelfilen for hver af `KPI_KILDER`s noder og fejler hvis `KPI_PERM` og reglen
er uenige. Får `flaade` en dag `koeretoejer` som kilde — det sker den dag
divisionsspørgsmålet er besvaret — bliver prøven rød indtil `koeretoejer.laes`
står begge steder.

Prøven kræver desuden at et domæne højst har **én** krævet permission: kan
reglen ikke bære formen, skal formen laves om frem for at blive rundet af.

### ⚠ Tripwiren i dashboardvisning fyrede — og spurgte det forkerte

Prøven fra beslutning 44 sagde: *"kommer der en permission, er dashboardvisningen
tæt på at være en adgang, og både navnet og teksten på skærmen skal rettes."*
Den blev rød her.

Svaret er nej, og spørgsmålet var forkert stillet:

> Permissionen siger hvad **rollen** må. Dashboardvisningen siger hvad **én
> bruger** får vist. To brugere med samme rolle ser nøjagtig det samme, uanset
> afkrydsningen.

Det der **ville** afgøre sagen, er om en regel slår op i selve indstillingen.
Så var "skjul" blevet til "spær", og navnet ville være en løgn den anden vej.
Prøven vogter nu dét — og den er dermed blevet et skarpere spørgsmål af at
have fyret.

**B og C står stadig åbne** (se `ROLLER.md`): nye læse-permissions fordelt på
rollerne, eller flere felter klassificeret i `vaerdi/`. Begge er
produktbeslutninger.

## 45. `opgaver` er `.write: false` — vejen ind er `opgaveplanlaeg`

Disciplinen var skrevet ned. Den var bare ikke håndhævet.

`src/fleet/opgaveplan.js` har stået med det her i hovedet siden funktionen
blev bygget:

> ⚠ DER SKRIVES INTET HERFRA DIREKTE, OG DET ER IKKE EN MANGLENDE RETTIGHED.
> `opgaver` ER skrivbar med `opgaver.skriv` — en disponent har den. Men
> handlingen kan ikke udføres rigtigt fra en klient.

Og reglen sagde `.write` med `opgaver.skriv`, som **casehandler, disponent,
koordinator og admin** alle har. Ingen skærm brugte vejen — men den stod
åben, og CLAUDE.md's egen sætning gælder: *en kontrol der kun findes i
frontend, er ikke adgangskontrol, men en pæn knap.*

### Hvad en klient kunne have gjort

En opgave og dens **reservation** bærer den samme kendsgerning: at enheden er
optaget. `reservationer` er `.write: false` for alle, så en klient kunne kun
skrive den **ene** halvdel:

- en opgave uden reservation — bilen ser **fri** ud i disponeringen mens den
  står på liften. Det er beslutning 4's fejl, den samme som lukkede tre
  kalendere der ikke kunne se hinanden.
- eller et flyttet `startMs`, hvor reservationen blev stående. Så siger de to
  hver sit om hvornår bilen er optaget, og ingen af dem er forkert alene.

Dertil gør funktionen fire ting en regel ikke kan:

| | |
|---|---|
| sætter `art` selv | ellers kunne den ene formular oprette den andens poster, og de to arter har ikke samme feltskema |
| afviser en **solgt eller skrottet** enhed | opgaven ville ellers se helt normal ud i en tabel |
| slår **leverandøren** op i `leverandoerer/` | en fejlstavning skal blive en afvisning, ikke en ny leverandør ingen kan finde igen |
| prøver perioden med `tjekLedigMod()` | og **overskriver ikke**, heller ikke når prioritet 40 kunne. To disponenter kan ramme samme sekund |

Det er samme snit som `kasseudlaan` (beslutning 37) og `enheder` (39).

### ⚠ Permissionen består — det er vejen der er lukket, ikke retten

`opgaver.skriv` bliver stående, og `opgaveplanlaeg` kræver den. Fjernede vi
den, kunne funktionen ikke skelne en disponent fra en chauffør. Det er
nøjagtig ordningen fra beslutning 37: *"det er ikke en manglende rettighed —
lagermedarbejderen HAR `kasseudlaan.skriv`. Det er vejen der er lukket."*

Beslutning 39 gik den anden vej — der findes med vilje **ingen**
`enheder.skriv` — fordi en enhedsrække aldrig er en menneskelig beslutning.
En opgave er.

### ⚠ To veje blev lukket med, og de skal genåbnes med hver sin funktion

1. **En facility-opgave.** `opgaveplanlaeg` sætter `art: "vaerksted"`.
2. **Et statusskifte** (`indberettet → planlagt → igang → udfoert`).

Ingen af de to blev skrevet af en klient i forvejen, så ingen kapacitet gik
tabt. Men de skal bygges som funktioner frem for ved at løsne `.write` igen —
en statusændring rører også reservationen.

### ⚠ Prisen: fjorten prøver kunne ikke længere demonstrere det de hed

`.validate`-reglerne på `opgaver` kan ikke nås af en klient mere. Blokken
bliver stående — den beskriver formen serveren skal overholde, som på
`kasseudlaan` — men prøverne kunne ikke blive stående uændret:

- De syv der viste at reglen **tog imod** en rigtig post, kan ikke køre.
- De syv der viste at den **afviste**, ville være blevet grønne af den
  **forkerte grund**: fordi skrivningen er lukket, ikke fordi arten var
  forkert. En prøve der ikke kan fejle for sin egen sætning, er værre end
  ingen — den ser ud som dækning.

Kravene er flyttet derhen hvor håndhævelsen nu ligger: `opgaveMangler()` og
`valideOpgaveplan()` i `functions/delt/`, som funktionen og formularen kalder
med de samme sætninger. Fire ting skiftede karakter:

| Krav | Før | Nu |
|---|---|---|
| art påkrævet, ordliste | `.validate` | `opgaveMangler()` — og funktionen sætter arten selv |
| division påkrævet | `.validate` | `opgaveMangler()` |
| prioritetens tre trin | `.validate` | `opgaveMangler()` |
| ukendte felter (`fra`, `til`, `type`) | `$andet: false` | funktionen bygger posten **felt for felt** fra en allowliste |

Den sidste er blevet **stærkere**: en regel afviser hele skrivningen, men en
allowliste kan slet ikke komme til at lade feltet slippe igennem — det bliver
aldrig læst.

Den ene kontrol der nu udelukkende ligger i funktionen, er **opslaget af
leverandøren**: en ren funktion kan ikke slå op i en database. Den prøves ved
at læse funktionen og ved at kalde den udrullede.

## 46. En transport ER en etape — og labelen gemmes ikke

Transportlabelen var det sidste af de tre plancher (WAREHOUSE.md 6.1), og den
kunne ikke bygges, før ét spørgsmål var afgjort. Planchen brugte **to
id-serier for den samme kendsgerning**:

- `TRP-2024-0513` i carrier-tabellen, under overskriften *tilknyttet transport*
- `BK-2026-0513` på selve mærkatet, som *booking-id*

Er en transport en **etape** (beslutning 16), eller et nyt objekt ved siden af?
WAREHOUSE.md 6.4 kaldte det det tungeste af de fire åbne punkter, og feltet
`carriers.transportId` stod derfor med vilje som en **fri streng uden
fremmednøgle** — en nøgle der pegede på en node vi ikke havde valgt, ville
have låst valget.

**Svaret er etapen.** Alt en transport har brug for, står der allerede:
`fraSted`, `tilSted`, `etaMs`, `koeretoejIder`, `personId` og `bookingId`. Et
transport-objekt ved siden af ville være prototypens DE-QR 777 mod DE-KL 404
for **tredje** gang — beslutning 16 lukkede det for bookingen, beslutning 21
lukkede det for langturen, og det her er den samme fejl med et nyt navn.

### Så hed feltet forkert

Et felt der hedder `transportId` og peger på `etaper`, er et navn der lyver om
sin node. Det er præcis den fejl CLAUDE.md kalder *"et feltnavn i et modul uden
at holde det op mod noden"* — den kostede `reservationFraOpgave()`, som aldrig
kunne kaldes på en rigtig opgave, fordi den krævede `fra`/`til` mod en node der
bar `startMs`.

Feltet hedder nu **`etapeId`** og har eksistenskontrol mod `etaper`. Det er
selve beslutningen, håndhævet: en beholder kan ikke længere bære planchens
`TRP-2024-0513`.

### ⚠ Omdøbningen blev MÅLT, ikke antaget

Samme regel som modulomdøbningerne i CLAUDE.md: et nodenavn og et feltnavn står
i kundens data, og de er dyre. En læse-probe mod den **udrullede** DEV-base:

| | |
|---|---|
| tenants | 2 |
| carriers i alt | 7 |
| bar `transportId` | **1** — `demo/CRR-100248`, den seedede demo-række |

Ingen kunde bar feltet. Omdøbningen var gratis **nu**, og den ville ikke have
været det, når den første kunde havde mærket sit første gods.

### ⚠ Etaper er spærret af booking-modulet, beholdere af warehouse

En kunde med Warehouse men uden Booking har ingen etaper og kan derfor slet
ikke sætte feltet. Det er rigtigt — uden bookinger findes der ingen transport
at knytte beholderen til — men skærmen skal **sige** det frem for at vise en
tom tabel, der ligner en fejl (beslutning 32). `useListe(..., { hent: false })`
gør at der ikke engang spørges: en afvisning skal betyde noget (beslutning 26).

Reglens opslag går derimod uden om `.read` — den læser træet — så en beholder
kan godt bære et `etapeId` hos en tenant der ikke selv må liste etaper. Samme
asymmetri som `kundeId` har.

### ⚠ Stregkoden bærer ikke planchens nummer

`BK-2026-0513-C-000245` indeholder to opfindelser:

1. **`BK-` er et femte nummerformat.** Husets bookingnummer er
   `BKG-ÅÅÅÅ-NNNNN` fra counteren i beslutning 8 — og hele grunden til at der
   er ét format, er at der var fire i brug i v2.
2. **`C-000245` er et løbenummer for beholderen** ved siden af dens eget id,
   `CRR-100245`. Samme kendsgerning, to numre, og så driver de.

Koden bygges derfor af de to id'er der findes i forvejen:
`BKG-2026-00317-CRR-100245`. En scanning kan slås direkte op; en kode man
først skal oversætte, er en kode nogen oversætter forkert. `laesStregkode()`
skiller ved beholderens præfiks og ikke ved den sidste bindestreg — et naivt
split ville gøre `BKG-2026-00317` til `BKG-2026`.

### ⚠ Labelen er ingen node

Der gemmes intet mærkat. Typen **udledes** af etapekæden, felterne slås op i
booking, kunde og plads. Et gemt mærkat ville drive fra sin booking første gang
nogen rettede et slutmål — og så ville papiret på pallen og skærmen sige hver
sit. Det er `bemanding.ledig` på et stykke papir.

De tre typer udledes sådan:

| Type | Kendetegn |
|---|---|
| Direkte A → B | Kæden har **ét** led. Godset rører aldrig lageret |
| Via transit → destination | Flere led, og beholderen har **ingen** `pladsId` — den læsses om |
| Storage via transit | Flere led, og beholderen **har** en plads: den er sat på hylden |

⚠ Forskellen på de to sidste er hylden, ikke en status ved siden af. Det er
samme svar som 6.4 gav på *"ingen lokation"*: fraværet af `pladsId` **er**
tilstanden.

### ⚠ En halv label trykkes ikke

`byggLabel()` svarer `{ felter, mangler, kanTrykkes }` som `satsOpslag()`
svarer `{ sats, mangler }`. Et slutmål der ikke kendes, må ikke blive til en
tom streng eller til afsenderadressen: godset kører efter det der står på
mærkatet, og fejlen opdages på rampen i Hamburg — ikke her. Samme afvejning som
momssatsen, der nægter eksporten frem for at antage 25 %.

### ⚠ Tilføjelse til 46: stregkoden var tekst — og dens sort er ikke en designfarve

Første udgave af labelen skrev koden som **bogstaver**:
`BKG-2026-00317-CRR-100248`. Et menneske kunne læse den, og præcis derfor
overlevede fejlen en commit, en gennemlæsning og et klik i browseren — mærkatet
så komplet ud. En scanner kan ikke læse tekst, og et mærkat der ikke kan
scannes, er hele grunden til at der er et mærkat.

Koden er nu en rigtig **Code 128 subset B** (`fleet/stregkode128.js`). Ikke
Code 39: 25 tegn ville blive godt dobbelt så bredt og ikke kunne være på et
mærkat. Ikke subset C: koden skifter mellem bogstaver og cifre hele vejen, så
skiftene ville koste mere end de sparer — og hvert skift er et sted at tage
fejl.

**⚠ Tabellen fik sin godkendelse udefra.** En mønstertabel skrevet af efter
standarden kan være internt konsistent og alligevel forkert, og en prøve der
afkoder med **min egen** tabel ville sige ja til begge dele. Outputtet er
derfor tegnet som et sort/hvidt billede og læst tilbage af **zxing**, en
uafhængig implementering, som selv efterprøver kontrolcifret. Fem koder, alle
korrekt afkodet. Zxing er ikke en afhængighed i repoet — den blev lånt til den
ene kontrol, og modulstrengen ligger nu som et snapshot i prøven.

⚠ **Og den kontrol fangede en påstand i mit eget hoved.** Filens kommentar
henviste til "standardens eksempel PJJ123C → 54" — et tal jeg huskede frem for
at slå op; funktionen svarer 55. Havde jeg skrevet en prøve på det tal, ville
den have været rød af den forkerte grund. Beviset er afkodningen.

### Stregkodens sort er et maskinkrav, ikke et designvalg

Paletten havde ingen ren sort. `--bc-text` er `#1f2733` — en mørk blågrå, som
er rigtig til tekst og forkert til en stregkode: kontrasten er scannerens
tærskel, ikke en æstetisk afvejning, og en printer der gengiver den lidt lysere,
gør koden ulæselig uden at nogen kan se det.

`--fc-stregkode: #000` er derfor et token for sig. Det må **ikke** følge et
tema, og det hører hverken i statuspaletten (beslutning 30's "hvor slemt er
det") eller i kategoripaletten ("hvilken ting er det"). Det er en tredje slags
farve: den som en maskine skal kunne måle.


## 47. Skærmen er 85 % lyst felt — det er dét der trætter, ikke kuløren

Der kom et forslag til "de mest behagelige farver at kigge på en hel dag", med
fem gennemarbejdede plancher. Jeg målte dem pixel for pixel mod det vi har:

| | Kortflade | Sidebaggrund | Sidebar |
|---|---|---|---|
| Forslaget | `#ffffff` | `#f6f7fb` | `#011633` |
| FleetControl 3.0 | `#ffffff` | `#f5f7fa` | `#101a30` |

Ét RGB-trin på baggrunden, nul på kortet. **Forslaget var den palet vi allerede
havde.** Den røde tråd var tegnet efter en tråd der lå der i forvejen.

⚠ **Og på selve spørgsmålet trak det den forkerte vej.** Målt med samme metode
— andelen af skærmen over 250 i lysstyrke — ligger vores dashboard på 58,9 %,
plancherne på 63,6–71,8 %. Tæller man hele det lyse felt med (235+), er begge
på 82–86 %. Fire femtedele af skærmen er et lyst felt, og en femtedel af den er
på maksimum. Dét er det der trætter et øje over otte timer. Kuløren er ikke
problemet; **mængden af lys** er.

### Hvad der blev ændret

| Token | Før | Efter | Hvorfor |
|---|---|---|---|
| `--bc-card` | `#ffffff` (råt lys 255) | `#f4f6fa` (246) | Toppen af lyset skæres af |
| `--fc-bg` | `#f5f7fa` (247) | `#e4e8f0` (232) | Siden bag kortene bærer det meste af arealet |
| `--bc-line` | `#e3e6ea` | `#d3d9e3` | Kanten forsvandt mod den nye side — 1,02:1 |
| `--bc-text` | `#1f2733` 15,0:1 | `#2e3947` 10,8:1 | AAA kræver 7:1 — vi lå på det dobbelte |
| `--bc-muted` | `#6b7684` | `#5c6675` | Se fejlen nedenfor |
| `--bc-accent` | `#125bec` | `#1552d8` | Følger med kortet ned, så 5,6:1 bliver 6,3:1 |

⚠ **FØRSTE FORSØG VAR FOR FORSIGTIGT — OG DET VAR MÅLINGEN DER AFSLØREDE DET.**
Jeg satte først kortet til `#fbfcfe` og kaldte det "97,3 % lysstyrke". Det tal
er WCAG-lysstyrke, som er gamma-korrigeret; i **råt lys** er `#fbfcfe` stadig
252 af 255. Skærmens gennemsnit faldt fra 227,7 til 224,5 — 1,4 %, altså
ingenting. Med `#f4f6fa` falder andelen af skærmen på maksimum fra **58,9 % til
1,9 %**, og det udsendte lys med **8 %**.

Forskellen mellem de to tal er hele pointen: gamma-korrigeret lysstyrke svarer
på *hvor let er det at læse*, råt lys svarer på *hvor meget lyser skærmen*. Det
sidste er det der trætter over otte timer, og det var ikke det tal jeg regnede
på først.

⚠ **KORTET BLEV LETTERE AT SE, IKKE SVÆRERE.** Man skulle tro at et mørkere
kort på en mørkere side udvisker skellet. Målt gør det det modsatte: 1,07:1
bliver 1,14:1, fordi siden falder mere end kortet. Forholdet er det der bærer
layoutet, ikke den absolutte værdi.

⚠ **OG STREGEN SKULLE MED NED.** `--bc-line` på `#e3e6ea` gav **1,02:1** mod
den nye side — kanten forsvandt dér hvor kortet møder baggrunden. `#d3d9e3`
giver 1,16:1, hvilket er præcis det stregen havde mod kortet før. Et token der
flyttes, trækker altid et andet med sig; det er derfor de står samlet ét sted.

⚠ **MÅLINGEN FANDT EN FEJL DER ALLEREDE STOD DER.** `--bc-muted` på
`--fc-bg` gav **4,3:1** — under AA på 4,5. Den svage tekst under hvert
KPI-tal, hver hjælpelinje, hver undertekst i en tabelrække stod for svagt, på
hver eneste skærm. Den er nu 5,0:1. Fejlen havde intet med forslaget at gøre;
den blev fundet fordi nogen for første gang regnede efter.

### Hvad der IKKE blev ændret, og hvorfor

**Statusfarverne og kategoripaletten står.** Beslutning 30 skiller dem, og de er
valideret mod hvid flade med dataviz-validatoren. Flyttes de, skal de valideres
forfra mod den nye flade — det er sin egen etape, ikke en bibemærkning.

**`--fc-stregkode-bund` blev stående på `#fff`.** Beslutning 46: bunden er
lige så meget et maskinkrav som stregerne, og den må ikke følge kortets flade
ned. Det er præcis det tilfælde tokenet blev oprettet for.

**Der kom ikke et mørkt tema.** Mørk baggrund hjælper i et mørkt rum og skader i
et lyst — lys tekst på mørk bund smører for de fleste med bygningsfejl i øjet.
Det rigtige er derfor en **kontakt**, ikke en beslutning på brugerens vegne, og
en kontakt kræver at hvert token får en mørk pendant. Egen etape.

**Og skriften blev ikke rørt — endnu.** 68 % af tegnene på dashboardet står på
13 px eller mindre, 37 % på 12,5 px eller mindre. Lille skrift med hård kontrast
er den mest trættende kombination der findes, og den er et større håndtag end
nogen palet. Men den flytter layout på hver skærm og hører derfor til sin egen
etape, hvor der er plads til at se efter.


## 48. Skriftstørrelser var 24 tal spredt i filen — nu er de ni beslutninger

Beslutning 47 endte med at pege videre: **68 % af tegnene på dashboardet stod på
13 px eller mindre, 37 % på 12,5 px eller mindre.** Lille skrift med hård
kontrast er den mest trættende kombination der findes, og den er et større
håndtag end nogen palet. Så jeg talte efter.

`fleet.css` havde **24 forskellige skriftstørrelser på 119 steder**, otte af
dem med halve pixels: 8,5 · 9,5 · 10,5 · 11,5 · 12,5 · 13,5 · 14,5. Ingen havde
besluttet en skala; hver skærm havde valgt et tal der så rigtigt ud dér.

⚠ **Det er nøjagtig samme fejl som rå farver var før beslutning 10.** Et tal der
kun står ét sted, er en indstilling. Tyve tal der næsten er ens, er tyve
lejligheder til at være uenige — og forskellen mellem 12 og 12,5 px er ikke en
beslutning nogen har truffet, det er en der er gledet ind.

### ⚠ Fire verdener, ikke én skala

Det vigtigste fund var at tallene ikke hørte til samme sag:

| Verden | Eksempler | Må den vokse? |
|---|---|---|
| Skærmens læsetekst | `.fc-table td` 13, `.fc-hint` 12, `.fc-table th` **10,5** | Ja — det er her problemet er |
| Mærkatet på papir | `.fc-maerkat-etiket` 9,5, `.fc-stregkode-tal` 12 | **Nej.** 100 × 200 mm er fysisk, og modulbredden er afledt af 203 dpi. Beslutning 46 |
| SVG-enheder | `.fc-donut-tal` 6, `.fc-donut-note` 2,6 | Nej — det er **viewBox-enheder**, ikke pixels. De skalerer med figuren |
| Gitterets kolonner | `.fc-gk-kol-dag` 9,5, `.fc-gk-blok` 11 | Kun hvis kolonnen får lov at blive bredere |

Havde jeg lagt ét gulv over alle 119 steder, ville mærkatet være vokset ud over
etiketten og donutens tekst være blevet ulæselig stor — begge dele uden at nogen
kunne se det på skærmen.

### Skalaen

Ni trin, og hvert eneste af dem er et token:

| Token | px | Erstatter | Hvad |
|---|---|---|---|
| `--fc-t-tight` | 11 | 9,5 · 10 | Kun hvor bredden er fysisk låst |
| `--fc-t-xs` | 12 | 10,5 · 11 · 11,5 | Mindste tekst på skærmen |
| `--fc-t-s` | 13 | 12 · 12,5 | Bitekst, hjælpelinjer |
| `--fc-t-m` | 14 | 13 · 13,5 | **Brødtekst** — tabelceller, knapper, felter |
| `--fc-t-l` | 15 | 14 · 14,5 · 15 | Kortoverskrifter |
| `--fc-t-xl` | 17 | 16 · 17 | Afsnitsoverskrifter |
| `--fc-t-2xl` | 21 | 19 · 20 · 21 | |
| `--fc-t-3xl` | 25 | 22 · 23 · 25 | |
| `--fc-t-4xl` | 34 | 34 | KPI-tal |

⚠ **`.fc-table th` var 10,5 px.** Hver eneste tabeloverskrift i hele
programmet — det man læser først for at finde ud af hvad en kolonne betyder —
stod mindre end alt andet. Den er nu 12.

⚠ **Og kalenderen fik lov at vokse, fordi der var plads.** Kolonnens minimum går
fra 30 til 34 px. Målt: 180 + 28 × 34 = 1132 px, og en 1280-skærm har 1240 til
rådighed. Havde det ikke passet, skulle teksten være blevet stående — en
kalender der ruller er værre end en kalender med lille skrift.

### Hvad det koster

Brødteksten vokser 7,7 %, den mindste tekst 14,3 %. Det er plads, og pladsen
skal tages et sted: rækker bliver højere, og der er færre linjer på en skærm.
Det er byttet, og det er bevidst — en tabel man kan læse med tredive rækker er
bedre end en man kniber øjnene sammen over med femogtredive.

⚠ **Prøven `test/skrift.test.mjs` holder skalaen.** Samme form som
designtokenprøven: en rå `font-size` i px uden for `:root` er en fejl, og de
tre undtagelser — mærkatet, SVG-enhederne — står med navn og begrundelse. Uden
den er skalaen tilbage til 24 tal om en måned.


## 49. Gitteret flytter opgaver — attrappen "Træk opgave hertil" er væk

Disponeringens dagsgitter havde et felt der sagde **Træk opgave hertil**. Det
kunne ikke fokuseres, ikke klikkes, og `title` sagde ærligt at det ikke var
bygget. Det var det rigtige valg dengang — en attrap der opfører sig som en
kontrol, er værre end ingen. Feltet kom den 9. august sammen med skærmen selv;
`etapeskift` gjorde spørgsmålet til et **UI-spørgsmål** den 17., og siden har
der været noget at kalde.

Nu skriver gitteret. Tre skærme, én funktion.

### ⚠ Der er ÉN handling der findes, og det er ikke den attrappen lovede

Jeg begyndte med at spørge hvad der overhovedet kan kaldes:

| Handling | Vej ind | Fandtes? |
|---|---|---|
| Opret værkstedsopgave på bil + tid | `opgaveplanlaeg` | **Ja** |
| Godkend et forslag på en etape | `etapeskift` + `valgtForslagId` | **Ja** — men forslaget skal findes i forvejen |
| **Flyt** en eksisterende opgave | — | **Nej** |
| Opret eller flyt en **etape** | — | **Nej.** `etaper` er `.write: false` |

Så "Træk opgave hertil" kunne ikke bygges som et træk. Det man ville trække,
er en uplanlagt opgave, og at give den en tid er en **opdatering** af en post —
den tredje lukkede vej ved siden af facility-opgaven og statusskiftet.
`opgaveplanlaeg` opretter kun: *"INTET id. Serveren laver push-nøglen."*

Derfor kom `opgaveflyt`.

### ⚠ Den krævede INGEN regelændring, og det var værd at måle først

Jeg skrev selv at det ville være "en regelfil-ændring, `test:rules`,
`regler:udrul` og `funktioner:udrul` oveni". Det var forkert. `opgaver` og
`reservationer` er **begge** `.write: false` i forvejen, og reservationsposterne
har slet ingen `.validate`. Vejen er lukket; funktionen er en ny dør i en mur
der allerede står. Etapen blev mindre end lovet, fordi antagelsen blev holdt op
mod filen frem for gentaget.

### ⚠ To fælder, og de kan begge kun ses i et regnestykke

Derfor ligger `flytOpdatering()` i `opgaveplan-regler.js` og er **ren** — samme
grund som `beregnKpi()` ikke regnes i jobbet.

**1. Samme ressource er samme nøgle.** Flytter man en opgave to timer frem på
den SAMME bil, er den gamle og den nye reservationssti **det samme felt**. Et
objekt har kun én værdi pr. nøgle, så "sæt den gamle til `null` og skriv den
nye" bliver til én af delene — og **rækkefølgen i kildeteksten** afgør hvilken.
Landede `null` sidst, forsvandt reservationen, og bilen så **fri** ud mens den
stod på liften. Nulstillingen sker derfor kun når stien faktisk skifter.

**2. Opgaven konflikter med sig selv.** `tjekLedigMod()` filtrerer på
`r.id !== ny.id`, og reservationen fra `reservationFraOpgave()` bærer **intet
id**. Uden det ville opgavens egen gamle reservation blive meldt som konflikt,
og enhver flytning på samme bil ville blive afvist — af opgaven selv.

**3. Og et døgn er ikke altid 24 timer.** `traekTil()` i `gitter.js` lægger
ikke millisekunder til. Trak man en blok tre dage frem over sommertidsskiftet
den 29. marts ved at lægge 3 × 86400000 til, ville et værkstedsbesøg der
begynder kl. **07**, begynde kl. **08** bagefter. Blokkens forskydning *inde i*
sin egen kolonne bevares og lægges på målkolonnens begyndelse. Prøven regner
begge veje og ser dem være uenige.

### ⚠ Blokkens tegning er ikke opgavens varighed

Den vigtigste spærring er den mindst iøjnefaldende. En opgave uden estimat
tegnes som **én time**, så den kan ses og klikkes — det har den gjort længe, og
det er skrevet ned. Men regner en skærm flytningens nye `estimeretMin` ud af
`blok.til − blok.fra`, bliver den time til et **rigtigt estimat**, og
ressourcen er spærret i et tidsrum ingen har besluttet.

Det er nøjagtig den standardlængde `reservationFraOpgave()` nægter at gætte, og
den ville komme ind ad bagdøren. Derfor: skærmene sender **kun** starten,
`kanFlyttes()` afviser en opgave uden estimat helt, og en prøve læser alle tre
skærme som tekst og fejler hvis `estimeretMin` optræder i et `flytOpgave`-kald.

### ⚠ Arten flyttes ikke med

`opgaveplanlaeg` **sætter** `art: "vaerksted"`, fordi den opretter. Her ville
det samme være en fejl: en flytning laver ingen ny post, og en funktion der
kunne skifte arten, kunne lave en værkstedsopgave om til en facility-opgave —
to feltskemaer, én post, og ingen af dem passer bagefter. Arten læses af noden,
og **modulet følger den**: `vaerksted` → Fleet, `facility` → Facility. Spurgte
vi altid om Fleet, kunne en kunde der kun har Facility, ikke flytte sine egne
servicebesøg.

⚠ **Og en facility-opgave har TO ressourcetyper.** Et besøg på et anlæg spærrer
anlægget; et besøg uden anlæg spærrer **hele lokationen** — lukker man hallen,
er alle porte i den også optaget. Trækkes et besøg fra en port til en hal,
skifter reservationen altså **type**, ikke bare id, og `aktivId` skal **ryddes**:
`ressourceId()` foretrækker anlægget, så bliver feltet stående, spærrer den
stadig porten mens brugeren har sluppet blokken på hallen. Skærmen sender
rækkens type med, netop for at serveren ikke skal gætte — og gættet her er
forskellen på at lukke en port og at lukke et sted.

### Hvad jeg fandt undervejs, og som ikke var en del af opgaven

**Servicekalenderen læste ikke noden.** Den tegnede seks poster fra
`demo-facility.js` — `DEMO_SERVICEBESOEG` — som **ikke var seedet**, mens
`opgaver` blev seedet med `DEMO_OPGAVER`'s facility-opgaver, som var **helt
andre**. `kpi.facility.planlagtVedligehold` blev regnet af noden; gitteret viste
demofilen. Det er Indkøb → Fakturaer om igen, og det er **syvende gang**
mønstret dukker op.

⚠ **Og felterne var den samme fejl som `DEMO_BESOEG` bar.** Posterne havde
`fra`, `til` og `estimatOere`; noden har `startMs`, `estimeretMin` og
`beloebOere`, og den er lukket med `$andet: false` — de kunne **aldrig** være
blevet gemt. Fjerde gang de tre navne har kostet noget. Detaljepanelet på
skærmen læste `besoeg.fra` og ville have skrevet "Invalid Date" i begge ender
på en rigtig post — tredje gang det panel-mønster fanges.

Posterne ligger nu i `DEMO_OPGAVER` med deres id'er, og `DEMO_SERVICEBESOEG` er
en **afledt visning**, som `DEMO_BESOEG` er det. Loftet i
`test/demo-i-skaerm.test.mjs` går 23 → 20.

**Linket til Forslag havde aldrig virket.** Disponering pegede på
`/booking/forslag` **uden id**, mens ruten er `/booking/forslag/:id` — så
`path="*"` sendte brugeren stille og roligt til Dashboardet. Et link der lander
et sted, ser ud til at virke. Vejen til godkendelsen ligger nu på den etape man
har valgt, hvor den hører hjemme.

**`opgaveplanlaeg` loggede ikke.** Hver eneste anden skrivefunktion i
`functions/index.js` skriver en auditpost; den her gjorde ikke. Hullet blev
først synligt da flytningen kom til — havde kun DEN logget, kunne man se at en
opgave var flyttet, men ikke at den nogensinde var oprettet. Begge logger nu.

**Og `.validate` på `opgaver` beskrev en form serveren selv brød.**
`oprettetAf`, `oprettetMs` og `sagId` blev skrevet af serveren og af
provisioneringen, mens `$andet: false` sagde nej til alle tre. Det gjorde ingen
skade — noden er `.write: false`, og admin-SDK'et går uden om reglerne — og
**netop derfor** var det værd at rette: blokken er det eneste sted formen står
skrevet, og en beskrivelse der ikke passer på de poster der faktisk ligger i
noden, kan man ikke bruge til noget.

### Tastaturet kan det samme som musen

Blokken er en knap. Et træk må derfor ikke også være et klik — og
`preventDefault()` på `pointerup` stopper **ikke** det efterfølgende `click`,
så det er et flag der gør det. Tærsklen er fire pixels: uden den ville hvert
klik være et træk på nul kolonner, og en hånd der ryster to pixels, kunne
aldrig vælge en blok.

**Shift + piletast flytter det samme som musen** — vandret i tid, lodret til en
anden ressource. Rullebjælken fik tastatur af samme grund: en kontrol man kun
kan tage fat i med en mus, er en kontrol halvdelen af skærmlæserne ikke har.

⚠ **Og en blok der rækker ud over vinduet, kan ikke trækkes.** Det er samme
grund som pilene findes for: kan man ikke se hvor blokken begynder, kan man
ikke sigte efter hvor den skal hen — og forskellen ville være præcis så stor
som den del der ligger uden for skærmen.

### ⚠ Ugesgitteret skriver stadig ikke, og det er ikke et hul

Det man disponerer dér, er en **etape**, og en etape bindes ved at **godkende
et forslag** — med tid, pris, enheder og chauffør. Et træk kan ikke udpege et
forslag der ikke findes, og en skærm der lavede sit eget ud af hvor blokken
blev sluppet, ville være en anden vej til det samme felt. Det er beslutning 40,
og den står. Gitteret **fører** til Forslag i stedet.


## 50. Opgavens statusmaskine havde seks tilstande og nul veje imellem dem

Efter beslutning 49 kunne en driftsopgave **oprettes** og **flyttes**. Den kunne
ikke meldes i gang, og den kunne ikke meldes udført. `opgaveplanlaeg` opretter
som `planlagt` eller `afventer`, `opgaveflyt` rører ikke `status`, og `opgaver`
er `.write: false` — så der var ingen vej.

Imens **viste** Arbejdskøen statusserne, Driftskalenderen farvede blokkene
efter dem, og `kpi.opgaver` talte dem op. Seks tilstande, seks farver, og intet
der kunne skifte imellem dem. Driftskalenderen havde to grå knapper — "Marker
udført" og "Flyt" — med begrundelsen at skrivningen hørte i en Cloud Function.
Begge findes nu.

### ⚠ Et statusskifte er ikke et felt — det rører reservationen

Det er hele grunden til at det er en serversag og ikke en `set()`. En annulleret
opgave skal **give bilen fri igen**; en udført skal **holde op med at spærre**
den. `reservationer` er `.write: false`, så en klient kunne kun skrive den ene
halvdel — og den farlige halvdel er en bil der ser optaget ud i timer hvor den
er fri, eller fri mens den står på liften. Beslutning 45's begrundelse, tredje
gang efter `opgaveplanlaeg` og `opgaveflyt`.

### Maskinen

| Fra | Kan blive | Reservationen |
|---|---|---|
| `indberettet` | planlagt, annulleret | uændret / frigives |
| `planlagt` | igang, afventer, annulleret | uændret / frigives |
| `afventer` | planlagt, igang, annulleret | uændret / frigives |
| `igang` | afventer, **udført**, annulleret | uændret / **afkortes** / frigives |
| `udfoert` | — | |
| `annulleret` | — | |

⚠ **`udfoert` kan kun nås fra `igang`.** Et værkstedsbesøg kan ikke meldes
færdigt uden at nogen har haft bilen på liften — samme spærring som
klargøringstrinnet på et kasseudlån, hvor genvejen fra `booket` til `udlaant`
er lukket med vilje (beslutning 37).

⚠ **Man kan ikke af-starte et arbejde.** `igang → planlagt` findes ikke. Bilen
HAR været på liften, og en status der sagde andet, ville beskrive noget der
ikke skete. Er den startet ved en fejl, er svaret `annulleret`.

⚠ **`udfoert` og `annulleret` er endestationer.** Ingen vej tilbage — som der
ingen er fra `returneret`. Skal arbejdet gøres om, er det en **ny opgave**.

### ⚠ Afkortningen, og de tre tal der ikke må udledes af hinanden

Meldes et besøg færdigt kl. 11, mens reservationen løb til 16, ser bilen
optaget ud i fem timer hvor den er fri — og så leder den næste disponent efter
en bil der står lige der. Reservationen **afkortes til nu**.

⚠ **Men den forlænges aldrig.** Løb arbejdet OVER sin tid, er "afkort til nu" i
virkeligheden en **udvidelse** — og fremtiden er måske allerede givet væk: en
booking kan lovligt være startet da reservationen udløb. En udvidelse ville
lave et overlap datamodellen afviser, og gitteret ville tegne en konflikt der
ikke er nogens skyld. `afkortTil()` tager derfor `min(til, nu)`.

⚠ **Og meldes den færdig FØR den begyndte, spærrede den aldrig noget.** Et
vindue med `til <= fra` findes ikke i modellen, så reservationen fjernes frem
for at blive et tomt interval ingen kan tolke.

⚠ **Flaget er vigtigere end tallet** — samme regel som `dageUde()` i
Unitbooking. Uden `afkortet: true` læses "til kl. 11" som en plan der altid
sagde 11, og man kan ikke se forskel på et besøg der **var** kort og et der
**sluttede tidligt**. Hvad planen sagde, står stadig på opgaven som
`startMs + estimeretMin` — ingen dublet.

**Tre tal, tre betydninger:**

| | Hvad det er |
|---|---|
| `estimeretMin` | hvad vi **troede**. Reservationens grundlag — et krav på fremtiden kan kun bygge på en forventning |
| reservationens `til` | hvor længe **ressourcen** var optaget. Efter et afkort er det en måling, ikke en plan |
| `faktiskMin` | hvor længe **arbejdet** tog |

En bil kan holde på liften i seks timer og blive arbejdet på i to, fordi en
reservedel manglede. Regnede vi `faktiskMin` af det afkortede vindue, ville de
fire ventetimer blive til arbejdstid — og tallet bruges til at vurdere
estimater.

### ⚠ `faktiskMin` er valgfri, og svaret stod allerede i koden

Jeg var på vej til at kræve feltet — vi gætter jo ikke. Men `kpi-aggregering.js`
har siden beslutning 6 talt `opgaver.udenTidsregistrering`: *udførte opgaver
uden `faktiskMin`*. Designet havde allerede besluttet at hullet skulle **tælles
og vises**, ikke spærres.

Og det er det rigtige svar: en værkfører der lukker ti opgaver, ved ikke
nødvendigvis hvor længe hver af dem tog, og et krævet felt ville blive udfyldt
med **fiktion**. Et tal ingen kender, bliver ikke rigtigt af at være
obligatorisk. Dialogen siger det direkte — lad feltet stå tomt, så tælles
opgaven med under "uden tidsregistrering".

Det er en anden slags manglende tal end den manglende momssats: dér **nægter**
vi, fordi et gæt ville blive til et bilag. Her tæller vi, fordi et gæt ville
blive til en måling. Begge dele undgår at opfinde tallet.

### Én knaprække, fire skærme

`fleet/Statusskifte.jsx` tegner knapperne **af maskinen** — ikke af en liste i
komponenten. En knap uden en overgang er en pæn knap; en overgang uden en knap
er en vej ingen kan finde. Driftskalenderen, Servicekalenderen og Disponering
bruger den samme, og serveren afviser med **den samme** `kanSkifteOpgave()`.

⚠ **Ingen begrundelse ved annullering.** `etapeskift` kræver en, fordi en
annulleret TUR er en aftale med en kunde der brydes; en driftsopgave er vores
egen disposition. Og vigtigere: en begrundelse ville være **fritekst på vej mod
auditloggen**, og allowlisten i `audit-regler.js` findes netop for at holde
tastet tekst ude. Noten på auditposten skrives af serveren, af felter den selv
kender.

### ⚠ Og et efterslæb viste sig at være tomt — målt, ikke antaget

README har siden beslutning 45 sagt at "de opgaver der blev oprettet før
`opgaveplanlaeg` fandtes, har ingen reservation", og at `etapeskift` derfor
ikke kan se at netop de biler står på liften. Jeg målte den udrullede DEV-base
før jeg byggede en udfyldning: **21 opgaver, 0 uden reservation, 0 uden
vindue.** Provisioneren skriver dem med den SAMME `reservationFraOpgave()`, og
efter beslutning 45 findes der ingen anden vej ind i noden.

Punktet er altså ikke et efterslæb. Det er en egenskab der holder — og nu er
den målt frem for påstået, i begge retninger.

### Prøven der ledte det forkerte sted

To af de nye prøver læste skærmene råt og faldt over **mine egne kommentarer**:
den der forklarer at knapperne tegnes af `OPGAVE_OVERGANGE`, og den der siger
at attrappen "Marker udført" er væk. Begge er beskrivelser af at reglen er
**overholdt**, og de blev læst som brud.

Det er samme fejl som prøven der søgte efter `.fc-btn` i hele `fleet.css` og
fandt en længere selektor. En prøve der leder det forkerte sted, er værre end
ingen: den fejler på det rigtige og fjerner grunden til at skrive noget ned.
Begge stripper nu kommentarer først.

## 51. Facility kunne flytte og afslutte sine servicebesøg — men ikke oprette et

`opgaver` er `.write: false` (beslutning 45), og indtil nu havde noden **tre**
veje ind: `opgaveplanlaeg` opretter, `opgaveflyt` flytter (49), `opgavestatus`
skifter status (50). De to sidste er art-agnostiske og virkede derfor for
Facility. Den første er det ikke: den **sætter** `art: "vaerksted"`.

Servicekalenderen skrev selv, hvad det betød:

> ⚠ SKÆRMEN FLYTTER, MEN DEN OPRETTER IKKE. […] At oprette en facility-opgave
> er stadig en lukket vej der skal genåbnes med sin EGEN funktion — se README.
> **En knap her ville love noget serveren afviser.**

`facilityplanlaeg` er den funktion, og den er den **sidste** lukkede vej ind i
noden.

### ⚠ Hvorfor det ikke er et art-flag på `opgaveplanlaeg`

To ting skiller de to funktioner ad, og **begge er spærringer**:

1. **Feltskemaet.** `art` ER skemaet (beslutning 21). En værkstedsopgave
   hænger på et køretøj og har en arbejdstype; et servicebesøg hænger på et
   anlæg eller en hel lokation og har ingen. En funktion med et flag skulle
   bære begge skemaer — og så er der intet tilbage af den spærring
   `art !== "vaerksted"` er.
2. **Modulet.** `opgaveplanlaeg` kræver `moduler.flaade`; den nye kræver
   `moduler.facility`. Spurgte begge om Fleet, kunne en kunde der **kun** har
   Facility, ikke planlægge sit eget servicebesøg. Og lå begge arter i én
   funktion, ville arten fra klienten vælge hvilken dør der blev banket på.

Det er samme snit som mellem `opgaveplanlaeg` og `opgaveflyt`: den ene
OPRETTER, den anden ÆNDRER, og de stiller ikke de samme spørgsmål.

### ⚠ Et anlæg **eller** et sted — ikke begge

`ressourceId()` foretrækker `aktivId`. En post med begge felter reserverer
altså **anlægget**, mens lokationen står som en påstand ingen læser — og
anlæggets lokation står allerede på anlægget. Det er samme regel som at en
enhed ikke får en `pladsId`: to steder til samme kendsgerning driver fra
hinanden første gang nogen flytter porten til en anden hal.

**Målt: fem af de ni facility-opgaver i demo-sættet bar begge felter**, og alle
fem var **enige** med aktivets eget `lokationId`. Sådan ser en dublet ud lige
indtil den ikke gør. De fem er ryddet, og en selvkontrol fanger den næste.

Enten-eller er desuden bygget ind i **vælgeren**: ressourcen er ét felt med
værdier som `aktiv:fa-port3` og `lok:lok-halb`. En form der ikke kan skrive den
forkerte post, er bedre end en validering der afviser den bagefter.

⚠ Og et besøg **uden** anlæg spærrer **hele lokationen** — ressourcen bliver
`lokation`, ikke `facilityAktiv`. Lukker man hallen, er alle porte i den også
optaget.

### ⚠ Anlæggets status spærrer ikke — modsat køretøjets

`opgaveplanlaeg` afviser en **solgt** eller **skrottet** enhed: den er ude af
flåden for altid, og en opgave på den ville se helt normal ud i en tabel.

Den nye funktion har med vilje **ingen** tilsvarende spærring. Et anlæg med
status `fejl` eller `udeAfDrift` er præcis det et servicebesøg findes for — en
spærring dér ville forbyde at bestille reparationen af den port der er gået i
stykker. Forskellen er ikke inkonsekvens: den ene status er **endelig**, den
anden er **det der skal laves om**.

Statussen står i stedet i vælgerens etiket, så man kan se hvad man bestiller
til.

### ⚠ Divisionen låses ikke til `faelles`

Skærmen reagerer ikke på Gods/Bus — anlæggene er de samme uanset hvem der kører
gennem porten. Men opgaven bærer **hvem der betaler**, og det er ikke altid
fælles: **målt** står `op-013`, eftersynet af busladestanderne i Aalborg, som
`bus`. Låste funktionen feltet, kunne den post ikke oprettes gennem den skærm
der viser den. `faelles` er derfor **forslaget**, ikke låsen.

### ⚠ Det kataloget lovede, og det posterne bar

Undervejs viste `ART_FELTER` sig at være uenigt med noden — femte gang et
feltnavn har kostet noget her:

| Felt | Kataloget sagde | Posterne bar |
|---|---|---|
| `estimeretMin` | kun værksted | **alle ni** facility-opgaver |
| `leverandoerId` | kun værksted | seks af ni |
| `faktiskMin` | kun værksted | skrives af `opgavestatus` for **begge** arter |
| `sagId` | ingen af dem | **begge** arter, og regelfilen kender feltet |

Prøven der skulle fange det, hed *"giver kun værkstedsopgaven en varighed i
minutter"* og **slog det modsatte fast** med begrundelsen "dagsvisningen er
timer, ikke døgn". Men `reservationFraOpgave()` **kaster** uden `estimeretMin`,
uanset art: et servicebesøg uden varighed kan ikke spærre sit anlæg, og så ser
anlægget frit ud mens der bliver arbejdet på det. Et felt reservationen regnes
af, kan ikke stå uden for artens skema.

⚠ **Og prøven var ensrettet.** Den spurgte kun "lover kataloget noget ingen
post har". Den modsatte retning — "bærer posterne noget kataloget ikke lover" —
fandtes for flåden og ikke for opgaver. Begge retninger prøves nu, for begge
arter. Det er nøjagtig den fejlklasse README allerede navngiver: *et katalog
der ikke matcher dataene, er værre end intet katalog* — her bare vendt om, så
skærmen fik **nej** til et felt der står på hver eneste post.

`arbejdstype` blev **udenfor**: ingen facility-opgave bærer den, og ordlisten
er værkstedets — den deles med Procures omkostningstype. Et felt tilføjet fordi
det *kunne* give mening, er et gæt.

### ⚠ Det gitteret ikke kan, og hvorfor knappen findes

Rækkerne i Servicekalenderen er kun de ressourcer der **allerede** har et
besøg. Et ledigt felt åbner formularen med anlægget og dagen udfyldt, men et
anlæg uden besøg har ingen række — derfor står knappen "Planlæg service"
foroven, hvor hele kartoteket kan vælges.

⚠ **Og et døgn har ingen klokke.** Gitteret her tæller i dage, så feltets `fra`
er lokal midnat. Sendt videre ville formularen foreslå kl. 00.00 — et tidspunkt
ingen har valgt, som ser ud som en beslutning. Klokkeslættet lægges på ved
klikket. Disponerings dagsgitter har problemet ikke: dér er en kolonne en time.

### Det der stadig ikke holdes af datamodellen

En reservation på `lokation/lok-halb` og en på `facilityAktiv/fa-port3` er to
forskellige stier. Et gulvarbejde i Hal B spærrer derfor **ikke** porten i den
hal — hverken her eller i `opgaveflyt`, som har haft det hul siden 49. Skærmen
siger det rigtige ("lukker man hallen, er alle porte i den også optaget");
datamodellen håndhæver det ikke.

Det er skrevet ned frem for lappet: en indeslutningsregel er sin egen
beslutning — den skal gælde begge veje, i begge funktioner og i
`tjekDisponering()` — og et halvt tjek i **én** af dem ville være værre end
ingen, fordi skærmen så ville vise en ledighed serveren afviser i det ene
tilfælde og ikke i det andet.

## 52. Write-once var ikke write-once — man skulle bare slette først

En underskrift på en indberetning er bevismateriale. Reglen sagde det, CLAUDE.md
sagde det, og **to prøver sagde at det holdt**:

```
"underskrift": { ".validate": "!data.exists() && newData.hasChildren(['navn','ms'])" }
```

Ingen af de to prøver **slettede først**. Og en `.validate` køres ikke ved en
sletning.

### Målt i emulatoren, ikke udledt

En bruger med `indberetninger.skriv` **og** `indberetninger.sensitiveLaes` —
altså den rolle der i forvejen må skrive det klassificerede:

| Handling | Før |
|---|---|
| overskriv underskriften direkte | afvist ✅ |
| ret ét felt i den | afvist ✅ |
| `remove()` underskriften | **tilladt** |
| `update({ underskrift: null })` | **tilladt** |
| `remove()` hele den klassificerede post | **tilladt** |
| skriv en ny underskrift bagefter | **tilladt** |

Write-once var altså brudt i **to trin**. Det er samme fejlklasse som
beslutning 38 navngav for `priser` — *"`.validate` kører ikke ved en sletning,
og det kan ikke lukkes med en regel"* — og den er nu dukket op igen ét niveau
dybere. Sætningen skal derfor stå kortere og hårdere:

> **En `.validate` siger hvad der må STÅ, aldrig hvad der må FORSVINDE.**

### ⚠ Og det kunne ikke løses på barnet

`.write` **kaskaderer nedad**, og et strammere barn kan ikke tilbagekalde en
forfaders tilladelse. Det er nøjagtig den kendsgerning beslutning 17 bygger på
for `.read` — her bare den anden vej. En `".write": false` på `underskrift`
ville ikke gøre noget som helst, fordi `$id` allerede har givet lov.

Leddet står derfor **hvor skrivningen tillades**: på `$id`. Og `newData` er
posten **efter** skrivningen — også når det er et barn der forsvinder, eller
hele posten.

### ⚠ Spærringen dækker mere end underskriften selv

Første udgave var `(!data.child('underskrift').exists() ||
newData.child('underskrift').exists())`: underskriften skal stadig findes
bagefter. Målingen viste at det ikke rakte — `skadeBeskrivelse` kunne stadig
rettes **efter** underskriften. Så beviser underskriften noget andet end det
der blev skrevet under på, og den er lige så lidt værd som en der kunne
redigeres.

Reglen er derfor den simplere og strammere: **en underskrevet post er frossen.**

```
&& !data.child('underskrift').exists()
```

⚠ **Rækkefølgen er dermed bestemt:** beskrivelse og modpart FØRST, underskrift
SIDST. Det er også den rigtige vej rundt — man skriver under på noget der står
der i forvejen. Og der er intet flow at brække: skærmen er ren visning i dag,
og det blev **målt**, ikke antaget.

### ⚠ Halvdelen af en spærring er en ny fejl

Da den klassificerede post blev frosset, kunne **hovedposten** stadig slettes
af sin ejer — og de to ligger på det **samme id**. Resultatet ville være et
bevis der peger på ingenting: en underskrift der ikke kan fjernes, på en skade
ingen kan finde igen. Før spærringen kunne begge dele slettes, og de var i det
mindste **enige**.

Hovedpostens `.write` fik derfor sit eget led: den må ikke slettes, hvis der
findes en underskrift på det id.

⚠ **En UNDERSKREVET post kan ikke trækkes tilbage — en uskreven kan.** `FORLOEB`
har ingen `annulleret`, så uden den åbning ville en fejloprettet indberetning
stå for altid. Det er sletning af et **bevis** der er lukket, ikke sletning.

### Målt i den udrullede base

**Én** underskrevet indberetning i DEV (`ind-001`), og den har sin hovedpost.
Reglen gør altså ingen eksisterende post ugyldig — modsat `udeAfDriftFra`
(beslutning 51's naboetape), hvor den ene ramte post skulle efterudfyldes.

### Hvad målingen kom af — README's nodetabel var drevet

Jeg kom til reglen fra listen *"Noder der er dokumenteret, men mangler regler"*.
Rækken om underskriften sagde *"⚠ Skal have `.write: !data.exists()`"* — altså
at reglen manglede. Den fandtes. Det gjorde fire andre rækker også:

| Række | Tabellen sagde | Virkeligheden |
|---|---|---|
| `facility/lokationer` | mangler regler | **har regler** |
| `facility/aktiver` | mangler regler | **har regler** |
| `facility/zoner` | mangler regler | **har regler** |
| `leverandoerer` | mangler regler | **har regler** |
| `sensitive/indberetninger` | mangler regler | **har regler** — og den er den ene node hvor den mindst betroede rolle skriver |

Fem af tolv rækker var forkerte. En liste over det der mangler, er kun
brugbar hvis den bliver kortere når noget bliver bygget — ellers er den en
opgaveliste man holder op med at læse. Tabellens egen sidste linje siger det:
*"Tilføjer du en node, hører den enten i reglerne eller på denne liste."* Nu
**prøves** det: `test/dokumentation.test.mjs` læser tabellen ud af README og
fejler på en node der står begge steder.

Det er den samme guard som `test/rules.tenant.test.mjs` er for reglerne selv —
en liste der ikke kontrolleres, driver. Og det var netop drift der gjorde, at
en spærring alle troede var på plads, kunne omgås i to trin uden at nogen
kiggede efter.

## 53. Hele kunderegistret kunne slettes med ét kald

Beslutning 52 lukkede én sletning. Så spurgte jeg hvor mange andre der stod
åbne, og målte det i emulatoren med en bruger der har **alle** permissions —
altså den adgang admin i forvejen har:

> **20 af 23 poster kunne hardslettes.**
> **17 af 23 HELE noder kunne tømmes i ét kald.**

Hele kunderegistret. Hele prisgrundlaget. Alle indkøb. Alle facility-data. Og
`sensitive/personale` — den klassificerede personalemappe — i én `remove()`.

`CLAUDE.md` har hele tiden sagt *"hardslet ikke regnskabsdata"*, `skriv.js` har
med vilje ingen `slet()`, og en prøve læser filen som tekst og fejler på
`.remove()`. Alt det handler om **klientbiblioteket**. `db.ref().remove()` går
uden om det, og en disciplin der kun findes i frontend, er ikke adgangskontrol
— det er den samme sætning som punkt 3 i den låste rækkefølge.

### To fejl, og de er hver sin

**1. `.write` lå på NODEN.** Den kaskaderer nedad: tilladelsen til at skrive
én post var samtidig tilladelse til at overskrive eller tømme hele noden. Det
er samme kendsgerning som beslutning 17 bygger på for `.read`, og som
beslutning 52 løb ind i — tredje gang den koster noget.

**2. Ingen `newData.exists()`.** En `.validate` køres ikke ved en sletning, så
formkravene sagde intet om at forsvinde.

⚠ **Og idiomet fandtes allerede.** `newData.exists()` stod på præcis **tre**
noder — `koeretoejer`, `personale`, `kompetencer` — fordi nogen tænkte over det
dér og ikke de tyve andre steder. Det er repoets kendte mønster: en rigtig regel
skrevet ét sted, som ingen holdt op mod de andre.

### Hvad der er lukket

`.write` er flyttet ned på **postniveau** på 18 stier og har fået leddet:

`lagre` · `omkostninger` · `satser` · `fravaer` · `leverandoerer` · `indkoeb` ·
`kassetyper` · `reolpladser` · `varer` · `carriers` · `plukordrer` · `kunder` ·
`kasser` · `facility/{lokationer, aktiver, zoner, sensorer, fejl, omkostning}`

Og de fire klassificerede satellitter — `sensitive/{kunder, koeretoejer,
personale, fravaer}` — fik et `$id`-led de slet ikke havde: reglen lå på noden,
og satellitten var derfor en `remove()` fra at være væk.

Efter: **0 af 23 noder kan tømmes, og 2 poster kan slettes.**

⚠ **`satser` er den vigtigste af dem.** Beslutning 7 siger at en sats
*overskrives aldrig* — man lægger en ny post med `gyldigFra`. Reglen håndhævede
det mod en **overskrivning** og ikke mod en **sletning**, og et prisgrundlag man
kan fjerne, versionerer ingenting. Nøjagtig samme forhold som mellem
`.validate` og write-once i 52.

### De to der MÅ slettes — og hvorfor

- **`brugerlayout/$uid`.** Brugerens egen forside er en præference om hans egen
  skærm, ikke en post om noget der er sket. Reglen er `auth.uid === $uid`, så
  han kan kun rydde sin egen (beslutning 43).
- **`indberetninger/$id` uden underskrift**, og dens satellit. `FORLOEB` har
  ingen `annulleret`, så uden den åbning ville en fejloprettet indberetning stå
  for altid. Er den underskrevet, er begge dele låst (beslutning 52).

Listen er **undtagelsen, ikke reglen**. Står en sti der, er det fordi nogen har
besluttet det.

### ⚠ Reglerne binder klienten — ikke servicekontoen

Det er svaret på det ene sted hvor en sletning virkelig skal kunne ske: en
GDPR-sletning af en medarbejder. Admin-SDK'et går uden om reglerne, så retten
til at blive glemt bliver ikke spærret her — den flyttes hen hvor den kan
besluttes og **logges**, i stedet for at ligge som en knap i en browser. Samme
snit som `auditoprydning`, der rapporterer frem for at slette på et tal ingen
jurist har sagt god for.

### Prøven er en ADFÆRDSPRØVE, ikke en tekstsøgning

`test/rules.sletning.test.mjs` læser **stierne ud af regelfilen** — som
nodelisten i `rules.tenant.test.mjs` — og prøver hver af dem: kan posten
slettes, kan noden tømmes. En ny node med en for løs regel fejler dermed uden
at nogen har husket at skrive et testtilfælde.

⚠ **Og den kan ikke laves til en strengsøgning.** `indberetninger` bærer
`newData.exists()` inde i et ELLER, fordi en uskreven post må trækkes tilbage.
En søgning efter strengen ville sige "lukket" om en node der er åben med vilje
— og dermed være grøn af den forkerte grund. Det er den samme fælde som prøven
der klippede regelteksten fra `"reolpladser": {` til `".indexOn"`: da `.write`
flyttede ned under indekset, blev udsnittet tomt og prøven grøn. Den læser nu
reglen dér hvor den ligger.

### Hvad flytningen kostede

Fire prøver blev røde, og alle fire læste `.write` **på nodeniveau**. De var
ikke forkerte før; de var skrevet ud fra hvor reglen tilfældigvis lå.

⚠ **Og én af dem pegede på en rigtig mangel.** `modulerFor()` slog kun op på
**eksakt** nodenavn, så `facility/lokationer` var "uden for tabellen" selv om
`facility` står i den. Et modul er en spærring for et helt **træ**, og et barn
arver derfor nu sin forælders modul. Alternativet — at skrive hvert af de seks
facility-børn ind i `NODE_MODUL` — ville have været seks nye steder at glemme
et.

## 54. `CLAUDE.md` sagde nej til noget der var besluttet ja til

Instruktionsfilen læses ind i **hver eneste session**. Den sagde:

> **Rollerne er faste.** `roller` er `.write: false`, og det skal det blive […]
> Se beslutning 31.

og, et andet sted:

> Der er ingen `roller/`-node at rette i.

Begge sætninger var rigtige da de blev skrevet. **Beslutning 31b omgjorde
dem** — kunden bad om at kunne redigere sine roller, og det blev bygget: noden
står i `firebase.rules.json`, `rolleskriv` skriver den, og
`claimForRolle()` minter fra `tenants/<id>/roller/<rolle>/perms` med
`ROLLE_PERMS` som **faldbakke**, ikke som svar.

⚠ **En forkert instruktion er værre end ingen.** Den næste der læser den, lader
være med at bygge noget der er bygget — eller siger nej til kunden om noget
der er besluttet ja til. Det er samme skade som en `.validate` der beskriver en
spærring der ikke håndhæves (52), bare med et menneske som håndhævelsespunkt.

### Fem passager i tre filer

| Fil | Sagde | Virkeligheden |
|---|---|---|
| `CLAUDE.md` | "Rollerne er faste" | 31b: kunden redigerer dem |
| `CLAUDE.md` | "minter fra `ROLLE_PERMS`" og "der er ingen `roller/`-node" | `claimForRolle()` læser noden |
| `README.md` | "Claim-udstedelse … skal ikke bygges" · "noden er nu **fjernet**" | `rolleskriv` findes; noden står i regelfilen |
| `README.md` | rollespørgsmålet står som **ikke afgjort** | 31b afgjorde det |
| `ARKITEKTUR.md` | "`.write: false` **indtil den funktion findes**" | funktionen findes |

Og to til, fundet i samme gennemgang:

| `ARKITEKTUR.md` | tilstandsskiftet venter på "en Cloud Function der ikke findes" | den hedder `etapeskift` |
| `ARKITEKTUR.md` | chaufførrollen giver adgang til "idébanken" | fjernet i beslutning 22, udført i 31 |

⚠ **Og grunden til at noden er lukket, er en ANDEN nu.** Før: fordi rollerne
ikke måtte ændres. Nu: fordi det er **vejen** der er lukket, ikke retten —
`rolleskriv` skriver noden, minter claims og kalder `revokeRefreshTokens` i én
ombæring. Kunne en klient skrive direkte, ville node og token stå og være
uenige indtil næste mint: man ville tro man havde fjernet en permission, som
stadig virkede. Samme ordning som `opgaver` (45) og `kasseudlaan` (37) — og
den forskel er værd at skrive, for et `.write: false` uden sin begrundelse
bliver før eller siden læst som "her mangler noget".

### Prøven — og hvorfor den ikke er en ordliste

`test/dokumentation.test.mjs` fik et afsnit til: en tabel over sætninger der
**ikke må stå**, hver med en **levende betingelse**.

Forbuddet mod *"der er ingen `roller/`-node at rette i"* gælder kun så længe
noden faktisk findes og `rolleskriv` er der. Fjernes de igen, må sætningen
komme tilbage — og prøven er grøn af den **rigtige** grund. En ordliste ville
være det modsatte: en regel om ordvalg, som nogen omgår ved at skrive det samme
med andre ord.

⚠ **Dertil den generelle udgave.** Siger et dokument at en node er
`.write: false`, prøves det mod regelfilen. Det er den påstand der oftest står
i de tre filer — ni steder om fire noder — og den er mekanisk kontrollerbar,
modsat "rollerne er faste", som kræver en beslutning at afgøre.

### Det mønster der bliver ved med at komme igen

Tre etaper i træk har fundet det samme: **en påstand ingen prøvede.**

- 52: en `.validate` beskrev en write-once der kunne omgås ved at slette først.
- 53: `CLAUDE.md` sagde "hardslet ikke regnskabsdata" — 17 af 23 noder kunne
  tømmes i ét kald.
- 54: instruktionsfilen sagde nej til noget der var besluttet ja til.

Fællestrækket er ikke sjusk. Det er at **dokumentation og regler ældes hver for
sig**, mens kun koden bliver kørt. Svaret er hver gang det samme: gør påstanden
kørbar, og lad listen være undtagelsen frem for reglen.

## 55. Man kunne ikke oprette en booking

Det er forløbets begyndelse — booking → etape → disponering → fakturagrundlag
— og den lå på en attrap. `bookinger` og `etaper` er begge `.write: false`,
der fandtes ingen `bookingopret`, og `naesteBookingnummer()`, som har ligget i
`booking-state.js` hele tiden, blev **kaldt ingen steder**. README har
navngivet hullet i månedsvis:

> *"En booking kan altså ikke oprettes af en klient."*

Skærmen fandtes til gengæld, fuldt udfyldt: `NyForespoergsel.jsx` med kunde,
strækning, transporttype, tidspunkter, fleksibilitet, omsætning og krav — og
to **deaktiverede** knapper med teksten *"Skrivning er ikke bygget endnu (fase
0)"*.

### ⚠ Tre ting kan ikke gøres rigtigt fra en klient

1. **Bookingen og dens etaper skal skrives sammen.** En booking uden etaper er
   en forespørgsel ingen kan planlægge; en etape uden sin booking hører ikke
   til noget. Det er beslutning 45's begrundelse igen, med et andet par.
2. **Nummeret kommer fra en counter i en transaction** (beslutning 8), og
   `countere` er `.write: false`. To casehandlere der opretter i samme sekund,
   ville ellers få samme nummer.
3. **Tilstanden er afledt** (beslutning 40). `bookingOpdatering()` kalder
   `forloebstilstand()` på de etaper den selv skriver; en `tilstand` fra
   klienten ville være den anden vej til ét felt.

### ⚠ Én knap, ikke to

Der stod *"Send til planlægning"* og *"Gem som kladde"*. Oprettelsen laver en
**kladde**; at sende den til planlægning er et **etapeskift** (`etapeskift`,
kladde → afventerPlan) og dermed et andet kald. De to kan ikke lægges sammen
atomisk, og en kæde der lykkes halvt, ville efterlade forløbet i en tilstand
brugeren ikke bad om. En kladde han kan **se** og sende videre, er det ærlige
svar.

### ⚠ Ingen reservation

En kladde-etape spærrer ingenting. Reservationen kommer når et **forslag**
godkendes, og det er `etapeskift`s arbejde. Skrev oprettelsen en, ville en
forespørgsel spærre en bil ingen havde disponeret — beslutning 4's fejl fra
den anden ende.

### Tre fund undervejs, og de er hver sin klasse

⚠ **Katalogerne lå i en demofil.** `TRANSPORTTYPE`, `RUTEPRAEFERENCE` og
`FLEKSIBILITET` stod i `demo-bookinger.js`. Tre skærme importerede dem derfra,
og **serveren kunne slet ikke nå dem**: `functions/` deployer kun sin egen
mappe, og et demosæt hører ikke i `delt/`. Præcis samme sted `ARBEJDSTYPE` lå,
før den flyttede til `opgaver.js`. De står nu i `booking-state.js`, hvor
`TILSTAND` står, og `valideBooking()` prøver imod dem — uden en re-eksport fra
demofilen, for to importstier til ét katalog er to steder at være uenige om
hvor det bor.

⚠ **Skærmen valgte kunde ud af demosættet.** `DEMO_KUNDER.filter(...)` stod
direkte i vælgeren, mens `kunder` er en **seedet node**. Vælgeren ville altså
tilbyde kunder der ikke findes i basen, og serveren ville svare *"Kunden findes
ikke"* på et valg skærmen selv havde tilbudt. Det er samme fejl som Indkøb →
Fakturaer, og den ville have ramt den allerførste rigtige booking.

⚠ **`oprettetAf` bar et NAVN.** Alle otte demo-bookinger skrev "Mette Kjær"
eller "Søren Dahl", mens `demo-indberetninger.js` skriver `uid-lars`.
`oprettetAf` er hvem der **gjorde** noget, og det er et uid — CLAUDE.md siger
det, og `bookingopret` skriver `auth.uid`. Et navn her ville betyde at
demosættet og noden bar to slags værdi i samme felt, og at Forslag-skærmen
viste et pænt navn i demo og et råt uid i drift. Demoen bærer nu uids, og
skærmen viser feltet som `<code>` — et råt uid er sandt; et gættet navn ville
ikke være.

### ⚠ Counteren stod på nul under 318 udstedte numre

**Målt i DEV:** otte bookinger med numre op til `BKG-2026-00318`, og
`countere/booking/2026` fandtes **ikke**. Den første rigtige booking ville have
fået `BKG-2026-00001` — altså en serie der begynder forfra **under** de numre
der allerede er udstedt, og som ville kollidere ved den 318.

Counteren er efterudfyldt til det højeste udstedte nummer. ⚠ Og det blev
**læst af posterne**, ikke gættet: en post hvis nummer ikke passer til
formatet, springes over og rapporteres frem for at trække serien ned.

Det er samme slags fund som `MDT-108` uden `udeAfDriftFra` (51): en regel eller
en mekanisme der kommer til, gør noget der allerede ligger i basen, forkert —
og det skal måles, ikke antages.

### Nodens form står nu skrevet

`bookinger/$id` validerede **seks** felter; posterne bærer **atten**. Nummeret
kunne være et tal, omsætningen en float, transporttypen hvad som helst. Blokken
beskriver nu formen — inklusive at levering skal ligge efter afhentning.

⚠ **Og den kan ikke nås af en klient.** Noden er `.write: false`, og
admin-SDK'et går uden om reglerne, så blokken er **beskrivelsen** af den form
serveren skal overholde — ikke håndhævelsen. Den ligger i `valideBooking()` og
`bookingOpdatering()`, som begge sider kalder. Skriv ikke en regelprøve der
"afviser" en booking: den ville være grøn fordi skrivningen er lukket, ikke
fordi posten var forkert. Se beslutning 45.

### Og en prøve der målte det forkerte

Warehouse-prøven *"læser kunden af varen frem for af nyttelasten"* klippede
`functions/index.js` fra `export const bevaegelseskriv` og **hele vejen ned** —
og fandt derfor `kundeId: kortStreng(d.kundeId` i `bookingopret`, hvor kunden
legitimt kommer fra klienten. Præcis samme fejl som reolpladsprøven i
beslutning 53: **et udsnit der ikke er afgrænset, måler noget andet end det man
tror.** Den slutter nu hvor funktionen gør.

## 56. En nyoprettet booking var usynlig

Beslutning 55 gjorde det muligt at oprette en booking. Så prøvede jeg at finde
den, og den var der ikke — hverken i Bookingoversigten eller i Forslag.

**Bookingoversigten læste `DEMO_BOOKINGER` direkte.** Ingen `useListe`, ingen
faldbakke: skærmen viste otte demoforløb, og noden lige ved siden af blev aldrig
spurgt. Det samme gjaldt `DEMO_OPGAVER`, `DEMO_KUNDER` og navneopslagene
`opgavePerson()`/`opgaveEnhed()`, som slår op i `DEMO_PERSONALE` og
`DEMO_KOERETOEJER`.

**Og Forslag var værre, fordi den var halvt rigtig.** Den hentede `etaper`,
`reservationer`, `koeretoejer`, `personale`, `kompetencer` og `kunder` fra
noderne — men slog **bookingen** op i `demoBooking()` og dens etaper i
`demoEtaperPaa()`. Reservationstjekket blev altså regnet af nodens etaper, mens
forløbet på skærmen var et helt andet. To svar på ét spørgsmål **i den samme
visning**.

### ⚠ Linten fandtes, og den kunne ikke se det

`test/demo-i-skaerm.test.mjs` er skrevet præcis mod den her fejl. Den tæller
kun sæt for **seedede** noder — og `bookinger` **stod ikke i SEED**.

Det er det egentlige fund: provisioneren seedede `etaper` men ikke deres
`bookinger`. I en frisk base pegede hver eneste etapes `bookingId` derfor på
en booking der **ikke fandtes**, og ingen så det, fordi den ene skærm der
kunne have vist tomheden, læste demofilen.

⚠ **En lint der springer noget over, siger ikke "nej" — den siger ingenting.**
Loftet stod på 20 og var grønt, mens to skærme viste mockuppens forløb.
Noden er nu i SEED, sættet i `NODE_FOR`, og begge skærme står på ejerlisten:
*nodens egen skærm må aldrig vise noget andet end noden*. Loftet er 20 → 17.

### Counteren følger med i seedet

Bookingerne bærer `BKG-2026-00311` og opefter, og `countere/booking/<år>`
fandtes ikke. Provisioneren sætter den nu til det højeste udstedte nummer —
**læst af posterne, ikke gættet**: en post hvis nummer ikke passer til
formatet, springes over og rapporteres frem for at trække serien ned.

⚠ Det er **ikke** en optælling. Beslutning 8 forbyder optællingen som
*nummerkilde*; det her er en efterudfyldning af en tæller der aldrig blev sat.
Uden den ville den første booking `bookingopret` laver, få `BKG-2026-00001` —
en serie der begynder forfra under de numre der allerede findes.

Dertil en selvkontrol: peger en etape på en booking der ikke er i sættet,
siger provisioneringen det. Det er samme slags dinglende reference som
fakturaen der pegede på en linje i den anden demofil.

### ⚠ Etaperne må ikke divisionsfiltreres væk fra deres booking

Bookingens tilstand **regnes** af alle forløbets etaper (beslutning 40).
Hentede skærmen etaperne med det almindelige divisionsfilter, ville en etape
kunne falde ud af summen — og et **delvist** forløb ville blive læst som
færdigt. Opslaget står derfor med `division: "alle"`, mens bookingerne selv
filtreres som alt andet.

### Navneopslag er ikke uskyldige

`opgavePerson()` og `opgaveEnhed()` returnerer et navn, ikke et tal, og de har
derfor stået på lintens liste over "detaljer der venter". Men hos en rigtig
kunde matcher de **ingenting**: kolonnen ville stå tom eller vise et råt id, og
en tabel med tomme navne ligner data der mangler. De læser nu `personale` og
`koeretoejer` fra noderne.

## 57. Maskinen havde ni tilstande og én dør

Beslutning 55 gav bookingen en oprettelse, 56 gjorde den synlig — og så stod
den stille. `skiftEtape()` blev kaldt fra **ét** sted: Forslag-skærmen, som
afgør `afventerKoord`. Alt andet i `ETAPE_OVERGANGE` havde ingen knap der
kunne trykkes:

| Fra → til | Handling |
|---|---|
| `kladde → afventerPlan` | Send til planlægning |
| `kladde → annulleret` | Annullér |
| `aaben → afventerPlan` | Tag af venteliste |
| `reserveret → udfoert` | Markér udført |
| `reserveret → annulleret` | Annullér etape |
| `afvist → afventerPlan` | Genåbn etape |

En booking oprettet med `bookingopret` begyndte som `kladde` og kunne **aldrig
komme videre**.

⚠ **Og Bookingoversigten listede dem endda.** Kortet *"Hvad du må lige nu"*
genererede rækken af `tilgaengeligeEtapeHandlinger()` — hvilket er rigtigt —
men hver knap var `disabled` med titlen *"Skrivning er ikke bygget (fase 0)"*.
Maskinen så hel ud, netop fordi tabellen var komplet.

### `fleet/Etapeskifte.jsx` — samme snit som `Statusskifte.jsx`

Knapperne tegnes af maskinen, ikke af en liste i filen, og serveren afviser med
den **samme** `kanSkifteEtape()`. Skærmen VISER; `etapeskift` HÅNDHÆVER.
Komponenten ligger i `fleet/` fordi flere skærme viser den samme etape — byggede
hver sin knaprække, ville de før eller siden være uenige om hvilke skift der
findes.

⚠ **De forslagsbærende overgange tegnes IKKE her.** *Send forslag*, *Foreslå
matchet tur* og *Godkend valgt forslag* kræver et forslag på etapen, og et
forslag laves der hvor man kan **se** turen — i Disponering og Forslag. En knap
her ville åbne en dialog man ikke kunne udfylde. Komponenten skriver i stedet
**hvor** man gør det: en henvisning er en vej, en deaktiveret knap er en attrap.
Det er samme svar som "Træk opgave hertil" fik i beslutning 49.

⚠ **Begrundelsen må ikke gøre knappen grå.** Overgange med `kraeverBegrundelse`
eller `kraeverFrist` åbner en dialog; blev knappen deaktiveret fordi feltet var
tomt, kunne man aldrig nå at udfylde det. Forhåndssvaret spørger derfor
maskinen **som om** begrundelsen var givet, og dialogen kræver den bagefter.

⚠ **Og begrundelsen er fritekst der ikke må i auditloggen.** Den står på
etapens historik, hvor den hører til sagen; `LOGBARE_FELTER` er en allowliste
netop for at holde tastet tekst ude. Det er den modsatte afvejning af
`opgavestatus` (beslutning 50), hvor der bevidst **ikke** kræves en
begrundelse: en annulleret TUR er en aftale med en kunde der brydes, en
driftsopgave er vores egen disposition.

### Prøven spørger maskinen, ikke skærmen

`test/etapeskifte.test.mjs` går hver eneste overgang i tabellen igennem og
kræver at den kan nås: de forslagsbærende fra Disponering eller Forslag, alle
andre fra `Etapeskifte`. **En ny overgang uden en dør fejler dermed uden at
nogen har husket at skrive et testtilfælde** — samme greb som nodelisten i
`rules.tenant.test.mjs`.

### ⚠ Et skift rører tre noder

Tilstanden, reservationen på hver ressource, og bookingens **afledte** tilstand.
Hentede skærmen kun etaperne igen efter et skift, ville tabellen ovenfor stå med
den gamle bookingtilstand — og det er præcis den uenighed Bookingoversigten
findes for at gøre **synlig**. Alle tre lister hentes derfor på ny.

## 58. Forslaget kunne ikke laves

Beslutning 57 gav etapemaskinen sine døre. Én af dem var stadig låst indefra:
overgangen `afventerPlan → afventerKoord` kræver `kraeverForslag`, og **intet
kunne lave et forslag**.

`etapeskift` **læser** `etape.forslag` når koordinatoren godkender, men skriver
det aldrig. `etaper` er `.write: false`. Ingen skærm byggede et. Disponering
*førte* til Forslag — og Forslag **vælger** mellem forslag der allerede findes.
Bookingflowet stoppede altså præcis dér hvor disponenten skulle arbejde.

### ⚠ Og forslagene lå i en form reglerne forbyder

Målt i DEV før rettelsen: `et-004/forslag` lå med nøglerne **0, 1, 2** og bar
sit `id` **inde i** objektet. Tre ting var galt på én gang:

- **RTDB har ingen arrays.** Provisionerens egen kommentar siger det —
  *"nøglerne FLYTTER SIG når en post fjernes"* — og `sammeNode()` findes netop
  for at nøgle børn på deres eget id. `etaper` blev seedet med `form: "liste"`,
  så etapen selv blev nøglet og dens `forslag`-array skrevet råt.
- **`$andet: false`** i regelfilen forbyder `id` inde i et forslag.
- **`valgtForslagId` skal pege på en NØGLE der findes.** Med nøglerne 0/1/2 og
  id'erne fs-a/fs-b/fs-c kunne et valg aldrig matche — og havde det matchet,
  ville "1" pege på et andet forslag i det øjeblik det første blev trukket
  tilbage.

⚠ **Serveren fandt alligevel forslaget**, fordi den søgte på `f.id` frem for på
nøglen. Serveren og reglen var altså uenige om **hvor forslagets identitet
bor** — og det virkede kun fordi demo-sættet bar begge dele. `forslagListe()`
er nu det ene sted formen oversættes til en liste, sorteret på `nr`.

### `forslagskriv` — og hvorfor den ikke er et led i `etapeskift`

Et forslag er **ikke** et tilstandsskift. Disponenten laver et, ser på det,
laver et til, og sender dem først når han er færdig. Lå skrivningen i
overgangen, kunne der kun laves **ét ad gangen** — og de 1–3 forslag
koordinatoren skal **sammenligne**, ville være umulige.

⚠ **Et forslag spærrer ingenting.** Reservationen skrives når koordinatoren
godkender. Skrev vi en her, ville tre forslag spærre tre biler for én tur — og
de to af dem for ingenting.

⚠ **Men de fem tjek køres alligevel.** Ikke for at spærre for evigt — der går
tid mellem forslag og godkendelse, og det er ved godkendelsen afgørelsen
falder. Men **et forslag koordinatoren ikke kan godkende, er et løfte til en
kunde der ikke kan holdes**, og disponenten skal have sit nej med det samme.

⚠ **Og opslagene ligger ét sted.** `spaerringerFor()` er trukket ud af
`etapeskift`, så begge kaldere bruger den samme — med den samme sætning. To
kopier ville være to steder at være uenige om hvad *"alt de fem tjek skal
bruge"* betyder: en glemt kompetenceliste her og en fuld dér.

⚠ **`booking.foreslaa`, ikke `booking.godkend`.** Beslutning 5: disponenten
laver forslagene og må ikke godkende sit eget. To permissions er hele grunden
til at der er to skridt.

### Tre er loftet, og nummeret er en plads i rækken

Mockuppen viser 1–3, og koordinatoren skal kunne sammenligne dem uden at
scrolle. Et fjerde forslag er ikke mere information — det er en beslutning der
ikke er truffet. Trækkes et tilbage, bliver der plads igen.

⚠ **Nummeret tildeles som det næste LEDIGE, ikke som `antal + 1`.**
Koordinatoren taler om "forslag 2", og med `antal + 1` ville to forslag få
nr. 3 hvis nr. 2 blev trukket tilbage.

### ⚠ En sættevogn er to enheder — også i formularen

Feltet er en liste, og enhederne slås til og fra hver for sig. Et multiselect
ville skjule at det er et **valg** at tage traileren med; `kanDisponeres()`
afviser en trailer uden trækkende enhed, og et forslag der kun kunne pege på
trækkeren, ville foreslå noget serveren siger nej til.

⚠ **Og transittiden er kørsel, ikke vinduet.** En tur til Paris løber over 40
timer, og chaufføren sover undervejs. Samme skel som mellem en etapes vindue og
dens `koerselMin`.

### To prøver der ledte det forkerte sted — tredje og fjerde gang

En prøve krævede at Forslag-skærmen kaldte `demoEtaperPaa(`. Da skærmen holdt
op med det i beslutning 56, blev prøven **grøn alligevel** — fordi en
**kommentar** nævnte navnet. Og min egen nye prøve på `forslagskriv` faldt over
funktionens egen kommentar om at den kræver `booking.foreslaa` og *ikke*
`booking.godkend`.

Det er samme fejl som `.fc-btn`-søgningen og reolpladsudsnittet i beslutning 53:
**et udsnit der ikke er afgrænset, og en søgning der ikke fjerner
kommentarerne, måler noget andet end det man tror.** Begge stripper nu
kommentarer først.

## 59. Loftet på tre var en blindgyde

Beslutning 58 satte loftet til tre forslag og skrev i sin egen validering:

> *"Der er allerede 3 forslag. **Træk et tilbage** for at lave et nyt."*

Der var ingen vej tilbage. Ingenting kunne trække et forslag, og `etaper` er
`.write: false`.

⚠ **Og det var værre end en irritation.** Den overgang koordinatoren bruger til
at bede om **nye** forslag — `afventerKoord → returneret`, derefter *"Send nye
forslag"* — kræver `kraeverForslag`, og de tre gamle opfyldte kravet. Etapen
kunne altså gå frem og tilbage mellem disponent og koordinator i al evighed med
de samme tre forslag, hvoraf ingen duede.

Sætningen i valideringen var altså en instruktion i noget der ikke kunne lade
sig gøre — samme klasse som README's *"træk opgave hertil"* før beslutning 49.

### ⚠ Det slettes ikke — det får et tidspunkt

`trukketMs` og `trukketAf`. Ikke en sletning, og ikke fordi reglerne forbyder
det (beslutning 53 gælder klienten; en Cloud Function kunne godt), men fordi
**et forslag koordinatoren HAR set, og som så forsvandt, ikke kan forklares et
halvt år senere**. Det er samme regel som på etapens historik, og samme svar som
53 gav i det hele taget: en post tages ud af drift med en status.

⚠ **`trukketAf` er et uid** — hvem der GJORDE det. Ikke `personId`; det er ikke
hvem forslaget handler om.

### To ting der kunne have været halve

⚠ **Loftet tæller de AKTIVE.** Talte det alle, ville et trukket forslag blive
ved med at optage sin plads, og sætningen *"træk et tilbage for at lave et
nyt"* ville stadig være usand — bare på en måde der var sværere at få øje på.

⚠ **Men nummeret genbruges IKKE.** Koordinatoren har måske set "forslag 2"; gav
vi nummeret til et nyt, ville en samtale om forslag 2 pege på to forskellige
ting. **Pladsen bliver ledig, nummeret gør ikke.** De to tællinger er derfor
adskilt med vilje: `aktiveForslag()` for loftet, `forslagListe()` for numrene.

### ⚠ Reglen kan ikke hindre et valg der peger på noget trukket

En `.validate` ser ét felt ad gangen, så regelfilen kan ikke sige *"`valgtForslagId`
må ikke pege på et trukket forslag"*. Det er lukket to steder i stedet:

- `traekOpdatering()` **rydder** `valgtForslagId` hvis den peger på netop det
  forslag — et felt der peger på noget der ikke gælder, skal ikke blive stående
  og se gyldigt ud.
- `etapeskift` **afviser** en godkendelse af et trukket forslag. Uden det kunne
  en godkendelse binde en bil til et forslag disponenten havde taget tilbage.

To spærringer i den rigtige rækkefølge er bedre end én der først siger nej til
sidst.

### ⚠ Ikke mens koordinatoren tager stilling

Tilbagetrækningen gælder de samme tilstande som skrivningen — `afventerPlan`,
`aaben`, `returneret`. Står etapen hos koordinatoren, ville et forslag der
forsvandt undervejs, ændre det der bliver besluttet **under den der beslutter**.
Skal det trækkes, returneres etapen først; det er netop hvad `returneret` er
til.

### Én funktion, to handlinger

`forslagskriv` fik `handling: "opret" | "traek"` — som `kasseudlaanskriv`. De
rører samme node med samme permission og samme forudsætninger, og en anden
funktion ville betyde en anden kopi af tenant-, abonnements- og modultjekket.

⚠ Det er **ikke** et flag der ændrer hvad posten ER (som en `art` ville være) —
det er hvad der sker med den. Den skelnen er hele grunden til at
`opgaveplanlaeg` og `facilityplanlaeg` er to funktioner, mens det her er én.

## 60. To af tre null-felter havde en kilde — den blev bare aldrig spurgt

`kpi.disponering` havde tre felter på `null`: `ledigKapacitetPct`,
`forsinkelsesrisiko` og `konflikter`. De stod der som "ingen kilde", og det var
kun sandt for det ene.

- **`forsinkelsesrisiko`** kunne regnes af etaperne alene. De bærer både
  `etaMs` og `senestMs`, og har gjort det hele tiden.
- **`konflikter`** kunne regnes af `tjekDisponering()` — en **ren** funktion
  der bare manglede sine fire lister. Den samme funktion skærmen viser og
  `etapeskift` håndhæver.
- **`ledigKapacitetPct`** kunne ikke, og bliver stående. Se nedenfor.

### ⚠ En ETA efter fristen — ikke en frist der er overskredet

De to er forskellige spørgsmål: det ene er en **risiko** man kan nå at gøre
noget ved, det andet er en kendsgerning. Feltet hedder risiko, så det er ETA'en
der sammenlignes med `senestMs`.

⚠ **Og en etape uden ETA eller uden frist tælles ikke med.** Den kan ikke
vurderes, og et gæt ville lægge sig oveni tallet som en måling. Hullet står
derfor ved siden af som `udenEtaEllerFrist` — samme greb som
`opgaver.udenTidsregistrering`, og af samme grund: **et lavt tal uden hullet ved
siden af ser ud som et rent hus.**

### ⚠ En etape med tre spærringer tæller én gang

Det man skal handle på, er **turen** — ikke bemærkningerne. Talte vi rækkerne
fra `tjekDisponering()`, ville en enkelt umulig disponering se ud som tre
problemer.

⚠ **Og uden listerne er svaret `null`, ikke nul.** En aggregering der ikke fik
sine biler, *ved* ikke at der er nul konflikter — den ved ingenting. Nul ville
se ud som et rent hus; det er samme forskel som mellem `—` og `0` i `num()`.

⚠ **Tallet hører i `kpi/` og ikke hos forbrugeren**, selv om Disponering regner
noget der ligner. Dashboardet henter hverken etaper, biler eller reservationer,
så det kan ikke regne det selv — og Disponering skriver eksplicit at dens eget
tal er det **viste vindue**, mens KPI-tallet er hele platformen.

### ⚠ Ledig kapacitet er ikke data der mangler — det er en definition

Ledig kapacitet i **hvilken** periode, og målt i **hvad**? Vogntimer, m³, kg
eller antal enheder uden en reservation lige nu? De fire tal peger forskellige
veje: en flåde hvor hver bil kører én time om dagen, er 96 % ledig i timer og
0 % ledig i enheder.

Feltet bliver derfor stående som `null` **med sin begrundelse**, og kortet på
skærmen siger *"definitionen mangler"*. Samme holdning som den manglende
momssats: vi gætter ikke, og et tal der ser ud som en måling, er værre end en
streg.

### To ting fundet undervejs

⚠ **Provisioneringen og jobbet regnede ikke det samme.** Da jobbet fik de fire
nye lister, viste provisioneringen stadig `null` for `konflikter` — den kaldte
`beregnKpi()` med sit eget, kortere input. Dev ville altså have vist en streg
hvor natten viste et tal, og ingen af dem var forkerte hver for sig. Begge
kaldere henter nu de samme lister.

⚠ **Og feltniveau-prøven var ensrettet.** Den spurgte kun *"lover demo-kpi
noget aggregeringen ikke skriver"*. Den modsatte retning manglede — så
`udenEtaEllerFrist` gled igennem, og demo-mode ville have vist `undefined` for
netop det tal.

**Målt da prøven kom: ti felter var allerede sluppet igennem** —
`bemanding.medarbejdereAktive`, `.fravaerIDag`, `opgaver.annulleret`,
`.udenTidsfrist`, `.aabneDeltaPct`, `oekonomi.ikkeFaktureretForloeb`,
`.planlagtPct`, `.akutPct`, `disponering.aabneEtaper` og
`.planlagteOpgaverDeltaPct`. Alle ti stod som `undefined` i demo-mode.

Det er nøjagtig den ensrettede prøve beslutning 55 fandt for `ART_FELTER` —
samme fejl, en anden fil. **`demo-kpi.js` ER nodens form, og formen skal passe
i begge retninger.**

### Tallet i README var skrevet af

Der stod *"38 felter er null"*. Provisioneringen tæller dem ved hver kørsel og
skrev **36**, længe før denne etape. Efter: **34**. Tallet står nu med en note
om at det er målt — et efterslæb man skriver af, holder op med at være et
efterslæb og bliver til et indtryk.

## 61. Tre bare nuller — to af dem havde en kilde

`kpi.opgaver` havde fire null-felter. Det ene, `udfoerteOpgaver`, havde sin
begrundelse skrevet ned: det er en **periodesum**, og perioden er ikke
besluttet. De tre andre — `forsinkede`, `udenTidsfrist` og `nyeBookinger` —
stod uden en eneste linje.

⚠ **Et null uden en begrundelse kan ikke skelnes fra et felt nogen har glemt.**
Det er samme fund som beslutning 60 gjorde i `disponering`, én domænerække
længere nede: to af de tre havde en kilde hele tiden.

### `forsinkede` — "skulle være færdig nu", ikke "startede for sent"

Opgaven bærer `startMs` og `estimeretMin`, og summen er hvad planen sagde. Er
den passeret, og opgaven hverken udført eller annulleret, er arbejdet forsinket.
En opgave der ikke er begyndt endnu, er **ikke** forsinket — den er planlagt.

⚠ **Og en opgave uden estimat tælles ikke med.** Den har ingen slutning at være
forsinket i forhold til, og et gæt på en standardlængde ville gøre den forsinket
på et tidspunkt ingen har besluttet — samme regel som `reservationFraOpgave()`
nægter at gætte et vindue.

### `nyeBookinger` — nye siden forrige beregning

Der er ikke en "periode" i noden at tælle i; det er præcis `udfoerteOpgaver`'
problem. Men der **er** et tidspunkt at måle fra: `forrige.beregnetMs`, som
deltaerne allerede regner imod. Jobbet kører natligt, så tallet er *"kommet ind
siden i går"*.

⚠ **Og `null` ved første kørsel, ikke nul.** Der er ingen forrige at måle fra,
og 0 ville betyde "ingen nye bookinger" — en påstand vi ikke kan bakke op.
Præcis samme regel som `deltaPct()`.

⚠ **Feltet tæller bookinger, ikke opgaver**, og står alligevel i
`opgaver`-domænet. Det er ikke sjusk: det er **arbejde der kommer ind**, og det
er den skærm der spørger. Men det betød at aggregeringen skulle have en liste
mere.

### `udenTidsfrist` bliver stående — og nu med en grund

"Uden tidsfrist" har ikke et felt i noden. En opgave bærer `startMs` (hvornår
den er planlagt) og `estimeretMin` (hvor længe den tager) — **ingen af dem er en
frist**. Den nærmeste udlægning, *"opgaver uden et planlagt tidspunkt"*, tælles
allerede som `uplanlagte`, og to felter med samme tal under hvert sit navn er
beslutning 6 brudt.

Feltet venter altså på et **felt** eller på et **andet spørgsmål** — ikke på et
seed. Det er samme slags null som `ledigKapacitetPct` fik i beslutning 60, og
det er værd at holde adskilt fra "ingen kilde": **de to slags null ser ens ud i
noden og er det ikke.**

### ⚠ Rækkefølgen er kontrakten

Jobbet henter sine noder med `Promise.all` og destrukturerer resultatet efter
**position**. Da `bookinger` kom til, lagde jeg først opslaget ind i midten —
og så ville `koeretoejer` have fået bookingerne, `personale` fået bilerne, og
**intet ville have fejlet**: alle fire er lister af objekter med et `id`.
Konflikttjekket ville bare have slået op i det forkerte.

Den kom med som den **sidste** i begge lister, og det står skrevet begge steder.
Det er samme klasse som `MAENGDE_SKALA` importeret frem for afskrevet: to
rækkefølger der skal passe sammen, og som ingen prøve holder øje med.

### Målt

Uden kilde: **36 → 34 → 33** over to etaper. `nyeBookinger` tæller ikke med i
faldet, fordi den er null i en frisk base **med vilje** — den får sit tal ved
anden kørsel.

## 62. Hvert null skal have en grund — og nu kræver en prøve det

Beslutning 60 og 61 fandt det samme to gange: felter der stod som `null` **uden
en linje begrundelse** — og hvor kilden havde ligget der hele tiden.
`forsinkelsesrisiko`, `konflikter` og `forsinkede` kunne alle regnes; de stod
som null fordi ingen havde spurgt.

Det er ikke to tilfælde. Det er et mønster, og det havde **tretten** eksempler
tilbage: fem under `kunder` og otte under `oekonomi`.

### ⚠ Tre slags null, og de ligner hinanden i noden

| Slags | Venter på | Eksempel |
|---|---|---|
| **Ingen kilde** | at noden bliver bygget | `kunder.tilbud` — `tilbud/` findes ikke |
| **Intet spørgsmål** | at nogen definerer tallet | `disponering.ledigKapacitetPct` |
| **Ingen forrige** | at jobbet kører i nat | alle deltaer i en frisk base |

Prøven kræver **ikke** at man vælger den rigtige — kun at man **skriver
hvilken**. Den kan ikke afgøre om begrundelsen er sand; den kan afgøre om nogen
har taget stilling. Det er forskellen på en liste man læser, og en man holder op
med at læse.

### Det den fandt undervejs

⚠ **`driftsomkostningerOere` stod med en forældet grund:** *"Uden `indkoeb` er
der ingen driftsomkostninger at lægge sammen."* `indkoeb` har været seedet
længe, og `indkoebstal()` regner allerede `maanedensForbrugOere` af netop de
linjer. Kilden manglede ikke — **perioden** gjorde. Et samlet beløb over hele
noden ville vokse med historikken frem for med forbruget.

⚠ **`kunder.daekningsbidragOere` mangler sit ene led.** Omsætningen findes nu på
bookingen (beslutning 55), men omkostningen pr. **kunde** gør ikke: en
indkøbslinje hører til en leverandør, en opgave til en enhed. Regnede vi
bidraget af omsætningen alene, ville hver kunde stå med **100 % margin** — et
tal der ser ud som en måling. Samme grund som `100 - null` er forbudt.

⚠ **`oekonomi.driftstimer` er tre spørgsmål i ét navn:** chaufførens,
køretøjets eller værkstedets timer? `opgaver.faktiskMin` findes, men det er hvor
længe der blev **arbejdet på** en enhed — ikke hvor længe den var i drift. To
tal der hedder det samme og betyder hver sit, er beslutning 11 og 14's fejl.

⚠ **`planlagtPct` og `akutPct` har samme manglende felt som
`planlagtVedligeholdPct`:** opgaven har `art`, status og prioritet, men intet
felt for planlagt/akut. At læse `prioritet: hoej` som akut ville være et gæt —
og de to tal supplerer hinanden til 100, så **et gæt i det ene bliver til en
løgn i det andet**.

### ⚠ Og et løb af nuller deler én begrundelse

`bemanding`s ni felter venter alle på det samme svar — kan bemandingen deles på
division? Begrundelsen står ét sted, i hovedet af `udenKilde()`, og feltet har
nu en linje der **peger på den**. Prøven accepterer en kommentar over et helt
løb, ikke over hver linje: et krav om ni ens kommentarer ville producere støj
frem for stillingtagen.

### ⚠ Og jeg slettede etapens egne rettelser undervejs

For at fjerne et prøvefelt kørte jeg `git checkout` på filen — og rullede
dermed alle ukommitterede ændringer i den tilbage. De var heldigvis skrevet af
et script og kunne køres på igen.

To ting kom ud af det, og de er værd at skrive ned: **et prøvefelt fjernes med
en målrettet rettelse, ikke med en tilbagerulning af filen**, og
**efterprøvningen skal ligne det den prøver** — mit første prøvefelt stod som
`{ udenGrund: null }` på én linje og blev ikke fanget, hvilket lignede en vagt
der ikke virkede. Anden gang blev feltet skrevet som de rigtige, og vagten faldt
som den skulle.

## 63. Indkøb rangerede leverandører på opdigtede fakturaer

Alle tre Indkøb-skærme læste demofiler for noder der er seedet. Seks steder, og
de er ikke lige alvorlige — men det værste er ikke en visningsfejl.

### ⚠ Nøgletallene blev regnet af ni opdigtede fakturaer

`beregnNoegletal()` fik `fakturaer: DEMO_FAKTURAER` **to steder**: i
Indkøb → Oversigt (top 5-listen) og i Indkøb → Leverandører (hele
performancetabellen). Skærmen **rangerer leverandører** på tallet, og
`MINDSTE_GRUNDLAG` sørger for at et lille grundlag giver `null` frem for en
procent — men grundlaget var kundens slet ikke.

**Et forkert grundlag er her ikke en visningsfejl. Det er en anbefaling om hvem
man skal handle med.** To leveringer og to hundrede ser ens ud i en tabel; ni
opdigtede fakturaer og kundens egne gør det også.

### ⚠ To navneopslag lå som modul-konstanter bygget af demofilen

```js
const ktNavn = (id) => DEMO_KOERETOEJER.find((k) => k.id === id)?.kaldenavn || null;
const lvNavn = (id) => leverandoerNavn(DEMO_LEVERANDOERER, id);
```

Hos en rigtig kunde matcher de **ingenting**: kolonnen *"Relateret enhed"* ville
stå tom på hver eneste indkøbslinje, og leverandørkolonnen på hver eneste
faktura. **En tabel med tomme navne ligner data der mangler** frem for et opslag
der peger det forkerte sted.

Det er tredje gang i denne omgang — Servicekalenderens `lvNavn` og
Bookingoversigtens `opgavePerson`/`opgaveEnhed` var de to andre. Mønstret er
altid det samme: et navneopslag ser uskyldigt ud, fordi det ikke er et *tal*.

⚠ **Og en underkomponent kan ikke se den ydres variable.** Da `lvNavn` flyttede
ind i komponenten, skulle den sendes med til `Godkendelse` — en ReferenceError
ved rendering er ingen byggefejl, og kun et klik fanger den. Det er sjette gang
den note skrives i dette repo.

### ⚠ Formularen tilbød biler og steder der ikke findes

Registreringsformularen fik `koeretoejer={DEMO_KOERETOEJER}` og
`lokationer={DEMO_LOKATIONER}`. En rigtig kunde ville altså få en vælger fuld af
vores demobiler — og serveren ville afvise et valg **skærmen selv havde
tilbudt**. Nøjagtig samme fejl som Ny forespørgsel havde med kunderne
(beslutning 55), og den ville have ramt den første rigtige indkøbslinje.

### ⚠ Og én ting bliver i demofilen — med en grund

`DEMO_LEVERANDOERSAGER` bruges stadig som kilde til reklamationer.
**`sager/` findes ikke i `firebase.rules.json`** — beslutning 20 er fase 0 — så
der *er* ingen node at læse. Et tomt array ville få hver leverandør til at stå
med nul reklamationer, og nul ser ud som en måling.

Det er samme skel som mellem de tre slags null i beslutning 62: **"ingen node"
og "en tom node" er ikke det samme svar.**

### Loftet

`demo-i-skaerm.test.mjs` gik fra **17 til 10**. De ti der er tilbage, er
navneopslag i Bemanding, LiveKort, Arbejdskøen, Indberetninger, Facility →
Oversigt og Opsætning → Generelt — én skærm ad gangen, med et klik bagefter.

## 64. Loftet er nul — og Rute & status havde stået tom for alle

De sidste ti direkte opslag i demofiler er væk. `demo-i-skaerm.test.mjs` gik
**30 → 23 → 20 → 17 → 10 → 0** over seks etaper, og den er ikke længere et loft
man kan pege på en undtagelse i: **det er et forbud.**

⚠ **Et demosæt må stadig stå som `demo:`-faldbakke.** Det er hele reglen fra
beslutning 26: opdigtede tal findes KUN dér hvor der ingen database er. Linten
tæller brug **uden for** den faldbakke.

### ⚠ Og den sidste skærm var i stykker på en måde ingen kunne se

`LiveKort.jsx` — Rute & status — filtrerede sine ture sådan:

```js
.filter((e) => e.koeretoejId && …)
```

**Ingen etape har `koeretoejId`.** Feltet hedder `koeretoejIder` (flertal) og
har gjort det siden sættevognen kom til: en tur optager trækker **plus**
trailer. Målt i demo-sættet: **0 af 8** etaper har entalsformen, 7 har
flertalsformen.

Filteret matchede altså ingenting, og **skærmen stod tom for alle — også i
demo.** Det fejlede ikke; det viste bare ingenting.

Det er præcis samme klasse som `opgaver`' indeks der navngav `dato`, og som
modulets `FELT`-katalog der lovede `varighedMin`: **et forkert feltnavn er
tavst.** RTDB henter hele noden ned og filtrerer i klienten, og en `.filter()`
på et felt der ikke findes, svarer bare "ingen".

⚠ **Og ruten hører til den TRÆKKENDE enhed.** En trailer har ingen rute af sig
selv. Tabellen viser derfor `enhedsIder(e)[0]`, mens detaljepanelet viser dem
begge — *"Volvo FH + Trailer 41"* — fordi det er dér man skal kunne se at turen
optager to.

### To sæt læses stadig direkte — og de tælles ikke med

| Sæt | Hvorfor |
|---|---|
| `DEMO_LEVERANDOERSAGER` | `sager/` findes ikke (beslutning 20 er fase 0) |
| `demoHaendelser` | `statushaendelser` findes hverken i reglerne eller i SEED — de kommer fra **chaufførens meldinger, og appen er ikke bygget** |

Begge er "ingen node", ikke "en tom node". Et tomt array ville få hver
leverandør til at stå med nul reklamationer og hver tur med "ingen meldinger" —
og **"ingen meldinger" er netop den oplysning skærmen giver om en tur der ER i
gang**. Nul ser ud som en måling.

### Hvad de sidste seks skærme kostede

- **Arbejdskøen** byggede `enhedNavn` af noden og `lvNavn` af demofilen — de to
  stod side om side, så bilens navn ville stå rigtigt og værkstedets tomt.
- **Indberetninger** havde `bilNavn` som modul-konst; kolonnen ville vise et råt
  id.
- **Bemanding** slog stationeringer op i demofilen; kolonnen "Steder" ville stå
  tom på hver funktion.
- **Facility → Oversigt** havde både navneopslaget og **vælgeren i
  aktivformularen** på demosættet — formularen ville tilbyde folk der ikke
  findes.
- **Opsætning → Generelt** viste vores fem demolokationer som kundens egne. Det
  er en **læseskærm over kundens opsætning**: det sted man går hen for at se
  hvad man HAR. Et forkert tal dér er værre end intet tal.

⚠ **Og syvende gang: en underkomponent kan ikke se den ydres variable.** Hver
gang et opslag flyttede fra modulniveau ind i komponenten, skulle det sendes med
som prop — `Detaljer`, `Godkendelse`, `Tidslinje`. En ReferenceError ved
rendering er ingen byggefejl, og kun et klik fanger den.

## 65. Unitbookings tre tvetydige punkter — afgjort, ikke gættet

`UNITBOOKING.md` 6.10 sluttede med tre ting fra planchen der ikke kunne bygges
af planchen alene. De havde stået som *"ikke bygget"* — hvilket lyder som noget
nogen skal nå, og var noget nogen skulle **svare** på. De er nu stillet som
spørgsmål og besvaret.

### Dag / Uge / Måned → kolonnerne følger intervallet

Planchen har en granularitetsvælger **ved siden af** interval-vælgeren. To
kontroller der begge handler om tid, tvinger brugeren til at forstå forskellen
på *"hvor langt"* og *"hvor fint"* før han kan bruge nogen af dem.

1 og 2 uger tegnes derfor med dagskolonner; 4 uger med **ugekolonner** — fem i
stedet for otteogtyve. Det var netop de otteogtyve der gjorde det nødvendigt at
lægge måned- og ugerækker over gitteret.

⚠ **Og prisen står på skærmen.** En ugekolonne kan ikke skelne et 3-dages udlån
fra et 7-dages: blokken fylder den uge den rører. **Målt i en prøve** — de to
lægges ud på nøjagtig de samme kolonner — og skærmen skriver det, når
kolonnerne er uger. En visning der ser præcis ud uden at være det, er værre end
en grov visning der siger det. Samme holdning som forbeholdet i
`tjekKoerehviletid()`.

⚠ **Ugen begynder mandag.** `getDay()` giver 0 for søndag, så søndag skal syv
dage tilbage og ikke nul — ellers ville fredag og lørdag ligge i hver sin
kolonne, og en tur hen over weekenden se ud som to.

⚠ **Og en uge er ikke 7 × 24 timer.** Over sommertidsskiftet er den 167 eller
169, så kolonnerne bygges med `Date` af samme grund som dagene. En prøve lægger
vinduet hen over skiftet.

### Filtre-knappen → rækkerne, på type og undertype

Rækkerne **er** kasser, og aksen er type og undertype — den **samme ordliste**
Kasser-skærmen filtrerer på, via `undertyperFor()`. To filtre over samme
kartotek med hver sin ordliste ville være to steder at være uenige om hvad en
undertype er.

⚠ **Det er ikke et blokfilter.** *Fremhæv art* står allerede over gitteret og
fremhæver klargøring, udlån og returnering **inde i** rækken. Et filter der
fjernede blokke, ville lade rækken stå tom — og **en tom række ligner en ledig
kasse**.

⚠ **Kun ved gruppering pr. kasse**, for en sag har ikke en kassetype. Og
undertypen nulstilles når typen skifter: en undertype fra en anden type ville
filtrere alting væk og ligne en tom kalender.

### "Inaktiv" → bygges ikke, og det er beslutningen

Planchens femte farve. Kalenderen viser kun kasser der har et udlån i vinduet —
eller er ude af drift — og det bliver stående:

> Et gitter med hundrede rækker hvoraf seks har en blok, skjuler de seks.

En gråtonet række er stadig en række der fylder. Med ti kasser i dev ser det
harmløst ud; med hundrede drukner de aktive.

⚠ **Skærmen skriver det.** *"Kun kasser med et udlån i perioden vises."* **En
udeladelse man kan se, er et valg; en man ikke kan se, er en fejl.** Og med
Filtre-knappen kan man nu snævre rækkerne ind på den akse der betyder noget.

### ⚠ Og "ikke bygget" var den forkerte etiket

Alle tre stod i tabellen som *"Ikke bygget"* — samme ord som de ting der bare
manglede arbejde. To af dem ventede på et **svar**, og den tredje skulle
**afgøres til nej**. En liste hvor "venter på kode" og "venter på en beslutning"
ser ens ud, får den der læser den, til at tro der er mere tilbage at bygge end
der er — og den der skulle svare, får aldrig spørgsmålet.

Det er samme skel som de tre slags null i beslutning 62. Tabellen skriver nu
**Afgjort** frem for **Ikke bygget**, hvor det er et svar der manglede.

## 66. "Udvid til 2 skærme" var ikke en knap — det var en URL

Planchens sidste ubyggede knap. `UNITBOOKING.md` 6.18 havde allerede skrevet
hvorfor den ikke bare var et `window.open`:

> *"Det hører sammen med at ruten skal kunne bære sin tilstand i URL'en, så det
> nye vindue åbner på den samme uge og gruppering."*

⚠ **Et nyt vindue er en ny indlæsning.** Al tilstand i `useState` begynder
forfra. Uden URL'en ville den anden skærm åbne på standardvinduet — fire uger
fra i dag, alle kasser, grupperet pr. kasse — mens den første stod på uge 36
grupperet på sag. **To skærme der viser hver sit er det stik modsatte af hvad
man beder om, når man siger "udvid".**

Kalenderens visning ligger derfor i URL'en: `uger`, `skub`, `gruppering`, `type`
og `undertype`. Samme greb som Arbejdskøens `?vis=` og `?frem=` — og det giver
samtidig et link man kan sende: *"kig på uge 36, grupperet på sag."*

### ⚠ Tre ting ligger IKKE i URL'en, og hver har sin grund

**Tenant, division og periode.** De ligger i `localStorage` via `FleetContext`
og er derfor allerede de samme i det nye vindue. Lå de begge steder, kunne de
blive uenige — og så ville et link kunne åbne en anden kundes kalender end den
man sendte.

**`fuld`.** Den *initialiseres* fra `?fuld=1`, så det nye vindue åbner udfoldet
— en skærm mere bruges til at se mere, og et vindue der åbnede med sidebar og
listen nedenunder, ville bruge den anden skærm på det samme som den første. Men
Escape lukker den, og **et tastetryk skal ikke skrive i adresselinjen**: en
tilstand der ændrer sig ti gange i minuttet, hører ikke i en URL man kan sende
videre.

**`arter` (Fremhæv).** Den fremhæver *inde i* rækken og skjuler ingenting. Åbner
det andet vindue med alle tre, viser det aldrig **mindre** end det første — og
den retning er den sikre.

### ⚠ `replace: true`, ellers fylder pilene historikken

Hvert klik på en pil ville lægge en post i browserhistorikken. En disponent der
har bladret ti uger frem og tilbage, skal ikke trykke tilbage ti gange for at
komme ud af kalenderen.

### ⚠ Og knappen vises ikke i fuldskærm

Fuldskærm er en **flydende visning oven på siden** — den har ikke en anden skærm
at brede sig til, og et vindue åbnet bag et overlay ser ud som om intet skete.
De to knapper står derfor ved siden af hinanden i den normale visning, og
titlen på hver siger hvad den gør: den ene giver kalenderen hele **bredden** af
den skærm man har, den anden giver den en skærm **mere**.

### Unitbooking mod plancherne

Tilbage er **én** ting, og den venter ikke på kode: mails og fotos i klik-kortet.
De hører til **beslutning 20**, som er fase 0 — `sager/` står ikke i
`firebase.rules.json`, og der er hverken modtagevej eller afsendelse.

## 67. Tre navne linten fandt, og hvorfor de fik en kontrol frem for en sletning

`npm run lint` fandt tre navne der blev **regnet og aldrig brugt**. Beslutning
41 skrev hvorfor de ikke bare blev slettet:

> *Et fjernet navn tager beviset med sig, og så er der ingen der ved at
> kontrollen mangler.*

De stod derfor med en `eslint-disable-next-line` og en note der pegede på
README. Det var det rigtige at gøre **den dag** — men en dæmpning er en
udsættelse, ikke en beslutning, og den kan sidde i årevis. Her er de tre, og
hver af dem viste sig at være en anden fejl end "et ubrugt navn".

### `booking/Oversigt.jsx` — det værste var fodnoten

`setVisAlle` blev kaldt ingen steder, så udførte, afviste og annullerede forløb
var **permanent skjult**. Og under tabellen stod:

> *"Viser N af M hentede bookinger"*

⚠ **Brugeren fik altså at vide at der var noget han ikke kunne se, og der var
ingen vej til det.** At skjule i stilhed havde været bedre end at skilte med
det. Det er en variant af den samme fejl som en pæn knap: oplysningen findes,
handlingen gør ikke.

⚠ **Men standarden blev IKKE vendt om.** En bookingoversigt er en
**arbejdsliste** — det man skal handle på, er de forløb der ikke er færdige, og
et afsluttet forløb er historik. Med et år på bagen ville de fylde listen ved
hver indlæsning. Rettelsen er derfor en **knap**, ikke en ændret standard.

⚠ **Og knappen siger hvor mange.** *"Vis alle"* er en indstilling man
ignorerer; *"Vis 3 afsluttede"* er en oplysning man forholder sig til. Tallet
tælles af den **genberegnede** tilstand (`vist`), ikke af bookingens gemte felt
— de to kan være uenige, og det er netop den uenighed skærmen findes for at
gøre synlig. Talte knappen af det gemte felt, kunne den love et forløb frem som
filteret bagefter skjuler.

### `udbyder/Prisliste.jsx` — en kommentar der forklarede noget til ingen

`sidstRettet` blev regnet, og over den stod en note om hvad tallet betød.
Tallet nåede aldrig skærmen. Det står nu øverst i "Prislister".

⚠ **"Sidst lagt", ikke "gælder fra".** To forskellige spørgsmål: en liste kan
**lægges** i dag og **gælde** fra næste kvartal, og tabellen svarer allerede på
det andet i to kolonner. Blandes de sammen, læser man en dato som en
ikrafttrædelse den ikke er — så teksten siger forskellen.

⚠ **Og den står i kortets krop, ikke i en ny prop på `Kort`.** `Kort` er delt af
hver skærm i appen. En oplysning der gælder én skærm, hører ikke i skallen —
det er den samme grænse som sidebaren og periodevælgeren har.

### `moduler/Oekonomi.jsx` — og her lå der en rigtig fejl under

README talte **to** fund. Koden havde **tre**: dækningsgradsafvigelsen var kun
nævnt i en bisætning som *"samme mønster"*. Den var ikke samme mønster — den
havde en fejl mere i sig:

```js
const daekningsgradAfv = k.oekonomi.daekningsgradPct - k.oekonomi.maalDaekningsgradPct;
```

⚠ **`x - null` er `x`, og `null - y` er `−y`.** Begge ser ud som **målinger**,
og gaten i `deviation()` nås aldrig, fordi tallet er blevet rigtigt på vejen.
Det er præcis den fejl CLAUDE.md advarer mod, og den sad her og ventede — den
var **usynlig så længe tallet ikke blev vist**. Et navn linten klager over, kan
altså være et ubrugt navn *og* et forkert regnestykke, og man finder kun det
andet ved at spørge hvorfor navnet stod der.

Tallet står nu under grafen i "Dækningsgrad mod målsætning", og der tjekkes med
`Number.isFinite()` **før** subtraktionen.

⚠ **Grafen og tallet svarer på hver sit,** og begge bliver stående: grafen viser
**hvornår** man krydsede målet — derfor er målet tegnet som en serie og ikke som
en etiket — og tallet viser **hvor langt** der er lige nu.

⚠ **Procentpoint, ikke procent.** 68 % der bliver 72 % er +4 point. Og
`deviation()` kender ikke en `unit` der hedder `"point"` — den falder igennem
til `num` og **taber ordet i tavshed** — så enheden skrives i teksten.

### Prøven er tosidet, og det er hele pointen

`test/linten-fandt.test.mjs` kræver **både** at navnet bruges **og** at
`eslint-disable` er væk. Uden det første kan man dæmpe linten igen; uden det
andet kan man "rette" fundet ved at slette navnet. Begge veje fører tilbage til
en skærm der mangler en kontrol, uden at nogen kan se det — og det var
udgangspunktet.

## 68. Et tal der stod fire steder var forkert tre af gangene — og et hul der aldrig var der

To fund i den samme gennemgang, og de er samme fejl set fra hver sin side:
**dokumentation der ikke bliver målt, driver — og driften går altid mod at der
er MERE tilbage end der er.**

### Efterslæbet: 51, 16, 16, 16 — og 17

Antallet af KPI-felter uden kilde stod skrevet i hånden fire steder:

| Sted | Sagde | Rigtigt |
|---|---|---|
| `CLAUDE.md` | **51** | 17 |
| `README.md` (to steder) | 16 | 17 |
| kommentaren i `kpi-aggregering.js` | 16 | 17 |
| `udenKilde()` | — | **17** |

⚠ **`CLAUDE.md` var 34 for høj.** Det er den fil der *overstyrer* hvordan der
arbejdes i repoet, og den påstod at aggregeringen manglede tre gange så meget
som den gjorde.

⚠ **Et for højt efterslæb er ikke en harmløs afrunding.** Tallet er det eneste
der siger hvor meget der mangler. Ser opgaven tre gange så stor ud som den er,
bliver den ikke taget — man udskyder noget der kunne være gjort. Og den
modsatte retning er lige så slem: står der 16 hvor der er 17, er der ét felt
ingen leder efter. (Det var `flaade.nedetidDeltaPoint`, tilføjet uden at
tælleren fulgte med.)

⚠ **Og fejlen var allerede kendt.** README beskriver præcis den drift et afsnit
længere oppe:

> *"det stod på 38 længe efter at fire felter havde fået en kilde"*

Svaret **dengang** var at rette tallet i hånden. Det er derfor det drev igen.
En håndholdt optælling har ingen hukommelse; det eneste der virker, er at
tallet **kun findes ét sted** og at teksterne holdes op mod det.
`test/kpi-efterslaeb.test.mjs` læser tallet ud af `udenKilde()` og kræver at
alle fire steder siger det samme — efterprøvet ved at føje et felt til
`udenKilde()`, hvorpå alle fire falder.

⚠ **En omformulering får prøven til at fejle,** og det er med vilje. Skriver
nogen sætningen om, skal de også se tallet. En prøve der stiltiende holdt op
med at kigge, ville være værre end ingen — det var jo netop sådan de tre
forkerte tal overlevede.

### Hullet der ikke var der

`CLAUDE.md` stod med:

> *"Det der står tilbage, er de GAMLE opgavers reservation. `opgaveplanlaeg` og
> `opgaveflyt` skriver den nu, men poster fra før de funktioner fandtes, har
> ingen … En bagudrettet udfyldning er sin egen opgave."*

Målt på den udrullede DEV-base: **27 opgaver, 0 uden reservation, 0 uden
estimat.** README havde målt det samme (på 21 opgaver) og skrevet punktet ud;
`CLAUDE.md` blev ikke rettet med.

⚠ **En beskrevet opgave der ikke findes, koster mere end en manglende.** Den
næste bygger et udfyldningsscript mod en node hvor hver post allerede har sin
reservation — og gør det mod en node der er `.write: false`, så scriptet ikke
engang kan køre. Tid brugt på at "rette" noget der holder.

⚠ **Og det holder af en grund der kan efterprøves:** alle fire veje ind skriver
opgaven og dens reservation i én `update()`, og `opgaver` er `.write: false`,
så der findes ingen femte. Vagten i `test/dokumentation.test.mjs` er derfor
**levende**: løsnes `.write` igen, må sætningen komme tilbage — for så kan
hullet opstå. Det er lukningen der gør det umuligt, ikke en oprydning nogen
lavede.

### Hvad der blev målt og holdt

Resten af `CLAUDE.md`'s tal-påstande blev målt i samme ombæring og holdt: syv
roller, tre retentionklasser alle på 24, ni skrifttokens, `ENHED` er
`dag | time | uge`, `opgaver.art` er `vaerksted | facility`, `sager/` står
stadig ikke i reglerne, og alle fire veje ind i `opgaver` findes.

## 69. Flåden og bemandingen ventede aldrig på data — svaret stod i beslutning 19's første sætning

Sytten KPI-felter havde stået som `null` i månedsvis med begrundelsen:

> *"Kan flåden og bemandingen deles på division?"*

Det lyder som et spørgsmål om **hvordan** man deler. Det var det ikke. Svaret
stod øverst i beslutning 19, skrevet dengang og aldrig læst siden:

> *"Ingen abonnent har både gods og bus; en busvognmand har kun ét sæt tal, så
> der var aldrig noget at dele op."*

⚠ **Spørgsmålet var altså ikke hvordan, men OM — og svaret var nej.** Ni af de
sytten felter kunne regnes samme dag.

### De tre udledninger, målt frem for vurderet

README bød tre veje: udled af **arten**, af **brugen**, eller lad dem være
udelte. Alle tre blev målt på den udrullede DEV-base før noget blev bygget:

| Vej | Målt | Dom |
|---|---|---|
| Efter **brugen** | 15 af 16 køretøjer og 29 af 35 medarbejdere har **aldrig** været på en etape | ikke svær — **død** |
| Efter **hjemsted** | Kolding har fire trækkere **og** en buschauffør; Vejle har en bus **og** en påhængsvogn | en **garage**, ikke en afdeling |
| Efter **arten** | 3 busser, 11 gods, 2 hverken (truck, scooter) | kun et gæt hvis man tvinger det til at være **binært** |

⚠ **Den tredje række er den interessante.** Modellen har en tredje værdi —
`faelles` — og beslutning 19's egne modeksempler (varevognen, påhængsvognen)
er præcis dem der lander dér. Udledningen var altså mulig. Den blev bare
overflødig, da præmissen holdt: har kunden kun én forretning, er "gods" hele
flåden hos en godsvognmand.

### Hvad der regnes nu

**Flåden:** `aktive`, `udeAfDrift`, `paaVaerksted`, `serviceInden30`.
**Bemandingen:** `medarbejdereAktive`, `fravaerIDag`, `kompetencerUdloeber`,
`disponeret`, `chauffoerDisponeret`.

Målt på demo-basen: 11 aktive biler, 2 på værksted, 9 til service inden 30
dage; 32 aktive medarbejdere, 2 fraværende i dag, 7 kompetencer der udløber.

⚠ **Funktionerne tager ingen `division`-parameter, og det er selve
beslutningen.** Feltet er forbudt på `koeretoejer` og `personale`. En
parameter der ikke kunne bruges, ville få den næste til at tro at den kunne —
og så ville nogen filtrere på et felt der aldrig står der og få nul biler i
begge divisioner **uden at noget fejlede**.

### Fælderne i regnestykkerne

- ⚠ **En solgt bil er ikke ude af drift — den er ikke vores.** Talte den med,
  ville flåden se ud til at få et voksende problem hver gang nogen solgte en
  gammel lastbil, og tallet kunne aldrig blive bedre.
- ⚠ **En overskreden service er ikke "inden 30 dage".** Den er overskredet —
  et andet og værre tal. Lagt sammen ville en bil der skulle have været til syn
  i marts, se ud som noget der er god tid til.
- ⚠ **Fraværet er en PERIODE, ikke en dag.** Talte man dem der *begynder* i
  dag, ville en sygemelding på tre uger tælle med på dag ét og være væk på dag
  to — og bemandingen ville se hel ud mens en tredjedel var hjemme.
- ⚠ **Disponeret er PERSONER, ikke etaper.** En chauffør med tre ture er én
  disponeret. Talte vi etaper, kunne tallet overstige antallet af ansatte — og
  det står ved siden af "aktive medarbejdere", hvor det læses som en andel.
- ⚠ **`driftPrKmOere` er en SATS, ikke en måling,** og derfor er
  `omkostningPrKmOere` stadig null selv om feltet står på hver eneste bil.
  Lagde vi satserne sammen, kunne tallet **aldrig afvige fra budgettet, fordi
  det ER budgettet.**
- ⚠ **Nedetid kræver en varighed.** `paaVaerksted / aktive` ville være et
  øjebliksbillede klædt ud som en periode: to biler på liften ud af elleve er
  ikke "18 % nedetid", det er 18 % *lige nu*, og tallet ville hoppe med hver
  kørsel af jobbet uden at driften havde ændret sig.

### ⚠ Og så det der gør beslutningen større end sine ni felter

Da de to domæner fik deres kilde, gik `udenKilde()` fra **17 til 0**.

**Efterslæbet så dermed lukket ud — og kun ni af de sytten var besvaret.** De
otte andre flyttede bare ind i `flaadetal()` og `bemandingstal()`, hvor de står
som null med hver sin grund.

⚠ **Et efterslæb der bliver mindre af at et null flytter sig, er ikke blevet
mindre.** README kaldte `udenKilde()` *"optællingen"* — det var den aldrig:
på sit højeste rummede den 17, mens det færdige objekt havde **45**. Resten
stod null inde i regnestykkerne, og de tæller lige så meget for den der venter
på tallet.

Optællingen ligger derfor nu på det `beregnKpi()` faktisk returnerer.
Beslutning 68 gjorde tallet afledt; denne her gjorde det til det **rigtige**
tal. De hører sammen: et tal med én kilde er ikke nok, hvis kilden måler det
forkerte.

### Hvad der bevidst IKKE blev gjort

⚠ **`bemanding.ledig` er ikke fjernet, selv om den skal væk.** Den er præcis
`planlagt − disponeret` — CLAUDE.md navngiver netop dette felt som fejlen ved
et gemt afledt tal. Men `bemanding.ledig` er en **widget i kataloget**, og
`valideLayout()` afviser ukendte nøgler: fjernes feltet uden at gemte forsider
ryddes, får hver bruger der har widgeten *"Ukendte widgets: bemanding.ledig"*
næste gang han gemmer sin forside. **Det er en migrering, og den bygges ikke
halvt** — se punktet i README.

### ⚠ Og præmissen er nu en forudsætning, ikke en antagelse

Beslutning 19's første sætning bærer nu ni nøgletal. Holder den op med at være
sand — får én kunde både gods og bus — er tallene forkerte i begge divisioner
på én gang, og der findes ingen prøve der kan opdage det, fordi det er en
kendsgerning om kundernes forretning og ikke om koden.

Kunden har selv peget på den anden vej: **bus bør være et modul, ikke en
division.** En abonnent har alligevel kun de moduler han betaler for, og
division og modul er dermed den samme akse målt to gange. Sprængradius er
målt: **711 linjer i 95 src-filer**, 178 i `functions/`, 317 i prøverne og 55 i
reglerne — plus at `kpi/` **er stiformet efter division**. Det er ikke én
etape, og det er sin egen beslutning.

## 70. Gods/Bus var ikke en akse — den var modulerne, målt to gange

Beslutning 9 gav platformen en Gods/Bus-vælger. Beslutning 15 gjorde division
til et **påkrævet felt** på syv noder. Beslutning 19 forbød det på stamdata.
Beslutning 44 lagde `kpi/` i en sti formet efter den. Fire beslutninger,
1260 linjer, og et felt i hver transaktion.

Kunden sagde det på én linje: *"En abonnent har jo alligevel kun de moduler han
vil betale for."* Division og modul er den **samme akse målt to gange**.

### Det aksen selv fortalte, i fire år

Hvert af de her fund stod i koden, hver især begrundet og rimeligt. Sammen er
de den samme sætning fire gange.

| Hvad der stod | Hvad det betød |
|---|---|
| **141 af 158** `useListe`-kaldsteder sendte `division: "alle"` | filteret var **slået fra 89 %** af de steder det gjaldt |
| `udenDivision: true` på hele Fleet-modulet i `nav.js` | et **helt modul** kunne ikke bære aksen |
| `divisionsfilter()`s vigtigste led: *"en post UDEN division hører til BEGGE"* | svaret man giver **når aksen ikke passer på dataene** |
| `demo-kpi.js` havde ens tal under gods og bus for flåde, bemanding og facility — med en **kontrol der vogtede at de var ens** | en opdeling der ikke delte, med en prøve der passede på at den ikke gjorde |
| Beslutning 19's første sætning: *"ingen abonnent har både gods og bus"* | der var **aldrig** noget at dele op |

⚠ **En undtagelse der bliver nødvendig for et helt modul, er ikke en
undtagelse — det er en oplysning om at reglen er forkert.** `udenDivision` var
det første sted maskineriet gav efter, og det gav efter fordi beslutning 19
havde forbudt feltet på Fleets egne noder. Aksen kunne altså ikke bære det
modul den skulle dele.

### Tre etaper, fordi regel og data skal flytte sammen

**1 — læsesiden.** Vælgeren, filteret, tilstanden. Rører hverken regler eller
data; fuldt reversibelt. `FleetContext` beholdt værdien som en **konstant**,
fordi feltet stadig var påkrævet i de udrullede regler: en skærm der oprettede
en booking uden det, ville være blevet afvist.

**2 og 3 — stien, reglen og dataene, samlet.** De kunne ikke skilles ad:

- ⚠ `kpi/<division>/…` blev matchet af et **wildcard** `$division`. Læste
  klienten et niveau højere uden at reglen fulgte med, ville "current" have
  matchet `$division`, domænet have matchet `$snapshot`, og `.read` på
  `$domaene` **aldrig være nået**. Det ville ikke have været en anden sti; det
  ville have været en anden regel.
- ⚠ Regnede vi ét sæt tal mens posterne stadig bar feltet, ville
  `division: "gods"` have **filtreret de 16 bus-indkøb væk** — og tallet ville
  se rigtigt ud.

At der ingen kunder er i drift, gjorde etape 3 til en **oprydning** frem for en
migrering: 154 poster og fire gamle `kpi`-grene, ryddet i én `update()`,
efter reglerne var udrullet og verificeret med `regler:tjek`.

### ⚠ Feltet er FORBUDT, ikke fjernet

Alle 18 `division`-felter i regelfilen står som `".validate": false`.

**En manglende regel ville TILLADE feltet** — RTDB afviser kun det en
`.validate` siger nej til. Slettede vi linjen, kunne division skrives igen, og
aksen ville vende tilbage **som data**, uden at nogen havde besluttet det og
uden at noget fejlede. Det er beslutning 19's egen begrundelse, nu gældende
overalt: *"Et felt der må stå der uden at betyde noget, bliver tastet — og
derefter læst af nogen."*

### ⚠ Og så det der kostede mest at opdage

**Et felt der fjernes, kan være det eneste der holder noden oppe.**

`kunder` og `etaper` havde `.validate: "newData.hasChildren(['division'])"` —
og det var nodens **eneste** krav. Da feltet gik, forsvandt al validering med
det, og en kunde blev gyldig som et **tomt objekt**.

Det blev målt, ikke gættet: prøven *"en pris på en kunde der ikke findes,
afvises"* faldt. Den hvilede på at kaskaden ned i `satser/` havde noget at
fejle på — og en pris kunne nu hænge på et kundeId der var tastet forkert.
Begge noder har nu et rigtigt krav (`navn` og `bookingId`), hvilket filens
egne noter i forvejen efterlyste: *"NODEN VALIDEREDE KUN division."*

⚠ **Og en blind strimling tog de NEGATIVE prøver med.** Scriptet der fjernede
`division: "gods"` ud af fixtures, fjernede det også i de assertions der skulle
**afvise** det — så `assertFails` skrev en gyldig post og fejlede. Otte prøver
så ud til at være i stykker, mens reglen virkede. **Et regex der rydder data,
kan ikke se forskel på et eksempel og et modeksempel.**

⚠ **Og et loft kan blive for lavt uden at nogen ændrer et tal.** `demo-kpi`'s
flådetal var **gods**-halvdelen; da de to grene blev til én, blev de pludselig
et loft for hele rosteren — som har 12 biler til service inden 30 dage mod
gods-grenens 9. Antallene er lagt sammen; **procenterne og satserne er ikke**:
3,8 % og 2,4 % giver ikke 6,2 %, for et forholdstal skal vægtes.

### Hvad der IKKE skete

⚠ **`bus` blev ikke et modul.** Navnet er hverken taget eller bygget —
kundens ord var at *hvis* programmet skal kunne bus, kopieres gods til et
selvstændigt modul. Det er sin egen beslutning, og den træffes den dag der er
en buskunde. Indtil da er der ingen halvt bygget bus-vej at snuble over.

⚠ **Beslutning 9, 15 og 44 er ikke slettet fra listen.** De var rigtige da de
blev truffet, og rækken der siger hvorfor de ikke er det længere, er den eneste
måde den næste kan se hvad der gik galt uden dem.

## 71. Husets navngivne fejl lå der stadig — og migreringen der skulle koste, fandtes ikke

`bemanding.ledig` var **eksemplet**. Ni steder i koden henviser til den som
*den* kendte fejl — `facility.js`, `reolplads.js`, `transportlabel.js`,
`unitbooking.js` (to steder), `warehouse.js` (fire steder) — alle med samme
sætning: *"et gemt afledt tal driver fra sit grundlag."*

Og feltet lå der stadig. Den var `planlagt − disponeret`, gemt i `kpi/`.

### ⚠ Prisen for at fjerne den var ikke det den så ud som

Beslutning 69 lod feltet blive med denne begrundelse:

> *"`bemanding.ledig` er en WIDGET i kataloget, og `valideLayout()` afviser
> ukendte nøgler — fjernes feltet uden at gemte forsider ryddes, får hver
> bruger 'Ukendte widgets' næste gang han gemmer."*

**Det var rigtigt om mekanismen og forkert om strengen.** Widget-nøglen hedder
`ledigKapacitet`, ikke `bemanding.ledig` — feltnavnet står kun i widgetens
`felt`. Og kataloget i `dashboards.js` kunne **i forvejen** pege på en
`afledt:` i stedet for et `felt:`; mekanismen fandtes, brugt af
`kapacitetsgrad`.

⚠ **Migreringen var altså aldrig prisen. Prisen var at læse hvad der faktisk
stod.** Widgeten hedder det samme, gemte forsider er urørte, og feltet er ude.

### Det ene opslag

`kortTal()` i `dashboards.js` kendte allerede forskellen på et felt og en
afledning — *"ét opslag for begge slags tal, så skærmen ikke skal kende
forskellen"*. Men `Dashboard.jsx` slog widgets op med `kpiVaerdi(kpi, w.felt)`
**direkte**, uden om det. En widget med `afledt` ville have slået op på
`undefined` og tegnet en streg: **et tal der findes, vist som et der ikke gør.**

Begge går nu gennem `kortTal()`. Og en prøve kræver at hver widget har
**præcis én** af de to: to kilder til ét tal er fejlen igen, ingen af dem er en
streg for evigt.

### ⚠ Og så fandt etapen en fejl den ikke ledte efter

`Bemanding.jsx` regnede kapacitetsgraden selv:

```js
const kapacitet = (k.bemanding.disponeret / k.bemanding.planlagt) * 100;
```

Råt. `48 / null` er **Infinity**, `null / 58` er **0** — og 0 % kapacitet
ligner en måling af en flåde der står stille. Gaten i `pct()` nås aldrig, fordi
tallet er blevet rigtigt på vejen.

`kapacitetsgrad()` i `dashboards.js` har haft gaten hele tiden, plus et
`p === 0`-led. **To skærme, samme tal, to regnestykker — og den ene var
forkert.** Det er 84-mod-83, og det stod midt i den fil hvis egen note
forklarer hvorfor `ledig` var en fejl.

### ⚠ Gaten havde ingen prøve

Efterprøvningen: jeg fjernede `Number.isFinite`-leddet fra `ledig()` og kørte
suiten. **Ingen prøve faldt.**

Det er samme fund som ved divisionsfilteret i beslutning 70 — den regel
CLAUDE.md fremhæver som den vigtigste, uden en eneste prøve i hele sin levetid.
En gate uden en prøve er en kommentar. `test/dashboards.test.mjs` dækker den
nu, efterprøvet ved at fjerne gaten igen.

### Hvad tallet siger i dag

`null`. `planlagt` har ingen kilde — der findes ingen vagtplan (beslutning 69)
— og "ledig kapacitet" uden at vide hvor mange der var på vagt, er et gæt.
Skærmen skriver `—`, og det er det rigtige svar.

⚠ **Feltet er FJERNET, ikke sat til null.** Et `ledig: null` ville betyde "vi
prøvede og kunne ikke", og feltet ville stå i noden som et ubesvaret spørgsmål.
Det er ikke ubesvaret — det hører ikke hjemme. Efterslæbet gik 45 → 44, og det
er den ene af de to måder tallet må falde på: et felt får en kilde, eller et
felt viser sig ikke at være et felt.

## 72. En kunde med syv moduler og nul rækker — og beskeden der sagde noget forkert

`nordvest` (Nordvest Transport ApS, CVR 38472911) stod med syv moduler og
**tre noder**: `_findes`, `moduler`, `virksomhed`. Ingen medarbejdere, ingen
enheder, ingen opgaver. Man kunne hverken se om tallene passer eller hvordan
designet ser ud med indhold i.

### ⚠ Og skærmen sagde noget der ikke var sandt længere

> *"Tallene beregnes af en aggregering der endnu ikke er bygget — se
> KPI-efterslæbet i README."*

Aggregeringen **er** bygget: `kpiaggregering` kører hver nat og `beregnKpi()`
regner 44 felters værd. Beskeden stod på den skærm en ny kunde ser **først**,
og den fortalte ham at systemet manglede noget der fandtes.

Den siger nu at tallene beregnes **hver nat** af de data der står i basen — og
den siger stadig hvorfor det ikke er nul: *"0 aktive enheder ville være en
påstand om at virksomheden ingen har."*

⚠ **Første udgave skrev "0 aktive køretøjer", og `test/navne.test.mjs` fangede
det med det samme.** Fleets ting er en **enhed**; ordet blev skiftet 37 steder,
og en ny streng må ikke lægge det tilbage. Prøven virkede.

### Én vej ind, ikke to

Provisioneren kunne det hele — den var bare bundet til `demo`. Den tager nu
`--tenant=<id>`, og to ting er anderledes for en kundes tenant:

⚠ **Der oprettes ingen brugere.** DEV-kontiene har kendte adgangskoder fra
`.env.local` og findes for at prøve claims-kæden i en browser. Oprettet i en
kundes tenant ville kunden have syv konti han ikke kender — med fulde perms.

⚠ **Seedet følger kundens moduler**, og mappingen **læses ud af regelfilen**.
Reglens `.read` bærer allerede klausulen `moduler').child('<modul>')`; en liste
i scriptet ville være den samme kendsgerning to steder, og den ene ville drive
— nøjagtig den fejl beslutning 70 fjernede en hel akse for.

⚠ **Og et seed må ikke oprette en tenant.** `kundeopret` skriver også posten i
`udbyder/kunder`, som natjobbet henter sin tenantliste fra. En tenant oprettet
af et seed ville få data og **aldrig** få nøgletal — og det ville ligne en fejl
i aggregeringen.

### ⚠ En afledt post arver ikke sit modulfilter af sig selv

Første kørsel mod `nordvest` så rigtig ud og var det ikke. Målt bagefter:

- **13 reservationer med `kilde.type: "booking"`** — på etaper der ikke var
  seedet, fordi kunden ikke har Booking-modulet. **Tretten enheder så OPTAGET
  ud af en tur ingen kunne slå op.**
- **En bookingtæller på 318** hos en kunde uden bookinger. Hans første booking
  ville hedde `BKG-2026-00319`, som om der lå tre hundrede før den.

Begge blev bygget af `DEMO_ETAPER` og `DEMO_BOOKINGER` **uden om** filteret,
fordi de er *afledte* poster og ikke SEED-rækker. Filteret sad på tabellen; de
her to sad ved siden af den.

### ⚠ Hullet fra beslutning 70, fundet af et seed og ikke af en prøve

Seedet fejlede med:

> `set failed: value argument contains undefined in property 'tenants.nordvest.indkoeb.il-h-DIESEL-B7-11.division'`

Beslutning 70 fjernede `division` fra **valideringen** og fra **dataene** — men
**elleve skrivestier satte det stadig**: `booking.js`, `fakturering.js`,
`grundlag.js`, `leverandoerer.js`, `omkostninger.js` (tre steder),
`opgaveplan.js` (to), `Planlaegdialog.jsx`, `Servicedialog.jsx`,
`Afregning.jsx` og `indkoeb/Oversigt.jsx`.

⚠ **Det er CLAUDE.md's advarsel spejlvendt.** Reglen er at en klientvalidering
skal stå i reglerne; her var det omvendt — en regel der afviser noget klienten
stadig skriver. Resultatet er det samme: de to er uenige, og serveren vinder i
tavshed. Brugeren ville have fået `permission-denied` på en formular der ser
rigtig ud.

`omkostninger.js` var værst: `division: l.division || "faelles"` satte feltet
**ubetinget**, tre steder — så hver eneste skrivning ville være blevet afvist.

### Tallene passer

Ni nøgletal regnet efter mod rådataene i `nordvest`: flåde (aktive, på
værksted, ude af drift, service inden 30), bemanding (medarbejdere, fravær i
dag, kompetencer), facility (aktiver) og opgaver (åbne). **Ni af ni stemmer.**

Og rådataene hænger sammen: 16 enheder (11 aktive, 2 på værksted, 1 ude af
drift, 1 solgt, 1 skrottet), 35 medarbejdere (32 aktive, 2 på orlov, 1
fratrådt), 27 opgaver hvoraf 23 er åbne, 0 uden estimat — og én udløbet
kompetence, som blokerer en disponering.

## 73. Ti skærme så i stykker ud af én manglende node — og fire af dem havde deres data i behold

Kunden meldte: *"Jeg kan intet se på dashboard. På planning er der også tomt.
På disponering er der tomt. Workforce er også hel tom. Der mangler nøgletal til
Kompetencer, Indberetninger, servicekalenderen, Klima & Energi, og på Procure
alle tre undermenuer."*

Ti skærme. **Én årsag:** `kpi`-noden var tom.

⚠ **Og den var tom fordi jeg havde tømt den.** Beslutning 70's dataoprydning
slettede de gamle `kpi/gods`- og `kpi/bus`-grene for **begge** tenants, og jeg
genskabte kun den ene. En oprydning der rammer bredere end den etape der
udløste den, er ikke færdig når prøverne er grønne.

### ⚠ Rapporten delte sig præcis på en linje i koden

| Kunden sagde | Skærme | Hvad de gjorde |
|---|---|---|
| *"tomt"* | Dashboard, Workforce, Planning, Disponering | `if (!k) return` — blankede **før** de tegnede noget |
| *"mangler nøgletal"* | Kompetencer, Indberetninger, Servicekalender, Klima, Procure ×3 | tegnede deres lister, viste `—` i tallene |

Den anden gruppe opførte sig rigtigt. Den første skjulte data der fandtes:
Workforce har **35 medarbejdere** i basen, Planning og Disponering **syv
opslag hver**, Kunder sit kartotek. Alle fire returnerede før første tabel.

### ⚠ Kriteriet fandtes i forvejen — det var anvendt forkert

`datatilstand.js` skrev det selv, ved siden af `blokerer()`:

> *"Skellet er ikke 'hvilke skærme er vigtige', men: har skærmen noget under
> nøgletallene som den læser DIREKTE fra basen? Har den det — en tabel man kan
> oprette i — må den ikke blokere."*

Og listede så **seks** skærme som undtagelser. Målt:

| Skærm | `useListe`-kald | Må den blokere? |
|---|---|---|
| Dashboard | **0** | ja |
| Økonomi | **0** | ja |
| Kunder | 1 | **nej** |
| Bemanding | 1 | **nej** |
| Booking-oversigten | 6 | **nej** |
| Disponering | 7 | **nej** |

**Reglen var rigtig og anvendt forkert på fire af seks.** Det er den værste
slags fejl at få øje på: den ser begrundet ud, for begrundelsen står der.
Prøven regner derfor kriteriet **ud af skærmene selv** frem for at holde en
liste ved lige.

### Én ændring bar de fire

`useKpi` satte `null` når noden var tom. En skærm der læser `k.bemanding.
disponeret`, kaster på det — derfor `if (!k) return`. Nu sætter den
`medFuldForm({})`: hvert domæne med `null`-felter.

Så skriver `num()` `INTET` (—) i hvert tal, `<Datatilstand>` siger ÉN gang
hvorfor, og tabellerne nedenunder tegnes. Skellet er ikke væk — det er flyttet
derhen hvor det hører: i `tilstand`, ikke i om objektet findes.

⚠ **Men en AFVISNING giver stadig `null`.** *Ingen tal oven på en
permission-denied* er beslutning 26, og et skelet ville være den samme fejl i
tal-form: en afvist læsning ville komme til at ligne et tomt datasæt.

### ⚠ Og beskeden på den skærm en ny kunde ser først

> *"Tallene beregnes af en aggregering der endnu ikke er bygget."*

Den er bygget. Se beslutning 72.

## 74. En selvkontrol der skulle advare om et forkert tal, gjorde Planning til en hvid side

Kunden meldte: *"Planning er helt blank side."* Ikke tom — **blank**. Det er et
nedbrud, ikke en tilstand.

Konsollen sagde det på én linje:

> `TypeError: Cannot read properties of undefined (reading 'oekonomi')`
> `at demo-oekonomi.js:101`

### Hvad der var sket

`demo-oekonomi.js` havde en selvkontrol der løb over `["gods", "bus"]` og slog
op i `DEMO_KPI[division].oekonomi`. Beslutning 70 fjernede aksen og gjorde
sættet fladt — så opslaget gav `undefined`, og `.oekonomi` på det kastede.

⚠ **Kontrollen kører på MODULNIVEAU.** Undtagelsen skete altså mens modulet
blev indlæst, ikke når kontrollen fandt noget galt. **Hver skærm der importerer
`omkostningsserie()` blev en hvid side.**

### ⚠ En kontrol der skal advare, må aldrig kunne fejle hårdere end det den advarer om

Kontrollen fandtes for at fange en drift mellem to demo-sæt — et problem der
viser **et forkert tal på en skærm**. Prisen for at have den blev **en app der
ikke starter**.

Det er ikke en detalje ved netop den kontrol. Der var **23** af dem i
demo-filerne, og **19 stod uden noget værn**. Enhver af dem kunne gøre det
samme, den dag et datasæt ændrede form.

`selvkontrol(navn, fn)` i `src/fleet/selvkontrol.js` er nu den ene vej: den
kører kun i DEV, den fanger, og den **advarer om sig selv**. Efterprøvet ved at
lægge en `null.kaster()` ind i en kontrol — modulet indlæses stadig.

⚠ **Og den advarer, den tier ikke.** Et tavst `catch` ville gøre en kontrol der
er holdt op med at virke, til en kontrol ingen savner — samme fejl som en lint
der springer noget over: **den siger ikke nej, den siger ingenting.**

### ⚠ Fejlen kom fra et sted prøverne ikke kigger

2335 prøver var grønne. Ingen af dem indlæser `demo-oekonomi.js` i et
DEV-miljø, for `import.meta.env?.DEV` er falsk under node — så kontrollen kørte
aldrig i prøverne og kunne ikke kaste dér.

**Det er værd at kende formen på:** kode der kun kører i DEV, prøves ikke af en
suite der kører i node. Prøven i `demo-kilder.test.mjs` kan derfor ikke køre
kontrollerne; den kan kun kræve at de går gennem `selvkontrol()`. Det er den
rigtige slags prøve for det her — den prøver **vejen**, ikke resultatet.

### Tre døde kontroller vendt om

`demo-bookinger.js`, `demo-dashboard.js` og `demo-kunder.js` advarede om at en
post **manglede** `division`. Feltet er forbudt siden 70, så de kunne aldrig
fejle — og heller aldrig sige noget. De advarer nu om det modsatte: bærer en
demopost feltet, ville reglen afvise skrivningen, og det skal ses her frem for
som en `permission-denied` på en formular.

### Og en tekst der pegede på en knap der ikke findes

Planning skrev *"Periode og **afdeling** vælges i topbaren"*. Afdelingsvælgeren
blev fjernet i beslutning 70. Nu står der kun perioden.

## 75. Faldet fra beslutning 70, gennemgået frem for afventet

Fjernelsen af divisionsaksen havde nu produceret fejl **tre gange**: elleve
skrivestier der stadig satte feltet (72), `demo-indkoeb`'s `undefined` i et
seed (72), og nedbruddet i `demo-oekonomi` der gjorde Planning til en hvid side
(74). Tre gange er et mønster, ikke uheld — så resten blev gennemgået frem for
at vente på den fjerde.

### ⚠ En påkrævet vælger til et felt reglerne afviser

`Planlaegdialog.jsx` tegnede stadig en **`kraevet`** "Division"-vælger med tre
valgmuligheder. Hverken valideringen eller skrivningen kendte feltet længere —
så brugeren skulle udfylde noget der ingen steder blev læst, og som ville have
fået skrivningen afvist hvis det var.

**En formular er det sted en beslutning bliver til noget nogen taster.** Et
felt der overlever en fjernelse dér, er dyrere end et der overlever i en
kommentar.

### ⚠ Fire selvkontroller: to advarede FALSK, to var tavst døde

Da `selvkontrol()` (74) holdt op med at lade dem kaste, kom det frem hvad de
faktisk gjorde:

| Fil | Hvad den gjorde | Hvorfor |
|---|---|---|
| `demo-personale` | advarede **falsk**, to gange pr. indlæsning | `inden30 !== undefined` er altid sandt |
| `demo-fravaer` | advarede **falsk** ved hvert fravær | `gab` blev 0 af to `undefined` |
| `demo-bemanding` | **tavst død** | `if (!forventet) continue` sprang over |
| `demo-kunder` | **tavst død** | filtrerede på et felt der ikke findes |

Dertil `demo-etaper`, som advarede **otte gange** om at etaper *manglede*
`division` — et felt der er forbudt.

⚠ **En falsk advarsel er dyrere end en manglende.** Konsollen havde 24
advarsler, hvoraf de fleste var forkerte; efter gennemgangen 11, som alle siger
noget. **Støj lærer folk at lade være med at læse — og så forsvinder de
rigtige fund i mængden.**

### ⚠ En kontrol der krævede et felt der er valgfrit

`demo-facility` advarede fem gange pr. indlæsning om at et servicebesøg *"peger
på ukendt lokation undefined"*. Et facility-besøg rammer **enten** et aktiv
**eller** en lokation — fem af seks peger på en port eller et fryseanlæg, som
selv har en adresse. Linjen lige over havde sit `b.aktivId &&`; den her
manglede det. Den har advaret falsk hele tiden.

### Demo-tallene var stadig gods-halvdelen

Ligesom flåden i 70: `bemanding`, `indkoeb` og `kunder` bar gods-grenens tal,
og de blev pludselig et loft for det SAMLEDE demo-sæt. Lagt sammen.

⚠ **Men ikke `underbemandede`.** Den er **afledt** — summen af (planlagt −
disponeret) pr. dag — og et afledt tal regnes af det samlede grundlag, ikke som
en sum af to delsummer. 6 + 2 gav 8; den samlede plan giver **7**.
Selvkontrollen fangede det. Det er samme skel som i 70, hvor antallene blev
lagt sammen og procenterne ikke.

### ⚠ Og en genvej der beholdt den gamle FORM, arvede den gamle fejl

Første rettelse af `demo-kunder` satte `const div = "alle"` for at ændre mindst
muligt — og læste så `DEMO_KPI["alle"]`, som er `undefined`. Loftet blev 0, og
kontrollen advarede falsk videre. **At beholde formen for at holde ændringen
lille er præcis dét der bærer fejlen med over.**

### Hvad der står tilbage, og er ægte

Efter gennemgangen advarer konsollen om ting der faktisk er noget: en etape der
er disponeret på en bil på værksted, ingen booking der afventer koordinator med
et forslag, to indberetninger uden post i sensitive-noden, og en
zonetemperatur der ikke kan regnes. **Alle sammen har været usynlige** — enten
fordi kontrollen var død, eller fordi den druknede i falske.

## 76. En disponent kunne aldrig sende et forslag — og det virkede i demo

De fire ægte fund fra beslutning 75's oprydning skulle rettes. Tre af dem var
kontroller der kiggede forkert. Den fjerde førte til noget andet.

### ⚠ Overgangen der var lukket i produktion

`kanSkifteEtape()` talte forslagene sådan:

```js
if (o.kraeverForslag && !(post.forslag?.length > 0)) …
```

Forslagene er **nøglet på deres eget id** i noden (beslutning 58). `.length`
på et nøglet objekt er `undefined`, og `undefined > 0` er falsk. **En
disponent med tre forslag på etapen fik *"Der skal være mindst ét forslag."***

Tre overgange var dermed lukkede: *Send forslag*, *Foreslå matchet tur* og
*Send nye forslag*.

⚠ **Og det virkede i demo.** Demo-sættet bærer forslagene som en **array**,
hvor `.length` giver det rigtige tal. Fejlen var usynlig præcis dér hvor man
leder — på den skærm man åbner først, med de data man har ved hånden.

⚠ **Den ramte serveren.** `etapeskift` kalder den SAMME funktion på det den
læser af noden. Skærmen og serveren var enige; begge tog fejl. Det er den
sjældne fejl som beslutning 15's princip — én funktion, begge sider — ikke
beskytter mod: enighed er ikke rigtighed.

⚠ **Og fælden stod skrevet ned.** Beslutning 58, ordret:

> *"Og forslagene er NØGLET på deres eget id — de er ikke en array. … Brug
> `forslagListe()`; den er det ene sted formen oversættes."*

Sætningen stod der. Koden gjorde noget andet. **En regel man har skrevet ned,
er ikke en regel man har håndhævet** — og det er hele grunden til at prøven i
`test/forslagform.test.mjs` forbyder **mønstret** og ikke bare retter de fem
forekomster.

### De tre kontroller der kiggede forkert

- ⚠ **`demo-bookinger` spurgte om en BOOKING med et `forslag`.** Beslutning 40
  flyttede forslagene til etapen; ingen booking har båret feltet siden. Den
  advarede ved hver indlæsning om noget der var i orden — og den rigtige
  kontrol stod tyve linjer længere oppe. **En kontrol der overlever en
  modelændring, bliver en løgn.**
- ⚠ **`demo-facility` kaldte `zonePar()` uden argumenter.** Funktionen har
  defaults, så listen blev tom, gennemsnittet `null`, og
  `Math.abs(null − 16.9)` er 16,9. Med `demoZonePar()` er tallet **præcis
  16,90**: rekonstruktionen holdt hele tiden.
- ⚠ **`demo-indberetninger` manglede to tomme poster.** Findes
  `sensitive/`-noden kun når der ER noget at skjule, kan man læse af
  **hængelåsen** at der skete en skade — uden at have adgang. Derfor har hver
  indberetning en post, også de tomme.

### Og et fund der ikke var en kontrolfejl

`et-006` stod **reserveret** på Lastbil 106 — status `vaerksted`, med en
igangværende værkstedsopgave. `tjekDisponering()` ville have afvist den, så
demo-sættet viste data der ikke kunne opstå. Flyttet til kt-104, som er fri og
kan bære lasten (44 m³ / 9.200 kg mod 48 / 12.000).

### ⚠ Og prøven råbte først ad den rigtige kode

Første udgave af `forslagform.test.mjs` forbød `forslag.length` og pegede på
`Forslag.jsx`, hvor `const forslag = aktiveForslag(etape)` er en **rigtig
array**. Mønstret rammer nu feltadgang — `.forslag.length` — og ikke et
variabelnavn.

**En prøve der råber ad det korrekte, bliver slået fra.** Og så er vagten væk
uden at nogen har besluttet det.

## 77. Statusfarverne stod under AA på hver eneste skærm

Beslutning 47 satte metoden: **mål skærmen, bedøm den ikke.** Den fandt dengang
en fejl der allerede stod der — `--bc-muted` på 4,3:1 — *"fordi nogen for
første gang regnede efter."* Nu er der data på skærmene, og målingen blev kørt
på **hvert tokenpar der faktisk bruges sammen**.

Otte par lå under kravet. Seks af dem er de tre statusfarver.

| Par | Før | Krav | Efter |
|---|---|---|---|
| grøn på kort | 3,23:1 | 4,5 | **4,66:1** |
| grøn i sin pille | 3,18:1 | 4,5 | **4,59:1** |
| gul på kort | 3,20:1 | 4,5 | **4,63:1** |
| gul i sin pille | 3,11:1 | 4,5 | **4,50:1** |
| rød på kort | 4,05:1 | 4,5 | **5,11:1** |
| rød i sin pille | 3,58:1 | 4,5 | **4,52:1** |

⚠ **Det er ikke pynt — det er ORDENE.** `.fc-pill-ok` sætter statusfarven som
`color`, ikke som en prik: "Udført", "Forsinket", "Afventer", "Afvist" ER
farven. Det er den tekst en disponent scanner ned gennem en tabel med
syvogtyve rækker, og den har stået under AA hele tiden.

| Token | Før | Efter | Lys |
|---|---|---|---|
| `--bc-ok` | `#1f9d55` | `#197f45` | 81 % |
| `--bc-warn` | `#c77700` | `#a16000` | 81 % |
| `--bc-block` | `#d64545` | `#ba3c3c` | 87 % |

⚠ **KULØREN ER BEVARET, KUN LYSET ER SKRUET NED.** Forholdet mellem kanalerne
er uændret; en farve der skifter tone for at nå et tal, er en anden farve. Og
værdien er den **mindste** der når kravet mod BEGGE flader — kortet og pillen —
fundet ved at prøve trin for trin frem for at vælge noget der så rigtigt ud.

### ⚠ Ikonerne i deres cirkler er en ANDEN grænse

`.fc-tone-ikon-N` er en cirkel med et ikon. Et ikon er et **ikke-tekstligt**
element, og kravet er 3:1 (WCAG 1.4.11), ikke 4,5.

| | Før | Efter |
|---|---|---|
| ikon 2 (orange) | 2,59:1 | **3,01:1** |
| ikon 3 (gul) | **1,80:1** | **3,04:1** |

De øvrige fire lå over i forvejen. Gul på 1,80:1 var den værste måling i hele
paletten — et ikon man dårligt kunne se på sin egen baggrund.

⚠ **Og de rører IKKE graferne.** `--fc-ikon-*` er *"en TREDJE palet, og med
vilje adskilt fra `--fc-serie-*`"* — det stod i filen i forvejen, og det er
grunden til at mørkningen kan gøres uden at en kurve skifter farve.

### ⚠ Rangbadgen kunne ikke reddes ved at flytte et token

`.fc-rang` er et tal i en farvet cirkel — hvid tekst på ikonfarven:

| | Hvid tekst | Mørk tekst |
|---|---|---|
| rang 1 (rød) | 3,65:1 | 2,96:1 |
| rang 2 (orange) | 2,96:1 | 3,66:1 |
| rang 3 (gul) | **2,00:1** | 5,41:1 |

**Ingen af de to tekstfarver klarer alle tre.** Gul kan ikke bære hvid tekst,
og rød kan ikke bære mørk. At mørkne ikonpaletten til 4,5:1 ville løse det —
men gul ville gå fra `#eda100` til `#8e6100`, altså brun, på hvert eneste
KPI-kort. **En rettelse der ændrer alle skærme for to skærmes skyld, er ikke
en rettelse.**

Badgen bruger i stedet den BLØDE flade — samme mønster som pillerne — med
almindelig brødtekst: **9,2–9,7:1**. Rangfarven bliver stående som fyld, og
fladen er stadig synlig mod kortet (1,11–1,17:1, samme orden som kortet mod
siden på 1,14).

⚠ **Og farven bar aldrig informationen alene.** Tallet i cirklen siger 1, 2, 3.
Farven forstærker; den forklarer ikke.

## 78. Procures plancher viser en proces der ikke fandtes

Fem plancher for Procure, og afstanden er ikke visuel. Femtrinsoverskriften på
overbliksplanchen siger det selv — **Behov → Bestilling → Godkendelse →
Faktura → Afstemning** — og målt mod regelfilen fandtes **trin 1–3 ikke som
noget som helst**.

| Planchen kræver | Node |
|---|---|
| Indkøbsbehov (indmeldt fra snedkeri, lager, kontor) | — |
| Indkøbsordre med nummer | — |
| Godkendelsesregler (beløbsgrænse, godkender) | — |
| Kontantkøb med kvittering | — |
| Varer, indkøb, fakturaer, leverandører | ✅ |

⚠ **`indkoeb`-noden er LINJER DER ALLEREDE ER KØBT** — en registrering bagud.
Hele plancherne handler om det der sker *før* pengene er brugt.

### ⚠ Varelageret er vores eget, og det var jeg ved at få galt fat i

Jeg foreslog at fjerne "Varelager" fra Procures menu, fordi `varer`-noden
tilhører `warehouse`-modulet og ville stå tom for en Procure-kunde. Kunden
rettede: **Warehouses varer er KUNDERNES gods (3PL), Procures varelager er
vores eget.** Koden sagde det i forvejen, i `Varer.jsx`:

> *"⚠ VAREN ER KUNDENS. Det er 3PL: vi opbevarer andres gods … Derfor er
> `kundeId` påkrævet."*

Alle seks demo-varer bærer et `kundeId`. **To forskellige ting, og
navnesammenfaldet var mit, ikke systemets.** Procures varelager får sin egen
node, `forbrugsvarer`, med beholdningen afledt af bevægelser som i beslutning
39 — ikke et tal nogen skriver i hånden.

### Hvad etape 1 lagde

`indkoebsbehov` og `indkoebsordrer`, begge `.write: false`.

⚠ **Det er vejen der er lukket, ikke retten.** Casehandler, disponent og admin
HAR `indkoeb.skriv`. Men et behov der bliver til en ordre, ændrer **to poster**
— behovet får sin ordrereference, ordren sin linje — og de skal skrives
atomisk eller slet ikke. Kunne en klient skrive den ene halvdel, ville et behov
kunne stå som "bestilt" uden en ordre der findes. Samme ordning som `opgaver`
(45), `kasseudlaan` (37) og `enheder` (39).

Nummerserien er `BST-ÅÅÅÅ-NNNNN` på `countere/indkoebsordre/<år>` — **tælleren,
ikke en optælling** (beslutning 8).

### ⚠ Reglerne kunne slet ikke indlæses, og emulatoren sagde det straks

Første udkast skrev `newData.val() === newData.val().toInt()` for "hele øre".
RTDB har ingen `toInt`:

> `firebase.rules.json:2045:92: No such method/property 'toInt'.`

**Hele filen kunne ikke indlæses.** Det er nøjagtig den fejl der engang
overlevede gennemlæsning og flere redigeringer i månedsvis, fordi ingen kørte
reglerne — og den blev fanget i første kørsel, fordi prøven er obligatorisk.
Husets egen form er `% 1 === 0`, og den stod 27 steder i forvejen.

### ⚠ Og seks prøver målte ingenting mens de så grundige ud

Jeg skrev prøver der skulle vise at `.validate` afviser en post uden `vare`.
De brugte `withSecurityRulesDisabled` for at komme uden om `.write: false` —
men den slår **alle** regler fra, også `.validate`. Posten blev taget imod, og
prøven var rød af den forkerte grund.

CLAUDE.md havde skrevet det ned om `opgaver` i forvejen:

> *"Skriv ikke en regelprøve der 'afviser' en opgave — den ville være grøn
> fordi skrivningen er lukket, ikke fordi posten var forkert."*

**På en node med `.write: false` kan en regelprøve kun måle at vejen er
lukket.** Formen hører i en ren funktion: `valideBehov()` og `valideOrdre()` i
`fleet/procure.js`, prøvet i `test/procure.test.mjs` — samme forhold som
`opgaveMangler()` har til `opgaver`.

### To ting der er skrevet ind fra tidligere fejl

⚠ **`linjeListe()` findes fordi `forslagListe()` gjorde.** Linjerne er nøglet
på deres eget id, og `.length` på et nøglet objekt er `undefined`. Det kostede
tre lukkede overgange i beslutning 76, og fælden er den samme her.

⚠ **`behovTilLinje()` gætter ikke et antal.** Mangler behovet et, kaster den
frem for at sætte 1 — en bestilling på "1 stk." fordi ingen skrev noget, er et
tal nogen kommer til at stole på, og det bliver købt. Samme holdning som
`reservationFraOpgave()` har til en opgave uden estimat.

⚠ **Og summen regnes hos forbrugeren.** Et gemt totalbeløb driver fra sine
linjer første gang nogen retter et antal — `bemanding.ledig` igen, denne gang
med penge på.

### Det der ikke bygges, og som siger det selv

Efter kundens svar: **e-mailen sendes ikke** (udkast med kopiknap; ordren
markeres sendt når et menneske har sendt den), **der uploades ingen filer**
(knapperne står deaktiverede med begrundelsen på skærmen), og **behovsindmelding
bygges responsivt i webappen** frem for at vente på en mobilapp.

## 79. Serveren skrev stadig et felt reglerne forbyder — og ingenting sagde fra

På vej ind i Procures etape 2 faldt blikket på `opgaveplanlaeg`, som satte
`division: kortStreng(d.division, 20)`. Feltet blev forbudt i beslutning 70.

⚠ **Og det er den farligste udgave af fejlen.** Admin-SDK'et går uden om ALLE
regler — også `.validate`. En klient der skriver et forbudt felt, får en
`permission-denied` og opdager det med det samme. **En Cloud Function får
ingenting**; feltet lander i noden i tavshed.

Fire funktioner gjorde det: `bookingopret`, `opgaveplanlaeg`,
`facilityplanlaeg` og `grundlagskriv` — den sidste **ubetinget**, med
`kortStreng(d.division, 10) || "faelles"`. Hver eneste grundlagsskrivning
lagde altså feltet ind igen.

Dertil stod `"division"` på `LOGBARE_FELTER` — en allowliste der tillader
noget der ikke kan skrives.

### Og de sidste tre læsere i skærmene

- `Disponering.jsx` tegnede **`<MiniLinje label="Division" vaerdi={post.division} />`**
  — en etiket med en tom værdi, hvilket ligner et felt der bare ikke er
  udfyldt.
- `LiveKort.jsx` skrev **"Ture i gods"** som korttitel, af en konstant og ikke
  af et valg.
- `Planlaegdialog.jsx` foreslog stadig divisionen fra shellen.

⚠ **Alle tre læste `FleetContext`'s `const division = "gods"`** — konstanten
jeg lod stå i beslutning 70's etape 1, fordi feltet dengang var *påkrævet* i de
udrullede regler. Etape 3 fjernede kravet, og konstanten blev stående. **En
værdi ingen læser, er en akse der ligger og venter.**

### ⚠ Prøven beskrev et mellemstadie og sagde ikke hvornår det var ovre

`division-fjernet.test.mjs` krævede at konstanten fandtes, med noten *"men kun
indtil etape 3"*. Etape 3 kørte. Kommentaren blev ikke læst, og **prøven stod
grøn om noget der var færdigt** — den holdt aktivt liv i resten.

En prøve der beskriver et midlertidigt trin, skal selv kunne se at trinnet er
ovre. Den her kræver nu det modsatte.

### ⚠ Og min egen prøve faldt på sin egen forklaring

Vagten mod `"division"` i `LOGBARE_FELTER` læste filen som tekst uden at
strimle kommentarer — og noten der forklarer at feltet er *fjernet*,
indeholder ordet. **Femte gang den fælde dukker op i dette repo.** En prøve der
læser kilde som tekst, skal fjerne kommentarerne først; ellers er den enten
grøn af sin egen dokumentation eller rød af den.

## 80. Behovet melder sig ind — Procures trin 1

Etape 2 af beslutning 78: `behovskriv`, indbakken grupperet på kilde, og
indmeldingen ved siden af.

⚠ **Indmeldingen er responsiv, ikke en app.** Planchen viser den som en
mobilskærm; kunden valgte web frem for at vente på mobilappen. Én rute, én
kode, og en medarbejder åbner den på telefonen uden at installere noget.
Layoutet er `auto-fit` med et minimum — samme greb som `.fc-kpis` og
`.fc-feltraekke` — så spalterne klapper sammen af sig selv uden en media query.

### ⚠ Antallet er valgfrit, og det er en beslutning

Den der melder ind, ved hvad han mangler — ikke hvor mange der er i en pakke.
Et krævet felt ville blive udfyldt med et gæt af den der ikke ved det, **og
gættet ville gå med i en bestilling**. Mangler det, sætter den der bestiller
det.

Det trækker tre ting med sig:

- Skærmen skriver **`—`** for et ubesvaret antal, ikke `0`. Et nul er en
  påstand om at der ikke skal bestilles noget.
- Feltet sendes som `undefined`, ikke som `Number("")`. **`Number("") === 0`**
  — en tom rubrik ville blive til et svar.
- `behovTilLinje()` **kaster** frem for at gætte 1, når behovet lægges i en
  bestilling. Samme holdning som `reservationFraOpgave()` har til en opgave
  uden estimat.

### ⚠ Et afvist behov slettes ikke

Det får en tilstand og en grund. Uden grunden er afvisningen en tavshed, og
**den samme mangel bliver meldt ind igen i næste uge**. Funktionen kræver
begrundelsen, og et behov der allerede er bestilt, kan ikke afvises — så skal
ordren annulleres i stedet.

### Det linten fandt, som ville have ramt hver kommende node

`demo-kilder.test.mjs` henfører et demo-sæt til sin node ud fra navnet, og tog
det **første** match: `DEMO_INDKOEBSBEHOV` begynder med `DEMO_INDKOEB`, så
behovene blev henført til `indkoeb` og meldt som "to datasæt for én node".

⚠ **Det ramte i samme øjeblik noden blev født**, og det ville ramme igen for
enhver node hvis navn begynder som en anden — `indkoebsordrer` er den næste.
Det **længste** match vinder nu.

### ⚠ Og skærmen viste nul, hvilket var rigtigt

Første kørsel i browseren: 0 behov, selv om demo-sættet har ti. Noden fandtes
og var tom, og `useListe(node, { demo })` bruger kun sættet når der **ingen
database er** — beslutning 56 og 64. Skærmen gjorde det rigtige; noden manglede
et seed. En seedet node må aldrig vise noget andet end sig selv.

### Det der ikke er bygget, siger det selv

Planchens billede- og taleoptagelse står som en sætning på skærmen frem for
som deaktiverede knapper: *"De kræver fillagring med sine egne adgangsregler
pr. virksomhed, og det er sin egen opgave."* En attrap der ligner en knap,
læres at blive trykket på.


## 81. Bestillingen samles — Procures trin 2

Etape 3 af beslutning 78: kladden med det automatiske leverandørforslag,
`ordreskriv`, og e-mailudkastet. Planche 3.

### ⚠ Forslaget er et OPSLAG, ikke en anbefaling

`foreslaaLeverandoer()` svarer på ét spørgsmål: **hvem har leveret præcis den
vare før, og hvad kostede den.** Findes svaret ikke, er svaret `null` — ikke
den billigste i kartoteket, og ikke den man handlede med sidst. Planchen har en
egen tilstand for det, **"Leverandør mangler"**, og den tilstand findes fordi
svaret findes.

Et forslag der faldt tilbage på "den vi handler mest med", ville anbefale nogen
at købe hos et firma der aldrig har haft varen — og det ville se *klogere* ud
end det tomme svar. Samme holdning som momssatsen der ikke gættes: et system
der gætter rigtigt ni gange ud af ti, lærer brugeren at stole på det tiende.

⚠ **Senest, ikke billigst.** En pris fra 2019 er ikke et tilbud; den er et
historisk tal, og en bestilling lagt på den bliver afvist af leverandøren eller
faktureret til noget andet. Kun den seneste pris kan bruges til at anslå et
beløb i dag — og derfor hedder tallet på skærmen **"anslået"**, med noten om at
linjer uden pris ikke tæller med.

⚠ **Varenummeret slår navnet, og forslaget siger hvilket.** "Motorolie 5W-30"
og "Motorolie 5W30" er én vare for et menneske og to for en maskine — Bil 104
med to nummerplader, denne gang på en oliedunk. Men et navnetræf **kan** være
to forskellige varer med samme ord, så grundlaget står på skærmen: *"Match på
varenummer"* mod *"Match på varenavn — kontrollér at det er den rigtige vare"*.
To lige stærke formuleringer ville gøre den svage til den stærke.

### ⚠ Én ordre pr. leverandør

Man sender ikke én bestilling til tre firmaer, og et bestillingsnummer der
dækkede flere, kunne ikke bruges som reference på nogen af fakturaerne.
`grupperPaaLeverandoer()` samler derfor kladden i én blok pr. leverandør, og de
uden forslag under `null`.

⚠ **De uden forslag skjules ikke.** En mangel der forsvinder fordi den er en
mangel, får den der bestiller til at tro at alt er dækket. De står samlet, med
begrundelsen på skærmen og uden en afkrydsningsboks der ikke kan bruges.

### ⚠ Serveren bygger linjen af behovet

Klienten sender `behovId`, et antal og en pris — **ikke varen**. Kom varen
udefra, kunne ordren bede om noget andet end behovet sagde, og sporet tilbage
ville pege på et løfte der ikke blev holdt. Sporet går begge veje: behovet får
sit `ordreId`, linjen sit `behovId`.

⚠ **Og ordren og behovenes tilstand skrives i ÉN `update()`.** Delt i to kunne
halvdelen lande — et behov der stod som bestilt uden en ordre, ville være en
vare ingen havde købt og ingen kunne bestille igen. Samme regel som
`enheder`/`beholdning` (39) og `opgaver`/`reservationer` (45).

⚠ **Et behov kan kun bestilles én gang.** `ordreskriv` afviser et behov der
allerede er `bestilt` eller `afvist` med `failed-precondition` — og skærmen
tager dem ud af kladden, så knappen ikke er en fælde. To bestillinger lagt kort
efter hinanden kunne ellers begge tage det samme behov med.

### ⚠ Udkastet sendes ikke, og skærmen siger det

Kundens valg. Mail **ud** af systemet er beslutning 20's fase 1, og der er
hverken afsendelsesvej, afsenderadresse pr. virksomhed eller et spor af hvad
der blev sendt til hvem. Udkastet bygges, vises og kan kopieres; ordren
markeres **sendt** af et menneske der har sendt den.

En knap der så ud som "send", men lagde mailen i en kø der ikke findes, ville
være værre end ingen knap — og en tilstand systemet *påstod*, ville gøre sporet
forkert. Derfor er en ny ordre altid `kladde`.

⚠ **Nummeret står i emnet, og teksten beder om det på fakturaen.** Det er hele
grunden til at nummeret findes: uden det kan matchet i trin 5 kun gættes ud fra
beløb og leverandør, og to bestillinger til samme firma i samme uge ser så ens
ud. En linje uden pris skriver "—" og ikke 0 — en bestilling der beder om noget
til nul kroner, er en aftale ingen har indgået.

### Beløbet regnes, det gemmes ikke

Ordren bærer **intet** `sum`-felt. Et gemt totalbeløb driver fra sine linjer
første gang nogen retter et antal — det er `bemanding.ledig` (71), og her er
tallet penge. `ordreSumOere()` regner hos forbrugeren, og en linje uden pris
tæller ikke som nul.

### ⚠ Linjerne er nøglet, ikke en array

RTDB har ingen arrays. `linjeListe()` er det ene sted formen oversættes — som
`forslagListe()` — og demo-sættet bærer den form **noden** har. Et demo-sæt med
en array ville lade skærmen virke i demo og fejle mod noden: præcis den
forskel der lukkede tre etapeovergange i produktion mens demo stod grønt
(beslutning 76).

### Det prøverne fandt

**1. Demo-sættet kunne ikke vise sin egen funktion.** Ingen af de ti åbne behov
matchede en eneste indkøbslinje, så hver eneste linje viste "Leverandør
mangler" — den halvdel af skærmen der slår op i `indkoeb`, tegnede aldrig et
forslag. Et demo-sæt hvor en funktion kun kan ses *fejle*, er ikke et demo-sæt.
To behov er tilføjet: ét der matcher på varenummer, ét der kun matcher på navn,
og det sidste **uden antal**, så tilstanden *"Sæt et antal"* også kan ses.

**2. To prøver læste ind i naboen.** `⚠ ORDRE OG BEHOV SKRIVES I ÉN update()`
tog 8000 tegn efter `export const ordreskriv` og talte to `.update(` — den ene
lå i den **næste** funktion. En prøve der læser ind i naboen, siger noget om
naboen. Den bruger nu funktionens faktiske krop.

**3. En prøve fejlede på en tilføjelse.** `behov.test.mjs` krævede
`import { valideBehov } from "./delt/procure.js";` **ord for ord**, og faldt da
`valideOrdre` blev lagt ved siden af — med beskeden *"behovskriv har sin egen
kopi af formen"*, hvilket ikke var sandt. En prøve der fejler på noget andet
end det den vogter, lærer den næste at rette **prøven** i stedet for koden.
Samme rettelse i `seed-tenant.test.mjs`, hvor
`harModulet("bookinger") ? DEMO_BOOKINGER : []` stod ord for ord.

**4. Nummerserien havde ingen tæller.** Demo-ordrerne bærer BST-2026-00040 og
opefter; uden en efterudfyldning ville den første rigtige bestilling hedde
BST-2026-00001 — en serie der begynder forfra **under** numre der allerede
findes. Det var nøjagtig den fejl blokken i provisioneren blev skrevet for at
lukke for bookingerne, og den nærliggende rettelse var at kopiere blokken.
Serierne står nu som **data** i én tabel, med ét regnestykke og ét modulfilter.

**5. Filen har CRLF.** Et flerlinjet anker skrevet med `\n` matcher ingenting i
`provisioner-dev.mjs`, og fejlen ser ud som *"koden er lavet om"* frem for
*"ankeret er forkert"*. Dertil: `$` efterfulgt af en backtick er et
**specialtegn** i `String.replace`'s strengform, og en regex-hale som
`(\d{5})$` + backtick sprængte filen midt i en template literal.

**6. Den samme advarsel to gange på én række.** "Leverandør mangler" stod både
i forslagskolonnen og i statuskolonnen, og to ens pille på én linje læses som
to forskellige problemer. Forslagskolonnen siger nu **hvorfor**: *"Ingen
tidligere leverance"*.


## 82. Godkendelsen — Procures trin 3

Etape 4 af beslutning 78: beløbsgrænsen, køen og `indkoeb.godkend`. Planche 2.

### ⚠ Reglen kan slås fra, og det er en funktion

Planchen har et helt kort til det: *"Godkendelsesfunktionen kan slås fra, hvis
din virksomhed er lille, eller hvis samme person både bestiller og godkender."*
Kunden bad udtrykkeligt om det.

Det er forskellen på en **regel** og en **spærring**: reglen er virksomhedens
egen politik, ikke systemets. Derfor kan den redigeres — og derfor står
standarden på **fra**: en tenant uden noden opfører sig præcis som i dag.
Faldt standarden tilbage på "godkendelse påkrævet", ville hver eksisterende
kunde få en kø han ikke havde bedt om, første gang funktionen blev udrullet.
Samme greb som `permsForTenant()` bruger på `roller/`.

### ⚠ Men den der rammer loftet, må ikke kunne hæve det

`godkendelsesregelskriv` kræver **`brugere.skriv`**, ikke `indkoeb.skriv`.
Med bestillerens egen permission kunne enhver sætte sin grænse til hundrede
millioner og godkende sig selv ud af hele planche 2 — og et loft der kan hæves
af den der rammer det, er ikke et loft. Det er præcis den skelnen beslutning
24 rettede 23 på; her koster den penge frem for et auditspor.

Af samme grund læser `ordrestatus` reglerne af **noden**, aldrig af kaldet.
Kom grænsen ind udefra, var permissionstjekket omgået i ét hop.

### ⚠ At godkende er en anden handling end at bestille

`indkoeb.godkend` findes nu, og den er ikke `indkoeb.skriv`. Den der bestiller
varen, og den der siger god for regningen, er i en virksomhed med adskilte
funktioner **bevidst to personer**; delte de én permission, kunne den samme
medarbejder bestille hos sin svoger og godkende sit eget køb.

Det var **planlagt, ikke glemt**: `leverandoerer.js` bar den som
`PERM_GODKEND_MIDLERTIDIG = "indkoeb.skriv"` med noten om at den skal skilles
ud "når reglerne åbnes". Ordrernes godkendelse er nu åbnet, og det er den
ombæring. Koordinatoren får den — samme snit som `grundlag.godkend`.

⚠ **Aliasset er ikke beholdt.** En funktion der findes, bliver kaldt, og et
navn der stadig hedder MIDLERTIDIG, fortæller den næste at spørgsmålet er
åbent. Det er besvaret.

### ⚠ Nul er ikke "slået fra"

En **aktiv** regel uden grænse er ugyldig, og indtil den er rettet **spærrer
den alt**. Fejler lukket, som permission-strengen gør.

Faldt den tilbage på 0, skulle alt godkendes; på uendelig skulle intet. De to
er hinandens modsætning, og begge ser ud som "reglen er slået til". At slå
reglen fra er **kontakten**, ikke et tomt felt — og derfor skriver skærmen
`null` og ikke `0` for et tømt beløbsfelt: `Number("")` er 0.

Tilsvarende er en aktiv regel uden godkender ugyldig: ordren ville stå i køen
uden at nogen var udpeget. Synligt for alle, ansvar for ingen.

### ⚠ Godkendt automatisk er ikke godkendt

Er beløbet under grænsen, er der ingen at vente på — en kø med en post ingen
skal røre, lærer folk at ignorere køen. `ordreOpdatering()` sender derfor
"send til godkendelse" direkte videre til `godkendt`.

⚠ **Men den får intet `godkendtAf`.** Et uid dér ville påstå at en person
kiggede. `godkendtAutomatisk: true` siger hvad der skete, og **flaget er
vigtigere end tidspunktet**: uden det kan man ikke se forskel på et indkøb
nogen sagde god for, og et der bare var lille nok. Samme forhold som
`afkortet` har til reservationen (beslutning 50).

⚠ **Og grænsen læses som "overstiger", ikke "mindst".** Planchens egen knap
siger *"når et indkøb overstiger det angivne beløb"* — præcis 5.000 kr. er
altså ikke over. De to sætninger på planchen er uenige om det nøjagtige beløb
(*"under"* mod *"overstiger"*), og forskellen er ét indkøb ud af hundrede.
Knappens tekst vinder, og valget har en prøve.

### ⚠ Godkenderen må godkende sine egne — og det markeres

Reglen navngiver **én** person. Krævede vi derudover to par øjne, kunne hans
egne ordrer **aldrig** godkendes: en blindgyde i data, ikke en kontrol.
Planchen svarer selv — kortet *"Kan slås fra"* siger at funktionen bør slås
fra netop når samme person bestiller og godkender.

Så det er tilladt, og `selvgodkendt: true` sættes af serveren. **En
fire-øjne-regel der ikke kan opfyldes, er værre end en selvgodkendelse man kan
se.** Skærmen siger det både før (i Anmoder-kolonnen) og efter.

⚠ **Til gengæld kan ingen ANDEN afgøre ordren** — heller ikke en admin. Havde
enhver med permissionen kunnet godkende, var godkenderfeltet på planchen pynt.

### Fakturagodkendelsen er gemt, ikke håndhævet

Planchens anden kontakt hører til `fakturaer/`, som er `.write: false` og ikke
har nogen funktion der skriver den — det er trin 4 og hører i sin egen etape.
Feltet står i noden (så formen er kendt, jf. reglen om `demo-kpi.js`), men
**kontakten er låst med sin begrundelse på skærmen**. En regel der kan slås til
uden at nogen håndhæver den, er et løfte systemet ikke holder. Samme mønster
som filuploaden på Indkøbsbehov.

### Det prøverne og browseren fandt

**1. To felter landede i den forkerte node.** `godkendtAutomatisk` og
`selvgodkendt` skulle på `indkoebsordrer` og havnede på `grundlag`:
`String.replace` tager det **første** træf, og `godkendtAf`/`godkendtMs` står i
begge noder — fakturagrundlaget godkendes også. **Et anker der findes to
steder, er ikke et anker.** Reglerne sagde ingenting, fordi et ekstra tilladt
boolsk felt ikke brænder noget af; prøven fangede det. Patchen tæller nu
træffene og nægter at skrive, hvis der er mere end ét.

**2. En ventende demo-ordre var under grænsen.** `ord-006` stod på 1.420 kr. i
en kø hvis grænse er 5.000 — en tilstand **serveren ikke kan producere**,
fordi den ville være godkendt automatisk. Et demo-sæt der viser sådan en
række, får skærmen til at se rigtig ud på præcis den måde ingen opdager:
knapperne virker, tallene passer, og rækken burde ikke være der.
Selvkontrollen måler det nu.

**3. Brugerindekset skrev sig aldrig i DEV.** `tenants/<id>/brugere/<uid>` er
det eneste sted en klient kan slå et navn op på et uid, og den blev kun skrevet
af `opretbruger` — som DEV-konti aldrig går igennem. Noden var **tom**:
godkender-vælgeren havde ingen at vælge, og Anmoder-kolonnen viste rå uid'er.

**4. Demo-sæt kan ikke kende et Firebase-uid.** `DEMO_GODKENDELSESREGLER`
udpegede `"uid-mikkel"`. Seedet råt udpeger reglen en godkender der ikke kan
logge ind: køen står der, knappen er grå for **alle**, og grunden peger på et
spøgelse. Provisioneringen oversætter nu pladsholdere til rigtige konti — via
en tabel **pladsholder → ROLLE**, ikke → uid, fordi rollen er dét demoen mener,
og uid'et skifter hver gang basen bygges op igen. 22 referencer omskrives.

**5. En prøve holdt en mangel fast.** `indkoeb.test.mjs` havde
`assert.equal(PERM_GODKEND_MIDLERTIDIG, "indkoeb.skriv")` — altså en prøve der
ville blive **rød den dag manglen blev rettet**. Samme fælde som beslutning 79
fandt i `division-fjernet`. Den vogter nu det der faktisk gælder: at
godkendelsen ikke deler permission med bestillingen.

**6. `usePost` kunne ikke læse en node der selv er en post.** Den byggede
`${node}/${id}`, og `godkendelsesregler` har ingen forælder at gå gennem.
Første forsøg pakkede demo-sættet ind i `{ godkendelsesregler: … }` for at
komme forbi opslaget — og **det skjulte faldbakken for `demo-i-skaerm`-linten**,
som tæller `demo: DEMO_X` og læste indpakningen som direkte brug. Hooket tager
nu et bart sæt når noden selv er posten.

**7. ASCII i en brugervendt tekst.** Menupunkternes `under` sagde *"saet
virksomhedens beloebsgraense"*. Kommentarer i denne base skrives med ae/oe/aa;
en tekst der **vises**, gør ikke.


## 83. Fakturaen finder sin bestilling — Procures trin 4

Etape 5 af beslutning 78: matchet, godkendelsen og kontantkøbet. Planche 1.

### ⚠ Scoren er en påstand om sikkerhed, og den skal kunne efterprøves

Planchen skriver "92 % match". Et sådant tal må ikke være en fornemmelse med to
decimaler. `matchForslag()` regner det af **navngivne signaler** og returnerer
hvilke der slog til, så skærmen kan skrive dem under scoren — den der
bekræfter, skal kunne se om de 92 % kommer af et bestillingsnummer eller af at
beløbet tilfældigvis lignede.

⚠ **Kun et bestillingsnummer giver 100.** Alt andet er en slutning: samme
leverandør, nogenlunde samme beløb, nogenlunde samme uge. Loftet på 95 er dét
der holder de to fra hinanden på en skærm hvor tallet står ved siden af en knap
der hedder *Bekræft*. Det er hele grunden til at `mailudkast()` beder om
nummeret på fakturaen (beslutning 81).

⚠ **Og scoren gemmes ikke.** Den regnes af de to poster hos forbrugeren; et
gemt tal driver fra sit grundlag første gang nogen retter et beløb — det er
`bemanding.ledig` (71), og her ville det være et sikkerhedstal der så præcist
ud uden at være det. Det der gemmes, er **afgørelsen**: hvilken ordre, hvem,
hvornår.

⚠ **En anden leverandørs ordre foreslås aldrig.** Circle K sender ikke en
regning for Dækteams bestilling. Uden det led gav beløb + dato alene 55 %, og
et forslag på over halvdelen ser rigtigt nok ud til at nogen bekræfter det for
at komme videre. Det blev målt på et opdigtet sæt. Undtagelsen er nummeret: står
vores bestillingsnummer på fakturaen, er en forkert leverandør en **fejl vi skal
se**, ikke en grund til at skjule sammenhængen.

### ⚠ Planchen sammenlignede inkl. moms med ekskl. moms

Detaljeruden skriver fakturaen som *"23.031 kr. inkl. moms"* og den matchede
ordre som *"23.031 kr. ekskl. moms"*. Det er **det samme tal med to mærkater** —
de kan ikke begge være rigtige, og den ene er 25 % ved siden af.

Sammenlignede vi sådan, ville hver eneste beløbssammenligning være systematisk
forkert og se ud som om leverandøren havde overfaktureret. Alt der måles her, er
ekskl. moms i begge ender; momsen står som sit eget felt, som beslutning 2
kræver.

⚠ **Og afvigelsen er `null` når et af tallene mangler — ikke 0.** Et nul betyder
"de er ens", hvilket er noget helt andet end "vi ved det ikke".

### ⚠ Et kontantkøb er en indkøbslinje — ikke en node ved siden af

Etapeplanen sagde *"node `kontantkoeb`"*. Det blev omgjort, og grunden er den
samme som alle de andre gange: `indkoeb` **er** det vi har købt, en registrering
bagud, og et kontant køb er nøjagtig det — bare betalt på en anden måde.

En egen node ville være den samme kendsgerning to steder. Leverandørernes
nøgletal, varelageret, Overblik og hvert eneste beløb i modulet skulle huske at
lægge de to sammen, og **de ville ikke**. Det er `bemanding.ledig`, de to
demo-sæt og Bil 104's to nummerplader om igen, denne gang med penge.

⚠ **Betalingsformen er et FELT, ikke en status.** `fakturastatus` svarer på "har
vi fået regningen"; `betalingsform` på "hvordan betalte vi". Lagde vi "kontant"
ind i `fakturastatus`, ville købet stå som en linje der mangler sin faktura for
evigt — og listen over manglende bilag kunne aldrig tømmes. Derfor får en
kontantlinje **ingen** `fakturastatus` overhovedet.

⚠ **Og `udlaegAf` er ikke `oprettetAf`.** En kontorassistent taster en kollegas
bon; pengene skal til kollegaen. Samme skel som uid mod personId.

⚠ **Kvitteringen kræves ikke, den TÆLLES.** Der er ingen fillagring (kundens
valg), så et krav ville være uopfyldeligt — og et krav man ikke kan opfylde,
bliver til et felt man skriver "ja" i. `kontantUdenBilag()` gør hullet synligt
i stedet. Fjern ikke tællingen når fillagringen kommer; så bliver den først
rigtig. Samme greb som `kpi.opgaver.udenTidsregistrering` (beslutning 50).

### To link-felter, og de svarer på hver sit spørgsmål

`indkoebId` er hvilken **linje** fakturaen dækker — hvad vi modtog. `ordreId` er
hvilken **bestilling** den betaler — hvad vi bad om. Det er dét planchen matcher
på. De to kan drive fra hinanden, og gør de det, er det en oplysning: en faktura
der dækker en linje vi aldrig bestilte, skal ses.

⚠ **Én faktura pr. bestilling.** To fakturaer på samme ordre er enten en dublet
eller en delfakturering, og begge dele skal et menneske tage stilling til.
Reglen kan ikke håndhæve det — en `.validate` ser én post ad gangen — så leddet
står i `fakturamatch`, med `orderByChild("ordreId")`. Og feltet er **indekseret**:
uden indekset fejler forespørgslen ikke, RTDB henter hele noden ned og filtrerer
i klienten med en advarsel i konsollen. Det er præcis den fejl der stod her før,
hvor indekset pegede på `godkendelsesstatus`, et felt ingen post bar.

⚠ **"Ingen af forslagene passer" er et SVAR**, ikke en tom tilstand — og det
kræver en grund. Uden flaget står fakturaen for evigt på listen over dem der
mangler et match, og en liste der ikke kan tømmes, holder man op med at kigge
på. Uden grunden begynder den næste forfra på det samme opslag.

### Beslutning 82's anden kontakt fik sin vej ind

`fakturagodkendelse` var **gemt, ikke håndhævet**, og kontakten stod låst med sin
begrundelse. `fakturastatus` håndhæver den nu, og så ville låsen selv være
usandheden — den er væk.

⚠ **Man bogfører ikke noget der ikke er godkendt.** Planchens egen fodnote siger
det: *"Efter godkendelse bogføres og sendes til regnskabssystemet."*

⚠ **Og en bogført faktura er en endestation.** Hverken match eller godkendelse
kan ændres bagefter: posten er sendt til regnskabet, og en ændring ville gøre en
afstemning der stemte, til en der ikke gør — uden at nogen kan se hvorfor.

⚠ **Men der sendes intet til et regnskabssystem.** Bogføring sætter en tilstand.
Der er ingen integration, og en knap der påstod det, ville få nogen til at holde
op med at bogføre manuelt. Det står på skærmen.

### Det prøverne og planchen fandt

**1. Ankret fandtes to steder — igen.** `indkoebId` står i BÅDE `grundlag` og
`fakturaer`, præcis som `godkendtAf`/`godkendtMs` gjorde i beslutning 82.
Patchen tæller nu træffene og **nægter at skrive** hvis der er mere end ét; den
fejlede højlydt frem for at lægge fire felter i den forkerte node.

**2. To prøver målte formatering.** `behov.test.mjs` krævede at `valideBehov`
stod inden for **200 tegn** før `from "./delt/procure.js"` — og faldt da etape 5
lagde tre navne mere i den samme import. En prøve der måler afstand i tegn,
måler formatering, ikke det den vogter. Den tager nu importsætningen ud og læser
den. Anden gang samme prøve er faldet på en tilføjelse.

**3. En prøve holdt en lås fast der var blevet forkert.**
`godkendelse.test.mjs` krævede at fakturakontakten var **låst**. Den er
håndhævet nu, og prøven vendte med — den vogter at kontakten er bundet til
reglen, og at skærmen stadig siger at der ikke betales herfra. Tredje gang det
mønster dukker op (79, 82, 83).

**4. `fakturastatus` på en kontantlinje.** `indkoeb.test.mjs` krævede en kendt
`fakturastatus` på hver linje. Et kontantkøb har ingen, og det er pointen —
prøven **asserterer** det nu frem for at springe linjen over.

**5. Demo-sættet kunne ikke vise forskellen mellem 100 % og 83 %.** Uden et
nummertræf i sættet ville skærmens vigtigste skel — kendsgerning mod slutning —
aldrig kunne ses. `fa-9008` bærer nu et bestillingsnummer, og `ord-007` er
tilføjet så samme leverandør har både en matchet og en foreslåelig ordre.


## 84. Overblikket — Procures femte skærm, og hvad den afslørede

Etape 6 af beslutning 78, den sidste: modulets forside. Planche 5.

### Processen er en vejviser, ikke en tilstand

Planchen tegner fem nummererede trin: behov → bestilling → godkendelse →
faktura → afstemning. Det er **forløbet**, ikke hvor en bestemt post står, og
derfor er hvert trin et **link** til det sted arbejdet gøres.

Et bånd der fremhævede "det aktive trin", ville påstå at modulet har én
tilstand ad gangen. Det har fem køer der løber samtidig.

### ⚠ Fire tal regnes af listerne, det femte kan ikke regnes

De fire — åbne behov, åbne bestillinger, ventende godkendelser, fakturaer uden
match — er **afledt af lister skærmen alligevel henter**. Det er undtagelsen i
CLAUDE.md: så beregnes de hos forbrugeren og lægges ikke i `kpi/`. Et gemt tal
ville drive fra sit grundlag, og "5 afventer godkendelse" ved siden af en kø
med tre er værre end intet tal.

⚠ **Og "kræver handling" er ikke "findes".** Et afvist behov er der taget
stilling til, og et bestilt ligger på en ordre. Talte vi dem med, ville tallet
vokse med arbejde der ER gjort — og et tal der aldrig falder, holder man op med
at kigge på. Samme sted: en **åben bestilling** er *sendt, ikke modtaget*. En
kladde er aldrig sendt, og en annulleret er ikke åben.

⚠ **Det femte er `null` med en grund: ingen KILDE.** "Lav lagerbeholdning"
kræver `forbrugsvarer` — Procures **eget** varelager — og noden findes ikke.

Og den må **ikke** regnes af Warehouses `varer`/`beholdning`: dét er **kundens**
gods (3PL, `kundeId` er påkrævet dér). Regnede vi kortet af dem, ville Procure
bede os bestille noget en KUNDE mangler. Det er den samme navnekollision som
`warehouse` mod `lagre`, og her ville den koste et indkøb. Feltet står i
`kpi/` med `null` og sin begrundelse, og kortet skriver `—`. Efterslæbet gik
fra 44 til 45.

### ⚠ Planchen viste to af tallene to gange

Den har fire bundkort: "Bestillinger 12" og "Fakturaer 4" står **både** øverst
og nederst på samme skærm. To visninger af ét tal er to steder der kan nå at
blive uenige — det er beslutning 11 og 14, og det var mockuppens "8 mod 16" på
fakturaskærmen. Bunden er derfor rene **genveje uden tal**.

### ⚠ Og så viste det nye kort et nul der var løgn

Overblikket sagde **"Fakturaer uden match: 0"** mens fakturaskærmen sagde 9.

`indkoeb/Oversigt.jsx` hentede fakturaerne med `ordnPaa: "dato"`. **En faktura
har intet `dato`-felt** — den har `fakturadatoMs`, som de to andre skærme
sorterer på, og som står i `.indexOn`. RTDB fejler ikke på et ukendt felt:
tidsvinduet filtrerede på noget ingen post bærer, og **listen kom hjem tom**.

Nøgletallene på samme skærm kom fra `kpi/` og stod rigtigt imens, så der var
intet at se. Fejlen har ligget der siden skærmen blev bygget, og den blev først
synlig da et **andet** tal blev regnet af den samme liste.

⚠ **Det tavse nul var det farligste af de to tal.** "Ni uden match" er en
huskeliste; "nul uden match" er en afstemning der går op. Samme fælde som
`opgaver."dato"` og som indekset der pegede på `godkendelsesstatus`.

### ⚠ Divisionsaksen levede i skærmene — 77 steder

Beslutning 70 fjernede aksen. Beslutning 79 tog resterne i shellen, konteksten,
`useListe`, Cloud Functions, reglerne og auditlisten, og skrev en prøve der
dækker **præcis de steder**.

**Ingen af dem læser en modulskærm.** Målt her: **77 levende forekomster i 17
modulfiler** — kode, ikke kommentarer.

Den værste var ikke kosmetisk. Registreringsformularen i `indkoeb/Oversigt.jsx`
havde et **påkrævet Division-felt**, mens `indkoeb`-reglen har
`"division": { ".validate": false }`. Vælger man en værdi, **afviser serveren
skrivningen**; vælger man ingen, klager formularen. **Vejen ind var lukket i
begge retninger**, og ikke én prøve sagde noget.

Dertil i samme fil: en Division-kolonne der tegnede `undefined` på hver række,
en fodtekst der skrev "Viser 5 af 12 i **undefined**", og to leverandørfiltre
der sammenlignede `l.division === division` hvor **begge sider var
`undefined`** — de slap kun igennem fordi `undefined === undefined` er sandt.
Et filter der virker ved et tilfælde, holder op med at virke uden varsel.

⚠ **En lint der springer noget over, siger ikke nej — den siger ingenting.**
Det er samme sætning som `demo-i-skaerm.test.mjs` bærer om `bookinger`
(beslutning 56), og det er anden gang mønstret koster noget.

**Procure er ryddet — 26 forekomster — og for den mappe er tallet nu et forbud
på nul.** For resten af `src/moduler/` står et **loft på 51 der kun må gå ned**;
at rette 15 filer mere er en anden opgave end at bygge Procure færdig, og en
prøve der krævede det hele på én gang, ville blive slået fra. Listen står i
README under *Divisionsefterslæbet*, og mindst ét mere påkrævet Division-felt
venter dér (`facility/Servicedialog.jsx`).

⚠ **Og variablen hed `iDivision`.** Et navn er en påstand: "divisionens
linjer" får den næste til at tro at der ER en opdeling. Den hedder nu
`alleLinjer`, som er hvad den er.


## 85. Varelageret — fjerde gang et lagernavn skal skilles fra et andet

Procures **eget** varelager: `forbrugsvarer` og `forbrugsvarebevaegelser`. Det
er kortet "Lav lagerbeholdning" på planche 5, som stod som `null` i beslutning
84 fordi kilden ikke fandtes.

### ⚠ Hvem godset TILHØRER er hele forskellen

| Node | Hvis gods | Hvad det er |
|---|---|---|
| `varer` + `beholdning` | **Kundens** | Warehouse, 3PL. `kundeId` er PÅKRÆVET |
| `lagre` | Vores | Reservedelslageret under Fleet, med satser |
| `warehouse` | — | **Reserveret** til et kommende modul (se CLAUDE.md) |
| `forbrugsvarer` | **Vores egne** | Handsker, strækfilm, papir, filtre |

Det er ikke pedanteri. Det alternativ der lå lige for — at regne kortet af
`varer`/`beholdning` — ville få Procure til at **bede os bestille noget en
kunde mangler**. Det er den samme navnekollision som `warehouse` mod `lagre`,
og her ville den koste et indkøb.

### ⚠ Retningen kommer af arten, ikke af et fortegn

Fire arter: `modtaget`, `forbrug`, `svind`, `optaelling`. `antal` er **altid
positivt**.

`antal: -3` alene siger at beholdningen faldt med tre — ikke OM det var
forbrug, svind eller en rettelse. De tre kræver hver sin handling: forbrug er
normalt, svind skal undersøges, og en korrektion er en indrømmelse af at tallet
var forkert. Ét felt der bare hed "ændring", ville gøre dem uskelnelige
bagefter — og en formular der tillod begge fortegn, ville få nogen til at taste
minus på et forbrug og trække to gange.

⚠ **En optælling SÆTTER, den lægger ikke til.** Den bærer det **talte** antal.
Uden den art skulle den der tæller, taste "korrektion −2" og regne forskellen i
hovedet — og en fejl i det hovedregnestykke ser bagefter ud som svind.

⚠ **Og svind kræver en grund.** Et tal der forsvinder uden forklaring, bliver
ikke undersøgt, og svind er netop dét man skal undersøge. Forbrug kræver ingen:
det er hvad varen er til.

### ⚠ En negativ beholdning spærres ikke — den vises

Fristelsen er at afvise et forbrug der bringer tallet under nul. Men **det
skete jo**: nogen tog de sidste fem handsker, og tallet var forkert i forvejen.

Afviste vi bevægelsen, ville den rigtige hændelse gå tabt for at beskytte et
tal der allerede var galt — og den der står med en tom kasse, får at vide at
han tager fejl. Det rigtige svar er en **optælling**. Indtil da er minus
beviset på at der mangler en bevægelse.

Det er samme holdning som `enhedsafvigelse()` i Warehouse (beslutning 39):
**en uenighed er en manglende bevægelse, ikke et tal der skal rettes i
stilhed.**

### Rækken og tallet i én `update()` — og driften på skærmen

Bevægelsen og beholdningen bærer den samme kendsgerning, det ene som en række
og det andet som et tal. De skrives atomisk sammen eller slet ikke; deler man
skrivningen i to kald, kan halvdelen lande, og så er uenigheden vores egen.
Samme ordning som `enheder`/`beholdning` (39) og `kasseudlaan` (37).

⚠ **Men et gemt afledt tal driver** — det er `bemanding.ledig` (71). Derfor
regner `beholdningAfBevaegelser()` det forfra, og `beholdningsafvigelse()`
viser forskellen **på skærmen**. En drift der ikke kan ses, bliver ikke rettet.

⚠ **Og beholdningen tastes ikke.** `forbrugsvareskriv` rører den kun ved
oprettelse, og da til nul. Et felt en formular kunne sætte, ville være en femte
bevægelsesart ingen har besluttet — og den ville ikke stå i historikken.

### ⚠ Minimum er valgfrit, og manglen tælles

En vare uden grænse har ingen "lav"-tilstand. Sattes den til 0 som standard,
ville varen **aldrig** være lav; sattes den til et tal, havde vi opfundet en
indkøbspolitik på kundens vegne.

⚠ **Men "0 under minimum" betyder både "alt er fyldt op" og "ingen har sat en
grænse".** Derfor to felter: `lavBeholdning` og `forbrugsvarerUdenGraense`.
Samme greb som `kpi.opgaver.udenTidsregistrering` (beslutning 50) — hullet er
synligt frem for spærret.

⚠ **Og `null` skal kunne sendes.** Tom streng bliver `null` (= ingen grænse),
ikke `0`; og `undefined` betyder "rør den ikke". Uden den skelnen kunne en
grænse aldrig fjernes igen — og en grænse man ikke kan fjerne, bliver sat til
et højt tal i stedet, hvor den ligner en beslutning.

### Loopet er lukket: et lavt lager bliver til et behov

"Meld som behov" står **kun** på de lave — en knap på hver række ville gøre
indbakken til en indkøbsliste over alt vi ejer. Behovet bærer **intet antal**:
vi ved at varen er lav, ikke hvor meget der skal købes. Antallet er valgfrit på
et behov netop af den grund (beslutning 80), og et gæt — "op til minimum", "en
pakke" — ville gå med i en bestilling.

Dermed løber Procure hele vejen rundt: lager → behov → bestilling → godkendelse
→ faktura → afstemning.

### Det prøverne fandt

**1. To prøver fra beslutning 84 fyrede som aftalt.** Den ene krævede at
`lavBeholdning` var `null`; den anden krævede at `forbrugsvarer` **ikke**
fandtes, med noten *"når den gør, skal tallet regnes"*. Begge blev røde i samme
kørsel, og de pegede på hvad der skulle rettes.

⚠ **Det er sådan en prøve om et mellemstadie skal opføre sig.** Beslutning 79,
82 og 83 fandt tre der blev stående **grønne** om noget der var ovre. Den her
fejlede det sekund manglen blev lukket.

**2. Tre warehouse-prøver ankrede på hele regelfilen.** De søgte med
`regler.indexOf('"beholdning": {')` og `find(l => l.includes('"art"'))` — og
`forbrugsvarer` har også et `beholdning`-felt og en `art`-regel med
`modtaget`, tidligere i filen. Prøverne målte derfor **den forkerte node** og
sagde at warehouse-modellen var brudt.

⚠ **Et anker der findes to steder, er ikke et anker.** Tredje gang samme fælde
(82, 83, 85) — men første gang den ramte en prøve frem for et patch-script. De
afgrænser nu til nodens egen krop.

**3. Aggregeringen fik ikke sin nye node.** `beregnKpi()` regnede
`lavBeholdning`, men hverken provisioneringen eller det natlige job hentede
`forbrugsvarer`. Tallet ville være skrevet som **0** i noden mens Varelageret
regnede **4** af de samme rækker — to svar på ét spørgsmål, ét klik fra
hinanden. Tre noter i provisioneringen advarer ordret om præcis det, for
`koeretoejer`, `bookinger` og `fravaer`. Begge veje henter nu noden.

**4. Noten under kortet blev en usandhed.** Overblikkets femte kort sagde
*"varelageret er ikke bygget endnu"*. Da noden kom, fik tallet sin værdi — og
teksten stod uændret under et rigtigt tal. **En tekst der siger at noget ikke
er bygget, er den slags der overlever fordi ingen læser den igen.** En prøve
vogter den nu.

**5. Demo-sættet var uenigt med `demo-kpi.js`.** Fire varer er på eller under
deres minimum; demofilen lovede tre. Selvkontrollen fandt det, før skærmen nåede
at vise Overblikket ét tal og Varelageret et andet.


## 86. Fakturacenteret — ét sted, én sandhed

Ét fælles sted for fakturaer på tværs af Fleet, Facility og Procure, under
Økonomi & Rapporter. Tre plancher.

### ⚠ Ingen ny node — den fælles node fandtes allerede

Det første spørgsmål var om der skulle en `fakturacenter/`-node til. Svaret
stod i regelfilen, og det havde stået der længe: *"fakturaer er en af de TRE
TVETYDIGE NODER der står i basen, fordi den røres af to skærme — en klausul på
det ene modul ville spærre det andet."*

Planchen siger det samme med andre ord: **Fakturacenteret ejer fakturaen;
modulet ejer sagen.** En node ved siden af ville være den samme kendsgerning to
steder, og hver skærm skulle huske at lægge dem sammen. Det er
`bemanding.ledig`, de to demo-sæt og Bil 104 med to nummerplader.

Fakturacenteret er altså en **skærm** og et **destinationsbegreb** på den node
der er.

### ⚠ Noden er fælles — skærmen er ikke

Jeg skrev først at Økonomi & Rapporter var base og ikke et modul, og byggede
prøven på det. **Det var forkert, og det blev fanget ved at måle:** `oekonomi`
er et modul, og et **valgfrit** et — nordvest har det ikke.

Forskellen betyder noget. `fakturaer/` har ingen modulklausul, så en kunde uden
Økonomi kan stadig **se** sine fakturaer — gennem Procures egen linse. Det han
mangler, er den **tværgående** visning, og den er dét modulet sælger. Fulgte
noden modulet, ville hans Procure-skærm blive tom af at han ikke købte Økonomi.

### ⚠ `ordreId` var ét moduls svar på et fælles spørgsmål

Feltet hed `ordreId` og pegede på en indkøbsordre. Men en faktura kan høre til
en **Fleet-sag**, en **Facility-sag**, en **Procure-ordre** eller en
**lagervare** — og med et felt pr. modul ville "hvor hører den hen" være fire
steder at spørge.

Det er nu `destinationArt` + `destinationId`.

⚠ **To flade felter og ikke et objekt.** `.indexOn` kan kun pege på et
**direkte** barn, og `fakturamatch` skal kunne spørge "er den her ordre
allerede taget". Et `destination/{art,id}` ville være pænere og uindekserbart.

⚠ **Omdøbningen var billig nu og dyr senere.** Målt i den udrullede base før en
linje blev rørt: **20 fakturaer i alt**, alle seedede. Samme argument som
modulomdøbningerne — det sker før den første kunde krydser feltet af, eller
slet ikke.

⚠ **Sidegevinst:** `ordreId` betød i forvejen **to** ting i basen — en
indkøbsordre her og en **plukordre** i Warehouse. Derfor blev omdøbningen lavet
med navngivne mønstre i navngivne filer: en blind søg-og-erstat ville have
døbt plukordrerne om, og så havde tvetydigheden bare flyttet sig.

### ⚠ Der er ingen warehouse-destination, selv om planchen tegner en

Planchens femte kasse hedder *"Warehouse / øvrigt — lager, internt forbrug
m.m."*. Warehouse er 3PL: **kundens** gods, som **vi** fakturerer for. Der
kommer ingen leverandørfaktura ind på den forretning — pengene går den anden
vej. Kassen svarer altså ikke til noget indgående bilag.

Det der findes, er vores eget forbrugslager, og det hedder `forbrugsvarer`
(beslutning 85). Arten hedder derfor **`lager`**. At kalde den warehouse ville
være femte gang et lagernavn dækkede over et andet.

### Scoren, og hvad den bygger på

Samme holdning som `matchForslag()` (beslutning 83): en score er en påstand om
sikkerhed, og den skal kunne efterprøves. Signalerne står **under** tallet, så
den der godkender, kan se om de 96 % kommer af et sagsnummer eller af at
beløbet tilfældigvis lignede.

⚠ **Kun et nummer giver 100.** Alt andet er en slutning, og en slutning må ikke
se ud som en kendsgerning ved siden af en knap der hedder *Godkend match*.

⚠ **Køretøjet genkendes på kaldenavn eller nummerplade — ikke på id'et.**
Leverandøren skriver "Bil 78" eller "DE 78 901"; vores interne id har han
aldrig set.

⚠ **Og en anden leverandørs sag foreslås ikke.** Mercedes sender ikke en regning
for Crawfords portarbejde. Undtagelsen er den fysiske genkendelse: står bilen
eller anlægget på fakturaen, er en forkert leverandør en fejl vi skal **se**.

⚠ **Procure gendigtes ikke.** `matchForslag()` **er** scoringen for en
indkøbsordre — den kender bestillingsnummeret, én-faktura-pr-ordre-reglen og
beløbet ekskl. moms. Et andet regnestykke ville give Fakturacenteret og Procure
hver sit svar på ét spørgsmål, to klik fra hinanden.

### Modulerne afgør hvad der overhovedet foreslås

En kunde uden Facility ser aldrig en facility-destination: forslaget ville pege
på en node hans regler afviser, og *"kan ikke læses"* ligner *"findes ikke"*.
Modulerne læses af **noden**, ikke af kaldet — kom de fra klienten, kunne den
placere en faktura på et modul kunden ikke har.

⚠ **Fraværende node = alle moduler**, præcis som reglen læser den
(`!moduler.exists() || …`). En filterkopi der er 90 % rigtig, afviser præcis
dét reglen tillader — det er beslutning 56's fund.

⚠ **Og arten skal passe med opgavens egen art.** Fleet og Facility deler noden
`opgaver`; uden det led kunne en værkstedsopgave placeres som en facility-sag,
og modulfilteret ville være omgået i ét hop.

### At placere og at godkende er to handlinger

Placeringen kræver ingen ny permission — den registrerer hvad fakturaen hører
til. At sige god for at der skal betales, er `indkoeb.godkend` (beslutning 82),
og det ligger i `fakturastatus`. En knap der gjorde begge dele, ville lade den
der konterer, betale.

⚠ **Og "ingen destination" er et SVAR**, ikke en tom tilstand — med en grund.
Det afløser `ikkeMatchbar`: to felter for ét svar driver, og Procure-skærmen
ville læse det gamle mens Fakturacenteret skrev det nye.

### Tre linser, ét sæt

`Modulfakturaer.jsx` er **én** komponent, ikke én pr. modul. Fleet og Facility
stiller det samme spørgsmål mod den samme node med hver sin art; to kopier
ville drive. Der er ingen knapper i den: man placerer og godkender i centeret.

### Det arbejdet fandt

**1. Et filnavn er ikke en placering.** Fleet-linsen blev lagt i
`flaade/Oversigt.jsx` — som **trods navnet** er routet til Opsætning →
Enheder, altså køretøjsregistret. En liste over værkstedsfakturaer hører hvor
arbejdet er. Det blev opdaget ved at **åbne skærmen**, ikke ved at læse filen.

**2. Og så ramte ankret forkert igen.** Flytningen brugte
`lastIndexOf("</div>…")` og landede i filens **sidste** komponent — et
vedhæftningspanel — i stedet for i den eksporterede skærm. En fil med otte
komponenter har otte slutninger. Fjerde gang samme fælde i denne session (82,
83, 85, 86), og hver gang med et lidt andet ansigt.

**3. Prøven byggede på en antagelse jeg ikke havde målt.** Den krævede at
`oekonomi` **ikke** var et modul. Det er det. Havde jeg ikke kørt den, ville
skærmens egen tekst have påstået noget forkert om produktet.

---

## 87. Divisionsefterslæbet — aksen levede i skærmene, ikke i reglerne

Beslutning 70 fjernede gods/bus-aksen. 79 tog resten i shellen, konteksten,
`useListe`, Cloud Functions og auditlisten. To prøvefiler holder hver sin
ende — `test/division-fjernet.test.mjs` og `test/rules.division.test.mjs` —
og de var grønne hele vejen.

Alligevel stod der **77 levende forekomster i 17 modulfiler**, målt da
Procures overblik blev bygget (84). Procure blev ryddet dér (−26). De sidste
51 er væk nu.

### ⚠ En lint der springer noget over, siger ikke nej — den siger ingenting

Grunden til at aksen kunne overleve to beslutninger om sin egen død er banal:
**ingen af prøverne læste `src/moduler/`.** De læste shellen, konteksten,
`useListe`, regelfilen og `functions/` — præcis de steder aksen var blevet
fjernet fra, og ingen af de steder den blev brugt.

Det er samme sætning som `demo-i-skaerm.test.mjs` bærer om `bookinger`
(beslutning 56): en lint der ikke dækker et sted, giver ikke et svagt svar
dér — den giver intet svar, og en tom liste ser ud som et rent hus.

Anden gang mønstret koster noget i denne base.

### ⚠ Det var ikke kosmetik

Jeg gik ind i det med en forventning om at rette variabelnavne. Det holdt
ikke:

**1. En vej ind der var lukket i begge retninger.**
`facility/Servicedialog.jsx` havde et **påkrævet** Division-felt på en post
der skrives til `opgaver` — en node hvis regel siger
`"division": { ".validate": false }`. Vælger man en værdi, afviser serveren.
Vælger man ingen, klager formularen. **Servicebesøg kunne ikke oprettes fra
den dialog**, og det stod der uden at nogen havde skrevet det ned.

Det er nøjagtig den samme fejl Procure havde (84), i et andet modul, fundet
med den samme metode: at spørge hvad reglen siger om det felt formularen
kræver.

**2. Et kort der solgte en funktion produktet ikke har.**
`opsaetning/Generelt.jsx` — den ene skærm hvor en kunde læser hvad han har
købt — havde et nøgletalskort med teksten **"Divisioner: Gods og bus"** og et
kort der forklarede opdelingen. Ikke en variabel: en påstand, på skrift, til
kunden.

Kortet hedder nu **Moduler**, og teksten forklarer at opdelingen ER modulerne.

**3. Fire filtre der sammenlignede to `undefined`.**
`x.division === division`, hvor `division` kom fra `useFleet()` (som holdt op
med at levere den i 79) og `x.division` aldrig havde stået i noden. De slap
igennem fordi `undefined === undefined` er sandt — **filteret var en no-op der
så ud som en afgrænsning.** Havde ét eneste demo-datasæt båret feltet, ville
halvdelen af rækkerne være forsvundet fra fire skærme.

**4. `Kunder.jsx` skrev altid "aktive i alt i godsafdelingen".**
Uanset kunde, uanset tenant.

**5. En URL-parameter ingen læste.**
Værkstedskalenderen linkede til arbejdskøen med `&division=${division}` —
altså bogstaveligt `&division=undefined`. Arbejdskøen har aldrig spurgt efter
parameteren. Dertil en `division`-prop til en dialog der ikke nævner den med
ét ord. **En parameter ingen læser, er ikke en parameter; den er en påstand om
at modtageren gør noget.**

**6. To variabelnavne der løj.**
`iDivision` og `opgaverIDivision` på lister der ikke er delt op efter noget.
Et navn er en påstand om indholdet, og den her var forkert i to år.

### ⚠ Tallet er nu nul, og det er et forbud — ikke et loft

I 84 skrev jeg et loft på 51 der kun måtte gå ned. Loftet er væk; linten
læser hele `src/moduler/` og fejler på **enhver** levende forekomst.

**Én undtagelse, og den er ikke en lempelse:** en tekst der forklarer at
feltet IKKE findes. Der står syv tilbage — på Enheder, Medarbejdere, Facility,
Procure og Opsætning — og de skal blive. De er det eneste sted en læser får at
vide hvorfor der ikke er en gods/bus-vælger, og **en prøve der råber ad det
korrekte, bliver slået fra.**

Dertil en anden prøve, som er den der virkelig lukker døren: **ingen skærm må
destrukturere `division` ud af `useFleet()`.** Alle seks fund ovenfor havde
det til fælles. Konteksten holdt op med at levere feltet i 79, men
**destruktureringen fejler ikke** — den giver `undefined`, tavst, for evigt.
Det er derfor de kunne blive stående.

### Det arbejdet fandt

**1. "Moduler: 0" — tredje gang samme fælde.**
Kortet regnede `Object.keys(moduler || {}).length`, og demo-tenanten har
**ingen** `moduler`-node. Det betyder ALLE moduler, ikke ingen — reglen læser
det sådan (`!moduler.exists() || …`), `harModul()` gør det ét sted, og jeg
havde selv skrevet det ned to gange (56 og 86). Kortet sagde "0" til en kunde
der har tolv.

Det blev set **på skærmen**, ikke i koden. En optælling ved siden af
`harModul()` er en filterkopi, og en filterkopi der er 90 % rigtig, afviser
præcis dét reglen tillader.

**2. Jeg slettede for meget, og prøverne fangede det.**
Patchen der skrev den nye lint, erstattede fra blokkens start til filens
**sidste** `});`. Blokken var indsat før de eksisterende `describe`s, så alle
ti oprindelige prøver — om shellen, konteksten, `useListe`, funktionerne og
auditlisten — røg med i samme skrivning. **Et anker der spænder over "resten
af filen", er ikke et anker.** Genskabt fra `git show HEAD:`, og den nye blok
lagt sidst.

Femte gang i denne session at et anker rammer et andet sted end det jeg mente
(82, 83, 85, 86, 87). Hver gang med et lidt andet ansigt; hver gang samme
årsag — jeg beskrev et sted ved noget der ikke er entydigt.

---

## 88. Status-afsnittet — et tal ingen prøve holder, driver

README's **Status** er det afsnit dokumentet selv beder én læse efter en
pause: *"Start her."* Det stod med **957 tests** da der var 2619, og med
**27 af 30 skærme** da der var 54.

Værre: overskriften sagde 27, og tabellen to linjer under den sagde **29**. To
tal om det samme, med et blankt mellemrum imellem, uenige med hinanden — og
ingen af dem kunne se den anden.

### Ingen af dem var løgn da de blev skrevet

Det er hele pointen. 957 var rigtigt engang. 27 af 30 var rigtigt engang. De
blev forkerte af at produktet voksede: Warehouse kom med elleve skærme,
Unitbooking med fire, Procure med fire nye, og Fakturacenteret med én.

**Et tal skrevet i hånden kan kun blive forkert.** Det kan aldrig blive mere
rigtigt af sig selv.

### ⚠ Samme fejlklasse som beslutning 52

`test/dokumentation.test.mjs` findes fordi fem af tolv rækker i README's
nodetabel sagde "mangler regler" om noder der havde dem — og en af dem var
underskriftens write-once, som derfor stod som **ikke bygget** mens den i
virkeligheden var bygget og kunne omgås. Fordi rækken sagde at reglen ikke var
der, kiggede ingen på om den virkede.

Den fil vogter **tabellen**. Tallene ved siden af den var uvogtede.

### Hvad der nu måles

`test/statustal.test.mjs` læser skærmtallet ud af `nav.js` — det ene sted en
rute kan opstå — og prøvefiltallet ud af `test/`. README's tabel har én række
pr. modul, og prøven kræver at hver række, totalen **og overskriften** siger
det samme som kataloget.

| | |
|---|---|
| Skærme | **54** — 50 i menuen, 4 skjulte detaljeruter |
| Prøvefiler | **104** |

⚠ **Det samlede prøvetal står der ikke længere.** Det kan kun måles ved at
KØRE suiten, og **en prøve kan ikke tælle sig selv**. Et tal ingen prøve kan
holde, hører ikke i et dokument der bliver læst som en kendsgerning — så det
er erstattet af antallet af prøve*filer*, som kan tælles med `readdirSync`.

Det er den samme skelnen som `RETENTION_AFGJORT` gør for retention: forskellen
mellem hvad vi **ved** og hvad vi **påstår**.

### Det arbejdet fandt

**Tre lag backslash forsvandt undervejs.** Prøven blev først skrevet af et
patch-script gennem en heredoc, og hver runde spiste et lag: `\|` blev til
`\|` blev til `|`, og regexet `/^\| ([^|]+?) \|/` endte som `/^| ([^|]+?) |/`
— *"Nothing to repeat"*. Anden gang blev `/\*/g` til `/*/g`, som ikke engang
er et regex.

Rettelsen er ikke et lag mere escaping. Tabellen læses med `split("|")`, og
filen er skrevet direkte frem for genereret: **en streng fuld af escapes er
præcis den slags der overlever en kopiering forkert.** Samme lærestreg som
`` `n ``-fælden i beslutning 82 — et værktøj der næsten kan noget, koster mere
end det sparer.

---

## 89. Abonnementshistorikken — og et dokument der modsagde sig selv

`tenants/<id>/abonnementHistorik` er nu bygget: én append-only log over hvad
der blev ændret i en kundes abonnement, skrevet af `kundeopret`,
`kundemoduler`, `kundestatus` og `kundeabonnement` i **samme opdatering** som
ændringen selv.

### ⚠ Det første fund var ikke kode — det var en modsigelse

ABONNEMENT.md sagde begge dele om den samme node:

> **Afsnit 6, punkt 2:** *"`abonnementHistorik` — skrevet af `kundestatus` og
> `kundemoduler` i samme kald som auditposten. Den er værdifuld fra første dag
> og umulig at lave bagud."* … *"Punkt 2 er det eneste der bliver dyrere af at
> vente."*

> **Afsnit 7:** *"Afsnit 2 foreslog `abonnementHistorik`. Den er droppet."*

Ét dokument, to afsnit, modsat svar. Jeg læste selv afsnit 6 først og
rapporterede noden som **manglende og hastende** — og opdagede først afsnit 7
da arbejdet var i gang.

**Afsnit 7 havde ret om det den handlede om.** Den daglige måling
(`udbyder/maalinger/<kunde>/<dato>`) kom EFTER afsnit 2 blev skrevet, og den
bærer både status og modulliste. `sammenfatMaalinger()` regner `moduldage` og
`dageFaktureres` af den. **Regningen er en optælling af dage, og den optælling
findes allerede.**

En historik der også talte dage, ville være to kilder til ét tal — og så
skulle nogen afgøre hvilken der havde ret om en faktura der var sendt. Det er
`bemanding.ledig` (71) og Bil 104 med to nummerplader, med penge på.

### ⚠ Men afsnit 7 lukkede et spørgsmål den ikke havde stillet

Den skrev: *"Auditloggen beholder sin egen post: den svarer på hvem der slog
modulet fra."*

Det gør den ikke. Målt i koden:

| | Hvad auditposten faktisk bærer |
|---|---|
| `kundemoduler` | noten `moduler; fravalgt: warehouse` — **et TILVALG står der overhovedet ikke** |
| `kundeabonnement` | `rabat 1500 bps` som fri tekst. Ingen "før" |
| Alle | `note` afkortet ved 120 tegn, `LOGBARE_FELTER` filtrerer værdier væk |
| Alle | retention 24 måneder, mens bogføringspligten peger mod fem år |

En sætning der siger at et spørgsmål er dækket, er farligere end ingen
sætning: den får nogen til at lade være med at kigge. Samme fejlklasse som
README's nodetabel i beslutning 52 og Status-tallene i 88 — tre gange i denne
uge, og hver gang var det dokumentationen der løj, ikke koden.

### Hvad den så er

**Hvem, hvad, før, efter og hvorfor — aldrig et dagsantal.**

| Art | Bærer |
|---|---|
| `modul` | `modul`, `til` |
| `status` | `status`, `aarsag` (allowliste, valgfri) |
| `rabat` | `rabatBps`, `foerBps`, og `modul` når det er en modulrabat |

⚠ **`rabat` stod ikke i forslaget, og den er den vigtigste af de tre.**
`linjerForPeriode()` får ÉN `rabatBps` for hele perioden — den der står på
abonnementet når grundlaget genereres. **En rabat sat den 20. prissætter også
de nitten dage der allerede er gået**, og det sker i tavshed. Dagene kan
tælles i målingerne; rabatskiftet kan kun ses i loggen.

### ⚠ Posterne udledes af FORSKELLEN, ikke af kaldet

Ejerkonsollen sender hele modulsættet hver gang der trykkes Gem, også når
intet er ændret. Loggede vi kaldet, ville der stå en post hver gang nogen
kiggede og gemte igen — **og en log fuld af hændelser der ikke skete, kan ikke
bruges til at forklare en regning.**

`historikposter({ foer, efter })` kan ikke lyve om det: ændrede intet sig, er
listen tom, og der skrives ingenting. Et kald der slår Warehouse til og
Facility fra, giver **to** poster — det var to ting der skete.

Og en rettet årsag giver også en post, selvom statussen er den samme: sættes
en kunde på pause med `betaling` og rettes årsagen bagefter, ville en log der
kun så på statussen stå med den forkerte grund for altid.

### ⚠ Kun udbyderen læser den — og det var besluttet i forvejen

Historikken er den ene node under en tenant som **kunden ikke må læse**.
Grunden står i `abonnement.js` og er ældre end noden: om `aarsag` står der at
*"hvorfor han er lukket, hører i en samtale, ikke i en skærm."* En log kunden
kunne åbne, ville sige "Manglende betaling" på hans egen skærm.

Naboen `abonnement` **er** kundens, fordi låseskærmen skal kunne tegne status
— og den viser aldrig årsagen. Reglen har med vilje ingen abonnementsklausul:
skal ejeren forstå hvorfor en kunde blev sat på pause, er det præcis mens
kunden ER på pause.

`test/rules.abonnement.test.mjs` holder listen over regler med udbyder-claim'et
— den er nu ni lang, og hver ny er *"en udvidelse af den anden krydsning af
tenant-grænsen, og den skal besluttes, ikke opdages."*

### Vejen ind

`.write: false`, som `opgaver` (45), `kasseudlaan` (37), `enheder` (39) og
`roller` (31b). Det er vejen der er lukket, ikke retten: en append-only log en
klient kunne skrive i, kunne også **rettes** i — `.write` kaskaderer, så en
tilladelse på noden ville give hver eneste post med.

⚠ **Og `.validate`-blokken kan ikke nås af nogen.** Klienten stoppes af
`.write: false`; Admin SDK går uden om begge dele. Formen håndhæves derfor af
`valideHistorikpost()`, og reglen beskriver den. Samme arbejdsdeling som
`valideOpgaveplan()` — og en prøve holder de to allowlister ens, felt for felt,
så `$andet: false` og `HISTORIK_FELTER` ikke kan drive.

### Udgangspunktet er også en hændelse

`kundeopret` skriver kundens startmoduler og `aktiv` som poster. Skrev vi kun
ÆNDRINGER, ville loggens første post være det første fravalg, og så kunne man
ikke se hvad kunden startede med. **En log der begynder ved den anden
hændelse, kan ikke rekonstruere den første tilstand.**

For kunder oprettet før i dag findes den ikke. Målt i DEV: **én kunde i
indekset, 0 historikposter, 12 dages målinger.** Konsollen siger det på
skærmen frem for at tegne en tom liste, der ligner "der er aldrig sket noget".

### Det arbejdet fandt

**1. En rod-opdatering er et `set()` på hver af sine nøgler.**
`kundestatus` bar allerede en advarsel om `set()` mod `update()`: et `set()`
ville tørre `rabatBps`, `interval` og `startetMs` væk, og *"rabatten ville
forsvinde lydløst, og den næste faktura ville være til fuld pris."* Den samme
fælde findes én etage højere: en multi-path update med
`tenants/<id>/abonnement` som **nøgle** sætter hele noden. Felterne skrives
derfor ét ad gangen med hver sin sti.

**2. Generatoren var bygget, og jeg havde lige sagt det modsatte.**
I gennemgangen af hvad der mangler, skrev jeg at generatoren og eksporten ikke
var bygget. `grundlagopret` **er** generatoren — den fryser en periode og
afviser at overskrive. Kun eksporten mangler, og `eksporter()` kaldes stadig
ingen steder.

**3. To lag backslash forsvandt igen.** Politikken blev først skrevet gennem
en heredoc, og både `\|` og `/\*/g` blev spist. Filerne er skrevet direkte —
anden gang på to etaper, og lærestregen fra 88 står ved magt.

---

## 90. Hallen og porten er ét rum — indeslutningen

`reservationFraOpgave()` har båret sætningen siden facility-opgaverne blev
bygget:

> *"En facility-opgave binder ENTEN et anlæg ELLER et helt sted … Lukker man
> hallen, er alle porte i den også optaget."*

Datamodellen har aldrig håndhævet den. En reservation på `lokation/lok-halb`
og en på `facilityAktiv/fa-port3` er **to stier**, og `tjekLedigMod()` ser kun
én ad gangen. Et gulvarbejde i Hal B spærrede ikke porten i den, og to
håndværkere kunne bookes ind i samme rum uden at nogen kunne se det.

Hullet stod skrevet i README siden beslutning 49 — med en advarsel der viste
sig at være præcis den rigtige: *"en indeslutningsregel er sin egen
beslutning: den skal gælde begge veje, i begge funktioner, og et halvt tjek i
én af dem ville være værre end ingen."*

### Hvad der er bygget

`indeslutninger(ny, { aktiver })` i `reservations.js` svarer på **hvilke andre
stier der beskriver det samme fysiske rum**. `tjekLedigIndesluttet()` kører
`tjekLedigMod()` mod dem alle og samler svaret.

Begge er rene funktioner uden database, i en **delt** fil, så skærmen og
serveren regner med det samme.

### De tre valg der ligger i den

**1. Begge veje.** Hal → porte, og port → hal. Var den kun den ene, ville
**rækkefølgen afgøre udfaldet**: book hallen først, og porten kunne stadig
tages bagefter. Et halvt tjek er værre end ingen, fordi det ligner et helt.

**2. Ingen kaskade mellem søskende.** To porte i samme hal er uafhængige — at
servicere port 3 spærrer ikke port 5. Gjorde den det, ville ét servicebesøg
lukke et helt anlægsområde, og så ville folk holde op med at bruge lokationen
som ressource for at undgå det.

**3. Ingen reservation pr. port.** Et blok på hallen er **én** reservation; det
er KONTROLLEN der er udvidet, ikke posterne. N poster for ét arbejde ville se
ud som N bookinger på skærmen, skulle frigives hver for sig, og ville drive fra
hinanden første gang én af dem blev flyttet. Samme grund som `bemanding.ledig`
ikke gemmes (beslutning 71).

### ⚠ Konflikten siger hvor den kom fra

*"Ressourcen er optaget i perioden"* på en port der står tom, er ubrugelig —
man går hen og kigger, og porten ER tom. Hver indesluttet konflikt bærer derfor
`viaRessourceType`/`viaRessourceId`, og teksten begynder med *"Hele stedet er
optaget:"* eller *"Et anlæg på stedet er optaget:"*.

En egen konflikt bærer **ingen** `via` og ser ud præcis som før.

### ⚠ Og en overskrivning skal dække dem alle

`kanOverskrive` er kun sandt hvis hver eneste gruppe kan overskrives. Kunne man
overskrive porten men ikke hallen, ville en `tving` rydde det ene og efterlade
det andet — og arbejdet ville stå i et rum der stadig var optaget.

### Skærmen viser det serveren håndhæver

Servicekalenderen regnede hver række for sig. Med serverens nye afvisning ville
den have tilbudt et ledigt felt der blev afvist ved klik — **den værste af de
to fejl, fordi man allerede har lovet håndværkeren en tid.**

Hallens blok tegnes nu som en **skygge** på de rækker den lukker, og skyggerne
ligger i den SAMME `blokke`-liste som `ledigeVinduer()` regner de ledige felter
af. Ét regnestykke, to visninger — som i Disponering.

⚠ **Skyggen er en blok, ikke en klasse på en celle.** Var den kun en farve,
skulle ledigheden regnes et andet sted, og de to kunne blive uenige. Og en
plads man ikke kan bruge og ikke kan se hvorfor, bliver ikke forstået — den
bliver rapporteret som en fejl. Skyggen kan ikke trækkes, og grunden siges:
*"Besøget hører til Hal B — flyt det dér."*

### ⚠ `tjekDisponering()` fik den ikke, og det er målt

README krævede reglen *"i begge funktioner og i `tjekDisponering()`"*. De to
funktioner har den. Den tredje har den ikke, fordi den ikke kan bruge den:
`reservationerFraEtape()` binder **`koeretoej` og `medarbejder`**, og ingen af
dem har en indeslutning — `indeslutninger()` svarer `[]` for begge.

Et kald dér ville være en no-op der lignede dækning. Det er værre end ingen
kode: den næste ville tro spørgsmålet var stillet.

### Det arbejdet fandt

**1. To prøver holdt den gamle form i live, og begge var værd at rette.**

`facilityopgave.test.mjs` krævede ordret `tjekLedigMod(` i funktionen. Den
guardede noget rigtigt — *at ledigheden overhovedet prøves* — men i en form der
gjorde udvidelsen til en fejl. Den kræver nu `tjekLedigIndesluttet(` og
**forbyder** det smalle tjek.

`opgaveflyt.test.mjs` krævede **præcis én** sti under `reservationer/`. Kravet
var i virkeligheden at funktionen ikke må bygge POSTENS sti — den med res-id'et
— fordi den hører i `flytOpdatering()`. Indeslutningen tilføjer en LÆSNING mere,
og den er rigtig. Prøven spørger nu om stiens dybde frem for om antallet: **en
prøve der tæller, siger nej til en udvidelse den ikke har en mening om.**

**2. Anlæggene hentes af serveren.** Kunne klienten sende `aktiver` med, kunne
den sende et tomt map — og så var indeslutningen væk uden at nogen kunne se
det. En prøve kræver at begge funktioner læser `facility/aktiver` selv.

**3. Målt i den udrullede base, ikke antaget.** Nordvest har fem lokationer
og femten anlæg — Hal B alene har tre — og der ligger reservationer på
**både** `lokation` (1 ressource) og `facilityAktiv` (7). Formen hullet
krævede, findes altså i drift.

**Kollisioner lige nu: 0 af 9 facility-reservationer.** Det er ikke et
argument for at hullet var harmløst — det er en oplysning om at der ikke er
noget at rydde op i. Havde der stået overlap, ville de skulle afgøres af et
menneske: en reservation kan ikke bare fjernes fordi en ny regel gør den
ulovlig.

**4. Ingen regelændring.** `reservationer` er `.write: false`, og reglerne har
aldrig kunnet udtrykke "ingen overlap" — det er hele grunden til at vejen ind
er en funktion. Indeslutningen hører samme sted som resten af konflikttjekket.

---

## 91. En andel af et udsnit er ikke en andel

`beregnNoegletal()` regner seks tal pr. leverandør, og skærmen **rangerer**
leverandører efter dem. Et forkert tal her er ikke en visningsfejl; det er en
anbefaling om hvem man skal handle med — det står allerede i beslutning 63.

To af de seks var forkerte på hver sin måde, og begge fejl var **usynlige**.

### ⚠ 1. Andelen blev regnet af et hentet vindue

`andelAfIndkoebPct` er leverandørens andel af tenantens **samlede** indkøb.
Nævneren kom fra `useListe("indkoeb", { vindueDage: 400, graense: 500 })` — et
vindue med et loft.

Ramte listen loftet, var summen et **udsnit**, og andelen dermed *"en total ud
af et udsnit"*: præcis den fejl beslutning 6 er skrevet om.

⚠ **Og grundlaget afslørede det ikke, fordi det tælles på TÆLLEREN.** En liste
der kun rummede én leverandørs linjer, gav **100 %** med et grundlag der så
tilstrækkeligt ud. Jeg skrev det selv ned som en risiko i gennemgangen af hvad
der manglede; her er den målt og lukket.

⚠ **Begge skærme HAVDE oplysningen.** `useListe` returnerer `afkortet`, og
Indkøbsoversigten skriver den endda ud under tabellen — *"Der er flere end de
500 hentede"* — og sendte så den samme afkortede liste ind som nævner. **Den
sande oplysning lå ét felt væk fra det forkerte tal.**

`indkoebAfkortet` er nu et argument, og andelen bliver `null` med grunden
`udsnit`. De andre fem tal røres ikke: kun andelen har en nævner der skal være
fuldstændig.

### ⚠ 2. Et demo-datasæt stod side om side med kundens egne tal

Svartiden regnes af `sager`, og `sager/` findes ikke i `firebase.rules.json`
(beslutning 20 er fase 0). Skærmen fodrede derfor `DEMO_LEVERANDOERSAGER` ind
— **ved siden af kundens rigtige indkøb og fakturaer** — og begrundelsen stod
i koden:

> *"Et tomt array ville få hver leverandør til at stå med nul reklamationer, og
> det ser ud som en måling."*

**Den præmis holder ikke.** `maal(0, 0)` giver `vaerdi: null`, fordi grundlaget
er under `MINDSTE_GRUNDLAG` — altså "for lidt grundlag", ikke "nul". Sætningen
var aldrig blevet prøvet, og på den blev et demosæt stående i to skærme, og
`demo-i-skaerm.test.mjs` bar det som en navngiven undtagelse.

⚠ **"Der er ingen node" er ikke i sig selv en grund til at vise opdigtede
tal.** Grunden skal være at der ingen DATABASE er (beslutning 26). Findes
databasen og mangler noden, er det rigtige svar at sige det.

`sagerFindes: false` siger det nu, og svartiden står som **"kilden findes
ikke"**. Undtagelseslisten går fra to sæt til ét.

### De tre slags tomt felt

Begge skærme skrev **"for lidt grundlag"** i hvert eneste felt uden værdi. Det
er kun den ene af tre, og de peger på hver sin handling:

| Grund | Betyder | Handling |
|---|---|---|
| `forLidt` | vi har målt, men for få gange | vent |
| `udsnit` | vi har tallene, men ikke dem alle | hent bredere, eller aggregér |
| `ingenKilde` | noden findes ikke | byg den |

Det er den samme skelnen CLAUDE.md kræver af hvert `null` i `kpi/`
(beslutning 62), flyttet ned til det tal en indkøber kigger på. Teksten står i
`MAALING_AARSAG` — **ét** sted, fordi to skærme viser de samme tal og begge
havde hver sin kopi af sætningen.

En prøve kræver nu at **hvert** tal uden værdi bærer en kendt grund. Den kan
ikke afgøre om grunden er sand; den kan afgøre om nogen har taget stilling.

### Det arbejdet fandt

**1. Prøven skulle rettes, ikke omgås.** `en ubesvaret sag har ingen svartid`
faldt, fordi den ikke erklærede at kilden fandtes. Regnestykket er uændret —
det nye krav er at kalderen siger hvor tallet kommer fra. Prøven siger det nu,
og en ny prøve dækker flaget.

**2. Ingen deploy.** `leverandoerer.js` er en delt fil, så kopien i
`functions/delt/` er opdateret — men **ingen Cloud Function importerer den**.
Der er intet at rulle ud, og reglerne er urørte.

**3. Demosættet bliver stående, som nodens form.** Ingen skærm læser det
længere. Det står som formen `sager/` skal have for at svartiden kan regnes —
`oprettetMs` og `foersteSvarMs` — på samme måde som `demo-kpi.js` *er* formen
på `kpi/`. Når noden bygges, hører sættet som `demo:`-faldbakke i `useListe`.

---

## 92. Reservationer var bookingens — og låste en kunde ude af sine egne data

`NODE_MODUL` sagde `reservationer: "booking"`, og regelfilen håndhævede det:
noden kunne kun læses af en kunde med Planning-modulet.

**Det er den ene node hvor fire moduler mødes.** Beslutning 4 er skrevet om
netop dét: booking, værksted, facility-sag og fravær skriver til den SAMME
node, så de fire kan se hinanden. Gates den på den ene, forsvinder de tre
andre.

### Målt, ikke antaget

DEV-kunden `nordvest` har Fleet, Facility, Bemanding, Procure, Dashboard,
Opsætning og Support — **ingen Planning**.

| Kilde | Reservationer |
|---|---|
| `vaerksted` | 18 |
| `fravaer` | 10 |
| `facilitySag` | 9 |
| `booking` | **0** |
| **I alt** | **37, alle låst for ham** |

**Ikke én af hans 37 reservationer kom fra en booking.** Driftskalenderen,
Servicekalenderen og enhver ledighedsvisning fik `permission-denied` på data
hans egne moduler havde skrevet.

⚠ **Og systemet skrev dem for ham.** `opgaveplanlaeg`, `facilityplanlaeg`,
`opgaveflyt` og `opgavestatus` skriver opgaven **og dens reservation** i én
opdatering — med admin-SDK, som går uden om reglerne. Han kunne altså oprette
et værkstedsbesøg og aldrig se det igen. Det er beslutning 45's fejl spejlvendt:
dér kunne en klient skrive den ene halvdel; her kan han ikke læse den anden.

⚠ **Det blev fundet ved at spørge basen, ikke ved at læse tabellen.** Et script
gik hver node i `NODE_MODUL` igennem og spurgte: *har denne tenant DATA i en
node hans moduler ikke ejer?* Svaret var én node. Havde jeg læst tabellen
igennem i stedet, ville `reservationer: "booking"` have set rigtigt ud —
bookinger reserverer jo.

### Rettelsen

`reservationer` flytter i **basen**, hos `opgaver`, `satser` og `fakturaer`.
De fire har det samme til fælles: **en node der hører til flere moduler, kan
ikke gates af det ene uden at det andet går i stykker.**

`test/rules.moduler.test.mjs` udleder reglerne af tabellen, så flytningen
rettede regelfilen og prøven i samme greb. Dertil en prøve der bærer selve
kravet: en tenant uden Planning får en **værkstedsreservation** lagt ind og
skal kunne læse den.

⚠ **Alternativet — "har mindst ét af de fire moduler" — blev valgt fra**, og
begrundelsen står allerede i `moduler.js`: det er en regel ingen kan læse sig
til bagefter, og den slags regler bliver forkert ændret.

### Og så fandt målingen to referencer der pegede på ingenting

Undervejs blev **alle 72 referencefelter** i regelfilen talt op: **51 har et
eksistenstjek, 21 har ikke.** Nogle af de 21 kan ikke få et — de peger på
noder der ikke findes (`sager/`, bilag i Storage). Men et felt uden tjek
betyder at demo-dataene er det eneste sted fejlen kan fanges.

To af dem var forkerte, og begge var seedet ud i basen:

| Reference | Pegede på | Findes |
|---|---|---|
| `indberetninger → materialelinjer → lagerId` | `lager-hoved`, `lager-vaerksted` | lagrene hedder `lag-kolding`, `lag-aalborg`, `lag-odense` |
| `indberetninger/ind-006.indkoebId` | `ink-2026-0844` | linjerne hedder `il-001` … `il-054` |

**Tre id-konventioner for to noder, opfundet i den fil der pegede.** Det er Bil
104 med to nummerplader, på tværs af filer i stedet for inden i én.

`test/demo-referencer.test.mjs` går hvert seedet sæt igennem og kræver at
**hvert** felt der ender på `Id`, enten har en målnode eller står med en
**grund**. Et nyt felt kan ikke glide forbi ved at være ukendt — samme greb som
nodelisten i `rules.tenant.test.mjs`. Den fandt `indkoebId`; jeg havde kun
fundet `lagerId` ved at kigge.

⚠ **Den udrullede base bærer stadig de to.** Rettelsen ligger i demo-filerne,
og basen får den først ved næste provisionering. Jeg kørte den ikke: en
gen-seedning overskriver noder, og det der er oprettet gennem appen siden
sidst, hører ikke til at forsvinde uden at nogen har bedt om det.

### Det der IKKE blev rettet, og hvorfor det står her

**Seedet respekterer ikke kundens moduler.** `nordvest` har fire
fakturagrundlag og syv indberetninger med `bookingId` — og hans `bookinger`
er tom, fordi han ikke har modulet. Referencerne peger på bookinger der findes
i `demo` og ikke hos ham.

Det er sin egen beslutning: enten skal provisioneringen springe de noder over
som tenantens `moduler` ikke ejer, eller også skal en tenant uden Planning
ikke have et fakturagrundlag. Begge dele ændrer hvad DEV *er*, og det er ikke
en oprydning man laver i forbifarten.

---

## 93. Et modul der ikke kan virke alene, sælges ikke alene

`kundemoduler` tog imod enhver kombination af kendte moduler. Kombinationen
**Planning uden Kunder** var ikke forbudt — den var bare umulig.

`bookinger` har `hasChildren(['kundeId', 'tilstand'])`. `kunder` er sit eget
modul, og modulklausulen lukker noden for en kunde der ikke har det. En kunde
med Planning og uden Kunder kan altså **ikke oprette én eneste booking**:
reglen kræver et `kundeId`, og noden det peger på er lukket for ham.

Han har betalt for et modul der afviser hver skrivning, og det ville først
vise sig hos ham.

### ⚠ Kravene er UDLEDT, ikke skrevet af

Et modul M kræver modul N, hvis en node M ejer har et **påkrævet** felt der
peger på en node N ejer. Regnet ud af `firebase.rules.json`:

| Node | Påkrævet felt | → | Modul |
|---|---|---|---|
| `bookinger` | `kundeId` | `kunder` | booking → **kunder** |
| `varer` | `kundeId` | `kunder` | warehouse → **kunder** |
| `enheder` | `kundeId` | `kunder` | warehouse → **kunder** |
| `plukordrer` | `kundeId` | `kunder` | warehouse → **kunder** |

To krav, og begge er sande om produktet: en booking er for en kunde, og
lagerhotellets gods tilhører en kunde.

`test/modulkrav.test.mjs` regner listen ud af regelfilen igen og holder den op
mod `MODUL_KRAEVER`. Får en node et nyt påkrævet felt der krydser en
modulgrænse, bliver prøven rød — og så skal nogen tage stilling, frem for at
opdage det hos en kunde.

⚠ **Og et felt prøven ikke kender, kan skjule et krav.** Springer den et
påkrævet `*Id` over, siger den ikke "intet krav" — den siger ingenting. Derfor
kræver den at hvert påkrævet `*Id`-felt har en kendt målnode; den fandt
`plukordrer.afsendCarrierId` med det samme.

⚠ **Delt ejerskab er ikke et krav.** `reolpladser` ejes af BÅDE `unitbooking`
og `warehouse`, og den første udgave af udledningen læste det som *"unitbooking
kræver warehouse"*. En unitbooking-kunde HAR noden; et krav der peger på noget
han allerede har, er støj der ville have kostet ham et modul.

### ⚠ Der tilføjes ikke automatisk

Den nærliggende rettelse er at slå `kunder` til for ham. Den er forkert i
begge retninger: enten forærer vi et modul væk, eller også fakturerer vi for
noget han ikke har bedt om.

`kundeopret` og `kundemoduler` **afviser** og siger hvad der mangler. Samme
retning som at en momssats ikke gættes: det rigtige svar er at spørge.

⚠ **Begge veje ind.** Stod tjekket kun i `kundemoduler`, kunne en kunde fødes
med en umulig kombination.

### Hvad det IKKE er

**Nav-punkternes `kraeverModul`** skjuler et menupunkt for en kunde der
mangler modulet bag det. Det her er om modulet overhovedet kan bruges — en
skjult menu ville bare gøre et ubrugeligt modul usynligt.

Konsollen viser kravet og slår Gem fra, men det er kun for at man ikke skal
gætte hvorfor: **serveren afviser med den samme funktion.** Skærmen VISER;
funktionen HÅNDHÆVER.

### Det arbejdet fandt

**1. Ingen tenant bryder kravet i dag** — målt på begge før håndhævelsen blev
slået til. `demo` har alle moduler; `nordvest` har hverken booking, warehouse
eller kunder. Havde en kunde stået i en umulig kombination, ville et krav
indført bagfra have låst ham ude af sin egen konsol.

**2. Målingen kom af et andet spørgsmål.** Jeg talte hvor mange skærme der
læser en node et andet modul ejer: **36 steder**. De fleste er legitime
afhængigheder — Planning har brug for køretøjer, Warehouse for kunder — og de
skal ikke alle blive til krav. En skærm der viser et leverandørnavn, skal
kunne undvære det; en node med et påkrævet `kundeId` kan ikke. **Reglerne er
den eneste kilde der kan skelne de to**, og det er derfor kravet udledes af
dem frem for af skærmene.

**3. `ALLE_MODULER` skulle flyttes op.** `manglendeKrav()` læser den, og en
konstant der bruges før sin egen erklæring kaster *"Cannot access before
initialization"* ved **import** — altså hele modulet, ikke bare funktionen.
Samme fælde som selvkontrollen i `demo-indkoeb.js` (beslutning 74).

---

## 94. Mekanismen var bygget og blev brugt 6 steder ud af 36

`useListe` har fra begyndelsen båret sætningen:

> *"Skal noden overhovedet spørges? En node der er spærret af et fravalgt
> modul, ville svare permission-denied, og den afvisning er ikke en fejl
> brugeren skal se — den er svaret 'modulet er ikke købt'."*

Flaget `hent: false` blev bygget til netop det. **Det blev sat 6 steder ud af
36.**

### Hvad de 30 andre gjorde

Målt: 36 steder hvor en skærm læser en node et **andet** modul ejer. Seks
havde vagten; tredive spurgte uden at vide om kunden havde modulet.

| Skærm | Læser | Ejes af |
|---|---|---|
| Arbejdskøen | `leverandoerer` | Procure |
| Disponering | `kompetencer`, `koeretoejer`, `leverandoerer` | Workforce, Fleet, Procure |
| Fakturacenteret | `indkoebsordrer`, `forbrugsvarer`, `koeretoejer` | Procure, Fleet |
| Servicekalenderen | `leverandoerer` | Procure |
| Udlån | `kunder` | Kunder & Priser |

En kunde med Fleet men uden Procure fik altså en `permission-denied` på
`leverandoerer` **hver gang han åbnede Arbejdskøen**. Beslutning 44 siger
hvorfor det ikke går: *"hver sideindlæsning ville udløse en håndfuld
permission-denied, og en afvisning skal betyde noget."* `useKpi()` løste det
allerede med `laesbareDomaener()`.

⚠ **Og det var værre end støj.** Er `auditerSom` sat på kaldet, skriver
`useListe` en **auditpost om nægtet adgang** ved hver afvisning. Loggen ville
fyldes med hændelser der ikke er hændelser, og den der en dag leder efter en
rigtig afvisning, skal grave i dem.

### Rettelsen ligger ÉT sted

Tjekket er flyttet ind i `useListe`. Hooket læser allerede `useFleet()`, og
`moduler` står der; det slår nodens ejer op og springer forespørgslen over.

**Et krav der skal huskes 30 gange, bliver glemt 30 gange** — det var jo
netop det der skete. `hent:` bliver stående til det den også er god til: en
betinget hentning skærmen selv styrer.

⚠ **Den spørger slet ikke — den fanger ikke en afvisning bagefter.** Forskellen
er ikke kosmetisk: en fanget afvisning har allerede kostet en forespørgsel og
en auditpost. En prøve kræver at grenen ligger **før** hentningen.

### ⚠ Opslaget følger stien, ikke kun nodenavnet

Skærmene læser `facility/lokationer`, mens tabellen har `facility`. Slog vi
kun det fulde navn op, ville stien se ud som en **base-node** — og så var
halvdelen af Facility udenfor. `modulerForNode()` går stien bagfra, og
**længste træffer vinder**, så `sensitive/indberetninger` ikke afgøres af
`sensitive`.

⚠ **Basen svarer `null`, ikke `[]`.** `null` betyder "ingen klausul"; en tom
liste ville betyde "ejet af ingen moduler", altså aldrig læsbar. De to må ikke
forveksles — det ville tømme hver eneste base-node på skærmen.

⚠ **Og en manglende `moduler`-node betyder ALLE.** `harModul()` fejler åbent,
som reglerne gør. Fejlede den lukket, ville en kunde oprettet før feltet
fandtes se tomme lister overalt. Fjerde gang den fælde har kostet noget
(56, 86, 87, 94).

### Det arbejdet fandt

**1. En skabelonstreng er i orden — hvis første led er skrevet.**
`useListe(`satser/${STANDARDGRUPPE}`)` kan slås op: `satser` er leddet der
afgør modulet. Det der ikke går, er hele stien i en variabel — så kan hverken
hooken, prøven eller en læser se hvad skærmen spørger om. Prøven kræver derfor
et læsbart **første led**, ikke en literal.

**2. En prøve der ikke stripper kommentarer, tæller en note som et kaldsted.**
Første udgave faldt over `Kunder.jsx`, hvor der står *"DATAKILDE: ÉT
useListe()-kald"* i filhovedet.

**3. `moduler` hører i effektens deps.** Konteksten henter dem asynkront: uden
dem ville hooken huske sit svar fra før modulerne var kendt, og kunden ville
se en tom liste indtil han genindlæste siden.

**4. Ingen udrulning.** Reglerne er urørte, og selv om `moduler.js` er en delt
fil, kalder ingen Cloud Function `modulerForNode()`. Efterprøvet i browseren:
Fleet-driftskalenderen henter uændret — kort, gitter og leverandørnavne står
som før.

---

## 95. En tom liste fordi modulet mangler, er ikke en tom liste

Beslutning 94 fik `useListe` til at holde op med at spørge om noder kunden
ikke har modulet til. Det var rigtigt — forespørgslen ville være sikker på at
blive afvist, og afvisningen skrev en auditpost om nægtet adgang.

**Men listen blev tom, og tom er tvetydigt.**

`leverandoerNavn()` slog op i den og skrev

> **"ukendt leverandør (lv-hydra)"**

på hver eneste værkstedsopgave i arbejdskøen hos en kunde uden Procure. Det er
en **påstand om at hans data er i stykker**, fremsat af et opslag der aldrig
havde noget at slå op i.

⚠ **Funktionens egen begrundelse var rigtig — og gjaldt ikke her.** Der stod:
*"et id der ikke kan slås op, er en fejl i data og ikke en manglende værdi."*
Sandt, **når vi har kartoteket**. Meningsløst når vi ikke har spurgt.

Det er samme fejlklasse som `datatilstand.js` selv er skrevet imod: en tilstand
oversat til en anden, hvor den forkerte af de to ser ud som en fejl hos
brugeren. Rettelsen i 94 flyttede bare hvor oversættelsen skete.

### Reglen

**Et opslag i en TOM liste er ikke et mislykket opslag.**

| Liste | Id findes | Svar |
|---|---|---|
| har rækker | ja | navnet |
| har rækker | nej | *ukendt leverandør (id)* — vi HAVDE kartoteket |
| tom | — | **id'et, råt** — der var intet at slå op i |
| — | intet id | `—` |

Rettelsen dæmper altså ikke den rigtige fejl: har vi kartoteket og finder ham
ikke, står anklagen ved magt.

### Og tilstanden siger hvorfor

`TILSTAND.modulMangler` er ny. Uden den kan skærmen ikke se forskel på "der er
ingen leverandører" og "vi har ikke spurgt".

⚠ **Den er ikke `naegtet`, og forskellen er ikke akademisk:** en afvisning
betyder at nogen skal se på rettighederne; et manglende modul betyder at nogen
skal ringe til os.

⚠ **Den blokerer aldrig en skærm.** Noden hører sjældent til skærmens eget
modul — Arbejdskøen læser `leverandoerer`, som er Procures. Blokerede den,
ville en kunde uden Procure miste hele sin Fleet-arbejdskø, fordi et
leverandørnavn ikke kunne slås op. Det er `ikkeAggregeret`-fælden om igen: en
oplysning der blanker en skærm.

⚠ **Men den vejer tungere end `ok`** i `vaerste()`, ellers ville den forsvinde
når skærmen læser to noder — og lettere end `naegtet` og `forbindelse`, for
dem skal brugeren se først.

⚠ **Og den viser aldrig demo-data.** Opdigtede tal findes kun hvor der ikke er
en database at spørge (beslutning 26). Her ER der en; vi har bare ikke spurgt.

### Teksten

`<Datatilstand>` siger hvilket modul oplysningerne hører til, **ved navn** —
"De her oplysninger hører til Procure" er brugbart, "hører til et andet modul"
er det ikke: kunden skal kunne sige hvilket når han ringer.

**Ingen genprøv-knap.** Der er intet at prøve igen, og en knap ville love at
det kunne løses ved at klikke. Samme grund som `ikkeAggregeret` ikke har en.

### Det arbejdet fandt

**1. Rettelser flytter fejl, de fjerner dem ikke altid.** 94 fjernede en
afvisning og en auditpost, og skabte en tom liste. Den tomme liste blev til en
anklage ét lag længere ude. Det er værd at kigge efter hver gang noget holder
op med at fejle: **hvad står der nu i stedet?**

**2. Det andet "ukendt"-opslag blev stående, og det er en anden sag.**
`pricing.js` skriver *"Lagerophold – ukendt lager (…)"* når en lagersats
mangler. Den linje bærer `manglerSats: true`, og kommentaren dér forklarer
hvorfor opholdet **ikke** springes over: et ophold man kan se, er det eneste
der får nogen til at oprette lageret. Det er en manglende SATS, ikke en
manglende liste — og den skal blive ved med at råbe.

---

## 96. Tretten nøgletalskort påstod en total de ikke havde

Beslutning 6 navngav fejlen: **en total ud af et udsnit**. Beslutning 91 fandt
den i `andelAfIndkoebPct`, hvor nævneren var et hentet vindue.

Her er den målt bredt. `useListe(node, { graense })` henter de sidste N rækker
og svarer `afkortet` når loftet blev ramt. **Tretten nøgletalskort tællede den
liste op og satte tallet frem som en kendsgerning om virksomheden:**

| Skærm | Kort | Loft |
|---|---|---|
| Procure → Varelager | "Varer i alt", "Bevægelser" | 500 / 1000 |
| Unitbooking → Kasser | "Kasser i alt" | 500 |
| Unitbooking → Historik | "Udlån i alt" | 500 |
| Warehouse → Varer | "Varer i alt" | 500 |
| Warehouse → Lokationer | "Lokationer", "Optaget", "Frie" | 500 |
| Warehouse → Sporbarhed | "Sporede enheder", "Serie-sporede varer" | 500 |
| Warehouse → Modtagelse | "Ledige pladser" | 500 |
| Unitbooking → Kalender | "Kasser i spil" | 500 |
| Opsætning → Generelt | "Lokationer" | 500 |

⚠ **Værst stod der `note="hele historikken"`** under et tal talt op af en
liste med loft på 1000. Sætningen var ikke bare forkert — den var en
forsikring om præcis det der ikke gjaldt.

⚠ **Oplysningen fandtes allerede.** `useListe` har hele tiden returneret
`afkortet`, og dens eget hoved siger hvorfor: *"Skriv det til brugeren — tavs
afkortning opdages først når nogen spørger hvorfor en booking mangler."*
Kortene læste den ikke. Det er tredje gang i træk at en rettelse består i at
BRUGE et svar der lå ét felt væk (91, 94, 96).

### "Mindst 500" er et svar. "500" er et løfte.

`mindst(n, afkortet)` i `format.js`. En **nedre grænse er en kendsgerning** —
vi har set så mange — mens en total vi ikke kan stå inde for, er forkert på en
måde ingen kan se.

⚠ **Den skjuler ikke tallet bag en streg.** At listen er afkortet, er en
oplysning om VORES hentning, ikke om kundens data. En streg ville sige "vi ved
det ikke", og det passer ikke.

⚠ **Og et delmængdetal ER en nedre grænse.** "Optaget" og "Frie" er talt af de
hentede pladser; de uhentede er enten det ene eller det andet, så begge tal kan
kun stige. Derfor er `mindst()` rigtigt for begge.

⚠ **ANDELEN er det ikke.** `optagne / pladser.length` er en procent af et
udsnit, og den kan ikke rettes med et ord — den udgår, og noten siger hvorfor.
Samme svar som `andelAfIndkoebPct` fik i beslutning 91.

### ⚠ Kravet gælder nøgletalskortene, ikke hvert `.length`

En lint på hver optælling ville råbe ad hvert *"er listen tom"* og hvert
tabelrækkeantal — og **en lint der råber ad alt, bliver slået fra.**

Et tal i en tabelrække beskriver rækkerne. **Et tal i et `KpiKort` beskriver
kunden.** Derfor er det netop dér kravet gælder, og `test/afkortede-totaler.test.mjs`
læser præcis den grænse: et kort bygget af en liste med loft skal enten bruge
`mindst()` eller selv nævne afkortningen.

### Det arbejdet fandt

**1. Nævneren i en note er også et tal.** Fem af de tretten havde et ærligt
tal i kortet og et afkortet i noten — *"af 500"*, *"73 % af pladserne"*. Et
forbehold der kun gælder det store tal, er ikke et forbehold.

**2. Målingen måtte snævres ind to gange.** Første udgave talte hver `.length`
på en liste med loft: **over halvtreds** steder, næsten alle uskyldige. Anden
udgave talte kun `reduce` — ét sted. Kortene var det rigtige snit, og de var
tretten.

---

## 97. Hver kunde hentede hele produktet

Byggeriet havde advaret om det hver eneste gang:

> *"Some chunks are larger than 500 kB after minification."*

Målt: **1.586 kB i ét bundt**, 429 kB pakket. Sammensætningen:

| | Rå | Pakket |
|---|---|---|
| Firebase SDK | 481 kB | 99 kB |
| React | 152 kB | 49 kB |
| Øvrige biblioteker | 17 kB | 7 kB |
| **Vores egen kode** | **935 kB** | **274 kB** |

En vognmand med Fleet og Facility hentede altså Warehouses elleve skærme,
Unitbookings fire, Procures syv, ejerkonsollen og hver eneste demofil — **hver
gang han åbnede appen**, over mobilnettet i en lastbil.

⚠ **Det er den samme sætning som beslutning 94 og 95, et lag længere ude:**
en kunde skal ikke betale for et modul han ikke har. Dér var det
forespørgsler og auditposter; her er det kilobytes.

### Efter

55 skærme hentes med `lazy()`. Startbundtet er nu:

| | Rå | Pakket |
|---|---|---|
| `index` (vores ramme) | **77 kB** | **26 kB** |
| `react` | 152 kB | 49 kB |
| `firebase` | 481 kB | 99 kB |

**Vores egen kode i startbundtet: 935 kB → 77 kB.** Resten kommer når en
skærm åbnes: 3–27 kB pr. skærm.

⚠ **`firebase` og `react` står for sig med vilje.** De skifter kun når vi
opgraderer, og vi udruller ofte — ligger de i deres egen fil, beholder
browseren dem på tværs af udrulninger. Vores egen `fleet/`-mappe deles derimod
af hver skærm, og **en chunk der altid hentes, kan lige så godt ligge i
indgangen**: en ekstra fil koster en rundtur.

### ⚠ Grænsen ligger i AppShell, ikke om rutetræet

React venter ved den **nærmeste** Suspense-grænse. Første udgave lagde den om
`<Routes>` i App.jsx — og så ville sidebaren, topbaren og periodevælgeren
forsvinde og blive tegnet om ved hvert eneste skærmskift. **En shell der
blinker, føles som en app der genstarter.**

Den ligger nu om `<Outlet />` i AppShell, så kun indholdsfeltet skiftes ud.
Ejerkonsollen har sin egen: den bruger ikke AppShell (beslutning 35), og uden
en grænse ville `/main` kaste.

### ⚠ Login er ikke doven

Den er den første skærm en uautentificeret bruger ser, og den tegnes **uden
for** AppShell — altså uden en grænse omkring sig. En doven Login ville vise
et tomt vindue dér hvor folk i forvejen er usikre på om de tastede rigtigt.

### ⚠ `lazy()` fejler på en farlig måde

En fil uden default-eksport kompilerer fint, bygges fint og fejler **først når
ruten åbnes** — hos brugeren, på den ene skærm ingen af os klikkede på.

`test/rutedeling.test.mjs` læser rutetræet og hver af de 55 filer: har de et
default-eksport, bruges hvert dovent navn i en rute, og ligger grænserne hvor
de skal. Det er det eneste der fanger det uden at klikke sig gennem 55 skærme.

### Det arbejdet fandt

**1. En prøve der ikke stripper kommentarer, måler en beskrivelse.**
Kravet "Outlet skal ligge inde i Suspense" faldt, fordi AppShells filhoved
siger *"sidebar + topbar + `<Outlet/>`"* — og den sætning står før den rigtige
JSX. Anden gang på to etaper (jf. 94).

**2. Efterprøvet i browseren, ikke kun i byggeriet.** Procure → Varelager og
Warehouse → Lokationer åbnet på en frisk indlæsning: begge tegner, sidebaren
bliver stående, og navigationen mellem to moduler henter den nye chunk uden at
rammen forsvinder.

**3. 118 chunks er mange, og det er i orden.** De små er delte moduler i
`fleet/` som Rollup selv skiller ud når to skærme deler dem. Presses de sammen
i indgangen, betaler alle for dem; lades de være, betaler kun den der åbner
begge skærme. Netlify leverer over HTTP/2, hvor en ekstra fil ikke er en
ekstra forbindelse.

---

## 98. Momssatsen er 25 % — spørgsmålet blev stillet og besvaret

`grundlag.js` har siden beslutning 25 nægtet at sætte en momssats:

> *"Det ville være nemt at sætte 25 som standard … Men 'de fleste gange' er
> ikke godt nok her: kørsel til udlandet, EU-handel med omvendt betalingspligt
> og momsfri persontransport har ikke 25. Rammer vi forkert, er det ikke en
> visningsfejl — det er en momsangivelse der er forkert, og den opdages af
> SKAT frem for af os."*

Feltet stod tomt, eksporten var spærret for **alle**, og det stod i README som
det første af fire spørgsmål der blokerer fase 2, med *"en bogholder, før
første eksport"* som den der skulle svare.

**Ejeren svarede den 23. august 2026: 25 %, uden undtagelser.**

### ⚠ Forbeholdet blev rejst FØR svaret

Det er forskellen på en beslutning og en antagelse. Spørgsmålet blev stillet
med den konkrete indvending i hånden:

- International kørsel er som udgangspunkt momsfritaget (momsloven §34).
- Demo-grundlaget havde netop en `Skagen → Oslo`-linje der stod **tom** med
  begrundelsen *"eksport til Norge er ikke 25 %"*.
- Demodataene kører til Paris, Hamburg og over Rødby–Puttgarden.

Svaret var 25 for alle linjer. Det er noteret her, i `grundlag.js` og i
`demo-grundlag.js`, så den der en dag hører noget andet fra en bogholder, kan
finde både tallet og den linje hvor det bider.

### Hvad der ændrede sig

`MOMSSATS_SALG = 25` er det ene sted tallet står. `byggGrundlag()` sætter det
på hver linje der ikke selv bærer en sats — **ét sted, ved opbygningen.**

⚠ **Sat ved opbygningen, ikke ved visningen.** Et låst grundlag dokumenterer
hvad der blev faktureret; regnede vi satsen ud hver gang skærmen blev åbnet,
ville et grundlag fra marts få nye tal den dag satsen ændres. Samme grund som
et frosset grundlag gemmer sine egne satser.

⚠ **En sats der allerede står, røres ikke — heller ikke 0.**
`Number.isFinite(0)` er sandt, og en nul-sats er et **svar**, ikke et manglende
felt. Uden det led ville en fremtidig fritagelse blive overskrevet af
standarden hver gang grundlaget blev bygget om.

⚠ **Værnet i `kanEksportere()` bliver stående** — men det er ikke længere et
arbejdstrin, det er et værn. Et grundlag fra før beslutningen kan have en tom
linje (der lå én i basen, målt: **1 af 8 linjer**), og en fremtidig vej ind kan
springe `byggGrundlag()` over. En eksport er en kanal UD af systemet.

### Og så blev eksporten koblet til en knap

`eksporter()` har stået i `grundlag.js` siden beslutning 25 og **er blevet
kaldt ingen steder** — fordi momssatsen spærrede hver eneste eksport. Det er
den observation jeg selv gjorde i gennemgangen af hvad der manglede, uden at
kunne gøre noget ved den.

Fakturering har nu **Hent som JSON**.

⚠ **Det er den NEUTRALE model, ikke en adapter.** Hvilket regnskabssystem der
får sit eget format først — e-conomic, Dinero, Business Central — er stadig
åbent (beslutning 22). En JSON af `eksporter()` er præcis det der ER besluttet:
det godkendte grundlag som det står, med `formatVersion` så modtageren kan se
hvad han læser.

⚠ **Og den låser ikke.** At hente filen er ikke det samme som at bogføre den;
låsningen kræver stadig en reference til hvor bilaget endte. En knap der gjorde
begge dele, ville låse et grundlag på et download der måske aldrig blev åbnet.

### Det arbejdet fandt

**1. Tre prøver holdt mellemstadiet på plads, og alle tre skulle skrives om.**
*"MOMSSATSEN GÆTTES IKKE — en manglende sats blokerer eksporten"* målte noget
der var rigtigt indtil svaret kom. Havde jeg rettet dem til at acceptere begge
dele, ville de ikke måle noget. De måler nu at satsen bliver SAT, at en
eksisterende sats ikke overskrives, og at værnet stadig virker på en linje
bygget uden om `byggGrundlag()`.

Det er fjerde gang i denne base at en prøve om et åbent spørgsmål er faldet
netop da svaret kom — og det er meningen. `⚠ INGEN RETENTION ER AFGJORT ENDNU`
venter stadig på sin dag.

**2. Selvkontrollen i demofilen var vendt forkert bagefter.** Den krævede at
mindst ét grundlag MANGLEDE sin momssats — *"forsvinder det, forsvinder
demonstrationen af at vi ikke gætter"*. Demonstrationen er nu overflødig, og
kontrollen advarer om det modsatte: en demolinje uden sats viser en spærring
der ikke længere findes.

**3. Hentefunktionen lå som en lokal kopi.** `Prisliste.jsx` havde sin egen
`hent()` med `URL.revokeObjectURL`; Fakturering skulle bruge den samme. Fire
linjer er lige præcis kort nok til at blive skrevet af — og lige præcis langt
nok til at den ene glemmer at frigive URL'en. Den står nu i `eksport.js`.
