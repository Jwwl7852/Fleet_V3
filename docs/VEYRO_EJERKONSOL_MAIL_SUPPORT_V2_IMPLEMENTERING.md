# Ejerkonsol — mail, support og arbejdsflow V2

Status pr. 11. september 2026: implementeret og lokalt verificeret med syntetiske
data. Ingen ekstern integration er aktiveret, og ingen virkelig mail er sendt.

## Bygget kontrakt

- Microsoft 365-indlæsning er serverbaseret og kan køre uden en åben browser.
  Det planlagte job gennemgår konfigurerede personlige og fælles postkasser,
  både Inbox og Sent Items, med separat delta-checkpoint pr. postkasse/mappe.
- Samme Internet Message ID vinder over provider-id ved deduplikering. En sag kan
  derfor bevare flere postkassekilder uden at vise samme mail flere gange.
- Kendte kundemails til Dennis, Jørn eller info-adressen deles i kundens sag.
  Supportklassifikation viser samme tråd i supportkøen. Personlig, uklar
  korrespondance deles ikke automatisk, men placeres til klassifikation.
- Ansvarlig er arbejdsfordeling, ikke synlighedsgrænse. Begge godkendte ejere kan
  se og overtage delte sager; tenantløst ejerclaim kontrolleres servermæssigt.
- Svar og opfølgninger gemmes som konkrete kladder. Modtager, tekst,
  vedhæftninger, indholdshash, seneste aktivitet og revision indgår i
  godkendelsen. Ny aktivitet eller redigering gør godkendelsen ugyldig.
- En unik mailjobnøgle beskytter mod dobbeltindsendelse. Frakoblet Microsoft 365
  fejler lukket; ukendt leveringsresultat må afstemmes og genudsendes ikke blindt.
- Support har lukket katalog for type, prioritet og status, stabilt sagsnummer,
  ansvarlig, frist, historik og optimistisk samtidighedskontrol.
- Veyros eget leverandørkartotek ligger under ejergrænsen og blandes ikke med
  kundernes tenantdata. Mobilbilag bruger samme validerede bilagskæde og bevarer
  originalfilen med kilden `mobilkamera`.
- Statistik viser hitrate kun for afsluttede muligheder, hele den uafkortede
  pipeline, pilotforløb, mail og support. Linje-, generel og introduktionsrabat
  anvendes sekventielt; bindende priser kommer fortsat fra ratebladet.

## Lokal verifikation

- Kommunikationens rene regler og designkontrakten: 16/16 bestået.
- Firebase Database/Storage AK-01–AK-04: 34/34 bestået med Node 20.20.2,
  Firebase CLI 13.35.1 og Temurin JDK 11.0.32.1+1.
- Salg → rateblad → tilbud v1/v2 → PDF → accept → aftale → kundekonto →
  invitation: bestået i emulator.
- Faktura → delbetaling → kreditnota → bilagsupload/dublet → frosset
  Dinero-klargøring/match: bestået i emulator.
- Mail/support V2: supportovertagelse, konkurrerende revision, konkret
  svargodkendelse, blokering efter ny mail og ejerleverandører: bestået uden
  afsendelse.
- Vite-build og afgrænset ESLint for de ændrede ejerfiler: bestået.

## Ekstern opsætning før aktivering

1. Verificér om `info@veyrosystems.com` er delt postkasse, selvstændig postkasse
   eller alias, og registrér den faktiske underliggende mailbox-id.
2. Opret mindst-mulig Entra/Graph-adgang for de valgte postkasser, herunder
   Inbox/Sent Items og dokumenteret Send As/Send on behalf.
3. Gem tenant-id, client-id og secret servermæssigt. Aktivér deltajob,
   checkpoint-retention og fejlalarmer. Webhook kan supplere polling og kræver
   offentlig HTTPS-endpoint, valideret `clientState` og abonnementsfornyelse.
4. Konfigurér OpenAI-model, serversecret og håndhævet månedsbudget; test først
   med syntetisk indhold. Mail/CRM fortsætter ved fejl eller opbrugt budget.
5. Tilslut Dinero, OCR og bilagsmail hver for sig og dokumentér testorganisation,
   mapping, retention og malwarekontrol. Ingen aktiveres implicit.

## Dokumenterede Microsoft Graph-kilder

- Change notifications: https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks
- Lifecycle: https://learn.microsoft.com/en-us/graph/change-notifications-lifecycle-events
- Mail delta: https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0
- Send fra anden bruger: https://learn.microsoft.com/en-us/graph/outlook-send-mail-from-other-user
