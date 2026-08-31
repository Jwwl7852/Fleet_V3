/* test/f2-opgavedokumenter-cloud.test.mjs
 * F.2 — Opgavedokumenter. Samme metode som test/skive4c-dokumenter.test.mjs:
 * kildekode-inspektion mod functions/index.js (en signeret URL's faktiske
 * funktion kan ikke prøves i en emulator — v4-signering kræver en rigtig
 * service-konto-nøgle) plus direkte prøver af permission-genbrug og
 * MIME/størrelses-/kvote-grænser. test/rules.dokumenter.test.mjs (RTDB) og
 * test/storage.rules.test.mjs (Storage) dækker det emulatoren KAN bevise.
 *
 * Kør: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
   PERMISSION-GENBRUG — opgaver.skriv til upload/deaktiver/synlighed, INGEN
   ekstra permission til download (opgaver selv kræver ingen .laes)
   ══════════════════════════════════════════════════════════════════════════ */
describe("Opgavedokumentadgang genbruger opgaver.skriv — INGEN NY GLOBAL PERMISSION", () => {
  it("⚠ INGEN opgaveDokumentLaes/-Skriv-KONSTANT I permissions.js", () => {
    const permKilde = readFileSync("src/fleet/permissions.js", "utf8");
    assert.ok(!/opgaveDokument(er)?(Laes|Skriv):/i.test(permKilde),
      "der er tilføjet en global opgaveDokument-permission — samme princip som Gate B afviste for fakturabilag");
  });

  it("⚠ UPLOAD/BEKRÆFT/DEAKTIVER/SYNLIGHED BRUGER procureDoer MED opgaver.skriv", () => {
    for (const navn of [
      "opgaveDokumentUploadInitier", "opgaveDokumentUploadBekraeft",
      "opgaveDokumentDeaktiver", "opgaveDokumentSynlighedSaet",
    ]) {
      const b = udenKommentarer(blokAf(navn));
      assert.match(b, /procureDoer\(req,\s*\{\s*perm:\s*"opgaver\.skriv"\s*\}\)/,
        `${navn} bruger ikke opgaver.skriv`);
    }
  });

  it("⚠ opgaveDokumentDownloadLink KRÆVER INGEN PERM — samme adgang som opgaver selv", () => {
    const b = udenKommentarer(blokAf("opgaveDokumentDownloadLink"));
    assert.match(b, /procureDoer\(req,\s*\{\}\)/,
      "opgaveDokumentDownloadLink har fået et perm-krav — opgaver selv kræver ingen .laes-permission");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   STIEN — samme kanoniske stiForDokument(), nu parentType-generisk
   ══════════════════════════════════════════════════════════════════════════ */
describe("Storage-stien for opgavedokumenter er DEN SAMME kanoniske funktion, nu parentType-generisk", () => {
  it("⚠ ALLE TRE FUNKTIONER DER RØRER STORAGE, BRUGER stiForDokument() ELLER dok.storagePath", () => {
    for (const navn of [
      "opgaveDokumentUploadInitier", "opgaveDokumentUploadBekraeft", "opgaveDokumentDownloadLink",
    ]) {
      const b = udenKommentarer(blokAf(navn));
      assert.ok(/stiForDokument\(/.test(b) || /dok\.storagePath/.test(b),
        `${navn} bygger tilsyneladende sin egen Storage-sti`);
    }
  });

  it('⚠ opgaveDokumentUploadInitier KALDER stiForDokument MED "opgave" SOM parentType', () => {
    const b = udenKommentarer(blokAf("opgaveDokumentUploadInitier"));
    assert.match(b, /stiForDokument\(tenantId,\s*"opgave"/);
  });

  it("⚠ dokumentId GENERERES AF push(), IKKE AF KLIENTEN", () => {
    const b = udenKommentarer(blokAf("opgaveDokumentUploadInitier"));
    assert.match(b, /\.push\(\)\.key/, "dokumentId kommer ikke fra et push()-kald");
    assert.ok(!/d\.dokumentId/.test(b), "opgaveDokumentUploadInitier læser tilsyneladende et klient-leveret dokumentId");
  });

  it("⚠ opgaveId VERIFICERES SERVER-SIDE FØR ET DOKUMENT SKRIVES — samme 'fetch and verify' som fakturaen", () => {
    const b = udenKommentarer(blokAf("opgaveDokumentUploadInitier"));
    assert.match(b, /rod\.child\(`opgaver\/\$\{opgaveId\}`\)\.once\("value"\)/);
    assert.match(b, /if \(!oSnap\.exists\(\)\)/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   UPLOAD SECURITY — samme MIME-allowlist, størrelse, signatur; EGEN KVOTE
   ══════════════════════════════════════════════════════════════════════════ */
describe("Upload-grænserne — samme som fakturabilag, egen kvote-tæller", () => {
  it("⚠ opgaveDokumentUploadInitier AFVISER EN MIME UDEN FOR ALLOWLISTEN", () => {
    const b = udenKommentarer(blokAf("opgaveDokumentUploadInitier"));
    assert.match(b, /TILLADT_MIME\.includes\(mimeType\)/);
  });

  it("⚠ STØRRELSEN TJEKKES BÅDE VED INITIERING OG VED BEKRÆFTELSE", () => {
    const init = udenKommentarer(blokAf("opgaveDokumentUploadInitier"));
    assert.match(init, /MAX_FILSTOERRELSE_BYTES/);
    const bekraeft = udenKommentarer(blokAf("opgaveDokumentUploadBekraeft"));
    assert.match(bekraeft, /MAX_FILSTOERRELSE_BYTES/);
  });

  it("⚠ opgaveDokumentUploadBekraeft VERIFICERER SIGNATUREN — IKKE KUN CONTENT-TYPE-HEADEREN", () => {
    const b = udenKommentarer(blokAf("opgaveDokumentUploadBekraeft"));
    assert.match(b, /tjekSignatur\(/);
  });

  it("⚠ EGEN KVOTETÆLLER — dokumentkvote/opgaveBilag, IKKE fakturaBilag", () => {
    const init = udenKommentarer(blokAf("opgaveDokumentUploadInitier"));
    assert.match(init, /dokumentkvote\/opgaveBilag\/brugtBytes/);
    assert.ok(!/dokumentkvote\/fakturaBilag/.test(init),
      "opgaveDokumentUploadInitier læser tilsyneladende fakturabilagenes kvote");
    const bekraeft = udenKommentarer(blokAf("opgaveDokumentUploadBekraeft"));
    assert.match(bekraeft, /dokumentkvote\/opgaveBilag\/brugtBytes/);
    assert.match(bekraeft, /\.transaction\(/,
      "kvoten opdateres ikke transaktionelt — to samtidige uploads kan begge vinde");
  });

  it(`⚠ SAMME 2 GB-GRÆNSE SOM FAKTURABILAG (${MAX_TENANT_BYTES} bytes) — genbrugt, ikke en anden konstant`, () => {
    assert.equal(MAX_TENANT_BYTES, 2 * 1024 * 1024 * 1024);
  });

  it("⚠ SAMME V1-ALLOWLIST SOM FAKTURABILAG — genbrugt, ikke defineret to gange", () => {
    assert.deepEqual([...TILLADT_MIME].sort(), ["application/pdf", "image/jpeg", "image/png"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   KARANTÆNE
   ══════════════════════════════════════════════════════════════════════════ */
describe("Karantæne — intet opgavedokument er tilgængeligt før verificering", () => {
  it('⚠ opgaveDokumentUploadInitier SÆTTER STATUS "karantaene", IKKE "aktiv"', () => {
    const b = udenKommentarer(blokAf("opgaveDokumentUploadInitier"));
    assert.match(b, /status:\s*"karantaene"/);
    assert.ok(!/status:\s*"aktiv"/.test(b));
  });

  it('⚠ opgaveDokumentUploadInitier SÆTTER synligForLeverandoer: false — ALDRIG true VED UPLOAD', () => {
    const b = udenKommentarer(blokAf("opgaveDokumentUploadInitier"));
    assert.match(b, /synligForLeverandoer:\s*false/);
    assert.ok(!/synligForLeverandoer:\s*true/.test(b),
      "et nyt dokument sættes tilsyneladende delt ved selve uploadet — delingen skal være en separat, eksplicit handling");
  });

  it('⚠ opgaveDokumentUploadBekraeft KRÆVER STATUS "karantaene" FØR DEN GÅR VIDERE', () => {
    const b = udenKommentarer(blokAf("opgaveDokumentUploadBekraeft"));
    assert.match(b, /dok\.status !== "karantaene"/);
  });

  it('⚠ opgaveDokumentDownloadLink KRÆVER STATUS "aktiv"', () => {
    const b = udenKommentarer(blokAf("opgaveDokumentDownloadLink"));
    assert.match(b, /dok\.status !== "aktiv"/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   DEN EKSPLICITTE DELINGSBESLUTNING — opgaveDokumentSynlighedSaet
   ══════════════════════════════════════════════════════════════════════════ */
describe("opgaveDokumentSynlighedSaet — deling er en egen, eksplicit, auditeret beslutning", () => {
  it("⚠ KRÆVER STATUS \"aktiv\" — et karantæneret eller deaktiveret dokument kan ikke deles/skjules", () => {
    const b = udenKommentarer(blokAf("opgaveDokumentSynlighedSaet"));
    assert.match(b, /dok\.status !== "aktiv"/);
  });

  it("⚠ synlig SKAL VÆRE EN BOOLEAN — ikke en fritekst eller et tal", () => {
    const b = udenKommentarer(blokAf("opgaveDokumentSynlighedSaet"));
    assert.match(b, /typeof d\.synlig !== "boolean"/);
  });

  it("⚠ LOGGER FØR/EFTER PÅ synligForLeverandoer, IKKE BARE 'ÆNDRET'", () => {
    const b = udenKommentarer(blokAf("opgaveDokumentSynlighedSaet"));
    assert.match(b, /\{ synligForLeverandoer: dok\.synligForLeverandoer === true \}/);
    assert.match(b, /\{ synligForLeverandoer: d\.synlig \}/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   DOWNLOAD SECURITY
   ══════════════════════════════════════════════════════════════════════════ */
describe("Download — kortlivet signeret URL for interne brugere, 5 minutter, v4", () => {
  it("⚠ TTL ER 5 MINUTTER PÅ opgaveDokumentDownloadLink", () => {
    const b = udenKommentarer(blokAf("opgaveDokumentDownloadLink"));
    assert.match(b, /TTL_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
  });

  it("⚠ SIGNED URL-KALDET BRUGER v4 OG action: \"read\"", () => {
    const b = udenKommentarer(blokAf("opgaveDokumentDownloadLink"));
    assert.match(b, /version:\s*"v4"/);
    assert.match(b, /action:\s*"read"/);
  });

  it("⚠ LINKET STÅR ALDRIG I AUDITPOSTEN", () => {
    const b = udenKommentarer(blokAf("opgaveDokumentDownloadLink"));
    const logKald = b.slice(b.indexOf("await logProcure("));
    assert.ok(!/\burl\b/.test(logKald.slice(0, logKald.indexOf(");"))),
      "download-URL'en ser ud til at blive sendt med til auditloggen");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   AUDIT — objekt "opgaveDokument", drift-klasse (ikke regnskab)
   ══════════════════════════════════════════════════════════════════════════ */
describe("Audit — hver af de fem interne funktioner logger, objekt \"opgaveDokument\"", () => {
  it("⚠ ALLE FEM FUNKTIONER KALDER logProcure MED OBJEKT \"opgaveDokument\"", () => {
    for (const navn of [
      "opgaveDokumentUploadInitier", "opgaveDokumentUploadBekraeft",
      "opgaveDokumentDownloadLink", "opgaveDokumentDeaktiver", "opgaveDokumentSynlighedSaet",
    ]) {
      const b = udenKommentarer(blokAf(navn));
      assert.match(b, /logProcure\(tenantId, uid, [^,]+, "opgaveDokument"/,
        `${navn} logger ikke med objekt "opgaveDokument"`);
    }
  });

  it("⚠ opgaveDokument ER IKKE ET REGNSKABSOBJEKT — det er driftsdokumentation, ikke regnskabsbevis", () => {
    const auditKilde = readFileSync("src/fleet/audit-regler.js", "utf8");
    const blok = auditKilde.slice(
      auditKilde.indexOf("const REGNSKABSOBJEKTER"),
      auditKilde.indexOf("]);", auditKilde.indexOf("const REGNSKABSOBJEKTER")));
    assert.ok(!/"opgaveDokument"/.test(blok),
      "opgaveDokument er kommet på REGNSKABSOBJEKTER — det hører i drift-klassen, som facilitySager/opgaver allerede gør");
  });

  it("⚠ opgaveId/valideretMime/stoerrelse/synligForLeverandoer ER PÅ LOGBARE_FELTER — originaltFilnavn ER IKKE", () => {
    const auditKilde = readFileSync("src/fleet/audit-regler.js", "utf8");
    const blok = auditKilde.slice(
      auditKilde.indexOf("export const LOGBARE_FELTER"),
      auditKilde.indexOf("]);", auditKilde.indexOf("export const LOGBARE_FELTER")));
    for (const felt of ["opgaveId", "valideretMime", "stoerrelse", "synligForLeverandoer"]) {
      assert.match(blok, new RegExp(`"${felt}"`), `${felt} mangler på LOGBARE_FELTER`);
    }
    assert.ok(!/"originaltFilnavn"/.test(blok),
      "originaltFilnavn (fritekst fra en bruger) er kommet på audit-allowlisten");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   DEAKTIVERING — statusskift, aldrig en destruktion, legal hold respekteres
   ══════════════════════════════════════════════════════════════════════════ */
describe("opgaveDokumentDeaktiver — statusskift, aldrig en destruktion", () => {
  it("⚠ KALDER erUndtaget() FØR DEN SKRIVER", () => {
    const b = udenKommentarer(blokAf("opgaveDokumentDeaktiver"));
    const holdIndeks = b.indexOf("erUndtaget(");
    const skrivIndeks = b.indexOf(".update({ status: \"deaktiveret\"");
    assert.ok(holdIndeks >= 0, "opgaveDokumentDeaktiver tjekker ikke erUndtaget()");
    assert.ok(skrivIndeks > holdIndeks, "legal hold-tjekket ligger EFTER skrivningen, ikke før");
  });

  it("⚠ KALDER ALDRIG file.delete() — blobben består", () => {
    const b = udenKommentarer(blokAf("opgaveDokumentDeaktiver"));
    assert.ok(!/\.delete\(/.test(b));
  });

  it("⚠ KUN opgaveDokumentUploadBekraeft's AFVISNINGSGREN SLETTER EN BLOB", () => {
    const b = udenKommentarer(blokAf("opgaveDokumentUploadBekraeft"));
    const sletninger = [...b.matchAll(/\.delete\(/g)].length;
    assert.equal(sletninger, 1,
      "forventede præcis én file.delete()-forekomst — i afvis(), for en fil der aldrig bestod valideringen");
  });

  it("⚠ EN NY RETENTION-KATEGORI FINDES, IKKE OPDIGTET PERIODE", () => {
    const retentionKilde = readFileSync("src/fleet/retention-regler.js", "utf8");
    assert.match(retentionKilde, /opgaveBilag:\s*\{/);
    const blok = retentionKilde.slice(
      retentionKilde.indexOf("opgaveBilag:"),
      retentionKilde.indexOf("},", retentionKilde.indexOf("opgaveBilag:")));
    assert.match(blok, /periodeMaaneder:\s*null/);
    assert.match(blok, /afgjort:\s*false/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   LEVERANDØRDOKUMENTDOWNLOADLINK — den ENESTE eksterne vej til en fil
   ══════════════════════════════════════════════════════════════════════════ */
describe("leverandoerDokumentDownloadLink — tre uafhængige spærringer", () => {
  it("⚠ KALDER kraevLeverandoerGrant() — SAMME INDGANG SOM RESTEN AF PORTALEN", () => {
    const b = udenKommentarer(blokAf("leverandoerDokumentDownloadLink"));
    assert.match(b, /await kraevLeverandoerGrant\(req\)/);
  });

  it("⚠ DEN AFGØRENDE KONTROL — opgave.leverandoerId SAMMENLIGNES MED GRANTETS leverandoerId", () => {
    const b = udenKommentarer(blokAf("leverandoerDokumentDownloadLink"));
    assert.match(b, /opgave\.leverandoerId !== leverandoerId/);
  });

  it("⚠ KRÆVER BÅDE status \"aktiv\" OG synligForLeverandoer === true — INGEN AF DEM ALENE ER NOK", () => {
    const b = udenKommentarer(blokAf("leverandoerDokumentDownloadLink"));
    assert.match(b, /dok\.status !== "aktiv" \|\| dok\.synligForLeverandoer !== true/);
  });

  it("⚠ INGEN klient-tenantId/leverandoerId BRUGES TIL AT VÆLGE DOKUMENTET — kun opgaveId/dokumentId fra klienten, leverandoerId udelukkende fra grantet", () => {
    const b = udenKommentarer(blokAf("leverandoerDokumentDownloadLink"));
    assert.doesNotMatch(b, /d\.leverandoerId/,
      "funktionen læser tilsyneladende et klient-leveret leverandoerId — det må kun komme fra kraevLeverandoerGrant()");
  });

  it("⚠ SAMME 5-MINUTTERS TTL OG v4/read", () => {
    const b = udenKommentarer(blokAf("leverandoerDokumentDownloadLink"));
    assert.match(b, /TTL_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
    assert.match(b, /version:\s*"v4"/);
    assert.match(b, /action:\s*"read"/);
  });

  it("⚠ LINKET STÅR ALDRIG I AUDITPOSTEN", () => {
    const b = udenKommentarer(blokAf("leverandoerDokumentDownloadLink"));
    const logKald = b.slice(b.indexOf("await logProcure("));
    assert.ok(!/\burl\b/.test(logKald.slice(0, logKald.indexOf(");"))));
  });

  it("⚠ LOGGER MED OBJEKT \"opgaveDokument\" — SAMME OBJEKT SOM DEN INTERNE VEJ, ÉN SAMLET HISTORIK", () => {
    const b = udenKommentarer(blokAf("leverandoerDokumentDownloadLink"));
    assert.match(b, /logProcure\(tenantId, uid, [^,]+, "opgaveDokument"/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   STORAGE RULES — den nye opgave-sti er eksplicit defineret og lukket
   ══════════════════════════════════════════════════════════════════════════ */
describe("storage.rules — opgavedokumenter er eksplicit defineret og lukket, samme som fakturabilag", () => {
  it("⚠ OPGAVEDOKUMENT-STIEN ER EKSPLICIT DEFINERET OG LUKKET", () => {
    assert.match(STORAGE_REGLER,
      /match \/tenants\/\{tenantId\}\/opgaver\/\{opgaveId\}\/dokumenter\/\{dokumentId\}/);
  });

  it("⚠ FAKTURABILAG-STIEN ER STADIG DER, URØRT", () => {
    assert.match(STORAGE_REGLER,
      /match \/tenants\/\{tenantId\}\/fakturaer\/\{fakturaId\}\/dokumenter\/\{dokumentId\}/);
  });

  it("⚠ INGEN sti I FILEN TILLADER read/write UBETINGET (if true)", () => {
    assert.ok(!/if true/.test(STORAGE_REGLER));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SCOPE — F.2 rører kun faktura (uændret) og opgave; sag/procure/mail
   ══════════════════════════════════════════════════════════════════════════ */
describe("F.2 rører ikke det der eksplicit er uden for scope", () => {
  it("⚠ INGEN sag-/procure-/mail-VEDHÆFTNINGSFUNKTION ER TILFØJET", () => {
    assert.ok(!/export const sagDokument|export const procureDokument|export const mailVedhaeft/.test(kilde),
      "en anden dokumenttypes upload/download-funktion er tilføjet — det hører til en senere skive");
  });

  it("⚠ PARENT_KOLLEKTION KENDER PRÆCIS faktura OG opgave — ingen tredje endnu", () => {
    const dokKilde = readFileSync("src/fleet/dokumenter.js", "utf8");
    assert.match(dokKilde, /export const PARENT_KOLLEKTION = \{ faktura: "fakturaer", opgave: "opgaver" \};/);
  });

  it("⚠ opgaver/$opgaveId/dokumenter's parentType ER LÅST TIL \"opgave\"", () => {
    const regler = readFileSync("firebase.rules.json", "utf8");
    assert.match(regler, /newData\.val\(\) === 'opgave'/);
  });
});
