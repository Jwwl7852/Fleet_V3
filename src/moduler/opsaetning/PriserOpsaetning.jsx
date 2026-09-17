import { useLocation } from "react-router-dom";
import { ModulNav } from "../../fleet/ui.jsx";
import Standardpriser from "../kunder/Standardpriser.jsx";
import Kundepriser from "../kunder/Kundepriser.jsx";

const FANER = [
  { sti: "/opsaetning/priser", label: "Standardpriser" },
  { sti: "/opsaetning/priser/kunder", label: "Kundepriser" },
];

export default function PriserOpsaetning() {
  const { pathname } = useLocation();
  const kundepriser = pathname.startsWith("/opsaetning/priser/kunder");
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <ModulNav punkter={FANER} label="Prisindstillinger" />
      {kundepriser ? <Kundepriser /> : <Standardpriser />}
    </div>
  );
}
