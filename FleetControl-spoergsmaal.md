# Spørgsmål der skal besvares

Til dig og Dennis. Ikke tekniske spørgsmål — de er afgjort. Det her er
produktvalg, og de fleste af dem kan I ikke uddelegere til nogen.

Del 1 afgør hvad de ni resterende skærme indeholder. Del 2 er hvad en vognmand
spørger om i en demo. Del 3 er hvad en større kunde spørger om, og de er dyre
at svare forkert på.

---

## Del 1 — De ni skærme uden mockup

For hver: **hvad er den ene ting en bruger kommer her for at gøre?** Kan I ikke
svare, hører skærmen måske ikke i fase 0.

### Økonomi → Fakturering

Den vigtigste af de ni, fordi det er der pengene kommer fra.

- **Laver FleetControl fakturaen, eller producerer den et grundlag?** Det ændrer
  skærmen fuldstændigt. En fakturamotor kræver fakturanummerserie, kreditnotaer,
  betalingsbetingelser, rykkere, momsindberetning. Et grundlag kræver en
  eksportfil.
- Hvis grundlag: til hvad? e-conomic, Dinero, Billy, Navision? De har hver sit
  format, og "CSV" er ikke ét format.
- Skal en faktura kunne rettes efter den er sendt? Svaret er nej — der skal
  laves en kreditnota. Men det betyder at fakturaen er immutabel, og det skal
  besluttes før den bygges.
- Hvem godkender en faktura før den går ud? Er det samme person der laver den?

### Flåde → Indberetninger

- Er skærmen **listen** over indkomne indberetninger, **opfølgningen** med
  kommunikationstråd, eller stedet hvor kontoret selv **opretter** en? Mockuppen
  "Indberetninger & opfølgning" viser opfølgningen — er den denne skærm, eller
  en fjerde?
- De syv typer (reparation, skade, dæk, service, tankning, parkering, andet):
  skal de alle med i version 1, eller er tankning og parkering noget
  brændstofkortet leverer automatisk senere?
- **En skade involverer en modpart.** Forsikringssag, policenummer,
  registreringsnummer på modparten. Er det en indberetning eller en sag med sit
  eget forløb?
- Hvad sker der når en indberetning bliver et værkstedsbesøg? Bliver den lukket,
  eller følger den med?

### Booking → Live-kort

- **Hvor kommer positionerne fra?** Der er ingen sporing. Chaufførappens telefon,
  et GPS-boks-abonnement, eller manuelle statusopdateringer fra chaufføren?
- Er live-kort noget alle kunder får, eller et tilvalg? Det er tidligere besluttet
  at platformen ikke skal *kræve* GPS — gælder det stadig?
- Hvor længe gemmes historikken? En rute gennem tre uger er medarbejderovervågning
  og skal kunne slettes.
- Må kunden se hvor hans gods er, eller kun jer? Det er kundeportalen, og den er
  en anden diskussion.

### Bemanding → Kompetencer

- Hvem vedligeholder dem? Chaufføren uploader sit eget kort, eller kontoret
  indtaster?
- Skal beviset gemmes som fil? Et foto af et ADR-kort er en personoplysning med
  billede — hører i `sensitive/`.
- **Hvem får besked når en kompetence udløber, og hvornår?** 90 dage, 30, 14?
  Chaufføren, disponenten, eller begge?
- Blokerer en udløbet kompetence disponering hårdt, eller kan disponenten
  overrule med en begrundelse? Vi har besluttet hårdt — men en vognmand med tre
  chauffører kan have en anden mening.

### Indkøb → Leverandører

- Er den et **kartotek** eller en **performancerapport**? Mockuppen har
  leverandørperformance som kort på to andre skærme.
- Skal aftaler og prislister ligge her, eller i Bookingopsætning hvor satserne er?
- Hvad er en leverandørs "kvalitet 4,7 stjerner"? Hvem giver den, og efter hvad?

### Opsætning → Generelt

- Hvad skal en vognmand kunne ændre selv, og hvad skal han ringe til jer om?
- Afdelinger, lokationer, standardlager: er de opsætning eller stamdata?
- CVR, adresse, logo på fakturaer, betalingsbetingelser — hører de her?

### Opsætning → Brugere & roller

- Skal en kunde kunne **ændre en rolles indhold**, eller kun vælge blandt
  presets? Vi har bygget `roller/` til at kunne det. Men en vognmand der fjerner
  `booking.godkend` fra sin egen rolle har lukket sig ud.
- Hvordan inviteres en ny bruger? Mail med link, eller opretter I den?
- Hvad sker der når en medarbejder holder op? Loginnet skal spærres, personen
  skal blive stående. Hvem gør det?

### Opsætning → Integrationer

- Er skærmen en **liste over hvad der kommer**, et sted at **indtaste nøgler**,
  eller en **statusside**? Der er ingen integrationer bygget.
- Ærligste version: en liste med "kommer senere" og et sted at skrive sig op.
  Det er bedre end en opdigtet konfigurationsside.

### Opsætning → Idébank

- Er den intern for jer, eller kan kunder se og stemme? En kunde der kan se sine
  egne ønsker på et vejkort er stærk binding — og en forpligtelse.
- Skal kilden på en idé (hvilken kunde) være synlig for andre kunder? Nej.

---

## Del 2 — Hvad en vognmand spørger om

Disse kommer i den første demo, og I skal have svar. Nogle af dem afgør
prioriteringen af de sidste ni skærme.

**"Kan jeg få mine data ud igen?"** Det første en fornuftig køber spørger om.
Svaret skal være ja, i et format han kan bruge, uden at skulle spørge jer.

**"Hvad koster det når jeg vokser?"** Prisen pr. bil, pr. bruger, eller fast?
En vognmand der går fra 8 til 14 biler skal kunne regne det ud selv.

**"Hvad hvis jeg vil stoppe?"** Opsigelsesfrist, dataeksport, hvor længe I
opbevarer bagefter.

**"Kan mine chauffører bruge det uden at være computerfolk?"** Chaufførappen er
det der afgør om platformen bliver brugt eller ligger død. Den er ikke bygget.

**"Virker det på min telefon?"** Skærmene er responsive, men de er designet til
en skærm. En disponent på farten er en anden brug.

**"Hvad hvis internettet er nede i lastbilen?"** Chaufføren i en tunnel eller på
en tysk motorvej uden dækning. Offline-kø i appen, eller mister han
indberetningen?

**"Kan jeg se hvad en tur kostede mig?"** Det er hele omkostningsmotoren, og det
er jeres stærkeste kort mod en simpel bookingapp.

**"Kan I flytte mine data fra det jeg har nu?"** Excel, en anden TMS, eller
papir. Et importværktøj er ikke bygget og er formentlig nødvendigt for kunde nr. 2.

**"Hvem andre bruger det?"** Det ærlige svar for kunde nr. 1 er "ingen endnu" —
og det er værd at have en pris der afspejler det.

---

## Del 3 — Hvad en større kunde spørger om

Dyrere at svare forkert på. I har mere af dette på plads end de fleste
leverandører på jeres størrelse — brug det.

**"Hvor ligger vores data?"** Belgien, europe-west1. Verificeret, ikke antaget.

**"Hvem hos jer kan se vores data?"** Det ærlige svar i dag er: I begge, fordi
der ikke er en supportadgangsmodel endnu. Det er besluttet at bygge den. Vær
ærlig om at den ikke er der.

**"Logger I hvem der har set hvad?"** Ja — men med forbeholdet: læsninger fra
applikationen, ikke alle læsninger. Sig det præcist.

**"Kan vi bruge vores eget login?"** SSO er ikke bygget. Arkitekturen kan bære
det. Sig hvad der kræves.

**"Har I en databehandleraftale?"** Ja. Er den læst igennem mod den arkitektur
der findes nu, med Firebase som underdatabehandler?

**"Hvad gør I hvis der er et brud?"** 72-timers underretningspligt. Hvem
opdager det, hvem ringer til kunden, hvem skriver til Datatilsynet? Det er en
side, ikke et system — men den skal findes før den skal bruges.

**"Hvor længe gemmer I vores data?"** Retention er ikke afgjort. 24 måneder er
et gæt. Bogføringsloven trækker mod 5 år for regnskabsgrundlag, GDPR mod
kortere for personoplysninger. Det bliver formentlig forskelligt pr. datatype.

**"Kan vi få en test-instans?"** DEV findes. Skal en kunde kunne få sin egen?

**"Hvad hvis I to bliver ramt af en bus?"** Det spørgsmål kommer, og det er
rimeligt. En escrow-aftale eller en dokumenteret overdragelsesplan er svaret.

---

## De fem der bør besvares først

Fordi de blokerer andet arbejde:

1. **Fakturering: motor eller grundlag?** Blokerer fase 2 og en af de ni skærme.
2. **Live-kort: hvor kommer positionerne fra?** Blokerer skærmen og
  chaufførappen.
3. **Chaufførappen: hvornår?** Den afgør om platformen bruges eller kun ses.
4. **Retention pr. datatype.** Blokerer en juridisk gennemgang I skal have
  alligevel.
5. **Supportadgang: hvordan?** Det er svaret på det spørgsmål der koster mest at
  svare dårligt på.

De øvrige kan besvares når skærmen bygges.
