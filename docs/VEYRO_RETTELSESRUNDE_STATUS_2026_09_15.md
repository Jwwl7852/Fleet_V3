# Veyro-rettelsesrunde — kravstatus 15. september 2026

Denne matrix genvurderer alle 36 krav fra rettelsesgrundlaget mod det aktuelle
arbejdstræ. `Implementeret` betyder, at det beskrevne krav er til stede i den
angivne produktgrænse. Det betyder ikke automatisk, at en lokal prototype er
blevet til serverfunktionalitet. Browserbevis mærket `tidligere` er ikke genbrugt
som aktuelt bevis.

Samlet aktuel vurdering: **20 implementerede, 16 delvise, 0 ikke implementerede
og 0 blokerede**. Af de 20 implementerede er flere udtrykkeligt lokale eller
teknisk verificerede; kolonnerne `Backend` og `Resterer` er den autoritative
afgrænsning.

| ID | Aktuel vurdering | Implementering | Faktisk browserbevis på slutgrundlaget | Backend | Resterer |
| --- | --- | --- | --- | --- | --- |
| UX-01 | Implementeret | 100 %, husket visning og nulstilling findes. | Ikke genkørt 15/9; tidligere bevis er historisk. | Lokal bruger-/kontekstpræference; ingen serverdata. | Samlet viewportmatrix under REG-03. |
| UX-02 | Implementeret | Sidebar og arbejdsområdezoom er adskilt; scrollbar skjules uden teksthop. | Ikke genkørt 15/9; tidligere bevis er historisk. | Ikke relevant. | Samlet viewportmatrix. |
| UX-03 | Implementeret | Hele moduloverskriften folder; underpunkter navigerer. | Ikke genkørt 15/9; tidligere bevis er historisk. | Ikke relevant. | Samlet regression. |
| UX-04 | Implementeret | Kompakt flyout håndterer hover, fokus, touch, ESC og kanter. | Ikke genkørt 15/9; tidligere bevis er historisk. | Ikke relevant. | Samlet menu-/viewportmatrix. |
| UX-05 | Implementeret | Variant B-flig, klikmål og aria er implementeret. | Ikke genkørt 15/9; tidligere bevis er historisk. | Ikke relevant. | Samlet viewportmatrix. |
| UX-06 | Implementeret | FLEET-ruter gemmer oprindelsesrute, filtre, valgt række/fane og scroll; direkte URL/reload får intern fallback. | **15/9:** overblik, arbejdskø, indberetninger, enhedsprofil og sagsmappe; direkte sags-URL + reload gik tilbage til `/arbejdsko`. | Ingen auth-omgåelse; integreret root-browser blev stoppet af utilgængelig login-tjeneste. | Integreret browserbevis, når normal login-tjeneste er tilgængelig. |
| UX-07 | Delvist | Nye FLEET-rutedialoger har fokusfælde, ESC/X/baggrund, fokusretur og dirty-bekræftelse. | Ikke genkørt 15/9. | Domæner kan kræve arkivering frem for hard delete. | Audit og fejlforløb for øvrige moduldialoger. |
| FC-01 | Implementeret | Indbakke, betinget Ekstra kontrol og Arkiv med kompatible dybe links. | Ikke genkørt 15/9. | Serveropsætning styrer Ekstra kontrol. | Integreret slutregression. |
| FC-02 | Implementeret | Kontrol bliver i Indbakke, fjerner posten og vælger næste; fejl bevarer den. | Ikke genkørt 15/9. | Kontrolflowet er serverkoblet; demoindtag er fortsat lokalt. | Integreret browserbevis med normal auth. |
| FC-03 | Delvist | Opsætning, nettogrænse, anden person, allowlist, revision og audit er koblet. | Ikke genkørt 15/9. | Callables og serverlagring findes uden lokal fallback. | Browserbevis med to normale brugersessioner. |
| FC-04 | Delvist | Synligt omfang, én bekræftelse, revision, delsvar og idempotent genforsøg findes. | Ikke genkørt 15/9. | Masse-callable kontrollerer adgang og grundlag pr. faktura. | Integreret browserbevis med autentificerede serverposter. |
| FC-05 | Implementeret | Match-/modulfilter og fast nyeste-rækkefølge findes. | Ikke genkørt 15/9. | Ingen særskilt servermutation. | Integreret slutregression. |
| FC-06 | Delvist | Filnavn, lokal status, SHA-256-dubletværn og genforsøg findes og mærkes som demo. | Ikke genkørt 15/9. | Ingen permanent modtagelse, pipeline eller backendkvittering. | Implementér autoriseret serverupload og kvittering. |
| FC-07 | Implementeret | Tre selvscrollende, justerbare og huskede paneler. | Ikke genkørt 15/9. | Panelbredder er lokale præferencer. | Samlet viewportregression. |
| FC-08 | Implementeret | Mail/forbindelser ligger under fælles Opsætning. | Ikke genkørt 15/9. | Ekstern mail er fortsat deaktiveret. | Ingen aktivering uden særskilt beslutning. |
| FL-01 | Implementeret | KPI'er og handlingsliste åbner relevante filtre og forklarer udsnit. | Ikke genkørt 15/9. | Lokal FLEET-readmodel. | Produktionskilder følger de enkelte datakrav. |
| FL-02 | Delvist | Dag/uge/måned/kvartal/år bruger daterede observationer og korrekte akser. | Ikke genkørt 15/9. | Kun lokal/syntetisk registreret historik. | Autoritativ produktionshistorik. |
| FL-03 | Delvist | Månedsskift, nedetid, manglende data og sidste år beregnes fra registrerede poster. | Ikke genkørt 15/9. | Lokal repository/readmodel. | Autoritativ omkostnings- og statushistorik. |
| FL-04 | Delvist | Wheel/+/-zoom, klynger, enkeltvalg og flydende enhedspopup med profilhandling findes. | **15/9 desktop:** NB-010-popup med Greve/status/friskhed og profilroute. **15/9 mobil 390×844:** popup synlig inden for kortet. Klyngevalg åbnede SC-104-popup. Konsol: 0 fejl/advarsler. | Ingen ekstern OBD/GPS-kilde aktiveret; fixture er tydeligt mærket. | Valideret autoritativ positionskilde og fuld input-/viewportregression. |
| FL-05 | Implementeret | Moderne FLEET-kartotek er primær Opsætning-route; gamle dybe links og PLANNING-reference bevares. | Ikke genkørt 15/9. | FLEET-data er lokal IndexedDB; UNIT/WAREHOUSE er særskilt domæneobjekt. | Afklar og implementér eventuel samlet autoritativ servergrænse. |
| FL-06 | Implementeret | Enhedsformularen har indvendige mål, energikilde og fire separate udstyrsvalg. | Ikke genkørt 15/9. | Lokal prototypelagring. | Flytning til autoritativ serverrepository, hvis produktionskravet omfatter persistens. |
| FL-07 | Implementeret | Indberetninger har stabil trepanelstruktur, resize, huskning, scroll og semantik. | Ikke genkørt 15/9. | Lokal repository. | Serverpersistens og samlet viewportregression. |
| FL-08 | Implementeret | Manuel sag har validering, lukning og inputbevaring ved lagringsfejl. | Ikke genkørt 15/9. | Lokal prototype. | Serverlagring og fælles dialogaudit under UX-07. |
| FL-09 | Implementeret | Arbejdskø bruger flytbar detaljedialog, genbrugt sagsmappe og mobil fuldskærm. | Ikke genkørt 15/9. | Lokal repository/route. | Serverpersistens og samlet viewportregression. |
| FL-10 | Implementeret | Sagsmappe uden fanebjælke, med kompakt enhedsrække, foldesektioner og infokolonne. | **15/9:** tilbage-navigation og direkte URL/reload verificeret; øvrigt layout ikke genkørt. | Autoritative statusser/fakturaafklaring bevares, men sagsdata er lokal prototype. | Servermutationer og samlet viewportregression. |
| FL-11 | Implementeret | Kompakt arbejdskø uden permanent Flyt sag; lovlige statusveje bevares. | **15/9:** køfiltre, valgt sag og scroll blev bevaret ved retur. | Lokal prototype. | Autoritativ sagsmutation. |
| FL-12 | Implementeret | Fælles leverandører/værksteder læses uden lokal stamdatakopi; opret-og-vælg vender sikkert tilbage. | Ikke genkørt 15/9. | Eksisterende tenantafgrænsede leverandørregister og permissions. | Integreret slutregression; ingen ekstern portaladgang. |
| FL-13 | Delvist | Servicekrav har dato/km/timer, varsler, faste hændelser og forklarlig næste grænse. | Ikke genkørt 15/9. | Krav gemmes på server; historisk service og planlægning mangler adapter. | Integreret browserbevis og adapter til gennemførsel/planlægning. |
| FL-14 | Delvist | Én forekomst pr. cyklus, idempotens, samtidighed, gennemførsel samt kontrolleret ændring/deaktivering findes. | Ikke genkørt 15/9. | Scheduler/callables/transaktioner er serverimplementeret; læseprojektion er skrivebeskyttet. | Autoriserede sagsmutationer og kontrolleret overgang af lokale poster. |
| FL-15 | Delvist | Én tenantafgrænset kategori-stamdata med mapping, sortering, deaktivering og snapshots. | Ikke genkørt 15/9. | Stamdata er serverstyret; forbrugende indberetnings-/økonomiposter er lokale. | Flyt forbrugende poster til autoritativ servergrænse. |
| FL-16 | Delvist | Statistik viser/filtrerer/eksporterer kun faktiske tilgængelige målinger og forklarer manglende forbindelse. | Ikke genkørt 15/9; normal integreret login-tjeneste var utilgængelig. | Ingen valideret OBD-kilde. | Autoritativ målekilde og integreret browserbevis. |
| FL-17 | Delvist | Økonomi adskiller status/kilder, materialiserer kontraktperioder, deduplikerer og bevarer kreditfortegn. | Ikke genkørt 15/9. | Lokal IndexedDB; ingen Fakturacenter-/bogføringsadapter. | Autoritativ adapter, servermutation/audit og fuld livscyklusdækning. |
| FL-18 | Delvist | Statistik- og økonomi-CSV har UTF-8 BOM, dansk decimal og sporbarhed. Økonomi har nu særskilt beløbsgrundlag, netto-, moms- og bruttokolonne uden at antage en momssats. | **15/9:** repræsentativ økonomi-CSV blev importeret til en Excel-kompatibel projektmappe og visuelt kontrolleret med 12 kolonner, `ØKO-Æ01`, `Brændstof`, `Værksted`, `Øvrige æøå` samt kendt/ukendt moms. | Filgenerering er lokal og kræver ikke serverlagring. | Manuel åbning i Microsoft Excel er ikke gennemført; produktionskilder skal levere eksplicit momsbeløb for fuldt udfyldte kolonner. |
| REG-01 | Delvist | Relevante Rules-/Functions-kontrakter har tenant-, rolle-, revision-, samtidigheds- og idempotensprøver. | Ikke relevant. | **15/9:** fuld demo-emulatorgate 4.625/4.625 grøn med proceslokal Java/TEMP-konfiguration. | Nye serverfunktioner skal have egne emulatorbeviser før endelig lukning. |
| REG-02 | Delvist | Eksisterende tværmodulkontrakter er bevaret i den fulde testgate. | Kun de ændrede FLEET-navigation-/Livekort-forløb er genkørt i browser 15/9. | Fuld gate er grøn på nuværende grundlag. | Endelig tværmodul- og browserregression efter resterende backendarbejde. |
| REG-03 | Delvist | Responsiv CSS og tidligere viewportpakker findes. | **15/9:** FLEET-navigation desktop samt Livekort-popup desktop og 390×844. | Ikke relevant. | Samlet 1440×900, 1920×1080, 390×844 og 360×800 på alle berørte skærme/menu-/zoomtilstande. |

## Aktuelle begrænsninger og manglende grundlag

- Den normale integrerede app kunne ikke logge ind lokalt: `Der er ikke
  forbindelse til login-tjenesten`. Autentificering eller backendgrænser blev
  ikke omgået.
- En normal fuld gate fejlede først under Java/Netty-emulatorens opstart
  (`failed to create a child event loop` / `Unable to establish loopback
  connection`). Det var adskilt fra sikkerhedstests. En ny proceslokal kørsel
  med repositoryets dokumenterede JDK og uden arvede `TEMP`/`TMP` nåede hele
  gaten og bestod 4.625/4.625.
- Et særskilt implementeringsinstruksdokument blev ikke fundet i repositoryet
  eller auditpakken. For at verificere designbeslutninger, som ikke står i
  krav-PDF'en eller denne løbende status, behøves den oprindelige instruktion,
  der ledsagede `14-9-2026. Veyro rettelser..docx`.
