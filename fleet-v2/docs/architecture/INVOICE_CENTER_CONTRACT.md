# FLEET v2 ↔ Fakturacenter – forventet integrationskontrakt

Status: versionsstyret forslag til en senere backendintegration. Den lokale
prototype er **ikke tilsluttet** Fakturacenter og kan ikke matche, kontrollere,
godkende eller bogføre fakturaer.

## Ejerskab

FLEET ejer sag, værkstedsopgave, bestilling, enhed, leverandørrelation, den
læsbare Veyro-reference og sagens fakturaafklaring. Fakturacenter ejer
dokumentet, aflæsning, matchforslag, fordeling, kontrol og revisionshistorik.

## Hændelse fra Fakturacenter

En versioneret fordelingshændelse skal som minimum indeholde:

- `tenantId`
- stabile `caseId`, `taskId`, `orderId`, `unitId` og `vendorId`, hvor kendt
- `documentId` og `allocationId`
- læsbar `reference`
- `controlStatus` (`to_control`, `controlled` eller `rejected`)
- ISO 4217-`currency`
- `netAmountMinor` som heltal i valutaens mindste enhed (DKK: øre; kreditnota er negativ)
- monotont `version`
- globalt entydig `idempotencyKey`
- revisionsoplysninger med revision, tidspunkt og aktør/reference til aktør

FLEET accepterer kun faktiske eksterne omkostninger fra den seneste,
kontrollerede version af en fordeling. Estimater og lokale foreløbige beløb
forbliver separate. Gentagelse af samme idempotensnøgle har ingen økonomisk
effekt.

## Matchregel

Referenceopslag er tenantafgrænset og kræver eksakt, tokenafgrænset match af
hele Veyro-referencen. Et enhedsnummer, registreringsnummer eller leverandør-ID
er kun supplerende kontroloplysninger og må aldrig alene udløse et sikkert
match. Nul eller flere end ét kandidatmatch giver manuel afklaring.

## Lukning og ændringer

`Til kontrol` er ikke en kontrolleret faktura. En kontrolleret delfaktura
opfylder ikke forventningen om flere dokumenter. En sag kan derfor først
lukkes normalt, når alle forventede dokumenter er kontrolleret. Alternativet
er en eksplicit og begrundet lukning uden faktura. En senere faktura eller en
ændret kontrolversion på en lukket sag sætter fakturaafklaringen til
`review_required`; den historiske lukkehændelse slettes aldrig.

I den fælles platform skal den læsbare reference tildeles autoritativt på
serveren med tenantafgrænset kollisionsbeskyttelse. Prototypens lokale
sekvensgenerator er kun egnet til ét browserdatasæt.
