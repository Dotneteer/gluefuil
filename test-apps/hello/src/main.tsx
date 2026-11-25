import { mountApp } from "@gluefuil/runtime";
import { StrictMode } from "react";
import Main from "./Main.gui";

// A production build prerenders Main.gui into #root (static generation);
// mountApp then takes that HTML over. The dev server starts from an empty #root.
mountApp(
  document.getElementById("root")!,
  <StrictMode>
    <Main />
  </StrictMode>,
);
