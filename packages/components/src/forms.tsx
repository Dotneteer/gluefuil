// Forms (step 22, .ai/plan/poc-22-forms.md): Form, and the behaviors that bind
// an input to it (formBinding, validation), after XMLUI's Form,
// FormBindingBehavior and ValidationBehavior. There is no FormItem.

import {
  ApiCaller,
  FieldBindingProvider,
  isDataError,
  FormProvider,
  provideContext,
  reportDiagnostic,
  reportRuntimeError,
  useComponentApi,
  useComputed,
  useFormStore,
  type FieldOptions,
  type FormField,
  type FormStore,
  type RegisterApi,
  type TemplateRenderer,
  type Severity,
  type ValidationMode,
  FormStore as Store,
  DEFAULT_FIELD_OPTIONS,
  confirm,
  toast,
  watch as watchSignal,
} from "@gluefuil/runtime";
import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isDataUrl, useDataUrlState } from "./data";
import { Button, SubmitButton } from "./mantine";
import { useDialogHost, type DialogHost } from "./overlay-context";

type Handler = ((...args: unknown[]) => unknown) | undefined;

export interface FormProps {
  data?: unknown;
  submitUrl?: unknown;
  submitMethod?: unknown;
  enabled?: unknown;
  saveLabel?: unknown;
  saveInProgressLabel?: unknown;
  cancelLabel?: unknown;
  hideButtonRow?: unknown;
  dataAfterSubmit?: unknown;
  keepModalOpenOnSubmit?: unknown;
  inProgressNotificationMessage?: unknown;
  completedNotificationMessage?: unknown;
  errorNotificationMessage?: unknown;
  buttonRowTemplate?: TemplateRenderer;
  onWillSubmit?: Handler;
  onSubmit?: Handler;
  onSuccess?: Handler;
  onSubmitError?: Handler;
  onCancel?: Handler;
  onReset?: Handler;
  onDirtyChanged?: Handler;
  contextScope?: unknown;
  registerApi?: RegisterApi;
  children?: ReactNode;
}

const isTrue = (value: unknown) => value === true || value === "true";
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/**
 * A form: edits a copy of `data`; inputs inside bind a path of it with
 * `bindTo`. `$data` shows the current values to its children.
 */
export function Form(props: FormProps) {
  // `data` as a URL (step 22B): loaded once, the form disabled meanwhile; the first value is the baseline.
  const dataUrl = isDataUrl(props.data) ? props.data.trim() : undefined;
  const [store] = useState(() => {
    const created = new Store(dataUrl ? {} : props.data);
    if (dataUrl) created.loading.set(true);
    return created;
  });
  const latest = useRef(props);
  latest.current = props;
  const load = useDataUrlState(dataUrl);
  const applied = useRef(false);
  useEffect(() => {
    if (!dataUrl || applied.current) return;
    if (load.loaded) {
      applied.current = true;
      store.reset(load.value);
      store.loading.set(false);
    } else if (load.error) {
      store.generalErrors.set([`Couldn't load the form's data: ${load.error.message}`]);
    }
  }, [store, dataUrl, load.loaded, load.value, load.error]);
  // A submit to a URL goes through the data layer; unmounting aborts it.
  const [caller] = useState(() => new ApiCaller());
  useEffect(() => {
    caller.activate();
    return () => caller.dispose();
  }, [caller]);
  // `$data` for the children (compiled with the Form's context scope).
  provideContext(props.contextScope, { $data: () => store.data.get() });
  useLayoutEffect(() => {
    store.enabledProp.set(props.enabled !== false && props.enabled !== "false");
  }, [store, props.enabled]);

  // dirtyChanged: on each transition (not the first value).
  useEffect(() => {
    let previous = store.dirty.peek();
    let first = true;
    const check = () => {
      const next = store.dirty.peek();
      if (!first && next !== previous) void latest.current.onDirtyChanged?.(next);
      first = false;
      previous = next;
    };
    check();
    return watchSignal(store.dirty, check);
  }, [store]);

  // In a ModalDialog (step 27): the form's dirty state is the dialog's; Cancel and a
  // successful submit close it (XMLUI FormReact.tsx 560, 837–840).
  const dialog = useDialogHost();
  useEffect(() => {
    if (!dialog) return undefined;
    const report = () => dialog.setFormDirty(store, store.dirty.peek());
    report();
    const stop = watchSignal(store.dirty, report);
    return () => {
      stop();
      dialog.removeForm(store);
    };
  }, [dialog, store]);
  const submit = useSubmit(store, latest, caller, dataUrl, dialog);

  const api = useMemo(
    () => ({
      reset: (data?: unknown) => {
        store.reset(data);
        void latest.current.onReset?.();
      },
      update: (change: unknown) => store.update(change),
      validate: () => store.validate(),
      getData: () => store.getData(),
      isDirty: () => store.dirty.get(),
      setDirty: (dirty: unknown) => store.setDirty(dirty === true),
      submit: () => submit(),
      cancel: () => caller.cancel("user"),
      get isSubmitting() {
        return store.submitting.get();
      },
      get cancelled() {
        return store.cancelled.get();
      },
      get hasErrors() {
        return store.hasErrors.get();
      },
    }),
    [store, submit],
  );
  useComponentApi(props.registerApi, api);

  return (
    <form
      className="gfui-Form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      // A native reset (TextArea escResets, step 24, as XMLUI): what reset() does.
      onReset={(event) => {
        event.preventDefault();
        api.reset();
      }}
    >
      <ErrorSummary store={store} />
      <FormProvider store={store}>{props.children}</FormProvider>
      {isTrue(props.hideButtonRow) ? null : <ButtonRow store={store} props={props} dialog={dialog} />}
    </form>
  );
}

function ErrorSummary({ store }: { store: FormStore }) {
  const errors = useComputed(() => store.generalErrors.get(), [store]);
  if (errors.length === 0) return null;
  return (
    <div className="gfui-Form-summary" role="alert">
      {errors.map((message, index) => (
        <div key={index} className="gfui-ValidationMessage" data-severity="error">
          {message}
        </div>
      ))}
    </div>
  );
}

function ButtonRow({ store, props, dialog }: { store: FormStore; props: FormProps; dialog: DialogHost | null }) {
  const { submitting, enabled, data } = useComputed(
    () => ({ submitting: store.submitting.get(), enabled: store.enabledProp.get() && !store.loading.get(), data: props.buttonRowTemplate ? store.data.get() : undefined }),
    [store, props.buttonRowTemplate],
  );
  if (props.buttonRowTemplate) return <div className="gfui-Form-buttons">{props.buttonRowTemplate({ $data: data })}</div>;
  const saveLabel = submitting ? (props.saveInProgressLabel ?? "Saving...") : (props.saveLabel ?? "Save");
  return (
    <div className="gfui-Form-buttons">
      <Button
        label={props.cancelLabel ?? "Cancel"}
        enabled={enabled && !submitting}
        onClick={async () => {
          await props.onCancel?.();
          // In a ModalDialog: Cancel closes it (asking first when it is dirty).
          await dialog?.requestClose();
        }}
      />
      <SubmitButton label={saveLabel} enabled={enabled && !submitting} />
    </div>
  );
}

/**
 * The submit flow. A submit while one runs (or while disabled, or loading) is
 * ignored. Validation waits for pending checks; an error stops it and moves the
 * focus to the first invalid input; warnings show and don't block. Then
 * `willSubmit`, and `onSubmit`, or a request to `submitUrl` (or `data`'s URL)
 * through the data layer (step 22B). A failed request's validation errors land
 * on the inputs; a cancelled one ends quietly.
 */
function useSubmit(store: FormStore, latest: { current: FormProps }, caller: ApiCaller, dataUrl: string | undefined, dialog: DialogHost | null) {
  return useMemo(
    () => async (): Promise<void> => {
      if (store.submitting.peek() || !store.enabled.peek()) return;
      store.cancelled.set(false);
      store.dropServerResults();
      store.generalErrors.set([]);
      store.showAll();
      const result = await store.validate();
      if (!result.isValid) {
        store.firstInvalid()?.focusTarget?.();
        return;
      }
      // Warnings don't block, but are confirmed first (step 27; XMLUI FormReact.tsx 700, 1152–1180).
      const warnings = Object.values(result.warnings).flat();
      if (warnings.length > 0) {
        const proceed = await confirm({
          title: "Are you sure want to move forward?",
          message: `The following warnings were found during validation. Please make sure you are willing to move forward despite these issues.\n\n${warnings.map((w) => `• ${w}`).join("\n")}`,
          actionLabel: "Yes, proceed",
          cancelLabel: "No",
          actionThemeColor: "primary",
        });
        if (!proceed) return;
      }
      const props = latest.current;
      let payload = store.getData();
      // The notification messages (step 27): a loading toast, replaced by the outcome's.
      const progressMessage = notificationText(props.inProgressNotificationMessage);
      let toastId: string | undefined;
      const settleToast = (kind: "success" | "error", message: string | undefined) => {
        if (message !== undefined) toast[kind](message, toastId === undefined ? undefined : { id: toastId });
        else if (toastId !== undefined) toast.remove(toastId);
        toastId = undefined;
      };
      store.submitting.set(true);
      try {
        const answer = await props.onWillSubmit?.(payload, store.getAllData());
        if (answer === false) return;
        if (isPlainObject(answer)) payload = answer;
        let response: unknown;
        if (progressMessage !== undefined) toastId = toast.loading(progressMessage);
        const url = typeof props.submitUrl === "string" && props.submitUrl !== "" ? props.submitUrl : dataUrl;
        if (props.onSubmit) response = await props.onSubmit(payload);
        else if (url !== undefined) {
          let cancelled = false;
          const method = typeof props.submitMethod === "string" && props.submitMethod !== "" ? props.submitMethod : props.data !== undefined ? "put" : "post";
          response = await caller.execute(
            [payload],
            () => ({ url, method, body: payload, timeoutMs: 30_000 }),
            { retries: 0, retryDelay: 0 },
            { cancel: () => void (cancelled = true) },
          );
          if (cancelled) {
            store.cancelled.set(true);
            if (toastId !== undefined) toast.remove(toastId);
            return;
          }
        }
        store.markClean();
        store.submitting.set(false);
        settleToast("success", notificationText(props.completedNotificationMessage));
        await props.onSuccess?.(response);
        // In a ModalDialog: a successful submit closes it (the form is clean now).
        if (dialog && !isTrue(props.keepModalOpenOnSubmit)) void dialog.requestClose();
        const after = props.dataAfterSubmit;
        if (after === "reset" || after === "clear") {
          if (after === "reset") store.reset();
          else store.clear();
          await props.onReset?.();
        }
      } catch (error) {
        const problem = store.applySubmitError(error);
        store.submitting.set(false);
        settleToast("error", notificationText(props.errorNotificationMessage));
        // After the inputs re-render enabled (a disabled input can't take the focus).
        const target = store.firstServerInvalid() ?? store.firstInvalid();
        setTimeout(() => target?.focusTarget?.(), 0);
        // A server's answer is shown in the form; anything else is a bug worth reporting.
        if (props.onSubmitError) await props.onSubmitError(error, problem);
        else if (!isDataError(error)) reportRuntimeError(error, "handler");
      } finally {
        store.submitting.set(false);
      }
    },
    [store, latest, caller, dataUrl, dialog],
  );
}

const notificationText = (value: unknown): string | undefined => (value === undefined || value === null || value === "" ? undefined : String(value));

// --- The behaviors ---------------------------------------------------------------

interface ValidationSettings {
  rules: FieldOptions["rules"];
  validate: FieldOptions["validate"];
  mode: ValidationMode;
  debounceMs: number;
  displayDelayMs: number;
}

const ValidationContext = createContext<ValidationSettings | undefined>(undefined);

const number = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
};
const text = (value: unknown): string | undefined => (value === undefined || value === null || value === "" ? undefined : String(value));
const severity = (value: unknown): Severity | undefined => (value === "warning" ? "warning" : value === "error" ? "error" : undefined);

export interface ValidationBehaviorProps {
  required?: unknown;
  requiredInvalidMessage?: unknown;
  minLength?: unknown;
  maxLength?: unknown;
  lengthInvalidMessage?: unknown;
  lengthInvalidSeverity?: unknown;
  minValue?: unknown;
  maxValue?: unknown;
  rangeInvalidMessage?: unknown;
  rangeInvalidSeverity?: unknown;
  pattern?: unknown;
  patternInvalidMessage?: unknown;
  patternInvalidSeverity?: unknown;
  regex?: unknown;
  regexInvalidMessage?: unknown;
  regexInvalidSeverity?: unknown;
  matchValue?: unknown;
  matchInvalidMessage?: unknown;
  validationMode?: unknown;
  customValidationsDebounce?: unknown;
  validationDisplayDelay?: unknown;
  onValidate?: Handler;
  children?: ReactNode;
}

/** `validation`: the rules of the bound input inside (its formBinding wrapper applies them). No element of its own. */
export function ValidationBehavior(props: ValidationBehaviorProps) {
  const settings: ValidationSettings = {
    rules: {
      ...(isTrue(props.required) ? { required: true } : {}),
      ...optional("requiredInvalidMessage", text(props.requiredInvalidMessage)),
      ...optional("minLength", number(props.minLength)),
      ...optional("maxLength", number(props.maxLength)),
      ...optional("lengthInvalidMessage", text(props.lengthInvalidMessage)),
      ...optional("lengthInvalidSeverity", severity(props.lengthInvalidSeverity)),
      ...optional("minValue", number(props.minValue)),
      ...optional("maxValue", number(props.maxValue)),
      ...optional("rangeInvalidMessage", text(props.rangeInvalidMessage)),
      ...optional("rangeInvalidSeverity", severity(props.rangeInvalidSeverity)),
      ...optional("pattern", text(props.pattern)),
      ...optional("patternInvalidMessage", text(props.patternInvalidMessage)),
      ...optional("patternInvalidSeverity", severity(props.patternInvalidSeverity)),
      ...optional("regex", text(props.regex)),
      ...optional("regexInvalidMessage", text(props.regexInvalidMessage)),
      ...optional("regexInvalidSeverity", severity(props.regexInvalidSeverity)),
      ...(props.matchValue !== undefined ? { matchValue: props.matchValue } : {}),
      ...optional("matchInvalidMessage", text(props.matchInvalidMessage)),
    },
    validate: props.onValidate,
    mode: props.validationMode === "onChanged" || props.validationMode === "onLostFocus" ? props.validationMode : "errorLate",
    debounceMs: number(props.customValidationsDebounce) ?? 0,
    displayDelayMs: number(props.validationDisplayDelay) ?? 0,
  };
  return <ValidationContext.Provider value={settings}>{props.children}</ValidationContext.Provider>;
}

function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}

export interface FormBindingBehaviorProps {
  bindTo?: unknown;
  noSubmit?: unknown;
  children?: ReactNode;
}

const reported = new WeakSet<object>();

/**
 * `formBinding`: binds the input inside to the enclosing form's data at
 * `bindTo`, and shows its validation messages after it. Outside a Form the
 * input works unbound (reported once).
 */
export function FormBindingBehavior(props: FormBindingBehaviorProps) {
  const store = useFormStore();
  const settings = useContext(ValidationContext);
  const path = text(props.bindTo);
  if (!store || path === undefined) {
    if (!store) reportOnce(props, "An input with bindTo is not inside a Form: it works unbound");
    return <>{props.children}</>;
  }
  return (
    <BoundField store={store} path={path} noSubmit={isTrue(props.noSubmit)} settings={settings}>
      {props.children}
    </BoundField>
  );
}

function reportOnce(key: object, message: string): void {
  if (reported.has(key)) return;
  reported.add(key);
  reportDiagnostic(message);
}

function fieldOptions(path: string, noSubmit: boolean, settings: ValidationSettings | undefined): FieldOptions {
  return {
    ...DEFAULT_FIELD_OPTIONS,
    path,
    noSubmit,
    ...(settings ? { rules: settings.rules, validate: settings.validate, mode: settings.mode, debounceMs: settings.debounceMs, displayDelayMs: settings.displayDelayMs } : {}),
  };
}

function BoundField({ store, path, noSubmit, settings, children }: { store: FormStore; path: string; noSubmit: boolean; settings: ValidationSettings | undefined; children?: ReactNode }) {
  const messagesId = useId();
  // One field per path (a changed bindTo is a new field).
  const field = useMemo(() => store.createField(fieldOptions(path, noSubmit, settings)), [store, path]);
  const options = fieldOptions(path, noSubmit, settings);
  useLayoutEffect(() => {
    field.setOptions(options);
  });
  useLayoutEffect(() => {
    field.attach();
    return () => field.detach();
  }, [field]);
  const binding = useMemo(() => ({ field, messagesId }), [field, messagesId]);
  const required = settings?.rules.required === true;
  return (
    <span className="gfui-Field" data-required={required ? "" : undefined}>
      <FieldBindingProvider binding={binding}>{children}</FieldBindingProvider>
      <Messages field={field} id={messagesId} />
    </span>
  );
}

function Messages({ field, id }: { field: FormField; id: string }) {
  const visible = useComputed(() => (field.shown.get() ? field.results.get().filter((r) => !r.valid) : []), [field]);
  return (
    <span id={id} className="gfui-Field-messages" aria-live="polite">
      {[...visible]
        .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1))
        .map((result, index) => (
          <span key={index} className="gfui-ValidationMessage" data-severity={result.severity} data-stale={result.stale ? "" : undefined}>
            {result.message}
          </span>
        ))}
    </span>
  );
}
