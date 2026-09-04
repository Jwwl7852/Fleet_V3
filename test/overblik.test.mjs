/* test/overblik.test.mjs
 * Procures overblik — beslutning 84, planche 5. Modulets forside.
 *
 * ⚠ HVAD DEN HER PRØVE HOLDER FAST I:
 *
 *   1. **Fire af de fem tal regnes af listerne, ikke af `kpi/`.** De er afledt
 *      af data skærmen alligevel henter — undtagelsen i CLAUDE.md. Et gemt tal
 *      ville drive fra sit grundlag.
 *   2. **Det femte kan ikke regnes, og det siger det.** `forbrugsvarer` findes
 *      ikke, og Warehouses lager er KUNDENS gods.
 *   3. **Planchens gentagne tal er ikke gentaget.** Den viser "Bestillinger 12"
 *      og "Fakturaer 4" både øverst og nederst; to visninger af ét tal er to
 *      steder der kan nå at blive uenige.
 *   4. **Aksen er ude af Procure.** Registreringsformularen havde et påkrævet
 *      Division-felt på en node hvis regel forbyder feltet.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { beregnKpi } from "../src/fleet/kpi-aggregering.js";
import { DEMO_KPI } from "../src/fleet/demo-kpi.js";
import { ventendeOrdrer, matchtilstand } from "../src/fleet/procure.js";
import { DEMO_INDKOEBSBEHOV, DEMO_INDKOEBSORDRER, DEMO_GODKENDELSESREGLER }
  from "../src/fleet/demo-procure.js";

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/* ⚠ OVERSIGT.JSX ER OMBYGGET TIL ET KOMPAKT STATUS-OVERBLIK (Procure TARGET,
   produktejer-review 2026-09-02) — se filens eget hoved. Det gamle
   procesbånd, den leverandørforslags-drevne indbakke og
   registreringsformularen er FLYTTET, ikke slettet: se Bestillinger.jsx og
   Varer.jsx. Prøverne nedenfor er opdateret til at pege på hvor hver
   kendsgerning faktisk lever nu; håndhævelsen i fleet/procure.js og
   firebase.rules.json er UÆNDRET. */
const SKAERM = udenKommentarer(readFileSync("src/moduler/indkoeb/Oversigt.jsx", "utf8"));
const RAA = readFileSync("src/moduler/indkoeb/Oversigt.jsx", "utf8");
const VARER_SKAERM = udenKommentarer(readFileSync("src/moduler/indkoeb/Varer.jsx", "utf8"));
const NAV = readFileSync("src/fleet/nav.js", "utf8");
const REGELFIL = readFileSync("firebase.rules.json", "utf8");

/* ══════════════════════════════════════════════════════════════════════════
   DE FEM TAL
   ══════════════════════════════════════════════════════════════════════════ */
describe("Fire tal regnes, det femte kan ikke", () => {
  /**
   * ⚠ "KRÆVER HANDLING" ER IKKE "FINDES". Et afvist behov er der taget
   * stilling til, og et bestilt ligger på en ordre — begge ville puste tallet
   * op med arbejde der ER gjort, og et tal der aldrig falder, holder man op
   * med at kigge på.
   */
  test("⚠ ÅBNE BEHOV TÆLLER HVERKEN BESTILTE ELLER AFVISTE", () => {
    const aabne = DEMO_INDKOEBSBEHOV.filter(
      (b) => b.status !== "bestilt" && b.status !== "afvist");
    assert.ok(aabne.length < DEMO_INDKOEBSBEHOV.length,
      "der er hverken et bestilt eller et afvist behov i demo — filteret kan ikke ses virke");
    for (const b of aabne) {
      assert.ok(b.status !== "bestilt" && b.status !== "afvist");
    }
    assert.match(SKAERM, /b\.status !== "bestilt" && b\.status !== "afvist"/);
  });

  /**
   * ⚠ ÅBEN BESTILLING = SENDT, IKKE MODTAGET. En kladde er aldrig sendt, og en
   * annulleret er ikke åben — begge ville tælle med i "det vi venter på fra
   * leverandøren", som er hele kortets spørgsmål.
   */
  /**
   * ⚠ IKKE LÆNGERE ET EGET KpiKort — "Sendt, afventer levering" ER NU EN
   * FILTER-TILE over den samlede pipeline-liste (se Oversigt.jsx's hoved).
   * Den bygges af `ordreTilRaekke()`, som sætter `filter: "sendt"` PRÆCIS
   * for `o.status === "sendt"` — samme afgrænsning, ny kode.
   */
  test("⚠ ÅBNE BESTILLINGER ER KUN DE SENDTE", () => {
    assert.match(SKAERM, /o\.status === "sendt" \? "sendt"/);
    const aabne = DEMO_INDKOEBSORDRER.filter((o) => o.status === "sendt");
    assert.ok(aabne.length >= 1, "ingen sendt ordre i demo — kortet kan ikke ses virke");
    assert.ok(DEMO_INDKOEBSORDRER.some((o) => o.status === "kladde"),
      "ingen kladde i demo — så kan man ikke se at den IKKE tælles med");
  });

  /* Køen er den samme `ventendeOrdrer()` som Bestillinger-skærmen bruger — to
     opslag ville kunne svare hver sit på "hvor mange venter". */
  test("⚠ KØEN REGNES MED SAMME ventendeOrdrer() SOM BESTILLINGER-SKÆRMEN", () => {
    assert.match(SKAERM, /ventendeOrdrer\(ordrer\.data, regler\)/);
    const koe = ventendeOrdrer(DEMO_INDKOEBSORDRER, DEMO_GODKENDELSESREGLER);
    assert.ok(koe.length >= 1, "tom kø i demo — kortet kan ikke ses virke");
  });

  /**
   * ⚠ EN HÆNGENDE REFERENCE TÆLLER SOM UDEN MATCH. Et destinationId der peger på
   * noget som ikke findes, ser matchet ud og er det ikke — og den er allerede
   * talt som afstemt. Det er den farligste af de to.
   */
  test("⚠ EN HÆNGENDE destinationId TÆLLER SOM UDEN MATCH", () => {
    assert.match(SKAERM, /f\.destinationId && !findesOrdre\.has\(f\.destinationId\)/);
    const findes = new Set(DEMO_INDKOEBSORDRER.map((o) => o.id));
    const haenger = { id: "x", destinationArt: "procure", destinationId: "findes-ikke", status: "modtaget" };
    assert.equal(matchtilstand(haenger), "matchet",
      "matchtilstand() ser kun på om feltet er sat — derfor skal skærmen tjekke at det RAMMER");
    assert.ok(!findes.has(haenger.destinationId));
  });

  /**
   * ⚠ DE TO PRØVER HER STOD OMVENDT — OG DE FYREDE SOM AFTALT.
   *
   * I beslutning 84 var `lavBeholdning` `null` med grunden **ingen kilde**,
   * og en prøve ved siden af krævede at `forbrugsvarer` IKKE fandtes — med
   * noten "når den gør, skal tallet regnes". Noden kom i beslutning 85, og
   * begge prøver blev røde i samme kørsel.
   *
   * ⚠ DET ER SÅDAN EN PRØVE OM ET MELLEMSTADIE SKAL OPFØRE SIG. Beslutning
   * 79, 82 og 83 fandt tre der blev stående grønne om noget der var ovre;
   * den her fejlede det sekund manglen blev lukket, og pegede på hvad der
   * så skulle rettes. Se `PERM_GODKEND_MIDLERTIDIG` for den modsatte slags.
   */
  test("⚠ lavBeholdning REGNES AF forbrugsvarer — IKKE AF WAREHOUSES varer", () => {
    /* Uden varer er svaret nul, ikke null: noden findes, den er bare tom. */
    assert.equal(beregnKpi({}).indkoeb.lavBeholdning, 0);

    const k = beregnKpi({
      forbrugsvarer: [
        { id: "a", beholdning: 2, minimumBeholdning: 5 },
        { id: "b", beholdning: 50, minimumBeholdning: 10 },
        { id: "c", beholdning: 1 },
      ],
    });
    assert.equal(k.indkoeb.lavBeholdning, 1, "kun den under sin grænse er lav");
    /* ⚠ OG DEN UDEN GRÆNSE TÆLLES FOR SIG. Uden det tal betyder "0 under
       minimum" både "alt er fyldt op" og "ingen har sat en grænse". */
    assert.equal(k.indkoeb.forbrugsvarerUdenGraense, 1);

    /* ⚠ DEMOFILEN SKAL PASSE I BEGGE RETNINGER (beslutning 60). */
    for (const felt of ["lavBeholdning", "forbrugsvarerUdenGraense"]) {
      assert.ok(felt in DEMO_KPI.indkoeb,
        `aggregeringen skriver ${felt}, som demofilen ikke kender`);
    }
  });

  /**
   * ⚠ OG DEN MÅ IKKE REGNES AF WAREHOUSES LAGER.
   *
   * `varer`/`beholdning` er KUNDENS gods — 3PL, med et påkrævet `kundeId`.
   * Et tal derfra ville få Procure til at bede os bestille noget en KUNDE
   * mangler. Det er den samme navnekollision som `warehouse` mod `lagre`,
   * og her ville den koste et indkøb.
   */
  test("⚠ WAREHOUSES varer PÅVIRKER IKKE lavBeholdning", () => {
    const k = beregnKpi({
        varer: [{ id: "x", kundeId: "k1" }, { id: "y", kundeId: "k2" }],
        beholdning: [{ id: "b1", antal: 0 }],
    });
    assert.equal(k.indkoeb.lavBeholdning, 0,
      "kundens gods tælles som vores eget lager");
  });

  /**
   * ⚠ OG NOTEN UNDER TALLET SKAL FØLGE MED.
   *
   * Kortet sagde "varelageret er ikke bygget endnu" mens tallet stod som —.
   * Da noden kom (beslutning 85), fik tallet sin værdi, og noten blev en
   * usandhed under et rigtigt tal. En tekst der siger at noget ikke er
   * bygget, er den slags der overlever fordi ingen læser den igen.
   */
  test("⚠ NOTEN PÅSTÅR IKKE AT VARELAGERET MANGLER", () => {
    assert.ok(!/ikke bygget endnu/.test(SKAERM),
      "kortet siger stadig at varelageret mangler — noden findes");
    assert.ok(SKAERM.includes('til="/indkoeb/varelager"'),
      "kortet fører ingen steder hen");
  });

  test("⚠ SKÆRMEN SKRIVER — OG IKKE 0 FOR DET UBEREGNEDE", () => {
    assert.match(SKAERM, /vaerdi=\{num\(k\?\.indkoeb\?\.lavBeholdning\)\}/,
      "tallet går ikke gennem num(), som skriver INTET for null");
    assert.ok(!/lavBeholdning \|\| 0/.test(SKAERM),
      "et manglende tal bliver til nul — og nul er en påstand om at intet mangler");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   DEN TAVSE TOMME LISTE
   ══════════════════════════════════════════════════════════════════════════ */
describe("Alle skærme spørger fakturaerne om det samme felt", () => {
  /**
   * ⚠ EN FAKTURA HAR INTET `dato`-FELT — DEN HAR `fakturadatoMs`.
   *
   * `indkoeb/Oversigt.jsx` sorterede og vinduesfiltrerede på `dato`. RTDB
   * fejler ikke på et ukendt felt: tidsvinduet filtrerede på noget ingen post
   * bærer, og listen kom hjem **tom**. Nøgletallene ovenfor kom fra `kpi/` og
   * stod rigtigt imens, så der var intet at se.
   *
   * Det blev fundet fordi Overblikkets nye kort sagde **"Fakturaer uden
   * match: 0"** mens fakturaskærmen sagde 9. To skærme, samme spørgsmål, to
   * svar — og **det tavse nul var det farligste**: nul uden match ser ud som
   * en afstemning der går op.
   *
   * ⚠ Samme fælde som `opgaver."dato"` og som indekset der pegede på
   * `godkendelsesstatus`. Se beslutning 84.
   */
  test("⚠ HVER FAKTURALISTE ORDNER PÅ fakturadatoMs", () => {
    const fejl = [];
    for (const f of ["Oversigt", "Fakturaer", "Leverandoerer", "Statistik"]) {
      const sti = `src/moduler/indkoeb/${f}.jsx`;
      const kode = udenKommentarer(readFileSync(sti, "utf8"));
      for (const m of kode.matchAll(/useListe\("fakturaer",\s*\{([^}]*)\}/g)) {
        if (!/ordnPaa: "fakturadatoMs"/.test(m[1])) {
          fejl.push(`${sti}: ${m[1].trim().split(/\r?\n/)[0]}`);
        }
      }
    }
    assert.deepEqual(fejl, [],
      "en skærm ordner fakturaerne på et felt de ikke bærer. RTDB fejler ikke — "
      + "listen kommer hjem tom, og et tomt resultat ligner et rigtigt svar. "
      + fejl.join(" | "));
  });

  /* Og feltet skal være indekseret — ellers henter RTDB hele noden ned og
     filtrerer i klienten med en advarsel i konsollen. */
  test("⚠ fakturadatoMs ER INDEKSERET", () => {
    const i = REGELFIL.indexOf('"fakturaer": {');
    assert.match(REGELFIL.slice(i, i + 2500), /"\.indexOn": \[[^\]]*"fakturadatoMs"/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   PROCESBÅNDET OG GENVEJENE
   ══════════════════════════════════════════════════════════════════════════ */
/**
 * ⚠ DET NUMMEREREDE PROCESBÅND ER VÆK, MED VILJE (Procure TARGET,
 * produktejer-review 2026-09-02). Overblik viste før en illustration af
 * fem trin; nu ER pipeline-listen selv den klikbare status — se filens
 * hoved. De to invarianter der stadig gælder — hvert link fører et sted
 * der findes, og en genvej bærer ikke sit eget tal — er flyttet med til
 * den nye struktur; den leverandørforslags-drevne indbakke er det ikke,
 * fordi den bor i Bestillinger.jsx nu, ikke her.
 */
describe("Overblikkets links fører et sted der findes", () => {
  /* ⚠ HVERT LINK FØRER ET STED HEN. Genvejene og "Åbn Bestillinger" er
     stadig klikbare veje ind i modulet — de skal pege på ruter der findes. */
  test("⚠ ALLE /indkoeb- OG /oekonomi-LINKS FINDES I nav.js", () => {
    const stier = [...RAA.matchAll(/to="(\/(?:indkoeb|oekonomi)[^"?]*)/g)].map((m) => m[1]);
    assert.ok(stier.length >= 5, `kun ${stier.length} links i skærmen`);
    for (const sti of new Set(stier)) {
      assert.ok(NAV.includes(`"${sti}"`), `${sti} findes ikke i nav.js`);
    }
  });

  /**
   * ⚠ GENVEJENE MÅ IKKE BÆRE ET TAL. "Bestillinger 12" og "Fakturaer 4" stod
   * BÅDE i en tile øverst og i en genvej nederst i den gamle udgave — det
   * samme tal to steder på én skærm er to steder der kan nå at blive uenige
   * (beslutning 11 og 14). Filter-tilesene øverst bærer tallet; "Sådan virker
   * det"-genvejene nederst bærer det ikke.
   */
  test("⚠ GENVEJENE BÆRER INGEN TAL", () => {
    const i = RAA.indexOf('className="fc-genveje"');
    assert.ok(i > 0, "genvejene findes ikke");
    const blok = RAA.slice(i, RAA.indexOf("</div>", i));
    assert.ok(!/\{num\(|\{kr\(|vaerdi=/.test(blok),
      "en genvej bærer et tal — det samme tal to steder kan nå at blive uenige");
  });

  /* ⚠ OG "KRÆVER HANDLING" ER STADIG DEN ENESTE AFLEDTE TÆLLING HERPÅ
     SKÆRMEN — se filens hoved om hvorfor den IKKE gætter på en forsinket
     levering. */
  test("⚠ KRÆVER HANDLING-TÆLLINGEN NÆVNER IKKE EN FORVENTET LEVERINGSDATO", () => {
    assert.ok(!/forventetLeverings|leveringsdato: /.test(SKAERM),
      "skærmen har fundet på et felt der ikke findes på en ordre");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   AKSEN ER UDE AF PROCURE
   ══════════════════════════════════════════════════════════════════════════ */
describe("Divisionsaksen er ude af modulet", () => {
  /**
   * ⚠ DET PÅKRÆVEDE FELT VAR EN BLINDGYDE.
   *
   * Registreringsformularen havde `<Felt id="ik-div" label="Division" kraevet>`
   * mens `indkoeb`-reglen har `"division": { ".validate": false }`. Vælger man
   * en værdi, AFVISER serveren skrivningen; vælger man ingen, klager
   * formularen. Vejen ind var lukket i begge retninger, og ikke én prøve sagde
   * noget — linten kiggede aldrig i `src/moduler/`.
   */
  test("⚠ INGEN DIVISION I REGISTRERINGSFORMULAREN", () => {
    /* ⚠ FORMULAREN BOR I Varer.jsx NU (Procure TARGET, flyttet uændret fra
       Oversigt.jsx) — se filens hoved. */
    assert.ok(!/id="ik-div"/.test(VARER_SKAERM), "det påkrævede Division-felt er tilbage");
    assert.ok(!/saet\("division"\)/.test(VARER_SKAERM), "formularen sætter division");
  });

  /* ⚠ OG REGLEN FORBYDER FELTET — det er dét der gjorde feltet til en fælde. */
  test("⚠ indkoeb-REGLEN FORBYDER STADIG division", () => {
    const i = REGELFIL.indexOf('"indkoeb": {', REGELFIL.indexOf('"indkoebsordrer"'));
    const blok = REGELFIL.slice(i, i + 9000);
    assert.match(blok, /"division": \{ "\.validate": false \}/);
  });

  /* ⚠ OG INGEN FILTRE DER SAMMENLIGNER TO undefined. `l.division === division`
     slap kun igennem fordi begge sider var undefined — et filter der virker
     ved et tilfælde, holder op med at virke uden varsel. */
  test("⚠ INGEN FILTRE PÅ division", () => {
    assert.ok(!/\.division === division/.test(SKAERM));
    assert.ok(!/DIVISIONER\[/.test(SKAERM), "en Division-kolonne tegner undefined");
  });

  /* Navnet `iDivision` var en påstand om en opdeling der ikke findes. */
  test("⚠ VARIABLEN HEDDER IKKE LÆNGERE iDivision", () => {
    assert.ok(!/\biDivision\b/.test(SKAERM),
      "et navn der siger 'divisionens linjer', får den næste til at tro at der er en opdeling");
  });
});
