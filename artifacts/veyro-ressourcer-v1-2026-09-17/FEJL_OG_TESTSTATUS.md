# Fejl- og teststatus – VEYRO Ressourcer V1

Dato: 17. september 2026  
Branch: `codex/veyro-integration-v1`  
Verificeret kodegrundlag: `04434dd78afe069ff781290bb420c28b121a3b1b`

## De seks underskriftsfejl

Fejlene fandtes også før ressourceændringerne, men kun når den samme emulator blev genbrugt:

| Grundlag | Kørsel | Resultat |
|---|---:|---:|
| Isoleret worktree `d1356cd71cc1606b49fb2e142e960bf01fe6e26a` | Ren emulator | 34/34 |
| Samme worktree og emulator | Umiddelbar genkørsel | 28/34 |
| Rettet Version 1 | Første kørsel | 34/34 |
| Rettet Version 1, samme emulator | Umiddelbar genkørsel | 34/34 |

Testen brugte faste tenant-, indberetnings- og post-ID'er. Efter første kørsel lå write-once-underskrifterne stadig i emulatoren, så genkørslen forsøgte at skrive “første underskrift” oven på eksisterende bevis. Adgangsreglen afviste dette korrekt.

Rettelsen i `9b77607ad75bc00413c253377ded19f323d3876d` rydder kun `tenantInd`, testens egen tenant, før seedning. Produktreglerne er ikke ændret. Første underskrift kan skrives på en ren post; omskrivning, feltændring, sletning og omgåelse gennem sletning af parent-data er fortsat forbudt og testet.

## Java/Netty-loopback

Dette er et separat miljøforhold. Emulatorstart inde i Windows-sandboxen fejlede i Netty med `Unable to establish loopback connection` og `SocketException: Invalid argument: connect`. Den samme JDK 11/Firebase CLI 13.35.1-konfiguration fungerede uden for sandboxen. Der er ikke ændret globale Java-, Windows- eller sikkerhedsindstillinger.

## Slutgate

| Kontrol | Resultat |
|---|---|
| `rules.indberetninger.test.mjs`, to gange i samme emulator | 34/34 + 34/34 |
| Ressourcer-/navnefokustest | 11/11 |
| Fuld platformgate | 4.656/4.656, 905 suites, 0 fejl |
| Root lint | Bestået |
| Designkontrol | 11/11 |
| Produktionsbuild | Bestået, 775 moduler |
| Functions syntaks | Bestået |
| Whitespace | Bestået; kun linjeslutningsadvarsler |

Gate-runtime: projektets Node 24.19.0 til tests; proceslokal Temurin JDK 11 og Firebase CLI 13.35.1 til emulatorerne. En kørsel med Node 20 blev ikke brugt som slutbevis, fordi runtime mangler `Map.groupBy`.

## Resterende afgrænsning

Ekstern OBD/GPS er udskudt efter aftale og er ikke en blokering for Version 1-reviewet. Kun tydeligt syntetiske, tenantlagrede emulatorfixtures er brugt. Ingen ekstern tjeneste, produktion eller kundedata er aktiveret eller ændret.
