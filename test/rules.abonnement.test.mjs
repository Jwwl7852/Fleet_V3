/* test/rules.abonnement.test.mjs
 * Et lukket abonnement lukker HELE tenanten — i reglerne, ikke i skærmen.
 *
 * ⚠ HVORFOR SPÆRRINGEN IKKE ER EN LOGINSPÆRRING PÅ KONTOEN.
 *
 * "Pause" betyder at kunden ikke kommer ind. Den nærliggende måde er at sætte
 * `disabled` på hver konto — og den er en fælde: når abonnementet genåbnes,
 * skal de konti der var spærret INDIVIDUELT blive ved med at være det, og den
 * tilstand findes ikke noget sted efter man har overskrevet den. Man ville
 * genåbne folk der var fyret.
 *
 * Spærringen ligger derfor på TENANTEN og rører ingen konto. Brugeren kan
 * stadig autentificere sig — men hver eneste læsning og skrivning af kundens
 * data afvises af reglerne, og appen viser en låseskærm i stedet for shellen.
 * Genåbning er ét felt, og ingen per-bruger-tilstand er gået tabt.
 *
 * ⚠ TRE NODER ER MED VILJE UNDTAGET: virksomhed, moduler og abonnement.
 * Det er dem låseskærmen skriver kundens navn ud af og læser sin egen
 * begrundelse i. En spærring der ikke kan forklare sig selv, ligner en fejl —
 * og så ringer kunden og siger at systemet er nede.
 *
 * ⚠ DEN FEJLER ÅBENT PÅ EN MANGLENDE NODE. En tenant uden abonnement/status
 * er aktiv. Det er ikke sjusk: noden er `.write: false`, så ingen kan fjerne
 * den for at slippe udenom, og alternativet var at en base seedet før feltet
 * fandtes lukker en betalende kunde ude. Samme retning som harModul().
 *
 * Koer: npm run test:rules
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { ref, set, get } from "firebase/database";
import { permStrengFraRolle } from "../src/fleet/permissions.js";
import { ALLE_MODULER } from "../src/fleet/moduler.js";

const ALLE_MODULER_TIL = Object.fromEntries(ALLE_MODULER.map((m) => [m, true]));

/* Egne tenant-id'er: node --test kører filerne parallelt. */
const AKTIV = "abonAktiv";
const PAUSED = "abonPaused";
const OPSAGT = "abonOpsagt";
const UDEN = "abonUdenNode";

let miljoe;

/** Noderne under tenants/$tenantId, læst ud af regelfilen. */
function nodeliste() {
  const raa = readFileSync("firebase.rules.json", "utf8")
    .replace(/^﻿/, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const t = JSON.parse(raa).rules.tenants.$tenantId;
  return Object.keys(t).filter((k) => !k.startsWith(".") && !k.startsWith("$"));
}

/* De tre der skal blive læsbare. Står de her, er det fordi nogen har
   besluttet det — alt andet skal lukke. */
const ALTID_LAESBAR = ["virksomhed", "moduler", "abonnement"];

/* ---- Kildelinten ------------------------------------------------------- */

const MARKOER = "child('_findes').exists()";
const AABEN = "child('abonnement').child('status')";

/** Hver .read og .write i regelfilen, med sin sti. */
function alleRegler() {
  const raa = readFileSync("firebase.rules.json", "utf8")
    .replace(/^﻿/, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const ud = [];
  (function gaa(node, sti) {
    if (typeof node !== "object" || node === null) return;
    for (const [k, v] of Object.entries(node)) {
      if (k === ".read" || k === ".write") ud.push({ sti: `${sti}/${k}`, udtryk: v });
      else if (!k.startsWith(".")) gaa(v, `${sti}/${k}`);
    }
  })(JSON.parse(raa).rules, "");
  return ud;
}

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fleetcontrol-rules-test",
    database: { rules: readFileSync("firebase.rules.json", "utf8") },
  });

  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    for (const t of [AKTIV, PAUSED, OPSAGT, UDEN]) {
      await set(ref(db, `tenants/${t}/_findes`), true);
      await set(ref(db, `tenants/${t}/virksomhed`), { navn: `Kunde ${t}`, cvr: "12345678" });
      /* ⚠ ALLE MODULER. Prøven her handler om ABONNEMENTET, ikke om
         modulafkrydsningen (beslutning 34). Manglede kunder-modulet, ville
         `kunder` blive afvist af den ANDEN spærring — og prøven ville være
         grøn af den forkerte grund. */
      await set(ref(db, `tenants/${t}/moduler`), ALLE_MODULER_TIL);
      await set(ref(db, `tenants/${t}/kunder/k1`), { navn: "Kunde", division: "gods", aktiv: true });
      await set(ref(db, `tenants/${t}/koeretoejer/kt1`), { art: "lastbil", status: "aktiv" });
      await set(ref(db, `tenants/${t}/kpi/flaade`), { aktive: 3 });
    }
    await set(ref(db, `tenants/${AKTIV}/abonnement`), { status: "aktiv", aendretMs: 1e12 });
    await set(ref(db, `tenants/${PAUSED}/abonnement`), { status: "paused", aendretMs: 1e12, aarsag: "betaling" });
    await set(ref(db, `tenants/${OPSAGT}/abonnement`), { status: "opsagt", aendretMs: 1e12 });
    /* UDEN får ingen abonnement-node. Det er den eksisterende kunde. */
  });
});

after(async () => { await miljoe?.cleanup(); });

const somAdmin = (tenant) =>
  miljoe.authenticatedContext(`u-${tenant}`, {
    tenant, rolle: "admin", perms: permStrengFraRolle("admin"),
  }).database();

describe("Klausulen står i HVER regel der bærer markøren", () => {
  it("mangler ikke ét eneste sted", () => {
    /* ⚠ DEN HER ER PRØVEN MED TÆNDER, og den blev skrevet fordi den første
       ikke havde nogen. Den probede kun noderne på øverste niveau — så da
       klausulen forsvandt fra sensitive/kunder/.write, blev suiten grøn.
       En spærring der er grøn med et hul i, er værre end ingen spærring.

       Klausulen står 41 steder. Det ER repoets kendte fejlmønster — én ting
       defineret mange steder — og en lint der læser regelfilen er det eneste
       der kan holde dem ens. En adfærdsprøve kan kun se de stier nogen huskede
       at skrive ned. */
    const mangler = alleRegler().filter(
      (r) => typeof r.udtryk === "string" &&
             r.udtryk.includes(MARKOER) &&
             !r.udtryk.includes("auth.token.udbyder") &&
             !r.udtryk.includes(AABEN)
    );
    assert.deepEqual(mangler.map((r) => r.sti), [],
      "regler med markøren men UDEN abonnementsklausulen — de er åbne for en lukket kunde.");
  });

  it("står i mindst 40 regler — ellers er filen ikke læst rigtigt", () => {
    const med = alleRegler().filter((r) => typeof r.udtryk === "string" && r.udtryk.includes(AABEN));
    assert.ok(med.length >= 40, `kun ${med.length} regler har klausulen.`);
  });

  it("står IKKE i de to udbyderregler", () => {
    /* virksomhed og moduler skal blive læsbare for konsollen og for
       låseskærmen. Kom klausulen på dem, ville en lukket kunde forsvinde ud
       af udbyderens egen kundeliste — netop når han skal genåbnes. */
    const undtaget = alleRegler().filter(
      (r) => typeof r.udtryk === "string" && r.udtryk.includes("auth.token.udbyder")
    );
    /* virksomhed, moduler og abonnement under tenanten — plus udbyder/kunder,
       udbyder/prisliste og udbyder/maalinger. Seks, og tallet står her for at
       en syvende skal SES: hver ny regel med udbyder-claim'et er en udvidelse
       af den anden krydsning af tenant-grænsen, og den skal besluttes, ikke
       opdages.

       ⚠ De tre under udbyder/ er ikke kundedata. Prislisten er vores,
       målingerne er tal og ingen rækker, og kunder er et eksistensindeks. */
    /* ⚠ AT TAELLE REGLER ER IKKE AT VIDE HVOR DE ER, og den her proeve var
       GROEN mens fakturagrundlag-reglen laa i
       tenants/$tenantId/facility/sensorer/$zoneId. Jeg haevede tallet fra 6
       til 7 da jeg tilfoejede den, og antog at den var landet rigtigt — den
       var indsat med et anker der matchede som UNDERSTRENG.

       Den spoerger nu om STIEN. Et tal kan man rette; en sti skal man
       beslutte. Reglen gav ingen adgang — en .read gaelder kun ved og under
       sin egen sti, og den sti fandtes ikke — men grundlaget kunne ikke
       laeses, og skaermen viste 'ingen prisliste endnu'. */
    assert.deepEqual(undtaget.map((r) => r.sti).sort(), [
      "/tenants/$tenantId/abonnement/.read",
      "/tenants/$tenantId/moduler/.read",
      "/tenants/$tenantId/virksomhed/.read",
      "/udbyder/fakturagrundlag/.read",
      "/udbyder/kunder/.read",
      "/udbyder/maalinger/.read",
      "/udbyder/prisliste/.read",
      /* ⚠ DEN SYVENDE: retentionsrapporten. Den er ikke kundedata — kun
         tenant, klasse, aar, maaned og et ANTAL. En auditpost kopieret ud i
         en rapport under udbyder/ havde forladt kundens tenant, og reglens
         $andet: false haandhaever at den ikke kan. Se auditoprydning. */
      "/udbyder/retention/.read",
    ], "en regel med udbyder-claim'et staar et andet sted end besluttet.");
    for (const r of undtaget) {
      assert.ok(!r.udtryk.includes(AABEN), `${r.sti} har klausulen — den skal blive læsbar.`);
    }
  });
});

describe("Et aktivt abonnement mærkes ikke", () => {
  it("lader admin læse driften som før", async () => {
    const db = somAdmin(AKTIV);
    await assertSucceeds(get(ref(db, `tenants/${AKTIV}/kunder`)));
    await assertSucceeds(get(ref(db, `tenants/${AKTIV}/koeretoejer`)));
  });

  it("lader admin skrive", async () => {
    await assertSucceeds(
      set(ref(somAdmin(AKTIV), `tenants/${AKTIV}/kunder/k2`),
          { navn: "Ny kunde", division: "gods", aktiv: true })
    );
  });
});

describe("En tenant UDEN abonnement-node er aktiv", () => {
  it("fejler åbent, ikke lukket", async () => {
    /* ⚠ ALTERNATIVET VAR AT LUKKE EN BETALENDE KUNDE UDE. En base seedet før
       feltet fandtes har det ikke, og reglen må ikke straffe ham for det.
       Noden er .write: false, så ingen kan fjerne den for at slippe udenom. */
    await assertSucceeds(get(ref(somAdmin(UDEN), `tenants/${UDEN}/kunder`)));
    await assertSucceeds(
      set(ref(somAdmin(UDEN), `tenants/${UDEN}/kunder/k2`),
          { navn: "Ny kunde", division: "gods", aktiv: true })
    );
  });
});

for (const [navn, tenant] of [["paused", PAUSED], ["opsagt", OPSAGT]]) {
  describe(`Et ${navn} abonnement lukker hele tenanten`, () => {
    it("afviser læsning på HVER node der ikke er undtaget", async () => {
      /* ⚠ DEN HER BÆRER KRAVET. Nodelisten kommer fra regelfilen, så en ny
         node der glemmer klausulen fælder prøven uden at nogen har skrevet
         et testtilfælde til den. Klausulen står 41 steder — det er repoets
         kendte fejlmønster, og det her er det eneste der holder dem ens. */
      const db = somAdmin(tenant);
      const noder = nodeliste().filter((n) => !ALTID_LAESBAR.includes(n) && n !== "_findes");
      assert.ok(noder.length > 15, `kun ${noder.length} noder at prøve — er listen læst rigtigt?`);
      for (const node of noder) {
        await assertFails(get(ref(db, `tenants/${tenant}/${node}`)));
      }
    });

    it("afviser skrivning", async () => {
      await assertFails(
        set(ref(somAdmin(tenant), `tenants/${tenant}/kunder/k9`),
            { navn: "Ny kunde", division: "gods", aktiv: true })
      );
    });

    it("afviser auditlæsning", async () => {
      /* audit/ ligger uden for tenants/, men bærer samme markørklausul —
         og skal derfor lukke med. En lukket kunde der stadig kan læse sin
         egen log, er ikke lukket. */
      await assertFails(get(ref(somAdmin(tenant), `audit/${tenant}`)));
    });

    it("lader de tre undtagne noder blive læsbare", async () => {
      /* Låseskærmen skriver kundens navn og læser sin egen begrundelse.
         En spærring der ikke kan forklare sig selv, ligner en fejl. */
      const db = somAdmin(tenant);
      for (const node of ALTID_LAESBAR) {
        await assertSucceeds(get(ref(db, `tenants/${tenant}/${node}`)));
      }
    });

    it("giver stadig ikke adgang til en ANDEN tenant", async () => {
      /* ⚠ SPÆRRINGEN MÅ IKKE HAVE FLYTTET NOGET. Tenant-isolationen er punkt
         1 i den låste rækkefølge, og en ny klausul i 41 regler er præcis
         den slags ændring der kan komme til at løsne noget andet. */
      const db = somAdmin(tenant);
      await assertFails(get(ref(db, `tenants/${AKTIV}/kunder`)));
      await assertFails(get(ref(db, `tenants/${AKTIV}/virksomhed`)));
    });
  });
}

describe("Abonnementet skrives ikke fra en browser", () => {
  it("afviser admin i egen tenant", async () => {
    /* ⚠ EN KUNDE DER KAN SÆTTE SIN EGEN STATUS TIL aktiv, ER IKKE PÅ PAUSE.
       Statussen sættes af en udbyderfunktion med Admin SDK. */
    await assertFails(
      set(ref(somAdmin(PAUSED), `tenants/${PAUSED}/abonnement/status`), "aktiv")
    );
    await assertFails(
      set(ref(somAdmin(AKTIV), `tenants/${AKTIV}/abonnement`), { status: "aktiv", aendretMs: 1 })
    );
  });
});
