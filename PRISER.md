# Priser — ét sted, med standard og kundeafvigelse

**Alt der har med priser at gøre, samles i Kunder & Priser.** Vognmanden
opretter sine **standardpriser** for alle platformens ydelser, og klikker han
sig ind på en kunde, kan han rette prisen eller give rabat dér.

**Denne fil er planen, ikke koden.** CLAUDE.md: *analyse før kode.*

---

## 1. To slags priser, og de må aldrig blandes

| Hvem sætter den | Hvor | Hvad |
|---|---|---|
| **Vi som ejere** | `udbyder/prisliste` | Hvad modulerne koster i abonnement. Bygget (beslutning 36) |
| **Vognmanden** | **Kunder & Priser** | Hvad HANS kunde skal betale. Det er den her fil |

De to har intet med hinanden at gøre ud over at ligne hinanden. Ejerens
prisliste er vores omsætning; vognmandens er hans.

---

## 2. Hvad der findes i dag — og hvor det gør ondt

| Hvad | Hvor | Tilstand |
|---|---|---|
| Prismotoren | `pricing.js` | **Bygget og prøvet.** `satsPaa()`, `METODER`, `beregnBooking()`, `beregnForloeb()`, `lagerdoegn()`, `lagerUd()` |
| Satsarket (biler, poster, agenter) | `omkostninger`-noden | ✅ Ude af JSX-filen i etape 5. ⚠ Det er **omkostninger**, ikke priser |
| `satser`-noden | `firebase.rules.json` | Findes, med `gyldigFra`-indeks — men **intet skriver til den** |
| Prisgruppe | `kunder/<id>.prisgruppe` | "A"/"B". Peger på et satssæt der ikke findes som data |
| Lagersatser | `lagre/<id>/{satser,haandteringSatser}` | ✅ Node, regler, data og prøver. ⚠ Rækken her sagde "bruges af `beregnForloeb()`" — den blev **slået op** af den, men `omkostningsark()` byggede aldrig `lagre`, så hvert opslag ramte `undefined` og opholdet blev sprunget over i tavshed |
| Rabat i basispoint | `beloeb.js` | **Bygget.** `BPS_SKALA`, `rabatteretSatsOere()`, `pctTilBps()` |
| Warehouse-ydelser | `warehouse.js` | `YDELSE` + `afregningslinjer()` bygget; satsopslaget injiceres udefra |

⚠ **Den vigtigste linje i tabellen er den anden.** Satsarket er en `const` i
en skærmfil. Der findes altså i dag **ingen** kundepriser i databasen — hverken
standard eller pr. kunde. Det er ikke en detalje der skal migreres; det er
fundamentet der skal bygges.

---

## 3. Modellen der foreslås

### 3.1 Ét ydelseskatalog

Alle platformens ydelser i én liste, med den **metode** der bestemmer hvad
`antal` betyder. `METODER` i `pricing.js` har allerede seks; Warehouse kræver
to-tre mere.

```
ydelser/<ydelseId> = {
  navn, kategori, metode, enhed, division, aktiv
}
```

| Kategori | Eksempler | Metode |
|---|---|---|
| Kørsel | Km-pris pr. bil, fast pr. booking | `prKm`, `fastPrBooking` |
| Passage | Storebælt, Femern, vejafgift | `prPassage`, `prPassageEnVej` |
| Agent | Havneagent pr. by | `fastPrBooking` |
| Ophold | Parkering, lagerdøgn | `prDoegn`, `prLagerdoegn` |
| **Warehouse** | **Håndtering ind, håndtering ud, flytning** | `prHaandtering` *(ny)* |
| **Warehouse** | **Pr. palleplads pr. dag, pr. m³ pr. dag** | `prPalledoegn`, `prKubikdoegn` *(nye)* |

### ✅ 3.2 Standardprisen — i den node der allerede fandtes

```
satser/standard/<ydelseId>/satser/<id> = { gyldigFra, beloebOere }
```

⚠ **Der kom ingen ny node.** `satser` har eksisteret siden beslutning 7 med
sit `gyldigFra`-indeks og sin `satser.skriv`-permission — den havde bare
aldrig noget i sig. Til gengæld havde den **ingen validering**; den er nu
strammet: beløb i hele ører, `gyldigFra` påkrævet, ukendte felter afvist.
Det kunne gøres uden risiko netop fordi intet skrev til den — men det skulle
gøres før den begyndte at bære penge.

⚠ **Ydelses-id'et er en databasenøgle.** Id'erne hed `lager.handlingInd`, og
RTDB tillader ikke punktum i en nøgle — hver eneste skrivning fejlede med
*"invalid path"*. Build og prøver var grønne; kun en probe mod den udrullede
base fandt det. De hedder nu `lager-handlingInd`, og en prøve holder øje med
tegnene.

⚠ **Beslutning 7 gælder uændret:** en sats overskrives ALDRIG. Rettes prisen i
dag, kommer der en ny post med `gyldigFra` — ellers ændrer en rettelse prisen
på en booking fra sidste kvartal, og så kan fakturaen ikke forklares.

### ✅ 3.3 Kundens afvigelse — også versioneret

```
kunder/<kundeId>/priser/<ydelseId>/satser/<id> = {
  gyldigFra,
  beloebOere,   // egen pris — ELLER
  rabatBps      // rabat på standardprisen
}
```

⚠ **Enten en egen pris eller en rabat, ikke begge.** To felter der begge kan
sætte prisen, er to svar på samme spørgsmål — og så bliver det tilfældigt
hvilket der vinder. Valideringen afviser en post med begge.

⚠ **Rabatten er basispoint**, som i ejerkonsollen: 1500 = 15,00 %.
`rabatteretSatsOere()` findes og skal bruges — en procentregning mere ville
være to afrundingsregler.

⚠ **Placeringen kostede en permission.** `.write` kaskaderer, og `kunder` er
skrivbar med `kunder.skriv` — som casehandler, disponent og koordinator alle
har. `satser.skriv` har kun admin. Uden videre kunne prisen altså sættes af
flere end standardprisen kan, alene fordi den lå i en anden sti. Derfor har
`priser`-undertræet en `.validate` der **også** kræver `satser.skriv`. Se
beslutning 38.

⚠ **Og ét hul kunne ikke lukkes:** `.validate` kører ikke ved en sletning, så
`kunder.skriv` alene kan **fjerne** en afvigelse — ikke sætte eller ændre den.
Det er efterprøvet mod den udrullede base. Det kan ikke lukkes med en regel;
kun ved at flytte prisen ud af `kunder/`.

### ✅ 3.4 Opslaget

```
prisFor(ydelseId, kundeId, paaMs)
  → kundens egen sats på tidspunktet      (hvis der er en)
  → ellers standard × (1 − rabat)          (hvis der er en rabat)
  → ellers standarden
  → ellers null
```

⚠ **`null`, ikke 0.** En ydelse uden pris er et ubesvaret spørgsmål, ikke en
gratis ydelse. Samme regel som momssatsen der mangler.

⚠ **Og en rabat på en standardpris der mangler, er også `null`.** 15 % af
ingenting er ikke nul kroner; det er det samme ubesvarede spørgsmål med et tal
foran. Regnede vi den til 0, ville en glemt standardpris blive til en gratis
ydelse hos præcis den kunde der havde forhandlet sig til en rabat.

⚠ **`prisFor()` blev bygget i etape 3, ikke i 4.** Skærmen skal vise hvad
kunden faktisk skal betale, og skrev den sit eget regnestykke, ville der være
to steder der afgør en pris — præcis det punktet her advarer mod. Etape 4 er
derfor **forbrugerne**: booking, warehouse og snapshottet.

⚠ **Og opslaget sker ÉT sted.** `satsPaa()` i `pricing.js` bærer allerede
"hvilken sats gjaldt på det her tidspunkt". `prisFor()` bygger på den — den
skriver den ikke af. *(Jeg nåede at skrive den af én gang som `gaeldendeSats()`
i `warehouse.js`; den er slettet igen.)*

### 3.5 Snapshottet består

⚠ En booking gemmer i dag de satser den blev beregnet med, og **snapshottet er
sandheden** — ikke det aktuelle satsark. Det gælder uændret, og det gælder
også en lagerafregning: linjen bærer den sats der blev brugt.

---

## 4. Det der skal afgøres

### ✅ 4.1 BESVARET: prisgruppen udgår som prisbærer

Kunden har i dag `prisgruppe: "A"`. Din model er **standard + afvigelse pr.
kunde**, og så er prisgruppen et tredje lag i midten.

`Kunder.jsx` skriver selv i sit hoved at *"vi har ikke et gruppebegreb ved
siden af prisgruppen, og at opfinde et ville være to måder at inddele de samme
kunder på"*. Tre lag ville være det samme problem én gang til.

**Der er ÉN standardprisliste for hele virksomheden**, og afvigelser sættes på
den enkelte kunde. To lag, ikke tre.

`prisgruppe` bliver et rent filtreringsfelt i kundeoversigten og bærer ikke
længere en pris. ⚠ Feltet fjernes ikke af sig selv: det står på hver
kundepost og i demo-data, og en skærm der stadig filtrerer på det, skal blive
ved med at virke. Det er navnet der holder op med at betyde noget, ikke
kolonnen der forsvinder.

### ✅ 4.2 BESVARET — OG SVARET BLEV LAVET OM I ETAPE 5

Skærmen hedder *Bookingopsætning* og indeholder to ting: **satser** og
**regelsæt** (automatik). Spørgsmålet var om begge skulle til Kunder & Priser.

Svaret her stod oprindeligt: *"Bookingopsætning nedlægges. Både satserne og
regelsættene flytter under Kunder & Priser."* Det byggede på at satsarket var
**priser**.

⚠ **Det var det ikke.** Da satsarket blev åbnet i etape 5, viste det sig at
være **omkostninger**: km-omkostningen på bilen, færgen, broen,
agentparkeringen, vejafgiften. Skærmens egne faner hedder *"Omkostninger &
satser"* og *"Bilomkostninger"*, og `beregnBooking()` skriver linjen som
*"Km-omkostning – Volvo FH 500"*.

Beslutning 11 findes præcis for den forskel: **driftsomkostning pr. km er ikke
kalkulationspris pr. km.** Storebælt koster 887 kr og faktureres måske til
950. Var omkostningsarket flyttet ind under Kunder & Priser — det sted der er
defineret som *"hvad HANS kunde skal betale"* — havde vi slået indtægt og
udgift sammen i én skærm og i én node.

**Bookingopsætning bliver derfor stående som omkostningsskærm**, og
`/booking/opsaetning` forsvinder ikke. Kunder & Priser bærer kundens priser;
Bookingopsætning bærer hvad turen koster os. Det er de to spørgsmål, og de har
hvert sit sted.

⚠ **Regelsættene (automatikken) er ikke afgjort af det her.** De hører
stadig til bookingen og bliver hvor de er, indtil nogen har set på dem.

### ⚠ 4.3 Hvor mange klik må en pris koste?

Med versionering får hver prisændring en ny post med `gyldigFra`. Det er
rigtigt for regnskabet og tungt i hverdagen.

**Forslag:** feltet redigeres direkte, og systemet laver selv den nye post med
`gyldigFra = i dag`. Vil man have en pris til at gælde fra den 1., vælger man
datoen. Det er samme greb som prislisten i ejerkonsollen.

---

## 5. Etaper

| # | Hvad | Værdi alene | Status |
|---|---|---|---|
| 1 | **Ydelseskataloget** + de tre nye metoder i `pricing.js` | Der findes en liste over hvad der kan prissættes | ✅ |
| 2 | **Standardpriser** — node, regler, prøver, skærm i Kunder & Priser | Vognmanden kan sætte sine priser | ✅ |
| 3 | **Kundens afvigelse** — egen pris eller rabat, pr. ydelse | Den enkelte kunde kan få sin aftale | ✅ |
| 4 | **Én opslagsvej** — `satsopslag()`, broen til afregningen og kilden på linjen | Priserne bruges ét sted fra | ✅ |
| 5 | **Satsarket ud af JSX** — og det viste sig at være OMKOSTNINGER | Det hardkodede forsvinder | ✅ |
| 6 | **Warehouse-afregningen** — skærmen der gør lageret op pr. kunde | Lageret kan gøres op | ✅ |

⚠ Etape 5 er den farligste: `beregnBooking()` og `beregnForloeb()` er prøvet
mod det hardkodede satsark. Flyttes det, skal prøverne følge med — ellers
prøver de en form der ikke længere findes.

---

## 6. Størrelsen, ærligt

Etape 1–4 er fundamentet og hænger sammen; de kan ikke deles mindre. Etape 5
er en migrering af noget der virker, og den skal have sine egne prøver før
den røres. Etape 6 er lille, fordi `afregningslinjer()` allerede tager
satsopslaget som en parameter.

Det er mindre end Warehouse, men det rører **flere** steder — og det rører
regnskabsdata, hvor en fejl ikke er synlig før en kunde ringer.


---

## 7. Etape 4 er inde — én opslagsvej

`satsopslag({ standard, kunde, arterFor })` giver den `satsFor(ydelse, paaMs)`
som `afregningslinjer()` i warehouse.js har ventet på siden Warehouse etape 7.
Den bygger på `prisFor()` og dermed på `satsPaa()` — ingen forbruger slår en
pris op selv.

⚠ **Broen mellem de to kataloger er ARTEN, ikke en tabel.** `pricing.js` siger
hvad der kan **prissættes** (`LAGERYDELSER`); `warehouse.js` siger hvad der kan
**afregnes** (`YDELSE`). De to filer kan ikke importere hinanden —
`warehouse.js` er importfri, fordi den kopieres til serveren — og en
håndskrevet oversættelse ville være det **syvende** sted i dette repo hvor to
lister skulle holdes i sync i hånden. I stedet slås afregningsydelsens
**bevægelsesarter** op i `ydelseForArt()`.

⚠ **Er svaret tvetydigt, gives der ingen pris.** Peger to arter på hver sin
prisydelse, kan opslaget ikke afgøre hvilken der gælder, og et gæt ville
fakturere en pris ingen kan forklare. Linjen står så som "mangler sats" —
præcis som en ydelse uden pris.

⚠ **Kilden følger med på linjen.** `standard`, `rabat` eller `kunde`. En pris
på en faktura man ikke kan spore, er en pris man ikke kan forsvare — og det er
den halvdel af snapshottet der manglede: linjen bar allerede satsen og
`gyldigFra`, men ikke hvor den kom fra.

⚠ **Og en placering kunne ikke afregnes.** Etape 12 gjorde `putaway` til en
flytning af selve beholderen, og den post bar ingen `kundeId` —
`afregningslinjer()` filtrerer på netop det felt, så håndteringen ville aldrig
komme på en faktura. Arbejdet ville have været gratis uden at nogen havde
besluttet det. Serveren skriver nu kunden af **beholderen**; kunne klienten
oplyse den, kunne en håndtering afregnes til en anden kunde end den godset
tilhører.

**Tilbage:** etape 5 (satsarket ud af `Bookingopsaetning.jsx`) og etape 6
(afregningsskærmen, der samler linjerne for en kunde i en periode).


---

## 8. Etape 5 er inde — og planen tog fejl om hvad satsarket var

Satsarket er ude af `Bookingopsaetning.jsx` og ligger i noden
`omkostninger`. Skærmen læser det gennem `useListe`, og
`omkostningsark()` bygger den form `beregnBooking()` allerede kendte.

⚠ **DET ER OMKOSTNINGER, IKKE PRISER — og derfor sin egen node.** Se den
rettede 4.2. `satser` er hvad kunden betaler; `omkostninger` er hvad turen
koster os. Beslutning 11 findes for den forskel.

⚠ **Prismotoren er ikke lavet om.** Formen — biler, poster, agenter — er
uændret; det er KILDEN der er flyttet. Ændrede vi begge dele på én gang, ville
en fejl i regnestykket ligne en fejl i flytningen. Eksempelberegningen giver
**10.727,00 kr** både før og efter, og en prøve holder tallet fast.

⚠ **Bilens sats nøgles på KØRETØJET** (`bil-<koeretoejId>`), og navnet slås op
i `koeretoejer`. Den gamle fil skrev navn og registreringsnummer af fra
`demo-flaade.js` i hånden, og dens egen kommentar advarede om at de to skulle
holdes ens. Findes bilen ikke, udelades satsen — et navn vi selv fandt på,
ville ellers stå på en linje i et estimat.

⚠ **Passagernes id'er er uændrede** (`faerge:femern`, `bro:storebaelt` …).
Etapernes `passager`-kort peger på dem, og et nyt navn ville have gjort hver
eneste etape til en tur uden færge, uden at nogen havde rørt etapen. Kolon er
tilladt i en RTDB-nøgle; det var **punktum** der var fejlen i etape 2.

⚠ **Og skærmens egen kopi af divisionsfilteret er væk.** Den manglede leddet
om at en post UDEN division vises i BEGGE — og den fejl ville have tømt
biltabellen i både Gods og Bus uden at nogen havde slettet en bil. Filens
gamle kommentar bad selv om rettelsen; nu ejer `useListe` reglen.

**Tilbage:** etape 6 — afregningsskærmen, der samler linjerne for en kunde i
en periode.


---

## 9. Etape 6 er inde — afregningen, ikke fakturaen

Skærmen **Warehouse → Afregning** samler linjerne for én kunde i perioden:
hændelser, mængde, sats, hvor prisen kom fra, og beløb. Den bygger på
`afregningslinjer()` og `satsopslag()` — den regner ikke selv, så to skærme
ikke kan blive uenige om det samme lager i den samme periode.

⚠ **En linje uden sats udelades ikke.** Den står med "mangler", og summen kan
så ikke gøres op — med en henvisning til hvor prisen sættes. Udelod vi den,
ville totalen se komplet ud mens en ydelse manglede sin pris.

⚠ **Perioden kommer fra shellen.** Modulet laver ikke sin egen vælger; to
vælgere kunne blive uenige om hvad tallene dækker. Prisen er at afregningen
følger "seneste N dage" og ikke en kalendermåned — og det skal den, den dag et
grundlag skal fryses. Det står på skærmen.

### ⚠ Hvorfor der ikke blev oprettet et fakturagrundlag herfra ⟨lukket i §10⟩

To ting manglede, og ingen af dem hørte i den her etape:

1. **`grundlag` fandtes ikke som node** i `firebase.rules.json`.
   `Fakturering.jsx` kørte på `demo-grundlag.js` alene.
2. **Nummerserier var et kendt hul.** Et grundlag skal have et nummer fra en
   counter i en transaction, og den Cloud Function fandtes ikke.

En knap der lovede en faktura, ville love noget platformen ikke kunne. Og
godkendelsen hører ét sted — beslutning 12. Det stod skrevet **på skærmen**
frem for kun her, og prøven i `priser.test.mjs` holdt teksten ærlig: den faldt
begge gange virkeligheden flyttede sig — først da noden kom, og igen da vejen
ind kom. Se §10.

**Efterprøvet med rigtige data i DEV:** en standardpris sat gennem
Standardpriser-skærmen (45,00 kr. for håndtering ind, 120,00 kr. for flytning)
ender som **1.035,00 kr.** på Skagen Seafoods afregning, med kilden
"Standard" på hver linje — og de tre optællinger i perioden tælles ikke med.

---

## 10. Etape 7 er inde — vejen fra afregning til fakturagrundlag

De to huller i §9 er lukket, og det er nu én kæde man kan klikke igennem:

**Warehouse → Afregning** har en knap, **Opret fakturagrundlag**. Den skriver
ikke selv — den kalder `grundlagskriv`, og noden er stadig `.write: false`
**for alle, også admin**. Tre ting kan ikke håndhæves af en klient: nummeret
kommer fra en counter i en transaction (beslutning 8), tilstandsskiftet følger
`kanGodkende()`, og et låst grundlag må aldrig kunne ændres.

**Økonomi → Fakturering** godkender og låser. Godkendelsen sker ét sted
(beslutning 12) — afregningen opretter kun kladden.

### Hvad kæden gør, og hvad den nægter

| Trin | Hvem | Hvad spærrer |
|---|---|---|
| Opret | `grundlag.skriv` | linjer uden sats kommer ikke med, og **antallet vises** |
| Godkend | `grundlag.godkend` | åben etape, allerede godkendt, erstattet |
| Lås | `grundlag.godkend` | manglende momssats, allerede låst, manglende reference |

⚠ **En linje uden sats kommer ikke med — og skærmen siger hvor mange.** Den
kan ikke faktureres, og et grundlag med en linje på `null` kan ikke gøres op.
Sker udeladelsen tavst, er resultatet en for lav faktura som ingen kan se.

⚠ **Momssatsen sættes ikke.** Afregningen kender den ikke, og vi gætter ikke
25 %. Grundlaget oprettes uden, og **eksporten er spærret** indtil en
bogholder har svaret. Det er beslutning 25, gjort synlig: `GRL-2026-00002`
kunne godkendes i DEV, men ikke låses.

### To ting klikket fandt, som hverken prøver eller probe gjorde

1. **RTDB har ingen arrays.** `linjer` og `historik` kommer hjem som objekter,
   og hver funktion i `grundlag.js` itererer dem. Serveren havde oversættelsen
   — som en **afskrift** inde i `hentGrundlag()`. Klienten havde den ikke, og
   Fakturering blev **hvid** på det første rigtige grundlag. Oversættelsen er
   nu `fraDb()` i den delte fil, og begge sider kalder den.

2. **At kunne eksporteres og at kunne låses er to spørgsmål.** Et låst
   grundlag må gerne eksporteres igen — filen kan være gået tabt i den anden
   ende — men ikke låses igen: så ville `eksportReference` og `laastMs` blive
   overskrevet, og den første eksport forsvinde uden spor. Skærmen tilbød det,
   fordi den spurgte `kanEksportere()`; kaldet nåede frem til `laas()`, som
   kaster en rå `Error` — og den kom ud af funktionen som **"INTERNAL"**.
   `kanLaase()` er nu det spørgsmål, begge steder.

**Efterprøvet i DEV, klikket igennem i skærmene:** Skagen Seafoods afregning
på 1.035,00 kr. blev til `GRL-2026-00002` som kladde, godkendt fra
Fakturering, og spærret for låsning på den manglende momssats.
`GRL-2026-00389` blev låst mod referencen "e-conomic bilag 4471", og derefter
kunne den hverken godkendes eller låses igen. Funktionsprøven dækker de otte
afvisninger: casehandleren kan oprette men ikke godkende, chaufføren
ingenting, koordinatoren begge dele.

### Det der stadig mangler

- **Momssatsen pr. linje.** Der er ingen skærm der sætter den. Spørgsmålet er
  ikke teknisk: en bogholder skal svare på om lagerydelser er 25 % eller
  noget andet, og indtil da er eksporten spærret — hvilket er det rigtige svar.
- **Eksporten selv.** `eksporter()` bygger objektet, men intet sender det
  nogen steder hen. Låsningen bærer referencen, som er bindingen til
  regnskabet; formatet i den anden ende er ikke afklaret.
- **Opbevaring pr. palle pr. dag.** Kræver en daglig måling og kan ikke
  regnes bagud — se `warehouse.js`.

---

## 11. Kataloget fik en ydelse mere: m² pr. døgn

Warehouse etape 8 — volumenkalkulatoren — bad om det tredje opbevaringsgrundlag.
Planchen har hele tiden sagt *"m², m³, paller"*, men kataloget havde kun de to.

`lager-kvadratmeter` med metoden `prKvadratmeterdoegn` er nu i `LAGERYDELSER`.
Gods der ikke kan stables, lægger beslag på **gulv** uanset højden; solgtes det
som m³, ville en vognmand fakturere en tredjedel af hvad pladsen koster ham.

⚠ **Der skulle ingenting ændres andre steder.** Standardpriser- og
Kundepriser-skærmene enumererer kataloget frem for at have hver sin liste, og
ydelsen dukkede op af sig selv i begge — set med egne øjne i DEV. Reglerne
validerer `metode` som en streng på højst 40 tegn og skulle heller ikke røres:
en ny beregningsmetode er ikke en regelændring. Det er hele gevinsten ved at
kataloget er ÉT sted, og det var værd at efterprøve frem for at antage.

⚠ **Og de tre grundlag udelukker hinanden.** Paller, m³ og m² er tre måder at
måle det samme gods på. `KAPACITETSGRUNDLAG` i `volumen.js` gør det til et
VALG frem for tre felter — tre felter ville blive udfyldt, og så faktureres den
samme plads tre gange.
