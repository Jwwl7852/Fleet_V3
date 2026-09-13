# Veyro ejerkonsol — review V7.1

Dato: 2026-09-12  
Arbejdsmappe: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`  
Branch: `codex/ejer-integrated-development`  
Bevaret udgangspunkt: `964ed53de919172d418929a5da5ee1704559166a`  
Browserverificeret kode: `09d1359a637608567231a059c47a7bb4fc6918ed`

## Resultat

V7.1-mailarbejdsrummet er implementeret med referencebilledets todelte
sagsvisning: kundesamtalen står til venstre, og **Svar og AI** står til højre.
Højrepanelet har præcis fanerne **Svarudkast**, **AI-chat** og **Oplysninger**.
Fanerne er reelle arbejdsområder og bevarer deres indhold ved skift.

AI-chatten er en fælles, intern og vedvarende sagstråd for Dennis og Jørn.
Serveren gemmer deltager, tidspunkt, revision, faktagrundlag og aktivt forslag.
Et forslag vises før indsættelse, kan ikke overskrive nyere mail eller manuel
tekst, og indsættes kun ved en særskilt ejerhandling. Den deterministiske lokale
testadapter blev brugt; OpenAI blev ikke kaldt.

Gennemgang og afsendelse er adskilt. Gennemgangen indeholder kun den konkrete
kundetekst, afsender, modtager og vedhæftninger. Intern AI-chat, sælgerbaggrund
og interne noter indgår ikke i transportpayloaden. Browsertesten godkendte et
svar lokalt, men sendte det ikke.

## Lokal gennemgang

- Preview: `http://127.0.0.1:5211/login`
- Mailoversigt: `/main/mail/indbakker?postkasse=faelles`
- Pilotcase: `/main/mail/indbakker?postkasse=faelles&sag=v7-pilot-nordlys`
- Intern Domicil-sag: `/main/mail/sager?postkasse=faelles&mappe=domicil&sag=v7-domicil&fra=sager`
- Fælles supportsag: `/main/support?sag=v7-support-dennis`
- Opfølgning: `/main/mail/opfoelgning`

Log ind gennem den normale loginformular med den tenantløse lokale testejer,
som er konfigureret i den git-ignorerede `.env.owner-emulator.local`. Rapporten
og ZIP-filen indeholder ingen adgangsoplysninger. Normal login og efterfølgende
genindlæsning blev udført af den faktiske browseraccept og gav de 116 synlige
reviewtråde igen.

## Detaljeret acceptmatrix A01–A11

| ID | Status | Implementering | Verifikationsbevis |
|---|---|---|---|
| A01 | Bestået | **Svar og AI** har præcis `Svarudkast`, `AI-chat` og `Oplysninger` som ARIA-faner med selvstændige paneler. | DOM-målingen returnerede nøjagtigt de tre labels; `ejer-mail-v7-1.test.mjs` kontrollerer labels og reviewtrin. |
| A02 | Bestået lokalt | Dennis kan skrive kontekst i den fælles AI-chat. Den lokale adapter laver et kortere forslag, bevarer 25 enheder, 3 måneder og 5 brugere/2 administratorer, venter med CVR og foreslår telefon. Forslaget vises før den eksplicitte handling **Indsæt i svarudkast**. | Screenshot 05 samt browserflowet `aiForslag`, `forslagFoerIndsaettelse` og `indsatEksplicit`; regeltest består. |
| A03 | Bestået i emulator | AI-chat, forslag, udkast og Oplysninger gemmes på sagen med revision. Dennis og Jørn fortsatte samme delte chat efter genindlæsning. Jørns adgang til en privat Dennis-sag blev afvist. | Seed-/kontraktresultat: `sharedAiChatContinuedByDennisAndJoern=true`, private scopes adskilt. |
| A04 | Bestået | Oplysninger viser 5 brugere i alt, 2 af 5 med administratoradgang, kilder og manglende CVR/startdato/OBD. CVR står fortsat som ikke oplyst, selv når chatinstruksen siger at vente med CVR. Sælgerbaggrund er intern og vedvarende. | Screenshot 07; alle fire browsermålinger `fiveUsers`, `twoAdmins`, `cvrMissing`, `sellerContext` er `true`. |
| A05 | Bestået | Forslagets grundlag omfatter sagsrevision, seneste aktivitet, kladderevision og tekstfingeraftryk. Ny mail, samtidig sagsændring eller manuel kladdeændring gør forslaget forældet. Faneskift sletter ikke arbejde. | Tre forældelsesscenarier i regeltesten; emulatoren returnerede `staleAiOverwriteRejected=true`; mobilpanelskift bevarede ugemt tekst. |
| A06 | Bestået lokalt; ekstern transport ikke udført | **Gennemse og send** åbner fokusfanget modal. **Godkend svar** ændrer kun status; **Afsend godkendt svar** er en særskilt handling. Payloadbyggeren medtager aldrig intern chat eller noter. | Screenshot 06; `reviewAdskillerInternData=true`, `internalChatInTransport=false`, `sent=false`. Microsoft 365 er ikke tilsluttet. |
| A07 | Bestået | 360, 390 og 899 px bruger fuld kortbredde, normal orddeling og ingen vandret dokumentoverflow. Postkassevalg, testmærkat, statusfiltre og mapper er synlige og betjenelige på mobil. 900 px og desktop er kontrolleret separat. | Screenshots 11–15; 390 px rækkeforhold 0,994, `foldersVisible=true`, `filtersVisible=true`; 899/900 uden overflow. |
| A08 | Bestået | Domicil-sagen viser `Havneparken Ejendomme` som modpart og forklarer, at det er en intern sag uden oprettet kunde. Kundehandlinger skjules. | Screenshot 08; `correctCounterparty=true`, `wrongCustomerLabel=false`, `kundeOprettet=false`. |
| A09 | Bestået | Overtagelse af den delte supportsag opdaterer både ejer og status transaktionelt. Kø og detalje viser Jørn og **Afventer os** efter genindlæsning; ikke `Ikke fordelt`. | Screenshot 09; alle supportmålinger er `true`; emulatorens `supportQueueAndDetailStatus=afventer_os`. |
| A10 | Bestået lokalt | Normal login og reload viser den varige emulatorfixture. Indlæsning, fejl med **Prøv igen**, ingen data og filtertomtilstand er forskellige visninger. Aktive URL-filtre kan nulstilles med **Nulstil filtre**. | `normalLoginReload=true`; 25 renderede/116 filtrerbare poster; browseren verificerede den særskilte AI-tomtilstand. |
| A11 | Bestået | Samtalekolonnen og Svar/AI-panelet har hver sin desktop-scroll. Mobil fjerner de indlejrede arbejdsrullere og gør bunden nåelig med dokumentrulning. | Ægte CDP wheel-events: venstre `0→223`, højre forblev `0`; derefter højre `0→420`, venstre forblev `223`. Mobil `reachedBottom=true`. |

## Designreview

Referencebilledets hierarki, handlingsrækkefølge og de to uafhængige
arbejdskolonner er fulgt. Den byggede løsning bruger den eksisterende ejerskal
og de semantiske tokens fra `src/fleet/fleet.css`; der er ikke indført rå
farveværdier i V7.1-CSS/JSX. Testmærket og teksten om frakoblede tjenester er
mere eksplicit end referencebilledet for at undgå at syntetiske handlinger kan
forveksles med virkelig mail eller AI.

Faktisk computed style i Edge:

- `Inter Variable, Inter, -apple-system, Segoe UI, Roboto, Arial, sans-serif`
- fontstatus `loaded`; Inter Variable fundet i `document.fonts`
- brødtekst og knapper 14 px / 20,3 px (linjehøjde 1,45)
- minimum knaphøjde 38 px
- primær kortradius 12 px
- fokusregel 2 px

Det visuelle resultat bruger Veyros navy platformramme, teal til aktive
handlinger/navigation og lyse arbejdsflader. Statusfarver ledsages af tekst.

## Server-, data- og sikkerhedsforløb

- De nye callable-funktioner anvender eksisterende tenantløs ejeradgang og den
  samme server-side synlighedspolitik som kommunikationstråden.
- Opdateringer er revisionsbeskyttede, transaktionelle og idempotente via
  operation-id. Audit registrerer ejer og hændelse.
- Supportovertagelse synkroniserer den underliggende kommunikationstråd; der
  oprettes ikke en kopi.
- Chat og sælgerbaggrund ligger i interne noder. Transporten konstrueres fra
  den godkendte kundekladde og vedhæftninger alene.
- Domicil forbliver en intern sag og opretter hverken tenant eller kunde.
- Andre modulworktrees er ikke ændret.

## Testresultater

- Målrettet ESLint på syv V7.1-filer: 0 fejl.
- Node-regression: 19/19 bestået (`ejer-mail-v7`, `ejer-mail-v7-1`, `design-tokens`).
- Vite 5.4.21 produktionsbuild: bestået, 535 moduler transformeret.
- Autoriseret V7.1-emulatorfixture: bestået med 118 syntetiske tråde; privat
  adgang afvist, delt AI-chat fortsat af begge ejere, stale forslag afvist,
  intern chat udeladt og ekstern mail ikke sendt.
- Browseraccept: 15 faktiske screenshots; alle assertions i
  `browser-verification.json` består.

Den brede historiske `npm test`-kommando er ikke brugt som V7.1-bevis, fordi
den også forsøger at lintkøre en separat indlejret Facility-installation, som
mangler sin egen `@eslint/js`-afhængighed. Den målrettede root-lint, build og de
relevante regressioner er grønne.

## Screenshots og maskinlæsbare beviser

Alle billeder er faktiske optagelser fra den kørende lokale løsning:

1. `1440x900-01-din-arbejdsindbakke.png`
2. `1920x1080-02-din-arbejdsindbakke.png`
3. `1440x900-03-svarudkast.png`
4. `1920x1080-04-svarudkast.png`
5. `1440x900-05-ai-chat-forslag-foer-indsaettelse.png`
6. `1440x900-06-gennemse-foer-godkendelse.png`
7. `1440x900-07-oplysninger-med-kilder.png`
8. `1440x900-08-intern-sag-domicil.png`
9. `1440x900-09-delt-supportsag.png`
10. `1440x900-10-opfoelgning-mine.png`
11. `390x844-11-mobil-mail-liste.png`
12. `390x844-12-mobil-svar-og-ai.png`
13. `899x900-13-breakpoint-mail.png`
14. `900x900-14-breakpoint-mail.png`
15. `360x800-15-mobil-mail-liste.png`

Mappen `docs/screenshots/ejer-review-v7-1/` indeholder desuden
`capture-manifest.json`, `browser-verification.json`, `emulator-test-results.json`
og `test-results.txt`.

## Resterende ekstern opsætning

Microsoft 365, OpenAI, Dinero, OCR og bilagsmail er fortsat **Ikke tilsluttet**.
V7.1 kræver følgende uden for den lokale leverance:

1. Microsoft 365-godkendelse og provider-webhooks/workerdrift, før virkelig
   indlæsning eller afsendelse kan verificeres.
2. OpenAI-credentials og godkendt model-/forbrugsopsætning, før den lokale
   testadapter må erstattes af eksterne AI-kald.
3. Separat konfiguration og verifikation af Dinero, OCR og bilagsmail.

Ingen push, merge, deployment, produktionsændring, ekstern AI-kald eller rigtig
mailafsendelse er foretaget.
