# Veyro ejerkonsol — review V7.3.1

Dato: 2026-09-12

Arbejdsmappe: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`

Branch: `codex/ejer-integrated-development`

Bevaret udgangspunkt: `3de7b32990a03c651870c83070325b772ee34476`

Testet kodecommit: `a6d4c226745534de36073ad35c196da16b0795c5`

## Resultat

V7.3.1 afslutter de fire konkrete restpunkter oven på V7.3. Den egentlige
kundekladde har nu reserveret skriveplads på desktop, og både hurtiginstruks og
AI-chat bruger panelbredden med handlingen på sin egen række. AI-historikken har
en reserveret læseflade og kan rulles uafhængigt, mens komposeren bliver nederst.

Mobilens hovedfaner styrer nu både markering, `aria-selected`, synligt panel og
fokuserbare felter. Det inaktive panel optager ikke plads. Usendt flerlinjet
tekst blev bevaret gennem skiftene Samtale → Svar og AI → Samtale → Svar og AI,
og AI-chatfeltet beholdt fokus og flerlinjet input ved 360×800.

En eksisterende kladde, der både har “Venlig hilsen Dennis” i brødteksten og en
separat signatur, kan ikke længere godkendes lydløst. Ejeren skal vælge at
beholde den skrevne afslutning eller erstatte den med sin aktuelle signatur.
Gennemgangen viser ét samlet udgående svar. Den lokale worker afviste en
signaturændring efter godkendelse før transporten og kaldte efter ny godkendelse
testtransporten præcis én gang med præcis én signatur.

Noter vises nu under **Interne noter · nyeste først** med forfatter og tidspunkt
i både mail og Support. Browserbeviset kobler den samme tråd og det samme note-id
til begge visninger og viser persistence efter reload og adgang fra Jørn.
Tekniske id’er vises kun i bevisfilen, ikke i brugerfladen.

## Lokal gennemgang

- Login: `http://127.0.0.1:5213/login`
- Pilotcase: `http://127.0.0.1:5213/main/mail/indbakker?postkasse=faelles&sag=v7-pilot-nordlys`
- Samme sag i Support: `http://127.0.0.1:5213/main/support?sag=v7-pilot-nordlys`
- Personlig signatur: `http://127.0.0.1:5213/main/indstillinger/mail-signatur`

Det lokale preview bruger normalt tenantløst ejerlogin. Reviewdata blev
kontrolleret efter genindlæsning. Den efterladte syntetiske pilotcase er knyttet
til Support og indeholder den verificerede note.

## Hvor findes noter og signatur?

På pilotsagen ligger notefeltet nederst i venstre **Samtale**-kolonne under
**Intern note til Dennis og Jørn**. Gemte noter findes umiddelbart ovenover
under **Interne noter · nyeste først**. Vælg **Åbn Support** på den samme sag for
at se præcis den samme note i supportdetaljen.

Signaturen opsættes via **Indstillinger → Mail og signatur**. På en eksisterende
kladde vælges **Anvend min aktuelle signatur**. Hvis brødteksten allerede har en
kendt afslutning, vises først det eksplicitte valg **Behold den skrevne
afslutning** eller **Erstat med min aktuelle signatur**.

## Årsag og rettelse

| Punkt | Fundet årsag | Rettelse |
|---|---|---|
| R1 | AI-panelets automatiske gridrækker kunne krympe editoren til næsten ingen synlig højde; AI-chatten manglede samtidig reserveret historikplads. | Gridrækker bruger indholdshøjde, editoren har reserveret minimumshøjde, AI-historikken mindst 112 px, og begge AI-felter er fuldbredde med knappen på næste række. |
| R2 | En senere mobilregel satte samtalepanelet til `display:grid!important`, også når Svar og AI var valgt. | De to mobiltilstande har nu modsatrettede, eksplicitte show/hide-regler, mens React-fane, ARIA og panel-id’er bruger samme state. |
| R3 | Kladdebrødtekst og separat signatur blev samlet uden at opdage en kendt afslutning i brødteksten. | En præcis, afsluttende matcher bruger kendte ejernavne, kræver et synligt valg og lader vilkårlige hilsner/citeret historik være urørt. Review viser ét samlet svar. |
| R4 | Support viste noter i rå objektrækkefølge uden forfatter/tid, og mailens gemmebesked gjorde ikke noten let at genfinde. | Begge visninger sorterer stabilt nyeste først og viser samme persistente note med forfatter og tidspunkt. Supportruten bevarer den fælles postkassekontekst. |

## Acceptmatrix

| ID | Status | Verificeret resultat | Bevis |
|---|---|---|---|
| V73-01 | Bestået | Referenceopbygningen med Samtale og Svar og AI er bevaret; kundekladde, fakta og forslag er tydeligt adskilt. | Screenshots 01, 03–06 og `browser-proof.json`. |
| V73-02 | Bestået | Mail, noter og AI-udvekslinger har stabil nyeste-først-visning uden at ændre AI-testadapterens kronologiske kontekst. | Node-tests 6/6, screenshots 07–10. |
| V73-03 | Bestået | Note- og AI-komposere ligger nederst, flerlinjet input virker, og historierne har selvstændig rulning. | AI-scroll 0 → 98 px og højre Svarudkast-scroll 0 → 518 px; venstre kolonne forblev 0 px. |
| V73-04 | Bestået | Noter deles kun efter sagens adgangsregler; Jørn ser den fælles note, mens privat noteændring afvises. | `sharedNote.otherOwner=true` og V7.3-emulatortesten. |
| V73-05 | Bestået | Personlige signaturer for Dennis/Jørn er adskilt og persistente; eksisterende kladder ændres kun efter brugerhandling. | V7.3-emulatortest og screenshot 02. |
| V73-06 | Bestået | AI opfinder ingen signatur, og noter/chat er ude af review og transport. Ændret signatur ugyldiggør godkendelsen. | Screenshot 06 og `signature-transport-proof.json`. |
| V73-07 | Bestået | Normalt login, reload, fælles sag, Support og V7.2-sikkerhedsgrænser er bevaret. | `normalLogin=true`, `reload=true`, målrettede tests og build. |
| R1 | Bestået | Ved 1440×900 ramte et normalt klik editoren, skrev én flerlinjet testsætning, gemte og viste den efter reload og i review. Samme editor blev optaget ved 1920×1080. Hurtiginstruks er 507 px bred; handlingen står på egen række. | Screenshots 01, 03–06; editorens synlige boks var top 486,1 px, bund 664,1 px, højde 178 px. |
| R2 | Delvist bestået | Aktiv mobilfane, synligt panel, ARIA, bevaret usendt tekst, fokus og ingen vandret overflow er verificeret ved 390×844 og 360×800. | Screenshots 11–12 og browserbevis. Et virkeligt mobilt skærmtastatur var ikke tilgængeligt; testen brugte headless Edge med smal viewport og syntetiserede almindelige tastaturhændelser. |
| R3 | Bestået | Dobbelt afslutning blokerede review; efter eksplicit erstatning viste review én signatur. Signaturændring efter godkendelse gav 0 transportkald; ny godkendelse gav præcis 1 lokalt kald med én afslutning. | Screenshots 02 og 06, enhedstest og `signature-transport-proof.json`. |
| R4 | Bestået | Samme note står øverst med samme forfatter/tid i Mail og Support efter reload og er synlig for den anden ejer. | Screenshots 09–10. Tråd `v7-pilot-nordlys`, note-id og identisk ISO-tid findes i `browser-proof.json`. |

## Testresultater

- Målrettet ESLint af berørte V7.3/V7.3.1-kode-, function-, test- og
  capturescriptfiler: bestået, 0 fejl.
- `test/ejer-mail-v7-3.test.mjs`: 6/6 bestået.
- Designtokens: 11/11 bestået; ingen rå farver uden for `fleet.css`.
- V7.3-emulatorflow: personlige signaturer, fælles note, anden ejer og privat
  adgangsafvisning bestået; 0 eksterne mail-/AI-kald.
- V7.3.1-mailworker: signaturændring stoppet før transport; ny godkendelse gav
  ét lokalt transportkald og én signatur.
- Vite-produktionsbuild: bestået, 537 moduler.
- Browser: normalt login/reload og 12 faktiske PNG’er ved 1440×900,
  1920×1080, 390×844 og 360×800.

Repositoryets brede `npm run lint` går ind i den uændrede, indlejrede
`facility-v2`-installation og stopper på dens manglende `@eslint/js`. Den
målrettede lint for hele denne rettelsesrunde er grøn.

## Design og faktisk font

Implementeringen bruger fortsat de semantiske tokens i `src/fleet/fleet.css`
og deres kontrakttest. Der er ikke indført lokale rå farver. Edge rapporterede
`document.fonts.status=loaded`, `document.fonts.check('14px Inter')=true` og
beregnet fontfamilie `Inter Variable, Inter, -apple-system, Segoe UI, Roboto,
Arial, sans-serif` på body, tekstfelter og knapper.

## Screenshots og maskinbeviser

Mappen `docs/screenshots/ejer-review-v7-3-1/` indeholder:

1. `1440x900-01-synligt-svarfelt.png`
2. `1440x900-02-signaturvalg.png`
3. `1440x900-03-gemt-flerlinjet-svar.png`
4. `1920x1080-04-gemt-flerlinjet-svar.png`
5. `1440x900-05-bred-hurtiginstruks-efter-rulning.png`
6. `1440x900-06-samlet-svar-med-en-signatur.png`
7. `1440x900-07-ai-chat-foer-rulning.png`
8. `1440x900-08-ai-chat-efter-rulning.png`
9. `1440x900-09-gemt-note-i-mail.png`
10. `1440x900-10-samme-note-i-support.png`
11. `390x844-11-mobil-aktiv-svarfane.png`
12. `360x800-12-mobil-ai-chat-fokus.png`
13. `browser-proof.json`
14. `signature-transport-proof.json`
15. `manifest.json`

## Kendte begrænsninger og ekstern opsætning

R2 er bevidst markeret delvist bestået, fordi der ikke var et fysisk
mobilmiljø eller en enhedsemulator med et virkeligt virtuelt tastatur. Fokus,
smal viewport, dokumentrulning og bevaret tekst er verificeret; den konkrete
OS-tastaturoverlejring er ikke.

Microsoft 365, OpenAI, Dinero, OCR og bilagsmail er fortsat **Ikke tilsluttet**.
Alle data er syntetiske, AI er deterministisk lokal testadapter, og transporten
er injiceret lokalt. Ingen push, merge, deployment, produktionsændring,
eksternt AI-kald eller rigtig mailafsendelse er udført.
