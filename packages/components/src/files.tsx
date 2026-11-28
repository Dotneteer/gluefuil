// FileInput and FileUploadDropZone (step 32B; design: .ai/plan/poc-32b-files.md),
// both on react-dropzone (decision C). Files reach script as `File` objects
// (decision E). FileInput is wrapped like the other inputs (wrapComponent's
// value API: bindTo, required, validationStatus, setValue, focus events);
// `parseAs="csv"` loads papaparse in a lazy chunk (files-parse.ts).
import { lazyResource, signal, wrapComponent, useFrameworkText } from "@gluefuil/runtime";
import { Button as MantineButton, TextInput } from "@mantine/core";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties, type FocusEvent, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Icon } from "./icons";
import { enabledToDisabled, FOCUS_EVENTS, validationStatus } from "./inputs";
import { withLayout } from "./layout-wrap";
import { useLayout, type LayoutProps } from "./layout";
import { buttonVars } from "./mantine";
import { componentMetadata } from "./metadata";

const isTrue = (value: unknown) => value === true || value === "true";
const isFalse = (value: unknown) => value === false || value === "false";
const text = (value: unknown) => (value === undefined || value === null || value === "" ? undefined : String(value));

// --- Accept rules ------------------------------------------------------------------

/** The rules of `acceptsFileType`/`acceptedFileTypes`: an array, or a comma-separated string. */
export function acceptRules(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return list.map((v) => String(v).trim().toLowerCase()).filter((v) => v !== "");
}

/**
 * Whether a file matches the rules: `.ext` by its name, `type/*` and
 * `type/sub` by its MIME type (both kinds filter; XMLUI's octet-stream
 * mapping is not copied). No rules: everything.
 */
export function acceptsFile(file: { name?: string; type?: string }, rules: readonly string[]): boolean {
  if (rules.length === 0) return true;
  // While dragging, the browser shows types only (no names): an extension rule can't be decided yet.
  const name = typeof file.name === "string" ? file.name.toLowerCase() : undefined;
  const type = (file.type || "").toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith(".")) return name === undefined || name.endsWith(rule);
    if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

/** react-dropzone's `accept` for the MIME rules (it decides the drag state; drops are checked by `acceptsFile`). */
function dropzoneAccept(rules: readonly string[]): Record<string, string[]> | undefined {
  const mime = rules.filter((r) => r.includes("/"));
  return mime.length > 0 && mime.length === rules.length ? Object.fromEntries(mime.map((m) => [m, []])) : undefined;
}

const validator = (rules: readonly string[]) => (file: File) =>
  acceptsFile(file, rules) ? null : { code: "file-invalid-type", message: "This type of file is not accepted" };

// --- FileInput ---------------------------------------------------------------------

export interface ParseResult {
  file: File;
  data: unknown[];
  error?: Error;
}

/** FileInput's value with `parseAs` (XMLUI's ParseAsResult). */
export interface ParseAsResult {
  files: File[];
  parsedData: ParseResult[];
}

const csvChunk = lazyResource(() => import("./files-parse"));

/** The files of a FileInput value: File[], or a parse result's files. */
export function filesOf(value: unknown): File[] {
  if (Array.isArray(value)) return value.filter((f): f is File => typeof File !== "undefined" && f instanceof File);
  if (value !== null && typeof value === "object" && Array.isArray((value as ParseAsResult).files)) return filesOf((value as ParseAsResult).files);
  return [];
}

/** Parses the files as CSV or JSON (XMLUI FileInputReact.tsx 145–260). */
export async function parseFiles(files: File[], parseAs: "csv" | "json", csvOptions: unknown): Promise<{ results: ParseResult[]; fields: string[] | undefined }> {
  let fields: string[] | undefined;
  const results: ParseResult[] = [];
  for (const file of files) {
    try {
      const content = await file.text();
      if (content.trim() === "") {
        results.push(Object.freeze({ file, data: [] }));
        continue;
      }
      if (parseAs === "json") {
        const parsed: unknown = JSON.parse(content);
        results.push(Object.freeze({ file, data: Array.isArray(parsed) ? parsed : [parsed] }));
        continue;
      }
      const { parseCsv } = await csvChunk.load();
      const csv = parseCsv(content, csvOptions);
      if (csv.error) results.push(Object.freeze({ file, data: [], error: csv.error }));
      else {
        fields = csv.fields;
        results.push(Object.freeze({ file, data: csv.data }));
      }
    } catch (error) {
      results.push(Object.freeze({ file, data: [], error: error instanceof Error ? error : new Error(String(error)) }));
    }
  }
  return { results, fields };
}

/** What FileInput's ref exposes to the wrapper's API. */
interface FileInputHandle {
  focus(): void;
  open(): void;
  readonly inProgress: boolean;
  getFields(): string[] | undefined;
}

type FileInputViewProps = {
  value?: unknown;
  onChange?: (value: unknown) => void;
  disabled?: boolean;
  readOnly?: unknown;
  placeholder?: unknown;
  error?: boolean;
  wrapperProps?: Record<string, unknown>;
  acceptsFileType?: unknown;
  multiple?: unknown;
  directory?: unknown;
  parseAs?: unknown;
  csvOptions?: unknown;
  buttonLabel?: unknown;
  buttonIcon?: unknown;
  buttonIconPosition?: unknown;
  buttonPosition?: unknown;
  autoFocus?: unknown;
  onParseError?: (error: Error, file: File) => unknown;
  onFocus?: () => void;
  onBlur?: () => void;
  ref?: Ref<FileInputHandle>;
  className?: string;
  style?: CSSProperties;
};

function FileInputView(props: FileInputViewProps) {
  const t = useFrameworkText();
  const { value, onChange, disabled, error, placeholder, wrapperProps, onParseError, onFocus, onBlur, ref } = props;
  const readOnly = isTrue(props.readOnly);
  const parseAs = props.parseAs === "csv" || props.parseAs === "json" ? props.parseAs : undefined;
  // parseAs without acceptsFileType: its own extension (XMLUI).
  const rules = useMemo(() => {
    const given = acceptRules(props.acceptsFileType);
    return given.length > 0 ? given : parseAs ? [`.${parseAs}`] : [];
  }, [props.acceptsFileType, parseAs]);
  const [state] = useState(() => ({ inProgress: signal(false), fields: signal<string[] | undefined>(undefined) }));
  const textRef = useRef<HTMLInputElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const directory = isTrue(props.directory);
  const onDrop = async (accepted: File[]) => {
    if (accepted.length === 0) return;
    const files = Object.freeze([...accepted]) as File[];
    if (!parseAs) {
      latest.current.onChange?.(files);
      return;
    }
    state.inProgress.set(true);
    try {
      const { results, fields } = await parseFiles(files, parseAs, latest.current.csvOptions);
      if (fields) state.fields.set(Object.freeze([...fields]) as string[]);
      for (const result of results) {
        if (!result.error) continue;
        if (typeof onParseError === "function") void latest.current.onParseError?.(result.error, result.file);
        else console.error(`Failed to parse ${result.file.name}:`, result.error);
      }
      latest.current.onChange?.(Object.freeze({ files, parsedData: Object.freeze(results) }));
    } finally {
      state.inProgress.set(false);
    }
  };
  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop: (accepted: File[]) => void onDrop(accepted),
    validator: validator(rules),
    disabled: disabled === true || readOnly,
    multiple: isTrue(props.multiple) || directory,
    noClick: true,
    noKeyboard: true,
    noDragEventsBubbling: true,
    noPaste: true,
    useFsAccessApi: false,
  });
  useImperativeHandle(
    ref,
    () => ({
      focus: () => textRef.current?.focus(),
      open: () => {
        if (!latest.current.disabled && !isTrue(latest.current.readOnly)) open();
      },
      get inProgress() {
        return state.inProgress.get();
      },
      getFields: () => state.fields.get(),
    }),
    [open, state],
  );
  useEffect(() => {
    if (isTrue(props.autoFocus)) setTimeout(() => textRef.current?.focus(), 0);
    // On mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const names = filesOf(value).map((f) => f.name).join(", ");
  const openDialog = () => {
    if (!disabled && !readOnly) open();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openDialog();
  };
  // gotFocus/lostFocus: when focus enters or leaves the whole component.
  const focusIn = (event: FocusEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onFocus?.();
  };
  const focusOut = (event: FocusEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur?.();
  };
  const buttonAtStart = props.buttonPosition === "start";
  const icon = text(props.buttonIcon);
  const iconNode = icon ? <Icon name={icon} /> : undefined;
  const browse = (
    <MantineButton
      type="button"
      className="gfui-Button gfui-FileInput-button"
      vars={buttonVars}
      disabled={disabled || readOnly}
      onClick={openDialog}
      {...(iconNode ? (props.buttonIconPosition === "end" ? { rightSection: iconNode } : { leftSection: iconNode }) : {})}
    >
      {text(props.buttonLabel) ?? t("gfui.files.browse")}
    </MantineButton>
  );
  const root = getRootProps({ className: `gfui-FileInput${props.className ? ` ${props.className}` : ""}`, onFocus: focusIn, onBlur: focusOut });
  return (
    <div {...root} style={props.style} data-button-position={buttonAtStart ? "start" : "end"} data-disabled={disabled ? "" : undefined}>
      {buttonAtStart ? browse : null}
      <TextInput
        ref={textRef}
        className="gfui-FileInput-text"
        value={names}
        placeholder={text(placeholder)}
        readOnly
        disabled={disabled}
        error={error}
        onClick={openDialog}
        onKeyDown={onKeyDown}
        wrapperProps={wrapperProps as never}
        aria-haspopup="dialog"
        styles={{ input: { cursor: disabled ? "default" : "pointer" } }}
      />
      {buttonAtStart ? null : browse}
      <input {...(getInputProps({ accept: rules.join(",") || undefined, ...(directory ? { webkitdirectory: "", directory: "" } : {}) } as never) as Record<string, unknown>)} />
    </div>
  );
}

const fileValue = {
  prop: "value",
  change: "onChange",
  // A File, a File[] or a parse result; anything else is no files.
  parse: (raw: unknown) => (typeof File !== "undefined" && raw instanceof File ? Object.freeze([raw]) : Array.isArray(raw) || (raw !== null && typeof raw === "object") ? raw : undefined),
};

/** `FileInput`: picks files (`File[]`, or with `parseAs` `{ files, parsedData }`); binds to a Form with `bindTo`. */
export const FileInput = withLayout(
  wrapComponent(FileInputView as never, {
    props: componentMetadata.FileInput!.props,
    rename: { enabled: enabledToDisabled, validationStatus },
    events: { ...FOCUS_EVENTS, parseError: { prop: "onParseError" } },
    value: fileValue,
    withRef: true,
    api: ({ ref }) => {
      const handle = () => ref.current as FileInputHandle | null;
      return {
        focus: () => handle()?.focus(),
        open: () => handle()?.open(),
        get inProgress() {
          return handle()?.inProgress ?? false;
        },
        getFields: () => handle()?.getFields(),
      };
    },
  }),
);

// --- FileUploadDropZone ------------------------------------------------------------

type DropZoneProps = LayoutProps & {
  acceptedFileTypes?: unknown;
  maxFiles?: unknown;
  allowPaste?: unknown;
  enabled?: unknown;
  icon?: unknown;
  text?: unknown;
  onUpload?: (files: readonly File[]) => unknown;
  registerApi?: (api: object | undefined) => void;
  children?: ReactNode;
};

/**
 * `FileUploadDropZone`: files dropped on its children (or pasted into it with
 * `allowPaste`) fire `upload(files)`; it doesn't upload. Rejected files
 * (type, more than `maxFiles`) fire nothing, as in XMLUI.
 */
export function FileUploadDropZone(props: DropZoneProps) {
  const t = useFrameworkText();
  const { acceptedFileTypes, maxFiles, allowPaste, enabled, icon, onUpload, registerApi, children } = props;
  const layout = useLayout(props);
  const rules = useMemo(() => acceptRules(acceptedFileTypes), [acceptedFileTypes]);
  const max = Number(maxFiles);
  const handler = useRef(onUpload);
  handler.current = onUpload;
  const disabled = isFalse(enabled);
  const { getRootProps, getInputProps, isDragActive, isDragReject, open } = useDropzone({
    onDrop: (accepted: File[], rejected: FileRejection[]) => {
      if (accepted.length === 0 || rejected.length > 0) return;
      void handler.current?.(Object.freeze([...accepted]));
    },
    validator: validator(rules),
    ...(dropzoneAccept(rules) ? { accept: dropzoneAccept(rules) } : {}),
    ...(Number.isInteger(max) && max > 0 ? { maxFiles: max } : {}),
    disabled,
    noClick: true,
    noKeyboard: true,
    noDragEventsBubbling: true,
    // react-dropzone takes pasted files itself; only with allowPaste (XMLUI: off by default).
    noPaste: !isTrue(allowPaste),
    useFsAccessApi: false,
  });
  const api = useMemo(() => ({ open: () => open() }), [open]);
  useEffect(() => {
    if (!registerApi) return undefined;
    registerApi(Object.freeze(api));
    return () => registerApi(undefined);
  }, [registerApi, api]);
  // Paste (XMLUI FileUploadDropZoneReact.tsx 100–140): not when pasting into a text input or an
  // editable element inside the zone. Stopping the event here keeps it from react-dropzone's paste
  // handler (which runs after this one); the text paste itself goes on.
  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) event.stopPropagation();
  };
  const label = text(props.text) ?? t("gfui.files.drop");
  const placeholder = (
    <div className="gfui-FileUploadDropZone-placeholder">
      <Icon name={text(icon) ?? "upload"} fallback="upload" />
      <span>{label}</span>
    </div>
  );
  // With a validator, react-dropzone can't accept during a drag (no names yet): "unknown" counts as accepted.
  const dropping = isDragActive && !isDragReject;
  return (
    <div
      {...(getRootProps({ className: "gfui-FileUploadDropZone", onPaste, tabIndex: 0, "aria-label": label, role: "group" } as never) as Record<string, unknown>)}
      data-dropping={dropping ? "" : undefined}
      data-drop-enabled={disabled ? undefined : ""}
      {...layout.attributes}
      style={layout.style}
    >
      <input {...getInputProps()} />
      {children}
      {children === undefined || children === null ? (dropping ? null : placeholder) : null}
      {dropping ? <div className="gfui-FileUploadDropZone-overlay">{placeholder}</div> : null}
    </div>
  );
}
