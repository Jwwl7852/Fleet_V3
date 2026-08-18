/* test/rules.division.test.mjs
 * Punkt 0 i den låste rækkefølge: .validate for beslutning 15.
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
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set, update, get } from "firebase/database";
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

describe("beslutning 15 — division som felt", () => {
  it("accepterer gods, bus og faelles på en kunde", async () => {
    const db = som("admin1", "admin");
    for (const division of ["gods", "bus", "faelles"]) {
      await assertSucceeds(
        set(ref(db, sti("kunder", `k-${division}`)), kunde({ division }))
      );
    }
  });

  it("afviser en kunde HELT uden division", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, sti("kunder", "k-mangler")), kunde()));
  });

  it("afviser en ukendt divisionsværdi", async () => {
    const db = som("admin1", "admin");
    for (const vaerdi of ["Gods", "GODS", "taxa", "", "faelles ", "gods,bus"]) {
      await assertFails(
        set(ref(db, sti("kunder", "k-ugyldig")), kunde({ division: vaerdi }))
      );
    }
  });

  it("afviser division som noget andet end en streng", async () => {
    const db = som("admin1", "admin");
    for (const vaerdi of [true, 1, null]) {
      await assertFails(
        set(ref(db, sti("kunder", "k-type")), kunde({ division: vaerdi }))
      );
    }
  });

  it("kræver division på opgaver, indberetninger og indkøb", async () => {
    const db = som("admin1", "admin");
    const noder = [
      ["opgaver", { art: "vaerksted", dato: 1786000000000 }],
      ["indberetninger", { type: "braendstof", km: 184320, oprettetAf: "admin1" }],
      /* ⚠ FIXTURET HAVDE beloebOere. Det er nu forbudt: linjens beloeb
         BEREGNES af antal x pris, og to kilder til samme tal kan drive fra
         hinanden. Posten her er en rigtig indkoebslinje — den proever
         division, ikke hvor lidt man kan slippe afsted med. */
      ["indkoeb", { dato: 1786000000000, leverandoerId: "lv-hydra", vare: "Slange",
                    antal: 12, prisPrEnhedOere: 1850, momsOere: 5550,
                    fakturastatus: "modtaget" }],
    ];
    for (const [node, post] of noder) {
      await assertFails(set(ref(db, sti(node, "uden")), post));
      await assertSucceeds(set(ref(db, sti(node, "med")), { ...post, division: "gods" }));
    }
  });

  /* BESLUTNING 19. Koeretoejer stod paa listen ovenfor indtil beslutning 19:
     stamdata har ikke en division. En paahaengsvogn eller en varevogn kan
     tilhoere baade en gods- og en busvognmand, saa feltet kunne ikke begrundes
     paa den enkelte bil — og et felt der maa staa der uden at betyde noget,
     bliver udfyldt og derefter laest af nogen.

     Testen er vendt frem for slettet: den skal fastholde at feltet er FORBUDT,
     ikke bare at det er valgfrit. Aabner nogen det igen, falder den. */
  it("afviser division på køretøjer og personale — stamdata har ingen", async () => {
    const db = som("admin1", "admin");

    const bil = { navn: "Volvo FH 500", status: "aktiv", art: "lastbil" };
    await assertSucceeds(set(ref(db, sti("koeretoejer", "k-uden")), bil));
    await assertFails(set(ref(db, sti("koeretoejer", "k-med")), { ...bil, division: "gods" }));
    await assertFails(set(ref(db, sti("koeretoejer", "k-faelles")), { ...bil, division: "faelles" }));
    await assertFails(set(ref(db, `${sti("koeretoejer", "k-uden")}/division`), "bus"));

    const person = { navn: "Lars Aage", status: "aktiv" };
    await assertSucceeds(set(ref(db, sti("personale", "p-uden")), person));
    await assertFails(set(ref(db, sti("personale", "p-med")), { ...person, division: "gods" }));
    await assertFails(set(ref(db, sti("personale", "p-faelles")), { ...person, division: "faelles" }));
    await assertFails(set(ref(db, `${sti("personale", "p-uden")}/division`), "bus"));
  });

  it("afviser division OG årsag på fravær — begge arves eller er følsomme", async () => {
    const db = som("admin1", "admin");
    const fravaer = { personId: "lars", fra: 1786000000000, til: 1786600000000 };
    await assertSucceeds(set(ref(db, sti("fravaer", "f1")), fravaer));

    /* Division arves fra medarbejderen. */
    await assertFails(set(ref(db, sti("fravaer", "f2")), { ...fravaer, division: "gods" }));

    /* ÅRSAGEN er en anden sag: "sygdom" er en helbredsoplysning og dermed
       særlig kategori efter GDPR art. 9. Tilgængeligheden er planlægningsdata
       — disponenten skal vide at Lars ikke er der 14.-18. juli — men ikke
       hvorfor. `art` hører derfor i sensitive/fravaer og afvises her. */
    await assertFails(set(ref(db, sti("fravaer", "f3")), { ...fravaer, art: "sygdom" }));
    await assertFails(set(ref(db, sti("fravaer", "f1") + "/art"), "ferie"));
  });
});

describe("smuthuller", () => {
  /* Det klassiske hul i RTDB: .validate på $id evalueres ikke nødvendigvis
     når man skriver til et BARN af $id. Kan man skrive kunden i to trin og
     ende med en post uden division, er reglen kun pynt. */
  it("kan man snige sig uden om ved at skrive felt for felt?", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, `${sti("kunder", "k-smutvej")}/navn`), "Snydekunde"));
  });

  it("kan man fjerne division fra en eksisterende post?", async () => {
    const db = som("admin1", "admin");
    const p = sti("kunder", "k-fjern");
    await assertSucceeds(set(ref(db, p), kunde({ division: "gods" })));
    await assertFails(update(ref(db, p), { division: null }));
  });

  /* Modprøven til smutvejen ovenfor. Hvis forældrereglen
     hasChildren(['division']) kigger på det SKREVNE undertræ frem for det
     flettede resultat, ville en helt almindelig navneretning på en gyldig
     kunde også blive afvist — og så var reglen ubrugelig i praksis. */
  it("men en almindelig feltopdatering på en gyldig post går stadig igennem", async () => {
    const db = som("admin1", "admin");
    const p = sti("kunder", "k-redigér");
    await assertSucceeds(set(ref(db, p), kunde({ division: "gods" })));
    await assertSucceeds(set(ref(db, `${p}/navn`), "Kolding Kommune, Teknik & Miljø"));
    await assertSucceeds(update(ref(db, p), { navn: "Kolding Kommune", aktiv: false }));
  });

  it("kan man ændre division til noget ugyldigt bagefter?", async () => {
    const db = som("admin1", "admin");
    const p = sti("kunder", "k-aendre");
    await assertSucceeds(set(ref(db, p), kunde({ division: "gods" })));
    await assertFails(set(ref(db, `${p}/division`), "taxa"));
    await assertSucceeds(set(ref(db, `${p}/division`), "faelles"));
  });
});

/* Tenant-isolation ligger i rules.tenant.test.mjs — punkt 1. Her holder vi os
   til rolle og division, så de to suiter ikke overlapper. */
describe("rolle og division i samme skrivning", () => {
  it("en chauffør må ikke skrive kunder, uanset gyldig division", async () => {
    const db = som("chauffoer1", "chauffoer");
    await assertFails(set(ref(db, sti("kunder", "k-chauffoer")), kunde({ division: "gods" })));
  });

  it("kpi-noden er skrivebeskyttet for alle — kun Cloud Functions", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, `tenants/${TENANT}/kpi/gods/current`), { kunder: { aktive: 51 } }));
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
    division: "gods", dato: 1e12, leverandoerId: "lv-hydra",
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
    await assertSucceeds(set(ref(db, p("il-faelles")), linje({ division: "faelles" })));
  });
});
