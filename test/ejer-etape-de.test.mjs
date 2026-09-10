import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FUNKTIONER = readFileSync("functions/index.js", "utf8");
const STORAGE = readFileSync("storage.rules", "utf8");

test("tilbudsversion, accept og PDF er bundet til den konkrete version", () => {
  assert.match(FUNKTIONER, /const version = \(aktuel\.aktuelVersion \|\| 0\) \+ 1/);
  assert.match(FUNKTIONER, /aktuel\.accept\?\.version !== version|tilbud\.accept\?\.version !== version/);
  assert.match(FUNKTIONER, /ejer\/tilbud\/\$\{id\}\/v\$\{version\}\.pdf/);
  assert.match(FUNKTIONER, /createHash\("sha256"\)\.update\(bytes\)/);
  assert.match(STORAGE, /match \/ejer\/tilbud\/\{tilbudId\}\/\{dokumentId\}/);
  assert.match(STORAGE, /allow read, write: if false/);
});

test("mailadapteren kan ikke sætte falsk sendt-status uden forbindelse", () => {
  const start = FUNKTIONER.indexOf("export const tilbudsend =");
  const slut = FUNKTIONER.indexOf("export const tilbudpdfgenerer", start);
  const blok = FUNKTIONER.slice(start, slut);
  assert.match(blok, /status: "ikke_tilsluttet"/);
  assert.match(blok, /MAIL_IKKE_TILSLUTTET/);
  assert.doesNotMatch(blok, /status: "sendt"/);
});

test("aftaleprovisionering bruger stabil nøgle og én samlet RTDB-opdatering", () => {
  const start = FUNKTIONER.indexOf("export const aftaleprovisioner =");
  const slut = FUNKTIONER.indexOf("const INVITATION_TTL_MS", start);
  const blok = FUNKTIONER.slice(start, slut);
  assert.match(blok, /angivetAftaleId \|\| crmAftaleId \|\| `aftale_\$\{tilbudId\}_\$\{version\}`/);
  assert.match(blok, /await aftaleRef\.transaction/);
  assert.match(blok, /planlagtAftale/);
  assert.match(blok, /await db\.ref\(\)\.update\(opdatering\)/);
  assert.match(blok, /\? "planlagt" : "faerdig"/);
  assert.doesNotMatch(blok, /faktura/);
});

test("invitationer lagrer hash, roterer token og afviser ejer eller anden tenant", () => {
  assert.match(FUNKTIONER, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(FUNKTIONER, /tokenHash: invitationHash\(token\)/);
  assert.match(FUNKTIONER, /timingSafeEqual/);
  assert.match(FUNKTIONER, /En ejeridentitet kan ikke acceptere kundeadgang/);
  assert.match(FUNKTIONER, /Kontoen tilhører allerede en anden tenant/);
  assert.match(FUNKTIONER, /status: "tilbagekaldt"/);
  assert.match(FUNKTIONER, /generation: \(aktuel\.generation \|\| 1\) \+ 1/);
});
