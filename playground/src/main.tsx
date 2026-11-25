import { mountApp } from "@gluefuil/runtime";
import { StrictMode } from "react";
import Main from "./Main.gui";

mountApp(
  document.getElementById("root")!,
  <StrictMode>
    <Main />
  </StrictMode>,
);
