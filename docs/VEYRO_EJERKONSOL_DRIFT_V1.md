# Veyro ejerkonsol — drift og aktivering v1

Opdateret: 2026-09-10

Dette er en forberedende driftsvejledning. Den er ikke en godkendelse til
deployment, migration, ekstern afsendelse eller behandling af produktionsdata.
Alle kommandoer med et projektnavn skal først have det konkrete miljø godkendt.

## 1. Autoritativ leverance

- Repository: `https://github.com/Jwwl7852/Fleet_V3.git`
- Udviklingsspor: `codex/ejer-integrated-development`
- Worktree: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`
- Fælles produktbase: `989dbb87db639efed0ba1b5a1e271560f7659a0c`
- Hosting: Firebase Hosting fra `dist`; Netlify-filen er ikke ejerkonsollens
  autoritative driftsvej.

Kontrollér altid `git status --short`, fuldt `git rev-parse HEAD`, remote og
worktree-listen før en handling. Deploy kun et reviewet, navngivet commit fra
det isolerede spor; deploy aldrig fra en mappe med lokale ændringer.

## 2. Sikker præflight

1. Bekræft at målprojektet er et ikke-produktionsmiljø, og at Firebase Auth,
   RTDB, Storage, Functions og Hosting hører til samme projekt.
2. Kør `npm ci` og `npm --prefix functions ci` uden brede opgraderinger.
3. Kør `npm run delt:kopier`, og kontrollér at de delte browser-/serverfiler er
   byteidentiske.
4. Kør måltests, samlet test/rules-suite, målrettet lint og `npm run build`.
5. Bekræft AK-01–AK-04 med tenantløs ejer, tenantadmin, anden tenant og et
   tilbagekaldt, tidligere udstedt token.
6. Brug syntetiske data i emulatorer eller en særskilt testorganisation. Brug
   aldrig demo-mode som erstatning for login eller adgangskontrol.

På denne Windows-maskine er den dokumenterede reproducerbare regeltestvej den
isolerede Temurin JDK 11 og Firebase CLI 13.35.1. Den ændrer ikke systemets
Java-installation. CLI 15.29.0 med JDK 21 rammer aktuelt en AF_UNIX-fejl.

## 3. Additiv migration v1

Værktøjet `scripts/ejer-migration-v1.mjs` læser eksisterende data og planlægger
kun manglende stabile forretningsnøgler på ældre fakturagrundlag og fakturajobs.
Dry-run er standard. Det ændrer ikke tilbud, aftaler, prislister, linjer, moms
eller historiske beløb.

Isoleret prøve:

```powershell
npm run ejer:migration:v1 -- --input test/fixtures/ejer-migration-v1.json
```

Autoriseret miljø, stadig kun dry-run:

```powershell
npm run ejer:migration:v1 -- --project <testprojekt> --database-url <test-rtdb-url> --report <ny-rapportsti>
```

En senere anvendelse kræver både `--apply` og
`--confirm-project <samme-testprojekt>`. Rapportfilen oprettes med
"create-new" og må ikke overskrive en tidligere rapport. En eneste afvigende
eksisterende nøgle stopper den atomiske anvendelse uden delvise skrivninger.

Recovery udføres ikke automatisk. Rapporten angiver hver tilføjet sti, værdi og
handlingen `fjern_hvis_uaendret`. Tilbagefør kun en tilføjet nøgle, hvis den
aktuelle værdi fortsat er præcis rapportens værdi, ingen faktura-/kreditjob har
brugt nøglen, og en ny dry-run samt dataeksport foreligger. Ellers bevares
nøglen, og afvigelsen afstemmes manuelt. Produktionsmigration er ikke kørt.

## 4. Kontrolleret deployrækkefølge

Den senere, autoriserede rækkefølge er:

1. Eksportér RTDB/Storage-metadata og gem migrations-dry-run.
2. Deploy Database- og Storage-regler, mens eksisterende tenant-login og de
   fire modulindgange smoke-testes.
3. Deploy Functions fra samme commit. Kontroller logs, schedulerjobs og at
   frakoblede integrationer fortsat svarer `ikke_tilsluttet`.
4. Deploy den byggede Hosting-artefakt fra samme commit.
5. Kør migrations-dry-run igen. Anvend kun en særskilt godkendt migration.
6. Aktivér én ekstern adapter ad gangen og gennemfør dens syntetiske testflow.

Ved fejl: deaktivér den berørte integration først, bevar outbox/jobdata og
eksterne referencer, rul kode/regler tilbage til seneste kendte commit, og
genoptag kun jobs efter afstemning. Slet eller genopret aldrig et job blindt,
når den eksterne sideeffekt kan være lykkedes.

## 5. Eksterne aktiveringsporte

### Microsoft 365

- Slå `info@veyrosystems.com` op i Exchange/Entra og dokumentér, om adressen er
  delt postkasse, selvstændig postkasse eller alias samt det underliggende
  mailbox-id.
- Opret/genbrug Entra-applikationen med mindst mulige Mail-rettigheder,
  mailbox-afgrænsning og Send As-retten for Dennis/Jørn. Gem kun
  `M365_CLIENT_SECRET` i Functions Secret Manager; ikke i RTDB/browser.
- Registrér ikke-hemmelige tenant-/client-/mailbox-id'er i ejerens
  integrationskonfiguration, men hold status `ikke_tilsluttet`, indtil Inbox og
  Sent Items delta, vedhæftninger, kladde/send og ukendt udfald er testet.
- Verificér med syntetisk mail, at Outlook-svar findes i samme tråd, at Graph
  202 ikke kaldes dokumenteret sendt, og at en ny mail invaliderer en allerede
  godkendt opfølgning. Ingen virkelig kundemail sendes i opsætningsprøven.

### OpenAI

- Vælg og godkend model, databehandlingsramme samt månedlige request-, input-
  og outputgrænser. Gem `OPENAI_API_KEY` som Functions-secret.
- Aktivér først efter syntetisk sagstest af `store: false`, struktureret output,
  sagsspecifik kontekst, prompt-injection-grænsen og budgetstop.
- Bekræft at mail og CRM fortsætter ved API-fejl eller opbrugt budget. Overfør
  ikke virkelig mailtekst uden særskilt autoriseret aktivering.

### Dinero

- Fremskaf personlig integration client-id/-secret, organisations-id,
  organisationsspecifik API-nøgle, salgskonto og en separat testorganisation.
  `DINERO_CLIENT_SECRET` og `DINERO_API_KEY` er Functions-secrets.
- Verificér opret/bogfør/mailout, ukendt timeout, pagination, betalinger og
  kreditering i testorganisationen. En accepteret adapteranmodning er ikke i
  sig selv dokumentation for bogføring eller afsendelse.
- Købs-/bilagsendpoint, payload, vedhæftning og kontomapping skal
  kontraktverificeres før H-job kan overføres. Indtil da er status
  `ikke_tilsluttet`.

### Bilag, OCR og websiteformular

- Vælg invoice-mailmappe eller inbound-provider, webhooksignatur,
  replay-vindue, retention og malware-scanning. Vælg OCR-leverandør med
  databehandlergrundlag og isoleret kontrakttest.
- `WEBFORM_HMAC_SECRET` er et serversecret. Test honeypot, leverings-id,
  korrelations-dedupe og gentagne leverancer før endpointet offentliggøres.
- Originalfiler forbliver private og tvungen download/no-store. OCR er et
  forslag; menneskelig godkendelse er fortsat obligatorisk.

## 6. Smoke-test og observation

Efter hver senere aktivering kontrolleres mindst:

- tenantløs ejerlogin, tilbagekaldelse og tenantafvisning;
- salgsmulighed → rateblad → tilbud v1/v2 → PDF → accept → aftale → invitation;
- månedligt grundlag, samtidige frigivelser, outboxstatus, kredit og betaling;
- bilagsupload, hash/dublet, metadata, godkendelse, omkostningsmatch og KPI;
- maildublet, Sent Items-svar, AI-fejl/budgetstop og obligatorisk opfølgning;
- reload/genstart: vedvarende data og jobs genoptages uden dublet.

Overvåg Functions-fejl, schedulerens seneste forsøg/succes, outboxposter med
`ukendt_udfald`, integrationscheckpoints, AI-budgetreservationer og Storage-
fejl. Secrets må aldrig fremgå af audit, fejlbeskeder eller browserpayloads.

## 7. Aktuel aktiveringsbeslutning

| Område | Kode/teststatus | Reel drift |
|---|---|---|
| Ejeradgang, CRM, pris, tilbud, aftale/invitation | Implementeret og emulatorverificeret | Kræver review, deployment og miljøkontrol |
| Faktura/kredit/Dinero-retur | Implementeret med testadapter/kontrakttest | Dinero testorganisation og credentials mangler |
| Microsoft 365-salgsmail | Implementeret med isolerede kontrakttests | Mailbox-type, Entra-rettigheder og secrets mangler |
| OpenAI-salgsassistent | Implementeret med isolerede kontrakttests | Model, budgetgodkendelse og secret mangler |
| Bilag/OCR/køb | Upload/gennemgang/match implementeret | Mail/OCR/købsflow og malwarevalg mangler |
| Migration v1 | Implementeret og fixture-dry-run-verificeret | Ingen test-/produktionsdatabase er migreret |

Ejerkonsollen må ikke betegnes som driftsklar, før disse porte er godkendt og
testet i de relevante eksterne testmiljøer.
