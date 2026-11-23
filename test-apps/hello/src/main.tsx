import { mountApp } from "@patchfuil/runtime";
import { StrictMode } from "react";
import Main from "./Main.pfui";

// A production build prerenders Main.pfui into #root (static generation);
// mountApp then takes that HTML over. The dev server starts from an empty #root.
mountApp(
  document.getElementById("root")!,
  <StrictMode>
    <Main />
  </StrictMode>,
);
