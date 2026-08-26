/* test/dokumenter.test.mjs
 * Fakturabilag — de rene funktioner. Ingen emulator; se
 * test/rules.dokumenter.test.mjs (RTDB), test/storage.rules.test.mjs
 * (Storage) og test/skive4c-dokumenter.test.mjs (Cloud Functions,
 * kildekode-inspektion) for resten af dækningen.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  TILLADT_MIME, MAX_FILSTOERRELSE_BYTES, MAX_TENANT_BYTES, DOKUMENT_STATUS,
  tjekSignatur, stiForDokument, sprængerKvote,
} from "../src/fleet/dokumenter.js";

describe("TILLADT_MIME — V1-allowlisten", () => {
  it("kender præcis de tre typer — ingen executable/script/office/archive", () => {
    assert.deepEqual([...TILLADT_MIME].sort(), [
      "application/pdf", "image/jpeg", "image/png",
    ]);
  });
});

describe("grænserne", () => {
  it("25 MB pr. fil", () => {
    assert.equal(MAX_FILSTOERRELSE_BYTES, 25 * 1024 * 1024);
  });
  it("2 GB pr. tenant", () => {
    assert.equal(MAX_TENANT_BYTES, 2 * 1024 * 1024 * 1024);
  });
});

describe("DOKUMENT_STATUS — de fire tilstande", () => {
  it("karantæne, aktiv, afvist, deaktiveret — og intet femte", () => {
    assert.deepEqual([...Object.keys(DOKUMENT_STATUS)].sort(), [
      "afvist", "aktiv", "deaktiveret", "karantaene",
    ]);
  });
});

describe("tjekSignatur — magic bytes, ikke Content-Type-headeren", () => {
  it("⚠ EN RIGTIG PDF-SIGNATUR GODKENDES", () => {
    const pdf = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]; // %PDF-1.4
    assert.ok(tjekSignatur(pdf, "application/pdf"));
  });

  it("⚠ EN RIGTIG JPEG-SIGNATUR GODKENDES", () => {
    const jpg = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
    assert.ok(tjekSignatur(jpg, "image/jpeg"));
  });

  it("⚠ EN RIGTIG PNG-SIGNATUR GODKENDES", () => {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    assert.ok(tjekSignatur(png, "image/png"));
  });

  it("⚠ EN .exe DER PÅSTÅR AT VÆRE EN PDF, AFVISES", () => {
    /* MZ — Windows-eksekverbare filers signatur. Content-Type-headeren kan
       sige "application/pdf"; de første bytes lyver ikke. */
    const exe = [0x4d, 0x5a, 0x90, 0x00, 0x03];
    assert.ok(!tjekSignatur(exe, "application/pdf"));
  });

  it("en tom eller for kort byte-liste afvises, ikke kaster", () => {
    assert.ok(!tjekSignatur([], "application/pdf"));
    assert.ok(!tjekSignatur([0x25, 0x50], "application/pdf"));
    assert.ok(!tjekSignatur(null, "application/pdf"));
    assert.ok(!tjekSignatur(undefined, "application/pdf"));
  });

  it("en ukendt mime har ingen signatur at matche mod — afvises", () => {
    assert.ok(!tjekSignatur([0x25, 0x50, 0x44, 0x46, 0x2d], "application/octet-stream"));
  });

  it("virker med et rigtigt Buffer, ikke kun et rent array", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    assert.ok(tjekSignatur(buf, "image/png"));
  });
});

describe("stiForDokument — DEN ENE kanoniske Storage-sti", () => {
  it("bygger tenants/<t>/fakturaer/<f>/dokumenter/<d>", () => {
    assert.equal(
      stiForDokument("t1", "fa-123", "do-456"),
      "tenants/t1/fakturaer/fa-123/dokumenter/do-456"
    );
  });

  it("⚠ SAMME ID'ER GIVER SAMME STI, HVER GANG — ellers kan RTDB-reglens storagePath-tjek og Cloud Function'ens signerede URL komme ud af trit", () => {
    const a = stiForDokument("demo", "fa-1", "do-1");
    const b = stiForDokument("demo", "fa-1", "do-1");
    assert.equal(a, b);
  });

  it("originalt filnavn indgår ALDRIG i stien — kun de tre id'er", () => {
    const sti = stiForDokument("t1", "fa-1", "do-1");
    assert.ok(!/\.(pdf|jpg|jpeg|png)$/i.test(sti),
      "stien bærer en filendelse — originaltFilnavn er lækket ind i den");
  });
});

describe("sprængerKvote — ren aritmetik, kalderen leverer det verificerede forbrug", () => {
  it("under kvoten giver falsk", () => {
    assert.ok(!sprængerKvote(1000, 2000));
  });
  it("præcis på kvoten giver falsk — grænsen selv er stadig tilladt", () => {
    assert.ok(!sprængerKvote(MAX_TENANT_BYTES - 100, 100));
  });
  it("over kvoten giver sandt", () => {
    assert.ok(sprængerKvote(MAX_TENANT_BYTES - 100, 101));
  });
  it("en manglende/ugyldig brugtBytes regnes som 0, ikke NaN", () => {
    assert.ok(!sprængerKvote(undefined, 100));
    assert.ok(!sprængerKvote(null, 100));
  });
});
