import React from "react";
import ReactDOM from "react-dom/client";
import { FleetV2App } from "./FleetV2App";
import { createIndexedDbUnitRepository } from "./data/unitRepository";
import "./styles/fleet-v2.css";

/* Standalone-prototypen har ingen AppShell til at levere platformens tokens.
   Integrationsbuilden importerer ikke denne entry og bruger derfor kun den
   fælles tokenkilde i src/fleet/fleet.css. */
document.documentElement.classList.add("fleet-v2-standalone");

const automatedDatabaseName = import.meta.env.VITE_FLEET_V2_DATABASE_NAME;
const repository = automatedDatabaseName
  ? createIndexedDbUnitRepository({ databaseName: automatedDatabaseName })
  : undefined;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><FleetV2App repository={repository} /></React.StrictMode>,
);
