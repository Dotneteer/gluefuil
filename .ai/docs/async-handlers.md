# Async handlers

> Subsystem reference for event handlers at runtime
> (`packages/runtime/src/render/handlers.ts`, `src/script/async-array.ts`,
> the store's segment batches) and how the compiler shapes them. Describes
> the code as it is. Design, the options considered and the XMLUI
> comparison: [`../plan/poc-07-async-handlers.md`](../plan/poc-07-async-handlers.md).
>
> **Last updated:** step 7.

## What a handler compiles to

```js
// onClick="status = 'saving…'; save(); status = 'saved'"
($$s) => ($$x) => async (...$params) => {
  const $param = $params[0]; const $cancel = $$x.cancel;
  let $$t, $$o = false;
  try {
    $$s.status = 'saving…';
    ($$r.th($$t = (0, $$s.save)?.()) ? ($$o && ($$o = false, $$x.close()), $$t = await $$t, $$x.open(), $$o = true, $$t) : $$t);
    $$s.status = 'saved';
  } finally { $$o && $$x.close(); }
}
```

- **`$$s`** is the element's scope, and **`$$x`** the invocation context
  (one per call).
- **Implicit await.** Every call in the handler body is awaited if, and
  only if, it returns a thenable. A handler that calls nothing
  asynchronous never suspends: it runs synchronously, as in step 6.
- **Explicit `await`** compiles the same way, so an `await` of a plain
  value does not yield. In bindings `await` is still an error (S030).
- **Handler shapes:**
  - a lone arrow or function becomes `async` with the same treatment;
  - a lone reference (`save`) calls it with `...$params`.
- **Nested functions** (callbacks) are synchronous, unless they contain an
  explicit `await`. Then they are `async`, with their own `$$t`/`$$o` and
  segment brackets.
- **Array methods.** `map`, `forEach`, `filter`, `every`, `some`, `find`,
  `findIndex` and `flatMap` calls compile to `$$r.arr(object, name, args)`,
  which is async-aware (below).

## Segments: batching across `await`

A **segment** is a synchronous stretch of a handler. Each segment's writes
are delivered as one batch:

| When | What | Who |
|------|------|-----|
| The call starts | A batch around the first synchronous run, closed when the function returns (at its first suspension, or at its end) | `HandlerSlot.start` (`batch()`) |
| Before suspending | Close the segment this activation opened, if any (`$$o`) | compiled await site |
| After resuming | `$$x.open()`: throw `HandlerCancelledError` if cancelled, else `startBatch()`; `$$o = true` | compiled await site |
| The function ends (return, throw, cancellation) | `finally { $$o && $$x.close() }` | compiled async body |

- **Balanced by construction.** Each activation closes only the segment it
  opened. A nested async function entered synchronously doesn't close its
  caller's batch.
- **The store can't freeze:**
  - a promise that never settles: the segment closed before the `await`;
  - an error or a cancellation: `finally` closes;
  - a leak anyway (a bug): the **watchdog** closes it. `startBatch()`
    queues a microtask; a batch still open when it runs is force-closed,
    its notifications are delivered, and a `ReactivityError` is reported.
- **Robust delivery** (`signals.ts` `flush`):
  - every watcher runs even if another throws, and the errors are
    reported afterwards;
  - watchers that keep writing each other are stopped after 100 rounds.

## Invocation context and `$cancel`

`Invocation` (`$$x`) holds an `AbortController` and the segment methods
`open()`/`close()`.

`$cancel` is its frozen token:

| Member | Meaning |
|--------|---------|
| `aborted`, `reason` | `"supersede"`, `"timeout"`, `"unmount"` or `"user"` |
| `signal` | A standard `AbortSignal` |
| `throwIfAborted()` | Throws `HandlerCancelledError` |
| `onAbort(callback)` | Called on abort (at once if already aborted); returns an unsubscribe function |

- **A cancelled handler stops at its next suspension point** (`$$x.open()`
  throws), so it never writes into a superseded or unmounted UI.
- **`HandlerCancelledError` is never reported:** cancellation is an outcome,
  not an error.
- **`currentInvocation()`** is the invocation whose code is running
  synchronously. Cancel-aware services use it: `delay` rejects at once when
  its handler is aborted.

## Policies, timeouts, unmount (`HandlerSlot`)

`Bound` keeps one `HandlerSlot` per handler prop and element instance.

| Policy | A call while one is running |
|--------|-----------------------------|
| `parallel` (default) | Runs too |
| `single-flight` | Aborts the running one (`"supersede"`), then runs |
| `queue` | Waits; runs in FIFO order after the running one settles |
| `drop-while-running` | Is ignored |

- **Markup:** `handlerPolicy="…"` applies to all of an element's handlers;
  `handlerPolicy:onClick="…"` to one, and wins.
- **Timeout:** `handlerTimeoutMs` / `handlerTimeoutMs:onClick` (ms; `0`
  disables). The default is 30000 (`setDefaultHandlerTimeout`). Expiry
  aborts with `"timeout"`.
- **Unmount:** `Bound`'s effect cleanup calls `dispose()`: it aborts running
  calls (`"unmount"`), drops the queue, and ignores later calls.
  `activate()` re-enables the slot (StrictMode re-mounts).
- **Errors:** a handler's errors, synchronous or asynchronous, go to the
  runtime error reporter (`reportRuntimeError`, replaceable with
  `setErrorReporter`). They are not thrown at the component calling the
  handler.

## Async-aware array methods (`$$r.arr`)

- **Not an array (or not one of the eight methods):** an ordinary
  optional call.
- **An array:** native semantics until a callback returns a thenable
  (including the early exit of `find`, `findIndex`, `some` and `every`).
  From then on:
  - **`map`, `forEach`:** each result is awaited before the next callback
    (sequential);
  - **the others:** the remaining callbacks are called, then
    `Promise.all` (parallel).

  The result is a promise only when something was async.

## App globals

- **`createAppScope()`** is the root scope of compiled modules (`$$scope`).
  Today it holds `delay(ms)` only, which is cancel-aware.
- **Name lists:** the compiler's `APP_GLOBALS` and the runtime's
  `APP_GLOBAL_NAMES` list the names; `tools/sandbox-drift.test.ts` keeps
  them equal.
- **Writing an app global** in a handler is C012.

## Files

| File | Contents |
|------|----------|
| `runtime/src/render/handlers.ts` | `Invocation`, `CancellationToken`, `HandlerCancelledError`, `HandlerSlot`, `HANDLER_POLICIES`, `setDefaultHandlerTimeout`, `currentInvocation`, `delay` |
| `runtime/src/script/async-array.ts` | `arrayCall` (`$$r.arr`), `ASYNC_ARRAY_METHODS` |
| `runtime/src/reactivity/signals.ts` | `startBatch`, `endBatch`, `isBatching`, the watchdog, robust `flush` |
| `runtime/src/errors.ts` | `reportRuntimeError`, `setErrorReporter`, `scheduleMicrotask` |
| `runtime/src/render/app-globals.ts`, `app-global-names.ts` | `createAppScope`, `APP_GLOBAL_NAMES` |
| `compiler/src/codegen/emitter.ts` | `handlerFunction`, `awaitText`, `asyncBody`, `containsAwait`, `$$r.arr` routing |

## Tests

| File | Covers |
|------|--------|
| `runtime/tests/reactivity/batching.test.ts` | `startBatch`/`endBatch`, the watchdog (force-close and report, no false alarm), a throwing watcher, the ping-pong guard |
| `runtime/tests/script/async-array.test.ts` | Native semantics while synchronous, sequential `map`, parallel `filter`, every method with async callbacks, switching mid-array, rejection |
| `runtime/tests/render/handlers.test.ts` | Segments (one notification per segment, loading state first), implicit await, nested async functions, never-settling promises, errors, every policy, timeout, unmount, cancellation at resume, `$cancel`, `delay`, the app scope |
| `compiler/tests/codegen/handler.test.ts` | The generated shape (normalized: `⟪call⟫` marks a conditional await), implicit and explicit await, nested async functions, writes, diagnostics |
| `compiler/tests/module/variables-handlers.test.ts` | `handlerPolicy`/`handlerTimeoutMs` emission and E009, `delay` |
| `components/tests/async-handlers.test.tsx` | Markup, jsdom, clicks: slow handler, explicit await, never-finishing handler, error after await, single-flight, queue and drop, unmount, async array methods |
| `e2e/async-handlers.spec.ts` | Chromium: a slow handler's progress; the UI stays responsive; double-click under each policy |
