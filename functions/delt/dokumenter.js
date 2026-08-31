/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/dokumenter.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/dokumenter.js
 * Dokumentlager — Skive 4C (fakturabilag), udvidet i F.2 til opgave-
 * vedhæftede filer (Supplier Portal, §18).
 *
 * ⚠ KUN FAKTURAER & OPGAVER. Sag-vedhæftninger, Procure-bilag,
 * mail-vedhæftninger og sensitive/klassificerede dokumenter kommer senere på
 * SAMME fundament (docs/security-compliance/09_FILE_STORAGE_SECURITY_GATE.md,
 * Gate B i 12_FINDINGS_AND_REMEDIATION_PLAN.md) — ikke i denne fil endnu.
 *
 * ⚠ FILEN ER REN. Ingen firebase-import — samme grund som permissions.js og
 * audit-regler.js: den skal kunne læses af enhver Cloud Function uden at
 * trække firebase med, og signaturtjekket skal kunne prøves uden en
 * emulator eller en rigtig fil.
 *
 * ⚠ STIEN ER DEN ENE SANDHED. `stiForDokument()` bygger BÅDE den Storage-sti
 * en signeret URL peger på OG den streng `firebase.rules.json` kræver at
 * `storagePath`-feltet er lig med. To steder der byggede stien hver for sig,
 * ville før eller siden drive fra hinanden — se demo-kilder-mønstret i
 * CLAUDE.md, gentaget seks gange andre steder i dette repo.
 *
 * ⚠ PARENT_KOLLEKTION ER LUKKET, IKKE ET GÆT. `stiForDokument()` afviser en
 * parentType der ikke står her — det er samme disciplin som MIME-allowlisten:
 * en ukendt værdi er en fejl, ikke en åben dør.
 */

/** De ENESTE to forældretyper et dokument i dag kan hæftes på. */
export const PARENT_KOLLEKTION = { faktura: "fakturaer", opgave: "opgaver" };

/** V1-allowlisten. Ingen executable/script/office/archive-formater. */
export const TILLADT_MIME = ["application/pdf", "image/jpeg", "image/png"];

export const MAX_FILSTOERRELSE_BYTES = 25 * 1024 * 1024; // 25 MB pr. fil
export const MAX_TENANT_BYTES = 2 * 1024 * 1024 * 1024;  // 2 GB pr. tenant

/**
 * Et dokuments livscyklus. Ingen klient kan sætte "aktiv" direkte — kun
 * `dokumentUploadBekraeft` (Cloud Function, Admin SDK) skriver den overgang,
 * efter signatur/størrelse/kvote er tjekket. Se §7 (karantæne) i Gate B.
 *
 * ⚠ SAMME FORM SOM FAKTURASTATUS I leverandoerer.js — {label, pill} pr.
 * nøgle, så en skærm kan tegne en Pille uden sin egen oversættelsestabel.
 */
export const DOKUMENT_STATUS = {
  karantaene: { label: "Behandles",    pill: "info" }, // uploadet, ikke verificeret endnu
  aktiv:      { label: "Tilgængelig",  pill: "ok"   }, // verificeret, kan vises/downloades
  afvist:     { label: "Afvist",       pill: "bad"  }, // fejlede valideringen — blob er slettet
  deaktiveret:{ label: "Deaktiveret",  pill: "info" }, // var aktiv, taget ud af drift — blob består
};

export const ALLE_DOKUMENT_STATUS = Object.keys(DOKUMENT_STATUS);

/**
 * ⚠ SIGNATUREN, IKKE CONTENT-TYPE-HEADEREN. En klient der sender
 * "application/pdf" som header, kan stadig sende .exe-bytes — HTTP-headeren
 * er en påstand, de første bytes i filen er ikke. De fire signaturer herunder
 * er hele grunden til at V1's allowlist kun har tre typer: hver af dem har en
 * entydig, dokumenteret magic number.
 */
const MAGIC_BYTES = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],                   // %PDF-
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

/**
 * tjekSignatur(bytes, mime) → boolean
 *
 * `bytes` er et Buffer ELLER et almindeligt array af tal — funktionen rører
 * kun numerisk indeksering, så den kan prøves med et rent array uden Buffer
 * (og dermed uden Node-specifikke typer i testen).
 */
export function tjekSignatur(bytes, mime) {
  const forventet = MAGIC_BYTES[mime];
  if (!forventet || !bytes || bytes.length < forventet.length) return false;
  for (let i = 0; i < forventet.length; i++) {
    if (bytes[i] !== forventet[i]) return false;
  }
  return true;
}

/**
 * Den ENE kanoniske Storage-object-path for et dokument.
 *
 * ⚠ INGEN WILDCARD-GÆTNING. `firebase.rules.json`s `storagePath`-felt
 * kræver PRÆCIS denne streng — ikke "noget der ligner den". Kalder du
 * funktionen med de samme id'er begge steder (Cloud Function og
 * RTDB-regel), kan de aldrig komme ud af trit.
 *
 * ⚠ parentType AFGØR KOLLEKTIONEN — samme id-par (parentType, parentId)
 * som posten selv bæres af (se `dokumenter`-blokken i firebase.rules.json).
 * En ukendt parentType kaster med det samme: en sti der "gættede" en
 * kollektion, ville kunne pege et dokument ind under en forkert forælder.
 */
export function stiForDokument(tenantId, parentType, parentId, dokumentId) {
  const kollektion = PARENT_KOLLEKTION[parentType];
  if (!kollektion) throw new Error(`stiForDokument: ukendt parentType "${parentType}".`);
  return `tenants/${tenantId}/${kollektion}/${parentId}/dokumenter/${dokumentId}`;
}

/**
 * Ville denne størrelse sprænge tenantens 2 GB-kvote for fakturabilag?
 * Ren aritmetik — kalderen er ansvarlig for at `brugtBytes` faktisk er
 * tenantens nuværende, VERIFICEREDE forbrug (se dokumentUploadBekraeft).
 */
export function sprængerKvote(brugtBytes, nyStoerrelse) {
  return (Number(brugtBytes) || 0) + (Number(nyStoerrelse) || 0) > MAX_TENANT_BYTES;
}
