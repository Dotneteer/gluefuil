// Code a component loads on demand (step 23: Markdown's renderer, a lazy chunk).
//
// `lazyResource(load)` caches one promise per loader; a component reads it
// with React's `use()` inside a Suspense boundary, on every render (React
// requires it: a render that suspended must call use() again when retried).
// Once loaded, the promise is marked fulfilled, so use() doesn't suspend:
//   - in the browser, the boundary shows its fallback until the chunk arrives,
//     or, while hydrating, keeps the prerendered HTML (no mismatch);
//   - on the server, renderToString can't wait, so the load is recorded and
//     the prerender renders again once `takeServerLoads()` settles. The second
//     render finds the module loaded and renders it synchronously.

export interface LazyResource<T> {
  /** The loaded value, or undefined before the load finished. */
  readonly value: T | undefined;
  /** Starts the load (once) and returns its promise. */
  load(): Promise<T>;
}

const serverLoads = new Set<Promise<unknown>>();
/** How many loads of code were recorded (not `requestServerRender`): a pass that recorded one was incomplete. */
let codeLoads = 0;

export function lazyResource<T>(loader: () => Promise<T>): LazyResource<T> {
  let value: T | undefined;
  let promise: Promise<T> | undefined;
  return {
    get value() {
      return value;
    },
    load() {
      if (promise) return promise;
      const loading = loader().then((loaded) => {
        value = loaded;
        // React's thenable protocol: use() returns a fulfilled promise's value without suspending.
        Object.assign(loading, { status: "fulfilled", value: loaded });
        return loaded;
      });
      promise = loading;
      return promise;
    },
  };
}

/** Records a load a server render waited on (the prerender renders again after it). */
export function noteServerLoad(promise: Promise<unknown>): void {
  codeLoads++;
  serverLoads.add(promise);
}

/**
 * Asks the prerender to render the route once more, though nothing is loading
 * (step 32: a TableOfContents renders the headings the previous pass found).
 */
export function requestServerRender(): void {
  serverLoads.add(Promise.resolve());
}

/** The number of code loads recorded so far (a pass that added one is incomplete). */
export function serverLoadCount(): number {
  return codeLoads;
}

/** The loads recorded since the last call, emptied. */
export function takeServerLoads(): Promise<unknown>[] {
  const loads = [...serverLoads];
  serverLoads.clear();
  return loads;
}
