// TraceFeed's metadata (React-free: the Vite plugin and the standalone engine
// compile the Inspector's markup with it).
import type { ComponentMetadata } from "@gluefuil/components/metadata";

export const traceFeedMetadata: ComponentMetadata = {
  description: "The Inspector's data: the trace entries the app tabs send over the gfui-trace BroadcastChannel (step 35).",
  props: {},
  api: {
    sources: { description: "The app tabs (and imported files) as { value, label }." },
    source: { description: "The id of the source shown." },
    count: { description: "The entries of the source shown." },
    dropped: { description: "Entries the source's ring dropped." },
    paused: { description: "True while new entries wait." },
    connected: { description: "True once a source has sent something." },
    select: { description: "select(id): shows a source." },
    filtered: { description: "filtered(kind, text): the rows of one kind ('' for all) containing text." },
    traceRows: { description: "traceRows(rowId): the rows of that row's trace, as a tree (indented `what`)." },
    detail: { description: "detail(rowId): the entry as indented JSON." },
    location: { description: "location(rowId): the entry's markup position (file:line:column), or ''." },
    pause: { description: "Holds new entries until resume()." },
    resume: { description: "Shows the held entries and new ones again." },
    clear: { description: "Forgets the shown source's entries." },
    exportFile: { description: "Saves the shown source as a gfui-trace JSON file." },
    importFile: { description: "importFile(file): shows an exported trace file as a source." },
    canOpen: { description: "canOpen(rowId): the entry has a position and the dev server can open it in the editor." },
    openInEditor: { description: "openInEditor(rowId): opens the entry's markup position in the editor (dev server)." },
  },
  nonVisual: true,
};

export const inspectorComponents: Readonly<Record<string, ComponentMetadata>> = Object.freeze({ TraceFeed: traceFeedMetadata });
