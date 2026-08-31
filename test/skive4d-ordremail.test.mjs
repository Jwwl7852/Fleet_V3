/* test/skive4d-ordremail.test.mjs
 * Skive 4D — Procure outbound ordremail. `ordreMailSend`, genbrug af den
 * delte mailtransport fra Skive 3D, og lukningen af den gamle manuelle
 * "Markér som sendt".
 *
 * Samme metode som test/skive3d-sagmail.test.mjs: at funktionen findes, er
 * ikke det samme som at den håndhæver noget. Punkterne nedenfor matcher
 * brugerens egen nummererede liste (Skive 4D, §15).
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { LOGBARE_FELTER } from "../src/fleet/audit-regler.js";
import { erGyldigtSprog, ALLE_SPROG, STANDARD_SPROG } from "../src/fleet/sprog.js";
import { ORDRE_OVERGANGE, ordreMailIndhold } from "../src/fleet/procure.js";

const kilde = readFileSync("functions/index.js", "utf8");

const blokAf = (navn) => {
  const start = kilde.indexOf(`export const ${navn}`);
  assert.ok(start >= 0, `functions/index.js har ingen ${navn}`);
  const naeste = kilde.indexOf("\nexport const ", start + 1);
  return naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste);
};

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ordreMailSend = blokAf("ordreMailSend");
const b = udenKommentarer(ordreMailSend);

/* ══════════════════════════════════════════════════════════════════════════
   §15.1 — VILKÅRLIG MODTAGER FRA KLIENTEN ER UMULIG
   ══════════════════════════════════════════════════════════════════════════ */
describe("§15.1 — klienten kan ikke sende til en vilkårlig adresse", () => {
  it("⚠ MODTAGEREN LÆSES FRA leverandøren, IKKE FRA KLIENTENS PAYLOAD", () => {
    /* V1-brugertest: to adskilte e-mailformål på leverandøren. Ordren går
       til ordreEmail når den findes, ellers til kontaktEmail — begge felter
       læses fra `lev` (den server-hentede leverandørpost), aldrig fra
       klientens payload. */
    assert.match(b, /const ordreEmail = typeof lev\.ordreEmail === "string"/);
    assert.match(b, /const kontaktEmail = typeof lev\.kontaktEmail === "string"/);
    assert.match(b, /const tilEmail = ordreEmail \|\| kontaktEmail/);
  });

  it("⚠ INGEN to/cc/bcc/adresse/modtager LÆSES FRA req.data NOGEN STEDER", () => {
    for (const felt of ["d.til", "d.to", "d.cc", "d.bcc", "d.modtager", "d.modtagere", "d.adresse", "d.email"]) {
      assert.ok(!b.includes(felt), `${felt} læses fra klientens payload`);
    }
  });

  it("⚠ KLIENTENS KALDSFLADE (godkendelse.js) HAR INTET ADRESSEFELT", () => {
    const godkendelse = readFileSync("src/fleet/godkendelse.js", "utf8");
    const start = godkendelse.indexOf("export async function sendOrdreMail");
    assert.ok(start >= 0, "sendOrdreMail() findes ikke i godkendelse.js");
    const kald = godkendelse.slice(start, start + 500);
    for (const felt of ["til:", "to:", "cc:", "bcc:", "adresse:", "email:", "modtager"]) {
      assert.ok(!kald.includes(felt), `sendOrdreMail() sender ${felt} — en fri adresse`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §15.2 — MANIPULERET ordreId PÅ EN ANDEN TENANT AFVISES
   ══════════════════════════════════════════════════════════════════════════ */
describe("§15.2 — ordreId er tenant-scopet, ikke global", () => {
  it("⚠ ORDREN HENTES UNDER DEN TENANT-SCOPEDE rod, ALDRIG VED ET GLOBALT OPSLAG", () => {
    assert.match(b, /const snap = await rod\.child\(`indkoebsordrer\/\$\{ordreId\}`\)\.once\("value"\)/);
  });

  it("⚠ EN ORDRE DER IKKE FINDES (i DENNE tenant) GIVER not-found", () => {
    assert.match(b, /if \(!snap\.exists\(\)\) throw new HttpsError\("not-found"/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §15.3 — MANIPULERET LEVERANDØRRELATION AFVISES
   ══════════════════════════════════════════════════════════════════════════ */
describe("§15.3 — leverandøren hentes fra ordrens EGEN leverandoerId, samme tenant", () => {
  it("⚠ LEVERANDØREN SLÅS OP VIA ordre.leverandoerId, IKKE VIA ET KLIENTFELT", () => {
    assert.match(b, /const lev = \(await rod\.child\(`leverandoerer\/\$\{ordre\.leverandoerId\}`\)\.once\("value"\)\)\.val\(\)/);
  });

  it("⚠ EN MANGLENDE LEVERANDØR (fx et forkert id) AFVISES", () => {
    assert.match(b, /if \(!lev\) throw new HttpsError\("failed-precondition"/);
  });

  it("⚠ INGEN d.leverandoerId LÆSES NOGEN STEDER — relationen kommer kun fra ordren selv", () => {
    assert.ok(!b.includes("d.leverandoerId"), "leverandørrelationen kan overstyres af klienten");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §15.4 — MANGLENDE PERMISSION AFVISES
   ══════════════════════════════════════════════════════════════════════════ */
describe("§15.4 — kræver indkoeb.skriv", () => {
  it('⚠ perms.includes("|indkoeb.skriv|") TJEKKES FØR NOGET ANDET LÆSES', () => {
    assert.ok(ordreMailSend.includes('perms.includes("|indkoeb.skriv|")'));
  });

  it("⚠ SAMME PERMISSION SOM DEN NU FJERNEDE \"MARKÉR SOM SENDT\" — ikke en ny opfundet", () => {
    /* Ingen anden transition i tabellen brugte en anden permission til at nå
       "sendt" — der er intet at sammenligne med i selve tabellen længere
       (se §15.6), så påstanden prøves i stedet direkte mod kildeteksten. */
    assert.match(b, /Du må ikke sende ordren\. Det kræver indkoeb\.skriv\./);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §15.5/§15.6 — GODKENDELSE OG STATUS ER SERVER-VERIFICERET
   ══════════════════════════════════════════════════════════════════════════ */
describe("§15.5/§15.6 — en ordre kan kun sendes fra status \"godkendt\"", () => {
  it('⚠ ordre.status !== "godkendt" AFVISES MED failed-precondition', () => {
    assert.match(b, /if \(ordre\.status !== "godkendt"\) \{[\s\S]{0,160}failed-precondition/);
  });

  it("⚠ \"SEND ORDRE\" STÅR IKKE I ORDRE_OVERGANGE — kan ikke nås som en generisk overgang", () => {
    /* Se procure.js's egen note ved ORDRE_OVERGANGE.godkendt: fjernet med
       vilje i Skive 4D, netop for at et menneske ikke længere kan klikke
       ordren i "sendt" uden en reel afsendelse bag. */
    const godkendtOverg = ORDRE_OVERGANGE.godkendt.map((o) => o.til);
    assert.ok(!godkendtOverg.includes("sendt"),
      "sendt kan stadig nås via den generiske ordrestatus/kanSkifteIndkoebsordre-vej");
  });

  it("⚠ EN ORDRE DER KRÆVER GODKENDELSE, KAN IKKE STÅ I \"godkendt\" UDEN AT VÆRE GODKENDT — status ER beviset, ingen selvstændig genberegning her", () => {
    assert.ok(!b.includes("kraeverGodkendelse("),
      "ordreMailSend genberegner godkendelseskravet — status alene burde være nok");
  });

  it("⚠ STATUS KOMMER FRA DEN SERVER-HENTEDE ordre, ALDRIG FRA req.data", () => {
    assert.ok(!/d\.status/.test(b), "status kan overstyres af klienten");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §15.7 — SERVEREN BRUGER DE FAKTISKE ORDRELINJER
   ══════════════════════════════════════════════════════════════════════════ */
describe("§15.7 — mailindholdet bygges af den server-hentede ordre", () => {
  it("⚠ ordreMailIndhold() KALDES MED DEN SERVER-HENTEDE ordre, IKKE ET KLIENTOBJEKT", () => {
    assert.match(b, /ordreMailIndhold\(ordre, \{ leverandoer: lev, sprog \}\)/);
  });

  it("⚠ INGEN d.linjer/d.ordrelinjer/d.varer LÆSES NOGEN STEDER", () => {
    for (const felt of ["d.linjer", "d.ordrelinjer", "d.varer", "d.beloeb", "d.sum"]) {
      assert.ok(!b.includes(felt), `${felt} læses fra klientens payload — ordren er ikke længere kilden`);
    }
  });

  it("⚠ ordreMailIndhold() ER EN REN FUNKTION DER IKKE GÆTTER EN PRIS", () => {
    const ordre = { nummer: "BST-2026-00001", linjer: { l1: { vare: "Skruer", antal: 10 } } };
    const indhold = ordreMailIndhold(ordre, { leverandoer: { navn: "Test A/S", kontaktEmail: "t@a.dk" }, sprog: "da" });
    assert.match(indhold.brodtekst, /pris ikke oplyst/);
    assert.ok(!indhold.brodtekst.includes("0,00 kr."), "en linje uden pris skriver 0,00 — et løfte om en gratis vare");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §15.8 — IDEMPOTENS: HØJST ÉN MAIL PR. sendRequestId
   ══════════════════════════════════════════════════════════════════════════ */
describe("§15.8 — højst én mail pr. sendRequestId", () => {
  it("⚠ sendRequestId ER NØGLEN UNDER ORDREN, IKKE ET FELT I EN NY POST", () => {
    assert.match(b, /indkoebsordrer\/\$\{ordreId\}\/mail\/\$\{sendRequestId\}/);
  });

  it("⚠ RESERVATIONEN SKER VIA .transaction() MED ET ABORT-UDFALD", () => {
    assert.match(b, /mailRef\.transaction\(\(cur\) => \(cur === null \? foreloebig : undefined\)\)/);
  });

  it("⚠ EN REPLAY RETURNERER FØR sendMail() KALDES", () => {
    const foerReplay = b.indexOf("if (!trans.committed)");
    const returnI = b.indexOf("return {", foerReplay);
    const foersteSendMail = b.indexOf("sendMail(MAIL_ADAPTER");
    assert.ok(foerReplay >= 0 && returnI > foerReplay, "replay-grenen findes ikke");
    assert.ok(foersteSendMail > returnI, "sendMail() kaldes før replay-tjekket kan returnere");
  });

  it("⚠ ÉT ENKELT sendMail(MAIL_ADAPTER, ...)-KALD I HELE FUNKTIONEN", () => {
    const forekomster = (ordreMailSend.match(/sendMail\(MAIL_ADAPTER/g) || []).length;
    assert.equal(forekomster, 1, "sendMail() kaldes fra mere end ét sted");
  });

  it("⚠ erGyldigtSendRequestId() VALIDERER FORMEN FØR NØGLEN BRUGES", () => {
    assert.ok(ordreMailSend.includes("erGyldigtSendRequestId("));
  });

  it("⚠ RATE LIMIT GENBRUGER tjekOgOptaelMailRate() — INGEN PROCURE-EGEN TÆLLER", () => {
    assert.ok(ordreMailSend.includes("tjekOgOptaelMailRate(rod, uid)"));
    assert.ok(!/ordreRate|procureRate|indkoebRate/i.test(ordreMailSend),
      "der er indført en Procure-specifik rate-limit-variant");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §15.9 — EN MAILGUN-FEJL GIVER "fejlet", ALDRIG "accepteret" — OG ORDRENS
   STATUS RØRER SIG IKKE VED EN FEJL
   ══════════════════════════════════════════════════════════════════════════ */
describe('§15.9 — en fejlet afsendelse giver "fejlet", ordren beholder sin status', () => {
  it('⚠ KUN status === "accepteret" SÆTTER ORDRENS status TIL "sendt"', () => {
    assert.match(b, /if \(resultat\.status === "accepteret"\) \{[\s\S]{0,400}ordreOpdatering\(ordre, "sendt"/);
  });

  it('⚠ EN FEJLET AFSENDELSE KASTER "internal" — DEN RETURNERER IKKE ET STILLE ok:true', () => {
    assert.match(b, /if \(resultat\.status === "fejlet"\) \{[\s\S]{0,160}throw new HttpsError\("internal"/);
  });

  it("⚠ ordreOpdatering(ordre, \"sendt\", …) KALDES PRÆCIS ÉN GANG, KUN I accepteret-GRENEN", () => {
    const forekomster = (b.match(/ordreOpdatering\(ordre, "sendt"/g) || []).length;
    assert.equal(forekomster, 1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §15.10 — AUDIT INDEHOLDER IKKE HELE BRØDTEKSTEN
   ══════════════════════════════════════════════════════════════════════════ */
describe("§15.10 — audit uden ordretekst eller signeret URL", () => {
  it("⚠ logProcure() KALDES UBETINGET", () => {
    assert.ok(ordreMailSend.includes("logProcure("));
  });

  it("⚠ AUDIT-KALDENE INDEHOLDER HVERKEN tekst ELLER emne", () => {
    for (const kald of b.match(/logProcure\([^;]*\);/gs) || []) {
      assert.ok(!/\btekst\b/.test(kald), "brødteksten sendes med i et audit-kald");
      assert.ok(!/\bemne\b/.test(kald), "emnet sendes med i et audit-kald");
      assert.ok(!/\bindhold\b/.test(kald), "det bygde mailindhold sendes med i et audit-kald");
    }
    assert.ok((b.match(/logProcure\(/g) || []).length >= 1, "der er intet audit-kald at prøve");
  });

  it("⚠ mailStatus OG leverandoerId STÅR PÅ LOGBARE_FELTER — kontrollerede felter, ikke fritekst", () => {
    assert.ok(LOGBARE_FELTER.has("mailStatus"));
    assert.ok(LOGBARE_FELTER.has("leverandoerId"));
  });

  it("⚠ ET RATE-LIMIT-AFSLAG LOGGES OGSÅ", () => {
    assert.match(b, /logProcure\([\s\S]{0,160}rate limit/i);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §15.11/§15.12/§15.13 — SPROG: KUN da/sv/en, LEVERANDØRENS STANDARD,
   OG EN OVERSTYRING DER IKKE NØDVENDIGVIS ÆNDRER DEN
   ══════════════════════════════════════════════════════════════════════════ */
describe("§15.11 — kun da/sv/en accepteres som sprog", () => {
  it("⚠ ET UGYLDIGT KLIENT-SPROG AFVISES MED invalid-argument", () => {
    assert.match(b, /if \(sprogOenske && !erGyldigtSprog\(sprogOenske\)\) \{[\s\S]{0,120}invalid-argument/);
  });

  it("⚠ ERGYLDIGTSPROG() KENDER PRÆCIS TRE SPROG", () => {
    assert.deepEqual(ALLE_SPROG.sort(), ["da", "en", "sv"]);
    assert.equal(erGyldigtSprog("da"), true);
    assert.equal(erGyldigtSprog("de"), false);
    assert.equal(erGyldigtSprog(""), false);
    assert.equal(erGyldigtSprog(undefined), false);
  });
});

describe("§15.12 — leverandørens gemte standard bruges når mailen ikke selv vælger et sprog", () => {
  it("⚠ SPROGET FALDER TILBAGE TIL lev.sprog, SÅ TIL STANDARD_SPROG — ALDRIG BROWSERENS LOCALE", () => {
    assert.match(b, /const sprog = sprogOenske \|\| \(erGyldigtSprog\(lev\.sprog\) \? lev\.sprog : STANDARD_SPROG\)/);
    assert.ok(!/navigator\.language|Intl\.|Accept-Language/i.test(kilde.slice(kilde.indexOf("export const ordreMailSend"), kilde.indexOf("export const ordreMailSend") + 4000)),
      "sproget afledes af noget browser-agtigt");
  });

  it("⚠ STANDARD_SPROG ER \"da\" — EN EKSPLICIT KONSTANT, IKKE EN GÆTNING", () => {
    assert.equal(STANDARD_SPROG, "da");
  });
});

describe("§15.13 — en override for ÉN mail ændrer ikke leverandørens gemte standard", () => {
  it("⚠ ordreMailSend SKRIVER ALDRIG TIL leverandoerer/…/sprog", () => {
    assert.ok(!/leverandoerer\/[^"'`]*sprog/.test(b),
      "ordreMailSend rører leverandørens gemte sprog-standard");
    assert.ok(!/\.update\(\{[^}]*sprog/.test(b),
      "der skrives et sprog-felt et sted der ikke er selve mail-posten");
  });

  it("⚠ leverandoerer.js SKRIVER ET EKSPLICIT sprog VED HVER GEM — ALDRIG UDLEDT AF BROWSEREN", () => {
    const leverandoerer = readFileSync("src/fleet/leverandoerer.js", "utf8");
    assert.match(leverandoerer, /sprog: ALLE_SPROG\.includes\(post\.sprog\) \? post\.sprog : STANDARD_SPROG/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §15.14/§15.15 — EKSISTERENDE SUITER FORBLIVER GRØNNE (bevist ved at HELE
   npm test-kørslen, der dækker denne fil, er grøn — se rapporten)
   ══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   HEADER-INJEKTION — samme værn som sagMailSend (Gate A punkt 6)
   ══════════════════════════════════════════════════════════════════════════ */
describe("Emnet går gennem samme sanering som sagMailSend", () => {
  it("⚠ saniterHeaderFelt() KALDES PÅ indhold.emne", () => {
    assert.match(b, /const emne = saniterHeaderFelt\(indhold\.emne, 250\)/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   GENBRUG AF DEN DELTE MAILTRANSPORT — INGEN PROCURE-SPECIFIK TRANSPORT
   ══════════════════════════════════════════════════════════════════════════ */
describe("Genbrug af Skive 3D's mailtransport — ingen Procure-egen transport", () => {
  it("⚠ ordreMailSend BRUGER SAMME MAIL_ADAPTER-KONSTANT SOM sagMailSend", () => {
    assert.ok(ordreMailSend.includes("sendMail(MAIL_ADAPTER"));
  });

  const finderAlleFiler = (dir, ud = []) => {
    for (const navn of readdirSync(dir)) {
      const sti = join(dir, navn);
      if (statSync(sti).isDirectory()) finderAlleFiler(sti, ud);
      else if (/\.(js|jsx)$/.test(navn)) ud.push(sti);
    }
    return ud;
  };

  it("⚠ INGEN FIL UNDER src/moduler/indkoeb/ NÆVNER EN MAILUDBYDER VED NAVN", () => {
    const filer = finderAlleFiler("src/moduler/indkoeb");
    for (const sti of filer) {
      const tekst = readFileSync(sti, "utf8");
      assert.ok(!/sendgrid|nodemailer|postmark|mailgun|resend\.com/i.test(tekst),
        `${sti} nævner en provider ved navn — det hører i functions/mail/adapters/`);
    }
  });

  it("⚠ src/fleet/procure.js IMPORTERER STADIG INGEN FIREBASE — kun sprog.js", () => {
    const procure = readFileSync("src/fleet/procure.js", "utf8");
    const imports = [...procure.matchAll(/^import .*$/gm)].map((m) => m[0]);
    for (const linje of imports) {
      assert.ok(!/firebase/i.test(linje), `procure.js importerer ${linje}`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §13 — INGEN VEDHÆFTNINGER I 4D
   ══════════════════════════════════════════════════════════════════════════ */
describe("§13 — ingen vedhæftninger", () => {
  it("⚠ ordreMailSend NÆVNER INGEN VEDHÆFTNING/PDF/FIL", () => {
    assert.ok(!/vedhaeftning|attachment|\bpdf\b|dokumentId/i.test(b),
      "ordreMailSend rører en vedhæftning — 4D er ren HTML/tekst, ingen fil");
  });

  it("⚠ Send ordre-DIALOGEN HAR INGEN FIL-INPUT", () => {
    const godkendelser = readFileSync("src/moduler/indkoeb/Godkendelser.jsx", "utf8");
    const start = godkendelser.indexOf("function SendOrdreDialog");
    assert.ok(start >= 0, "SendOrdreDialog findes ikke");
    const dialog = godkendelser.slice(start);
    assert.ok(!/type="file"/.test(dialog), "Send ordre-dialogen har et filfelt");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SAND STATUS — "accepteret til afsendelse", ALDRIG "leveret"
   ══════════════════════════════════════════════════════════════════════════ */
describe("⚠ UI'ET PÅSTÅR ALDRIG \"LEVERET\"", () => {
  it("⚠ SendOrdreDialog SKRIVER \"ACCEPTERET TIL AFSENDELSE\", IKKE \"LEVERET\"", () => {
    const godkendelser = readFileSync("src/moduler/indkoeb/Godkendelser.jsx", "utf8");
    assert.match(godkendelser, /Ordren er accepteret til afsendelse/);
    assert.ok(!/[Ll]everet/.test(godkendelser), "skærmen påstår at ordren er leveret");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   KOBLINGEN TIL SKIVE 4C — DOKUMENTLAGERET RØRES IKKE
   ══════════════════════════════════════════════════════════════════════════ */
describe("⚠ 4C's DOKUMENTLAGER OG 4D's MAIL ER IKKE KOBLET", () => {
  it("⚠ ordreMailSend IMPORTERER INTET FRA dokumenter.js OG KALDER INGEN dokument*-FUNKTION", () => {
    assert.ok(!/dokumentUploadInitier|dokumentUploadBekraeft|dokumentDownloadLink|from ".\/delt\/dokumenter\.js"/.test(kilde.slice(
      kilde.indexOf("export const ordreMailSend"), kilde.indexOf("export const ordreMailSend") + 6000
    )));
  });
});
