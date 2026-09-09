import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const her = dirname(fileURLToPath(import.meta.url));
const rod = resolve(her, "../..");
const optimeringsmappe = resolve(rod, "src/fleet/planning-optimization");
const uiMappe = resolve(rod, "src/fleet/planning-ui");
const filer = (mappe) => readdirSync(mappe).map((navn) => join(mappe, navn)).filter((fil) => statSync(fil).isFile() && /\.(js|jsx)$/.test(fil));
const imports = (fil) => [...readFileSync(fil, "utf8").matchAll(/(?:from\s+|import\s+)["']([^"']+)["']/g)].map((match) => match[1]);

describe("Optimeringslagets import- og sideeffektgrænser", () => {
  it("er React-, Firebase-, browser-, netværks- og persistencefrit", () => {
    for (const fil of filer(optimeringsmappe)) {
      const kilde = readFileSync(fil, "utf8");
      assert.doesNotMatch(kilde, /from\s+["'][^"']*(react|firebase|permissions|booking-state|planning-ui)[^"']*["']/i, fil);
      assert.doesNotMatch(kilde, /fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|document\.|window\.|navigator\.|Worker\s*\(/i, fil);
      assert.doesNotMatch(kilde, /Date\.now\s*\(|Math\.random\s*\(/, fil);
    }
  });

  it("importerer Planning Basic gennem facaden og ellers kun egne filer", () => {
    for (const fil of filer(optimeringsmappe)) for (const sti of imports(fil)) {
      assert.ok(sti === "../planning-basic.js" || sti.startsWith("./"), `${fil} importerer ${sti}`);
    }
  });

  it("har ingen importcyklus", () => {
    const alle = new Set(filer(optimeringsmappe)); const besoegt = new Set(); const aktive = new Set();
    const besoeg = (fil) => {
      assert.equal(aktive.has(fil), false, `Importcyklus ved ${fil}`);
      if (besoegt.has(fil)) return;
      aktive.add(fil);
      for (const sti of imports(fil).filter((post) => post.startsWith("./"))) {
        let maal = resolve(dirname(fil), sti); if (!extname(maal)) maal += ".js";
        if (alle.has(maal)) besoeg(maal);
      }
      aktive.delete(fil); besoegt.add(fil);
    };
    for (const fil of alle) besoeg(fil);
  });

  it("lader UI importere kun den offentlige optimeringsfacade", () => {
    const relevante = filer(uiMappe).filter((fil) => readFileSync(fil, "utf8").includes("planning-optimization"));
    assert.ok(relevante.length > 0);
    for (const fil of relevante) assert.deepEqual(imports(fil).filter((sti) => sti.includes("planning-optimization")), ["../planning-optimization/index.js"]);
  });

  it("indeholder ingen fleet.css, skjult upload eller eksternt endpoint", () => {
    for (const fil of [...filer(optimeringsmappe), resolve(uiMappe, "PlanningOptimization.jsx")]) {
      const kilde = readFileSync(fil, "utf8");
      assert.doesNotMatch(kilde, /fleet\.css|https?:\/\/|FormData|input[^>]+type=["']file|navigator\.geolocation/i, fil);
    }
  });
});
