# Fakturacenterets referencekontrakt V1

Reference Contract V1 er den lokale, provideruafhængige integrationsgrænse mellem
Fakturacenter og FLEET, FACILITY og PROCURE. Den er ren domænelogik. Den er endnu
ikke implementeret i Functions, Database Rules, Storage eller andre
serverintegrationer.

Fakturacenter er ikke et økonomi-, betalings- eller bogføringssystem.
`kontrolleret` betyder, at dokument, aflæsning, match, nettofordeling og
omkostningsstruktur er bekræftet. Det siger intet om betaling eller bogføring.

## Ejerskab og dataflow

Destinationsmodulet ejer opgaven eller bestillingen, enheden,
leverandørrelationen, Veyro-referencen og fakturavinduet. Det udstiller en
tenantafgrænset og autoriseret read-only projektion som Referencedestination V1.
Read-only betyder aldrig offentlig adgang.

Fakturacenter ejer dokumentet, den oprindelige aflæsning, rettelser,
matchforslag, fordeling, kontrol, låsning og append-only historik. Et eksakt
referencefund kan placere en faktura til kontrol, men Fakturacenter skriver ikke
direkte i destinationsmodulets opgave.

Den eksisterende `markérKontrolleret` er fortsat rent lokalt UI-state og
producerer ikke automatisk en integrationshændelse. Den eneste eksplicitte
konverteringsgrænse fra den interne prototypefordeling er
`emitFakturafordelingV1`. En senere serveroperation skal kalde denne grænse og
persistére den validerede hændelse atomisk. Destinationsmodulet genberegner
faktisk omkostning ud fra gyldige V1-hændelser.

## Versioner, schema og grænser

Begge kontrakter kræver `kontraktVersion: 1`. Manglende, `null`, forkert typet,
ukendt og fremtidig version afvises. Ukendte kontraktfelter og eksplicit forkert
typede valgfrie felter afvises fail-closed. Et eksisterende felts betydning må
ikke ændres uden en ny kontraktversion.

- stabile ID'er, idempotensnøgler og korrelations-ID'er: 1–128 tegn
- Veyro-, bestillings-, enheds- og øvrige referencer: 1–128 tegn målt efter
  trim og én Unicode NFC-normalisering
- navne: højst 200 tegn
- referencearrays: højst 20 elementer
- revisionsbegrundelse: 1–500 tegn efter trim

## Intern modulenum og integrationsenum

Den interne prototypeenum bevares som `FLEET`, `FACILITY` og `PROCURE`.
V1-integrationskontrakten bruger `fleet`, `facility` og `procure`.
`tilReferenceModulV1` og `fraReferenceModulV1` er den eksplicitte
konverteringsgrænse; værdier skifter ikke betydning lydløst.

## Referencedestination V1

`kontraktVersion` er tallet `1`. `modul` er præcis `fleet`, `facility` eller
`procure`. Produktionsbuilderen accepterer kun `proveniens: autoritative` og
kræver destinationsmodulets egentlige Veyro-reference samt autoritative
oprettelses- og ændringstidspunkter. Projektionen indeholder:

- `proveniens`, `tenantId`, `destinationId`, `destinationstype` og visningsfeltet `navn`
- `veyroReference` samt det valgfrie `bestillingsnummer`
- den samlede, deduplikerede liste `referencer`
- `leverandoer`: en read-only projektion med stabilt leverandør-ID og valgfrie
  CVR-, navne- og navnevariantfelter
- valgfrie `enhedsreferencer`: stabilt enheds-ID, internt nummer,
  registreringsnummer, stel-/serienummer, navn og kundereferencer
- `fakturastatus`: `aaben-for-faktura`, `delvist-faktureret` eller
  `lukket-for-faktura`
- `oprettetMs` og `aendretMs` som positive, sikre heltal
- valgfri lokation, koststeder, operationel status og neutral
  `forventetNettoOere`

Estimatet må kun vises neutralt eller bruges som et svagt rangeringssignal. En
afvigelse må hverken blokere eller fremhæves som en fejl.

Referenceværdier normaliseres ens på begge sider med Unicode NFC,
deterministisk dansk versalisering og fjernelse af visningsseparatorer.
Unicode-bogstaver bevares og translittereres ikke. `Æ-123`, `AE-123`, `Ø-123`,
`OE-123`, `Å-123`, `AA-123`, `A-123`, `O-123` og `123` er forskellige
værdier. Førende nuller bevares, og match sker på hele tokens, aldrig
substrings. Fuzzy leverandør- og navnematch er en separat mekanisme og bliver
aldrig et eksakt referencefund.

De eksisterende adaptere udfører kun projektion og muterer ikke deres input.
Deres ydre resultatkollektioner og alle nested kontraktværdier er immutable og
frosne, både for autoritative V1-projektioner og demo-/legacyprojektioner.
Produktionsadapterne med suffikset `V1` har ingen fallback. De syntetiske etape
1-fixtures bruger særskilte demo-/legacyadaptere, som må bruge første reference
og ét legacy-datofelt, men altid markerer resultatet `proveniens: demo-legacy`.
Produktionsgrænsen afviser denne provenance. `bygDestination` er kun den
bagudkompatible, interne demo-facade.

## Fakturafordeling V1

`kontraktVersion` er tallet `1`. Kontrakten indeholder:

- `tenantId`, stabilt `fordelingId`, obligatorisk `fakturaId` og valgfri `intakeId`
- valgfrit `erstatterFordelingId` på en ny revision
- destinationens `modul` og `destinationId`
- `nettoOere` som et ikke-nul `Number.isSafeInteger`
- `dokumenttype`: `faktura` med positivt fortegn eller `kreditnota` med negativt
  fortegn
- `status`: `kladde`, `kontrolleret` eller `tilbagefoert`
- afledt `operationstype`, stabil `idempotensnoegle`, positivt `tidspunktMs`,
  `aktoerId` og `korrelationsId`
- kendt `revisionsaarsagskode` og obligatorisk `revisionsaarsag` ved tilbageførsel

Et fordelingssæt bindes til én forventet `fakturaId`. Alle linjer skal have samme
tenant, samme faktura-ID, samme eventuelle intake-ID, unikke fordelings-ID'er,
samme dokumenttype og præcis den forventede nettosum. Nulbeløb afvises, og
summering stopper ved safe-integer-overflow. Nye fordelinger kan kun knyttes til
et åbent eller delvist faktureret vindue.

## Bindende tilstandstabel

| Fra | Til | Tilladt |
| --- | --- | --- |
| ingen | `kladde` | ja |
| `kladde` | `kontrolleret` | ja |
| `kontrolleret` | `tilbagefoert` | ja, med årsagskode og begrundelse |
| alle andre kombinationer | — | nej |

Hændelsestidspunkter er positive safe integers og strengt stigende inden for
samme fordelingsforløb. Efter genåbning appendes først en `tilbagefoert`-hændelse
til den gamle fordeling. En ny revision skal have et nyt `fordelingId`, starter
som `kladde` og kan pege på den tilbageførte fordeling med
`erstatterFordelingId`. Den tæller først i omkostningen efter ny kontrol.

Kladder bidrager med nul, kontrollerede fakturaer med positiv netto og
kontrollerede kreditnotaer med negativ netto. En tilbageførsel fjerner den gamle
fordelings bidrag. Reduceren bruger samme tilstandsmaskine, afviser dubletter og
modstridende historik og stopper med `ALLOCATION_COST_OVERFLOW` ved usikker sum.

## Versionering, idempotens og historik

Idempotensidentiteten er den kanonisk serialiserede tuple
`[tenantId, operationstype, idempotensnoegle]` (konceptuelt
`tenantId + operationstype + idempotensnoegle`). Tupleformen forhindrer
delimiterkollisioner mellem ID-felterne. Operationstyperne er
`fordeling-oprettet`, `fordeling-kontrolleret` og `fordeling-tilbagefoert`.
Fingeraftrykket beregnes af den validerede, kanoniske payload med rekursivt
sorterede objektnøgler.

Betroet tenant, aktør og eksisterende historik valideres først. Derefter
returnerer et eksakt tidligere idempotensmatch det tidligere resultat uden en ny
hændelse, også hvis destinationen siden er lukket. Kun nye operationer valideres
mod destinationens aktuelle fakturavindue. Samme scope med ændret payload giver
`ALLOCATION_IDEMPOTENCY_CONFLICT`; ændret operationstype under samme rå nøgle
afvises som ugyldigt idempotensscope.

Kontraktobjekter, nested projektioner, historiksnapshots og resultatwrappers er
deep-frozen. Funktionerne ændrer hverken input eller tidligere hændelser.

## Revisionsbegrundelser og databeskyttelse

Tilbageførsel kræver en kendt struktureret årsagskode og en NFC-normaliseret
begrundelse på 1–500 tegn efter trim. Ugyldige kontroltegn afvises.
Begrundelsen må kun forklare revisionshandlingen og må ikke indeholde
fakturatekst, rå mailtekst, dokumentindhold, credentials eller følsomme
personoplysninger.

## Sikkerhedsgrænse og resterende serverarbejde

Alle lokale funktioner kræver en separat tenantkontekst. Det demonstrerer
kontrakten, men browserkontekst er ikke serverautoritet. En senere Functions-
implementering skal selv udlede tenant og aktør fra stramt valideret auth,
autorisere læsning og handling og hente destinationen fra det ejende modul. I én
atomisk operation skal serveren genvalidere fakturavindue og destinationsversion,
slå idempotensidentiteten op, appendere hændelsen og genberegne
omkostningsprojektionen.

Den rene V1-kontrakt validerer lokale snapshots, men løser ikke race condition
mellem læsning og serverpersistens. Rules skal håndhæve tenantisolering og
blokere klientskrivning til serverejede projektioner, historik og aggregater.
