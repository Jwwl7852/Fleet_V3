import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  PLANNING_V2_ROUTE_PREFIX,
  PLANNING_V2_ROUTES,
  planningV2ChannelName,
  planningV2PathForView,
  planningV2PermissionForPath,
  planningV2ViewForPath,
} from "../src/fleet/planning-v2-integration.js";
import { PERM } from "../src/fleet/permissions.js";

const app = readFileSync("src/App.jsx", "utf8");
const moduleSource = readFileSync("src/moduler/booking/PlanningV2Module.jsx", "utf8");
const demo = readFileSync("src/fleet/planning-ui/PlanningDemo.jsx", "utf8");
const css = readFileSync("src/fleet/planning-ui/planning-demo.css", "utf8");

describe("PLANNING v2-platformintegration", () => {
  it("bruger et nyt prefix og bevarer entydig mapping for alle arbejdsflader", () => {
    assert.equal(PLANNING_V2_ROUTE_PREFIX, "/planning-v2");
    assert.equal(new Set(Object.values(PLANNING_V2_ROUTES)).size, 9);
    for (const [view, path] of Object.entries(PLANNING_V2_ROUTES)) {
      assert.equal(planningV2ViewForPath(`${path}/`), view);
      assert.equal(planningV2PathForView(view), path);
    }
    assert.equal(planningV2ViewForPath("/planning-v2/ukendt"), "overblik");
  });

  it("kræver den eksisterende Booking-læsepermission", () => {
    assert.equal(planningV2PermissionForPath("/planning-v2"), PERM.bookingLaes);
    assert.match(moduleSource, /harModul\(moduler, "booking"\)/);
    assert.match(moduleSource, /harPerm\(bruger\?\.perms, requiredPermission\)/);
    assert.ok(moduleSource.indexOf("if (!hasModule || !hasPermission)") < moduleSource.indexOf("<PlanningDemo"));
  });

  it("lazy-loader modulet i platformens AppShell uden iframe eller særskilt server", () => {
    assert.match(app, /lazy\(\(\) => import\("\.\/moduler\/booking\/PlanningV2Module\.jsx"\)\)/);
    assert.match(app, /path="planning-v2\/\*" element=\{<PlanningV2Module \/>\}/);
    assert.doesNotMatch(moduleSource, /iframe|5190|BrowserRouter/);
    assert.match(demo, /!embedded && <aside className="pu-sidebar pr-sidebar">/);
    assert.match(demo, /!embedded && <header className="pu-topbar pr-topbar">/);
  });

  it("isolerer vinduessynkronisering pr. miljø, tenant og bruger", () => {
    const a = planningV2ChannelName({ environment: "integration", tenantId: "tenant-a", userId: "user-a" });
    const b = planningV2ChannelName({ environment: "integration", tenantId: "tenant-b", userId: "user-a" });
    const c = planningV2ChannelName({ environment: "integration", tenantId: "tenant-a", userId: "user-b" });
    assert.notEqual(a, b);
    assert.notEqual(a, c);
    assert.match(demo, /event\.data\.payload\?\.revision > ugeplanRef\.current\.revision/);
    assert.match(demo, /channel\.close\(\)/);
  });

  it("scoper PLANNING-styles og bevarer standalone-tokenfallback", () => {
    assert.match(css, /\.planning-v2-standalone\s*\{/);
    assert.match(css, /@scope \(\.veyro-module--planning\) \{/);
    assert.match(css, /\.pr-platform\.pr-platform-embedded/);
  });
});
