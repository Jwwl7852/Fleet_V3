/* test/provisionering.test.mjs
 * Provisioneringen af DEV — spærringen, claims og seed-formen.
 *
 * ⚠ HVORFOR DEN HER TEST FINDES: en seedet disponent skal have PRÆCIS samme
 * adgang som en rigtig disponent. Fik den sit eget sæt permissions, ville man
 * afprøve noget andet end det man leverer — og det er beslutning 5's fejl,
 * flyttet ned i provisioneringen, hvor den er sværere at få øje på.
 *
 * Den anden halvdel er spærringen. Scriptet opretter brugere og skriver
 * testdata; peger nøglen på produktion, rammer det rigtige kunders base.
 * Derfor prøves det, at afvisningen faktisk sker — ikke bare at den er skrevet.
 *
 * Ingen emulator, intet netværk, ingen firebase-admin: scriptet importerer
 * SDK'et først inde i main(), så tjekProjekt og somNode kan prøves alene.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ROLLE_PERMS, harPerm, PERM } from "../src/fleet/permissions.js";
import { DEV_BRUGERE, DEV_TENANT, claimsFor, ejerkonto } from "../src/fleet/dev-brugere.js";
import {
  tjekProjekt, somNode, SEED, DEV_PROJEKT, PROD_PROJEKT,
} from "../scripts/provisioner-dev.mjs";

describe("Spærringen mod produktion", () => {
  it("tillader DEV", () => {
    assert.doesNotThrow(() => tjekProjekt(DEV_PROJEKT));
  });

  /* Ikke konfigurerbar, og det er meningen: en spærring der kan hæves af den
     der rammer den, er ingen spærring. Se beslutning 24. */
  it("afbryder på produktionsprojektet", () => {
    assert.throws(() => tjekProjekt(PROD_PROJEKT), /PRODUKTION/);
  });

  it("afbryder på et ukendt projekt frem for at gætte", () => {
    assert.throws(() => tjekProjekt("et-eller-andet"), /ukendt projekt/);
    assert.throws(() => tjekProjekt(undefined), /ukendt projekt/);
  });
});

describe("De seedede brugere svarer til presetsene", () => {
  it("har præcis én bruger pr. rolle i ROLLE_PERMS", () => {
    const roller = DEV_BRUGERE.map((b) => b.rolle).sort();
    assert.deepEqual(
      roller, Object.keys(ROLLE_PERMS).sort(),
      "en rolle uden en seedet bruger kan ikke afprøves i browseren, og en " +
      "seedet bruger uden en rolle kan ikke få claims"
    );
  });

  it("har unikke e-mailadresser", () => {
    const mails = DEV_BRUGERE.map((b) => b.email);
    assert.equal(new Set(mails).size, mails.length);
  });

  /* Adressen må ikke kunne modtage post. Et rigtigt domæne her ville betyde
     at en glemt-kode-mail fra DEV landede hos et menneske. */
  it("bruger et domæne der ikke kan modtage post", () => {
    for (const b of DEV_BRUGERE) assert.match(b.email, /\.invalid$/);
  });
});

describe("Ejerkontoen er en almindelig konto, ikke en bagdør", () => {
  /* ⚠ AT EJE PRODUKTET ER IKKE ET CLAIM. Kontoen får admin fordi scriptet
     giver den det — ad nøjagtig samme vej som de seks — ikke fordi adressen
     er speciel. En adgang der kommer et andet sted fra end alle andres, er
     den der bliver glemt når rettighederne skal gennemgås. */
  it("får sine claims gennem claimsFor, som alle andre", () => {
    const e = ejerkonto("ejer@eksempel.dk");
    assert.equal(e.rolle, "admin");
    assert.deepEqual(claimsFor(e.rolle), claimsFor("admin"),
      "ejerens claim må ikke kunne afvige fra admin-presettet");
  });

  it("er fraværende når der ikke er sat en adresse", () => {
    for (const tom of [undefined, null, "", "   "]) {
      assert.equal(ejerkonto(tom), null, "uden adresse skal der ikke oprettes noget");
    }
  });

  /* Tavs frasortering ville betyde at man leder efter en konto der aldrig
     blev forsøgt oprettet — og så leder man i Firebase-konsollen i stedet
     for i sin .env.local. */
  it("fejler på en tastefejl frem for at springe kontoen over", () => {
    assert.throws(() => ejerkonto("ikke-en-mail"), /e-mailadresse/);
    assert.throws(() => ejerkonto("mangler@punktum"), /e-mailadresse/);
  });

  it("står ikke i repoets egen brugerliste", () => {
    const e = ejerkonto("ejer@eksempel.dk");
    assert.equal(
      DEV_BRUGERE.some((b) => b.email === e.email), false,
      "en navngiven persons adresse hører i .env.local, ikke i repoet — den " +
      "næste der kloner, skal ikke arve den"
    );
  });
});

describe("Claims udledes af presettet, aldrig i hånden", () => {
  it("giver hver rolle nøjagtig presettets permissions", () => {
    for (const rolle of Object.keys(ROLLE_PERMS)) {
      const c = claimsFor(rolle);
      for (const perm of ROLLE_PERMS[rolle]) {
        assert.ok(
          harPerm(c.perms, perm),
          `${rolle} mangler ${perm} i sit claim — den seedede bruger ville have ` +
          "anden adgang end en rigtig bruger med samme rolle"
        );
      }
    }
  });

  /* Den konkrete konsekvens, og grunden til at testen ikke bare tæller:
     beslutning 5 siger at disponenten ikke godkender sit eget forslag. Sætter
     nogen booking.godkend på disponent-presettet, falder den her. */
  it("giver ikke disponenten booking.godkend", () => {
    assert.equal(harPerm(claimsFor("disponent").perms, PERM.bookingGodkend), false);
    assert.equal(harPerm(claimsFor("koordinator").perms, PERM.bookingGodkend), true);
  });

  it("bærer tenant og rolle med", () => {
    const c = claimsFor("admin");
    assert.equal(c.tenant, DEV_TENANT);
    assert.equal(c.rolle, "admin");
  });

  it("afviser en ukendt rolle frem for at udstede et tomt claim", () => {
    assert.throws(() => claimsFor("superbruger"), /ukendt rolle/);
  });

  /* Rørene i begge ender er ikke pynt: uden dem ville contains('|booking.afvis')
     også matche |booking.afvisAlle|. Se ARKITEKTUR. */
  it("bygger en rør-afgrænset streng med rør i begge ender", () => {
    const p = claimsFor("admin").perms;
    assert.match(p, /^\|/);
    assert.match(p, /\|$/);
  });
});

describe("Seed-formen passer til det useListe læser", () => {
  /* useListe læser `{ id: barn.key, ...barn.val() }`. Ligger id'et OGSÅ i
     værdien, er der to kilder til samme felt, og de kan nå at blive uenige. */
  it("nøgler på id og fjerner det fra værdien", () => {
    const ud = somNode([{ id: "a1", navn: "Bil 104" }]);
    assert.deepEqual(ud, { a1: { navn: "Bil 104" } });
  });

  it("afviser en række uden id frem for at opfinde en nøgle", () => {
    assert.throws(() => somNode([{ navn: "uden id" }]), /uden id/);
  });

  it("afviser to rækker med samme id", () => {
    assert.throws(() => somNode([{ id: "x" }, { id: "x" }]), /to gange/);
  });

  it("kan nøgle hvert listedatasæt i SEED", () => {
    for (const s of SEED.filter((s) => s.form === "liste")) {
      const ud = somNode(s.data);
      assert.equal(Object.keys(ud).length, s.data.length, `${s.node} tabte rækker`);
    }
  });

  /* Tenant-markøren er ikke i SEED — den skrives særskilt som trin 1, fordi
     hver eneste regel kræver den. Står den ikke, afviser alt. */
  it("seeder de noder skærmene faktisk læser", () => {
    const noder = SEED.map((s) => s.node);
    for (const n of ["kpi/gods/current", "koeretoejer", "personale", "kompetencer", "kunder", "fravaer"]) {
      assert.ok(noder.includes(n), `${n} læses af en skærm, men seedes ikke`);
    }
  });
});
