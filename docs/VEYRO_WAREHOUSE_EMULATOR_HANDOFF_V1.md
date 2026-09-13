# WAREHOUSE – emulatoroverlevering V1

Dato: 2026-09-13

## Ansvar og afgrænsning

UNIT-sporet har det fungerende lokale emulator-runtime og ejer den fælles
regelstramning for direkte skrivning til `kasser`. Samlings-Codex ejer den
efterfølgende kørsel på den samlede branch. WAREHOUSE-sporet gentager ikke det
kendte loopback-fejlspor på sin egen vært uden en konkret miljøændring.

Resultater fra UNIT-sporets isolerede branch er nyttig kontraktevidens, men er
ikke et bestået resultat for den samlede WAREHOUSE/UNIT-browsermatrix, før den
fælles commit er samlet, og forløbet er kørt fra begge faktiske brugerflader.

## Reproducerbar kommando

Fra repository-roden i UNIT-sporets branch:

```powershell
node scripts/unitbooking-auth-functions-qa.mjs artifacts/unitbooking-v2/runtime
```

Kørslen bruger `firebase.unitbooking-test.json` og skriver maskinlæsbar evidens
til:

```text
artifacts/unitbooking-v2/runtime/UNITBOOKING_AUTH_FUNCTIONS_QA.json
```

Kommandoen skal køres med projektets JDK 21 og de normale lokalt installerede
Firebase-afhængigheder. Den må kun pege på syntetiske emulator-data.

## Krævet testdata og kontrolpunkter

Den ansvarlige skal bevare eller oprette syntetiske poster for:

- to tenants med hver sin bruger og mindst én lokation;
- en bruger med kun UNIT Booking, en med kun WAREHOUSE og en med begge moduler;
- en bruger uden den krævede skriverettighed;
- en eksisterende unit med stabil QR-identitet, faktisk placering og valgfri
  foreslået hjemplads;
- en aktiv booking med menneskeligt sagsnummer og periode;
- en modtagelsesplads og en anden endelig lagerplads;
- faste operation-id'er, så samme payload kan gentages, og samme id med en
  modstridende payload kan afvises;
- to samtidige, modstridende fysiske handlinger på samme unit.

Kørslen skal bevise og gemme assertions for:

1. WAREHOUSE alene: opret uden hjemplads, mærk/opslå, modtag på påkrævet
   modtagelsesplads, flyt og udlever.
2. UNIT alene: QR-, unit- og lokationsfunktionerne virker uden WAREHOUSE-adgang.
3. Begge moduler: samme unit-id, QR og `pladsId` ses gennem begge faktiske
   brugerflader.
4. Booking ændrer ikke fysisk placering; faktisk udlevering giver præcis én
   afgang; retur giver præcis én tilgang; modtagelsesplads og senere flytning
   giver de forventede append-only bevægelser.
5. Gentaget identisk operation giver `gentaget: true` uden ekstra bevægelse.
   Modstridende genbrug af operation-id afvises.
6. Samtidige modstridende handlinger får højst én gyldig vinder og efterlader
   unit, booking og historik konsistente.
7. Forkert tenant og manglende modul/permission afvises.
8. Direkte klientskrivning kan fortsat ændre tilladte ikke-fysiske stamdata,
   men kan ikke ændre `pladsId`, fysisk status eller `unitbevaegelser`.

## Browsermatrix, som stadig kræver samlingsmiljøet

Server-QA kan dokumentere adgang, atomicitet og idempotens, men erstatter ikke
browserkontrollen. Følgende markeres derfor ikke som bestået, før samlings-Codex
har kørt dem mod den samlede emulator:

- WAREHOUSE alene og UNIT alene med korrekte rettigheder;
- fælles QR-opslag og placering gennem begge faktiske brugerflader;
- booking → udlevering → retur → modtagelsesplads → endelig placering;
- præcis én fysisk bevægelse ved browsergenforsøg;
- samtidige modstridende handlinger;
- forkert tenant og manglende rettigheder.

## Resultat i integrationssporet 2026-09-13

WAREHOUSE-checkpointet `37bba72ec73e33369479b236454a1a1e913a208c`
er integreret med fuld historik. Samlingssporet har lukket direkte
klientskrivning til `pladsId` og de fysiske statusværdier, og den isolerede
Auth/Functions/Database/Storage-QA har bestået for:

- WAREHOUSE alene og UNIT alene på servergrænsen;
- fælles unit-id, QR og lokation;
- idempotent oprettelse, flytning og retur;
- præcis én vinder ved to samtidige, modstridende handlinger;
- afvisning af fremmed tenant, manglende permission og direkte fysisk skriv;
- en WAREHOUSE-retur, der lukker en syntetisk allerede-udlånt booking.

Browserkontrollen har desuden verificeret skjult navigation og lukket direkte
rute i begge retninger samt samme `QA-UNIT-SHARED` og placering gennem de to
faktiske brugerflader. Den gamle integrerede UNIT-klient er ikke brugt som
bevis for hele bookingens serverflow. Booking → klargøring → udlevering →
WAREHOUSE → retur → modtagelsesplads → endelig placering afventer fortsat et
eksplicit afleveret og autoriseret UNIT-checkpoint i integrationshistorikken.

Det maskinlæsbare WAREHOUSE-bevis ligger i
`artifacts/warehouse-v2/runtime/WAREHOUSE_AUTH_FUNCTIONS_QA.json`.
