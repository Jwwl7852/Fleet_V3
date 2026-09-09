# FACILITY v2 – fremdrift for etape 3–7

Denne fil er den vedvarende fremdriftsoversigt for det sammenhængende forløb.
Eksisterende FACILITY-data migreres; fixtures genindsættes ikke oven i lagrede
tenantdata.

## Arbejdsrækkefølge

- [x] Kontrollér, kopiér og map alle 14 visuelle referencer.
- [x] Udvid migrations-, dokument-/bilags- og transaktionsgrundlaget.
- [x] Etape 3: desktop/mobil indberetning, kladder, atomisk sag og triage.
- [x] Etape 4: Arbejdskø, sagsmappe, opgaver, mailkladde, udførelse og kalender.
- [x] Etape 5: serviceplaner, forekomster, fristberegning og catch-up.
- [x] Etape 6: dokumentregister, versionsbindinger, QR og ejendomskort.
- [x] Etape 7: økonomi, sammenhængende procesprøver og visuel færdiggørelse.
- [x] Slutkontrol: migration, samtidighed, browserforløb, responsive screenshots,
      lint, tests og produktionsbuild.

## Faste valg

- Ingen eksterne mails, kortnøgler, geokodning eller Fakturacenter-kontrol.
- Dokumentversioner og medie-Blobs genbruges via stabile referencer.
- Mutationer læser seneste tenantdata i samme IndexedDB-transaktion og bruger
  revisions-/idempotensnøgler.
- Normal sagslukning er blokeret uden reel fakturaafklaring. Testadapteren er kun
  til isolerede tests; appen kan bruge den begrundede undtagelse “luk uden faktura”.
- Service catch-up kører ved appstart og mens appen er åben; aldrig mens browseren
  er lukket.
- Kortet bliver en nøglefri lokal SVG-projektion af manuelt registrerede
  koordinater. Dermed sendes ingen adresser eller sagsdata til tredjepart.

## Slutstatus 8. september 2026

- Dataversion: 8. Migrationen bevarer eksisterende etape-2-poster og registrerer
  eksisterende medie-Blobs som dokumentversioner ved reference, ikke ved kopi.
- Enhedstest: 36 bestået i 6 testfiler.
- Browsertest: 27 bestået i Chromium, inklusive 1920, 1440, 1024 og 390 px.
- Lint: bestået.
- Produktionsbuild: bestået med Vite 8.2.2.
- Visuel kontrol: 14 desktopbilleder ligger i `docs/visual-check` og er manuelt
  sammenholdt med de nummererede designreferencer.
- Lokal server: `http://127.0.0.1:5189/facility` på FACILITYs egen proces.
