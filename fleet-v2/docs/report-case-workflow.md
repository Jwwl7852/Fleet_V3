# Indberetning og sag i FLEET v2-prototypen

Et `report` dokumenterer det oprindeligt meldte problem. Den oprindelige type, alvorlighed, anvendelighed, målerobservation, tekst og billeder ændres ikke af triage.

Et `case` styrer behandlingen. Indsendelse opretter præcis ét report og ét case med stabile ID'er og status `new` i samme IndexedDB-transaktion. Alle senere visninger refererer til de samme `reportId`, `caseId` og `unitId`; triage opretter ikke en ny sag.

Statusmodellen er: `new` (Ny), `assessing` (Under vurdering), `waiting` (Afventer oplysninger), `ready` (Klar til værksted), `completed` (Afsluttet) og `rejected` (Afvist). Tilladte overgange og krav til begrundelser er defineret centralt i `src/data/caseWorkflow.js`. `ready` er slutpunktet for værkstedsrelaterede sager i denne etape og opretter ingen værkstedsopgave.

`caseEvents` er en fælles lokal tidslinje for oprettelse, statusændringer, vurderinger og interne noter. Det er prototypelogning og ikke et produktionssikret auditspor.

Enhedens anvendelighed beregnes på tværs af alle relaterede sager. Driftsstatus og anvendelighed er adskilte. En oprindelig spærring bevares, også efter lukning, indtil en bruger eksplicit ophæver den med en begrundelse. Lukning af én sag kan derfor ikke frigive enheden, når et andet forhold stadig spærrer.

Alle data, herunder billed-Blobs, ligger i tenantens ene lokale IndexedDB-datasæt. Skemaudvidelsen er bagudkompatibel og nulstiller ikke eksisterende enheder, billeder eller mål. En senere backendtilslutning skal bevare platformens eksisterende tenant- og enheds-ID'er i stedet for at etablere et nyt register.
