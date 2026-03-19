import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// @ts-ignore — virtual module provided by vite-plugin-pwa at build time
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";

// Auto-update: when a new SW is available, activate it and reload the page
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
