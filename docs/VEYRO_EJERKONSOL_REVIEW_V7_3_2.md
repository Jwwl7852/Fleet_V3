# Veyro ejerkonsol — review V7.3.2

Dato: 2026-09-12

Arbejdsmappe: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`

Branch: `codex/ejer-integrated-development`

Bevaret udgangspunkt: `8886c657611da7899e9e46c81ca078bfa7f92f8d`

Testet kodecommit: `3f687334f71767f6227059c0a9bbe41b4854ca0a`

## Resultat

De to resterende layoutfejl i **Svar og AI** er afsluttet. **Svarudkast** har nu
en særskilt rulbar indholdsflade til fakta, kundekladde, AI-revision, signatur,
vedhæftninger og handlinger. Hurtiginstruksen **Bed AI ændre eller uddybe
teksten** ligger i sin egen reserverede gridrække nederst og er derfor synlig
ved både øverste og nederste scrollposition.

**AI-chat** bruger samme princip: introduktion, en reel rulbar historik og et
selvstændigt skriveområde i normal layoutstrøm. Den tidligere `position: sticky`
og lagrækkefølge er fjernet. Skrivefeltet dækker derfor ikke beskederne, og både
begyndelsen og afslutningen af en lang AI-besked kan rulles frem.

Begge skrivefelter er fuldbredde, viser 3–4 linjer og har handlingen på en
separat række. Et almindeligt Enter gav linjeskift uden at oprette en ny
AI-udveksling. Den usendte flerlinjede instruktion blev bevaret ved skift mellem
Svarudkast og AI-chat. Kun én komposer var aktiv ad gangen, og **Oplysninger**
viste ingen AI-komposer. Venstre Samtale-kolonne forblev på scrollposition 0,
mens højre indhold blev rullet.

V7.3.1-funktionerne for interne noter og personlig signatur er uændrede. Deres
funktionelle accept og beviser er dokumenteret i
`docs/VEYRO_EJERKONSOL_REVIEW_V7_3_1.md`.

## Lokal gennemgang

- Login: `http://127.0.0.1:5213/login`
- Pilotcase: `http://127.0.0.1:5213/main/mail/indbakker?postkasse=faelles&sag=v7-pilot-nordlys`
- Sagen er syntetisk, og reviewdata blev fundet efter normalt login og reload.

## Målinger

Alle værdier er CSS-pixels fra faktisk Edge-rendering. Hele datasættet ligger i
`docs/screenshots/ejer-review-v7-3-2/browser-measurements.json`.

| Viewport og panel | Rulbar flade top–bund / højde | Scroll før → efter | Komposer top–bund | Resultat |
|---|---:|---:|---:|---|
| 1440×900 Svarudkast | 437,1–586,4 / 149,3 | 0 → 835 | 597,4–811,6 | Samme position, ingen overlap |
| 1440×900 AI-chat | 506,7–634,7 / 128,0 | 0 → 1430 | 645,7–850,3 | Samme position, ingen overlap; første og sidste indhold fremrullet |
| 1920×1080 Svarudkast | 437,1–783,8 / 346,6 | 0 → 618 | 794,8–991,6 | Samme position, ingen overlap |
| 1920×1080 AI-chat | 486,4–746,1 / 259,7 | 0 → 1095 | 757,1–961,8 | Samme position, ingen overlap; første og sidste indhold fremrullet |

Ved 1440×900 var 128 px af den første lange AI-besked synlig før rulning, og
beskedens afslutning lå ved historikfladens bund efter rulning. Ved 1920×1080 var
de tilsvarende værdier 259,7 px. Højre rulning ændrede ikke venstre kolonnes
scrollposition.

## Acceptmatrix

| Kontrol | Status | Verificeret resultat | Bevis |
|---|---|---|---|
| AI-chat før/efter rulning | Bestået | Historikken kunne rulles fra første til sidste indhold; komposeren beholdt samme topkoordinat og dækkede ingen besked. | 4 desktopbilleder og målefilen. |
| Svarudkast før/efter rulning | Bestået | Hurtiginstruksen var synlig fra åbningen og ved bundscroll. Editor, signatur, vedhæftning og handlinger kunne nås i den separate indholdsflade. | 4 desktopbilleder og målefilen. |
| Skrivearbejde og faneskift | Bestået på desktop | Tre usendte linjer blev bevaret i begge faner; Enter oprettede ingen AI-udveksling. Én aktiv komposer; ingen på Oplysninger. | `draft.lines=3`, `enterTriggeredExchange=false`, `informationTabActiveComposers=0`. |
| Uafhængige kolonner | Bestået | Venstre kolonne forblev 0 → 0 ved højre rulning i begge desktopstørrelser. | Målefilen. |
| R1 — højrepanelets desktoplayout | Bestået | Begge komposere har reserveret plads i gridlayoutet uden sticky/overlay. | Kodecommit, screenshots og målinger. |
| V73-03 — desktop | Bestået | Flerlinjede komposere, separat historikrulning og fanebevarelse er verificeret ved 1440×900 og 1920×1080. | Browsermålinger og screenshots. |
| V73-03 — mobilt skærmtastatur | Resttest | Faneskift, bevaret tekst, fokus og ingen vandret overflow er kontrolleret ved 390×844 og 360×800. Et fysisk/virkeligt mobilt skærmtastatur var ikke tilgængeligt. | 2 mobilbilleder og målefilen. |

## Testresultater

- `node --test test/ejer-mail-v7-3.test.mjs`: 7/7 bestået.
- `npm run test:design`: 11/11 bestået.
- Målrettet ESLint af komponent, CSS-nær test og capturescript: bestået, 0 fejl.
- `npm run build`: bestået, 537 moduler.
- Browser: normalt tenantløst ejerlogin, reload og den syntetiske pilotcase
  bestået ved 1440×900, 1920×1080, 390×844 og 360×800.

## Design og faktisk font

Rettelsen genbruger de semantiske tokens fra `src/fleet/fleet.css` og indfører
ingen rå farver. Edge rapporterede `document.fonts.status=loaded`,
`document.fonts.check('14px Inter')=true` og den beregnede familie `Inter
Variable, Inter, -apple-system, Segoe UI, Roboto, Arial, sans-serif` på både body
og textarea.

## Begrænsninger og ekstern opsætning

Den eneste åbne layoutrelaterede resttest er det virkelige mobile
skærmtastatur. Microsoft 365, OpenAI, Dinero, OCR og bilagsmail er fortsat
**Ikke tilsluttet**. Alle viste data er syntetiske, og der er ikke udført push,
merge, deployment, produktionsændring, eksternt AI-kald eller rigtig
mailafsendelse.
