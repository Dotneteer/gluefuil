// The form store (step 22, .ai/plan/poc-22-forms.md): a form's data, its bound
// fields, their interaction flags and validation results, all signals, so each
// reader re-renders only for what it reads. React-free.
//
// After XMLUI's form reducer (components/Form/FormReact.tsx), with these
// differences: an empty value passes every rule but `required`; `validate()`
// waits for pending custom checks; a custom check that throws is an error
// result (reported), not a field stuck pending.

import { reportRuntimeError } from "../errors";
import { batch, computed, signal, watch, type ReadonlySignal, type Signal } from "../reactivity/signals";
import { freezeDeep } from "../reactivity/variable";
import { INITIAL_FLAGS, isShown, type InteractionFlags, type ValidationMode } from "./display";
import { deleteAt, getAt, parseFieldPath, setAt, type FieldKey } from "./paths";
import { customResults, highestSeverity, validateRules, type FieldRules, type RuleResult, type Severity } from "./rules";
import { extractServerProblem, type ServerProblem } from "./server-errors";

export interface FieldOptions {
  /** `bindTo`: a path into the form's data. */
  path: string;
  rules: FieldRules;
  /** `onValidate`: returns (a promise of) null, a string, a boolean, or `{ isValid, invalidMessage, severity }`. */
  validate?: ((value: unknown) => unknown) | undefined;
  mode: ValidationMode;
  /** `customValidationsDebounce` (ms). */
  debounceMs: number;
  /** `validationDisplayDelay` (ms): a custom check slower than this shows its result when it settles, even while focused. */
  displayDelayMs: number;
  /** Left out of the submitted data and `$data`. */
  noSubmit: boolean;
}

export const DEFAULT_FIELD_OPTIONS: Omit<FieldOptions, "path"> = Object.freeze({
  rules: {},
  mode: "errorLate",
  debounceMs: 0,
  displayDelayMs: 0,
  noSubmit: false,
});

function sameRecord(a: object, b: object): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

function sameOptions(a: FieldOptions, b: FieldOptions): boolean {
  return sameRecord({ ...a, rules: undefined }, { ...b, rules: undefined }) && sameRecord(a.rules, b.rules);
}

const sameKeys = (a: readonly FieldKey[], b: readonly FieldKey[]) => a.length === b.length && a.every((key, i) => key === b[i]);

/** One bound input's field: its value (at its path), its flags and its results. */
export class FormField {
  readonly keys: readonly FieldKey[];
  readonly options: Signal<FieldOptions>;
  readonly flags = signal<InteractionFlags>(INITIAL_FLAGS);
  /** The input's own `initialValue`: the value while the data has none at the path. */
  private readonly initial = signal<unknown>(undefined);
  private readonly custom = signal<{ results: RuleResult[]; forValue: unknown } | undefined>(undefined);
  /** A custom check is scheduled or running. */
  readonly pending = signal(false);
  /** A slow custom check settled: show its result (`validationDisplayDelay`). */
  private readonly slowSettled = signal(false);
  readonly value: ReadonlySignal<unknown>;
  readonly results: ReadonlySignal<readonly RuleResult[]>;
  readonly severity: ReadonlySignal<Severity | "none">;
  /** Whether the input shows its invalid results now. */
  readonly shown: ReadonlySignal<boolean>;
  /** Moves the focus to the input (set by the input). */
  focusTarget: (() => void) | undefined;

  private runId = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private slowTimer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private stopWatching: (() => void)[] = [];

  constructor(
    readonly form: FormStore,
    options: FieldOptions,
  ) {
    this.keys = parseFieldPath(options.path);
    this.options = signal(options);
    this.value = computed(() => {
      const stored = getAt(form.values.get(), this.keys);
      return stored === undefined ? this.initial.get() : stored;
    });
    this.results = computed(() => {
      const value = this.value.get();
      const sync = validateRules(value, this.options.get().rules);
      const custom = this.custom.get();
      const server = form.serverResults.get()[this.options.get().path] ?? [];
      if (!custom) return server.length > 0 ? [...sync, ...server] : sync;
      const current = Object.is(custom.forValue, value);
      return [...sync, ...custom.results.map((r) => (current ? r : { ...r, stale: true })), ...server];
    });
    this.severity = computed(() => highestSeverity(this.results.get()));
    this.shown = computed(() => this.severity.get() !== "none" && (isShown(this.options.get().mode, this.flags.get()) || this.slowSettled.get()));
  }

  /** The input's `initialValue` (read once, when the input mounts). */
  setInitial(value: unknown): void {
    this.initial.set(freezeDeep(value));
  }

  /** Joins the form: writes the initial value into the data if it has none, starts checking. */
  attach(): void {
    this.form.register(this);
    this.reapplyInitial();
    // invalid → valid while focused (errorLate hides the message from then on).
    let previous = this.severity.peek();
    this.stopWatching.push(
      watch(this.severity, () => {
        const next = this.severity.peek();
        if (previous !== "none" && next === "none") this.updateFlags({ invalidToValid: true });
        previous = next;
      }),
    );
    let lastValue = this.value.peek();
    this.stopWatching.push(
      watch(this.value, () => {
        const next = this.value.peek();
        if (Object.is(next, lastValue)) return;
        lastValue = next;
        this.slowSettled.set(false);
        this.schedule();
      }),
    );
    // No custom check at mount: nothing shows before an edit, and validate() checks an
    // unchecked value. (A handler called from a layout effect may find its slot not yet
    // re-activated after StrictMode's simulated unmount.)
  }

  /** After a reset: the initial value again, where the data has none. */
  reapplyInitial(): void {
    const initial = this.initial.peek();
    if (initial !== undefined && getAt(this.form.values.peek(), this.keys) === undefined) this.form.writeValue(this.keys, initial);
  }

  /** Leaves the form; its value stays in the data (XMLUI). */
  detach(): void {
    for (const stop of this.stopWatching) stop();
    this.stopWatching = [];
    this.clearTimers();
    this.runId++;
    this.pending.set(false);
    this.form.unregister(this);
  }

  /** New options from the markup (a binding changed); equal options change nothing. */
  setOptions(options: FieldOptions): void {
    const before = this.options.peek();
    if (sameOptions(before, options)) return;
    this.options.set(options);
    if (before.validate !== options.validate && (before.validate === undefined) !== (options.validate === undefined)) this.schedule();
  }

  /** The user changed the value. */
  change(value: unknown): void {
    this.form.setValue(this.keys, value);
  }

  /**
   * Valid as far as known: no invalid result and no check still running. (XMLUI counts a
   * field whose async check is running as valid when it loses the focus, so a late "Already
   * registered" stays hidden unless `validationDisplayDelay` is set.)
   */
  private knownValid(): boolean {
    return this.severity.peek() === "none" && !this.pending.peek();
  }

  focus(): void {
    this.updateFlags({ focused: true, validOnFocus: this.knownValid() });
  }

  blur(): void {
    const flags = this.flags.peek();
    this.updateFlags({ focused: false, validOnBlur: this.knownValid(), afterFirstDirtyBlur: flags.dirty, invalidToValid: false });
  }

  updateFlags(change: Partial<InteractionFlags>): void {
    this.flags.set({ ...this.flags.peek(), ...change });
  }

  /** Waits for a scheduled or running custom check. */
  settled(): Promise<void> {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.run();
    } else if (this.options.peek().validate && !this.pending.peek()) {
      // Not checked yet, or checked for another value.
      const custom = this.custom.peek();
      if (custom === undefined || !Object.is(custom.forValue, this.value.peek())) {
        this.pending.set(true);
        this.run();
      }
    }
    return this.running ?? Promise.resolve();
  }

  /** Back to the initial flags; earlier custom results are dropped (the value is checked again when needed). */
  resetState(): void {
    this.clearTimers();
    this.runId++;
    this.flags.set(INITIAL_FLAGS);
    this.slowSettled.set(false);
    this.custom.set(undefined);
    this.pending.set(false);
    this.running = undefined;
  }

  private schedule(): void {
    this.clearTimers();
    if (!this.options.peek().validate) {
      this.runId++;
      this.custom.set(undefined);
      this.pending.set(false);
      this.running = undefined;
      return;
    }
    this.pending.set(true);
    const debounce = this.options.peek().debounceMs;
    if (debounce > 0) this.timer = setTimeout(() => ((this.timer = undefined), this.run()), debounce);
    else this.run();
  }

  private run(): void {
    const validate = this.options.peek().validate;
    if (!validate) return;
    const id = ++this.runId;
    const value = this.value.peek();
    const delay = this.options.peek().displayDelayMs;
    let slow = false;
    if (delay > 0) this.slowTimer = setTimeout(() => (slow = true), delay);
    const finish = (results: RuleResult[]) => {
      if (id !== this.runId) return;
      if (this.slowTimer !== undefined) clearTimeout(this.slowTimer);
      batch(() => {
        this.custom.set({ results, forValue: value });
        this.pending.set(false);
        if (slow && this.flags.peek().dirty) this.slowSettled.set(true);
      });
    };
    const failed = (error: unknown) => {
      reportRuntimeError(error, "handler");
      const message = error instanceof Error && error.message ? error.message : String(error);
      finish([{ rule: "custom", valid: false, severity: "error", message: `The check failed: ${message}`, custom: true }]);
    };
    let outcome: unknown;
    try {
      outcome = validate(value);
    } catch (error) {
      failed(error);
      this.running = undefined;
      return;
    }
    this.running = Promise.resolve(outcome).then((raw) => finish(customResults(raw)), failed);
  }

  private clearTimers(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    if (this.slowTimer !== undefined) clearTimeout(this.slowTimer);
    this.timer = this.slowTimer = undefined;
  }
}

export interface ValidationSummary {
  isValid: boolean;
  /** Invalid results with severity "error", by path. */
  errors: Record<string, string[]>;
  warnings: Record<string, string[]>;
  data: unknown;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** A form's state. */
export class FormStore {
  /** The working copy of the data (frozen). */
  readonly values: Signal<unknown>;
  private baseline: unknown;
  readonly fields = signal<readonly FormField[]>([]);
  private readonly formDirty = signal(false);
  readonly submitting = signal(false);
  /** Errors that belong to no field (a failed submit). */
  readonly generalErrors = signal<readonly string[]>([]);
  /** The Form's `enabled` prop. */
  readonly enabledProp = signal(true);
  /** The last submit was cancelled (`cancel()`, step 22B). */
  readonly cancelled = signal(false);
  /** Loading `data` from a URL (step 22B), or the load failed: disabled. */
  readonly loading = signal(false);
  /** A failed submit's errors for the bound inputs, by path (step 22B); cleared by an edit. */
  readonly serverResults = signal<Readonly<Record<string, readonly RuleResult[]>>>({});
  /** Inputs are enabled: the form is enabled and not submitting. */
  readonly enabled: ReadonlySignal<boolean>;
  readonly dirty: ReadonlySignal<boolean>;
  /** `$data`: the values without the `noSubmit` fields. */
  readonly data: ReadonlySignal<unknown>;
  readonly hasErrors: ReadonlySignal<boolean>;

  constructor(data: unknown) {
    this.baseline = freezeDeep(isPlainObject(data) ? data : {});
    this.values = signal(this.baseline);
    this.enabled = computed(() => this.enabledProp.get() && !this.submitting.get() && !this.loading.get());
    this.dirty = computed(() => this.formDirty.get() || this.fields.get().some((f) => f.flags.get().dirty));
    this.data = computed(() => this.clean(this.values.get(), this.fields.get()));
    this.hasErrors = computed(() => this.fields.get().some((f) => f.severity.get() === "error"));
  }

  createField(options: FieldOptions): FormField {
    return new FormField(this, options);
  }

  register(field: FormField): void {
    if (!this.fields.peek().includes(field)) this.fields.set([...this.fields.peek(), field]);
  }

  unregister(field: FormField): void {
    this.fields.set(this.fields.peek().filter((f) => f !== field));
  }

  /** Writes a value without marking anything dirty (initial values). */
  writeValue(keys: readonly FieldKey[], value: unknown): void {
    this.values.set(freezeDeep(setAt(this.values.peek(), keys, value)));
  }

  /** A change by the user (or `update()`): the fields at the path become dirty, and their forced display ends. */
  setValue(keys: readonly FieldKey[], value: unknown): void {
    batch(() => {
      this.writeValue(keys, value);
      this.formDirty.set(true);
      this.dropServerResults((path) => sameKeys(parseFieldPath(path), keys));
      for (const field of this.fields.peek()) {
        if (sameKeys(field.keys, keys)) field.updateFlags({ dirty: true, forceShow: false });
      }
    });
  }

  /** `update({ 'address.city': 'Paris' })`: a change per path. */
  update(change: unknown): void {
    if (!isPlainObject(change)) return;
    batch(() => {
      for (const [path, value] of Object.entries(change)) this.setValue(parseFieldPath(path), value);
    });
  }

  /** The values to submit: without the `noSubmit` fields. */
  getData(): unknown {
    return this.clean(this.values.peek(), this.fields.peek());
  }

  /** Every value, the `noSubmit` fields too. */
  getAllData(): unknown {
    return this.values.peek();
  }

  private clean(values: unknown, fields: readonly FormField[]): unknown {
    let result = values;
    for (const field of fields) if (field.options.peek().noSubmit) result = deleteAt(result, field.keys);
    return result;
  }

  setDirty(dirty: boolean): void {
    batch(() => {
      this.formDirty.set(dirty);
      if (!dirty) for (const field of this.fields.peek()) field.updateFlags({ dirty: false, afterFirstDirtyBlur: false });
    });
  }

  /** A submit attempt: every field shows its results until it is edited. */
  showAll(): void {
    batch(() => {
      for (const field of this.fields.peek()) field.updateFlags({ forceShow: true });
    });
  }

  /** Validates every field, waiting for pending custom checks. */
  async validate(): Promise<ValidationSummary> {
    await Promise.all(this.fields.peek().map((field) => field.settled()));
    const errors: Record<string, string[]> = {};
    const warnings: Record<string, string[]> = {};
    for (const field of this.fields.peek()) {
      const path = field.options.peek().path;
      for (const r of field.results.peek()) {
        if (r.valid) continue;
        const into = r.severity === "error" ? errors : warnings;
        (into[path] ??= []).push(r.message);
      }
    }
    return { isValid: Object.keys(errors).length === 0, errors, warnings, data: this.getData() };
  }

  /** The first field with an error, in registration order (the order of the inputs). */
  firstInvalid(): FormField | undefined {
    return this.fields.peek().find((field) => field.severity.peek() === "error");
  }

  /** Removes the server results of the paths `matches` selects. */
  dropServerResults(matches: (path: string) => boolean = () => true): void {
    const current = this.serverResults.peek();
    const kept = Object.fromEntries(Object.entries(current).filter(([path]) => !matches(path)));
    if (Object.keys(kept).length !== Object.keys(current).length) this.serverResults.set(kept);
  }

  /**
   * A failed submit's error: its validation problem onto the bound inputs
   * (nested paths too); names with no input, the problem's detail when nothing
   * else, or the error's message, to the summary. Returns the problem.
   */
  applySubmitError(error: unknown): ServerProblem | undefined {
    const problem = extractServerProblem(error);
    const paths = new Set(this.fields.peek().map((f) => f.options.peek().path));
    const byPath: Record<string, RuleResult[]> = {};
    const general: string[] = [];
    if (problem) {
      for (const entry of problem.fields) {
        if (paths.has(entry.name)) (byPath[entry.name] ??= []).push({ rule: "server", valid: false, severity: entry.severity, message: entry.message, server: true });
        else general.push(`${entry.name}: ${entry.message}`);
      }
      // XMLUI: the detail is a general message when there is no other.
      if (problem.detail !== undefined && general.length === 0) general.push(problem.detail);
    } else {
      const message = (error as { message?: unknown } | null)?.message;
      general.push(typeof message === "string" && message !== "" ? message : "Couldn't save the form.");
    }
    batch(() => {
      this.serverResults.set(byPath);
      this.generalErrors.set(general);
    });
    return problem;
  }

  /** The first field with a server error (registration order). */
  firstServerInvalid(): FormField | undefined {
    const results = this.serverResults.peek();
    return this.fields.peek().find((field) => (results[field.options.peek().path] ?? []).some((r) => r.severity === "error"));
  }

  /** After a successful submit: clean, nothing forced, no general errors. */
  markClean(): void {
    batch(() => {
      this.formDirty.set(false);
      this.generalErrors.set([]);
      this.serverResults.set({});
      for (const field of this.fields.peek()) field.updateFlags({ dirty: false, afterFirstDirtyBlur: false, forceShow: false });
    });
  }

  /**
   * Back to the baseline, or to `data` (which becomes the baseline). A
   * non-object argument is ignored, as XMLUI. Initial values of the inputs are
   * written again.
   */
  reset(data?: unknown): void {
    if (isPlainObject(data)) this.baseline = freezeDeep(data);
    this.restart(this.baseline);
  }

  /** Empty data (`dataAfterSubmit="clear"`). */
  clear(): void {
    this.restart(freezeDeep({}));
  }

  private restart(values: unknown): void {
    batch(() => {
      this.values.set(values);
      this.formDirty.set(false);
      this.generalErrors.set([]);
      this.serverResults.set({});
      for (const field of this.fields.peek()) field.resetState();
    });
    for (const field of this.fields.peek()) field.reapplyInitial();
  }
}
