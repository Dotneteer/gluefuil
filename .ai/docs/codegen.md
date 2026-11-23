# Code generation and the script sandbox

> Subsystem reference for `packages/compiler/src/codegen/` and
> `packages/runtime/src/script/`. Describes the code as it is. Design
> rationale and XMLUI comparison:
> [`../plan/poc-03-codegen.md`](../plan/poc-03-codegen.md).
>
> **Last updated:** step 9 (source markers).

## Role

Compiles a **binding** (an attribute value or text with `{…}`) from its
syntax tree to JavaScript source. Names are resolved at compile time against
the binding's scope and a closed allowlist of globals, which makes **the
compiler the sandbox**. The runtime turns the source into a function and
supplies the few objects the code may touch.

**Handlers** compile the same way, in *handler mode*: variables can be
written (§ Handlers), and calls are awaited implicitly. The async side is
described in [async-handlers.md](async-handlers.md).

## API

**Compiler** (`@patchfuil/compiler`):

```ts
compileExpression(expression, { scope }): CompileResult   // a value that is exactly {expr}
compileInterpolation(segments, { scope }): CompileResult  // segments from parseInterpolation
compileHandler(program, { scope, variables }): CompileResult  // from parseStatements
// scope: ReadonlySet<string> | ((name: string) => boolean)

interface CompileResult {
  code: string;            // "($$s) => …"
  dependencies: string[];  // scope names read, sorted
  constant: boolean;       // no expression; `value` holds the text
  value?: string;
  diagnostics: Diagnostic[];
}
```

**Runtime** (`@patchfuil/runtime`):

| Export | What it is |
|--------|------------|
| `loadBinding(code)` | `new Function` around `code`, bound to the globals and helpers. Returns `(scope) => value`. Throws `BindingError` when the result is a promise or other thenable. |
| `scriptGlobals` | `$$g`: the frozen globals object |
| `scriptRuntime` | `$$r`: the helpers `key`, `obj`, `str`, `th` (is it a thenable?), `arr` (async-aware array methods), and the path writes `setIn`, `deleteIn`, `updateIn`, `mutate` |
| `BANNED_MEMBERS`, `SandboxError` | The runtime copy of the member denylist; the error the helpers throw |

`loadBinding` needs `new Function`, so it does not work under a CSP without
`'unsafe-eval'`. Build-time output will import `$$g` and `$$r` instead
(step 12).

## Generated code

```text
user.address.city ?? 'Unknown'   →  ($$s) => $$s.user?.address?.city ?? 'Unknown'
f(a)                             →  ($$s) => (0, $$s.f)?.($$s.a)
Math.max(a, 0)                   →  ($$s) => $$g.Math?.max?.($$s.a, 0)
user[key]                        →  ($$s) => $$s.user?.[$$r.key($$s.key)]
new Date(a)                      →  ($$s) => new ($$g.Date)($$s.a)
(o => { o.a.b = 1 })             →  ($$s) => (o) => { $$r.obj(o?.a).b = 1; }
Hi {name}!                       →  ($$s) => "Hi " + $$r.str($$s.name) + "!"
```

**Names in the generated code:**

- A source local keeps its own name.
- A scope name is read as `$$s.name`.
- An allowed global is read as `$$g.name`, except `undefined`, `NaN` and
  `Infinity`, which are emitted as literals.
- Nothing else appears. Source identifiers starting with `$$` are reserved
  (C005).
- The code runs in strict mode (the loader adds `"use strict"`).

**Optional chaining by default:**

- Every member read and call emits `?.`, so `null.x` gives `undefined`.
- Writes keep a plain last link and throw on `null`, as in JavaScript.

**Calls through `$$s` or `$$g`** use `(0, …)?.()`, so the scope object or
the globals object is never `this`.

**Source markers:** with `markers: true` (internal; `compileModule` uses
it), every expression and statement start carries a marker for source
maps. See [source-maps.md](source-maps.md).

**Precedence:** the emitter tracks the precedence of each emitted
expression and adds parentheses only where JavaScript needs them. Special
cases:

- `??` mixed with `||`/`&&` (pfui accepts `a ?? b || c`; JavaScript does
  not);
- a unary left operand of `**`;
- an object literal as an arrow body or at the start of a statement;
- a `for` initializer that contains `in`.

## Handlers

`compileHandler` returns `($$s) => ($$x) => async handlerFunction`, where
`$$x` is the runtime's invocation context (see
[async-handlers.md](async-handlers.md)):

| Source | Function |
|--------|----------|
| A lone arrow or function expression | That function, made `async` |
| A lone reference (`save`, `api.save`) | `async (...$params) => { save(...$params) }` |
| Statements | `async (...$params) => { const $param = $params[0]; … }` |

Every call in the handler body is awaited implicitly when it returns a
thenable. Nested functions stay synchronous unless they contain `await`.

`$param`, `$params` and `$cancel` are locals (XMLUI `context-variables.md`,
`managed-react/cooperative-concurrency.md`).

**Writes in handler mode:**

| Source | Compiles to |
|--------|-------------|
| `count = v`, `count += v`, `count++`, `[a, b] = [b, a]` | `$$s.count = v`, …: the scope's setter (native JavaScript semantics, short-circuits included) |
| `settings.size = v` | `$$r.setIn($$s, "settings", ["size"], v)` |
| `settings.size op= v` | `$$r.setIn(…, $$s.settings?.["size"] op v)` |
| `settings.title ??= v` (and `||=`, `&&=`) | `($$s.settings?.["title"] ?? $$r.setIn(…, v))` |
| `settings.count++` | `$$r.updateIn($$s, "settings", ["count"], 1, false)` |
| `delete settings.old` | `$$r.deleteIn($$s, "settings", ["old"])` |
| `items.push(x)` (and `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin`) | `$$r.mutate($$s, "items", [], "push", [x])` |

- A computed key is evaluated once (bound to a `$$kN` temporary) and
  checked by `$$r.key()`.
- The path helpers copy each node along the path and assign the new root
  through the setter (`runtime/src/script/paths.ts`).
- Handler mode also applies inside callbacks within the handler
  (`items.forEach(i => total += i)`).
- **Errors:** writing a scope name that is not a variable is C012;
  destructuring or a `for` target into a variable's member is C013.

## Name resolution

Resolution is static and follows block scoping. In order:

1. **Locals:**
   - parameters, including destructured ones;
   - `let`/`const` and function declarations, hoisted to the top of their
     block;
   - catch parameters, `for` heads, and the name of a named function
     expression.
2. **Scope names**, from `options.scope`.
3. **Allowed globals** (`ALLOWED_GLOBALS` in `codegen/names.ts`).

Anything else is reported: C005 for a reserved `$$` name, C002 for a known
platform global (with a hint), C014 for a `$`-name (a context variable not
available here), otherwise C001. The full resolution order for markup
(variables, component IDs, app globals) is in [scoping.md](scoping.md). A scope name may reuse a
banned name (a variable called `top` is fine).

## The sandbox

| Path | Closed by |
|------|-----------|
| Platform globals (`window`, `fetch`, `eval`, …) | Not resolvable: C002 or C001 |
| `x.constructor.constructor`, `__proto__`, `prototype`, `caller`, `Error.prepareStackTrace`, … | `BANNED_MEMBERS`. Static names and literal keys are rejected at compile time (C003); computed keys go through `$$r.key()`, which throws a `SandboxError`. Object-literal keys: only `__proto__` is rejected. |
| `Object.getPrototypeOf`, `getOwnPropertyDescriptor(s)`, `defineProperty`, `defineProperties`, `setPrototypeOf` | Missing from the curated `Object`; C011 when written directly |
| `new` with anything that runs code | The callee must be statically one of `CONSTRUCTIBLE` (C004) |
| Changing built-ins | C010 for a direct write. `Math`, `JSON`, `Intl` and `console` are frozen copies; `Object` is a frozen curated function. |
| Setting properties on shared functions (`hasOwnProperty.call = …` would hijack host code) | Every member write goes through `$$r.obj()`, which refuses functions; the curated `Object.assign` does the same |
| Binding side effects | Assignment, `++`/`--` and `delete` on a scope name are C006 (bindings); handlers may write variables only (C012) |

Constructors such as `Array` and `Date` are shared with the host by identity,
so `instanceof` works. Writes to them are refused, because they are
functions.

**Invariant for the runtime:** values it puts into a scope (event objects,
component APIs) must not expose raw platform objects. The sandbox cuts paths
through code, not through data.

## Interpolated values

These follow XMLUI's `extractParam.ts`:

- A whitespace-only literal at either end is dropped.
- A lone expression gives its raw value.
- Otherwise the parts are joined. `$$r.str(v)` gives `""` for `null`,
  `undefined` and values without `toString`.
- A value with no expression is a constant (`constant: true`, `value`).
- A segment that failed to parse compiles to `undefined`; the parser has
  already reported it.

## Dependencies

`dependencies` is the sorted set of scope names read anywhere in the
binding, including inside callbacks. Locals and globals are not
dependencies.

## Files

| File | Contents |
|------|----------|
| `compiler/src/codegen/names.ts` | The tables: `ALLOWED_GLOBALS`, `LITERAL_GLOBALS`, `CONSTRUCTIBLE`, `BANNED_GLOBALS` (with hints), `BANNED_MEMBERS`, `RESTRICTED_GLOBAL_MEMBERS`, `RESERVED_PREFIX` |
| `compiler/src/codegen/emitter.ts` | `Emitter`: resolution, sandbox checks, dependency collection and printing in one pass; binding and handler modes (`handlerFunction`, variable-path writes); `boundIdentifiers` |
| `compiler/src/codegen/compile.ts` | `compileExpression`, `compileInterpolation`, `compileHandler` |
| `compiler/src/codegen/diagnostics.ts` | `CodegenDiagnostics` |
| `runtime/src/script/sandbox.ts` | `scriptGlobals`, `scriptRuntime`, `BANNED_MEMBERS`, `SandboxError` |
| `runtime/src/script/paths.ts` | `setIn`, `deleteIn`, `updateIn`, `mutate`, `ARRAY_MUTATORS` |
| `runtime/src/script/load.ts` | `loadBinding`, `BindingError`, `Binding` |

## Diagnostics

All are errors.

| Code | Meaning |
|------|---------|
| C001 | Cannot find name |
| C002 | Platform global not available (with a hint) |
| C003 | Banned member |
| C004 | `new` not allowed with this callee |
| C005 | `$$` names are reserved |
| C006 | A binding cannot change a scope name |
| C007 | `var` inside a function |
| C008 | `import`/`export` in a function body; `delete` of a variable |
| C009 | `async`; `await` outside handler code (a binding, a getter or setter). In `compileModule`, a C009 at the same place as the parser's S030 is dropped. |
| C010 | Modifying a built-in |
| C011 | A member left out of a curated global |
| C012 | A handler can only change variables |
| C013 | Destructuring or `for` target into a variable's member |
| C014 | A context variable (`$`-name) that is not available here |

## Tests

| File | Covers |
|------|--------|
| `compiler/tests/codegen/emit.test.ts` | Generated code for each construct; every output also passes `new Function` |
| `compiler/tests/codegen/diagnostics.test.ts` | Each C code with the source it points at |
| `compiler/tests/codegen/dependencies.test.ts` | Dependency sets, including shadowing and block scope |
| `compiler/tests/codegen/interpolation.test.ts` | `compileInterpolation` shapes and constants |
| `compiler/tests/codegen/handler.test.ts` | Handler shapes, implicit and explicit await, nested async functions, every kind of write, handler diagnostics |
| `runtime/tests/script/semantics.test.ts` | Conformance table: a binding plus a scope gives a value (operators, optional chaining, calls, callbacks with statements, globals, regex freshness, interpolation, the promise check) |
| `runtime/tests/script/native-equivalence.test.ts` | More than 3,000 operator combinations: the compiled value equals native JavaScript's |
| `runtime/tests/script/sandbox.test.ts` | Escape attempts in jsdom: rejected at compile time, rejected at runtime, or harmless; frozen globals; no shared prototype polluted afterwards |
| `tools/sandbox-drift.test.ts` | The compiler's tables match the runtime's objects |
| `tools/xmlui-corpus.test.ts` § bindings | Every XMLUI binding compiles to valid JavaScript; the only findings are listed host-function uses |
| `compiler/bench/codegen.bench.ts` | Compile time; compiled against hand-written evaluation |

The runtime's tests import `@patchfuil/compiler`, declared as a
devDependency. Only the runtime's `src/` must not import it.

## Measured

- **Corpus:** the 454 bindings in XMLUI's `.xmlui` files compile to valid
  JavaScript. The four findings are host functions reached through
  `globalThis`/`window`.
- **Docs:** in a one-off check, the 3,064 bindings in the docs samples
  compile to valid JavaScript. The only findings are `window.*` host
  functions (tutorials 5–10, two how-tos) and a variable named `top`, which
  a real scope resolves.
- **Performance** (`npm run bench`):
  - compiling a typical parsed binding takes about 0.3 µs;
  - a compiled binding evaluates within about 10–15% of the same expression
    written by hand in JavaScript.
