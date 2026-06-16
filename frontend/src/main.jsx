import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import App from "./App";
import { applyTheme, getStoredMode } from "./store/themeStore";

// Aplica el tema guardado antes del primer render (evita el flash de tema)
applyTheme(getStoredMode());

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
