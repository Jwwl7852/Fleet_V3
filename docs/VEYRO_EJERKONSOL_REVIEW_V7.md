# Veyro ejerkonsol — review V7

Dato: 2026-09-11  
Arbejdsområde: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`  
Branch: `codex/ejer-integrated-development`  
V7-udgangspunkt: `4b58690309535fde4474e1a489814c4991362e7b`  
Verificeret V7-kode: `eefc7f4105327555fb2e66d07d7e6b7bbd1333da`

## Resultat

V7-mailfladen er implementeret som en separat arbejdsoversigt og en fokuseret
sagsvisning. Oversigten åbner ikke automatisk en samtale, viser 25 rækker pr.
side, arbejder på tværs af de tilladte postkasser og mapper og har en samlet
AI-opmærksomhedsliste med kildehenvisninger. Den fokuserede visning samler
samtale, relevante dokumenter, kunde/supportkobling, interne noter, svarudkast
og AI-revision uden at blande andre sagers oplysninger ind.

Alle afsendelser kræver fortsat en konkret ejerhandling. Browseraccepten
godkendte et syntetisk udkast, men sendte det ikke. Microsoft 365, OpenAI,
Dinero, OCR og bilagsmail er fortsat **Ikke tilsluttet**.

## Navigation

- Mailoversigt: `/main/mail/indbakker?postkasse=faelles`
- Fokuseret pilotsag: `/main/mail/indbakker?postkasse=faelles&sag=v7-pilot-nordlys`
- Interne sager: `/main/mail/sager?mappe=domicil&sag=v7-intern-domicil`
- Support: `/main/support?sag=v7-support-faelles`
- Opfølgning: `/main/mail/opfoelgning`

Preview: `http://127.0.0.1:5211/login`. Log ind via den normale loginformular
med den tenantløse syntetiske test-ejer, hvis værdier ligger i den lokale,
git-ignorerede `.env.owner-emulator.local`. Ingen adgangsoplysninger er medtaget
i repositoryet eller denne rapport.

## Referencekort

| Reference | Implementeret route | Resultat og afgrænsning |
|---|---|---|
| Din arbejdsindbakke | `/main/mail/indbakker` | Samme overordnede hierarki med postkasser, statusfiltre, mapper, kompakt liste og samlet AI-panel. Den fælles ejerskal bruger de aktuelle fælles tokens og viser et roligt, sandfærdigt test-/forbindelsesmærke. |
| Pilotprojekt · Nordlys Drift | mailroute med `sag=v7-pilot-nordlys` | Samtale og Svar/AI står side om side på desktop. AI-forslag skal først genereres/revideres og derefter indsættes; kilder og sagsgrænse er eksplicitte. Godkendelsesstatus ligger i handlingstrinnet. |
| Domicil · Leje af kontor | `/main/mail/sager` | Intern sag har samtaler, dokument, ansvar/deling og Domicil-mappe uden kunde- eller tenantoprettelse. V7 adskiller oversigt og fokusvisning, så detaljen har to rummelige hovedkolonner frem for tre smalle. |
| Opfølgning, senest korrigerede billede | `/main/mail/opfoelgning` | Mine/Alle, ejerfilter, grupperet liste, udkast og Redigér/Godkend/Udsæt er bevaret. Dennis' Mine-filter kan ikke vise Jørns personlige opfølgning. |
| Supportarbejdsflow | `/main/support` | En programrelateret mail til Dennis kan vises som samme delte supportsag, overtages af Jørn og få en intern note, som Dennis derefter ser. Der oprettes ingen kopi. |

Skærmene er tilpasset Veyros nuværende komponentmål frem for at kopiere
eksempelbilledernes pixels mekanisk. De dokumenterede forskelle er derfor
smalere mappekolonne, særskilt oversigts-/fokusroute og mere eksplicitte
sikkerheds-/kildemærker. Arbejdsgangen og informationshierarkiet følger
referencerne.

## Teknisk kortlægning

| Del | Klient | Server/data | Tilstand |
|---|---|---|---|
| Mailoversigt og detalje | `src/moduler/udbyder/EjerMailV7.jsx`, `src/fleet/ejer-mail-v7.css` | `ejerkommunikationhent` | Ejerautoriseret read; postkasse-, mappe-, status-, Mine-, søge- og sidefilter |
| Filtrering og AI-samling | `src/fleet/ejer-mail-v7-regler.js` | Data fra den aktuelle autoriserede payload | 25 pr. side; deterministisk tomtilstand; ingen tværsagsindhold i svarudkast |
| Ny mail | V7-modal med fokusfælde, ESC og synlig Annullér | `kommunikationsnykladdeopret` | Kladde alene; valideret afsender; operation-id og transaktion forhindrer dublet |
| Svar og AI | Sagsafgrænset testadapter, eksplicit indsættelse og gem | Eksisterende kladde-, godkendelses- og outboxfunktioner | Revision nulstiller godkendelse; intet automatisk send |
| Interne mapper | Domicil/Energi samt deling og fravær | `internMappe` saniteres servermæssigt; eksisterende ejerarbejdsflow genbruges | Ingen tenant eller kundekonto for intern sag |
| Support | Eksisterende fælles Support V2 med direkte `sag`-route | Samme kommunikationstråd og ejerautoriserede supportfunktioner | Fælles overtagelse; private scopes forbliver private |
| Opfølgning | Korrigeret Mine-filter og korrekt startfane | Eksisterende servergodkendelse og mailworker | Ny mail/statusændring kontrolleres umiddelbart før transport |

## Acceptmatrix M01–M10

| ID | Status | Verificeret accept |
|---|---|---|
| M01 | Bestået | Oversigten åbner uden valgt detalje. Ved 1440×900 er præcis syv hele rækker synlige, mens 25 er renderet. AI-panelet samler otte punkter fra otte autoriserede sager og har dokumenteret tomtilstand. |
| M02 | Bestået | Mine, Fælles/info, mapper, søgning, status og Mine-filter kombineres. 116 synlige tråde giver `Viser 1–25 af 116`; side 2 bevares ved direkte link og efter detalje/Tilbage. |
| M03 | Bestået | Samlet AI viser flere sager med korrekte genveje og kilder; filterændring genberegner listen, og tomt resultat siger udtrykkeligt, at intet kræver opmærksomhed. |
| M04 | Bestået | Pilottråden blev åbnet, AI-forslag genereret, revideret, indsat og gemt. Genindlæsning bevarede kladden. Tilbage gendannede postkasse, status, side og tastaturfokus på rækken. |
| M05 | Bestået lokalt | Ny mail-modal har afsender, modtager, sag, emne, tekst og vedhæftningsområde. Den opretter kun en vedvarende kladde. Samme operation-id to gange gav én kladde. Browserflowet godkendte, men sendte ikke. Den lokale mailworkertransport består syv stop-/idempotensscenarier. |
| M06 | Bestået | En syntetisk supportmail sendt direkte til Dennis blev vist i fælles Support. Jørn overtog samme sag og skrev en intern note; Dennis kunne derefter se note og ejerskifte. Private Dennis/Jørn-scopes forblev adskilt. |
| M07 | Bestået | Pilottråden har to fysiske postkassekilder, men én fælles sag. Serveren bevarer provider-/matchnøgler, og fixturegenkørsel samt ny-mail-operationen gav ingen dublet. |
| M08 | Bestået lokalt | Domicil-sagen har mappe, samtale, dokument og deling, men ingen kundekobling eller tenant. Eksisterende fraværsfunktion genbruges og ændrer ikke mailens fysiske ejerskab. |
| M09 | Bestået | Opfølgning starter på Til godkendelse, Mine viser kun Dennis' post, og udkast kan redigeres/godkendes/udsættes. De syv workerprøver dækker accepteret/afvist tilbud, ny mail, nyere kladde, uafhængig support, samtidig worker og ukendt udfald. |
| M10 | Bestået | Computed styles, tastaturfokus, modal/ESC, kladdebevarelse, mobilpanelskift og dokumentoverflow er kontrolleret i faktisk Edge-rendering ved 1440×900, 1920×1080, 899×900, 390×844 og 360×800. |

## Faktisk browserverifikation

`capture-manifest.json` er bundet til kodecommit
`eefc7f4105327555fb2e66d07d7e6b7bbd1333da`. Edge blev startet mod den lokale
preview og gennemførte normalt Auth-emulatorlogin; ingen guard eller demo-login
blev omgået.

- 1440×900: 25 renderede rækker, syv hele rækker synlige, ingen vandret
  dokumentoverflow.
- 1920×1080: oversigt og fokuseret samtale/AI uden vandret overflow.
- Tilbage: `status=afventer_os`, `side=2` og fokus på den tidligere række.
- Ny mail: `role=dialog`, fokus inde i modal, synlig Annullér, ESC lukker, ingen
  ekstern sendeknap.
- Pilot: AI → revision → indsæt → gem → genindlæs → godkend; `sent=false`.
- Mobil 390×844: kladde bevaret ved panelskift, aktivt panel `Svar og AI`, intet
  vandret dokumentoverflow.
- 899×900 og 360×800: breakpoint og kompakt liste uden vandret overflow.
- Computed font: `Inter Variable`, 14 px / 20,3 px på brødtekst; Inter i input
  og knapper. Kontrolhøjde mindst 38 px, kort-radius 12 px og fokusregel 2 px.

## Screenshots

Alle filer er faktiske browseroptagelser fra den byggede løsning:

1. `1440x900-01-din-arbejdsindbakke.png`
2. `1920x1080-02-din-arbejdsindbakke.png`
3. `1440x900-03-pilotprojekt-samtale-og-ai.png`
4. `1920x1080-04-pilotprojekt-samtale-og-ai.png`
5. `1440x900-05-pilotprojekt-godkendt-ikke-sendt.png`
6. `1440x900-06-intern-sag-domicil.png`
7. `1440x900-07-delt-supportsag.png`
8. `1440x900-08-opfoelgning-mine.png`
9. `390x844-09-mobil-mail-liste.png`
10. `390x844-10-mobil-svar-og-ai.png`
11. `899x900-11-breakpoint-mail.png`
12. `360x800-12-mobil-mail-liste.png`

De ligger i `docs/screenshots/ejer-review-v7/` sammen med
`browser-verification.json`, `capture-manifest.json` og mailworkerens lokale
resultat.

## Automatiske kontroller

- V7/V6.2/design/functions-regression: 76/76 bestået.
- Målrettet ESLint på alle ændrede V7-kilder, scripts og tests: 0 fejl.
- Produktionsbuild: Vite 5.4.21, 534 moduler.
- Autoriseret V7-emulatorfixture: 118 tråde, 112 listefixtures, delt
  supportovertagelse og note på tværs af Dennis/Jørn, private scopes adskilt,
  ny kladde idempotent, `externalMailSent=false`.
- Mailworker: syv scenarier bestået; ingen transport for blokerede tilbudsflows,
  præcis én lokal testtransport for uafhængig support, højst én ved samtidighed
  og ingen blind genudsendelse efter ukendt udfald.

Repositoryets brede lint er ikke brugt som V7-accept, fordi det fortsat stopper
i det uvedkommende `facility-v2`-spor på manglende `@eslint/js`. Det ændrede
ejerspor er lintet særskilt og rent.

## Resterende ekstern opsætning

- Microsoft 365: verificér om `info@veyrosystems.com` er delt postkasse,
  selvstændig postkasse eller alias; vælg underliggende mailbox-id, Entra-scope,
  Inbox/Sent-delta, webhook/subscription samt Send As/Send on behalf.
- OpenAI: godkend model, Functions-secret, sagsafgrænset datakontrakt og
  månedlig håndhævet forbrugsgrænse.
- Dinero: testorganisation, personlig klient, API-nøgle, organisations-id og
  kontraktprøve for faktura/kredit/køb.
- OCR og bilagsmail: leverandør, modtageadresse, malwarekontrol, retention og
  replay-/dubletstrategi.

Indtil disse punkter er konfigureret og verificeret, fortsætter mail, CRM,
support og kladder lokalt uden AI-/udbyderafhængighed. Ingen rigtig mail,
kundedata, bogføring, push, merge eller deployment er udført i V7-runden.
