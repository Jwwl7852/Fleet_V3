import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { afgoerRetur, opretReturtilstand } from "../fleet-v2/src/data/navigationHistory.js";

describe("FLEETs route-sikre tilbage-navigation", () => {
  it("bevarer intern sti, query og scrollposition", () => {
    const tilstand = opretReturtilstand("/fleet-v2/enheder?status=operation&side=2", 638);
    assert.deepEqual(afgoerRetur({
      tilstand,
      fallback: "/fleet-v2/enheder",
      tilladteRodstier: ["/fleet-v2"],
    }), {
      handling: "historik",
      sti: "/fleet-v2/enheder?status=operation&side=2",
      scrollY: 638,
    });
  });

  it("bruger en meningsfuld fallback ved direkte åbning", () => {
    assert.deepEqual(afgoerRetur({
      tilstand: null,
      fallback: "/fleet-v2/arbejdsko",
      tilladteRodstier: ["/fleet-v2"],
    }), { handling: "fallback", sti: "/fleet-v2/arbejdsko", scrollY: 0 });
  });

  it("afviser ekstern, protokolrelativ og fremmed intern retursti", () => {
    for (const sti of ["https://example.com", "//example.com", "/opsaetning/brugere", "\\evil"] ) {
      assert.equal(afgoerRetur({
        tilstand: { veyroRetur: { sti, scrollY: 99 } },
        fallback: "/fleet-v2",
        tilladteRodstier: ["/fleet-v2"],
      }).handling, "fallback");
    }
  });

  it("tillader interne returstier i standalone-visningen med roden som grænse", () => {
    assert.equal(afgoerRetur({
      tilstand: opretReturtilstand("/enheder/unit-17", 12),
      fallback: "/enheder",
      tilladteRodstier: ["/"],
    }).handling, "historik");
  });
});
