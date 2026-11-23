// One App shell demo per page (layouts.html?layout=vertical): each layout is a
// whole App, and the shell's state is per page. The App shell scenario shows
// them in a frame; e2e/app-shell.spec.ts measures them.
import { mountApp } from "@patchfuil/runtime";
import { StrictMode, type ComponentType } from "react";

const layouts = import.meta.glob("./layouts/*.pfui", { import: "default", eager: true }) as Record<string, ComponentType>;

const name = new URLSearchParams(window.location.search).get("layout") ?? "condensed-sticky";
const Layout = layouts[`./layouts/${name}.pfui`];

mountApp(
  document.getElementById("root")!,
  <StrictMode>{Layout ? <Layout /> : <p>No layout named "{name}".</p>}</StrictMode>,
);
