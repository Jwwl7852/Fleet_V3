# FleetControl 3.0

Samlet platform. Én shell, én informationsarkitektur, én talkilde.

Udgangspunktet var 20 mockups fordelt på tre uforenelige designretninger og en
deployet v1.4 på bookingcontrol.netlify.app. v3.0 samler dem. Alt der stod i
konflikt er afgjort — beslutningerne står nedenfor, så du kan omgøre dem
enkeltvis i stedet for at skulle finde ud af hvorfor noget ser ud som det gør.

## Kom i gang

```bash
npm install
cp .env.example .env.local     # udfyld Firebase-nøglerne
npm run dev
```

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

## Struktur

```
src/
  App.jsx              alle 26 ruter, genereret efter nav.js
  firebase.js          ÉN initialisering. Moduler importerer db herfra.
  fleet/               kernen — modulerne må ikke duplikere noget herfra
    nav.js             sidebar + ruter, én kilde
    AppShell.jsx       layout: sidebar, topbar, Outlet
    FleetContext.jsx   tenant, periode, Gods/Bus
    useKpi.js          nøgletal + demo-datasæt
    format.js          øre, datoer, ugenr, fortegnskonvention
    pricing.js         prismotor: satsopslag, beregning, snapshot
    reservations.js    reservationer + konfliktdetektion
    booking-state.js   tilstande, roller, overgange
    ui.jsx             Kort, KpiKort, Tabel, Pille, Tom, Fejl, Knap
    fleet.css          tokens (udvider de eksisterende --bc-*)
  moduler/             26 skærme
```

## Status

**Bygget:** Dashboard (referencemodul — start her når du skriver et nyt),
Bookingopsætning (prismotoren i brug).

**Skelet med mockup (15):** Booking-oversigt, Ny forespørgsel, Forslag,
Disponering, Bemanding, Flåde, Værkstedskalender, Facility ×3, Indkøb ×2,
Kunder, Økonomi.

**Skelet uden mockup (9):** Live-kort, Kompetencer, Ferie & fravær,
Indberetninger, Leverandører, Fakturering, Opsætning ×4.

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
| 4 | Central audit-service | |
| 5 | `securityLevel: normal \| internal \| confidential \| restricted` | |
| 6 | Sensitive felter i separat RTDB-node | |

Punkt 3 er værd at læse to gange. En permission der kun findes i frontend, er
ikke adgangskontrol — det er en pæn knap. Definition of done er en afvisning
fra serveren.

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

**Derefter stopper sikkerhedsarbejdet**, og næste skærme bygges i denne
rækkefølge:

> Bemanding → Ferie & fravær → Værkstedskalender → Disponering

Disponering ligger sidst, fordi den læser de reservationer som fravær og
værksted skriver. Bygges den først, disponerer den på en kalender der endnu
ikke ved noget om syge chauffører eller biler på værksted.

Se `ARKITEKTUR.md` for datamodellen og `CLAUDE.md` hvis du arbejder videre med
Claude Code.
