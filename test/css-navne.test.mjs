/* test/css-navne.test.mjs
 * Et klassenavn er en global variabel.
 *
 * HVORFOR FILEN FINDES. En pagineringsknap fik klassen `.fc-side`. Den var
 * taget — af SIDEBAREN. Reglen kom sidst i filen og vandt, og sidebaren fik
 * `background: var(--bc-card)`: hvid tekst på hvid bund, og hele menuen var
 * væk. Samme dag blev `.fc-filtre` redefineret fra flex til grid, og så
 * ændrede Flåde-mockuppen filterrækken på hver eneste anden skærm.
 *
 * Begge fejl var usynlige i den skærm der forårsagede dem — de ramte et andet
 * sted i appen. Det er samme slags fejl som to demo-datasæt og to
 * divisionsfiltre: én ting defineret to steder, hvor den ene kopi vinder.
 *
 * Reglen: ÉN grundregel pr. klasse. Modifikatorer (.fc-pag-nu),
 * efterkommere (.fc-pag svg) og tilstande (:hover) er andre selektorer og
 * tæller ikke med. Responsive overstyringer i @media gør heller ikke — det er
 * hele deres formål.
 *
 * Koer: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CSS = new URL("../src/fleet/fleet.css", import.meta.url);

/** Fjerner @media-blokke, så en responsiv overstyring ikke tæller som dublet. */
function udenMedia(css) {
  let ud = "";
  for (let i = 0; i < css.length; i++) {
    if (css.startsWith("@media", i)) {
      /* Spring frem til blokkens start og derefter over dens krøllede par. */
      const start = css.indexOf("{", i);
      if (start === -1) break;
      let dybde = 0;
      let j = start;
      for (; j < css.length; j++) {
        if (css[j] === "{") dybde++;
        else if (css[j] === "}" && --dybde === 0) break;
      }
      i = j;
      continue;
    }
    ud += css[i];
  }
  return ud;
}

/**
 * Grundregler: selektorer der ER en enkelt klasse og intet andet.
 * `.a{`, `.a,.b{` og `.a, .b {` tæller; `.a .b{`, `.a.b{`, `.a:hover{` og
 * `.a svg{` gør ikke — de er mere specifikke og kan sagtens findes flere gange.
 */
function grundregler(css) {
  const fund = new Map();
  for (const m of css.matchAll(/(^|\})\s*([^{}@]+)\{/g)) {
    const linje = css.slice(0, m.index).split("\n").length;
    for (const del of m[2].split(",")) {
      const s = del.trim();
      if (/^\.[a-zA-Z][\w-]*$/.test(s)) {
        const navn = s.slice(1);
        if (!fund.has(navn)) fund.set(navn, []);
        fund.get(navn).push(linje);
      }
    }
  }
  return fund;
}

/**
 * De klasser der MED VILJE står i to regler, og hvorfor.
 *
 * Snapshot, som FORVENTEDE_RAA_FARVER i design-tokens-testen. Listen er ikke
 * en undtagelsesliste man tilføjer til for at få grønt lys — den er en
 * påstand om at hver enkelt er efterprøvet. Tilføjer du en, så skriv
 * begrundelsen ved siden af; kan du ikke skrive den, er det en dublet.
 */
const BEVIDSTE_GRUPPER = {
  /* Begge er tekstlinjer i sidebarens brugerblok og deler én ellipsis-regel.
     Grupperingen TILFØJER; den redefinerer ikke farve eller størrelse. */
  "fc-who-n": ".fc-who-n,.fc-who-r{overflow:hidden…} — fælles ellipsis",
  "fc-who-r": ".fc-who-n,.fc-who-r{overflow:hidden…} — fælles ellipsis",
  /* Donuttens to tekster deler modrotationen, så de står vandret i en
     figur der selv er drejet. Samme geometri, to størrelser. */
  "fc-donut-note": ".fc-donut-tal,.fc-donut-note{transform:rotate(90deg)…}",
};

test("Ingen klasse får en grundregel den ikke selv ejer", () => {
  const css = udenMedia(readFileSync(CSS, "utf8"));
  const dubletter = [...grundregler(css)]
    .filter(([navn, linjer]) => linjer.length > 1 && !BEVIDSTE_GRUPPER[navn])
    .map(([navn, linjer]) => `.${navn} (linje ${linjer.join(" og ")})`);

  assert.deepEqual(
    dubletter, [],
    "Klassenavnet er taget. Den sidste regel vinder, og den vinder ET ANDET " +
    "STED i appen end der hvor du arbejder — det var sådan sidebaren blev " +
    "hvid af en pagineringsknap. Vælg et nyt navn, eller ret den eksisterende " +
    "regel hvis det er den samme ting. Er de to virkelig samme ting, så skriv " +
    "klassen på BEVIDSTE_GRUPPER med begrundelsen:\n  " + dubletter.join("\n  ")
  );
});

test("Et modul overtager ikke shellens klasser", () => {
  /* Snævrere end testen ovenfor, og med en grund: sidebaren, kortet og
     tabellen er SHELLENS. Et modul har ingen anledning til at redefinere
     dem, og gør det alligevel, rammer fejlen alle de andre skærme —
     ikke den man selv sidder i. Derfor opdages den ikke. */
  const css = udenMedia(readFileSync(CSS, "utf8"));
  const regler = grundregler(css);
  for (const navn of ["fc-side", "fc-link", "fc-brand", "fc-slot", "fc-app",
                      "fc-card", "fc-table", "fc-kpi", "fc-pill", "fc-filtre",
                      "fc-felt", "fc-scroll"]) {
    const linjer = regler.get(navn) || [];
    assert.ok(linjer.length <= 1,
      `.${navn} hører shellen til og er defineret ${linjer.length} gange ` +
      `(linje ${linjer.join(", ")}). Vælg et andet navn til det nye.`);
  }
});

test("En justeringsklasse taber ikke til en elementregel", () => {
  /* ⚠ SPECIFICITET ER OGSAA "ÉN TING TO STEDER" — bare i CSS.
     `.fc-table th` er 0,1,1 (klasse + element) og slaar `.fc-num` med 0,1,0.
     Resultatet var at HVER talkolonne i hele platformen havde en
     venstrestillet overskrift over hoejrestillede tal. Fejlen var usynlig i
     den regel der forårsagede den — som `.fc-side` og `.fc-filtre` før den.

     Prøven kræver at overstyringen findes, ikke at nogen husker den. */
  const css = readFileSync(CSS, "utf8");

  const saetter = (sel) =>
    new RegExp(`(^|[},])\s*${sel.replace(/[.]/g, "\.")}\s*\{[^}]*text-align`, "m").test(css);

  if (saetter(".fc-table th")) {
    for (const k of ["fc-num", "fc-midt"]) {
      assert.ok(
        new RegExp(`\.fc-table th\.${k}\s*\{[^}]*text-align`).test(css),
        `.fc-table th sætter text-align og slår .${k}. ` +
        `Tilføj .fc-table th.${k} — ellers står overskriften ikke over sin kolonne.`
      );
    }
  }
});
