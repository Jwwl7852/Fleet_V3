# 10 — RA Technical Readiness

**Dette er UDELUKKENDE teknisk readiness.** FleetControl erklæres IKKE
RA-godkendt, og ingen kunde bliver RA-godkendt ved at bruge platformen.
Juridiske/operative RA-krav der ikke kan fastslås fra FleetControl-koden er
markeret **EXTERNAL/LEGAL** nedenfor — de er ikke gættet eller opfundet.

Formålet er at kortlægge om platformen TEKNISK kan understøtte den slags høj
sporbarhed en RA-lignende ordning typisk kræver om sikkerhedskritiske
transportprocesser — ikke at afgøre om den konkrete regulatoriske ordning er
opfyldt, hvilket er et retligt spørgsmål uden for dette repos synsfelt.

## Metode

Hvert underpunkt klassificeres som enten:
- **FOUNDATION EXISTS** — en teknisk kapabilitet der reelt understøtter
  kravet findes og er verificeret i de foregående dokumenter (01-07).
- **FUTURE RA-SPECIFIC PRODUCT REQUIREMENT** — noget der ville skulle
  bygges specifikt til en RA-arbejdsgang, ikke noget der findes i dag.
- **EXTERNAL/LEGAL** — et retligt/organisatorisk spørgsmål der ikke kan
  afgøres fra koden.

## 1. Identificeret bruger

**FOUNDATION EXISTS.** Enhver handling i systemet er bundet til en
autentificeret Firebase Auth-bruger (`auth.uid`) — se doc 03. `uid`
(hvem GJORDE noget) er konsekvent adskilt fra `personId` (hvad det HANDLER
om) i hele domænemodellen, en skelnen CLAUDE.md eksplicit håndhæver og som
denne audit ikke fandt undtagelser fra. Ingen anonym skrivevej findes — alle
44 `onCall`-funktioner kræver `auth`.

## 2. Rolle / adskillelse af ansvar

**FOUNDATION EXISTS, delvist.** Rollemodellen (doc 03) understøtter en reel
adskillelse: `sag.skriv` ≠ `sag.karantaeneFrigiv` ≠ `sag.aftaleBekraeft` er
tre distinkte permissions for tre distinkte handlinger (verificeret denne
session ved netop denne sondrings fravær at være en reel bug — se Skive
3C's rettelse). `fakturastatus` har en indbygget godkender-udpegnings-
mekanisme (`godkenderUid`) der, når slået til, kræver at en ANDEN end den
der registrerede købet godkender det.
**FUTURE RA-SPECIFIC PRODUCT REQUIREMENT**: en egentlig
firøjne-/to-mands-regel på tværs af FLERE handlingstyper (ikke kun faktura)
findes ikke som en generel mekanisme — det er en per-funktion-beslutning i
dag, ikke en platformpolitik.

## 3. Tidsstemplede hændelser

**FOUNDATION EXISTS.** Hver auditpost bærer `ms` sat SERVER-SIDE
(`Date.now()` inde i Cloud Function-kroppen, ikke fra klientens payload) —
se doc 05. Reservationers `udleveretMs`/`returneretMs` og lignende
tilstandsfelter er ligeledes serversat, ikke klientleveret, per den
gennemgående "server sætter tidspunktet ved selve tilstandsskiftet"-regel
CLAUDE.md håndhæver.

## 4. Manipulationsresistent historik

**FOUNDATION EXISTS for skrivninger, IKKE for læsninger.** Se doc 05:
`audit/` er append-only og bevist fri for redigering af eksisterende poster
(kun `.push()` fundet, aldrig `.set()`/`.update()` på en eksisterende
nøgle). Dette gælder KUN de handlinger der rent faktisk producerer en
auditpost — og for følsomme LÆSNINGER er selve logningen klientudløst, ikke
serverhåndhævet (doc 05, fund 3). En RA-lignende ordning der kræver bevis
for "hvem har set dette," ikke kun "hvem har ændret dette," møder her et
reelt, dokumenteret hul.

## 5. Chain-of-custody-lignende hændelsesforløb

**FOUNDATION EXISTS, delvist.** Sagsmodellen (Skive 3C) bygger allerede et
kronologisk, typet hændelsesforløb pr. sag (oprettelse → besked →
afslutning, hver med aktør og tidspunkt). Reservationers tilstandsmaskiner
(`kanSkifteEtape`, `OPGAVE_OVERGANGE` m.fl.) håndhæver en defineret
overgangsrækkefølge server-side, ikke kun i UI'et.
**FUTURE RA-SPECIFIC PRODUCT REQUIREMENT**: et samlet, tværgående
"forløb for denne forsendelse/dette gods fra A til Z"-visning på tværs af
flere sager/opgaver/reservationer findes ikke — hver sag/opgave er i dag
sit eget isolerede forløb, ikke sammenkædet til en større
kæde-af-varetægt-fortælling.

## 6. Dokumentation af hvem gjorde hvad hvornår

**FOUNDATION EXISTS for server-håndhævede mutationer (doc 05, tabel A).
IKKE for læsninger (samme hul som punkt 4).** Gentages her fordi det er
kernen i selve RA-spørgsmålet: teknikken kan svare præcist på "hvem
ÆNDREDE hvad hvornår," men ikke pålideligt på "hvem SÅ hvad hvornår" uden
at lede følsomme læsninger gennem en callable-funktion i stedet for direkte
RTDB-læsninger — en arkitekturændring, ikke en detaljerettelse.

## 7. Beskyttet adgang til sikkerhedsfølsomme oplysninger

**FOUNDATION EXISTS.** `sensitive/`-nodefamilien (doc 04) er konsekvent
tenant- og permission-scopet, adskilt fra basisdata, og verificeret fri for
parent-kaskaderisiko. GDPR art. 9-helbredsoplysning er bevidst
arkitektonisk udelukket fra selvbetjening. Dette er et af de stærkeste
punkter i hele auditten.

## 8. Evidence/eksport

**FUTURE RA-SPECIFIC PRODUCT REQUIREMENT.** Se doc 05: den eneste
audit-læsende skærm i produktet er en per-sag, to-måneders aktivitetsfane —
ingen søgbar, eksporterbar, tværgående audit-konsol findes. En RA-lignende
ordnings krav om at "kunne fremlægge bevis for et forløb på forlangende" er
i dag afhængig af en manuel RTDB-udtrækning af en person med `audit.laes`
og teknisk adgang, ikke en produktfunktion en revisor selv kan betjene.

## 9. Retention

**FOUNDATION EXISTS som mekanisme, EXTERNAL/LEGAL som periode.** Se doc 06.
Retentionrammen er ikke-destruktiv og korrekt gated, men INGEN periode er
juridisk afgjort for nogen kategori. En RA-ordnings konkrete
opbevaringskrav (som kan afvige fra både bogføringslovens 5 år og GDPRs
"så kort som muligt") er ikke undersøgt og skal fastlægges juridisk, ikke
udledes af den nuværende 24-måneders placeholder.

## 10. Eventuelle dokumenter senere

**NOT BUILT / FUTURE.** Se `09_FILE_STORAGE_SECURITY_GATE.md` — ingen
fillagring findes. Hvis en RA-ordning kræver vedhæftede beviser
(fotodokumentation, certifikater, forseglingsnumre), er hele dette
kapitel uopfyldt indtil dokumentlager bygges efter den baseline doc 09
opstiller.

## Sammenfatning

| Punkt | Status |
|---|---|
| 1. Identificeret bruger | FOUNDATION EXISTS |
| 2. Rolle/ansvarsadskillelse | FOUNDATION EXISTS (delvist — kun faktura har firøjne i dag) |
| 3. Tidsstemplede hændelser | FOUNDATION EXISTS |
| 4. Manipulationsresistent historik | FOUNDATION EXISTS (skrivning) / **hul** (læsning) |
| 5. Chain-of-custody-forløb | FOUNDATION EXISTS (delvist — pr. sag, ikke tværgående) |
| 6. Hvem gjorde hvad hvornår | FOUNDATION EXISTS (skrivning) / **hul** (læsning) |
| 7. Beskyttet adgang til følsomme data | FOUNDATION EXISTS (stærkt) |
| 8. Evidence/eksport | FUTURE RA-SPECIFIC REQUIREMENT |
| 9. Retention | FOUNDATION EXISTS (mekanisme) / EXTERNAL-LEGAL (periode) |
| 10. Dokumenter | NOT BUILT / FUTURE |

**Den tekniske konklusion**: fundamentet for høj sporbarhed er reelt og
solidt for MUTATIONER (hvem ændrede hvad hvornår), men har ét gennemgående,
dokumenteret hul — LÆSESPORING af følsomme data er klientrapporteret, ikke
serverhåndhævet. Dette hul går igen fra doc 05 til doc 10 til doc 11, fordi
det er det samme tekniske forhold set fra tre vinkler, ikke tre separate
problemer.
