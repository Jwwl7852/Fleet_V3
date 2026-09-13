import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { WorkforceV2App } from "../../../workforce-v2/src/WorkforceV2App.jsx";
import { createMemoryWorkforceRepository } from "../../../workforce-v2/src/data/workforceRepository.js";
import "../../../workforce-v2/src/styles/workforce-v2.css";
import { demoMode } from "../../firebase.js";
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
  /* Demoen har ingen brugernode at slå op i. Den eksplicitte syntetiske
     WORKFORCE-fixture bruger emp-dennis; i emulator/dev kommer identiteten
     fortsat udelukkende fra den autentificerede brugers brugernode. */
  const employeeId = demoMode ? "emp-dennis" : brugerPost?.personId || null;
  const actor = useMemo(() => workforceV2ActorFromUser(bruger, employeeId), [bruger, employeeId]);
  /* Miljøvalget sker før første læsning. En rigtig backendfejl skifter aldrig
     skjult til demo; den bliver i Firebase-repositoryet og vises af modulet. */
  const repository = useMemo(
    () => demoMode
      ? createMemoryWorkforceRepository({ tenantId: bruger?.tenant || "demo" })
      : createFirebaseWorkforceRepository(),
    [bruger?.tenant, bruger?.uid],
  );
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
    environmentNotice={demoMode
      ? "WORKFORCE viser syntetiske demodata i hukommelsen. Ingen backend er tilsluttet."
      : null}
    onNavigate={(next) => navigate(workforceV2PathForPage(next))}
    pathname={location.pathname}
    repository={repository}
  />;
}
