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

⚠ **Ført ajour 24. august 2026 (beslutning 113).** De fleste af disse blev
faktisk besvaret allerede i **beslutning 22** — dette dokument var bare ikke
opdateret til at sige det. Se `BESLUTNINGER.md` og README's tabel "Fem
skærme der venter" for den fulde begrundelse bag hvert svar. Kun det der
reelt stadig mangler, står tilbage som spørgsmål herunder.

### Økonomi → Fakturering — retningen afgjort, to spørgsmål tilbage

~~Laver FleetControl fakturaen, eller producerer den et grundlag?~~
**Besvaret i beslutning 22: grundlag.** Ingen nummerserie, kreditnotaer eller
rykkere — FleetControl regner og låser linjerne, regnskabssystemet udsteder
selve fakturaen. Kæden er bygget (`grundlagskriv`), momssatsen er besvaret
(25 %, beslutning 98), og adapterlaget til en neutral model er bygget
(beslutning 102).

- **Til hvilket SYSTEMSPECIFIKT format?** e-conomic, Dinero, Billy, Navision
  har hver sit importskema, og der er bevidst ingen adapter til dem endnu —
  kun Neutral (JSON) og Regneark (CSV). Løses med kolonnenavne fra systemets
  egen importvejledning, eller en eksempelfil fra en konto.
- Hvem godkender grundlaget, og er det samme person der laver det?
  `grundlagSkriv`/`grundlagGodkend` findes som to adskilte permissions —
  men om fordelingen er rigtig for en faktisk kunde, er ikke bekræftet.

### Flåde → Indberetninger — retningen afgjort, ét spørgsmål tilbage

**Besvaret i beslutning 22/106:** To slags — **driftshændelser** (reparation,
skade, dæk, service, andet) starter et forløb; **udgiftsregistreringer**
(tankning, parkering, kvittering) gør ikke. En driftshændelse **lukkes ikke**
når den bliver et værkstedsbesøg — den er samme sag hele vejen til fakturaen.
En skade får modpart, reg.nr., forsikringsselskab, policenr. og ansvar som
felter på indberetningen selv, ikke som en sag med sit eget forløb.

- Er **skadeforløbet** sin egen tilstandsmaskine, eller følger det
  driftshændelsens almindelige forløb?

### Booking → Live-kort ("Rute & status") — retningen afgjort, to spørgsmål tilbage

**Besvaret i beslutning 22, bygget:** Skærmen hedder **Rute & status**, og
kræver **ingen GPS** — positionerne kommer fra chaufførens statusmeldinger
(planlagt rute, meldte stop, næste stop, forventede tidspunkter), ikke fra
sporing. Platformen kræver stadig ikke GPS.

- Hvor længe gemmes historikken? En rute gennem tre uger er
  medarbejderovervågning og skal kunne slettes.
- Må kunden se hvor hans gods er, eller kun jer? Det er kundeportalen, og den
  er en anden diskussion.

### Bemanding → Kompetencer — retningen afgjort, ét spørgsmål tilbage

**Besvaret i beslutning 22, bygget:** **Lovkritiske** (C, CE, D1, D, ADR,
tachograf) blokerer disponering **hårdt**. **Virksomheds- og kundekrav**
advarer med en override der kræver en begrundelse og logges. Chaufføren
uploader sin egen dokumentation, kontoret godkender. Varsler er
konfigurerbare, standard 90/30/14 dage.

- Et foto af et kompetencebevis hører i `sensitive/` (besluttet) — men det
  kræver en **Storage-bucket, som DEV ikke har endnu**. Teknisk hul, ikke et
  åbent spørgsmål.

### Indkøb → Leverandører — retningen afgjort, ingen spørgsmål tilbage til jer

**Besvaret i beslutning 22, delvist bygget:** **Ingen stjerner.** Objektive
tal: leverance til tiden, fakturaafvigelse, gennemsnitlig leveringstid,
prisændring 12 mdr., reklamationer, samlet køb — en score findes kun hvis
beregningen kan vises. Aftaler og prislister ligger på leverandøren, ét sted.

Det resterende er ingeniørarbejde, ikke et produktvalg: fire af de seks tal
kan beregnes nu, **svartid** kræver data fra `sager/` (regler bygget i
beslutning 112, selve mailmodtagelsen mangler stadig — skive 2), og **andel
af indkøb** kræver en rigtig aggregering af tenantens samlede indkøb.

### Opsætning → Generelt — fortsat åbent

- Hvad skal en vognmand kunne ændre selv, og hvad skal han ringe til jer om?
- Afdelinger, lokationer, standardlager: er de opsætning eller stamdata?
- CVR, adresse, logo på fakturaer, betalingsbetingelser — hører de her?

### Opsætning → Brugere & roller — ét af tre spørgsmål afgjort

~~Skal en kunde kunne ændre en rolles indhold, eller kun vælge blandt
presets?~~ **Besvaret i beslutning 31b: ja**, med to mekaniske spærringer —
`brugere.skriv` kan ikke fjernes fra den sidste rolle der har den, eller fra
ens egen. `rolleskriv` er vejen ind.

- Hvordan inviteres en ny bruger? Mail med link, eller opretter I den?
- Hvad sker der når en medarbejder holder op? Loginnet skal spærres, personen
  skal blive stående. Hvem gør det?

### Opsætning → Integrationer — besvaret og bygget

**Besvaret i beslutning 22, bygget:** Skærmen viser **kun det der findes** —
og der findes ingen integrationer endnu. Ingen opdigtet "kommer snart"-liste.
Intet spørgsmål tilbage.

### Opsætning → Idébank — bortfaldet

**Besvaret i beslutning 22, udført i beslutning 31:** Idébanken er **fjernet
fra kundens installation** — rute, skærm, permission og node. Den lever
videre som jeres egen `idebank.html`, uden for produktet. Spørgsmålet om
kundesynlighed er dermed bortfaldet, ikke besvaret.

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
det der afgør om platformen bliver brugt eller ligger død. ⚠ **Den ER
bygget, delvist** (beslutning 103, 106, 107, 108) — turplan, indberetning,
tidsregistrering og fraværsansøgning findes på `/app`. Det ubesvarede er
ikke LÆNGERE om den findes, men hvor meget mere den skal kunne, og hvornår
det skal prioriteres — se "De fem der bør besvares først".

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

1. ~~Fakturering: motor eller grundlag?~~ **Besvaret i beslutning 22:
  grundlag.** Tilbage: eksportformatet (e-conomic/Dinero/Billy/Navision) og
  hvem der godkender.
2. ~~Live-kort: hvor kommer positionerne fra?~~ **Besvaret i beslutning 22,
  bygget som "Rute & status":** ingen GPS, chaufførens statusmeldinger.
  Tilbage: retention på historikken, og om kunden må se det (kundeportal).
3. **Chaufførappen: hvad mangler, og hvornår prioriteres det?** Turplan,
  indberetning, tidsregistrering og fraværsansøgning findes allerede
  (beslutning 103, 106–108) — appen er ikke tom. Spørgsmålet er ikke længere
  OM den findes, men hvad næste skridt er, og hvornår.
4. **Retention pr. datatype.** Blokerer en juridisk gennemgang I skal have
  alligevel.
5. **Supportadgang: hvordan?** Det er svaret på det spørgsmål der koster mest at
  svare dårligt på.

De øvrige kan besvares når skærmen bygges.
