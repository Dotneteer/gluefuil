# Step 3: Expression code generation and the sandbox

**Status:** Done

Part of [poc-steps.md](poc-steps.md).

## Goal

Compile a binding expression's syntax tree (step 2) to a plain JavaScript
function. Name resolution happens at compile time, against the binding's
scope and a closed allowlist of globals. That makes the **compiler the
sandbox**. The compiler also extracts the binding's dependencies (the scope
names it reads), which step 4's reactivity will subscribe to.

Bindings only: attribute values and text with `{…}`. Handlers (statements
that write state, implicit `await`) are steps 6 and 7. Arrow functions
inside a binding can have block bodies, so statements are compiled too, as
plain JavaScript.

## Background (XMLUI)

Sources: `.ai/xmlui/expression-eval.md`;
`website/content/docs/pages/scripting.md` § "Differences from standard
JavaScript"; `pages/managed-react/code-injection-prevention.md`,
`dom-api-isolation.md`; `xmlui/src/components-core/script-runner/`
(`eval-tree-common.ts`, `bannedFunctions.ts`, `bannedMembers.ts`);
`xmlui/src/components-core/utils/extractParam.ts`;
`xmlui/src/components-core/script-compiler/`.

- **Identifier resolution** (`eval-tree-common.ts` `getIdentifierScope`):
  block scopes, closures, the container's state, app globals, and finally
  **`globalThis`**. Any browser global is reachable unless a denylist
  stops it. Docs rely on this: `scripting.md` defines
  `window.transformStops` in `index.html` and calls it from markup.
- **Denylists, checked at runtime on every access:**
  - `bannedFunctions.ts`: called functions are compared by identity with
    `eval`, `Function`, `setTimeout`, … So `[].constructor.constructor` is
    reachable, but calling it throws.
  - `bannedMembers.ts`: about 99 globals and members (`window`,
    `document`, `fetch`, `localStorage`, …). Warn-only by default; they
    throw only with `strictDomSandbox`.
  - `console` is allowed by default (`allowConsole`).
- **`new`** (`eval-tree-common.ts:732`, `allowedNewConstructors`): allowed
  only for inert value types (`String`, `Number`, `Boolean`, `Date`,
  `RegExp`, `Array`, `Object`, `Map`, `Set`, `WeakMap`, `WeakSet`, typed
  arrays, `ArrayBuffer`, `DataView`, `URL`, `URLSearchParams`,
  `TextEncoder`, `TextDecoder`, `Blob`, `File`, the `Error` family,
  `DOMException`). Checked at runtime by constructor identity.
  `.ai/xmlui/expression-eval.md` still lists only four; it is outdated.
- **Optional chaining is the default** for every member access and call:
  `a.b` behaves like `a?.b`, `f()` like `f?.()` (`scripting.md`).
- **Interpolated values** (`extractParam.ts`):
  - A whitespace-only literal at either end is dropped, so `" {x} "` is
    the raw value of `x`.
  - A single expression yields its raw value.
  - Otherwise the segments are joined into a string, and `null` and
    `undefined` contribute `""`.
- **Bindings are synchronous:** a call that returns a promise throws
  ("Promises … are not allowed in binding expressions"). There is also a
  1000 ms timeout.
- **XMLUI's own script compiler** (`script-compiler/runtime.ts`) still
  routes every identifier read, member read, call and `new` through
  runtime helpers (`readSyncMember`, `callSyncFunction`, …). It keeps the
  interpreter's checks, and with them most of its cost.

## Design

### Output shape

`compileExpression` returns JavaScript source for one arrow function:

```js
($$s) => $$s.price * (1 + $$g.Math?.max?.($$s.tax, 0))
```

- `$$s` is the binding's **scope object**: every scope name is read as
  `$$s.name`. Step 4 decides what sits behind it (plain values or
  signals); the generated code doesn't change.
- `$$g` holds the **sandbox globals** and `$$r` the **runtime helpers**.
  Both are bound once when the code is loaded (`new Function("$$g",
  "$$r", …)` in the browser, an import in build-time output later).
- Generated code **never names a real global**. Every identifier in it is
  a local declared in the source, `$$s`, `$$g` or `$$r`. Identifiers
  starting with `$$` are reserved (C005), so source can't reach the three
  of them.
- The code runs in strict mode.
- Everything else is native JavaScript: operators, template literals,
  regex literals (a fresh object per evaluation), destructuring, spread,
  arrow functions and statements.

### Name resolution

Each identifier resolves, in this order:

1. a **local**: an arrow or function parameter, `let`/`const`, a function
   declaration, a catch parameter, or a `for` head, with block scoping;
2. a **scope name**: the caller supplies the set (component variables,
   ids, context variables such as `$item`, app globals such as `toast`);
3. an **allowed global** (table below).

Anything else is a **compile error**: C002 with a replacement hint for a
known browser or platform global (`window`, `fetch`, `setTimeout`, …),
otherwise C001 ("Cannot find name").

- **Divergence from XMLUI:** an unknown name is a compile error, not a
  `globalThis` lookup or `undefined`. Functions from `index.html` must be
  registered explicitly (open question 1).

**Allowed globals:**

| Kind | Names |
|------|-------|
| Values | `undefined`, `NaN`, `Infinity` |
| Functions | `parseInt`, `parseFloat`, `isNaN`, `isFinite`, `encodeURIComponent`, `decodeURIComponent`, `encodeURI`, `decodeURI`, `structuredClone` |
| Namespaces | `Math`, `JSON`, `Intl`, `console` |
| Constructors and their statics | `Object` (curated, see below), `Array`, `String`, `Number`, `Boolean`, `BigInt`, `Date`, `RegExp`, `Map`, `Set`, `WeakMap`, `WeakSet`, the `Error` family, `URL`, `URLSearchParams`, `TextEncoder`, `TextDecoder`, `Blob`, `File`, `ArrayBuffer`, `DataView`, typed arrays |

- Not available yet: `Promise` (step 7, with async handlers), `Symbol`,
  `Reflect`, `Proxy`, `Function`, `globalThis`, timers, network, storage,
  DOM.
- `Object` is a **curated copy**. It drops `getPrototypeOf`,
  `setPrototypeOf`, `getOwnPropertyDescriptor(s)`, `defineProperty`,
  `defineProperties`, and the `__define/lookup*__` members, because those
  reach prototypes and getters (C011 when written directly).
  `instanceof Object` still works.

### Closing the paths to code execution

Static name resolution removes direct access. The remaining paths go
through members, so they are cut as well:

- **Banned member names:** `constructor`, `prototype`, `__proto__`,
  `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`,
  `__lookupSetter__`, `caller`, `callee`, `prepareStackTrace`.
  - `[].constructor.constructor` gives `Function`, and `Error.prepareStackTrace`
    gives V8 call sites, whose `getThis()` can reach `window`.
  - **At compile time:** for `a.b`, string-literal keys, destructuring keys,
    and `__proto__` as an object-literal key (C003).
  - **At runtime:** for computed keys. `a[k]` compiles to
    `a?.[$$r.key(k)]`, which converts the key once and throws on a banned
    name. Number and string literal keys are checked statically and get no
    guard.
- **`new`**: allowed only when the callee is statically an allowlisted
  constructor: the list XMLUI uses, plus the `Intl.*` formatters (C004).
  - The callee is checked by name, not by identity at runtime.
- **Writing to a built-in** (`Math.max = …`, `JSON = …`) is a compile
  error (C010).
- **`this`:** calls through a scope name or a global compile to
  `(0, $$s.f)?.(…)`, so `this` is `undefined` and never the scope object
  or the globals. (`this` itself is S030 in pfui script.)
- **Invariant for later steps:** values the runtime puts into a scope
  (event objects, component APIs) must not expose raw platform objects
  such as DOM nodes or `window`. The sandbox cuts paths through code; the
  boundary keeps raw values out.
- **Writes to functions are refused at runtime.** Script can reach shared
  built-in functions (`({}).hasOwnProperty`, `s.toUpperCase`, `Array`).
  Setting `.call` on one would hijack host code that calls it, for example
  a library running `Object.prototype.hasOwnProperty.call(domNode, k)`,
  and that would hand raw platform objects to script. So every member
  write compiles to `$$r.obj(o).x = v`, and `$$r.obj()` throws on a
  function. The curated `Object.assign` applies the same rule. Found while
  writing the escape tests; it replaced an earlier "known limit" in this
  plan.

### Semantics

- **Optional chaining by default:** every member access and call emits
  `?.`, matching XMLUI.
  - An assignment target keeps a plain last link: `a.b.c = 1` becomes
    `(a?.b).c = 1`.
  - `new` callees are parenthesized.
- **Bindings don't write state:** an assignment, `++`/`--` or `delete`
  whose root is a scope name is C006. Writes to locals inside callbacks
  are fine (`reduce((acc, x) => { acc[x.id] = x; return acc }, {})`).
  - **Divergence:** XMLUI's sync evaluator allows writes in bindings.
- **`var` inside a function** is C007, matching XMLUI.
- **Promises:** the runtime's binding loader throws if a binding's
  *result* is a promise (or any thenable).
  - **Divergence:** XMLUI checks after every call. Checking each call
    would put a runtime hook back on every call. A promise in an
    intermediate position produces a wrong value, not a hang.
- **Interpolation** follows `extractParam.ts`: the end trimming, the raw
  value of a lone expression, and string joining with
  `$$r.str(v)`, where `null`/`undefined` give `""`.
  - A value with no expression compiles to a constant.

### Dependencies

`dependencies` is the sorted set of **scope names read** anywhere in the
binding, including inside callbacks (`items.filter(i => i.price > min)`
depends on `items` and `min`). Root names are enough for step 4's
per-variable reactivity. Member paths (`user.address.city`) can be added if
step 4 shows a need.

### API (`@patchfuil/compiler`)

```ts
compileExpression(expression, { scope }): CompileResult
compileInterpolation(segments, { scope }): CompileResult
// scope: ReadonlySet<string> | ((name: string) => boolean)
interface CompileResult {
  code: string;            // "($$s) => …"
  dependencies: string[];
  constant: boolean;       // no expression (a literal value)
  diagnostics: Diagnostic[];
}
```

### Runtime (`@patchfuil/runtime`)

- `scriptGlobals` (`$$g`): the frozen allowlist objects.
- `scriptRuntime` (`$$r`): `key()`, `obj()` and `str()`.
- `loadBinding(code)`: instantiates the compiled code and returns
  `(scope) => value`, with the promise check.

The compiler's name tables and the runtime's objects must agree. A drift
test in `tools/` compares them.

### Diagnostics (prefix `C`)

| Code | Meaning |
|------|---------|
| C001 | Cannot find name 'x' |
| C002 | 'x' is not available in pfui script (with a hint) |
| C003 | Member 'x' is not accessible in pfui script |
| C004 | 'new' is not allowed with 'X' |
| C005 | Names starting with '$$' are reserved |
| C006 | A binding cannot change 'x' |
| C007 | 'var' is not allowed inside a function |
| C008 | Not allowed inside an expression (`import`, `export`) |
| C009 | `async`/`await` cannot be compiled |
| C010 | A built-in cannot be modified |
| C011 | 'X.y' is not available in pfui script |

## Steps

- [x] Name tables (globals, constructors, banned names and members)
- [x] Resolver and emitter (precedence-correct output, optional chaining, guards)
- [x] `compileExpression`, `compileInterpolation`, dependencies
- [x] Runtime: globals, helpers, `loadBinding`
- [x] Tests:
  - [x] emitted code;
  - [x] resolution diagnostics;
  - [x] dependencies;
  - [x] a semantic conformance table, run in the runtime;
  - [x] equivalence with native JavaScript over every operator pair;
  - [x] sandbox escapes;
  - [x] the drift test
- [x] Corpus: every XMLUI binding compiles to JS that `new Function` accepts
- [x] Benchmark: compile time and the evaluation cost compared with hand-written JS
- [x] Docs ([`../docs/codegen.md`](../docs/codegen.md))

## Findings

- **XMLUI apps rely on the `globalThis` fallback for host functions.** In
  the corpus, all four compile findings are this case:
  `globalThis.getBlurb`, `globalThis.transformStops` and
  `window.formatMonth`. In the docs, tutorials 5–10 use `window.*`
  helpers defined in `index.html` throughout. Open question 1 matters for
  compatibility.
- **The shared-function write path** (see "Writes to functions are refused
  at runtime") was found while writing the escape tests. It is closed by
  `$$r.obj()`.
- **Performance:**
  - compiling a parsed binding takes about 0.3 µs;
  - a compiled binding runs within about 10–15% of hand-written
    JavaScript;
  - XMLUI's compiled path still calls a runtime helper for every read and
    call.
- **`.ai/xmlui/expression-eval.md` is outdated** on `new`: it lists four
  constructors, but the source allows about 35.

## Open questions

1. **Host functions.** XMLUI apps call functions defined in `index.html`
   through `globalThis`. pfui needs an explicit registration, for example
   app configuration that lists the names, or a `pfui.register({...})` call
   before startup. Decide in step 5 or step 8.
2. **Runaway loops in bindings.** XMLUI stops a sync evaluation after
   1000 ms. Compiled code would need a loop counter in every loop body
   (`while`/`for` inside callbacks). Defer to step 6 or 7, together with
   handlers.
