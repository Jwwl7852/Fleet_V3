import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { WorkforceV2App } from "../../../workforce-v2/src/WorkforceV2App.jsx";
import "../../../workforce-v2/src/styles/workforce-v2.css";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { usePost } from "../../fleet/usePost.js";
import { harModul } from "../../fleet/moduler.js";
import {
  createFirebaseWorkforceRepository,
  workforceV2ActorFromUser,
  workforceV2PageForPath,
  workforceV2PathForPage,
} from "../../fleet/workforce-v2-integration.js";

export default function WorkforceV2Module() {
  const { bruger, moduler } = useFleet();
  const location = useLocation();
  const navigate = useNavigate();
  const { post: brugerPost, henter } = usePost("brugere", bruger?.uid || null);
  const employeeId = brugerPost?.personId || null;
  const actor = useMemo(() => workforceV2ActorFromUser(bruger, employeeId), [bruger, employeeId]);
  const repository = useMemo(() => createFirebaseWorkforceRepository(), []);
  const hasModule = harModul(moduler, "bemanding");
  const manager = actor.permissions.includes("workforce.employee.read");
  const page = workforceV2PageForPath(location.pathname);

  if (henter) return <div className="fc-empty">Henter medarbejderidentitet …</div>;
  if (!hasModule || (!manager && !employeeId)) {
    return <section className="fc-card" aria-labelledby="workforce-v2-adgang-afvist">
      <h1 id="workforce-v2-adgang-afvist">Ingen adgang til WORKFORCE</h1>
      <p>{hasModule ? "Brugeren er ikke knyttet til en medarbejder og har ingen WORKFORCE-lederadgang." : "Tenantens abonnement omfatter ikke WORKFORCE."}</p>
      <p>Et direkte link indlæser ikke WORKFORCE-data.</p>
    </section>;
  }

  return <WorkforceV2App
    actor={actor}
    embedded
    initialPage={manager ? page : "self"}
    onNavigate={(next) => navigate(workforceV2PathForPage(next))}
    pathname={location.pathname}
    repository={repository}
  />;
}
