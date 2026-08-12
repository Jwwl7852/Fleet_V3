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

### 3.2 Standardprisen — versioneret

```
standardpriser/<ydelseId>/satser/<id> = { gyldigFra, beloebOere, aktiv }
```

⚠ **Beslutning 7 gælder uændret:** en sats overskrives ALDRIG. Rettes prisen i
dag, kommer der en ny post med `gyldigFra` — ellers ændrer en rettelse prisen
på en booking fra sidste kvartal, og så kan fakturaen ikke forklares.

### 3.3 Kundens afvigelse — også versioneret

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

### 3.4 Opslaget

```
prisFor(ydelseId, kundeId, paaMs)
  → kundens egen sats på tidspunktet      (hvis der er en)
  → ellers standard × (1 − rabat)          (hvis der er en rabat)
  → ellers standarden
  → ellers null
```

⚠ **`null`, ikke 0.** En ydelse uden pris er et ubesvaret spørgsmål, ikke en
gratis ydelse. Samme regel som momssatsen der mangler.

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

### ⚠ 4.1 Hvad sker der med `prisgruppe`?

Kunden har i dag `prisgruppe: "A"`. Din model er **standard + afvigelse pr.
kunde**, og så er prisgruppen et tredje lag i midten.

`Kunder.jsx` skriver selv i sit hoved at *"vi har ikke et gruppebegreb ved
siden af prisgruppen, og at opfinde et ville være to måder at inddele de samme
kunder på"*. Tre lag ville være det samme problem én gang til.

**Forslag: prisgruppen udgår** som prisbærer og bliver et rent
filtrerings-/rapporteringsfelt — eller fjernes helt. Alternativet er at
standardprisen ER prisgruppe "A", og at man kan have flere standardlister.

### ⚠ 4.2 Flytter Bookingopsætning helt?

Skærmen hedder *Bookingopsætning* og indeholder to ting: **satser** (priser) og
**regelsæt** (automatik). Skal begge til Kunder & Priser, eller kun priserne?

**Forslag: kun priserne flytter.** Regelsættene er ikke priser, og en skærm der
hedder Kunder & Priser skal ikke rumme bookingautomatik.

### ⚠ 4.3 Hvor mange klik må en pris koste?

Med versionering får hver prisændring en ny post med `gyldigFra`. Det er
rigtigt for regnskabet og tungt i hverdagen.

**Forslag:** feltet redigeres direkte, og systemet laver selv den nye post med
`gyldigFra = i dag`. Vil man have en pris til at gælde fra den 1., vælger man
datoen. Det er samme greb som prislisten i ejerkonsollen.

---

## 5. Etaper

| # | Hvad | Værdi alene |
|---|---|---|
| 1 | **Ydelseskataloget** + de tre nye metoder i `pricing.js` | Der findes en liste over hvad der kan prissættes |
| 2 | **Standardpriser** — node, regler, prøver, skærm i Kunder & Priser | Vognmanden kan sætte sine priser |
| 3 | **Kundens afvigelse** — egen pris eller rabat, pr. ydelse | Den enkelte kunde kan få sin aftale |
| 4 | **`prisFor()`** og snapshot — én opslagsvej for hele platformen | Priserne bruges ét sted fra |
| 5 | **Bookingopsætnings satsark flyttes** fra JSX til databasen | Det hardkodede forsvinder |
| 6 | **Warehouse-afregningen kobles på** | Lageret kan faktureres |

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
