/* src/fleet/demo-vaerksted.js
 * Værkstedsbesøgene — som en AFLEDT VISNING af demo-opgaver.js.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ HER LÅ DE OTTE BESØG SOM ET EGET DATASÆT, OG DET VAR ET DATASÆT NUMMER TO
 * FOR NODEN `opgaver`.
 *
 * Filen skrev det selv, i sit eget hoved: "Et værkstedsbesøg ER en opgave med
 * art 'vaerksted' (beslutning 21)", og posterne lå kun for sig "fordi
 * Disponering ikke er bygget endnu og der ikke findes et opgave-datasæt at
 * lægge dem i". Det holdt ikke længere: provisioneren seedede `opgaver` med
 * DEMO_OPGAVER, og Driftskalenderen tegnede DEMO_BESOEG. Kasserne øverst på
 * skærmen ville have talt noden, mens gitteret nedenunder tegnede demofilen —
 * to svar på samme spørgsmål, ét klik fra hinanden. Det er præcis den fejl
 * `test/demo-kilder.test.mjs` blev skrevet efter seks gange.
 *
 * ⚠ OG ET DATASÆT NUMMER TO KOSTER EN FORKERT RETTELSE. Sidst det skete i den
 * her fil — DEMO_INDKOEB ved siden af demo-indkoeb.js' linjer — pegede en
 * faktura på en linje der "ikke fandtes", og referencen blev sat til null med
 * en pæn begrundelse. Linjen fandtes. Den lå i den anden fil.
 *
 * Posterne ligger nu i DEMO_OPGAVER med deres oprindelige id'er (vb-001 …
 * vb-008), fordi `il-vb-00N` i demo-indkoeb.js peger tilbage på dem med
 * besoegId. En flytning der omdøbte dem, ville have efterladt fire hængende
 * referencer.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ ET BESØG BÆRER ET VINDUE, EN OPGAVE EN START OG ET ESTIMAT.
 * `fra`/`til` findes ikke på noden — den er lukket med `$andet: false`, og en
 * skrivning med de felter bliver AFVIST. Oversættelsen står ét sted, her, og
 * går kun én vej: opgave → besøg. Det modsatte ville være en anden vej ind i
 * de samme data.
 *
 * Hvorfor visningen overhovedet bliver stående: otte filer læser DEMO_BESOEG,
 * heraf seks prøver. De spørger alle om et VINDUE — "spærrer den her bil den
 * uge?" — og det spørgsmål er stadig rigtigt. At tvinge hver af dem til selv
 * at regne `startMs + estimeretMin * 60000` ville være otte kopier af det
 * regnestykke, og det er sådan et gitter kommer til at være én dag forskudt.
 */
import { DEMO_KOERETOEJER } from "./demo-flaade.js";
import { DEMO_KPI } from "./demo-kpi.js";
import { demoSag } from "./demo-sag.js";
import { DEMO_OPGAVER } from "./demo-opgaver.js";
import {
  ARBEJDSTYPE, ALLE_ARBEJDSTYPER, OPGAVE_STATUS, opgaveMangler,
} from "./opgaver.js";

/* ---- Omkostningstyper ------------------------------------------------ */

/* ⚠ KATALOGET LÅ HER — I EN DEMO-FIL — OG BLEV BRUGT AF TO MODULER.
   Vokabularet hører ét sted, og en demo-fil er ikke det sted: et modul kan
   ikke nå det uden at importere demo-data ind i produktionskode. Det står nu
   som ARBEJDSTYPE i opgaver.js, hvor noden også kender det.

   Navnet OMKOSTNINGSTYPE bliver stående som geneksport, fordi det er RIGTIGT
   dér hvor det bruges: på indkøbsformularen er den samme værdi omkostningens
   type. Det er ikke to lister — det er én liste set fra arbejdet og fra
   regningen. Lå der to, ville det hedde "Dæk" på opgaven og "Dækskifte" på
   indkøbet, og de kunne ikke summeres i en rapport. */
export { ARBEJDSTYPE as OMKOSTNINGSTYPE, ALLE_ARBEJDSTYPER as ALLE_OMKOSTNINGSTYPER };

/* ---- Besøgets status ------------------------------------------------- */

/**
 * ⚠ AFLEDT AF OPGAVE_STATUS, IKKE SKREVET AF.
 *
 * Her stod tre egne rækker — planlagt, igang, udfoert — med de samme labels
 * som opgavens tre af seks. To kataloger for samme felt driver ved første
 * rettelse: gav nogen "I gang" et andet ord ét sted, ville kalenderen og
 * opgavelisten sige hver sit om den samme post.
 *
 * `tone` frem for `pill` er ikke en anden værdi — det er det navn
 * Gitterkalenderen bruger om nøjagtig samme ting.
 */
export const BESOEG_STATUS = Object.fromEntries(
  ["planlagt", "igang", "udfoert"].map((s) => [
    s, { label: OPGAVE_STATUS[s].label, tone: OPGAVE_STATUS[s].pill },
  ])
);

/* ---- Besøgene -------------------------------------------------------- */

/**
 * Et besøg spærrer bilen i [fra, til). Halvåbent, som alt andet.
 *
 * ⚠ HVAD DER GØR EN OPGAVE TIL ET BESØG: `leverandoerId`. Ikke arten, ikke
 * statussen. En værkstedsopgave uden leverandør udføres på VORES egen lift af
 * vores egen mekaniker (den bærer `personId` i stedet); en med leverandør
 * ligger ude hos et værksted. Det er den forskel skærmen viser, og det er den
 * eneste der kan aflæses af posten.
 */
/* Slås op FØR visningen bygges. En const der bruges i en .map() længere oppe
   ville være i sin temporale dødzone — og fejlen kommer først når modulet
   indlæses, altså i browseren og ikke i en prøve. */
const SAGEN = demoSag("FLT-2026-00381");

export const DEMO_BESOEG = DEMO_OPGAVER
  .filter((o) => o.art === "vaerksted" && o.leverandoerId)
  .map((o) => ({
    ...o,
    /* Navnet `type` bliver stående i visningen: otte filer læser det, og
       feltet på NODEN hedder arbejdstype netop for ikke at kunne forveksles
       med `art`. Oversættelsen står her, ét sted. */
    type: o.arbejdstype,
    fra: o.startMs,
    til: o.startMs + o.estimeretMin * 60000,
    /* Sagsnummeret SLÅS OP frem for at stå på posten. `sager/` findes ikke i
       firebase.rules.json endnu (beslutning 20 er fase 0), så et nummer på
       opgaven ville være en afskrift der kunne drive fra sagen. sagId er det
       der gemmes; nummeret er det der vises. */
    sagsnummer: o.sagId && SAGEN?.id === o.sagId ? SAGEN.nummer : null,
  }));

/* ---- Opslag ---------------------------------------------------------- */

export const demoBesoegFor = (koeretoejId) =>
  DEMO_BESOEG.filter((b) => b.koeretoejId === koeretoejId);

export const demoBesoegNu = (nu = Date.now()) =>
  DEMO_BESOEG.filter((b) => nu >= b.fra && nu < b.til);

/** Totalen beregnes, den gemmes ikke. */
export const totalOere = (i) => (i.beloebOere || 0) + (i.momsOere || 0);

/* Hjælper brugt af selvkontrollen og af skærmen: kaldenavnet på en bil. */
export function demoKoeretoejKaldenavn(koeretoejId) {
  const k = DEMO_KOERETOEJER.find((x) => x.id === koeretoejId);
  return k?.kaldenavn || koeretoejId;
}

/* ---- Selvkontrol ------------------------------------------------------ */

if (import.meta.env?.DEV) {
  const kendteBiler = new Set(DEMO_KOERETOEJER.map((k) => k.id));
  const nu = Date.now();

  for (const b of DEMO_BESOEG) {
    if (!kendteBiler.has(b.koeretoejId)) {
      console.warn(
        `demo-vaerksted: ${b.id} peger på koeretoejId "${b.koeretoejId}", som ikke ` +
        `findes i demo-flaade. Besøget kan ikke opløses til en bil.`
      );
    }
    if (!(b.til > b.fra)) {
      console.warn(`demo-vaerksted: ${b.id} har til <= fra. En blok uden varighed spærrer ingenting.`);
    }
    if (!BESOEG_STATUS[b.status]) console.warn(`demo-vaerksted: ${b.id} har ukendt status "${b.status}".`);
    if (!ARBEJDSTYPE[b.type]) console.warn(`demo-vaerksted: ${b.id} har ukendt arbejdstype "${b.type}".`);

    /* Beslutning 21: et besøg ER en opgave. Kunne posten ikke gemmes i
       opgaver/, er formen forkert — og så lærer demo-sættet den næste
       udvikler noget reglerne afviser. Kontrollen bliver stående, selv om
       posterne nu KOMMER fra opgave-sættet: den beviser at oversættelsen
       ovenfor ikke har lagt et felt på som noden afviser. */
    const mangler = opgaveMangler(b);
    if (mangler.length) {
      console.warn(
        `demo-vaerksted: ${b.id} mangler ${mangler.join(", ")} og kunne ikke gemmes ` +
        `i opgaver/. Se opgaveMangler() i fleet/opgaver.js.`
      );
    }
  }

  /* Aftalen fra sagen SKAL være besøget. Ellers siger sagsvisningen og
     kalenderen hver sit om samme arbejde.
     ⚠ Tidspunktet SÆTTES nu i demo-opgaver.js, hvor posten ligger. Kontrollen
     bliver alligevel her: den er billig, og den fanger at oversættelsen til
     fra/til ikke har flyttet aftalen en time. */
  const sagen = demoSag("FLT-2026-00381");
  const sagsBesoeg = DEMO_BESOEG.find((b) => b.sagId === sagen?.id);
  if (sagen?.aftale && sagsBesoeg) {
    if (sagsBesoeg.fra !== sagen.aftale.fra || sagsBesoeg.til !== sagen.aftale.til) {
      console.warn(
        `demo-vaerksted: ${sagsBesoeg.id} og aftalen på ${sagen.nummer} har forskellige ` +
        `tidspunkter. Sagsvisningen og kalenderen ville vise hver sin aftale.`
      );
    }
    if (sagsBesoeg.koeretoejId !== sagen.objektId) {
      console.warn(
        `demo-vaerksted: ${sagsBesoeg.id} står på ${sagsBesoeg.koeretoejId}, men ` +
        `${sagen.nummer} handler om ${sagen.objektId}.`
      );
    }
  }

  /* En bil med status 'vaerksted' i flåden SKAL have et besøg der dækker nu —
     og omvendt. To datasæt der siger hver sit om samme bil, er beslutning 6's
     fejl et niveau nede. */
  const paaVaerkstedNu = new Set(demoBesoegNu(nu).map((b) => b.koeretoejId));
  for (const k of DEMO_KOERETOEJER) {
    if (k.status === "vaerksted" && !paaVaerkstedNu.has(k.id)) {
      console.warn(
        `demo-vaerksted: ${k.kaldenavn} har status "vaerksted" i demo-flaade, men har ` +
        `intet besøg der dækker i dag. Fleet og Driftskalender siger hver sit.`
      );
    }
    if (k.status !== "vaerksted" && paaVaerkstedNu.has(k.id)) {
      console.warn(
        `demo-vaerksted: ${k.kaldenavn} er på værksted i dag ifølge besøgene, men har ` +
        `status "${k.status}" i demo-flaade.`
      );
    }
  }

  /* To besøg på samme bil i samme periode er en konflikt på en eksklusiv
     ressource. Gitteret TEGNER den — men demo-data skal ikke indeholde den,
     for så kan man ikke se forskel på en fejl i data og en fejl i gitteret. */
  for (const id of new Set(DEMO_BESOEG.map((b) => b.koeretoejId))) {
    const mine = demoBesoegFor(id);
    for (let i = 0; i < mine.length; i++) {
      for (let j = i + 1; j < mine.length; j++) {
        if (mine[i].fra < mine[j].til && mine[j].fra < mine[i].til) {
          console.warn(
            `demo-vaerksted: ${mine[i].id} og ${mine[j].id} overlapper på ${id}. ` +
            `To besøg på samme bil samtidig er en reservationskonflikt.`
          );
        }
      }
    }
  }

  /* Loft mod kpi/, som flåden. */
  const iAlt = DEMO_KPI?.flaade?.paaVaerksted || 0;
  if (paaVaerkstedNu.size > iAlt) {
    console.warn(
      `demo-vaerksted: ${paaVaerkstedNu.size} biler er på værksted i dag, men kpi/ siger ` +
      `${iAlt} i hele flåden. Et udsnit kan ikke være større end totalen.`
    );
  }
}
