# VEYRO/FLEET — integreret browser-QA 16. september 2026

## Version og miljø

Browserbeviset blev optaget fra
`C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-integration` på branch
`codex/veyro-integration-v1`. Produkt- og QA-grundlaget ved optagelsen var
`ef7d9f7e4231a1bff4b9d80e8166d94f553fd1f2`. Den efterfølgende commit
`7ae8ea6906839a410e201a6c998e5246e53af071` ændrede kun README- og
testforventninger; den ændrede ikke den viste brugerflade.

Den prøvede app var den byggede samlede root-app med embedded FLEET:

- build: `npm run build` med eksplicit demo-emulatornamespace;
- server: `npm run preview -- --host 127.0.0.1 --port 5197 --strictPort`;
- root: `http://127.0.0.1:5197/`;
- FLEET: `http://127.0.0.1:5197/fleet-v2`;
- Fakturacenter: `http://127.0.0.1:5197/oekonomi/fakturacenter`;
- godkendelsesregler: `http://127.0.0.1:5197/opsaetning/godkendelsesregler`.

Backend var den isolerede Firebase Emulator Suite for projekt
`demo-veyro-owner`: Auth 9099, RTDB 9000, Functions 5001 og Storage 9199.
Normal login, claims, abonnement og permissions var aktive. Fælles enheder,
leverandører, fakturaer og indstillinger kom fra emulatoren. FLEETs endnu ikke
adapterede driftsdata kom fra tydeligt mærkede lokale syntetiske fixtures.
Ekstern GPS/OBD var udskudt efter aftale og blev ikke aktiveret.

## Resultat

Den maskinlæsbare rapport
`artifacts/veyro-rettelsesrunde-2026-09-16-final/browser-current/RESULTAT.json`
sluttede med `ok: true` og nul runtimeproblemer.

- Anonym direkte FLEET-URL gik til login.
- En autentificeret bruger uden FLEET-permission blev afvist.
- En tilladt bruger fik præcis én AppShell og én embedded FLEET-instans.
- Warehouse stod som `Warehouse`, ikke versaler.
- Zoom gik 100 → 105 → 110 %, mens sidebar og topbjælke beholdt størrelsen.
- Kompakt flyout bestod mus, tastatur, ESC/fokusretur og touch.
- Desktopdialogen kunne flyttes og forblev inden for arbejdsfladen; mobil blev
  fuldskærm med intern scroll.
- Arbejdskø, indberetninger, enhedsregister, Livekort og direkte sags-URL
  bevarede relevant filter, valg og scroll eller brugte sikker intern fallback.
- Dirty-dialogen bevarede tekst, krævede bekræftelse og returnerede fokus.
- Match- og modulfiltre viste kun de forventede serverposter.
- Fakturacenterets og indberetningernes panelbredder overlevede reload, og
  alle tre paneler kunne scrolle uafhængigt.
- Oprettelse af fælles leverandør bevarede sagskladde og valgte leverandøren
  ved retur.
- Eksisterende fælles enhed beholdt nyere servermåler; en modstridende
  målerændring blev afvist med input bevaret. En ny enhed blev skrevet til
  samme autoritative RTDB-post, som PLANNING læste.
- Egen ekstra fakturagodkendelse blev afvist. Den udpegede anden godkender
  gennemførte godkendelsen.
- En faktura fordelt på FACILITY og FLEET krævede to separate modultrin og
  blev først arkiveret efter begge.
- Massekontrol viste 2 succeser og 1 afvisning med konkret resultat pr. post;
  betalingstilstande var uændrede.

## Viewports og billeder

Ti routes blev afprøvet ved 1920×1080, 1440×900, 390×844 og 360×800.
Derudover blev normal/kompakt sidebar og 100/125 % arbejdsområdezoom målt i
alle kombinationer. De aktuelle original-PNG'er omfatter overblik,
enhedsregister/-formular, indberetninger, arbejdskø i Kanban og tabel,
sagsmappe/historik, service/-intervalformular, økonomi, Livekort-popup,
Fakturacenterets indbakke/ekstra kontrol/arkiv, masseforløb, sidebars og
dialogtilstande.

### Livekort-kontrolsum

Den aktuelle `07-livekort-1920x1080.png` er 733.588 bytes, kan læses som
1920×1080 PNG og har SHA-256
`861D6600F9FAC5E7BE6ADD72EF217BFC583475956A3496979BF1B5FDCD0FEC12`.
Historiske genoptagelser har forskellige hashes, fordi OpenStreetMap-
rastertiles indlæses asynkront. Pakkens manifest beregnes fra de faktisk
vedlagte bytes. Den oprindelige afvigelse var derfor et evidens-/pakkeproblem,
ikke en påvist produktfejl.

## Tekniske gates på samme slutgrundlag

- root-lint: bestået;
- FLEET-lint: bestået;
- designgate: 11/11;
- FLEET: 207/207 i 32 filer;
- fokuseret optimistisk enhedsskrivning: 8/8;
- fakturakontrol: 13/13;
- Functions-syntaks: bestået;
- delte Functions-filers paritet: 29/29;
- root-build: bestået, 768 moduler, kun kendt chunkadvarsel;
- FLEET-build: bestået, 195 moduler, kun kendt chunkadvarsel;
- fuld Rules-/platformsgate: 4.649/4.649 i 905 suites, 0 fejlet;
- integreret browser-QA: `ok: true`, 0 runtimeproblemer.

Første kørsel af slutgaten nåede testene, men havde tre gamle dokumentations-
og forventningsafvigelser (route, Warehouse-kapitalisering og testantal).
Ingen af de tre var en fejlet sikkerhedsassertion. Efter korrektion af disse
forventninger bestod den uændrede sikkerhedsgate 4.649/4.649. Den tidligere
Java/Netty-opstartsfejl blev holdt adskilt og løst proceslokalt med JDK 21;
ingen global Java- eller Windows-indstilling blev ændret.

## Begrænsninger

Ekstern GPS/OBD er udskudt efter aftale og er ikke en blokering for det
aktuelle modulreview, men FL-04/FL-16 er ikke markeret som fuldt gennemført.
Microsoft Excel, produktionsbogføring, permanent fakturaupload og de endnu
manglende serveradaptere er heller ikke påstået som verificeret.
