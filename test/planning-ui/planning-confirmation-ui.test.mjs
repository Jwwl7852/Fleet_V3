import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const flexible = readFileSync(resolve(root, "src/fleet/planning-ui/PlanningFlexibleScheduling.jsx"), "utf8");
const customer = readFileSync(resolve(root, "src/fleet/planning-ui/PlanningCustomerConfirmation.jsx"), "utf8");
const demo = readFileSync(resolve(root, "src/fleet/planning-ui/PlanningDemo.jsx"), "utf8");
const css = readFileSync(resolve(root, "src/fleet/planning-ui/planning-demo.css"), "utf8");

describe("Lokalt bekræftelsesflow i Planning-UI", () => {
  it("viser de fire entydige bekræftelsesstatusser på kort, vindue og indbakke", () => {
    for (const label of ["Kladde", "Afventer bekræftelse", "Bekræftet", "Ændring ønsket"]) {
      assert.match(flexible, new RegExp(label));
    }
    assert.match(flexible, /ps-confirmation-badge/);
    assert.match(flexible, /ps-placement-status/);
  });

  it("lader disponenten sende, men ikke selv bekræfte bestillerens svar", () => {
    assert.match(flexible, /sendTilBekraeftelse/);
    assert.match(flexible, /Send til bekræftelse/);
    assert.doesNotMatch(flexible, /bekraeftForslag/);
    assert.match(customer, /bekraeftForslag/);
    assert.match(customer, /Bekræft tidspunkt/);
  });

  it("åbner en tydeligt lokal bestillervisning med versionsbundet forslag", () => {
    assert.match(flexible, /customerOnly=1/);
    assert.match(flexible, /proposalId=/);
    assert.match(flexible, /version=/);
    assert.match(customer, /requestedProposalId/);
    assert.match(customer, /requestedVersion/);
    assert.match(customer, /Ingen login, besked eller data sendes eksternt/);
  });

  it("viser notifikationer med ulæst tæller og sikker navigation til opgaven", () => {
    assert.match(demo, /ulæsteNotifikationer/);
    assert.match(demo, /markerNotifikationLaest/);
    assert.match(demo, /focusRequest/);
    assert.match(flexible, /Notifikationsvisning: filtre er midlertidigt udvidet/);
    assert.match(flexible, /Gendan tidligere filtre/);
  });

  it("bruger semantiske statusmarkeringer og adskiller valgt opgave fra status", () => {
    for (const status of ["KLADDE", "AFVENTER_BEKRAEFTELSE", "BEKRAEFTET", "AENDRING_OENSKET"]) {
      assert.match(css, new RegExp(`data-status=\\"${status}\\"`));
    }
    assert.match(css, /\.ps-placement\[data-active="true"\]/);
    assert.match(css, /border-style:dashed/);
  });

  it("fjerner den gentagne placeringsknap og bevarer celleklik, drop og kortklik", () => {
    assert.doesNotMatch(flexible, /\+ Placér opgave|ps-drop-action/);
    assert.match(flexible, /event\.target === event\.currentTarget/);
    assert.match(flexible, /data-drag-over/);
    assert.match(flexible, /event\.stopPropagation\(\); openTask\(placement\.taskId\)/);
  });
});
