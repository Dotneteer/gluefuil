import { mountApp } from "@patchfuil/runtime";
import { StrictMode } from "react";
import Main from "./Main.pfui";

mountApp(
  document.getElementById("root")!,
  <StrictMode>
    <Main />
  </StrictMode>,
);
