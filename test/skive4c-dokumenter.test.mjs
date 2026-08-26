/* test/skive4c-dokumenter.test.mjs
 * Skive 4C — Dokumentlager for Fakturaer & bilag, DEV-only.
 *
 * ⚠ SAMME METODE SOM skive4a-fakturaer.test.mjs OG skive4b-leverandoerer.
 * test.mjs: kildekode-inspektion mod functions/index.js (en signeret URL's
 * faktiske funktion kan ikke prøves i en emulator — v4-signering kræver en
 * rigtig service-konto-nøgle) plus direkte prøver af permission-genbrug,
 * MIME/størrelses-/kvote-grænser og storage.rules' indhold. rules.
 * dokumenter.test.mjs (RTDB) og storage.rules.test.mjs (Storage) dækker
 * det emulatoren KAN bevise: at ingen kan skrive/læse direkte.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PERM, ROLLE_PERMS } from "../src/fleet/permissions.js";
import { TILLADT_MIME, MAX_TENANT_BYTES } from "../src/fleet/dokumenter.js";

const kilde = readFileSync("functions/index.js", "utf8");
const STORAGE_REGLER = readFileSync("storage.rules", "utf8");

const blokAf = (navn) => {
  const start = kilde.indexOf(`export const ${navn}`);
  assert.ok(start >= 0, `functions/index.js har ingen ${navn}`);
  const naeste = kilde.indexOf("\nexport const ", start + 1);
  return naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste);
};

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ══════════════════════════════════════════════════════════════════════════
   PERMISSION-GENBRUG — punkt 4: ingen global dokumenter.laes/.skriv
   ══════════════════════════════════════════════════════════════════════════ */
describe("Dokumentadgang genbruger fakturaer.laes/.skriv — ingen ny global permission", () => {
  it("⚠ INGEN dokumentLaes/dokumentSkriv-KONSTANT I permissions.js", () => {
    const permKilde = readFileSync("src/fleet/permissions.js", "utf8");
    assert.ok(!/dokument(er)?(Laes|Skriv):/i.test(permKilde),
      "der er tilføjet en global dokumenter.laes/.skriv-permission — Gate B-checkpointet afviste det udtrykkeligt");
  });

  it("⚠ DE FIRE FUNKTIONER BRUGER procureDoer MED fakturaer.laes ELLER .skriv", () => {
    for (const navn of ["dokumentUploadInitier", "dokumentUploadBekraeft", "dokumentDeaktiver"]) {
      const b = udenKommentarer(blokAf(navn));
      assert.match(b, /procureDoer\(req,\s*\{\s*perm:\s*"fakturaer\.skriv"\s*\}\)/,
        `${navn} bruger ikke fakturaer.skriv`);
    }
    const download = udenKommentarer(blokAf("dokumentDownloadLink"));
    assert.match(download, /procureDoer\(req,\s*\{\s*perm:\s*"fakturaer\.laes"\s*\}\)/,
      "dokumentDownloadLink bruger ikke fakturaer.laes");
  });

  it("⚠ SAMME ROLLEFORDELING SOM ALLEREDE ETABLERET FOR FAKTURAER — ingen ny fordeling at holde synkron", () => {
    /* Rent sanity-tjek: fakturaerLaes/Skriv findes stadig med den fordeling
       4A satte. Dokumentadgang ARVER den, uden at skrive en ny liste. */
    const laes = ["casehandler", "disponent", "koordinator", "lagermedarbejder", "revisor", "admin"];
    const skriv = ["casehandler", "disponent", "koordinator", "admin"];
    for (const rolle of Object.keys(ROLLE_PERMS)) {
      assert.equal(ROLLE_PERMS[rolle].includes(PERM.fakturaerLaes), laes.includes(rolle));
      assert.equal(ROLLE_PERMS[rolle].includes(PERM.fakturaerSkriv), skriv.includes(rolle));
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   STIEN — punkt 3: kanonisk, ingen wildcard-gætning, filnavn aldrig i stien
   ══════════════════════════════════════════════════════════════════════════ */
describe("Storage-stien er DEN ENE kanoniske, bygget af stiForDokument()", () => {
  it("⚠ ALLE TRE FUNKTIONER DER RØRER STORAGE, BRUGER stiForDokument() ELLER dok.storagePath — ALDRIG en selv-bygget sti", () => {
    for (const navn of ["dokumentUploadInitier", "dokumentUploadBekraeft", "dokumentDownloadLink"]) {
      const b = udenKommentarer(blokAf(navn));
      assert.ok(/stiForDokument\(/.test(b) || /dok\.storagePath/.test(b),
        `${navn} bygger tilsyneladende sin egen Storage-sti`);
    }
  });

  it("⚠ originaltFilnavn INDGÅR ALDRIG I EN STI-STRENG I functions/index.js", () => {
    /* En skabelonstreng der interpolerer originaltFilnavn ind i en Storage-
       eller RTDB-sti ville være Gate B §9 om igen. */
    assert.ok(!/\$\{[^}]*originaltFilnavn[^}]*\}/.test(kilde),
      "originaltFilnavn er interpoleret ind i en sti et sted i functions/index.js");
  });

  it("⚠ dokumentId GENERERES AF push(), IKKE AF KLIENTEN", () => {
    const b = udenKommentarer(blokAf("dokumentUploadInitier"));
    assert.match(b, /\.push\(\)\.key/, "dokumentId kommer ikke fra et push()-kald");
    assert.ok(!/d\.dokumentId/.test(b), "dokumentUploadInitier læser tilsyneladende et klient-leveret dokumentId");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   UPLOAD SECURITY — punkt 6: MIME-allowlist, størrelse, kvote, signatur
   ══════════════════════════════════════════════════════════════════════════ */
describe("Upload-grænserne", () => {
  it("⚠ V1-ALLOWLISTEN ER PRÆCIS PDF/JPEG/PNG", () => {
    assert.deepEqual([...TILLADT_MIME].sort(), [
      "application/pdf", "image/jpeg", "image/png",
    ]);
  });

  it("⚠ dokumentUploadInitier AFVISER EN MIME UDEN FOR ALLOWLISTEN", () => {
    const b = udenKommentarer(blokAf("dokumentUploadInitier"));
    assert.match(b, /TILLADT_MIME\.includes\(mimeType\)/);
  });

  it("⚠ STØRRELSEN TJEKKES BÅDE VED INITIERING (klient-angivet) OG VED BEKRÆFTELSE (verificeret)", () => {
    const init = udenKommentarer(blokAf("dokumentUploadInitier"));
    assert.match(init, /MAX_FILSTOERRELSE_BYTES/);
    const bekraeft = udenKommentarer(blokAf("dokumentUploadBekraeft"));
    assert.match(bekraeft, /MAX_FILSTOERRELSE_BYTES/);
  });

  it("⚠ dokumentUploadBekraeft VERIFICERER SIGNATUREN — IKKE KUN CONTENT-TYPE-HEADEREN", () => {
    const b = udenKommentarer(blokAf("dokumentUploadBekraeft"));
    assert.match(b, /tjekSignatur\(/, "signaturen tjekkes ikke — kun headeren er så tilbage");
  });

  it("⚠ TENANTKVOTEN HÅNDHÆVES SERVER-SIDE, IKKE KUN I Storage Rules", () => {
    /* Storage Rules kan ikke summere størrelser på tværs af objekter — se
       storage.rules' eget hoved. Kvoten skal derfor håndhæves i Cloud
       Function'en, transaktionelt på den VERIFICEREDE størrelse. */
    const init = udenKommentarer(blokAf("dokumentUploadInitier"));
    assert.match(init, /sprængerKvote\(/);
    const bekraeft = udenKommentarer(blokAf("dokumentUploadBekraeft"));
    assert.match(bekraeft, /\.transaction\(/,
      "kvoten opdateres ikke transaktionelt — to samtidige uploads kan begge vinde");
  });

  it(`⚠ 2 GB-GRÆNSEN STÅR ÉT STED (${MAX_TENANT_BYTES} bytes)`, () => {
    assert.equal(MAX_TENANT_BYTES, 2 * 1024 * 1024 * 1024);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   KARANTÆNE — punkt 7: intet er "aktiv" før bekræftelse, ingen malware-påstand
   ══════════════════════════════════════════════════════════════════════════ */
describe("Karantæne — intet dokument er tilgængeligt før verificering", () => {
  it('⚠ dokumentUploadInitier SÆTTER STATUS "karantaene", IKKE "aktiv"', () => {
    const b = udenKommentarer(blokAf("dokumentUploadInitier"));
    assert.match(b, /status:\s*"karantaene"/);
    assert.ok(!/status:\s*"aktiv"/.test(b),
      "dokumentUploadInitier sætter status til aktiv — karantænen er så en illusion");
  });

  it('⚠ dokumentUploadBekraeft KRÆVER STATUS "karantaene" FØR DEN GÅR VIDERE', () => {
    const b = udenKommentarer(blokAf("dokumentUploadBekraeft"));
    assert.match(b, /dok\.status !== "karantaene"/);
  });

  it('⚠ dokumentDownloadLink KRÆVER STATUS "aktiv" — et karantæneret dokument kan ikke hentes', () => {
    const b = udenKommentarer(blokAf("dokumentDownloadLink"));
    assert.match(b, /dok\.status !== "aktiv"/);
  });

  it("⚠ INGEN MALWARE-SCANNER BYGGES — koden hverken kalder eller påstår én", () => {
    /* ⚠ udenKommentarer() FØRST — filens egen, ærlige kommentar om at ingen
       scanner findes ("malware-scanner er bygget") ville ellers matche sin
       egen advarsel. Det er KODEN der ikke må kalde en scanner, ikke
       kommentaren der ikke må nævne fraværet af én. */
    const kodeUdenKommentarer = udenKommentarer(kilde);
    assert.ok(!/clamav|virus.?scan|scanFile\(|malwareScan/i.test(kodeUdenKommentarer),
      "der er tilsyneladende tilføjet et scanner-kald — det var eksplicit uden for 4C's scope");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   DOWNLOAD SECURITY — punkt 8: ingen permanente tokens, 5 minutters TTL
   ══════════════════════════════════════════════════════════════════════════ */
describe("Download — kortlivet signeret URL, ikke et permanent token", () => {
  it("⚠ INGEN getDownloadURL/downloadTokens-MØNSTER — kun getSignedUrl", () => {
    assert.ok(!/getDownloadURL|downloadTokens/.test(kilde),
      "et permanent Firebase download-token er brugt i stedet for en signeret URL");
  });

  it("⚠ TTL ER 5 MINUTTER PÅ DOWNLOAD-LINKET", () => {
    const b = udenKommentarer(blokAf("dokumentDownloadLink"));
    assert.match(b, /TTL_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
  });

  it("⚠ SIGNED URL-KALDET BRUGER v4 OG action: \"read\"", () => {
    const b = udenKommentarer(blokAf("dokumentDownloadLink"));
    assert.match(b, /version:\s*"v4"/);
    assert.match(b, /action:\s*"read"/);
  });

  it("⚠ LINKET STÅR ALDRIG I AUDITPOSTEN — kun at et link blev udstedt", () => {
    const b = udenKommentarer(blokAf("dokumentDownloadLink"));
    /* logProcure()-kaldet skal ikke sende `url` med som foer/efter. */
    const logKald = b.slice(b.indexOf("await logProcure("));
    assert.ok(!/\burl\b/.test(logKald.slice(0, logKald.indexOf(");"))),
      "download-URL'en ser ud til at blive sendt med til auditloggen");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   AUDIT — punkt 9
   ══════════════════════════════════════════════════════════════════════════ */
describe("Audit — hvert af de fire trin logges, objekt \"fakturaDokument\"", () => {
  it("⚠ ALLE FIRE FUNKTIONER KALDER logProcure MED OBJEKT \"fakturaDokument\"", () => {
    for (const navn of [
      "dokumentUploadInitier", "dokumentUploadBekraeft",
      "dokumentDownloadLink", "dokumentDeaktiver",
    ]) {
      const b = udenKommentarer(blokAf(navn));
      assert.match(b, /logProcure\(tenantId, uid, [^,]+, "fakturaDokument"/,
        `${navn} logger ikke med objekt "fakturaDokument"`);
    }
  });

  it("⚠ fakturaDokument ER REGISTRERET SOM REGNSKABSOBJEKT — regnskab-klassen, ikke drift", () => {
    const auditKilde = readFileSync("src/fleet/audit-regler.js", "utf8");
    assert.match(auditKilde, /"fakturaDokument"/);
  });

  it("⚠ fakturaId/valideretMime/stoerrelse ER PÅ LOGBARE_FELTER — originaltFilnavn ER IKKE", () => {
    const auditKilde = readFileSync("src/fleet/audit-regler.js", "utf8");
    const blok = auditKilde.slice(
      auditKilde.indexOf("export const LOGBARE_FELTER"),
      auditKilde.indexOf("]);", auditKilde.indexOf("export const LOGBARE_FELTER")));
    for (const felt of ["fakturaId", "valideretMime", "stoerrelse"]) {
      assert.match(blok, new RegExp(`"${felt}"`), `${felt} mangler på LOGBARE_FELTER`);
    }
    assert.ok(!/"originaltFilnavn"/.test(blok),
      "originaltFilnavn (fritekst fra en bruger) er kommet på audit-allowlisten");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   RETENTION / INGEN HARDSLET — punkt 10
   ══════════════════════════════════════════════════════════════════════════ */
describe("Deaktivering — statusskift, aldrig en destruktion, legal hold respekteres", () => {
  it("⚠ dokumentDeaktiver KALDER erUndtaget() FØR DEN SKRIVER", () => {
    const b = udenKommentarer(blokAf("dokumentDeaktiver"));
    const holdIndeks = b.indexOf("erUndtaget(");
    const skrivIndeks = b.indexOf(".update({ status: \"deaktiveret\"");
    assert.ok(holdIndeks >= 0, "dokumentDeaktiver tjekker ikke erUndtaget()");
    assert.ok(skrivIndeks > holdIndeks, "legal hold-tjekket ligger EFTER skrivningen, ikke før");
  });

  it('⚠ dokumentDeaktiver KALDER ALDRIG file.delete() — blobben består', () => {
    const b = udenKommentarer(blokAf("dokumentDeaktiver"));
    assert.ok(!/\.delete\(/.test(b), "dokumentDeaktiver sletter tilsyneladende blobben");
  });

  it("⚠ KUN dokumentUploadBekraeft's AFVISNINGSGREN SLETTER EN BLOB — og det er en fejlet upload, ikke et fjernet dokument", () => {
    const b = udenKommentarer(blokAf("dokumentUploadBekraeft"));
    const sletninger = [...b.matchAll(/\.delete\(/g)].length;
    assert.equal(sletninger, 1,
      "forventede præcis én file.delete()-forekomst — i afvis(), for en fil der aldrig bestod valideringen");
  });

  it("⚠ EN NY RETENTION-KATEGORI FINDES, IKKE OPDIGTET PERIODE", () => {
    const retentionKilde = readFileSync("src/fleet/retention-regler.js", "utf8");
    assert.match(retentionKilde, /fakturaBilag:\s*\{/);
    const blok = retentionKilde.slice(
      retentionKilde.indexOf("fakturaBilag:"),
      retentionKilde.indexOf("},", retentionKilde.indexOf("fakturaBilag:")));
    assert.match(blok, /periodeMaaneder:\s*null/);
    assert.match(blok, /afgjort:\s*false/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   STORAGE RULES — punkt 12
   ══════════════════════════════════════════════════════════════════════════ */
describe("storage.rules — lukket for direkte klient-SDK-adgang", () => {
  it("⚠ FILEN FINDES OG ER rules_version '2'", () => {
    assert.match(STORAGE_REGLER, /rules_version\s*=\s*'2';/);
  });

  it("⚠ FAKTURABILAG-STIEN ER EKSPLICIT DEFINERET OG LUKKET", () => {
    assert.match(STORAGE_REGLER,
      /match \/tenants\/\{tenantId\}\/fakturaer\/\{fakturaId\}\/dokumenter\/\{dokumentId\}/);
  });

  it("⚠ INGEN sti I FILEN TILLADER read/write UBETINGET (if true)", () => {
    assert.ok(!/if true/.test(STORAGE_REGLER), "en regel i storage.rules tillader adgang ubetinget");
  });

  it("⚠ ALT ANDET END FAKTURABILAG-STIEN ER OGSÅ LUKKET (allPaths=**)", () => {
    assert.match(STORAGE_REGLER, /match \/\{allPaths=\*\*\}/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SCOPE — punkt 2: kun Fakturaer & bilag, ingen andre dokumenttyper
   ══════════════════════════════════════════════════════════════════════════ */
describe("4C rører ikke det der eksplicit er uden for scope", () => {
  it("⚠ INGEN sag-/procure-/mail-VEDHÆFTNINGSFUNKTION ER TILFØJET", () => {
    assert.ok(!/export const sagDokument|export const procureDokument|export const mailVedhaeft/.test(kilde),
      "en anden dokumenttypes upload/download-funktion er tilføjet — det hører til en senere skive");
  });

  it("⚠ parentType ER LÅST TIL \"faktura\" I RTDB-REGLERNE — ingen anden dokumenttype accepteres endnu", () => {
    const regler = readFileSync("firebase.rules.json", "utf8");
    assert.match(regler, /newData\.val\(\) === 'faktura'/);
  });
});
