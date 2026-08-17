/* test/useliste.test.mjs
 * Forespørgslen useListe bygger — og den ene fejl der tømte fem skærme.
 *
 * ⚠ ET INTERVAL UDEN `ordnPaa` FILTRERER PÅ NØGLEN.
 *
 * Uden `orderByChild()` ordner RTDB efter nøgle, og `startAt(1786…)` mod
 * nøgler som "p-a-01-02" eller "CRR-100245" matcher ingenting. Hver skærm der
 * kaldte useListe uden både `ordnPaa` og `vindue: "alle"` — Lokationer,
 * Bevægelser, Optælling, Pluk, Standardpriser — hentede derfor NUL rækker fra
 * en base der var fuld af data.
 *
 * ⚠ OG DEMO-VEJEN GJORDE DET RIGTIGE HELE TIDEN. `somServeren()` har altid
 * kun anvendt intervallet under `if (ordnPaa)`. De to veje sagde altså hver
 * sit om det samme kald, og det var demo-vejen der havde ret — så fejlen var
 * usynlig præcis dér hvor man kigger efter den.
 *
 * Prøverne herunder binder de to sammen. Går de fra hinanden igen, er det
 * ikke til at se på en skærm: en tom tabel ligner et tomt lager.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hentListe, maanedsSegmenter, MAX_PARTITIONER, somServeren, byg,
} from "../src/fleet/liste.js";

/* En attrap for RTDB-referencen. Den svarer ikke på data — den REGISTRERER
   hvad der blev bygget, hvilket er det eneste prøven skal vide. */
function attrap(raekker = {}) {
  const kaldt = [];
  const lav = (sti) => {
    const q = {
      orderByChild: (f) => { kaldt.push(["orderByChild", f]); return q; },
      equalTo: (v) => { kaldt.push(["equalTo", v]); return q; },
      startAt: (v) => { kaldt.push(["startAt", v]); return q; },
      endAt: (v) => { kaldt.push(["endAt", v]); return q; },
      limitToLast: (n) => { kaldt.push(["limitToLast", n]); return q; },
      once: async () => ({
        forEach: (fn) => {
          for (const [noegle, val] of Object.entries(raekker[sti] || {})) {
            fn({ key: noegle, val: () => val });
          }
        },
      }),
    };
    return q;
  };
  return { ref: lav, kaldt, navne: () => kaldt.map(([n]) => n) };
}

const sti = (n) => `tenants/t1/${n}`;
const PERIODE = { fra: 1786000000000, til: 1786600000000 };

describe("forespørgslen bygges af præcis ét server-side felt", () => {
  it("⚠ LÆGGER IKKE ET INTERVAL PÅ EN FORESPØRGSEL UDEN ordnPaa", () => {
    /* Det er fejlen. Uden et felt at ordne efter ville startAt/endAt filtrere
       på NØGLEN, og en nøgle som "CRR-100245" ligger uden for ethvert
       millisekund-interval. Resultatet var en tom liste fra en fuld base. */
    const db = attrap();
    hentListe(db, sti, "carriers", { interval: PERIODE, graense: 2000 });
    assert.ok(!db.navne().includes("startAt"),
      "der lægges et nøglefilter på en forespørgsel uden ordnPaa");
    assert.ok(!db.navne().includes("endAt"));
    assert.deepEqual(db.kaldt, [["limitToLast", 2000]]);
  });

  it("lægger intervallet på når der ER et felt at lægge det på", () => {
    const db = attrap();
    hentListe(db, sti, "bookinger", { ordnPaa: "afgangMs", interval: PERIODE });
    assert.deepEqual(db.kaldt, [
      ["orderByChild", "afgangMs"],
      ["startAt", PERIODE.fra],
      ["endAt", PERIODE.til],
    ]);
  });

  it("bruger equalTo frem for interval når `lig` er sat", () => {
    /* Enten det ene eller det andet — aldrig begge. RTDB kan kun filtrere på
       ét felt, og to filtre ville betyde at det ene blev tabt i tavshed. */
    const db = attrap();
    hentListe(db, sti, "kunder", { ordnPaa: "aktiv", lig: true, interval: PERIODE });
    assert.deepEqual(db.kaldt, [["orderByChild", "aktiv"], ["equalTo", true]]);
  });

  it("læser id'et af NØGLEN og ikke af værdien", () => {
    /* To kilder til samme felt er præcis den slags der kan nå at blive
       uenige. Nøglen er den der bruges i stier. */
    const db = attrap({
      [sti("carriers")]: { "CRR-1": { type: "pallekasse" } },
    });
    return hentListe(db, sti, "carriers", {}).then((r) => {
      assert.deepEqual(r, [{ id: "CRR-1", type: "pallekasse" }]);
    });
  });
});

describe("månedspartitionerne", () => {
  it("dækker hver måned i intervallet", () => {
    const fra = Date.UTC(2026, 0, 15);
    const til = Date.UTC(2026, 2, 3);
    const s = maanedsSegmenter(fra, til);
    assert.ok(s.includes("2026/01"));
    assert.ok(s.includes("2026/02"));
    assert.ok(s.includes("2026/03"));
  });

  it("⚠ AFKORTER IKKE I TAVSHED — den kaster", async () => {
    /* Rammes loftet, er perioden for bred til en rå liste, og svaret er et
       aggregeret tal fra kpi/ — ikke de første 24 måneder uden en besked. */
    const db = attrap();
    const fra = Date.UTC(2020, 0, 1);
    const til = Date.UTC(2026, 0, 1);
    await assert.rejects(
      () => hentListe(db, sti, "audit", {
        ordnPaa: "ms", partition: "maaned", interval: { fra, til },
      }),
      new RegExp(String(MAX_PARTITIONER)));
  });
});

describe("demo-vejen og serveren siger det samme", () => {
  /* ⚠ DET VAR DÉR FEJLEN GEMTE SIG. `somServeren()` anvendte kun intervallet
     under `if (ordnPaa)`, mens `byg()` lagde det på uanset — så demo viste
     rækker og DEV viste ingen. To veje til det samme kald, og kun den ene
     havde ret. */
  const RAEKKER = [
    { id: "CRR-1", type: "pallekasse" },
    { id: "CRR-2", type: "gitterbur" },
  ];

  it("uden ordnPaa filtrerer INGEN af dem på et interval", () => {
    const o = { interval: PERIODE, graense: 2000 };

    /* Demo-vejen: alle rækker overlever. */
    assert.equal(somServeren(RAEKKER, o).length, 2);

    /* Serveren: ingen startAt/endAt at filtrere med. */
    const db = attrap();
    byg(db.ref(sti("carriers")), o);
    assert.ok(!db.navne().includes("startAt"));
  });

  it("med ordnPaa filtrerer BEGGE på intervallet", () => {
    const o = { ordnPaa: "ms", interval: { fra: 10, til: 20 } };
    const raekker = [{ id: "a", ms: 5 }, { id: "b", ms: 15 }, { id: "c", ms: 25 }];
    assert.deepEqual(somServeren(raekker, o).map((r) => r.id), ["b"]);

    const db = attrap();
    byg(db.ref(sti("bevaegelser")), o);
    assert.deepEqual(db.navne(), ["orderByChild", "startAt", "endAt"]);
  });
});
