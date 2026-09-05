/* test/rules.division.test.mjs
 * Punkt 0 i den låste rækkefølge: .validate — nu for beslutning 70.
 *
 * ⚠ FILEN HED SIG SELV EFTER EN AKSE DER IKKE FINDES. Navnet bliver stående:
 * den prøver stadig at division-feltet er AFVIST, og det er den prøve der
 * holder aksen ude af dataene. En fil der hedder noget andet, ville skulle
 * findes af den næste der undrer sig over hvorfor feltet ikke må skrives.
 *
 * Kravet er at reglerne er AFPRØVET, ikke læst igennem. Derfor kører de her
 * mod databaseemulatoren med rigtige custom claims (tenant + rolle), præcis
 * som reglerne læser dem.
 *
 * Kør:  npm run test:rules
 *       (firebase emulators:exec starter og stopper emulatoren selv)
 *
 * Testene er skrevet så de også fanger det de IKKE må tillade. En regel der
 * kun bliver bekræftet i sit lykkelige tilfælde, er ikke afprøvet.
 */
import { after, before, describe, it } from "node:test";

import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set, update } from "firebase/database";
import { permStrengFraRolle } from "../src/fleet/permissions.js";

/* Egne tenant-id'er: node --test kører testfiler parallelt, og
   rules.tenant.test.mjs bruger sine egne. */
const TENANT = "vognmandA";

let miljoe;

/** Bruger i TENANT med en given rolle. Claims matcher dem firebase.js sætter.
 *  perms udledes af rollens preset — reglerne spørger efter permissions, ikke
 *  efter rollen. Se permissions.js. */
const som = (uid, rolle, tenant = TENANT) =>
  miljoe
    .authenticatedContext(uid, { tenant, rolle, perms: permStrengFraRolle(rolle) })
    .database();

const sti = (node, id, tenant = TENANT) => `tenants/${tenant}/${node}/${id}`;

/** En gyldig kunde uden division — divisionen lægges på pr. test. */
const kunde = (ekstra = {}) => ({
  navn: "Kolding Kommune",
  aktiv: true,
  aftaleUdloeberMs: 1786000000000,
  ...ekstra,
});

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-division",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });

  /* Reglerne kræver at tenanten er provisioneret — se _findes i
     firebase.rules.json. Uden markøren ville hver eneste skrivning herunder
     blive afvist, og divisionstestene ville fejle af den forkerte grund. */
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `tenants/${TENANT}/_findes`), true);
    /* ⚠ LEVERANDOEREN SKAL FINDES. indkoeb.leverandoerId slaar nu op i
       leverandoerer/ — beslutning 18, og samme tjek som valideIndkoeb()
       laver i formularen. Uden posten her fejler hver indkoebsskrivning i
       filen, og fejlen ville ligne en manglende division. Proeven ville sige
       det rigtige af den forkerte grund. */
    await set(ref(db, `tenants/${TENANT}/leverandoerer/lv-hydra`), {
      navn: "Hydra-Grene Kolding", kategori: "reservedele", aktiv: true,
    });
  });
});

after(async () => {
  await miljoe?.cleanup();
});

/* ══════════════════════════════════════════════════════════════════════
   AKSEN ER VÆK — beslutning 70

   ⚠ HER STOD "beslutning 15 — division som felt": at feltet var PÅKRÆVET på
   kunder, indberetninger, indkøb, opgaver, etaper og lagre, at det kun måtte
   være gods|bus|faelles, og at det var FORBUDT på stamdata.

   Halvdelen af den prøve er nu det modsatte, og den anden halvdel er blevet
   almindelig: **feltet er forbudt overalt.** Beslutning 19's egen begrundelse
   for forbuddet på stamdata gælder nu hver node —

     "Et felt der må stå der uden at betyde noget, bliver tastet — og derefter
      læst af nogen. .validate: false gør fejlen til en afvisning frem for en
      vane."

   ⚠ OG DERFOR ER DET false OG IKKE SLETTET. En manglende regel ville TILLADE
   feltet: RTDB afviser kun det en .validate siger nej til. Slettede vi linjen,
   ville division kunne skrives igen — og så ville aksen vende tilbage som
   data, uden at nogen havde besluttet det og uden at noget fejlede.
   ══════════════════════════════════════════════════════════════════════ */

describe("beslutning 70 — division er forbudt overalt", () => {
  /* De seks noder hvor feltet var PÅKRÆVET. Hver af dem afvises nu. */
  /* ⚠ opgaver STÅR IKKE HER, og det er ikke en udeladelse: noden er
     .write: false (beslutning 45), så en klient kan hverken skrive den med
     eller uden feltet. Formen håndhæves af opgaveMangler() og
     valideOpgaveplan() — se test/opgaveplan.test.mjs. En regelprøve her ville
     være grøn fordi vejen er lukket, ikke fordi posten var rigtig. */
  const PAAKRAEVET_FOER = [
    ["kunder", () => kunde()],
    ["lagre", () => ({ navn: "Kolding" })],
    ["indberetninger", () => ({
      art: "skade", forloeb: "intern", oprettetAf: "admin1", oprettetMs: 1786000000000,
    })],
  ];

  /**
   * ⚠ DEN VIGTIGSTE PRØVE I FILEN: posten er gyldig UDEN feltet.
   *
   * Var den ikke det, ville hver eneste skrivning i systemet være lukket —
   * regel og data skal flytte sammen, og det er den halvdel der beviser at
   * reglen fulgte med.
   */
  /* ⚠ BESLUTNING 122 — `indberetninger` KAN IKKE LÆNGERE OPRETTES DIREKTE,
     HELLER IKKE AF ADMIN. `.write` kræver nu `data.exists()` på begge grene
     (kun `indberetningIndsend`, Admin-SDK, kan oprette en NY post) — en sag
     med et ticketnummer skal oprettes atomisk sammen med den. Prøven her
     handler stadig om `.validate` (division forbudt), som gælder begge
     veje, så vi seeder posten FØRST for netop dén node og prøver derefter
     en REDIGERING i stedet for en frisk oprettelse. `kunder`/`lagre` er
     urørt af den lukning og oprettes stadig direkte. */
  const LUKKET_FOR_OPRETTELSE = new Set(["indberetninger"]);

  for (const [node, byg] of PAAKRAEVET_FOER) {
    it(`${node} er gyldig UDEN division`, async () => {
      const db = som("admin1", "admin");
      const id = `u-${node}`;
      if (LUKKET_FOR_OPRETTELSE.has(node)) {
        await miljoe.withSecurityRulesDisabled(async (ctx) => {
          await set(ref(ctx.database(), sti(node, id)), byg());
        });
      }
      await assertSucceeds(set(ref(db, sti(node, id)), byg()));
    });

    it(`${node} AFVISER division — også en gyldig værdi`, async () => {
      const db = som("admin1", "admin");
      for (const v of ["gods", "bus", "faelles"]) {
        const id = `m-${node}-${v}`;
        if (LUKKET_FOR_OPRETTELSE.has(node)) {
          await miljoe.withSecurityRulesDisabled(async (ctx) => {
            await set(ref(ctx.database(), sti(node, id)), byg());
          });
        }
        await assertFails(set(ref(db, sti(node, id)),
          { ...byg(), division: v }));
      }
    });
  }

  /**
   * ⚠ OG FELT FOR FELT. En .validate på et barn køres også når barnet skrives
   * alene — men det er værd at måle, fordi det var netop sådan et smuthul
   * beslutning 52 fandt et andet sted: reglen så rigtig ud og kunne omgås i
   * to trin.
   */
  it("⚠ KAN MAN SNIGE FELTET IND BAGEFTER?", async () => {
    const db = som("admin1", "admin");
    await assertSucceeds(set(ref(db, sti("kunder", "k-snig")), kunde()));
    await assertFails(set(ref(db, `${sti("kunder", "k-snig")}/division`), "gods"));
    await assertFails(update(ref(db, sti("kunder", "k-snig")), { division: "gods" }));
  });

  /* Stamdata afviste det i forvejen (beslutning 19) og gør det stadig. */
  it("stamdata afviser det stadig — nu af samme grund som alle andre", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, sti("koeretoejer", "kt-div")),
      { art: "lastbil", status: "aktiv", division: "gods" }));
    await assertFails(set(ref(db, sti("personale", "p-div")),
      { navn: "Anne", status: "aktiv", division: "faelles" }));
  });
});

describe("kpi-noden", () => {
  it("er skrivebeskyttet for alle — kun Cloud Functions", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, `tenants/${TENANT}/kpi/current`), { kunder: { aktive: 51 } }));
  });

  /* ⚠ OG STIEN HAR ÉT NIVEAU MINDRE. Den gamle form var
     kpi/<division>/<snapshot>/<domaene>; niveauet var et WILDCARD, så en
     læsning på den gamle sti rammer nu $snapshot/$domaene med "gods" som
     snapshot — og et domæne der ikke findes. Den skal fejle, ikke svare tomt
     på noget der ligner et rigtigt sted. */
  it("⚠ DEN GAMLE STI PEGER IKKE PÅ NOGET", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, `tenants/${TENANT}/kpi/current/kunder`), { aktive: 1 }));
  });
});

describe("rollen afgør stadig", () => {
  it("en chauffør må ikke skrive kunder", async () => {
    const db = som("chauffoer1", "chauffoer");
    await assertFails(set(ref(db, sti("kunder", "k-chauffoer")), kunde()));
  });
});


/* ══════════════════════════════════════════════════════════════════════
   Feltvalidering på køretøjer — forudsætningen for den første formular
   ══════════════════════════════════════════════════════════════════════

   ⚠ HVORFOR DE HER STÅR HER. `hjemsted`, `naesteServiceKm`, `kaldenavn` og
   resten kunne LÆSES længe før reglerne kendte dem — de kom i demo-sættet
   fordi en skærm skulle vise dem. Så længe ingen skrev, var det harmløst.

   Piloten skriver. Uden validering på serveren ville formularen være den
   eneste kontrol, og en kontrol der kun findes i frontend er ikke
   adgangskontrol. Prøverne her beviser at reglerne KAN afvise — en regel
   ingen har set fejle, er en påstand.
   ══════════════════════════════════════════════════════════════════════ */
describe("køretøjets felter valideres på serveren", () => {
  const bil = (ekstra = {}) => ({
    navn: "Volvo FH 500", kaldenavn: "Bil 900", registrering: "DE 90 000",
    status: "aktiv", art: "lastbil", ...ekstra,
  });
  const p = (id) => sti("koeretoejer", id);

  it("tager en fuldt udfyldt bil", async () => {
    const db = som("admin1", "admin");
    await assertSucceeds(set(ref(db, p("k-ok")), bil({
      hjemsted: "Kolding", kmStand: 298450, naesteServiceKm: 299700,
      naesteServiceMs: 1e12, synMs: 1e12, laengdeMm: 6200, driftPrKmOere: 342,
      tachografNr: "TG-40122", saeder: 0, kranTonmeter: 12,
    })));
  });

  it("afviser et tomt kaldenavn og en tom nummerplade", async () => {
    /* Nummerpladen er den man slår op på. Bil 104 havde to i prototypen —
       en tom er samme slags fejl, bare stille. */
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, p("k-tomt")), bil({ kaldenavn: "" })));
    await assertFails(set(ref(db, p("k-tompl")), bil({ registrering: "" })));
  });

  it("afviser et hjemsted der er et tal eller en roman", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, p("k-tal")), bil({ hjemsted: 6000 })));
    await assertFails(set(ref(db, p("k-lang")), bil({ hjemsted: "x".repeat(61) })));
  });

  it("tager ethvert stednavn — hjemsted er ikke en enum", async () => {
    /* ⚠ MED VILJE. Kolding og Aalborg er DENNE tenants steder; en anden
       vognmand har andre. Et katalog i regelfilen ville betyde at et nyt
       depot krævede en udrulning. */
    const db = som("admin1", "admin");
    await assertSucceeds(set(ref(db, p("k-nyt")), bil({ hjemsted: "Padborg" })));
  });

  it("afviser kilometer som streng og som negativt tal", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, p("k-str")), bil({ kmStand: "298450" })));
    await assertFails(set(ref(db, p("k-neg")), bil({ kmStand: -1 })));
    await assertFails(set(ref(db, p("k-svc")), bil({ naesteServiceKm: -5 })));
  });

  it("afviser en servicedato som streng", async () => {
    /* En dato som streng sorterer alfabetisk og stiller 10-01 før 9-12. */
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, p("k-dato")), bil({ naesteServiceMs: "2026-08-18" })));
  });

  it("kræver en årsag når en bil registreres afgået", async () => {
    /* Afgang sletter ikke — posten bliver stående. Men en afgang uden
       årsag er en bil der bare forsvandt ud af drift. */
    const db = som("admin1", "admin");
    await assertSucceeds(set(ref(db, p("k-solgt")), bil({
      status: "solgt", afgangMs: 1e12, afgangAarsag: "Solgt til Padborg Transport",
    })));
    await assertFails(set(ref(db, p("k-tomaarsag")), bil({
      status: "solgt", afgangMs: 1e12, afgangAarsag: "",
    })));
  });

  it("kan stadig ikke slettes", async () => {
    /* .write kræver newData.exists(). Der hænger indberetninger og
       omkostningshistorik på id'et. */
    const db = som("admin1", "admin");
    await assertSucceeds(set(ref(db, p("k-slet")), bil()));
    await assertFails(set(ref(db, p("k-slet")), null));
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Facility — noden havde INGEN validering overhovedet
   ══════════════════════════════════════════════════════════════════════

   Kun .write bag en permission; alt derunder var frit. En lokation uden navn,
   et anlæg med en opdigtet art, et areal som streng — alt blev taget imod. Så
   længe ingen skrev, var det harmløst.
   ══════════════════════════════════════════════════════════════════════ */
describe("facility valideres på serveren", () => {
  const p = (under, id) => `tenants/${TENANT}/facility/${under}/${id}`;
  const lok = { navn: "Hal B", type: "lager", sted: "Kolding", arealM2: 12450 };

  it("tager en gyldig lokation og afviser en uden navn", async () => {
    const db = som("admin1", "admin");
    await assertSucceeds(set(ref(db, p("lokationer", "lok-a")), lok));
    await assertFails(set(ref(db, p("lokationer", "lok-tom")), { ...lok, navn: "" }));
    await assertFails(set(ref(db, p("lokationer", "lok-type")), { ...lok, type: "garage" }));
    await assertFails(set(ref(db, p("lokationer", "lok-areal")), { ...lok, arealM2: "12450" }));
  });

  it("kræver at et anlæg står på en lokation der FINDES", async () => {
    /* Et anlæg uden lokation kan ikke vises i driftsstatus og tæller ikke
       med noget sted — det er væk uden at være slettet. */
    const db = som("admin1", "admin");
    const aktiv = { navn: "Port 1", art: "port", status: "idrift", lokationId: "lok-a" };
    await assertSucceeds(set(ref(db, p("aktiver", "fa-a")), aktiv));
    await assertFails(set(ref(db, p("aktiver", "fa-luft")), { ...aktiv, lokationId: "lok-findes-ikke" }));
  });

  it("afviser udstyrsarten 'facility' — det er opgavens art", async () => {
    /* ⚠ SAMME FELTNAVN, TO VOKABULARER. Blandes de, får et køleanlæg arten
       'facility' og forsvinder ud af enhver liste der grupperer på art. */
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, p("aktiver", "fa-forkert")), {
      navn: "Port 2", art: "facility", status: "idrift", lokationId: "lok-a",
    }));
  });

  it("afviser en zone hvor min ligger OVER maks", async () => {
    /* ⚠ DEN VIGTIGSTE HER. En zone med byttede grænser alarmerer ALDRIG:
       alarmTilstand() finder ingen måling uden for et interval der er tomt.
       Det ser ud som om alt er i orden, og det er den værste fejltilstand —
       et kølerum der står for varmt bag et grønt flueben. */
    const db = som("admin1", "admin");
    const zone = { navn: "Køl 1", art: "koel", lokationId: "lok-a" };
    await assertSucceeds(set(ref(db, p("zoner", "zo-ok")), { ...zone, graenser: { minC: 2, maksC: 6 } }));
    await assertFails(set(ref(db, p("zoner", "zo-byt")), { ...zone, graenser: { minC: 6, maksC: 2 } }));
    await assertFails(set(ref(db, p("zoner", "zo-ens")), { ...zone, graenser: { minC: 4, maksC: 4 } }));
  });

  it("afviser grænser på SENSOREN — de hører på zonen", async () => {
    /* Lå tærsklen i måledata, ville en justering skrive bagud i historikken.
       .validate: false gør at fejlen ikke kan indføres ved et uheld. */
    const db = som("admin1", "admin");
    await assertSucceeds(set(ref(db, `tenants/${TENANT}/facility/sensorer/zo-ok/aktuel`),
      { tempC: 4.1, fugtPct: 79, ms: 1e12 }));
    await assertFails(set(ref(db, `tenants/${TENANT}/facility/sensorer/zo-ok/graenser`),
      { minC: 2, maksC: 6 }));
    await assertFails(set(ref(db, `tenants/${TENANT}/facility/sensorer/zo-ok/aktuel`),
      { tempC: 4.1, fugtPct: 140, ms: 1e12 }));
  });

  it("kræver at en fejl peger på et anlæg der findes, med kendt alvor", async () => {
    const db = som("admin1", "admin");
    const fejl = { aktivId: "fa-a", status: "ny", alvor: "hoej", meldtMs: 1e12,
                   beskrivelse: "Porten lukker langsomt" };
    await assertSucceeds(set(ref(db, p("fejl", "fe-a")), fejl));
    await assertFails(set(ref(db, p("fejl", "fe-luft")), { ...fejl, aktivId: "fa-findes-ikke" }));
    await assertFails(set(ref(db, p("fejl", "fe-alvor")), { ...fejl, alvor: "kritisk" }));
  });

  it("afviser en division på facility-stamdata", async () => {
    /* Facility er FÆLLES — porten er den samme uanset hvem der kører
       igennem den. Samme begrundelse som beslutning 19. */
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, p("lokationer", "lok-div")), { ...lok, division: "gods" }));
  });

  it("afviser en ukendt omkostningspost", async () => {
    /* Komponenterne er faste. En sjette post ville ikke komme med i
       bygningsomkostningOere(), og totalen ville stille være for lav. */
    const db = som("admin1", "admin");
    await assertSucceeds(set(ref(db, `tenants/${TENANT}/facility/omkostning/el`), 2180000));
    await assertFails(set(ref(db, `tenants/${TENANT}/facility/omkostning/kaffe`), 4200));
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Indkøb — beslutning 2 stod kun i en kommentar
   ══════════════════════════════════════════════════════════════════════ */
describe("indkøb valideres på serveren", () => {
  const p = (id) => `tenants/${TENANT}/indkoeb/${id}`;
  const linje = (ekstra = {}) => ({
    dato: 1e12, leverandoerId: "lv-hydra",
    vare: "Hydraulikslange 3/8\"", antal: 12, prisPrEnhedOere: 1850,
    fakturastatus: "modtaget", ...ekstra,
  });

  it("tager en fuldt udfyldt linje", async () => {
    const db = som("admin1", "admin");
    await assertSucceeds(set(ref(db, p("il-ok")), linje({
      enhed: "stk", kategori: "reservedele", reference: "HYD-450078912",
    })));
  });

  it("afviser en pris som FLOAT", async () => {
    /* ⚠ DEN HER ER HELE BESLUTNING 2. 18,50 kr/stk er 1850 — ikke 18.5.
       En float ender som 1849,999 i en sum over hundrede linjer, og så går
       afstemningen mod leverandørens faktura ikke op med en øre ingen kan
       forklare. isNumber() alene rækker ikke: 1850.5 er også et tal. */
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, p("il-float")), linje({ prisPrEnhedOere: 18.5 })));
    await assertFails(set(ref(db, p("il-float2")), linje({ prisPrEnhedOere: 1850.5 })));
    await assertFails(set(ref(db, p("il-str")), linje({ prisPrEnhedOere: "1850" })));
    await assertFails(set(ref(db, p("il-neg")), linje({ prisPrEnhedOere: -1 })));
  });

  it("afviser et gemt linjebeløb", async () => {
    /* Beløbet BEREGNES af antal × pris. To kilder til samme tal kan drive
       fra hinanden, og så mangler en post uden at totalen afslører det. */
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, p("il-total")), linje({ beloebOere: 22200 })));
  });

  it("afviser moms som float og kræver at den står for sig", async () => {
    const db = som("admin1", "admin");
    await assertSucceeds(set(ref(db, p("il-moms")), linje({ momsOere: 5550 })));
    await assertFails(set(ref(db, p("il-momsf")), linje({ momsOere: 55.5 })));
  });

  it("kræver de felter en linje ikke kan undvære", async () => {
    /* En linje uden leverandør kan ikke matches mod en faktura; en uden
       vare kan ingen genkende et halvt år senere. */
    const db = som("admin1", "admin");
    for (const felt of ["leverandoerId", "vare", "antal", "prisPrEnhedOere", "fakturastatus", "dato"]) {
      const uden = linje();
      delete uden[felt];
      await assertFails(set(ref(db, p(`il-uden-${felt}`)), uden));
    }
  });

  it("afviser ukendt kategori og fakturastatus", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, p("il-kat")), linje({ kategori: "diverse" })));
    await assertFails(set(ref(db, p("il-stat")), linje({ fakturastatus: "betalt" })));
  });

  it("kræver at et køretøj på linjen findes", async () => {
    /* Et indkøb er købt TIL noget. Peger det på en bil der ikke findes, er
       linjen et beløb uden ærinde. */
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, p("il-bil")), linje({ koeretoejId: "kt-findes-ikke" })));
  });

  it("tillader faelles — én dieselleverance dækker begge afdelinger", async () => {
    const db = som("admin1", "admin");
    await assertSucceeds(set(ref(db, p("il-faelles")), linje({})));
  });
});
