import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Main from "./Main.pfui";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Main />
  </StrictMode>,
);
