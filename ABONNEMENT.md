# Abonnementsfakturering — specifikation

FleetControl fakturerer vognmanden. Priser pr. modul, rabat pr. kunde,
fakturagrundlag pr. periode, eksport til bogholderiet.

Bygger oven på `EJERKONSOL.md` og beslutning 32–35. **Læs `grundlag.js` før
du skriver én linje regnestykke** — aritmetikken findes allerede.

---

## 0. Fire ting der skal rettes i det oprindelige forslag

Forslaget kom fra en model der kun kunne se `index.html`. Det er godt på
principperne og forkert på fire punkter, hvor repoet allerede har svaret.

### 1. ⚠ Regnestykket findes. Byg det ikke igen

Forslaget beskriver linjer, afrunding pr. linje og moms som noget nyt.
`src/fleet/grundlag.js` har det:

```js
export const ANTAL_SKALA = 1000;
export const linjeBeloebOere = (l) =>
  Math.round(((l?.antal || 0) * (l?.satsOere || 0)) / ANTAL_SKALA);
export function linjeMomsOere(l) {
  if (!Number.isFinite(l?.momssats)) return null;   // ikke 0, og ikke 25
  return Math.round((linjeBeloebOere(l) * l.momssats) / 100);
}
```

Afrunding pr. linje, én gang, aldrig på totalen — med begrundelsen skrevet
ved siden af. **To afrundingsregler i ét repo er den fejl vi bliver ved med
at betale for.** Abonnementslinjer får samme form (`antal`, `satsOere`,
`momssats`) og bruger de samme funktioner.

Domænet er et andet — FleetControl → vognmand frem for vognmand → hans kunde
— så **dokumentet** er sit eget. Regnestykket er ikke.

### 2. ⚠ Momsen må ikke være en konstant

Forslaget skriver "25 % på danske erhvervskunder". Det bryder en regel der
allerede står i `CLAUDE.md`:

> **Sætte en momssats fordi den mangler.** Ikke 25, ikke 0. Eksporten nægtes
> uden — det er det rigtige svar, indtil en bogholder har svaret. Et system
> der gætter rigtigt ni gange ud af ti, lærer brugeren at stole på det tiende.

`totaler()` sætter allerede `momsOere: null`, hvis bare én linje mangler sin
sats, og `kanEksportere()` afviser. Satsen står på **prislistens linje**, ikke
i koden. EU-kunder uden dansk moms kræver da ingen ændring — kun en anden
sats.

### 3. Navnet er `udbyder/`, ikke `platform/`

Der findes ingen `platform`-node. Ejerindekset hedder `udbyder/kunder`, og
`udbyder === true` er claim'et. En spec der navngiver noget der ikke findes,
får den næste til at lede.

### 4. Rækkefølgen er allerede fulgt

Forslaget slutter med: *håndhæv moduler i `firebase.rules.json` før du bygger
prisskærmen.* Det er gjort — **beslutning 33**, 27 regler, læsning og
skrivning, efterprøvet mod den udrullede base. Et modul du kan fakturere for
men ikke fratage, findes ikke længere.

---

## 1. Det forslaget har ret i, og hvorfor det er vigtigt

**Priser skal versioneres.** Repoet har allerede idiomet — `CLAUDE.md`:
*"Overskrive en sats. Ny post med `gyldigFra`."* Prislisten følger det.

**Men versionering er ikke det der beskytter marts-fakturaen.** Det gør
**frysningen**. Et genereret grundlag gemmer sine egne `satsOere` og regner
aldrig igen. Selv hvis nogen redigerede prislisten, står marts uændret.
Versionering giver sporbarhed; frysning giver garantien. De to forveksles, og
så bygger man den ene og tror man har den anden.

**Modulændringer skal være en hændelse, ikke en tilstand.** Rigtigt, og det
er den dyreste del at udsætte: en tilstand kan ikke rekonstrueres bagud.

**Grundlaget eksporteres — FleetControl bliver ikke et bogføringssystem.**
Enig, og `eksporter()` i `grundlag.js` har allerede formen, med
`EKSPORT_FORMAT_VERSION` og beløb i øre.

---

## 2. Datamodellen

### Prislisten

```
udbyder/prisliste/<pushId>/
  gyldigFraMs: 1767225600000
  oprettetAf:  <ejerUid>
  moduler/
    flaade/   { satsOere: 49500, momssats: 25 }
    booking/  { satsOere: 79500, momssats: 25 }
    …
```

`.read` for `udbyder === true`. `.write: false` — en ny prisliste lægges af
en funktion, og en gammel rettes aldrig. Nøglen er et push-id, ikke
`"2026-01"`: et navn nogen selv har skrevet, inviterer til at blive genbrugt.

⚠ **Momssatsen står på linjen, ikke i koden.** Se punkt 0.2.

### Abonnementet — udvides

```
tenants/<id>/abonnement/
  status:     aktiv | paused | opsagt      ← findes
  aendretMs, aendretAf, aarsag             ← findes
  rabatBps:   1500                         ← NY, 15,00 %
  interval:   "maaned"                     ← NY
  startetMs:  1767225600000                ← NY
```

**Rabat i basispoint, som beløb er i øre.** `15.5` som float giver
afrundingsfejl der først dukker op på faktura nummer fyrre. Samme begrundelse
som beslutning 2 og som `laengdeMm`.

⚠ **Noden har `"$andet": { ".validate": false }`.** De tre nye felter kan
ikke skrives, før reglerne kender dem — med validering af hver enkelt. Det er
med vilje; en ny feltvej skal ses.

Bemærk: **ingen `prislisteVersion` på abonnementet.** Grundlaget fryser sine
satser, og den gældende prisliste findes af `gyldigFraMs`. Et felt der peger
på en version, ville skulle vedligeholdes ved hver prisændring — og den kunde
nogen glemte, ville blive faktureret efter en liste fra i fjor uden at nogen
kunne se det.

### Historikken — ÉN log, ikke to

```
tenants/<id>/abonnementHistorik/<pushId>/
  ms, afUid
  art:    "modul" | "status"
  modul:  "bemanding"        // art = modul
  til:    true | false       // art = modul
  status: "paused"           // art = status
  aarsag: "betaling"         // art = status, allowliste
```

Forslaget foreslog `modulHistorik`. **Statussen har samme problem:** en kunde
der sættes på pause den 8. og genåbnes den 21., skal faktureres for to
stykker af måneden — og `abonnement.status` kender kun nuet. To logs for det
samme spørgsmål ("hvad havde kunden hvornår") ville drive.

⚠ **Hvorfor ikke bare auditloggen?** Den skrives allerede ved hvert
modulskift. Men den er skrevet til at kunne *stilles nogen til regnskab*, ikke
til at *regne penge*: `note` er en afkortet streng på 120 tegn,
`LOGBARE_FELTER` filtrerer værdier væk, og retention er 24 måneder mens
bogføringspligten peger mod fem år. **En log man fakturerer efter, må ikke
kunne afkortes.** De to skrives i samme kald, og de svarer på hver sit.

⚠ **Historik kan ikke laves bagud.** Nordvest og demo har ingen. Første
periode må faktureres på nuværende tilstand, og det skal stå på grundlaget.

### Fakturagrundlaget — frosset

```
udbyder/fakturagrundlag/<periode>/<kundeId>/
  genereretMs, genereretAf
  periodeFra, periodeTil
  linjer: [{
    modul, antal, satsOere, momssats,
    listeprisOere, rabatBps,          // dokumentation, ikke regnegrundlag
    prislisteId, dage
  }]
  laast: true
```

`antal` er dage i `ANTAL_SKALA`, så `linjeBeloebOere()` virker uændret: en
kunde der havde Bemanding i 19 af 31 dage får `antal = 19000/31`… nej —
**læs videre under Afrunding.**

---

## 3. Afrunding og rabat — den ene ting der skal være helt præcis

⚠ **RABATTEN MÅ IKKE VÆRE EN EKSTRA AFRUNDING.** `linjeBeloebOere()` runder
én gang. Lægger man en rabatberegning ovenpå, runder man to gange, og summen
af linjerne holder op med at stemme med totalen — nøjagtig den slags
uoverensstemmelse en revisor finder.

Rabatten regnes derfor ind i **satsen**, én gang, når grundlaget genereres:

```js
satsOere = Math.round((listeprisOere * (10000 - rabatBps)) / 10000);
```

Linjen bærer både `listeprisOere` og `rabatBps`, så rabatten kan dokumenteres
— men det er `satsOere` der regnes med. **Ét tal går ind i regnestykket.**

**Forholdsmæssige perioder** går i `antal`, ikke i satsen:
`antal = antalFraTal(dageMedModulet / dageIPerioden)`. Så er en fuld måned
`antal = 1000` og 19 af 31 dage `antal = 613`, og `linjeBeloebOere` er
uændret. Alternativet — at regne en dagspris — ville lave en anden afrunding
pr. dag.

**Alternativ vi IKKE tager:** rabat som sin egen negative linje. Den er
almindelig i bogholderi og gør rabatten synlig på fakturaen — men den
fordobler antallet af linjer og gør `totaler()` afhængig af linjernes
rækkefølge. Vælges den senere, er det en beslutning, ikke en oprydning.

---

## 4. Tre svar

**Faktureres en kunde på pause? Nej.** Og det gør `paused` til en
**kommerciel** handling, ikke kun en teknisk. Det er en ændring af beslutning
32, som netop gjorde pause billig at rulle tilbage: nu koster en fejlagtig
pause penge. Konsollen skal derfor sige det på knappen, og `opsagt` regnes
til og med den dag den blev sat.

**Momsen:** se punkt 0.2. Ingen konstant.

**Eksport frem for fakturering:** enig. `eksporter()` har formen. Fakturanumre
og kreditnotaer hører i e-conomic — og `countere` i basen er kundens egne
nummerserier, ikke vores.

---

## 5. Prismodellen — BESVARET

**Er modulprisen fast pr. måned, eller afhænger den af antal biler eller
brugere?**

Det arkitektoniske svar, som forslaget ikke kunne give:

**Pr. enhed koster ikke en udvidelse af tenant-grænsen.** Ejeren kan ikke læse
`kpi/` eller `koeretoejer/` — reglerne giver ham tre noder pr. kunde, og det
skal blive ved. Men en **planlagt funktion med Admin SDK** kan tælle ved
periodens slutning og fryse tallet ind i grundlaget. Ingen regel løsnes, og
tællingen står i det dokument den hører til.

Det der reelt skal besluttes er **hvilket tal**: højeste antal i perioden,
antal ved periodens slutning, eller gennemsnit. Højeste er nemmest at
forsvare over for en kunde der skalerede op i tre dage — den er også den
dyreste for ham. Slutantal er nemmest at forklare og nemmest at omgå.

**Fast pris er væsentligt enklere** og kan ikke laves om, når kunderne har
vænnet sig til den.

---

## 6. Rækkefølge

1. **Reglerne for `abonnement`s tre nye felter + `udbyder/prisliste`.**
   Prøver, `regler:udrul`, efterprøvet mod driften.
2. **`abonnementHistorik`** — skrevet af `kundestatus` og `kundemoduler` i
   samme kald som auditposten. Den er værdifuld fra første dag og umulig at
   lave bagud.
3. **Prisliste-skærmen** i konsollen, og rabat pr. kunde.
4. **Generatoren** — én funktion, der fryser en periode og aldrig rører den
   igen. Med `laas` og `erstat` som i `grundlag.js`: en rettelse er et **nyt**
   grundlag der henviser til det gamle, ikke en redigering.
5. **Eksporten.**

Punkt 2 er det eneste der bliver dyrere af at vente.

---

## 7. Besvaret, og hvad det kostede

**Pris pr. modul, pr. bruger og pr. køretøj — og forskel på chauffør og
desktopbruger.** Bygget i `priser.js`, prøvet i `test/priser.test.mjs`.

**Faktureres på højeste antal aktive i perioden.**

⚠ **Det valg gør den daglige måling obligatorisk.** Et slutantal kan ikke
rekonstruere en top: en kunde med 30 chauffører den 3. og 8 den 31. ville
blive faktureret for 8. Vælger man toppen, *skal* der samples — og en
sampling kan ikke laves bagud.

### Målingen erstatter den hændelseslog jeg selv foreslog

Afsnit 2 foreslog `abonnementHistorik`. Den er droppet. En daglig måling
bærer **både** modullisten og statussen, så moduldage kan tælles direkte —
dage hvor modulet var slået til. To kilder til "hvad havde kunden hvornår"
ville drive fra hinanden, og målingen skal alligevel findes.

Auditloggen beholder sin egen post: den svarer på **hvem** der slog modulet
fra, og det er et andet spørgsmål end hvad der skal faktureres.

### Én måling i døgnet

```
udbyder/maalinger/<kundeId>/<YYYY-MM-DD>/
  ms, status, moduler: { flaade: true, … }
  brugere: { chauffoer: 12, desktop: 4 }, koeretoejer: 14
```

⚠ **Et modul der var tilvalgt i tre timer, faktureres ikke.** Det skal stå på
grundlaget, så ingen tror det er en fejl.

⚠ **Der står tal, ikke rækker.** To heltal og en modulliste — ingen navne,
ingen nummerplader, ingen mailadresser. Optællingen sker i en funktion med
Admin SDK, netop **for ikke at åbne én eneste regel**: havde vi i stedet
udvidet udbyder-claim'et til at læse `brugere` og `koeretoejer`, kunne en
browser med det claim se hver kundes flåde — for at kunne lave en optælling
der hører hjemme på en server.

### Toppen tages pr. brugerart for sig

En kunde med 30 chauffører den 3. og 9 desktopbrugere den 27. faktureres for
begge toppe, også selvom de aldrig var der samtidig. Alternativet — toppen af
den samlede regning — ville give to kunder med samme forbrug forskellig pris
afhængigt af rækkefølgen.

### Pause blev kommerciel

Dage med `paused` eller `opsagt` tælles ikke. Beslutning 32 gjorde pause
teknisk og billig at rulle tilbage; her koster en fejlagtig pause penge.
Konsollens knap skal sige det.

### Åbent, og bevidst

`03:10 UTC` er efter midnat i dansk tid året rundt, så en måling altid hører
til den dag den er stemplet med — også i sommertid.

**Skal påhæng koste mindre end en lastbil?** En trailer tæller lige nu som ét
køretøj. Bliver svaret nej, er det en ekstra sats i prislisten — ikke en
undtagelse i koden.
