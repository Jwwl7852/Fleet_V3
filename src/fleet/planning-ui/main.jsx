import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./planning-demo.css";
import PlanningDemo from "./PlanningDemo.jsx";

document.documentElement.classList.add("planning-v2-standalone");

createRoot(document.getElementById("planning-demo-root")).render(
  <StrictMode><div className="veyro-module--planning"><PlanningDemo /></div></StrictMode>,
);
