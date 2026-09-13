# UNIT Booking – overlevering til samlings-Codex V2

Dato: 13. september 2026

## Fælles kontrakt og ejerskab

Warehouse-reference: `37bba72ec73e33369479b236454a1a1e913a208c`.

Normativ kontrakt: `docs/VEYRO_UNIT_WAREHOUSE_CONTRACT_V1.md`.
Migrationsvej: `docs/VEYRO_UNITBOOKING_MIGRATION_V2.md`.

| Område | Fælles grænseflade | Ejer ved samling |
|---|---|---|
| Fysisk enhed | `tenants/{tenantId}/kasser/{unitId}` | Fælles domæne; én stabil `unitId` |
| QR | Rå stabil `unitId`; samme QR i begge moduler | Fælles QR-standard, ingen modulvariant |
| Placering | `pladsId` → `reolpladser/{id}` | Lagerbevægelses-callable er eneste klientvej til ændring |
| Historik | Append-only fælles bevægelseshistorik | Fælles serverfunktion |
| Booking | `kasseudlaan` og statusflow i UNIT | UNIT |
| Lagerhandling | `unitlagerhandling` med kilde og evt. bookingreference | Fælles/Warehouse-serverlag |

UNIT-sporet har ikke oprettet en parallel identitet, QR-kode eller
placeringsmodel. Den afstemte Warehouse-ændring gør direkte klientskrivning til
`kasser/{id}/pladsId` ulovlig og kræver `forventetPladsId` på
Warehouse-initierede bevægelser. UNIT-klientadapteren sender derfor den viste
aktuelle placering som `forventetPladsId`; afvigelse skal afvises efter det
idempotente retry-opslag, så en genafspilning stadig er sikker.

`src/fleet/Brugervaelger.jsx` er den eneste fælles AppShell-nære fil ændret i
rettelsesrunden. Ændringen er afgrænset til at erstatte miljøvariabel-, token-
og README-tekst i den synlige testbrugervælger med almindelig brugertekst. Der
er ikke ændret navigation, adgangslogik eller claims.

## Reproducerbar integrationstest efter samling

Brug en syntetisk tenant med både UNIT og Warehouse, og gem ids/hash fra hvert
trin:

1. Opret eller modtag en enhed i **Warehouse** på en kendt lagerplacering.
2. Find samme `unitId` og rå QR-værdi i **UNIT**; sammenlign `pladsId`.
3. Reservér, klargør og udlevér enheden i UNIT. Kontroller at reservation alene
   ikke flytter den, og at faktisk udlevering sætter fysisk placering til ude.
4. Åbn Warehouse og kontroller samme enhed, ingen aktuel lagerplacering og én
   fælles bevægelse med bruger, tidspunkt og bookingreference.
5. Scan retur i UNIT til en valgt modtagelseslokation. Kontroller
   bookingstatus `returneret`, egnethed efter gældende regel og faktisk
   modtagelsesplacering — ikke automatisk hjemplads.
6. Flyt samme enhed i Warehouse fra modtagelse til en anden lokation med et nyt
   operation-id og korrekt `forventetPladsId`. Genafspil samme request og
   kontroller, at der ikke skabes en ekstra bevægelse.
7. Åbn UNIT-register og scanner igen; kontroller den nye placering og hele den
   fælles historik.

Kør desuden hvert relevant trin som tenant med kun UNIT, kun Warehouse og begge
moduler samt med en fremmed tenant og en bruger uden skriveadgang.

## Hvad UNIT-sporet faktisk har verificeret

- Én fysisk id/QR og ét placeringsfelt i den fælles model.
- UNIT-only, Warehouse-only, begge moduler, tenantadskillelse og afvist
  manglende rettighed i isolerede Auth/Functions/RTDB-emulatorer.
- Reservation → klargøring → udlevering → retur, retur til valgt modtagelse,
  senere flytning og idempotente genforsøg.
- `forventetPladsId` sendes fra UNIT-scanneren og adapteren.
- Status og placering ses konsistent i UNIT-kalender, register,
  bookingdetalje og scanning.

## Hvad først kan verificeres efter samling

- Den samlede UI-rejse, hvor enheden oprettes i Warehouse og observeres i UNIT,
  derefter flyttes i Warehouse og observeres tilbage i UNIT.
- Det endelige merge af de fælles callables, database-regler og adapterfelter
  fra Warehouse-referencen og UNIT-sporet.
- Fysisk kamera/håndscanner og et miljø med den rigtige OCR/AI-tjeneste.

## Belastningsscenarie for transaktioner på tenant-roden

Formål: måle om den nuværende fælles transaktion på hele tenant-roden fortsat
har acceptabel svartid og retry-adfærd under realistiske, uafhængige skrivninger.
Arkitekturen ændres ikke i UNIT-sporet.

Datasæt pr. syntetisk tenant:

- 5.000 enheder, 500 lokationer, 25.000 aktive/historiske bookinger og 100.000
  bevægelser.
- 40 samtidige workers i 10 minutter.
- 80 % skriver på forskellige enheder/lokationer; 20 % rammer bevidst de samme
  20 enheder og simulerer bookingkonflikter, dobbeltscan og forældet
  `forventetPladsId`.
- Fordeling: 35 % uafhængige lagerflytninger, 25 % bookingoprettelser, 15 %
  statusovergange, 15 % returer og 10 % idempotente genforsøg.

Registrér p50/p95/p99-svartid, antal transaktionsretries, vellykkede skrivninger,
forventede konflikt-/precondition-afvisninger, uventede fejl og dublerede
bevægelser. Et foreslået acceptkriterium til fælles beslutning er p95 under
1.500 ms i emulatorens kontrollerede miljø, ingen mistede opdateringer, ingen
dublerede bevægelser og 0 uventede 5xx-fejl. Rapportér forventede
konfliktafvisninger særskilt; de er korrekt beskyttelse, ikke driftsfejl.

Hvis målingen viser høj retry-rate, skal samlingssporet træffe og dokumentere en
fælles arkitekturbeslutning. UNIT må ikke ensidigt flytte transaktionsgrænsen.
