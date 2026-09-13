# Veyro fælles design- og betjeningsstandard V1

Dato: 13. september 2026

Ejer: integrationssporet
Gælder: kundeshellen og Ejerkonsollens særskilte ramme

## Formål og grænse

Standarden samler visningsadfærd. Den giver aldrig adgang og gemmer ingen
forretningsdata. Login, claims v2, tenant-/ejergrænser, permissions, Database
Rules, Storage Rules og serverfunktionernes kontroller er fortsat autoritative.
Ejerkonsollen beholder sin tenantløse `udbyder`-grænse og egen EjerRamme.

Den fælles visning bruger Veyro-logoet, Inter og tokens i
`src/fleet/fleet.css`. Moduler må have scoped geometri, men må ikke etablere
en ny global farve-, typografi- eller shellkilde.

## Regler

### Klikbare rækker

- En række med én tydelig hovedhandling er klikbar i hele sin flade og har
  rolig hover- og fokusmarkering samt håndmarkør.
- Native `button`/`a` foretrækkes. Fælles `Tabel` bruger ellers `role=button`,
  `tabIndex=0`, Enter og mellemrum.
- Et indre link, en knap, checkbox, menu eller formularstyring udfører kun sin
  egen handling. Den må ikke boble videre til rækkens åbnehandling.
- En ekstra tekstknap »Åbn« er kun nødvendig, når hovedhandlingen ikke kan
  forstås af rækkeindhold og kontekst.

### Dialoger, gem og slet

- Den fælles `Dialog` lukker med Escape, X, Annuller og sikkert klik på
  baggrunden. Fokus fastholdes i øverste aktive lag og returneres til åbneren.
- En åben intern menu/dropdown bruger første Escape; samme tast må ikke lukke
  både menu og dialog.
- `ugemte` aktiverer kassér-beskyttelse. Navigation væk fra en særlig editor
  skal bruge samme princip.
- Eksplicit Gem af forretningsdata og enhver tilladt Slet kræver bekræftelse.
  Automatisk lagring af menu, zoom, panelbredder, filtre og andre rene
  visningsvalg gør ikke.
- Dialogen lukkes først efter vellykket lagring. Ved fejl bevares input.
- Domæner, der kun tillader arkivering/deaktivering, må ikke få hard delete.

### Paneler

- Arbejdsflader med flere samtidige arbejdsområder får synligt vandret
  trækhåndtag, minimumsbredder, col-resize-markør og tastaturjustering.
- Venstre/højre pil justerer to procentpoint; Home og dobbeltklik gendanner
  standard. Panelerne ruller lodret uafhængigt.
- På højst 900 px stables panelerne, og trækhåndtaget skjules. Indhold må ikke
  forsvinde.

### Normal/Kompakt navigation

- Én pileknap midt på sidebarens højre kant skifter mellem Normal og Kompakt.
- Kompakt viser modul-/gruppeikoner. Hover og fokus viser en flyout med navn
  og kun de allerede tilladte punkter. Flyout kan nås uden at lukke undervejs.
- Aktivt modul og aktiv side bevarer markering. På touch/mobil anvendes den
  eksisterende mobilnavigation; der indføres ikke en konkurrerende foldknap.

### Arbejdsområdezoom

- Shift+musehjul over arbejdsområdet ændrer arbejdsområdet i trin på 5 %
  mellem 75 og 130 %. Ctrl/Cmd overtages aldrig.
- Minus, plus, procent og »Nulstil visning« er tastaturbetjente. Sidebar og
  topbjælke zoomes ikke.
- Almindeligt musehjul ruller som før. Browserens egen zoom og øvrige
  tilgængelighedsfunktioner bevares.
- Dialoger, dropdowns, PDF-områder og responsive skift skal kontrolleres ved
  ændret zoom; zoom er ikke en erstatning for responsive layouts.

### Husk seneste valg

- Nøglen er `veyro:visning:v1:<miljø>:<bruger>:<tenant|ejer>:<skærm>:<valg>`.
- Menu huskes på tværs af moduler inden for samme sikkerhedskontekst. Zoom og
  panelbredder huskes pr. skærm.
- Ved logout, bruger- eller tenantskift genindlæses den nye nøgle; gammel
  indlæst præference fortsætter ikke i React-tilstanden.
- »Nulstil visning« gendanner Normal menu, 100 % zoom og skærmens dokumenterede
  panelstandard. Den rører ikke browserdata eller forretningsdata.

### Support-AI

- `veyro.support.v1.1` og ejerens permanente adapter bevares. Legacy
  `supportEjerSvarSend` bruges ikke af brugerfladen.
- Intern AI, baggrund, interne noter og kilder må ikke transporteres til
  kunden. Revisionsbinding og stabile anmodnings-ID'er bevares.
- På de aftalte mobile Support-visninger har AI-historikken mindst 240 px
  reel læseplads med skærmtastaturet lukket. Komposeren ligger uden for den
  scrollende historik. Fysisk skærmtastatur er en manuel resttest.

## Statusmatrix på slutkodegrundlaget

Status: **Ja** = implementeret i fælles eller eksisterende godkendt komponent,
**Delvis** = relevante nye flader dækket, ældre specialflader kræver fortsat
skærmvis kontrol, **N/A** = ikke en flade med behovet.

| Modul/skærm | Tema/shell | Rækker | Dialog/ugemt | Paneler | Menu/zoom/prefs | Bemærkning |
|---|---:|---:|---:|---:|---:|---|
| FLEET `/fleet-v2/*` | Ja | Delvis | Ja | Delvis | Ja | Scoped CSS og IndexedDB-grænse bevares. Specialtabeller gennemgås ved næste FLEET-leverance. |
| FACILITY `/facility-v2/*` | Ja | Delvis | Ja | Delvis | Ja | Standalone-router/build bevares. Specialflader har egne responsive panelmønstre. |
| PLANNING `/planning-v2/*` | Ja | Delvis | Delvis | Delvis | Ja | Drag/drop og tastaturalternativer bevares; lokale visningsvalg blandes ikke med BroadcastChannel-data. |
| Fakturacenter `/oekonomi/fakturacenter` | Ja | Ja | Ja | Ja | Ja | Eksisterende tastaturseparatorer, panelreset og lokal PDF-zoom bevares. |
| PROCURE `/indkoeb/*` | Ja | Ja | Delvis | Delvis | Ja | Ordre-/godkendelsesflow og PDF bevares; enkelte specialdialoger bruger modulets egen bekræftelse. |
| Kundesupport `/support` | Ja | Ja | N/A | Ja | Ja | Samtale/sagsinfo har fælles justerbart, tenantafgrænset panelvalg. |
| Ejer-Support `/main/support` | Ja, EjerRamme | Ja | Ja | Delvis | Ja, ejerafgrænset | Mobil-AI har 240 px minimum; revisionskonflikt bevarer kladde. |
| Ejer mail/CRM/tilbud/økonomi/rapporter/indstillinger | Ja, EjerRamme | Ja | Delvis | Delvis | Ja, ejerafgrænset | Godkendte V8-flader bevares; specialeditorer kontrolleres enkeltvis. |
| UNIT/WAREHOUSE/WORKFORCE, eksisterende integrerede flader | Ja | Delvis | Ja | Delvis | Ja | Fælles shellændringer gælder; sideløbende redesign overtages ikke. WAREHOUSE-navnet bevares. |

## Implementationskilder

- `src/fleet/visningsvalg.js`: rene nøgler og grænser.
- `src/fleet/useVisningsvalg.js`: reaktiv genindlæsning ved kontekstskift.
- `src/fleet/JusterbarePaneler.jsx`: pointer- og tastaturbetjent paneldeling.
- `src/fleet/AppShell.jsx`: kundemenu, zoom og nulstilling.
- `src/moduler/udbyder/EjerRamme.jsx`: samme betjening inden for ejergrænsen.
- `src/fleet/ui.jsx`: fælles klikbar tabel og dialog.
- `src/fleet/fleet.css`: eneste fælles token- og tværgående CSS-kilde.

## Kendte restpunkter

- Status **Delvis** er ikke en påstand om universel skærmkomplethed. En ny
  modulleverance skal bruge de fælles primitiver, når den ændrer en berørt
  specialflade, og aflevere en konkret browserkontrol til integrationen.
- Fysisk mobilt skærmtastatur, OS-specifik PDF-visning og touch-flyout kræver
  en manuel enhedstest før pilot.
- Visningsvalg er lokale. De synkroniseres ikke mellem browsere i Milepæl A.
