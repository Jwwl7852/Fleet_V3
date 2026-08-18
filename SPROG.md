# Sprog — seks sprog på hele platformen

**Krav:** hele platformen skal kunne bruges på **dansk, svensk, engelsk, tysk,
fransk og hollandsk.**

Det er ikke bygget. Dokumentet her er ikke en plan for hvordan man oversætter
strenge — det er en liste over **hvad der IKKE må oversættes**, og over de tre
steder hvor kravet støder ind i noget der allerede er besluttet. Den del er
dyrere at opdage bagefter end at skrive ned nu.

---

## 1. Hvad der bliver dansk, uanset hvor mange sprog UI'et får

Platformen har **danske variabelnavne i domænelogikken** med vilje, og det
skal den blive ved med. Grænsen går ikke ved "kode mod tekst" — den går ved
**hvad der ligger i databasen, i et token eller i regelfilen.**

| Bliver dansk | Hvorfor |
|---|---|
| Nodenavne: `koeretoejer`, `opgaver`, `kasseudlaan` | Står i `firebase.rules.json`, i `.indexOn` og på hver eneste post |
| Feltnavne: `startMs`, `estimeretMin`, `leverandoerId` | Samme — og et feltnavn der ikke matcher dataene, er værre end intet katalog |
| **Enum-VÆRDIER**: `planlagt`, `normal`, `vaerksted`, `gods` | Står på hver post og i regelfilens `matches()`. Se punkt 2 |
| Modulnøgler: `flaade`, `indkoeb`, `booking` | Står i hver tenants `moduler/`-node og i udstedte tokens |
| Permissions: `opgaver.skriv` | **Mintet ind i JWT-tokens.** En omdøbning er en genudstedelse af alle tokens |
| Mappe- og filnavne | Billigst at lade være, og de er ikke brugerflade |

Det er samme grænse som da Flåde blev til Fleet: **navnet skifter, nøglen gør
ikke.** Se README's afsnit om de fem moduler der skiftede navn.

---

## 2. ⚠ Værdien og labelet er allerede skilt ad — og det var ikke gratis

Det vigtigste stykke forarbejde er gjort, og grunden står i `prioritet.js`:

```
lav:    { prioritet: "lav",    label: "Lav" }
normal: { prioritet: "normal", label: "Mellem" }
hoej:   { prioritet: "hoej",   label: "Høj" }
```

**Værdien er `normal`, labelet er "Mellem", og de blev ikke gjort ens.** Det
var oprindeligt et argument om en datamigrering for et ord. Med seks sprog er
det argumentet der bærer hele oversættelsen: `label` er det eneste der skal
have en svensk og en tysk udgave, og `prioritet` må aldrig få en.

Samme form findes allerede i:

- `OPGAVE_STATUS`, `ARBEJDSTYPE` (`opgaver.js`)
- `FORLOEB`, `HAENDELSE_ART` (`indberetninger.js`)
- `KOERETOEJ_STATUS` (`flaade.js`)
- `SAG_TILSTAND`, `VEDHAEFTNING_LABEL` (`sager.js`)
- `MODUL[...].label` (`moduler.js`)
- `SUPPORT_PRIORITET`, `SUPPORT_STATUS` (`support.js`)

⚠ **Og det er præcis de kataloger der IKKE må få en `label` pr. sprog som et
nyt felt i noden.** Oversættelsen hører i koden, ikke i kundens data — ellers
skal hver tenant vedligeholde seks oversættelser af "Planlagt".

---

## 3. ⚠ Tre steder hvor kravet støder ind i noget besluttet

### 3.1 Serveren afviser med skærmens egen SÆTNING

Det er en gennemgående regel i repoet, og den står flere steder:

> Serveren afviser med den SAMME sætning skærmen viste — to formuleringer af
> én spærring er to forklaringer på én ting.

`tjekDisponering()` i `disponering.js`, `valideOpgaveplan()` i
`opgaveplan-regler.js` og `kanSkifteEtape()` i `booking-state.js` returnerer
alle **danske sætninger**, og Cloud Functions kaster dem videre som
`HttpsError`-beskeder.

**Med seks sprog kan serveren ikke længere kende sætningen.** Den kender ikke
brugerens sprogvalg — og skulle den, ville sproget skulle med i hvert kald
eller i tokenet.

Reglen skal derfor omformuleres, ikke opgives:

> Serveren afviser med den samme **nøgle** som skærmen ville have vist, og
> klienten skriver sætningen.

Konsekvens: de tre funktioner skal returnere `{ noegle, felt, ...tal }` frem
for en streng. Det er en ændring i **delte** filer (`functions/delt/`), altså
med prøver og en udrulning. Og den gamle regel skal omskrives samme sted den
står, ellers står der to modstridende regler i repoet.

### 3.2 Formateringen er hårdkodet til `da-DK` — 42 steder

`format.js` bruger `Intl.NumberFormat("da-DK")` og
`toLocaleDateString("da-DK")`. Det rammer:

- **Decimalkomma mod -punktum.** `oereFraKroner()` *parser* brugerens
  indtastning. En tysk bruger skriver `1.234,56`, en engelsk `1,234.56` — og
  de to læses forskelligt af den samme funktion. ⚠ Det er ikke en visningsfejl;
  det er et **beløb der bliver forkert**, og beslutning 2 handler om netop
  præcisionen i beløb.
- **Datoformat.** `18-08-2026` mod `08/18/2026` mod `2026-08-18`.
- **Sortering.** `localeCompare(..., "da")` står i ti filer. Æ, Ø og Å sorterer
  ikke som Ä, Ö og Å gør på svensk — to lister af de samme kunder i to
  rækkefølger.
- **`filstoerrelse()`** og ugedagsnavne i `slotLabel()` (gitterkalenderen).

Sproget skal derfor være **ét sted**, som tokens er det: en `sprog.js` der
leverer locale til `format.js`, ikke et `"da-DK"` spredt ud over 42 kaldsteder.

### 3.3 ⚠ Seks sprog er IKKE seks valutaer

Svensk, tysk, fransk og hollandsk peger mod SEK og EUR. **Det er et helt andet
og meget større spørgsmål**, og det må ikke glide med ind i en
oversættelsesopgave:

- Beslutning 2: beløb gemmes som **øre som integer, ekskl. moms**. "Øre" er
  ikke et generisk navn for en minste enhed — feltet hedder `beloebOere` i
  noden, i reglerne og i prislisterne.
- Momssatsen er dansk og **gættes ikke** (`MOMSSATS` i `priser.js`). En
  udenlandsk kunde har en anden sats, og eksporten nægtes i dag uden en sats —
  det er det rigtige svar, indtil en bogholder har svaret.
- Frosne fakturagrundlag dokumenterer hvad der **blev** faktureret. En valuta
  der ændrer sig bagud, er et regnskabsbilag der er blevet uenigt med sig selv.

**Sprog kan bygges uden valuta.** En svensk bruger kan læse en dansk faktura på
svensk. Går man i gang med begge dele på én gang, kan man ikke se hvilken af de
to der gik galt.

---

## 4. Hvad der skal oversættes

Alt der vises for et menneske:

- Katalogernes `label` og `pill`-tekster (se punkt 2)
- Al tekst i `src/moduler/**` og `src/fleet/*.jsx`
- `nav.js`' `label`, `titel` og `under` — sidebaren og hver sides overskrift
- Fejl- og afvisningstekster (se punkt 3.1)
- `INTET`-markøren (—) bliver stående; den er et **tegn**, ikke et ord. Se
  `format.js` og `test/format.test.mjs`: skriver man sin egen markør, fejler
  prøven, og det gælder også en oversat en

⚠ **Kommentarerne i koden oversættes ikke.** De er skrevet på dansk og
forklarer hvorfor noget er som det er; en oversættelse ville være en kopi der
driver. Samme grund som at filhoveder beholder de danske navne ved siden af
`src/moduler/flaade/`.

---

## 5. Rækkefølge, hvis det bygges

1. **Ét sted for sproget.** `sprog.js` + locale ind i `format.js`. Uden det
   ligger `da-DK` stadig 42 steder, og hver ny skærm tilføjer et.
2. **Parsing før visning.** `oereFraKroner()` er den farlige: et forkert læst
   beløb er værre end en forkert vist dato.
3. **Katalogernes labels.** De er allerede skilt fra værdierne — det er
   mekanisk arbejde med lav risiko.
4. **Skærmteksterne.** Størst i mængde, mindst i risiko.
5. **Serverens afvisninger** (punkt 3.1). Sidst, fordi den ændrer delte filer
   og kræver en udrulning — og fordi de tre foregående punkter viser om
   nøglemodellen holder.

⚠ **Prøverne skal med i hvert punkt.** Der findes i dag prøver der hævder
danske strenge — `test/navne.test.mjs` leder efter "Køretøj", og
`test/format.test.mjs` låser `INTET`. De skal ikke bare rettes til; de skal
spørge om **nøglen** frem for om ordet, ellers fælder de sig selv ved første
oversættelse.
