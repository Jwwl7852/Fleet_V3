import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";

import { udfoerTransaktionsSkrivning } from "../src/fleet/skriv-transaktion.js";

const konfliktfoelsomtFelt = (sti) => ["kmStand", "driftstimer", "status"].includes(sti);

describe("optimistisk RTDB-transport", () => {
  let server;
  let baseUrl;
  let handler;

  before(async () => {
    server = http.createServer((request, response) => handler(request, response));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}/unit.json`;
  });

  after(async () => new Promise((resolve) => server.close(resolve)));

  const run = (overrides = {}) => udfoerTransaktionsSkrivning({
    url: baseUrl,
    token: "syntetisk-testtoken",
    opdater: (current) => ({ ...current, kmStand: current.kmStand + 1 }),
    opdaterPatch: async () => {},
    konfliktfoelsomtFelt,
    ...overrides,
  });

  it("returnerer konflikt og ingen audit efter otte HTTP 412-svar", async () => {
    let reads = 0;
    let writes = 0;
    let accepted = 0;
    handler = (request, response) => {
      if (request.method === "GET") {
        reads += 1;
        response.writeHead(200, { "content-type": "application/json", etag: `\"v${reads}\"` });
        response.end(JSON.stringify({ kmStand: 100 + reads }));
        return;
      }
      writes += 1;
      response.writeHead(412).end();
    };

    await assert.rejects(
      run({ onAccepted: () => { accepted += 1; } }),
      (error) => error.code === "transaction-conflict" && error.status === 412,
    );
    assert.deepEqual({ reads, writes, accepted }, { reads: 8, writes: 8, accepted: 0 });
  });

  it("opretter en ny enhed atomisk uden et ugyldigt tomt PATCH-felt", async () => {
    const kandidat = {
      enhedsnummer: "QA-NEW-001",
      status: "aktiv",
      kmStand: 42,
      fleetProfil: { afdeling: "Testafdeling" },
    };
    let patchKald = 0;
    let putBody = null;
    handler = async (request, response) => {
      if (request.method === "GET") {
        response.writeHead(200, { "content-type": "application/json", etag: "\"null_etag\"" });
        response.end("null");
        return;
      }
      putBody = await new Promise((resolve) => {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => { body += chunk; });
        request.on("end", () => resolve(JSON.parse(body)));
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(putBody));
    };

    const result = await run({
      opdater: () => kandidat,
      opdaterPatch: async () => { patchKald += 1; },
    });

    assert.equal(result.udfald, "put");
    assert.equal(patchKald, 0);
    assert.deepEqual(putBody, kandidat);
    assert.deepEqual(result.efter, kandidat);
  });

  it("læser igen efter 412 og returnerer kun den accepterede serverværdi", async () => {
    let reads = 0;
    let writes = 0;
    const accepted = [];
    handler = (request, response) => {
      if (request.method === "GET") {
        reads += 1;
        response.writeHead(200, { "content-type": "application/json", etag: `\"v${reads}\"` });
        response.end(JSON.stringify({ kmStand: reads === 1 ? 100 : 125 }));
        return;
      }
      writes += 1;
      if (writes === 1) response.writeHead(412).end();
      else {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ kmStand: 126, serverRevision: 9 }));
      }
    };

    const result = await run({ onAccepted: (value) => accepted.push(value) });
    assert.equal(result.efter.kmStand, 126);
    assert.equal(result.efter.serverRevision, 9);
    assert.equal(result.forsoeg, 2);
    assert.equal(accepted.length, 1);
  });

  it("mærker domænekonflikten og skriver eller auditerer ikke", async () => {
    let writes = 0;
    let accepted = 0;
    handler = (request, response) => {
      if (request.method !== "GET") writes += 1;
      response.writeHead(200, { "content-type": "application/json", etag: "\"v1\"" });
      response.end(JSON.stringify({ kmStand: 150 }));
    };
    await assert.rejects(
      run({
        opdater: () => { throw new Error("måleren er ændret på serveren"); },
        onAccepted: () => { accepted += 1; },
      }),
      (error) => error.transactionDomainConflict === true,
    );
    assert.deepEqual({ writes, accepted }, { writes: 0, accepted: 0 });
  });

  it("afviser et konfliktfølsomt skriv uden ETag", async () => {
    handler = (_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ kmStand: 100 }));
    };
    await assert.rejects(run(), (error) => error.code === "unavailable" && /ETag/.test(error.message));
  });

  it("bevarer permission-denied fra den betingede server-skrivning", async () => {
    handler = (request, response) => {
      if (request.method === "GET") {
        response.writeHead(200, { "content-type": "application/json", etag: "\"v1\"" });
        response.end(JSON.stringify({ status: "aktiv" }));
      } else response.writeHead(403).end();
    };
    await assert.rejects(
      run({ opdater: (current) => ({ ...current, status: "vaerksted" }) }),
      (error) => error.code === "permission-denied" && error.status === 403,
    );
  });

  it("returnerer en verificeret no-op uden en skriveanmodning", async () => {
    let writes = 0;
    let accepted = 0;
    handler = (request, response) => {
      if (request.method !== "GET") writes += 1;
      response.writeHead(200, { "content-type": "application/json", etag: "\"v1\"" });
      response.end(JSON.stringify({ kmStand: 100, note: "uændret" }));
    };
    const result = await run({
      opdater: (current) => ({ ...current }),
      onAccepted: () => { accepted += 1; },
    });
    assert.equal(result.udfald, "no-op");
    assert.deepEqual({ writes, accepted }, { writes: 0, accepted: 1 });
  });

  it("rapporterer netværksfejl uden succescallback", async () => {
    let accepted = 0;
    await assert.rejects(run({
      fetchImpl: async () => { throw Object.assign(new Error("forbindelsen faldt"), { code: "NETWORK_ERROR" }); },
      onAccepted: () => { accepted += 1; },
    }), /forbindelsen faldt/);
    assert.equal(accepted, 0);
  });
});
