# PROCURE lager – kort verifikationsrapport

Dato: 12. september 2026

Rettelsesrunden er gennemført på `codex/procure-integrated-development`. Kode- og testgrundlaget er commit `c36f8b6`.

## Resultat

- Desktoplayoutet fylder AppShell-arbejdsområdet uden global vandret rulning.
- Mobilflowet er betjent ved 360 og 390 CSS-px uden afskårne kontroller.
- Den servergemte kvittering viser 66 ruller og en separat korrektion på −2 ruller med medarbejder og tidspunkt.
- Historikken kan genåbnes i en anden autoriseret session.
- Runtimeflowet gennem Auth, Functions og Realtime Database dokumenterer idempotens, revisionskonflikt, manglende skriveret, fremmed tenant og atomisk afvisning.
- Den valgte periode afstemmer til 64 ruller, og den faktisk downloadede CSV indeholder samme periode, summer og enhed.
- Flerside-PDF'en har bestillingsnummer og gentaget tabeloverskrift på alle fire sider; nye leverandørdokumenter har hverken priser eller modtagelses-QR.

## Verifikationsstatus

| Område | Resultat |
| --- | --- |
| Lint / build / designtokens | Bestået |
| Målrettede lager-/PDF-/navigationstests | 70/70 |
| Fuld platform- og regelsuite | 4.349/4.349 |
| Auth/Functions/Database-runtimeflow | Bestået |
| Autoriserede browserflows | Bestået ved 360, 390 og 1440 px |
| PDF-rendering | 4/4 sider kontrolleret |
| Fysisk telefon | Ikke afprøvet |

Den fulde kravmatrix, kommandoer og artefaktliste findes i `PROCURE_LAGER_VERIFIKATION_2026-09-12.md`.

Den samlede ZIP indeholder seks rapporter, 16 aktuelle screenshots, runtime-/CSV-beviser og tre PDF-eksempler.
