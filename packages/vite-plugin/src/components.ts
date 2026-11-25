// Discovering user-defined components (step 14): every `<Name>.gui` in the
// components folder that defines `<Component name="Name">`. Files are analyzed
// once per modification.

import { analyzeModule, type UserComponentInfo } from "@gluefuil/compiler";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export interface FoundComponent {
  file: string;
  info: UserComponentInfo;
}

export class ComponentFolder {
  private readonly analyzed = new Map<string, { mtimeMs: number; info: UserComponentInfo | undefined }>();

  constructor(readonly dir: string) {}

  /** The components in the folder now, by name. A file whose component is not named like it is skipped (its own compile reports E016). */
  scan(): Map<string, FoundComponent> {
    const found = new Map<string, FoundComponent>();
    if (!existsSync(this.dir)) return found;
    for (const entry of readdirSync(this.dir).sort()) {
      if (!entry.endsWith(".gui")) continue;
      const file = join(this.dir, entry);
      const name = entry.slice(0, -".gui".length);
      // The code-behind takes part: it can read $props and emit events.
      const xs = `${file}.xs`;
      const mtimeMs = statSync(file).mtimeMs + (existsSync(xs) ? statSync(xs).mtimeMs : 0);
      let cached = this.analyzed.get(file);
      if (!cached || cached.mtimeMs !== mtimeMs) {
        const codeBehind = readCodeBehind(file);
        const info = analyzeModule(readFileSync(file, "utf8"), codeBehind !== undefined ? { codeBehind } : {}).components.find((c) => c.name === name);
        cached = { mtimeMs, info };
        this.analyzed.set(file, cached);
      }
      if (cached.info) found.set(name, { file, info: cached.info });
    }
    return found;
  }
}

/** An import specifier for `target` from a module in `fromDir`: `./components/X.gui`. */
export function importSpecifier(fromDir: string, target: string): string {
  const path = relative(fromDir, target).split("\\").join("/");
  return path.startsWith(".") ? path : `./${path}`;
}

/** The code-behind of a .gui file (`<file>.xs`), if it exists. */
export function readCodeBehind(file: string): string | undefined {
  const path = `${file}.xs`;
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}



/** The file beside the entry whose top-level `var` and `function` declarations are globals (step 21B). */
export const GLOBALS_FILE = "Globals.xs";

/**
 * The app's globals (step 21B): `global.*`/`<global>` on the entry's root and
 * the declarations of `Globals.xs` beside it. Every other file is compiled
 * knowing them. Read once per modification of either file.
 */
export class AppGlobals {
  private cached: { stamp: string; globals: string[] } | undefined;

  constructor(readonly entry: string) {}

  /** `Globals.xs` beside the entry. */
  get globalsFile(): string {
    return join(dirname(this.entry), GLOBALS_FILE);
  }

  /** The source of `Globals.xs`, if it exists. */
  readGlobalsCode(): string | undefined {
    return existsSync(this.globalsFile) ? readFileSync(this.globalsFile, "utf8") : undefined;
  }

  /** The global names; none when the entry does not exist. */
  names(): string[] {
    const stamp = [this.entry, this.globalsFile].map((file) => (existsSync(file) ? statSync(file).mtimeMs : "-")).join("|");
    if (this.cached?.stamp !== stamp) {
      const globalsCode = this.readGlobalsCode();
      const globals = existsSync(this.entry) ? analyzeModule(readFileSync(this.entry, "utf8"), globalsCode !== undefined ? { globalsCode } : {}).globals : [];
      this.cached = { stamp, globals };
    }
    return this.cached.globals;
  }
}
