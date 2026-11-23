# Step 7: Async handlers and concurrency basics

**Status:** Done

Part of [poc-steps.md](poc-steps.md).

## Goal

Handlers can do asynchronous work, and the UI stays consistent and cannot
freeze, whatever the handlers do:

- **Implicit await:** handlers wait for promise-returning calls without
  writing `await`. Explicit `await` is also allowed.
- **Async-aware array methods.**
- **Batching** that survives `await` (the "async batch problem").
- **Concurrency:** a `$cancel` token, handler policies, timeouts and
  unmount cancellation.
- **Bindings stay synchronous.**

## Background (XMLUI)

Sources: `.ai/xmlui/expression-eval.md` §4–6; `.ai/xmlui/concurrency.md`;
`website/content/docs/pages/managed-react/cooperative-concurrency.md`;
`website/content/docs/pages/globals.md` § delay.

- **Two evaluators.** In the async evaluator, every call returning a promise
  is awaited.
  - The array methods `map` and `forEach` await their callbacks
    sequentially; `filter`, `every`, `some`, `find`, `findIndex` and
    `flatMap` in parallel (`Promise.all`).
  - The sync evaluator throws on a promise.
- **`await` and `async`** are parsed, but XMLUI's runtime rejects them.
  Yet the Managed React docs use `await` in handlers
  (`onClick="await save()"`).
- **Concurrency.** Every async handler gets `$cancel`: `aborted`,
  `reason`, `signal`, `throwIfAborted()`, `onAbort()`.
  - **Policies** per (component, event), set with `handlerPolicy` or
    `handlerPolicy:<event>`:
    - `parallel` (the default);
    - `single-flight` aborts the running handler (`"supersede"`);
    - `queue` runs handlers in FIFO order;
    - `drop-while-running` ignores the new call.
  - **Timeout:** 30 s by default (`"timeout"`).
  - **Unmount:** aborts (`"unmount"`).
  - **Yield points:** an aborted handler throws `HandlerCancelledError`
    at a yield point (every 100 statements). The dispatcher swallows it.
- **`delay(ms): Promise<void>`** is a global function.

## The async batch problem

Step 6 runs each handler call inside `batch()`. `batch()` is synchronous:
it delivers notifications when its function returns. An async handler
returns at its first `await`, so the writes after it would run outside any
batch, notifying per write.

### Requirements

1. The writes of each synchronous stretch ("segment") of a handler are
   delivered together, once.
2. The writes before an `await` are delivered **before** waiting, so a
   "loading…" state shows.
3. No write is ever lost or delayed indefinitely.
4. **The store can never stay frozen.** No batch may stay open because a
   promise never settles, a handler throws, a handler is cancelled, or the
   runtime has a bug.
5. Handlers without async work behave exactly as in step 6: synchronous,
   one batch, delivered before the event returns (compatible with React's
   `act`).
6. Interleaved handlers don't mix their batches.

### Options considered

| Option | Verdict |
|--------|---------|
| One batch per handler, held open across awaits | Rejected: violates 2, and 4 if a promise never settles |
| The store batches every write automatically to the end of the microtask | Rejected as the primary mechanism: every `set` becomes asynchronous for every caller (tests with `act`, `flushSync`, integrations), which violates 5. The microtask check survives as the safety net (below). |
| **Segments: explicit brackets at every suspension point** | **Chosen** |

### Design: segments

- **A segment is the synchronous run of a handler between suspension
  points.** It opens when the handler starts or resumes, and closes
  before the handler awaits or finishes.
- **Open and close** are a store-level `startBatch()`/`endBatch()` pair.
  Each invocation tracks whether *it* has a segment open, so a close is
  idempotent.
- **What the compiler emits:**
  - Every suspension point compiles to close, `await`, resume.
  - Every async function body ends in `finally { close }`.
  - The runtime wrapper opens the first segment, calls the handler, and
    closes in `finally`. A no-op if the handler already suspended or
    finished.
- **Why the store can't freeze:**
  - **A promise that never settles:** the segment closed before the
    `await`.
  - **An error:** `finally` closes the segment.
  - **Cancellation:** the cancellation error is thrown on resume, and
    `finally` closes.
- **Safety net (store watchdog).** Every segment closes within the same
  synchronous run that opened it. A batch still open when the microtask
  queue runs is therefore a bug. When the outermost batch opens, the store
  queues a microtask check. If that batch is still open then, the store
  force-closes it, delivers the notifications, and reports a
  `ReactivityError`. The UI recovers; the bug is visible.
- **Robust delivery:**
  - each watcher callback runs in `try`/`catch`, so one failing watcher
    can't stop the others; errors are reported afterwards;
  - a ping-pong guard stops runaway write cycles between watchers
    (100 rounds).
- **Cancellation at suspension points:** resuming checks `$cancel`. A
  superseded, timed-out or unmounted handler stops at its next `await`,
  so it never writes into a stale or unmounted UI. This replaces XMLUI's
  every-100-statements yield point, which compiled code has no
  equivalent of.

### Implicit await without losing synchronous handlers

- **Conditional await at call sites.** Every call in the top level of an
  async handler compiles to:

  ```js
  ($$r.th($$t = call()) ? ($$x.pause(), $$t = await $$t, $$x.resume(), $$t) : $$t)
  ```

  It suspends **only for a thenable**. A handler that calls nothing
  asynchronous never suspends: it stays synchronous, in one segment
  (requirement 5).
- **Explicit `await x`** compiles the same way. An explicit `await` of a
  plain value does not yield: a divergence from JavaScript, but
  consistent with implicit awaiting.
- **Where implicit await applies:** the handler body, and a lone arrow or
  function used as the handler.
- **Nested functions** (callbacks inside a handler) are plain synchronous
  JavaScript. They become async only if they contain an explicit
  `await`, and then get the same segment treatment.
  - Returning a promise from a callback works with the async-aware array
    methods.
  - **Divergence from XMLUI:** a callback that uses an async result
    internally without `await` sees a promise. XMLUI evaluates every
    callback asynchronously.
  - Why not make callbacks async: `sort`'s comparator, `replace`'s
    replacer and similar callbacks must stay synchronous.

### Async-aware array methods

`map`, `forEach`, `filter`, `every`, `some`, `find`, `findIndex` and
`flatMap` calls in handler code compile to `$$r.arr(object, name, args)`:

- **Not an array:** the ordinary call.
- **An array:** the method runs **natively until a callback returns a
  thenable**, so synchronous callbacks keep native semantics, including
  early exit for `find` and `some`. From that point:
  - `map` and `forEach` await each result in order (sequential);
  - the others call the remaining callbacks, then `Promise.all`
    (parallel).

  The result is a promise only when something was async.

### Concurrency

- **`$$x`, the invocation context**, holds the cancellation token and the
  segment state. Compiled handlers become `($$s) => ($$x) => handlerFunction`,
  and `$cancel` is a local (`$$x.cancel`).
- **`$cancel`:** `aborted`, `reason`, `signal` (an `AbortSignal`),
  `throwIfAborted()`, `onAbort(fn)`.
- **Policies:** `handlerPolicy="…"` sets one for all of an element's
  events; `handlerPolicy:onClick="…"` for one event. The value must be a
  constant (E009).
- **Timeouts:** `handlerTimeoutMs` / `handlerTimeoutMs:onClick`. The
  default is 30000 (`setDefaultHandlerTimeout`); `0` disables. On timeout
  the handler is aborted with `"timeout"`.
- **Unmount** aborts every running invocation of the element (`"unmount"`).
- **Errors** of a handler, sync or async, go to one reporter. The default
  is `reportError`, or `console.error` where `reportError` is missing;
  `setHandlerErrorReporter` replaces it.
  - `HandlerCancelledError` is never reported: cancellation is an
    outcome, not an error.
  - **Behavior change:** a sync handler error no longer propagates out of
    the click.

### `delay` and app globals

- **App globals:** the runtime gets a small set of scope names visible to
  all bindings and handlers. For now only `delay(ms)`, which is
  cancel-aware: an aborted invocation rejects its pending delay.
- **The compiler** knows them as scope names, but not as variables:
  writing one is C012.
- **A drift test** keeps the two lists in sync.

### Bindings

Bindings stay synchronous. `await` in a binding is still S030 (parser)
and C009 (code generation). A promise as a binding value is a
`BindingError` (step 3).

### Diagnostics

| Code | Meaning |
|------|---------|
| E009 | Invalid handler policy or timeout (not a constant, or an unknown value) |

## Tests

- **Store:**
  - the watchdog (a batch left open is force-closed and reported);
  - a throwing watcher doesn't stop the others;
  - the ping-pong guard.
- **Runtime:**
  - the async array methods (native semantics while sync, sequential vs
    parallel, ordering);
  - the cancellation token;
  - each policy;
  - timeout, unmount and error reporting.
- **Compiler:** conditional await shapes, `$cancel`, `$$r.arr`, explicit
  `await`, nested async functions, E009.
- **Async conformance table (jsdom):** for markup handlers:
  - ordering;
  - the loading state shows before the await;
  - one notification per segment;
  - a never-settling promise doesn't freeze the UI;
  - an error mid-handler doesn't freeze it;
  - cancellation stops writes;
  - sequential vs parallel `map`/`filter`.
- **E2E:** a slow handler ("Saving…" then "Saved"), and double-clicks
  under `parallel`, `single-flight`, `queue` and `drop-while-running`.

## Outcome

Implemented as designed. Details:
[`../docs/async-handlers.md`](../docs/async-handlers.md).

Evidence for each requirement of the async batch problem:

| Requirement | Shown by |
|-------------|----------|
| 1. One delivery per segment | `handlers.test.ts`: three writes after an await give one notification; a nested async function's two writes give one per segment |
| 2. Writes before an `await` delivered before waiting | `handlers.test.ts` and `async-handlers.test.tsx`: "saving…" shows while waiting; E2E "a slow handler" |
| 3. No write lost | All of the above end with the final state |
| 4. The store can't freeze | A never-settling promise, an error after an await, cancellation, unmount: every test asserts `isBatching() === false` afterwards. The watchdog test leaks a batch on purpose: it is closed, delivered and reported. |
| 5. Sync handlers unchanged | All step 6 jsdom click tests pass unchanged; "a handler without async work runs synchronously, in one batch" |
| 6. Interleaved handlers don't mix | The policy tests run overlapping invocations (parallel, queue) with correct results |

## Findings

- **Conditional await made the synchronous case free.** A handler
  suspends only on a real thenable, so step 6 behavior and React `act`
  compatibility are unchanged. The cost is a thenable check per call in
  handler code.
- **The handler-level `batch()` was enough for the first segment.** An
  async function returns to its caller at its first suspension. So the
  wrapper's synchronous `batch()` closes exactly when the first segment
  ends, and only resumed segments need compiled brackets.
- **Per-activation ownership (`$$o`)** was needed: with one flag per
  invocation, a nested async function that finishes synchronously would
  close its caller's batch early.
- **A bug the tables caught:** a synchronous expression-bodied callback
  inside a handler was emitted while the handler counted as async, which
  put an `await` in a non-async arrow. Fixed (`withFunction(false)`).
- **Cancellation at suspension points** replaces XMLUI's "every 100
  statements" yield point. It is exact for async work. A synchronous
  infinite loop still cannot be interrupted, in XMLUI terms either; the
  open question about runaway loops in bindings (step 3) also covers
  handlers.
- **Behavior change:** handler errors are reported through the runtime
  reporter instead of propagating out of the event. Sync handlers are
  `async` functions now, so their errors arrive as rejections.
- **`await` in handlers** (step 2, open question 2) is decided: allowed in
  statement code, and still S030 in bindings.

## Divergences from XMLUI (recorded)

- A callback that uses an async result internally without `await` sees a
  promise. XMLUI evaluates every callback asynchronously. Here, write
  `await` (the callback then becomes async), or return the promise and
  let the async-aware array methods handle it.
- An explicit `await` of a plain value does not yield.
- `$busy`/`busyOnClick`, `App.cancel()` and transactional handlers are not
  implemented yet.
