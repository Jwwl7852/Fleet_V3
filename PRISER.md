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
| Satsarket (biler, poster, agenter) | `Bookingopsaetning.jsx` | ⚠ **HARDKODET I JSX-FILEN.** Det står ikke i databasen |
| `satser`-noden | `firebase.rules.json` | Findes, med `gyldigFra`-indeks — men **intet skriver til den** |
| Prisgruppe | `kunder/<id>.prisgruppe` | "A"/"B". Peger på et satssæt der ikke findes som data |
| Lagersatser | `lagre/<id>/{satser,haandteringSatser}` | Node findes, bruges af `beregnForloeb()` |
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

### ✅ 4.2 BESVARET: hele skærmen flytter

Skærmen hedder *Bookingopsætning* og indeholder to ting: **satser** (priser) og
**regelsæt** (automatik). Skal begge til Kunder & Priser, eller kun priserne?

**Bookingopsætning nedlægges.** Både satserne og regelsættene flytter under
Kunder & Priser.

⚠ **Det gør Kunder & Priser til en skærm med undermenuer**, ikke ét kort. Og
det betyder at ruten `/booking/opsaetning` forsvinder — den skal have en
redirect, ikke bare fjernes, for den står i sidebaren i dag og kan være
bogmærket. Se `legacy` i nav.js.

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
| 5 | **Bookingopsætnings satsark flyttes** fra JSX til databasen | Det hardkodede forsvinder | |
| 6 | **Warehouse-afregningen kobles på** | Lageret kan faktureres | |

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
