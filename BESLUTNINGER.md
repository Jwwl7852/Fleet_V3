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
