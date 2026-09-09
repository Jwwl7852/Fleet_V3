import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./planning-demo.css";
import PlanningDemo from "./PlanningDemo.jsx";

createRoot(document.getElementById("planning-demo-root")).render(
  <StrictMode><PlanningDemo /></StrictMode>,
);
