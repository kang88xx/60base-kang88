import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";
import "./interactions.css";
import "./visual-refinements.css";
import "./brand-refinements.css";
import "./navigation-refinements.css";
import "./services-expanded.css";
import "./about-refinements.css";
import "./section-system.css";
import "./typography-system.css";
import "./hero-reference.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
