# Veyro ejerkonsol — review V8 Support AI

Dato: 2026-09-12

Arbejdsmappe: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`

Branch: `codex/ejer-integrated-development`

Bevaret udgangspunkt: `47c06020af5e00c302ea9b01ef316b10cbbd74fe`

Testet kodecommit: `414f94299df3d666710a9f94a091a48d3de7fee6`

Endelig HEAD ved pakning står med fuld hash i ZIP'ens
`archive-manifest.json` og i den lokale arkivverifikation.

## Resultat

Support bruger nu den samme tråd, kladde, noter, ansvarlige, signatur og
godkendelsesflow som Mail. En supportsag åbner et samlet arbejdsrum med
**Samtale** og **Svar og AI**. Højrepanelet har præcis fanerne **Svarudkast**,
**AI-chat** og **Oplysninger**.

Den lokale Support-AI samler registrerede sagsfakta, skelner mellem
dokumenteret fakta, mulig forklaring og ukendt grundlag og viser de anvendte
kilder. Et kundesvar må kun hente løsningsindhold fra godkendt,
kundevendt viden. Intern viden kan vises i den interne fejlsøgning, men bliver
ikke gjort kundevendt. Forældede og utilstrækkelige kilder udelukkes.

AI-chatten og interne noter deles mellem Dennis og Jørn på fælles sager. Begge
er markeret som interne og ligger uden for mailpayloaden. Det foreslåede
kundesvar indsættes eksplicit i den redigerbare kladde og kræver fortsat den
eksisterende menneskelige gennemgang og godkendelse. Ny kundedialog eller
ændret kladde gør forslaget forældet.

Vidensbasen kan nu registrere modul, relevante versioner, nøgleord,
vidensstatus, publikum og reviewer. Supportkøen har søgning, statusfiltre,
prioritet, modul, ansvarlig og direkte sagsåbning. De eksisterende faste
skrivefelter og uafhængige rulleflader fra V7.3.2 er bevaret.

## Lokal gennemgang

- Login: `http://127.0.0.1:5213/login`
- Supportkø: `http://127.0.0.1:5213/main/support`
- Kendt sag: `http://127.0.0.1:5213/main/support?sag=v8-support-kendt`
- Ukendt sag: `http://127.0.0.1:5213/main/support?sag=v8-support-ukendt`
- Klik: **Support → åbn SUP-2026-0081 → Svar og AI → AI-chat**.
- Dokumenterede fakta og kilder: vælg **Oplysninger** på samme sag.

Alle sager, kunder, adresser og priser i V8-reviewet er syntetiske.

## Acceptmatrix

| ID | Status | Lokalt verificeret resultat | Bevis |
|---|---|---|---|
| E1 — kendt problem | Bestået | En godkendt, kundevendt FLEET-kilde gav dokumenteret fejlsøgning og et særskilt redigerbart svarforslag. Intern kilde blev vist som intern. | Emulatorresultat, `1440x900-kendt-ai-chat.png`, `1920x1080-kendt-oplysninger-kilder.png`. |
| E2 — ukendt problem | Bestået | Ingen tilstrækkelig aktuel kilde gav teksten om manglende grundlag, produktversion som næste spørgsmål og ingen opfundet løsning. Den forældede kilde blev udeladt. | Emulatorresultat og `1440x900-ukendt-ai-afklaring.png`. |
| E3 — ny kundebesked | Bestået | Serveren afviste et forslag med gammelt aktivitetsgrundlag; eksisterende nyere kladde blev ikke overskrevet. | `E3_staleRejected: true` i `test-evidence.json`. |
| E4 — samme sag i Mail/Support | Bestået | Support og Mail brugte `v8-support-kendt`; linket pegede på samme id, note `n1` var den samme og ingen kopi blev oprettet. | Browsermåling `sameCase` og emulatorresultat. |
| E5 — intern dialog/kundesvar | Bestået | Note og AI-chat var interne, ingen mailjob blev oprettet, og signaturen forblev separat. | Emulatorresultat `E5...: true`, mailregressioner 22/22. |
| E6 — adgang og kilder | Bestået | En anden ejers private sag blev afvist. Intern viden kunne ikke blive kundesvar; kun `kunde_godkendt` blev anvendt dér. | Emulatorresultat og kildevisning. |
| E7 — overdragelsesadapter | Delvist, korrekt afgrænset | Ejerfladen viser syntetisk sammenhængende dialog og afprøvede trin. Reel kundeportalforbindelse og fælles kontrakt afventer samlingschatten. | `VEYRO_EJER_SUPPORT_KONTRAKT_INPUT_V1.md`. |
| E8 — arbejdsflade | Bestået lokalt | AI-komposer var synlig uden overlap, historikken havde `overflow-y: auto`, og usendt tekst overlevede mobilfaneskift. Ingen vandret overflow ved 390×844. | Browsermålinger og mobilbilleder. |

## Browsermålinger

- Normalt tenantløst testlogin: bestået.
- Reviewdata efter fuld genindlæsning: bestået.
- 1440×900: AI-komposer synlig, ingen overlap, uafhængig historikrulning,
  intet vandret dokumentoverflow.
- 1920×1080: kildefakta og begge publikumstyper synlige.
- 390×844: usendt AI-tekst bevaret ved faneskift; intet vandret overflow.
- Faktisk font: `document.fonts.status=loaded` og
  `document.fonts.check('14px Inter')=true`. Beregnet fontfamilie på body,
  knap og textarea var `Inter Variable, Inter, -apple-system, Segoe UI,
  Roboto, Arial, sans-serif`.

Det fulde målesæt ligger i
`docs/screenshots/ejer-review-v8-support-ai/browser-measurements.json`.

## Testresultater

- V7–V8 unit/regression: 22/22 bestået.
- Designtokens: 11/11 bestået.
- Målrettet ESLint af alle ændrede ejer-, server-, test- og reviewscripts:
  bestået, 0 fejl.
- Emulatoraccept: E1–E6 bestået; `externalAiCalled=false` og
  `mailSent=false`.
- Vite produktionsbuild: bestået, 538 moduler transformeret.
- Fuld `npm run lint` er ikke et gyldigt samlet bevis i denne worktree, fordi
  den uændrede FACILITY-pakke fortsat mangler sin lokale `@eslint/js`-
  afhængighed. Alle filer i V8-ændringen er lintet direkte.

## Tre særskilte leverancestatusser

1. **Intern AI-support i ejerkonsollen — implementeret og lokalt verificeret.**
   Det er en deterministisk lokal testadapter og beviser arbejdsgang,
   adgangskontrol, kildeskel og stale-beskyttelse, ikke sprogmodelkvalitet.
2. **Fælles kontrakt og kundeportalforbindelse — afventer samlingschatten.**
   Ejersporets kontraktinput er afleveret, men der er ikke bygget konkurrerende
   endpoints eller påstået portalforbindelse.
3. **Ekstern AI-aktivering — ikke tilsluttet.** Ingen OpenAI-kald er udført.

Microsoft 365, OpenAI, Dinero, OCR og bilagsmail er fortsat **Ikke
tilsluttet**. Ingen push, merge, deployment, produktionsændring, eksternt
AI-kald eller rigtig mailafsendelse er foretaget.

## Kendte begrænsninger

- Kundeplatformens supportindgang, kanalvalg for portaltransport og stop af en
  allerede kørende kundebot ved menneskelig overtagelse skal implementeres og
  verificeres i den fælles kontraktintegration.
- Et fysisk mobilt skærmtastatur er ikke tilgængeligt i den lokale headless
  Edge. Mobilfaneskift, fokusbevarelse, usendt tekst og overflow er testet.
- Den kendte mindre klipning af hjælpetekst fra V7.3.2 er fortsat ført som
  manuel mobilresttest; V8 introducerer ingen ny overlapfejl.
