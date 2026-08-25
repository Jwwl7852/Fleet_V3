# 11 — ISO 27001 Technical Readiness

**Ingen falsk "ISO compliance score" gives.** Dette dokument grupperer efter
security-management-domæner og siger for hvert: hvad FleetControl teknisk
understøtter, hvilket evidens der findes, tekniske gaps og organisatoriske
gaps. Policies, risikoregister, Statement of Applicability, intern audit,
ledelsens gennemgang og medarbejderprocesser klassificeres
**ORGANIZATIONAL/EXTERNAL**, medmindre repoet faktisk indeholder dem — det
gør det ikke, og det er ikke undersøgt som om det gjorde.

## Adgangskontrol (A.5, A.8 i ISO 27001:2022-strukturen)

**Teknisk understøttet**: rollebaseret adgang håndhævet server-side i
RTDB-regler OG Cloud Functions (dobbelt håndhævelse, doc 01-03).
Selvlåsnings-invarianter forhindrer at sidste admin-rettighed fjernes.
Platform-ejer-adgang kan kun tildeles via et out-of-band script der kræver
en service-account-nøgle uden for applikationen. Offboarding
(`spaerlogin`) er en reel Firebase Auth-kontodeaktivering, ikke kun et
app-flag.

**Tekniske gaps**: ingen MFA, ingen SSO/federation, intet tvunget
token-genopfriskningstjek efter en tilbagekaldelse (stale-claim-vindue).
Ingen App Check — ethvert gyldigt brugertoken kan kalde enhver funktion,
uanset klient-app.

**Organisatoriske gaps**: ingen dokumenteret adgangsgennemgangsproces
(periodisk revurdering af hvem der har hvilken rolle), ingen formel
break-glass-procedure, ingen dokumenteret provisioneringsproces ud over
selve koden der udfører den.

## Asset-/datahåndtering (A.5.9-A.5.14)

**Teknisk understøttet**: en reel, konsekvent `sensitive/`-klassifikation
for personoplysninger og driftskritisk data (doc 04), tenant-isolation som
en arkitektonisk invariant snarere end en efterhåndstilføjet kontrol
(doc 02).

**Tekniske gaps**: `securityLevel`-feltet er skema-defineret på 5 noder men
reelt ubrugt (kun skrevet på 1, læst af 0) — et halvvejs implementeret
klassifikationssystem er værre for en ISO-vurdering end intet system, fordi
det ser ud som dækning uden at være det.

**Organisatoriske gaps**: intet dataklassifikationsskema dokumenteret uden
for koden selv; intet aktivregister i traditionel ISO-forstand (hvilke
systemer/tredjeparter behandler hvilke data).

## Sikker udvikling/ændringsstyring (A.8.25-A.8.32)

**Teknisk understøttet**: en aktiv pre-commit-hook der håndhæver lint,
design-tokens og regel-emulatortests betinget af hvad der er rørt; 3269
tests i den fulde suite, kørt og bekræftet grønne flere gange i denne
sessions eget arbejde; genuint adskilte DEV/PROD Firebase-projekter med en
mekanisk (ikke manuel) miljødetektion og en synlig advarsel ved
fejlkonfiguration.

**Tekniske gaps**: ingen CI/CD — al deploy er manuel fra en udviklers egen
maskine; pre-commit-hooken dækker ikke den fulde testsuite, kun betingede
udsnit; ingen automatiseret afhængighedssårbarhedsscanning (Dependabot
e.l.); 20 kendte, uafhjulpne afhængighedssårbarheder (12 rod + 8
funktioner) fra en enkelt `npm audit`-kørsel denne session.

**Organisatoriske gaps**: ingen dokumenteret branch-/code-review-proces
kunne verificeres fra repoet (single-udvikler-mønsteret observeret i denne
sessions egen commit-historik gør det svært at afgøre om en reel
review-proces eksisterer uden for dette repo); ingen formel
change-advisory-proces.

## Logning/monitorering (A.8.15-A.8.16)

**Teknisk understøttet**: append-only, manipulationsresistent auditlog for
alle server-håndhævede mutationer, med en streng fritekst-udelukkende
allowlist. Retention-mekanismen er sikkerhedsgated (sletter intet før et
eksplicit juridisk flag er sat).

**Tekniske gaps**: den mest alvorlige enkeltstående ISO-relevante gap i
hele auditten — følsomme LÆSNINGER logges klientside, ikke serverhåndhævet
(doc 05, fund 3). Ingen alarmering når et menneske for fejl, afviste
forsøg eller uregelmæssigheder — kun rå logs. Ingen søgbar/eksporterbar
audit-konsol.

**Organisatoriske gaps**: ingen dokumenteret log-gennemgangsproces, ingen
SIEM eller central logopsamling ud over GCPs standardværktøj.

## Backup/kontinuitet (A.8.13-A.8.14)

**Teknisk understøttet**: intet fundet der understøtter dette domæne
positivt — se doc 06.

**Tekniske gaps**: ingen backup-mekanisme verificerbar fra repoet (RTDB
har i forvejen svagere indbygget backup-værktøj end Firestore); ingen
gendannelsesprocedure; ingen testet gendannelse; intet defineret RPO/RTO.
Dette er samlet set det svageste domæne i hele auditten.

**Organisatoriske gaps**: ingen kontinuitetsplan, ingen katastrofe-runbook,
ingen definerede genopretningsmål at planlægge imod.

## Leverandør-/cloud-risiko (A.5.19-A.5.23)

**Teknisk understøttet**: en klar, dokumenteret afhængighed af Google
Cloud/Firebase og Netlify, med genuint adskilte miljøer.

**Tekniske gaps**: Cloud Functions kører under GCPs standard
compute-servicekonto frem for en dedikeret mindste-privilegium-konto pr.
funktion (faktisk IAM-scope er UNKNOWN fra repoet).

**Organisatoriske gaps**: ingen dokumenteret leverandørrisikovurdering af
Firebase/GCP/Netlify som databehandlere kunne findes i repoet — dette er
forventeligt at ligge uden for et kode-repo og skal findes andetsteds i
organisationen, ikke fraværende bare fordi det ikke er her.

## Hændelseshåndtering (A.5.24-A.5.28)

**Teknisk understøttet**: `retentionLegalHold` giver en mekanisme til at
fastholde data under undersøgelse. Auditloggen giver et vist
efterforskningsgrundlag for de handlinger den faktisk dækker.

**Tekniske gaps**: ingen alarmering betyder en hændelse i praksis først
opdages når nogen aktivt leder efter den, ikke når den sker.

**Organisatoriske gaps**: ingen dokumenteret hændelsesresponsplan, ingen
definerede roller for hændelseshåndtering, intet observeret
øvelses-/testregime.

## Sårbarhedsstyring (A.8.8)

**Teknisk understøttet**: `npm audit` kan køres og GIVER meningsfulde
resultater (afprøvet denne session) — værktøjet til at opdage sårbarheder
findes og virker, selvom det ikke er automatiseret.

**Tekniske gaps**: 20 kendte sårbarheder er uafhjulpne i dag; ingen
automatiseret scanning; ingen App Check.

**Organisatoriske gaps**: ingen dokumenteret patch-cadence eller
SLA for sårbarhedsrettelse.

## Dataretention/-sletning (A.8.10)

Se doc 06 og 10 for den fulde behandling. Mekanismen findes og er sikker
by default (sletter intet uden et eksplicit juridisk flag); INGEN periode
er afgjort; anonymisering er en kastende stub.

## Kryptografi/databeskyttelse (A.8.24)

**Teknisk understøttet**: al trafik til Firebase/Netlify går over HTTPS
(platformstandard, ikke en app-specifik konfiguration der kan slås fra).
Adgangskoder håndteres af Firebase Auth, ikke af applikationskoden selv.

**Tekniske gaps**: ingen applikationsniveau feltkryptering af følsomme data
i RTDB (data er beskyttet af adgangskontrol, ikke af kryptering-i-ro ud
over hvad Firebase selv leverer som platformstandard — hvilket ikke er
undersøgt yderligere i denne audit, da det er en Google-infrastrukturgaranti
uden for repoets synsfelt, klassificeret **UNKNOWN** her).

## Sammenfatning

Det mønster der går igen på tværs af næsten alle domæner: **adgangskontrol
og skrivesporbarhed er markant stærkere end kontinuitet og alarmering.**
Et ISO 27001-forberedelsesarbejde bør prioritere backup/DR (domænet uden
NOGEN positiv teknisk understøttelse fundet) og alarmering (logning findes,
ingen når et menneske) højere end yderligere adgangskontrol-finpudsning,
som allerede er solidt fundament.
