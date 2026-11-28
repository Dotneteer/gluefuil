// TraceFeed: the Inspector's non-visual data component (step 35). It listens on
// the gfui-trace BroadcastChannel, says hello (each app tab answers with its ring),
// and publishes the feed's rows and actions as its API.
import { saveBlob, signal, TRACE_CHANNEL, useComponentApi, type BridgeMessage, type RegisterApi } from "@gluefuil/runtime";
import { useEffect, useMemo, useState } from "react";
import { FeedModel, locationText } from "./model";

export interface TraceFeedProps {
  registerApi?: RegisterApi;
}

/** The project root the dev server gave the page (`data-gfui-project-root`), for opening files. */
function projectRoot(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.querySelector<HTMLElement>("[data-gfui-project-root]")?.dataset.gfuiProjectRoot;
}

export function TraceFeed({ registerApi }: TraceFeedProps) {
  const [model] = useState(() => new FeedModel());
  // Every change bumps the version: the API's members read it, so bindings follow.
  const [version] = useState(() => signal(0));
  const [held] = useState(() => ({ paused: signal(false), messages: [] as BridgeMessage[], connected: signal(false) }));
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return undefined;
    const channel = new BroadcastChannel(TRACE_CHANNEL);
    channel.onmessage = (event: MessageEvent<BridgeMessage>) => {
      if (held.paused.peek()) {
        held.messages.push(event.data);
        return;
      }
      if (model.receive(event.data)) {
        held.connected.set(true);
        version.set(version.peek() + 1);
      }
    };
    channel.postMessage({ type: "hello" } satisfies BridgeMessage);
    return () => channel.close();
  }, [model, version, held]);
  const api = useMemo(() => {
    const read = () => version.get();
    const bump = () => version.set(version.peek() + 1);
    return {
      get sources() {
        read();
        return Object.freeze(model.sourceOptions());
      },
      get source() {
        read();
        return model.selected;
      },
      get count() {
        read();
        return model.count();
      },
      get dropped() {
        read();
        return model.dropped();
      },
      get paused() {
        return held.paused.get();
      },
      get connected() {
        return held.connected.get();
      },
      select(id: unknown) {
        model.select(typeof id === "string" && id !== "" ? id : undefined);
        bump();
      },
      filtered(kind: unknown, text: unknown) {
        read();
        return Object.freeze(model.filtered(typeof kind === "string" ? kind : "", typeof text === "string" ? text : ""));
      },
      traceRows(rowId: unknown) {
        read();
        return Object.freeze(typeof rowId === "number" ? model.traceRows(rowId) : []);
      },
      detail(rowId: unknown) {
        read();
        return typeof rowId === "number" ? model.detail(rowId) : "";
      },
      location(rowId: unknown) {
        read();
        return typeof rowId === "number" ? locationText(model.entry(rowId)?.at) : "";
      },
      pause() {
        held.paused.set(true);
      },
      resume() {
        held.paused.set(false);
        for (const message of held.messages.splice(0)) model.receive(message);
        bump();
      },
      clear() {
        model.clear();
        bump();
      },
      exportFile() {
        const data = JSON.stringify(model.exportCurrent(), null, 2);
        saveBlob(new Blob([data], { type: "application/json" }), `gfui-trace-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      },
      async importFile(file: unknown) {
        if (!(file instanceof Blob)) return;
        const name = (file as File).name ?? "trace.json";
        model.importExport(name, JSON.parse(await file.text()));
        bump();
      },
      canOpen(rowId: unknown) {
        read();
        return typeof rowId === "number" && model.entry(rowId)?.at !== undefined && projectRoot() !== undefined;
      },
      async openInEditor(rowId: unknown) {
        const at = typeof rowId === "number" ? model.entry(rowId)?.at : undefined;
        const root = projectRoot();
        if (!at || root === undefined) return;
        // Vite's dev server opens a file at a line: /__open-in-editor?file=path:line:column.
        await fetch(`/__open-in-editor?file=${encodeURIComponent(`${root}/${at.file}:${at.line}:${at.column}`)}`);
      },
    };
  }, [model, version, held]);
  useComponentApi(registerApi, api);
  return null;
}
