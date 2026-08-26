/* test/skive3d-sagmail.test.mjs
 * Skive 3D — den delte udgående mail-transport og sagMailSend.
 *
 * Samme metode som test/sager-funktioner.test.mjs's "HÅNDHÆVELSEN"-afsnit:
 * at funktionen findes, er ikke det samme som at den håndhæver noget. Hver
 * test her læses mod Gate A i docs/security-compliance/08_EMAIL_SECURITY_
 * GATE.md og 12_FINDINGS_AND_REMEDIATION_PLAN.md — punktnumrene i
 * beskrivelserne nedenfor matcher punkterne dér.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { sendMail } from "../functions/mail/transport.js";
import { LOGBARE_FELTER } from "../src/fleet/audit-regler.js";
import {
  saniterHeaderFelt, erGyldigtSendRequestId, valideEmne, valideTekst,
} from "../src/fleet/mailtransport.js";

const kilde = readFileSync("functions/index.js", "utf8");

const blokAf = (navn) => {
  const start = kilde.indexOf(`export const ${navn}`);
  assert.ok(start >= 0, `functions/index.js har ingen ${navn}`);
  const naeste = kilde.indexOf("\nexport const ", start + 1);
  return naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste);
};

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sagMailSend = blokAf("sagMailSend");

/* ══════════════════════════════════════════════════════════════════════════
   GATE A, PUNKT 1 — MODTAGEREN OPLØSES SERVER-SIDE
   ══════════════════════════════════════════════════════════════════════════ */
describe("Gate A punkt 1 — klienten kan ikke sende til en vilkårlig adresse", () => {
  it("⚠ MODTAGEREN LÆSES FRA sag.parter[partId], IKKE FRA KLIENTENS PAYLOAD", () => {
    const b = udenKommentarer(sagMailSend);
    assert.match(b, /const til = sag\.parter\?\.\[partId\]/);
  });

  it("⚠ INGEN to/cc/bcc/modtager LÆSES FRA req.data NOGEN STEDER", () => {
    /* Uden kommentarer — filens egen dokumentation af hvad den IKKE gør,
       citerer nødvendigvis de forbudte feltnavne. */
    const b = udenKommentarer(sagMailSend);
    for (const felt of ["d.til", "d.to", "d.cc", "d.bcc", "d.modtager", "d.modtagere"]) {
      assert.ok(!b.includes(felt), `${felt} læses fra klientens payload`);
    }
  });

  it("⚠ ET MANIPULERET partId AFVISES — invalid-argument, ikke stille ignoreret", () => {
    const b = udenKommentarer(sagMailSend);
    assert.match(b, /if \(!til\) \{[\s\S]{0,120}invalid-argument/);
  });

  it("⚠ KLIENTEN VÆLGER KUN partId — kaldsfladen i sagplan.js har intet adressefelt", () => {
    const sagplan = readFileSync("src/fleet/sagplan.js", "utf8");
    const start = sagplan.indexOf("export const sendMail");
    assert.ok(start >= 0, "sendMail() findes ikke i sagplan.js");
    const kald = sagplan.slice(start, start + 400);
    assert.ok(kald.includes("partId"), "sendMail() i sagplan.js sender ikke partId med");
    for (const felt of ["til:", "to:", "cc:", "bcc:", "adresse:"]) {
      assert.ok(!kald.includes(felt), `sagplan.js's sendMail() sender ${felt} — en fri adresse`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   GATE A, PUNKT 2 — INGEN PROVIDER-HEMMELIGHED I KLIENTEN
   ══════════════════════════════════════════════════════════════════════════ */
describe("Gate A punkt 2 — ingen provider-secret/transport i klientbundlen", () => {
  const finderAlleFiler = (dir, ud = []) => {
    for (const navn of readdirSync(dir)) {
      const sti = join(dir, navn);
      if (statSync(sti).isDirectory()) finderAlleFiler(sti, ud);
      else if (/\.(js|jsx)$/.test(navn)) ud.push(sti);
    }
    return ud;
  };

  it("⚠ INGEN FIL UNDER src/ IMPORTERER functions/mail/", () => {
    const filer = finderAlleFiler("src");
    for (const sti of filer) {
      const tekst = readFileSync(sti, "utf8");
      assert.ok(!/from\s+["'].*functions\/mail\//.test(tekst),
        `${sti} importerer functions/mail/ — transporten hører kun server-side`);
    }
  });

  it("⚠ functions/mail/transport.js OG dets adaptere IMPORTERER INGEN firebase-klient-SDK", () => {
    const transport = readFileSync("functions/mail/transport.js", "utf8");
    assert.ok(!transport.includes("firebase/app") && !transport.includes("../../src/"),
      "transportlaget trækker ind fra klientkoden");
  });

  it("⚠ SagsvisningIndhold ER REN VISNING — kalder sendMail() via sagplan.js, aldrig direkte mod en provider", () => {
    const sagsvisning = readFileSync("src/fleet/Sagsvisning.jsx", "utf8");
    assert.ok(sagsvisning.includes('from "./sagplan.js"'));
    assert.ok(!/sendgrid|nodemailer|postmark|mailgun|resend\.com/i.test(sagsvisning),
      "Sagsvisning.jsx nævner en provider ved navn — det hører i functions/mail/adapters/");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   GATE A, PUNKT 3 — PERMISSION + PUNKT 4 — TENANT/SAGSTILSTAND
   ══════════════════════════════════════════════════════════════════════════ */
describe("Gate A punkt 3/4 — permission, tenant og sagstilstand", () => {
  it("⚠ KRÆVER sag.mailSend — EGEN PERMISSION, IKKE sag.skriv", () => {
    assert.ok(sagMailSend.includes('perms.includes("|sag.mailSend|")'));
  });

  it("⚠ TENANT KOMMER FRA auth.token, ALDRIG FRA req.data", () => {
    const b = udenKommentarer(sagMailSend);
    assert.match(b, /const tenantId = auth\.token\?\.tenant/);
    assert.ok(!/tenantId\s*=\s*(d|req\.data)\./.test(b), "tenantId tages fra klienten");
  });

  it("⚠ TENANT/ABONNEMENT/EKSISTENS-TJEKKET ER DET SAMME SOM DE ANDRE FEM sag*-FUNKTIONER", () => {
    assert.ok(sagMailSend.includes('rod.child("_findes")'));
    assert.ok(sagMailSend.includes("abonnement/status"));
  });

  it("⚠ SAGEN GENHENTES SERVER-SIDE FRA DEN TENANT-SCOPEDE rod — ikke antaget fra klientens payload", () => {
    const b = udenKommentarer(sagMailSend);
    assert.match(b, /const sag = \(await rod\.child\(`sager\/\$\{sagId\}`\)\.once\("value"\)\)\.val\(\)/);
  });

  it("⚠ EN AFSLUTTET SAG AFVISES — ingen ny mail på en lukket sag", () => {
    const b = udenKommentarer(sagMailSend);
    assert.match(b, /sag\.tilstand === "afsluttet"/);
    assert.match(b, /failed-precondition/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   GATE A, PUNKT 5 — AUDIT, UBETINGET, UDEN BRØDTEKST
   ══════════════════════════════════════════════════════════════════════════ */
describe("Gate A punkt 5 — audit uden unødig kopi af mailens indhold", () => {
  it("⚠ logSager() KALDES — samme funktion som de fem andre sag*-funktioner", () => {
    assert.ok(sagMailSend.includes("logSager("));
  });

  it("⚠ AUDIT-KALDET INDEHOLDER HVERKEN emne ELLER tekst", () => {
    const kald = udenKommentarer(sagMailSend).match(/logSager\([^;]*\);/s)?.[0] || "";
    assert.ok(kald.length > 0, "logSager-kaldet blev ikke fundet");
    assert.ok(!/\btekst\b/.test(kald), "brødteksten sendes med i audit-kaldet");
    assert.ok(!/\bemne\b/.test(kald), "emnet sendes med i audit-kaldet");
  });

  it("⚠ mailStatus OG partId STÅR PÅ LOGBARE_FELTER — kontrollerede felter, ikke fritekst", () => {
    assert.ok(LOGBARE_FELTER.has("mailStatus"));
    assert.ok(LOGBARE_FELTER.has("partId"));
  });

  it("⚠ ET RATE-LIMIT-AFSLAG LOGGES OGSÅ — en afvisning er en hændelse", () => {
    const b = udenKommentarer(sagMailSend);
    assert.match(b, /logSager\([\s\S]{0,120}rate limit/i);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   GATE A, PUNKT 6 — HEADER-INJEKTION
   ══════════════════════════════════════════════════════════════════════════ */
describe("Gate A punkt 6 — header-injektion afvises", () => {
  it("⚠ EMNET GÅR GENNEM saniterHeaderFelt() FØR DET FORLADER FUNKTIONEN", () => {
    assert.ok(sagMailSend.includes("saniterHeaderFelt("));
  });

  it("⚠ saniterHeaderFelt() FJERNER RENT FAKTISK CR/LF", () => {
    /* Selve saneringsfunktionen prøvet direkte — ikke kun at den KALDES. */
    const injiceret = "Almindeligt emne\r\nBcc: nogen@evil.dk";
    const renset = saniterHeaderFelt(injiceret, 250);
    assert.ok(!/[\r\n]/.test(renset), "linjeskift overlever saniteringen");
    assert.ok(!renset.includes("Bcc:") || renset === "Almindeligt emne Bcc: nogen@evil.dk",
      "det injicerede felt er stadig en SAMMENHÆNGENDE tekst, ikke en ekstra header-linje");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   GATE A, PUNKT 7 — IDEMPOTENS / DOBBELT-SEND-BESKYTTELSE
   ══════════════════════════════════════════════════════════════════════════ */
describe("Gate A punkt 7 — højst én mail pr. sendRequestId", () => {
  it("⚠ sendRequestId ER RTDB-NØGLEN — samme mønster som statushaendelsers klientId", () => {
    const b = udenKommentarer(sagMailSend);
    assert.match(b, /beskeder\/\$\{sendRequestId\}/);
  });

  it("⚠ RESERVATIONEN SKER VIA .transaction() MED ET ABORT-UDFALD — ikke et rent set()", () => {
    const b = udenKommentarer(sagMailSend);
    assert.match(b, /beskedRef\.transaction\(\(cur\) => \(cur === null \? foreloebig : undefined\)\)/);
  });

  it("⚠ EN REPLAY (allerede committed === false) RETURNERER UDEN AT KALDE sendMail() IGEN", () => {
    const b = udenKommentarer(sagMailSend);
    const foerReplay = b.indexOf("if (!trans.committed)");
    const returnI = b.indexOf("return {", foerReplay);
    const foersteSendMail = b.indexOf("sendMail(MAIL_ADAPTER");
    assert.ok(foerReplay >= 0 && returnI > foerReplay, "replay-grenen findes ikke");
    assert.ok(foersteSendMail > returnI,
      "sendMail() kaldes FØR replay-tjekket har haft mulighed for at returnere");
  });

  it("⚠ ÉT ENKELT sendMail(MAIL_ADAPTER, ...)-KALD I HELE FUNKTIONEN", () => {
    const forekomster = (sagMailSend.match(/sendMail\(MAIL_ADAPTER/g) || []).length;
    assert.equal(forekomster, 1, "sendMail() kaldes fra mere end ét sted");
  });

  it("⚠ erGyldigtSendRequestId() VALIDERER FORMEN FØR NØGLEN BRUGES", () => {
    assert.ok(sagMailSend.includes("erGyldigtSendRequestId("));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   RATE LIMITING — SERVER-SIDE, EFTER RESERVATIONEN
   ══════════════════════════════════════════════════════════════════════════ */
describe("Rate limiting håndhæves server-side, ikke klientside", () => {
  it("⚠ tjekOgOptaelMailRate() BRUGER EN RTDB .transaction() — ATOMISK, IKKE LÆS-OG-SKRIV", () => {
    const start = kilde.indexOf("async function tjekOgOptaelMailRate");
    assert.ok(start >= 0, "tjekOgOptaelMailRate findes ikke");
    const slut = kilde.indexOf("\n}", start);
    const b = udenKommentarer(kilde.slice(start, slut));
    assert.ok(b.includes(".transaction("), "raten tælles ikke atomisk");
  });

  it("⚠ ET OVERSKREDET LOFT AFVISER MED resource-exhausted OG MARKERER POSTEN fejlet", () => {
    const b = udenKommentarer(sagMailSend);
    assert.match(b, /resource-exhausted/);
    assert.match(b, /mailStatus:\s*"fejlet"/);
  });

  it("⚠ INGEN KLIENTLEVERET RATE-LIMIT-VÆRDI PÅVIRKER TJEKKET", () => {
    const b = udenKommentarer(sagMailSend);
    assert.ok(!/d\.rate|d\.graense|req\.data\.rate/.test(b),
      "raten kan påvirkes af klientens payload");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   PROVIDER-FEJL BLIVER TIL "fejlet", ALDRIG TIL "sendt"
   ══════════════════════════════════════════════════════════════════════════ */
describe("functions/mail/transport.js — sendMail() lyver ikke om en fejl", () => {
  it("⚠ EN KASTENDE ADAPTER BLIVER TIL status: \"fejlet\", IKKE EN UHÅNDTERET FEJL", async () => {
    const kasterAdapter = { send: async () => { throw new Error("Udbyderen svarede 500."); } };
    const res = await sendMail(kasterAdapter, { til: "x@y.dk", emne: "E", tekst: "T" });
    assert.equal(res.status, "fejlet");
    assert.ok(res.fejlAarsag.includes("500"));
  });

  it("⚠ EN ADAPTER DER LYKKES, BLIVER TIL \"accepteret\" — ALDRIG \"sendt\" ELLER \"leveret\"", async () => {
    const okAdapter = { send: async () => ({ providerId: "msg-123" }) };
    const res = await sendMail(okAdapter, { til: "x@y.dk", emne: "E", tekst: "T" });
    assert.equal(res.status, "accepteret");
    assert.equal(res.providerId, "msg-123");
  });

  it("⚠ INGEN ADAPTER (undefined/null) FEJLER OGSÅ RENT — ingen unhandled exception", async () => {
    const res = await sendMail(null, { til: "x@y.dk", emne: "E", tekst: "T" });
    assert.equal(res.status, "fejlet");
  });

  it("⚠ ikkeKonfigureretAdapter KASTER ALTID — den er standarden indtil en udbyder er valgt", async () => {
    const { ikkeKonfigureretAdapter } = await import("../functions/mail/adapters/ikkeKonfigureret.js");
    const res = await sendMail(ikkeKonfigureretAdapter, { til: "x@y.dk", emne: "E", tekst: "T" });
    assert.equal(res.status, "fejlet");
    assert.match(res.fejlAarsag, /ikke.*valgt|08_EMAIL_SECURITY_GATE/i);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   OVERLANGE/UGYLDIGE PAYLOADS AFVISES
   ══════════════════════════════════════════════════════════════════════════ */
describe("Ugyldige/overlange payloads afvises — samme grænser klient og server ser", () => {
  it("⚠ TOMT/KUN-WHITESPACE EMNE OG TEKST GIVER null", () => {
    assert.equal(valideEmne("   "), null);
    assert.equal(valideTekst(""), null);
  });

  it("⚠ FOR LANGT EMNE/TEKST AFVISES", () => {
    assert.equal(valideEmne("x".repeat(251)), null);
    assert.equal(valideTekst("x".repeat(10001)), null);
    assert.ok(valideEmne("x".repeat(250)));
    assert.ok(valideTekst("x".repeat(10000)));
  });

  it("⚠ erGyldigtSendRequestId() AFVISER RTDB-FORBUDTE TEGN OG TOMT/FOR LANGT", () => {
    assert.equal(erGyldigtSendRequestId(""), false);
    assert.equal(erGyldigtSendRequestId("x".repeat(61)), false);
    assert.equal(erGyldigtSendRequestId("has/slash"), false);
    assert.equal(erGyldigtSendRequestId("has.dot"), false);
    assert.equal(erGyldigtSendRequestId("has#hash"), false);
    assert.equal(erGyldigtSendRequestId("almindelig-uuid-1234"), true);
  });

  it("⚠ sagMailSend BRUGER valideEmne/valideTekst/erGyldigtSendRequestId — IKKE EGNE, AFVIGENDE GRÆNSER", () => {
    assert.ok(sagMailSend.includes("valideEmne("));
    assert.ok(sagMailSend.includes("valideTekst("));
    assert.ok(sagMailSend.includes("erGyldigtSendRequestId("));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   KANAL: "mail" KAN IKKE FORFALSKES AF EN KLIENT
   ══════════════════════════════════════════════════════════════════════════ */
describe("⚠ EN KLIENT KAN IKKE FORFALSKE EN \"SENDT MAIL\" DIREKTE I RTDB", () => {
  it("firebase.rules.json's beskeder/$id kræver kanal === \"internNote\" for enhver DIREKTE klientskrivning", () => {
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8")
        .replace(/^﻿/, "")
        .replace(/^\s*\/\/.*$/gm, ""));
    const besked = regler.rules.tenants.$tenantId.sensitive.sager.$sagId.beskeder.$id;
    assert.match(besked[".validate"], /kanal'\)\.val\(\) === 'internNote'/,
      "en klient med sag.skriv+sag.sensitiveLaes kan skrive kanal: \"mail\" direkte — " +
      "det ville forfalske en sendt mail uden om sagMailSend");
  });

  it("⚠ sagBeskedSkriv SKRIVER EKSPLICIT kanal: \"internNote\" — den eneste kanal en klient nogensinde kan nå", () => {
    const sagBeskedSkriv = blokAf("sagBeskedSkriv");
    assert.match(udenKommentarer(sagBeskedSkriv), /kanal:\s*KANAL\.internNote/);
  });
});
