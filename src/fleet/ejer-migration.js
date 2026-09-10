const PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;

function vaerdier(objekt) {
  return objekt && typeof objekt === "object" && !Array.isArray(objekt) ? objekt : {};
}

function operation(sti, vaerdi, begrundelse) {
  return {
    handling: "tilfoej_hvis_mangler",
    sti,
    vaerdi,
    begrundelse,
    recovery: {
      handling: "fjern_hvis_uaendret",
      sti,
      forventetVaerdi: vaerdi,
    },
  };
}

/**
 * Planlægger ejerdata-migration v1 uden at ændre inputtet.
 *
 * Migrationen er bevidst snæver: den tilføjer kun den stabile nøgle, som
 * faktura-outboxen bruger til idempotens. Accepterede tilbud, priser,
 * fakturalinjer og beløb er ikke migrationsmål og optræder derfor aldrig i
 * operationerne.
 */
export function planlaegEjerMigrationV1(data) {
  const rod = vaerdier(data);
  const udbyder = vaerdier(rod.udbyder);
  const operationer = [];
  const konflikter = [];
  const sprunget = [];

  for (const [periode, kunder] of Object.entries(vaerdier(udbyder.fakturagrundlag))) {
    if (!PERIODE.test(periode)) {
      sprunget.push({ sti: `udbyder/fakturagrundlag/${periode}`, aarsag: "ugyldig_periode" });
      continue;
    }
    for (const [tenantId, grundlag] of Object.entries(vaerdier(kunder))) {
      if (!grundlag || typeof grundlag !== "object" || Array.isArray(grundlag)) {
        sprunget.push({ sti: `udbyder/fakturagrundlag/${periode}/${tenantId}`, aarsag: "ugyldigt_grundlag" });
        continue;
      }
      const forventet = `faktura:${periode}:${tenantId}:ordinaer`;
      const sti = `udbyder/fakturagrundlag/${periode}/${tenantId}/forretningsnoegle`;
      if (grundlag.forretningsnoegle == null) {
        operationer.push(operation(sti, forventet, "Stabil idempotensnøgle på ældre fakturagrundlag"));
      } else if (grundlag.forretningsnoegle !== forventet) {
        konflikter.push({ sti, forventet, faktisk: grundlag.forretningsnoegle, aarsag: "afvigende_forretningsnoegle" });
      }
    }
  }

  for (const [jobId, job] of Object.entries(vaerdier(udbyder.fakturajobs))) {
    if (!job || typeof job !== "object" || Array.isArray(job)) {
      sprunget.push({ sti: `udbyder/fakturajobs/${jobId}`, aarsag: "ugyldigt_job" });
      continue;
    }
    const periode = job.periode;
    const tenantId = job.tenantId;
    if (!PERIODE.test(periode || "") || typeof tenantId !== "string" || !tenantId.trim()) {
      sprunget.push({ sti: `udbyder/fakturajobs/${jobId}`, aarsag: "mangler_periode_eller_tenant" });
      continue;
    }
    const forventet = `faktura:${periode}:${tenantId}:ordinaer`;
    const sti = `udbyder/fakturajobs/${jobId}/forretningsnoegle`;
    if (job.forretningsnoegle == null) {
      operationer.push(operation(sti, forventet, "Stabil idempotensnøgle på ældre fakturajob"));
    } else if (job.forretningsnoegle !== forventet) {
      konflikter.push({ sti, forventet, faktisk: job.forretningsnoegle, aarsag: "afvigende_forretningsnoegle" });
    }
  }

  return {
    migration: "ejer_v1_forretningsnoegler",
    mode: "dry-run",
    kanAnvendes: konflikter.length === 0,
    antalOperationer: operationer.length,
    antalKonflikter: konflikter.length,
    antalSprunget: sprunget.length,
    operationer,
    konflikter,
    sprunget,
    beskyttedeOmraader: [
      "udbyder/tilbud",
      "udbyder/aftaler",
      "udbyder/prisliste",
      "fakturagrundlagets linjer og beløbsfelter",
    ],
  };
}

export function anvendPlanPaaFixture(data, plan) {
  const kopi = structuredClone(data || {});
  for (const post of plan?.operationer || []) {
    const dele = post.sti.split("/");
    let aktuel = kopi;
    for (const del of dele.slice(0, -1)) aktuel = (aktuel[del] ??= {});
    const felt = dele.at(-1);
    if (aktuel[felt] == null) aktuel[felt] = post.vaerdi;
    else if (aktuel[felt] !== post.vaerdi) throw new Error(`Konflikt ved ${post.sti}`);
  }
  return kopi;
}
