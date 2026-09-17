import { useLocation } from "react-router-dom";
import { Kort, ModulNav } from "../../fleet/ui.jsx";
import FakturacenterOpsaetning from "./FakturacenterOpsaetning.jsx";
import ProcureGodkendelsesregler from "./ProcureGodkendelsesregler.jsx";

const FANER = [
  { sti: "/opsaetning/godkendelsesregler", label: "Ekstra fakturakontrol" },
  { sti: "/opsaetning/godkendelsesregler/procure", label: "PROCURE-ordrer" },
];

export default function GodkendelsesreglerOpsaetning() {
  const { pathname } = useLocation();
  const procure = pathname.endsWith("/procure");
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort titel="Godkendelsesregler">
        <p className="fc-hint" style={{ margin: 0 }}>
          Fakturakontrol og ordregodkendelse er to adskilte regelsæt. Et skift
          på den ene fane ændrer ikke den anden.
        </p>
      </Kort>
      <ModulNav punkter={FANER} label="Godkendelsesregler" />
      {procure ? <ProcureGodkendelsesregler /> : <FakturacenterOpsaetning />}
    </div>
  );
}
