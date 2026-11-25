// The compile cache: compiled modules in localStorage, keyed by build and path,
// validated by a hash of the source text.
//
// It must never break loading: unusable storage, corrupted entries and a full
// quota all degrade to "no cache". Design: .ai/plan/poc-11-standalone.md

/** The parts of the Web Storage API the cache uses. */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CacheEntry {
  /** Hash of the source text the code was compiled from. */
  hash: string;
  code: string;
  /** The source map without `sourcesContent` (the source is fetched anyway). */
  map?: { version: 3; sources: string[]; names: string[]; mappings: string; file?: string };
}

const PREFIX = "gfui:";

export class CompileCache {
  constructor(
    private readonly storage: StorageLike | undefined,
    private readonly buildId: string,
  ) {}

  private key(path: string): string {
    return `${PREFIX}${this.buildId}:${path}`;
  }

  /** The cached entry for `path` if it was compiled from text with `hash`. */
  get(path: string, hash: string): CacheEntry | undefined {
    if (!this.storage) return undefined;
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.key(path));
    } catch {
      return undefined; // storage blocked
    }
    if (raw === null) return undefined;
    try {
      const entry = JSON.parse(raw) as CacheEntry;
      if (typeof entry?.code === "string" && entry.hash === hash) return entry;
      return undefined; // changed source, or an unexpected shape
    } catch {
      return undefined; // corrupted: overwritten by the next set()
    }
  }

  /** Stores an entry; returns whether it was stored. Never throws. */
  set(path: string, entry: CacheEntry): boolean {
    if (!this.storage) return false;
    const key = this.key(path);
    const value = JSON.stringify(entry);
    this.evict((other) => other.startsWith(PREFIX) && !other.startsWith(`${PREFIX}${this.buildId}:`));
    try {
      this.storage.setItem(key, value);
      return true;
    } catch {
      // Probably the quota: make room by dropping our other entries, then retry once.
      this.evict((other) => other.startsWith(PREFIX) && other !== key);
      try {
        this.storage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    }
  }

  private evict(match: (key: string) => boolean): void {
    if (!this.storage) return;
    try {
      const keys: string[] = [];
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key !== null && match(key)) keys.push(key);
      }
      for (const key of keys) this.storage.removeItem(key);
    } catch {
      // storage blocked: nothing to evict
    }
  }
}

/** `localStorage`, or undefined where it is missing or blocked. */
export function defaultStorage(): StorageLike | undefined {
  try {
    const storage = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (!storage) return undefined;
    storage.getItem("gfui:probe"); // throws in some privacy modes
    return storage;
  } catch {
    return undefined;
  }
}
