import { Link, useLocation } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { harModul } from "../../fleet/moduler.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { Gitter, Ikon, Kort, ModulNav, Pille } from "../../fleet/ui.jsx";
import FleetKategorier from "./FleetKategorier.jsx";
import Reolpladser from "../unitbooking/Reolpladser.jsx";
import Wmslokationer from "../warehouse/Lokationer.jsx";
import RessourceKatalogOpsaetning from "./RessourceKatalogOpsaetning.jsx";

const GRUPPER = [
  { key: "enheder", label: "Enheder", ikon: "lastbil", moduler: ["flaade", "booking"], tekst: "Enhedskategorier, FLEET-driftskategorier og OBD-hardware." },
  { key: "ejendomme", label: "Ejendomme", ikon: "bygning", moduler: ["facility"], tekst: "Ejendomskategorier og relevante FACILITY-valgmuligheder." },
  { key: "medarbejdere", label: "Medarbejdere", ikon: "personer", moduler: ["bemanding", "booking"], tekst: "Medarbejderkategorier uden login-, rolle- eller lønadgang." },
  { key: "units", label: "Units", ikon: "kasse", moduler: ["unitbooking", "warehouse"], tekst: "Eksisterende unittyper og GPS-trackere. Ekstern GPS-forbindelse er ikke aktiveret." },
  { key: "varer", label: "Varer/materialer", ikon: "vogn", moduler: ["indkoeb", "warehouse"], tekst: "Kundedefinerede varekategorier til det fælles varekatalog." },
  { key: "warehouse", label: "Warehouse", ikon: "stednaal", moduler: ["warehouse", "unitbooking"], tekst: "Lagre, lokationer, lokationstype og sikkerhedsklasse." },
  { key: "certifikater", label: "Certifikater", ikon: "skjold", moduler: ["bemanding", "flaade"], tekst: "Certifikattyper og varsling." },
];

function Oversigt({ grupper }) {
  return <>
      <Kort titel="Opsætning → Ressourcer">
        <p className="fc-hint" style={{ marginTop: 0 }}>
          Her vedligeholdes kategorier, hardware og administrative valg. De
          konkrete poster oprettes under <Link className="fc-a" to="/ressourcer">Ressourcer</Link>.
        </p>
        <p className="fc-hint" style={{ marginBottom: 0 }}>
          <Pille tone="warn">Eksterne forbindelser er inaktive</Pille>{" "}
          OBD/GPS registreres kun internt; leverandørtjenester aktiveres ikke.
        </p>
      </Kort>
      <Gitter kolonner="repeat(auto-fit, minmax(270px, 1fr))">
        {grupper.map((gruppe) => (
          <Kort key={gruppe.key} titel={(
            <span className="fc-med-ikon"><Ikon navn={gruppe.ikon} />{gruppe.label}</span>
          )} handling={<Link className="fc-a" to={`/opsaetning/ressourcer/${gruppe.key}`}>Administrér →</Link>}>
            <p>{gruppe.tekst}</p>
          </Kort>
        ))}
      </Gitter>
  </>;
}

function Gruppeindhold({ id }) {
  if (id === "enheder") return <>
    <RessourceKatalogOpsaetning gruppe="enheder" titel="Enheder" hardwareArt="obd" />
    <Kort titel="FLEET-driftskategorier">
      <p className="fc-hint">De eksisterende FLEET-kategorier styrer serviceintervaller og sagsarbejde. De er samlet her og har ikke længere et selvstændigt menupunkt.</p>
    </Kort>
    <FleetKategorier />
  </>;
  if (id === "ejendomme") return <RessourceKatalogOpsaetning gruppe="ejendomme" titel="Ejendomme" />;
  if (id === "medarbejdere") return <RessourceKatalogOpsaetning gruppe="medarbejdere" titel="Medarbejdere">
    <Kort titel="Adgang er adskilt"><p className="fc-hint">Medarbejderkategorier giver ikke login eller roller. Brugere og roller vedligeholdes fortsat separat.</p></Kort>
  </RessourceKatalogOpsaetning>;
  if (id === "units") return <>
    <RessourceKatalogOpsaetning gruppe="units" titel="Units" hardwareArt="gps" visKategorier={false} />
    <Reolpladser />
  </>;
  if (id === "varer") return <RessourceKatalogOpsaetning gruppe="varer" titel="Varer/materialer" />;
  if (id === "warehouse") return <>
    <RessourceKatalogOpsaetning gruppe="warehouse" titel="Warehouse-klassifikationer" />
    <Wmslokationer />
  </>;
  if (id === "certifikater") return <RessourceKatalogOpsaetning gruppe="certifikater" titel="Certifikater" />;
  return null;
}

export default function RessourceOpsaetning() {
  const { pathname } = useLocation();
  const { bruger, moduler } = useFleet();
  const maaAdministrere = harPerm(bruger?.perms, PERM.brugereSkriv);
  const grupper = GRUPPER.filter((gruppe) => gruppe.moduler.some((modul) => harModul(moduler, modul)));
  const id = pathname.split("/").filter(Boolean)[2] || null;
  const valgt = grupper.find((gruppe) => gruppe.key === id) || null;

  if (!maaAdministrere) return <Kort titel="Ingen adgang til ressourceopsætning">
    <p>Området kræver administratorrettigheden {PERM.brugereSkriv}. Et direkte link giver ikke adgang til indstillingerne.</p>
  </Kort>;

  return <div className="fc-grid" style={{ gap: 16 }}>
    {id ? <ModulNav label="Ressourceopsætning" punkter={[
      { sti: "/opsaetning/ressourcer", label: "Oversigt" },
      ...grupper.map((gruppe) => ({ sti: `/opsaetning/ressourcer/${gruppe.key}`, label: gruppe.label })),
    ]} /> : null}
    {!id ? <Oversigt grupper={grupper} /> : valgt ? <Gruppeindhold id={valgt.key} /> : <Kort titel="Området er ikke tilgængeligt"><p>Det valgte ressourceområde er ikke omfattet af tenantens moduler.</p></Kort>}
  </div>;
}
