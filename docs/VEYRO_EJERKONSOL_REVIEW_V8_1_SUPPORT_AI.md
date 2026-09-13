# Veyro ejerkonsol — review V8.1 Support-afstemning

Dato: 13. september 2026

Arbejdsmappe: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`

Branch: `codex/ejer-integrated-development`

Bevaret udgangspunkt: `29b8b0252384cc111e58b3bfe279a18e56046642`

Lokalt implementeringscommit: `2c25c196ae980995849a12b06f805551c98f9f63`

Afstemt kontrakt: `veyro.support.v1.1`. Den kanoniske kontrakt blev læst
skrivebeskyttet fra supportsporets aktuelle commit
`42fba14dee63ee776b4ae3e76c34736737b181e6`; kontraktdokumentet angiver
`1ba18d529093322f4442b04791aeb97a219eb0f4` som den oprindelige V1.1-milepæl.

## Resultat

V8.1 samler sagsnummer, kilde, prioritet, modul, ansvarlig, status, kanal og
handlinger i ét kompakt supporthoved. **Svarudkast** åbner direkte på den
redigerbare kundetekst. Ved 1440×900 er 7,49 tekstlinjer synlige, og ved
360×800 er 4,44 linjer synlige samtidig med det flerlinjede AI-felt.

Support og Mail bruger fortsat samme lokale kommunikationstråd. Statusmappingen
skelner nu mellem en sag uden ansvarlig (**Skal fordeles**) og en tildelt
triagesag (**Faglig afklaring**). Overtagelse af SUP-2026-0082 til Dennis blev
gemt, genindlæst og vist ens i Support og Mail.

Den deterministiske lokale Support-AI viser et kendt, versionsrelevant forløb
med kundegodkendt og intern kilde samt et ukendt forløb uden opfundet løsning.
Produktversionen 3.4.2 er udtrykkeligt mærket som syntetisk reviewfixture, og
CRM-kontakt og mailafsender vises som forskellige roller med hver sin kilde.

`ejerSupportAdapter` vælger transport efter
`traad.kilde.adapter === "veyro.support.v1.1"`. Eksisterende mailsager bruger
de eksisterende ejeroperationer; portalprojektioner bruger V1.1-endpoints og
opretter ikke en parallel salgstråd. Portalkladder sender både sags- og
kladderevision, alle mutationer får idempotens-id, og transporten bruger
`supportEjerSvarTransporter`—aldrig den foreløbige `supportEjerSvarSend`.

Intern portal-AI er ikke en del af den leverede fælles V1.1-kontrakt. Adapteren
fejler derfor lukket med en synlig besked og skriver ikke til en lokal kopi.

## Lokal gennemgang

- Login: `http://127.0.0.1:5213/login`
- Supportkø: `http://127.0.0.1:5213/main/support`
- Kendt sag: `http://127.0.0.1:5213/main/support?sag=v8-support-kendt`
- Ukendt sag: `http://127.0.0.1:5213/main/support?sag=v8-support-ukendt`
- Samme sag i Mail: `http://127.0.0.1:5213/main/mail/indbakker?postkasse=faelles&sag=v8-support-kendt`

Klik **Support → SUP-2026-0081 → Svar og AI**. Fanerne er præcis
**Svarudkast**, **AI-chat** og **Oplysninger**. Alle viste kunder, personer,
adresser og versioner i reviewet er syntetiske.

## Acceptmatrix R1–R8

| ID | Status | Verificeret resultat | Bevis |
|---|---|---|---|
| R1 — desktoplayout | **Bestået lokalt** | Kompakt hoved, ingen gentaget statusbjælke, synligt redigerbart kundesvar og synlig AI-komposer. 1440×900 viser 7,49 svarlinjer; ingen vandret overflow. AI-resultat og komposer overlapper ikke. | `1440x900-kendt-svarudkast-kompakt.png`, `1440x900-kendt-ai-chat.png`, `1920x1080-kendt-svarudkast.png`, browsermålinger. |
| R2 — mobil | **Bestået lokalt, fysisk tastatur ikke prøvet** | Samtale/Svar og AI og alle tre indre faner fungerer. Usendt AI-tekst overlever faneskift. 360×800 viser 4,44 linjer af kundesvaret og det flerlinjede AI-felt; ingen vandret overflow ved 360×800 eller 390×844. | Tre mobilbilleder og `mobile` i browsermålingerne. Et fysisk OS-skærmtastatur var ikke tilgængeligt i automatiseret Edge. |
| R3 — faktisk rulning | **Bestået lokalt** | Samtale 0→602, Svarudkast 226→484, AI-chat 0→666 og Oplysninger 0→663. Alle fire målte flader havde større `scrollHeight` end `clientHeight`; komposeren blev stående uden overlap. | `scroll` med grænser og før/efter-værdier i `browser-measurements.json`. |
| R4 — kø, detalje og Mail | **Bestået lokalt** | SUP-2026-0082 var tildelt Jørn og stod som **Faglig afklaring**, ikke **Skal fordeles**. Overtagelse til Dennis overlevede reload og blev vist som **Afventer os** i både Support og Mail på samme id. | Supportkøbillede samt `status.takeoverReload` og `status.mail`. |
| R5 — kendt/ukendt AI | **Bestået lokalt** | Kendt problem bruger kun relevant 3.4.x-viden; intern kilde er tydeligt intern. Forslag blev eksplicit indsat og manuelt ændret. Ukendt problem spørger efter produktversion og viser ingen opfundet løsning; 2.x-kilden er udeladt. | AI-/kilde-/ukendt-billeder, `explicitInsertAndEdit`, E1–E3. |
| R6 — konkret godkendt lokalt svar | **Bestået for eksisterende e-mailmodel** | Emulatoren byggede konkret kundepayload med én signatur, korrekt syntetisk modtager og uden noter/AI. Testen udførte ingen virkelig transport og oprettede intet mailjob. | `R6_localApprovedCustomerPayload`, `E5_internalExcludedAndNoMailjob`, `mailSent:false`. |
| R7 — portaladapter mod fælles backend | **Adapter klar; samlet UI-forløb afventer** | Alle leverede V1.1-ejerendpoints er mappet, inklusive `forventetSagRevision` og `supportEjerSvarTransporter`. Ejersporets `src/firebase.js` bruger fortsat integrationskodens faste ejerporte 9099/9000/5001, mens fælles prøve kræver 9198/9290/5099. Begge faktiske UI’er er derfor ikke kørt mod samme backend i denne worktree. | `src/fleet/ejer-support-adapter.js`, kontraktinput V1.1 og statisk kontrakttest. |
| R8 — vidensmodel og adgang | **UI-/adapterbrug bestået; fælles serverbevis afhænger af samlingschatten** | Ejervisningen respekterer status, publikum, artikelrevision og produktversion; private lokale sager afvises. Den kanoniske V1.1-kontrakt placerer fælles Rules/endpoints i supportsporet. Det samlede tvær-UI-bevis må udføres af samlingschatten på samme backendcommit. | E6, kildeskærmbillede, kontraktrevision `veyro.support.v1.1`. |

## Browsermålinger og design

- `document.fonts.status === "loaded"`.
- `document.fonts.check("14px Inter") === true`.
- Beregnet font på body, knap og textarea er `Inter Variable, Inter,
  -apple-system, Segoe UI, Roboto, Arial, sans-serif`.
- Farver og geometri kommer fortsat fra `src/fleet/fleet.css`; der er ikke
  indført rå farver i V8.1-filerne.
- `test/design-tokens.test.mjs`: 11/11 bestået.
- Ingen vandret dokumentoverflow i de målte desktop- eller mobilvisninger.

## Testresultater

- V8/V8.1 unit og kontrakt: 7/7 bestået.
- Designtokens: 11/11 bestået.
- Målrettet ESLint: bestået, 0 fejl.
- Emulatoraccept: E1–E6 bestået; stale revision afvist; Dennis/Jørn deler
  samme sag; privat sag afvist; intern tekst udeladt.
- Vite produktionsbuild: bestået, 540 moduler transformeret.
- Normalt tenantløst testlogin og reviewdata efter fuld reload: bestået.
- `externalAiCalled:false`, `mailSent:false`.

## Resterende ekstern/fælles opsætning

1. Samlingschatten skal bygge begge frontends mod samme isolerede backend på
   9198/9290/5099 og udføre R7 samt den fælles del af R6/R8.
2. Den fælles kontrakt mangler fortsat en kanonisk operation for intern
   portal-AI og eventuelle sagsoplysninger. Ejeradapteren fejler lukket indtil
   operationen findes.
3. Konfliktresultater bør fortsat normaliseres til V8's `{ok,data,besked}`;
   `aborted` skal genindlæse uden at kassere usendt tekst, og
   `permission-denied` må aldrig genprøves med bredere adgang.
4. Fysisk mobilt skærmtastatur er en manuel resttest.
5. Microsoft 365, OpenAI, Dinero, OCR og bilagsmail er fortsat **Ikke
   tilsluttet**. Ingen driftstjeneste er aktiveret.

## Overlevering til samlingschatten

- Ejercommit: `2c25c196ae980995849a12b06f805551c98f9f63`.
- Adapter: klar til `veyro.support.v1.1`.
- Fælles prøveindgang: `/main/support?sag=<kanonisk sagId>`; Mail bruger samme
  `sagId` i queryparameteren og må ikke få en redigerbar kopi.
- Nødvendig integrationsændring: gør ejerbuildens Firebase-emulatorporte
  konfigurerbare med de allerede dokumenterede Vite-navne, eller lever en
  samlingsbuild, der peger på 9198/9290/5099. Dette ligger uden for ejerens
  UI-filer.
- Nødvendig kontraktudvidelse: kanonisk intern AI-/oplysningsoperation, hvis
  portalsager skal have hele V8-arbejdsrummet. Indtil da er den funktion
  bevidst blokeret uden parallel lokal skrivning.

Ingen push, merge, deployment, produktionsændring, eksternt AI-kald eller
rigtig mailafsendelse er udført.
