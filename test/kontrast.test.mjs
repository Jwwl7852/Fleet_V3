/* test/kontrast.test.mjs
 * Kontrasten mellem de tokenpar der FAKTISK bruges sammen — beslutning 77.
 *
 * ⚠ HVORFOR FILEN FINDES. Beslutning 47 satte metoden — *"mål skærmen, bedøm
 * den ikke"* — og fandt dengang `--bc-muted` på 4,3:1 *"fordi nogen for
 * første gang regnede efter."* Regnestykket blev lavet i hånden, én gang, på
 * de par man kom i tanke om. Otte andre par stod under kravet.
 *
 * De seks værste var **statusfarverne**: `.fc-pill-ok` sætter farven som
 * `color`, ikke som en prik, så "Udført", "Forsinket" og "Afventer" ER
 * farven — og de stod på 3,1–4,1:1 mod AA's 4,5, på hver eneste skærm.
 *
 * ⚠ ET SNAPSHOT AF TOKENVÆRDIER FANGER DET IKKE. `design-tokens.test.mjs`
 * passer på at en værdi ikke ændres uden en beslutning; den siger intet om
 * hvad værdien er GOD NOK til. To tokens kan hver for sig være godkendt og
 * tilsammen være ulæselige.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/fleet/fleet.css", "utf8");
const rod = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
const T = {};
for (const m of rod.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) T[m[1]] = m[2].trim();

/**
 * Farven som RGB — `var()` og `color-mix()` foldes ud.
 *
 * ⚠ color-mix SKAL FOLDES UD, ikke springes over. De bløde flader ER en
 * blanding af deres egen farve, og det er netop dér koblingen sidder: en
 * mørkning trækker fladen med ned og æder en del af sin egen gevinst.
 */
function rgb(v, dybde = 0) {
  if (dybde > 6) return null;
  v = String(v).trim();
  const iVar = v.match(/^var\((--[\w-]+)\)$/);
  if (iVar) return rgb(T[iVar[1]] ?? "", dybde + 1);
  const mix = v.match(/^color-mix\(in srgb,\s*(\S+)\s+(\d+)%,\s*(.+)\)$/);
  if (mix) {
    const a = rgb(mix[1], dybde + 1), b = rgb(mix[3], dybde + 1);
    if (!a || !b) return null;
    const p = Number(mix[2]) / 100;
    return a.map((x, i) => Math.round(x * p + b[i] * (1 - p)));
  }
  const kort = v.match(/^#([0-9a-f]{3})$/i);
  if (kort) return [...kort[1]].map((c) => parseInt(c + c, 16));
  const lang = v.match(/^#([0-9a-f]{6})$/i);
  if (lang) return [0, 2, 4].map((i) => parseInt(lang[1].slice(i, i + 2), 16));
  return null;
}

const lum = (c) => {
  const [r, g, b] = c.map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const kontrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/**
 * Parrene, med det krav DERES BRUG stiller.
 *
 * ⚠ KRAVET FØLGER BRUGEN, IKKE TOKENET. Den samme grønne er 4,5 når den er
 * teksten i en pille og 3,0 når den er en prik. Skrev vi ét tal for hele
 * paletten, ville vi enten låse for løst eller mørkne noget der ikke behøvede
 * det — og et krav ingen kan begrunde, bliver slået fra.
 *
 * 4,5 = tekst (WCAG AA). 3,0 = ikke-tekstligt element (1.4.11).
 * 1,1 = flader der skal kunne SKELNES, ikke læses.
 */
const PAR = [
  ["--bc-text", "--bc-card", "brødtekst på kort", 4.5],
  ["--bc-text", "--fc-bg", "brødtekst på siden", 4.5],
  ["--bc-muted", "--bc-card", "dæmpet tekst på kort", 4.5],
  ["--bc-muted", "--fc-bg", "dæmpet tekst på siden", 4.5],
  ["--bc-accent", "--bc-card", "link på kort", 4.5],
  ["--bc-accent", "--fc-bg", "link på siden", 4.5],
  ["--fc-info", "--bc-card", "info-farve på kort", 4.5],

  /* ⚠ STATUSFARVEN ER TEKSTEN. .fc-pill-ok sætter den som `color`. */
  ["--bc-ok", "--bc-card", "grøn status på kort", 4.5],
  ["--bc-warn", "--bc-card", "gul status på kort", 4.5],
  ["--bc-block", "--bc-card", "rød status på kort", 4.5],
  ["--bc-ok", "--fc-ok-bg", "grøn i sin pille", 4.5],
  ["--bc-warn", "--fc-warn-bg", "gul i sin pille", 4.5],
  ["--bc-block", "--fc-bad-bg", "rød i sin pille", 4.5],

  /* Ikoner i deres cirkler — ikke-tekstlige. */
  ["--fc-ikon-1", "--fc-ikon-1-bg", "ikon 1 i sin cirkel", 3.0],
  ["--fc-ikon-2", "--fc-ikon-2-bg", "ikon 2 i sin cirkel", 3.0],
  ["--fc-ikon-3", "--fc-ikon-3-bg", "ikon 3 i sin cirkel", 3.0],
  ["--fc-ikon-4", "--fc-ikon-4-bg", "ikon 4 i sin cirkel", 3.0],
  ["--fc-ikon-6", "--fc-ikon-6-bg", "ikon 6 i sin cirkel", 3.0],

  /* Rangbadgen: almindelig brødtekst på den bløde flade (beslutning 77). */
  ["--bc-text", "--fc-ikon-1-bg", "rang 1", 4.5],
  ["--bc-text", "--fc-ikon-2-bg", "rang 2", 4.5],
  ["--bc-text", "--fc-ikon-3-bg", "rang 3", 4.5],

  /* Flader der skal kunne skelnes. */
  ["--bc-line", "--bc-card", "streg mod kort", 1.1],
  ["--bc-line", "--fc-bg", "streg mod side", 1.1],
  ["--bc-card", "--fc-bg", "kort mod side", 1.1],
];

describe("Hvert par der bruges sammen, er læsbart", () => {
  test("⚠ HVERT PAR KAN OPLØSES — ellers måler vi ingenting", () => {
    const uopløste = PAR
      .filter(([a, b]) => !rgb(T[a]) || !rgb(T[b]))
      .map(([a, b, hvad]) => `${hvad} (${a} / ${b})`);
    assert.deepEqual(uopløste, [],
      "et token kunne ikke opløses til en farve — er det omdøbt, eller bruger "
      + "det en funktion rgb() ikke kender?");
  });

  for (const [a, b, hvad, krav] of PAR) {
    test(`${hvad} — mindst ${krav}:1`, () => {
      const k = kontrast(rgb(T[a]), rgb(T[b]));
      assert.ok(k >= krav,
        `${hvad}: ${k.toFixed(2)}:1, krav ${krav}:1 (${a} på ${b}).\n`
        + "Kuløren bevares — skru kun lyset ned, og find den MINDSTE værdi der "
        + "når kravet mod ALLE de flader tokenet står på.\n"
        + "⚠ Er fladen en color-mix af farven selv, flytter den MED: regn "
        + "koblet, ellers rammer rettelsen ved siden af. Se beslutning 77.");
    });
  }
});

describe("Lysmængden er stadig skruet ned", () => {
  /**
   * ⚠ BESLUTNING 47's ANDET TAL. Gamma-korrigeret lysstyrke svarer på *hvor
   * let er det at læse*; RÅT lys svarer på *hvor meget lyser skærmen*. Det
   * sidste er det der trætter over otte timer, og det var ikke det tal der
   * blev regnet på først.
   *
   * Kortet må ikke tilbage på maksimum: `#ffffff` er 255, og andelen af
   * skærmen på maksimum gik fra 58,9 % til 1,9 % ved at skære toppen af.
   */
  const raat = (t) => rgb(T[t]).reduce((s, x) => s + x, 0) / 3;

  test("⚠ KORTET ER IKKE TILBAGE PÅ RÅT HVIDT", () => {
    assert.ok(raat("--bc-card") <= 248,
      `--bc-card er ${raat("--bc-card").toFixed(0)} af 255 — toppen af lyset er `
      + "skåret af med vilje (beslutning 47). #ffffff er 255.");
  });

  test("siden bærer det meste af arealet og er mørkere end kortet", () => {
    assert.ok(raat("--fc-bg") < raat("--bc-card"),
      "siden er lysere end kortet — så bærer det største areal mest lys");
  });
});
