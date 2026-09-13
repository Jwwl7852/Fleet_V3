# Input fra ejersporet til Veyros fælles supportkontrakt

Dato: 2026-09-12

Status: Kontraktinput fra ejerkonsollen. Samlingschatten ejer den kanoniske
`docs/VEYRO_SUPPORT_KONTRAKT_V1.md`, den fælles kodeejer og kundeplatformens
supportindgang. Ejersporet har ikke oprettet offentlige portalendpoints, fælles
tabeller eller nye sikkerhedsregler.

## Kanoniske identiteter

| Begreb | Eksisterende identitet og placering |
|---|---|
| Kommunikationstråd / supportsag | `traadId` under `udbyder/salgsindbakke/traade/{traadId}`. En supportsag er samme tråd med `sagstype: support` og `support.nummer`; der oprettes ikke en kopi til Support. |
| Supportnummer | `support.nummer`, kun et brugerrettet nummer. Det erstatter ikke `traadId`. |
| Kunde | `links.virksomhedId` og den eksisterende CRM-virksomhed. |
| Tenant | Eksisterende permanent tenant-id på virksomheden/aftalen. Ejeradgangen er tenantløs og må ikke udfyldes med en kundetenant. |
| Besked | `beskeder/{beskedId}` på tråden; retning og kanal skal bevares. |
| Intern note | `noter/{noteId}` på samme tråd med `intern: true`, forfatter og tidspunkt. |
| Intern AI-chat | `aiArbejdsrum.chat/{beskedId}` på samme tråd med `intern: true` og fælles revision. |
| Kundesvar | `svarKladder/{kladdeId}` med revision, aktivitetsgrundlag, indholdshash, valgte vedhæftninger og separat signatur. |
| Videnskilde | `udbyder/vidensbase/poster/{vidensId}` med uforanderlige versioner og metadata for status, publikum, modul og relevante versioner. |

Relevante eksisterende kodefiler er `functions/index.js`,
`src/fleet/ejer-kommunikation-regler.js`, `src/fleet/ejer-salgsindbakke.js`,
`src/fleet/ejer-support-ai.js`, `src/moduler/udbyder/EjerMailV71Samtale.jsx`
og `src/moduler/udbyder/EjerSupportV2.jsx`.

## Operationer der kan genbruges

| Behov | Eksisterende serveroperation | Bemærkning til fælles kontrakt |
|---|---|---|
| Læs synlige sager | `ejerkommunikationhent` | Filtrerer gennem ejerens eksisterende synlighedsregel; må ikke blive et offentligt kundeendpoint. |
| Klassifikation | `kommunikationsklassifikationopdater` | Binder tråden til support uden at kopiere historikken. |
| Overtagelse/ansvar | `salgstraadopdater` eller `supportsagopdater` | Begge bruger forventet revision; samlingskontrakten bør udpege én kanonisk operation. |
| Supportstatus | `supportsagopdater` | Status, type, prioritet, modul, frist og ansvarlig valideres servermæssigt. |
| Intern note | `salgsnoteopret` | Gemmes på tråden og må aldrig mappes til kundesynlig besked. |
| Intern AI-fejlsøgning | `supportaiforslaggem` | Lokal ejeradapter; gemmer intern chat og et separat redigerbart kundesvar med kildegrundlag. |
| Gem svarudkast | `kommunikationssvarkladdegem` | Revisions- og aktivitetsbundet kladde. |
| Godkend svar | `kommunikationssvargodkend` | Konkret menneskelig godkendelse af tekst, signatur, modtager og vedhæftninger. |
| Transport | `kommunikationssvarafsend` | Skal have én valgt kanal. Portal og e-mail må ikke begge vælges implicit. |
| Læs vedhæftning | `salgsvedhaeftninghent` | Ejerbeskyttet læsning af en vedhæftning på den synlige tråd. |

## Streng indholdsadskillelse

- Kundesynlig samtale består kun af indgående/udgående kundebeskeder og det
  konkret godkendte svar.
- Interne noter forbliver i `noter` og har altid `intern: true`.
- Intern AI-chat forbliver i `aiArbejdsrum.chat` og har altid `intern: true`.
- AI-fejlsøgningen må gerne bruge intern viden til intern vurdering, men kun en
  kilde med `vidensstatus: godkendt` og `publikum: kunde_godkendt` må levere
  løsningsindhold til et kundesvar.
- Signaturen ligger separat fra brødteksten og samles én gang ved godkendelse
  og transport.

## Nødvendigt overdragelsesinput fra kundeplatformen

En overdragelse skal mindst levere:

- stabilt `traadId`, kundens permanente tenant-id og CRM-kunde-id;
- problemtekst, valgt modul og kendt produktversion;
- hele den kundesynlige dialog i stabil beskedrækkefølge;
- allerede afprøvede trin og deres registrerede resultat;
- dokumenterede kilder med kilde-id, version, status og publikum;
- grund til eskalering samt tidspunkt og idempotensnøgle;
- kanalstatus, vedhæftningsmetadata og aktuel menneskelig ansvarlig;
- seneste aktivitetsrevision, så ældre genereringer kan afvises.

Manglende oplysninger skal angives som ukendte. De må ikke erstattes med nul,
antagelser eller en syntetisk forklaring.

## Krav ved menneskelig overtagelse

Når Dennis eller Jørn overtager sagen, skal den fælles kontrakt atomisk sætte
et menneske-som-ansvarlig-flag og øge sagens revision. Enhver automatisk
kundesvarsgenerering skal kontrollere flag og revision både før generering og
umiddelbart før publicering. Et allerede kørende resultat skal kasseres, hvis
overtagelsen sker imens. En intern kladde kan fortsat gemmes til menneskelig
gennemgang, men må aldrig publiceres automatisk efter overtagelsen.

## Åben fælles integration

Den lokale ejeradapter viser en syntetisk overdragelse i samme sag og er testet
uden ekstern forbindelse. Kundeportaltransport, fælles kontrakt og automatisk
kundebot er ikke implementeret eller verificeret i ejersporet. De skal ejes og
samles ét sted af samlingschatten, hvorefter ejerfladen kan kobles på uden at
ændre ovenstående identiteter eller indholdsgrænser.
