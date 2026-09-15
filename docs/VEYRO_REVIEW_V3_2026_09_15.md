# VEYRO-rettelsesrunde v3 — reviewnotat 15. september 2026

## Versionsgrundlag

- Arbejdsmappe: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-integration`
- Branch: `codex/veyro-integration-v1`
- R1/R2/FL-05: `5d1212e1193e15be34dacf5af1a6d97ed4c387d1`
- R3/R5 og browserharness: `dc0c29b80bb22cc2092c88d3dab13b890be85232`
- Browserbeviset i `artifacts/veyro-rettelsesrunde-2026-09-15-v3/browser-current`
  er taget fra produktkoden i disse to commits. Dokumentationscommittet kan
  derfor ligge efter screenshotversionen uden efterfølgende produktændringer.
- Testadresse: `http://127.0.0.1:5197/`, Vite preview med `strictPort`.

## Afstemning mod VEYRO-review-v2

| Fund | Resultat | Konkret bevis |
| --- | --- | --- |
| R1 statusoversættelse | Rettet | Alle fem tilladte fælles statusser round-tripper. `udeAfDrift` vises som `action` og gemmes igen som `udeAfDrift`; `offline` er nu en ikke-skrivbar forbindelsestilstand. En eksisterende NB-003 blev redigeret og genindlæst uden statusændring. |
| R2 nyere målerstand | Rettet | `kmStand`/`driftstimer` er autoritativ foran den bagudkompatible profilprojektion. Uvedkommende felter skrives som feltpatch uden måler/status. En samtidig brugerændring af måler/status giver konflikt, bevarer input og overskriver ikke serveren. Kilometer og timer er dækket. |
| R3 overlap/tekster | Rettet | KPI-hjælpeteksten har egen gridrække over fremdriftsbjælken; enhedsregisteret har ikke længere en tom gridrække mellem værktøjslinje og tabel; rootteksten beskriver fælles serverregister. Aktuelle 1440-billeder er visuelt kontrolleret. |
| R4 manglende billeder | Rettet i afleveringen | Alle 20 nævnte filer findes som aktuelle original-PNG'er, herunder begge flytbare dialogvarianter. Pakken indeholder desuden nye R1/R2-billeder. |
| R5 panel- og enhedsbevis | Rettet | Begge separatorer i begge trepanelsflader er pointertrukket, genindlæst og sammenholdt. Alle seks panelområder er rullet uafhængigt. Eksisterende fælles enhed er redigeret, genindlæst og genfundet i PLANNING. |

FL-05 kan på dette grundlag stå som `Implementeret`: FLEET læser og skriver
den samme tenantafgrænsede `koeretoejer/<id>`-post, som PLANNING læser, og
R1/R2-integritetsfejlene er dækket af både rene regressionstests og en normal
autentificeret browsergang. Permanent billedlagring er fortsat en afgrænset
Storage-rest og indsniger ingen lokal fallback i den aktive servergren.

## Browsermiljø og datakilder

Den prøvede app er den byggede root-app med præcis én AppShell og embedded
FLEET, ikke standalone FLEET. Normal Firebase Auth-emulatorlogin blev brugt.
Fælles enheder, leverandører og Fakturacenterposter kom fra Realtime Database-
emulatoren i `demo-veyro-owner`; FLEET-sager, indberetninger, værksted,
Livekort og øvrige endnu ikke adapterede områder brugte tydeligt mærkede
syntetiske IndexedDB-fixtures. Der blev ikke tilføjet demo-fallback til
servergrenen.

Resultatet er 40/40 route-/viewportprøver, 160/160 kombinationer af normal/
kompakt menu og 100/125 % arbejdsområdezoom, 31 særskilte handlingsbilleder og
0 registrerede runtimefejl. Anonym direkte URL endte på login; en autentificeret
revisor uden FLEET-adgang så ingen beskyttet modulflade.

R1/R2-forløbet åbnede NB-003 med serverstatus `udeAfDrift`, fælles måler
412.980 km og bevidst forældet profilmåler 412.000 km. En noteredigering
bevarede status og 412.980 km. Derefter blev servermåleren ændret til 413.100
km, mens formularen var åben; en uvedkommende redigering bevarede 413.100 km.
Ved en samtidig, forskellig målerredigering forblev serveren på 413.180 km,
formularen forblev åben, og brugerens input blev bevaret med en konkret
konflikttekst.

## Panelbevis

- Fakturacenter: tastatur på første separator 22→23 %, pointer på begge
  separatorer 23/48→28/42 %, og reload gav 28/42 %. Liste, dokument og
  kontrolpanel havde `overflow-y:auto`, større scrollhøjde end klienthøjde og
  blev hver især flyttet til 35/55/75 px.
- Indberetninger: pointer på begge separatorer 26/28→31/33 %, og reload gav
  31/33 %. Liste, detalje og sagspanel blev hver især flyttet til 30/50/70 px
  i en kontrolleret 360 px høj arbejdsflade.

## Kontrolsum for Livekort

`07-livekort-1920x1080.png` er genereret på ny ved hver browserkørsel. Den
aktuelle slutfil har SHA-256 `F73B50512CD1389A1B12AF9557272FB31B5018ED8284303AF48CC5499E611438`;
samme hash står autoritativt i pakkens manifest. Tidligere filer havde andre
hashes, fordi OpenStreetMap-rastertiles
indlæses asynkront og de resulterende PNG-bytes derfor ikke er deterministiske.
Alle filer har korrekt route og viewport, og den nye pakkes manifest er
beregnet fra de faktiske vedlagte bytes. Afvigelsen er et evidens-/hashforhold,
ikke en fundet produktkodefejl.

## Teststatus

| Kontrol | Aktuelt resultat |
| --- | --- |
| Fokuseret R1/R2 + skrivning | 72/72 bestået |
| Root ESLint | Bestået |
| FLEET ESLint | Bestået |
| Designgate | 11/11 bestået |
| FLEET Vitest | 206/206 bestået i 32 filer |
| Functions-syntaks | 78/78 filer bestået |
| Functions-paritet | 29/29 bestået |
| Root produktionsbuild | Bestået, 767 moduler; kun kendt chunkstørrelsesadvarsel |
| FLEET produktionsbuild | Bestået, 195 moduler; kun kendt chunkstørrelsesadvarsel |
| Integreret browser-QA | Bestået; 40 viewports, 160 layouts, 31 handlingsbilleder, 0 runtimefejl |
| Aktuel fuld Rules-/sikkerhedsgate | Ikke startet: Database Emulator afsluttede før tests med Netty `failed to create a child event loop` / `Unable to establish loopback connection` |

Den senest grønne fulde Rules-/platformsgate på 4.629/4.629 er historisk
dokumentation fra det foregående kodegrundlag. Den aktuelle ændring i Rules er
kun tilføjelsen af det nødvendige `kaldenavn`-indeks og er dækket af en statisk
regression samt en autentificeret forespørgsel i den eksisterende lokale
emulator. Det er ikke det samme som en ny fuld grøn sikkerhedsgate. Emulatorens
opstartsfejl er holdt adskilt fra testfejl: ingen sikkerhedstest blev kørt,
sprunget over eller svækket i den fejlede start.

`spawn EPERM` blev reproduceret særskilt i den begrænsede proces-sandbox for
Node-testworker og esbuild. De identiske test-/buildkommandoer bestod, når de
blev kørt i den tilladte lokale proceskontekst. Det siger ikke noget om den
uafhængige Java/Netty-emulatorfejl.

## Fortsat delvise krav

| Krav | Fungerer nu | Konkret rest | Påvirker nuværende visuelle/funktionelle review? | Art |
| --- | --- | --- | --- | --- |
| UX-07 | FLEET-dialoger har fælles lukkeværn, fokusretur og savebekræftelse. | Resterende root-/ikke-FLEET-dialogaudit og reelle save-/delete-fejl. | Kun de ikke-auditerede dialoger. | Senere intern UI/backend. |
| FC-06 | Mærket demo-intake har filnavn, status, SHA-256-dubletværn og retry. | Permanent autoriseret upload, pipeline, revision/idempotens og kvittering. | Nej for de øvrige viste Fakturacenterflows. | Senere backend/Storage. |
| FL-02 | Perioder og daterede observationer vises/beregnes. | Autoritativ produktionshistorik og databåret browserbevis. | Nej for layoutreview; ja for endelig datagodkendelse. | Senere backend/data. |
| FL-03 | Månedsskift, nedetid, manglende data og sidste år beregnes. | Autoritativ status-/omkostningshistorik. | Nej for layoutreview. | Senere backend/data. |
| FL-04 | Livekortinteraktion, popup og retur virker med mærkede fixtures. | Rigtig GPS-/OBD-kilde. | Nej; ekstern integration er udskudt efter aftale. | Ekstern, udskudt. |
| FL-13 | Servicefelter, varsler og næste grænse findes; krav kan gemmes på server. | Service-/planlægningsadapter, udførelsesmutation og syntetisk migrationstest. | Delvist for end-to-end servicehandlinger. | Senere backend. |
| FL-14 | Servercyklus, idempotens, samtidighed og gennemførsel findes. | Autoriserede sagsmutationer og syntetisk migration af lokale poster. | Delvist for end-to-end automatik. | Senere backend. |
| FL-15 | Kategoristamdata, sortering, deaktivering og snapshots findes. | Serverhåndhævelse i forbrugende indberetnings-/økonomiposter. | Nej for kategori-UI; ja for endelig dataintegritet. | Senere backend. |
| FL-16 | Statistik-UI filtrerer/eksporterer understøttede, mærkede målinger. | Valideret OBD-kilde og eksternt integrationsbevis. | Nej; ekstern integration er udskudt efter aftale. | Ekstern, udskudt. |
| FL-17 | Økonomi adskiller status/kilder, dubletter og kreditfortegn. | Fakturacenter-/bogføringsadapter, serveraudit og fuld livscyklus. | Nej for layoutreview; ja for endelig økonomifunktion. | Senere backend/ekstern bogføring. |
| FL-18 | Dansk eksport med BOM, decimal og eksplicit netto/moms/brutto. | Manuel Microsoft Excel-test og autoritativ moms fra produktionskilden. | Nej for de viste skærme. | Manuel ekstern verifikation/data. |
| REG-01 | Aktuelle statiske Rules-/adapterkontroller består. | Ny fuld emulatorgate efter Java/Netty-opstartsproblemet samt gates for fremtidige serverfunktioner. | Nej for visuel review; sikkerhedsgaten må ikke kaldes aktuel grøn. | Lokal miljøblokering + senere backend. |
| REG-02 | Aktuelle fælles kontrakter og integreret browserregression består. | Slutregression efter de resterende adaptere/integrationer. | Nej for nuværende afgrænsede review. | Senere samlet gate. |

Ekstern GPS/OBD er **udskudt efter aftale**. Kollegaens separate OBD-testprojekt
er ikke integreret i VEYRO, og syntetiske fixtures er ikke opgjort som ekstern
integration.
