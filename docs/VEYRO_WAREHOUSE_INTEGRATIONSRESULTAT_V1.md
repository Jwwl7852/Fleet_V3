# WAREHOUSE – integrationsresultat V1

Dato: 2026-09-13  
Branch: `codex/veyro-integration-v1`

## Sporbarhed

- Start efter WORKFORCE: `8eb78ae846bcb54c0551da8d3a82eacc673b98df`.
- WAREHOUSE-checkpoint: `37bba72ec73e33369479b236454a1a1e913a208c`.
- Tidligere checkpoint `b2650eaae5f2b491fbc3ddc481c8d18eb918bb38`
  er forfader til det nye checkpoint og er derfor ikke lagt ind to gange.
- Eksplicit merge-commit: `130a89de34400e54822fe46e0655c7e280c2a7bb`.
- Integrationstilpasning: `b93191e` (`Integrer WAREHOUSE med sikker
  unitbevaegelse`).

Kildeworktreeets egne artefakter og andre worktrees er ikke ændret. Ingen push,
deployment, produktionsdata eller eksterne tjenester indgår.

## Implementeret i samlingen

- WAREHOUSE-leverancens navigation, overblik, scan/unitvisning, varer,
  bevægelser, pluk, optælling, modtagelse, carriers, labels, sporbarhed,
  lokationer, volumen og eksisterende afregningsgrænse er bevaret.
- `unitlageropret` og `unitlagerhandling` er servertransaktioner med stabile
  operation-id'er. Identisk genforsøg giver ikke en ekstra bevægelse.
- WAREHOUSE-initierede fysiske handlinger kræver `forventetPladsId`.
  Preconditionen kontrolleres inde i samme transaktion som unit, booking og
  append-only bevægelseshistorik.
- Direkte klientskrivning kan fortsat ændre lovlige, ikke-fysiske stamdata,
  men Rules afviser `pladsId`, fysisk status og `unitbevaegelser`.
- WAREHOUSE og UNITBOOKING har separate modulgates i routeren. Et skjult
  menupunkt kan ikke omgås med en direkte URL, og modulets skærme indlæses ikke
  ved manglende modulabonnement.
- De syntetiske lokationer bruger samme strukturerede pladsfelter som
  brugerfladerne, så navn og placering kan sammenlignes meningsfuldt.

Ingen root-dependency eller lockfil er ændret i denne etape.

## Isoleret emulator-QA

Projekt: `demo-veyro-warehouse-integration-test`  
Auth `127.0.0.1:9121`, Database `127.0.0.1:9022`, Functions
`127.0.0.1:5024`, Storage `127.0.0.1:9231`.

Firebase CLI 15.30.0 blev startet med den eksisterende portable Temurin
21.0.12.1 fra
`C:\Users\DennisChristensen\Tools\Adoptium\jdk-21.0.12.1+1\jdk-21.0.12.1+1`.
`JAVA_HOME`, `PATH` og Netty-workarounden var kun sat i emulatorprocessen.
Der blev ikke installeret Java eller ændret globale indstillinger.

`node scripts/warehouse-auth-functions-qa.mjs artifacts/warehouse-v2/runtime`
bestod og dokumenterer:

- WAREHOUSE-only oprettelse og idempotent genforsøg;
- UNIT-only callable-bevægelse uden WAREHOUSE-abonnement;
- fælles QR/unit/lokation, retur af seedet udlånt booking og én bevægelse ved
  genforsøg;
- manglende permission, fremmed tenant og direkte fysisk skriv afvist;
- tilladt ikke-fysisk noteændring;
- to samtidige modstridende handlinger: én vinder og én `aborted`;
- 1.200 ekstra syntetiske tenantposter, 69.772 bytes og 52 ms for den målte
  oprettelse. Det er en lokal risikomåling, ikke en kapacitetsgaranti.

Den komplette Rules-gate på samme produktkode bestod 4.535/4.535 i 889
suites. Den efterfølgende routeændring berørte ikke Rules eller Functions;
routekontrakten blev genprøvet særskilt.

## Browser- og buildbevis

Den isolerede app blev afprøvet på `http://127.0.0.1:5223` med ovenstående
emulatorer og syntetiske brugere:

- WAREHOUSE-only: kun WAREHOUSE i navigationen; `QA-UNIT-001` blev slået op
  og flyttet gennem den faktiske WAREHOUSE-skærm.
- UNIT-only: WAREHOUSE skjult, og direkte `/warehouse/units` viste "Ingen
  adgang til WAREHOUSE" uden moduldata.
- WAREHOUSE-only: direkte `/unitbooking` viste "Ingen adgang til UNITBOOKING".
- Begge moduler: `QA-UNIT-SHARED` stod på `Syntetisk lager · Reol B` både i
  WAREHOUSEs unitvisning og UNITBOOKINGs faktiske kasseliste.
- Anonym direkte `/warehouse/units` blev sendt til login.
- Konsollen havde ingen nye fejl; kun de kendte React Router v7-future-flag-
  advarsler blev observeret.

Aktuel målrettet regression efter routeændringen: 59/59. Root lint bestod.
Produktionsbuilden bestod med 727 transformerede moduler og lazy WAREHOUSE-
chunks. Den kendte store PROCURE-chunk gav fortsat alene størrelsesadvarsel.
Whitespace-kontrollen bestod.

## Afgrænsning og restpunkt til UNIT

WAREHOUSEs selvstændige backend er verificeret, men hele kombinationen må ikke
kaldes samlet backend-verificeret endnu. Det nuværende integrations-UNIT er den
ældre variant og er ikke bevis for UNITs nyere serverstyrede udlevering.

Et nyt UNIT-spor har oplyst checkpointet
`77c3ccabed2b342b067e45ed15a3927c63e74dce`, men det er ikke merget i denne
WAREHOUSE-etape. En særskilt, brugerautoriseret UNIT-overlevering skal først
fastlægge, at netop dette checkpoint må indgå. Derefter skal følgende køres på
det samlede slutprodukt:

1. Opret/modtag i WAREHOUSE og find samme QR i UNIT.
2. Reservér, klargør og udlevér i UNIT.
3. Kontrollér afgang og fælles historik i WAREHOUSE.
4. Returnér i UNIT til valgt modtagelsesplads.
5. Flyt i WAREHOUSE og verificér den nye placering tilbage i UNIT.
6. Genforsøg og samtidighed gennem de faktiske brugerflader.

Derudover bør den foreslåede realistiske belastningstest med 5.000 units,
25.000 bookinger, 100.000 bevægelser og 40 samtidige workers køres før en
produktionsbeslutning om transaktioner på hele tenant-roden.
