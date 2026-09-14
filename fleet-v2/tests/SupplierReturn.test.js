import { describe, expect, it } from "vitest";
import { safeSupplierReturnPath, withSelectedSupplier, workshopAssignmentDraftKey } from "../src/data/supplierReturn";

describe("sikker retur fra fælles leverandørregister", () => {
  it("accepterer kun den konkrete integrerede FLEET-bestillingsrute", () => {
    expect(safeSupplierReturnPath("/fleet-v2/sager/case-demo-001/bestilling")).toBe("/fleet-v2/sager/case-demo-001/bestilling");
    expect(safeSupplierReturnPath("https://evil.example/fleet-v2/sager/1/bestilling")).toBe("");
    expect(safeSupplierReturnPath("/indkoeb/leverandoerer")).toBe("");
  });

  it("tilføjer den nyoprettede leverandør som et kodet forvalg", () => {
    expect(withSelectedSupplier("/fleet-v2/sager/case-demo-001/bestilling", "lv ny&1"))
      .toBe("/fleet-v2/sager/case-demo-001/bestilling?leverandoer=lv+ny%261");
  });

  it("afgrænser browserkladden efter tenant og sag", () => {
    expect(workshopAssignmentDraftKey("tenant/a", "case:1"))
      .toBe("veyro:fleet:workshop-assignment-draft:tenant_a:case_1");
  });
});
