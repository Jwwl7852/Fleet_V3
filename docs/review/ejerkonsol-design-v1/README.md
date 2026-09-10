# Ejerkonsol — designreview V1

Opdateret: 2026-09-10

## Grundlag

Reviewet er udført mod den faktisk kørende lokale ejerkonsol med normalt,
tenantløst Firebase-testlogin og syntetiske emulatorfixtures. Der er ikke
brugt demo-mode eller omgåelse af guards. Microsoft 365, OpenAI, Dinero,
bilagsmail og OCR står fortsat som **Ikke tilsluttet**.

Den vedhæftede serie indeholder 11 filer, selv om opgaven omtaler 10 billeder.
Skærm 11 er en rettet udgave af skærm 7 og er derfor brugt som autoritativ
reference ved overlap.

## Referencekort

| Reference | Faktisk route/tilstand | Implementeret match | Bevidst dataforskel |
|---|---|---|---|
| 01 Overblik | `/main` | Skal, KPI-bånd, opmærksomhed, assistent og seneste aktivitet | Tal kommer fra emulatoren |
| 02 Tilbudstekst | `/main/salg/tilbud` | Versionshoved, måneds-/engangssum, faner, tekstfelter, prislinjer og assistent | Fixturepriser er ikke officielle priser |
| 03 Salgsindbakke | `/main/salg/indbakke` | Filtre, trådliste, samtale, interne noter og sagspanel | Tråd og personer er mærkede testfixtures |
| 04 Opfølgning | `/main/salg/aktiviteter` | Kø, kladde, redigering, godkendelse, udsættelse og annullering | M365-afsendelse forbliver lukket |
| 05 Send tilbud | Tilbud → `Klargør mail` | Modtager, emne, tekst, præcis PDF-version, opfølgning og særskilt manuel registrering | Send-knappen kan kun oprette lokal kladde, når M365 er frakoblet |
| 06 Sagsassistent | `/main/salg/kunder?fane=assistent` | Sagskilder, fakta/fortolkning/spørgsmål, svarudkast og intern samtale | Intet live OpenAI-kald |
| 07/11 Kunde | `/main/salg/kunder` | Kundemetadata, historik, aftale, administratoradgang, næste handling og assistent | Nyeste rettede reference 11 har forrang |
| 08 Økonomi | `/main/oekonomi` | Afstemte KPI'er, dokumentliste, bilagsarbejde og definitioner | Manglende Dinero-dækning vises som utilstrækkelige data |
| 09 Integrationer | `/main/integrationer` | M365/OpenAI/Dinero-kort, bilagsmodtagelse og aktiveringsrækkefølge | Alle eksterne forbindelser er sandt frakoblede |
| 10 Vidensbase | `/main/salg/vidensbase` | Søgning, statusfaner, versioneret redigering og leveringsstatus | Aktuel fixture har ingen godkendte poster |

De eksisterende routes for pipeline, rateblad, abonnementer, fakturaer,
kreditnotaer og bilagsindbakke er bevaret. Den tidligere samlede CRM-
aktivitetsliste kan fortsat åbnes på `/main/salg/aktiviteter/alle`.

## Funktionel kontrol

- De ni unikke referenceflows blev åbnet i den kørende app uden dokumentbredde-
  overflow ved den tilgængelige IAB-viewport på 931 CSS-pixel.
- Tilbuds-PDF'en blev aflæst som `T-2026-0001_v2.pdf`; versionsnummeret kommer
  fra det låste tilbudssnapshot.
- `Gem kladde` starter en ny tilbudsversion, hvis den viste version er låst.
- Manuel afsendelsesregistrering kræver dokumentation og sender ikke mail.
- Opfølgningsskærmen genkontrollerer kundesvar og tilbudsstatus på serveren;
  afsendelse er fail-closed uden Microsoft 365.
- AI-knapper viser frakoblet status og sender ikke fixtureindhold eksternt.

## Screenshot- og viewportbevis

Aktuelle screenshots blev optaget og vist direkte i denne Codex-opgave via den
aktive browserkontrol. Det er billeder af appen, ikke genererede designbilleder.
Browserkontrollen kunne ikke eksportere de nye optagelser som repositoryfiler;
de eksisterende filer i `docs/screenshots/ejer-review` dokumenterer den tidligere
funktionelle gennemgang og er derfor ikke overskrevet.

Den tilgængelige in-app-browser havde en fast viewport på 931×794 CSS-pixel.
Den aktuelle runde har derfor ikke kunnet gentage en ægte pixelmåling ved
1440×900 og 1920×1080. Responsive regler og fravær af dokumentoverflow er
verificeret ved 931 px; de to fysiske størrelser er et åbent visuelt QA-punkt,
som skal køres i en browser med justerbar viewport. En tidligere runde havde
kontrolleret de to størrelser før denne designændring, men det tælles ikke som
bevis for den nye serie.
