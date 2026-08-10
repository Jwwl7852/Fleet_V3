/* test/regler-drift.test.mjs
 * At de UDRULLEDE regler er den samme fil som firebase.rules.json.
 *
 * ⚠ HVORFOR DEN HER TEST FINDES: de var det ikke, og ingen opdagede det.
 *
 * DEV kørte en ældre version med en `.read` på `tenants/$tenantId`. Den
 * kaskaderer ned over alt, og et strammere barn kan ikke tilbagekalde den —
 * så hele klassificeringen fra beslutning 17 var væk. En chauffør uden
 * personale.sensitiveLaes kunne læse sensitive/personale.
 *
 * De 591 øvrige prøver kører mod emulatoren med den LOKALE fil. De havde ret
 * hele tiden, og de kunne ikke have fanget det. Prøverne her dækker
 * sammenligningen; selve tjekket mod databasen kræver netværk og en nøgle og
 * ligger derfor i `npm run regler:tjek`.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { sammenlignRegler, rapport, NOEGLEFIL, REGELFIL } from "../scripts/tjek-regler.mjs";
import { NOEGLEFIL as PROV_NOEGLEFIL } from "../scripts/provisioner-dev.mjs";

describe("Sammenligningen af regler", () => {
  it("kalder to ens filer ens", () => {
    const t = '{\n  "rules": {\n    ".read": false\n  }\n}\n';
    const r = sammenlignRegler(t, t);
    assert.equal(r.ens, true);
    assert.equal(r.foersteAfvigelse, null);
  });

  /* Uden det ville en frisk klon på Windows fejle falsk: git kan give CRLF i
     arbejdskopien, mens Firebase returnerer LF. En vagt der råber ved hver
     klon, bliver slået fra. */
  it("er ligeglad med CRLF kontra LF", () => {
    const lf = '{\n  "rules": {}\n}\n';
    assert.equal(sammenlignRegler(lf.replace(/\n/g, "\r\n"), lf).ens, true);
  });

  it("peger på den første afvigende linje, med begge sider", () => {
    const a = 'linje1\n".read": false\nlinje3\n';
    const b = 'linje1\n".read": true\nlinje3\n';
    const r = sammenlignRegler(a, b);
    assert.equal(r.ens, false);
    assert.equal(r.foersteAfvigelse.nr, 2);
    assert.match(r.foersteAfvigelse.lokal, /false/);
    assert.match(r.foersteAfvigelse.udrullet, /true/);
  });

  it("fanger at den udrullede er kortere, og siger hvor meget", () => {
    const r = sammenlignRegler("a\nb\nc\nd\n", "a\nb\n");
    assert.equal(r.ens, false);
    assert.equal(r.linjerLokal, 5);
    assert.equal(r.linjerUdrullet, 3);
  });
});

describe("Det virkelige tilfælde: den kaskaderende .read", () => {
  /* Det var præcis denne forskel der gav hullet. Den udrullede version havde
     en .read på tenants/$tenantId; den kaskaderer ned over sensitive/ og
     gør de strammere børneregler til dekoration. Den lokale fil har ingen
     .read dér — adgang gives pr. node. */
  const MED_KASKADE = [
    '      "$tenantId": {',
    '        ".read": "auth != null && auth.token.tenant === $tenantId",',
    '        "kpi": { ".write": false }',
    "      }",
  ].join("\n");

  const UDEN_KASKADE = [
    '      "$tenantId": {',
    '        "kpi": { ".write": false }',
    "      }",
  ].join("\n");

  it("ser forskellen og peger på linjen med .read", () => {
    const r = sammenlignRegler(UDEN_KASKADE, MED_KASKADE);
    assert.equal(r.ens, false);
    assert.equal(r.foersteAfvigelse.nr, 2);
    assert.match(
      r.foersteAfvigelse.udrullet, /\.read/,
      "den udrullede linje er den kaskaderende .read — det er den der skal ses"
    );
  });
});

describe("Rapporten siger hvad man skal gøre", () => {
  it("nævner udrulningskommandoen når der er drift", () => {
    const r = sammenlignRegler("a\n", "b\n");
    const tekst = rapport(r, "fleetcontrol-dev-1ac1c");
    assert.match(tekst, /DRIFT/);
    assert.match(tekst, /regler:udrul/, "en fejl uden en udvej bliver til støj");
    assert.match(tekst, /fleetcontrol-dev-1ac1c/, "hvilken database det gælder");
  });

  it("er rolig når de er ens", () => {
    const r = sammenlignRegler("a\n", "a\n");
    const tekst = rapport(r, "fleetcontrol-dev-1ac1c");
    assert.doesNotMatch(tekst, /DRIFT/);
  });
});

describe("De to scripts peger på den samme nøglefil", () => {
  /* To konstanter der skal være ens, og som ligger i hver sin fil. Driver de,
     tjekker det ene script en anden database end det andet provisionerer —
     og så er vagten grøn på det forkerte projekt. */
  it("bruger samme NOEGLEFIL", () => {
    assert.equal(NOEGLEFIL, PROV_NOEGLEFIL);
  });

  it("peger på regelfilen firebase.json udpeger", async () => {
    const { readFileSync } = await import("node:fs");
    const fb = JSON.parse(readFileSync("firebase.json", "utf8"));
    assert.equal(
      REGELFIL, fb.database.rules,
      "tjekket skal sammenligne den fil CLI'en faktisk udruller"
    );
  });
});
