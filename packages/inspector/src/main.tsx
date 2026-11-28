// The Inspector page's entry (the Vite plugin serves it at /__gfui/inspector/).
// No StrictMode: its double effects would open the channel twice.
import { mountApp } from "@gluefuil/runtime";
import Inspector from "./Inspector.gui";

// It never traces itself (a stored `gfui.trace` setting applies to the whole origin).
mountApp(document.getElementById("root")!, <Inspector />, { trace: false });
