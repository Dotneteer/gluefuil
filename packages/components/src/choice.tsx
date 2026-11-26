// Choice inputs (step 25; design: .ai/plan/poc-25-choice.md): Select and
// AutoComplete, one component on Mantine's Combobox primitives. Options come
// from `data` (with valueField/labelField) or from Option children, which the
// compiler turns into one reactive array (`$$options`). Values keep their type
// and are matched as strings (XMLUI); a single value is "" when empty, several
// are an array.
import { CheckIcon, Combobox, InputBase, Pill, PillsInput, useCombobox } from "@mantine/core";
import { wrapComponent, type WrapConfig } from "@gluefuil/runtime";
import { Fragment, createElement, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type FocusEvent, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Glyph } from "./icons";
import { enabledToDisabled, focusApi, validationStatus, FOCUS_EVENTS } from "./inputs";
import { withLayout } from "./layout-wrap";
import { componentMetadata } from "./metadata";

/** Mantine components rendered with props assembled at run time. */
const loose = (component: unknown) => component as ComponentType<Record<string, unknown>>;
const isTrue = (value: unknown) => value === true || value === "true";
const isFalse = (value: unknown) => value === false || value === "false";

/** One option, normalized. `item` is what templates see as `$item`. */
export interface ChoiceOption {
  key: string;
  value: unknown;
  label: string;
  enabled: boolean;
  keywords: string[];
  item: Record<string, unknown>;
  content?: ReactNode;
}

const keyOf = (value: unknown) => String(value);

function keywordsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value !== "") return [value];
  return [];
}

/**
 * The options: the compiled children (`$$options`), else `data` (strings, or
 * objects read through valueField/labelField). Value and label stand in for each
 * other; an option with neither is skipped (XMLUI Option.tsx 59–61); the first of
 * equal keys wins.
 */
export function choiceOptions(compiled: unknown, data: unknown, valueField = "value", labelField = "label"): ChoiceOption[] {
  const fromChildren = Array.isArray(compiled);
  const raw: unknown[] = fromChildren ? (compiled as unknown[]) : Array.isArray(data) ? data : data !== null && typeof data === "object" ? Object.values(data) : [];
  const seen = new Set<string>();
  const options: ChoiceOption[] = [];
  for (const entry of raw) {
    let fields: Record<string, unknown>;
    if (entry !== null && typeof entry === "object") {
      const object = entry as Record<string, unknown>;
      fields = fromChildren ? { ...object } : { ...object, value: object[valueField], label: object[labelField] };
    } else if (entry === undefined || entry === null) continue;
    else fields = { value: fromChildren ? entry : String(entry), label: String(entry) };
    const { $$content: content, ...item } = fields;
    const value = item.value ?? item.label;
    if (value === undefined || value === null || (typeof value === "number" && Number.isNaN(value))) continue;
    const label = item.label === undefined || item.label === null ? String(value) : String(item.label);
    const key = keyOf(value);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      key,
      value,
      label,
      enabled: !isFalse(item.enabled),
      keywords: keywordsOf(item.keywords),
      item: { ...item, value, label },
      ...(content !== undefined ? { content: content as ReactNode } : {}),
    });
  }
  return options;
}

/** XMLUI's search: the value, the label and the keywords contain the text (case-insensitive). */
export function matchesSearch(option: ChoiceOption, search: string): boolean {
  const text = search.trim().toLowerCase();
  if (text === "") return true;
  return `${option.key} ${option.label} ${option.keywords.join(" ")}`.toLowerCase().includes(text);
}

/** `groupBy`: the ungrouped first, then the groups by name (XMLUI SelectReact.tsx 428–461). */
export function groupOptions(options: ChoiceOption[], groupBy: string): { group: string | undefined; options: ChoiceOption[] }[] {
  const ungrouped: ChoiceOption[] = [];
  const groups = new Map<string, ChoiceOption[]>();
  for (const option of options) {
    const group = option.item[groupBy];
    if (group === undefined || group === null) ungrouped.push(option);
    else {
      const name = String(group);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(option);
    }
  }
  const sorted = [...groups.keys()].sort().map((group) => ({ group, options: groups.get(group)! }));
  return ungrouped.length > 0 ? [{ group: undefined, options: ungrouped }, ...sorted] : sorted;
}

const CREATE = "\u0000gfui-create";

type Template = (context: Record<string, unknown>) => ReactNode;

export interface ChoiceProps {
  kind: "Select" | "AutoComplete";
  multi: boolean;
  $$options?: unknown;
  data?: unknown;
  valueField?: unknown;
  labelField?: unknown;
  value?: unknown;
  onChange?: (value: unknown) => void;
  searchable?: unknown;
  creatable?: unknown;
  clearable?: unknown;
  placeholder?: unknown;
  label?: unknown;
  disabled?: boolean;
  readOnly?: unknown;
  autoFocus?: unknown;
  error?: unknown;
  wrapperProps?: Record<string, unknown>;
  dropdownHeight?: unknown;
  groupBy?: unknown;
  inProgress?: unknown;
  inProgressNotificationMessage?: unknown;
  initiallyOpen?: unknown;
  maxLength?: unknown;
  onItemCreated?: (item: string) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  optionTemplate?: Template;
  valueTemplate?: Template;
  emptyListTemplate?: Template;
  groupHeaderTemplate?: Template;
  ungroupedHeaderTemplate?: Template;
  className?: string;
  style?: Record<string, unknown>;
  ref?: Ref<HTMLElement>;
}

/** Select and AutoComplete: Mantine's Combobox with a button, a search input or pills as the target. */
export function ChoiceNative(props: ChoiceProps) {
  const { kind, multi, onChange, disabled, ref } = props;
  const readOnly = isTrue(props.readOnly);
  const searchable = kind === "AutoComplete" || isTrue(props.searchable);
  const creatable = kind === "AutoComplete" && isTrue(props.creatable);
  const valueField = typeof props.valueField === "string" ? props.valueField : "value";
  const labelField = typeof props.labelField === "string" ? props.labelField : "label";
  const [created, setCreated] = useState<unknown[]>([]);
  const options = useMemo(() => {
    const list = choiceOptions(props.$$options, props.data, valueField, labelField);
    const keys = new Set(list.map((o) => o.key));
    for (const value of created) if (!keys.has(keyOf(value))) list.push(...choiceOptions([{ value, label: value }], undefined));
    return list;
  }, [props.$$options, props.data, valueField, labelField, created]);
  const byKey = useMemo(() => new Map(options.map((o) => [o.key, o])), [options]);

  // The value: several (an array) or one ("" when none).
  const values: unknown[] = multi ? (Array.isArray(props.value) ? props.value : props.value === undefined || props.value === null || props.value === "" ? [] : [props.value]) : props.value === undefined || props.value === null || props.value === "" ? [] : [props.value];
  const selectedKeys = new Set(values.map(keyOf));
  const single = multi ? undefined : values.length > 0 ? (byKey.get(keyOf(values[0])) ?? { key: keyOf(values[0]), value: values[0], label: keyOf(values[0]), enabled: true, keywords: [], item: { value: values[0], label: keyOf(values[0]) } }) : undefined;

  // What the user typed; null while a single searchable input shows the selection's label.
  const [search, setSearch] = useState<string | null>(null);
  const searchText = search ?? "";
  // How the dropdown was opened: settleOnOpen (below) finishes the opening once the options mount.
  const openedBy = useRef<string>("unknown");
  const combobox = useCombobox({
    defaultOpened: isTrue(props.initiallyOpen) && !readOnly && !disabled,
    onDropdownOpen: (source) => {
      openedBy.current = source;
    },
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  // Mantine finds the highlighted option in a setTimeout(0) after opening, but its transition mounts
  // the options in an animation frame. On a busy machine the frame comes later, the index stays at
  // "none", and the next ArrowDown starts over from the first option (found in step 29: a flaky E2E
  // test). So the index is set when the options mount: by the keyboard, the active (or first)
  // option is highlighted; otherwise the keys continue from the current value.
  const optionsRef = useRef<HTMLDivElement>(null);
  const settleOnOpen = () => {
    const items = [...(optionsRef.current?.querySelectorAll("[data-combobox-option]") ?? [])];
    if (items.length === 0) return;
    if (openedBy.current === "keyboard") {
      if (!items.some((item) => item.hasAttribute("data-combobox-selected"))) combobox.selectActiveOption();
    } else combobox.updateSelectedOptionIndex(items.findIndex((item) => item.hasAttribute("data-combobox-active")));
  };

  const visible = search === null ? options : options.filter((o) => matchesSearch(o, searchText));
  const typed = searchText.trim();
  const canCreate =
    creatable &&
    typed !== "" &&
    !options.some((o) => o.label.toLowerCase() === typed.toLowerCase() || o.key.toLowerCase() === typed.toLowerCase());

  const commit = (next: unknown) => onChange?.(next);
  const pick = (option: ChoiceOption) => {
    if (multi) {
      commit(selectedKeys.has(option.key) ? values.filter((v) => keyOf(v) !== option.key) : [...values, option.value]);
      setSearch(null);
      combobox.updateSelectedOptionIndex("selected");
      return;
    }
    if (!single || single.key !== option.key) commit(option.value);
    setSearch(null);
    combobox.closeDropdown();
  };
  const create = () => {
    setCreated((list) => [...list, typed]);
    props.onItemCreated?.(typed);
    if (multi) commit([...values, typed]);
    else commit(typed);
    setSearch(null);
    if (!multi) combobox.closeDropdown();
  };
  const submit = (key: string) => {
    if (readOnly) return;
    if (key === CREATE) return create();
    const option = byKey.get(key);
    if (option && option.enabled) pick(option);
  };
  const remove = (key: string) => {
    if (readOnly || disabled) return;
    commit(values.filter((v) => keyOf(v) !== key));
  };
  const clear = () => {
    commit(multi ? [] : "");
    setSearch(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (readOnly) {
      if (event.key !== "Tab") event.preventDefault();
      return;
    }
    if (multi && event.key === "Backspace" && searchText === "" && values.length > 0) {
      commit(values.slice(0, -1));
      return;
    }
    // AutoComplete: Enter picks the only item when none is highlighted (XMLUI AutoCompleteReact.tsx 494–505).
    if (kind === "AutoComplete" && event.key === "Enter" && combobox.dropdownOpened && combobox.getSelectedOptionIndex() === -1) {
      const items = [...(canCreate ? [CREATE] : []), ...visible.filter((o) => o.enabled).map((o) => o.key)];
      if (items.length === 1) {
        event.preventDefault();
        submit(items[0]!);
      }
    }
  };

  // --- The list ------------------------------------------------------------
  const optionNode = (option: ChoiceOption) => {
    const checked = selectedKeys.has(option.key);
    const content =
      option.content ??
      (props.optionTemplate ? props.optionTemplate({ $item: option.item, $selectedValue: multi ? values : values[0] ?? "", $checked: checked, $inTrigger: false }) : <span>{option.label}</span>);
    return (
      <Combobox.Option
        key={option.key}
        value={option.key}
        disabled={!option.enabled}
        active={checked}
        aria-selected={checked}
        data-checked={checked || undefined}
        className="gfui-Choice-option"
      >
        {checked ? <CheckIcon className="gfui-Choice-check" size={12} /> : <span className="gfui-Choice-check" />}
        <span className="gfui-Choice-optionContent">{content}</span>
      </Combobox.Option>
    );
  };
  const groupBy = typeof props.groupBy === "string" && props.groupBy !== "" ? props.groupBy : undefined;
  const list: ReactNode[] = [];
  if (canCreate) {
    list.push(
      <Combobox.Option key={CREATE} value={CREATE} className="gfui-Choice-option gfui-Choice-create">
        {`Create "${typed}"`}
      </Combobox.Option>,
    );
  }
  if (groupBy) {
    for (const { group, options: members } of groupOptions(visible, groupBy)) {
      const header =
        group === undefined
          ? props.ungroupedHeaderTemplate?.({})
          : props.groupHeaderTemplate
            ? props.groupHeaderTemplate({ $group: group })
            : group;
      list.push(
        header === undefined || header === null ? (
          <Fragment key="$$ungrouped">{members.map(optionNode)}</Fragment>
        ) : (
          <Combobox.Group key={group ?? "$$ungrouped"} label={header}>
            {members.map(optionNode)}
          </Combobox.Group>
        ),
      );
    }
  } else list.push(...visible.map(optionNode));
  const empty = visible.length === 0 && !canCreate;
  const inProgress = isTrue(props.inProgress);
  const emptyNode = props.emptyListTemplate?.({}) ?? (
    <span className="gfui-Choice-empty">
      <Glyph name="noresult" />
      List is empty
    </span>
  );
  const height = props.dropdownHeight === undefined || props.dropdownHeight === null || props.dropdownHeight === "" ? "220px" : String(props.dropdownHeight);

  // --- The target ------------------------------------------------------------
  const label = props.label === undefined || props.label === null || props.label === "" ? undefined : String(props.label);
  const placeholder = props.placeholder === undefined || props.placeholder === null ? undefined : String(props.placeholder);
  const clearable = !readOnly && !disabled && values.length > 0 && (kind === "AutoComplete" || isTrue(props.clearable));
  const clearButton = clearable ? <Combobox.ClearButton onClear={clear} aria-label="Clear" /> : undefined;
  const chevron = <Combobox.Chevron />;
  const rightSection = clearButton ?? chevron;
  const common = {
    label,
    // Its own label looks like the label behavior's (and gets the required mark in a form).
    labelProps: { className: "gfui-Label-text" },
    error: props.error,
    disabled,
    wrapperProps: props.wrapperProps,
    className: props.className,
    style: props.style,
    rightSection,
    rightSectionPointerEvents: clearButton ? "all" : "none",
  };
  const open = () => {
    if (!readOnly && !disabled) combobox.openDropdown();
  };
  const toggle = () => {
    if (!readOnly && !disabled) combobox.toggleDropdown();
  };

  let target: ReactNode;
  if (multi) {
    const pills = values.map((value) => {
      const key = keyOf(value);
      const option = byKey.get(key) ?? { key, value, label: key, enabled: true, keywords: [], item: { value, label: key } };
      if (props.valueTemplate) {
        return <Fragment key={key}>{props.valueTemplate({ $item: option.item, $itemContext: { removeItem: () => remove(key) } })}</Fragment>;
      }
      return (
        <Pill key={key} withRemoveButton={!readOnly && !disabled} onRemove={() => remove(key)} className="gfui-Choice-pill" removeButtonProps={{ "aria-label": `Remove ${option.label}` }}>
          {option.label}
        </Pill>
      );
    });
    target = createElement(
      loose(Combobox.DropdownTarget),
      null,
      createElement(
        loose(PillsInput),
        { ...common, pointer: !searchable, onClick: searchable ? open : toggle },
        <Pill.Group>
          {pills}
          {createElement(
            loose(Combobox.EventsTarget),
            { withExpandedAttribute: true },
            createElement(loose(PillsInput.Field), {
              ref,
              value: searchText,
              placeholder: values.length === 0 ? placeholder : undefined,
              readOnly: readOnly || !searchable,
              pointer: !searchable,
              autoFocus: isTrue(props.autoFocus),
              maxLength: typeof props.maxLength === "number" ? props.maxLength : undefined,
              onChange: (event: { currentTarget: { value: string } }) => {
                setSearch(event.currentTarget.value);
                combobox.openDropdown();
                combobox.resetSelectedOption();
              },
              onFocus: (event: FocusEvent) => {
                if (searchable) open();
                props.onFocus?.(event);
              },
              onBlur: (event: FocusEvent) => {
                combobox.closeDropdown();
                setSearch(null);
                props.onBlur?.(event);
              },
              onKeyDown,
            }),
          )}
        </Pill.Group>,
      ),
    );
  } else if (searchable) {
    target = createElement(
      loose(Combobox.Target),
      { withExpandedAttribute: true },
      createElement(loose(InputBase), {
        ...common,
        ref,
        value: search ?? single?.label ?? "",
        placeholder,
        readOnly,
        autoFocus: isTrue(props.autoFocus),
        maxLength: typeof props.maxLength === "number" ? props.maxLength : undefined,
        onChange: (event: { currentTarget: { value: string } }) => {
          setSearch(event.currentTarget.value);
          open();
          combobox.resetSelectedOption();
        },
        onClick: open,
        onFocus: (event: FocusEvent) => {
          if (kind === "Select") open();
          props.onFocus?.(event);
        },
        onBlur: (event: FocusEvent) => {
          combobox.closeDropdown();
          // AutoComplete: an emptied input clears the value (XMLUI AutoCompleteReact.tsx 729–737).
          if (kind === "AutoComplete" && search !== null && search.trim() === "" && single) commit("");
          setSearch(null);
          props.onBlur?.(event);
        },
        onKeyDown,
      }),
    );
  } else {
    const shown = single
      ? props.valueTemplate
        ? props.valueTemplate({ $item: single.item, $itemContext: { removeItem: () => clear() } })
        : single.label
      : undefined;
    target = createElement(
      loose(Combobox.Target),
      { targetType: "button", withExpandedAttribute: true },
      createElement(
        loose(InputBase),
        {
          ...common,
          ref,
          component: "button",
          type: "button",
          pointer: true,
          autoFocus: isTrue(props.autoFocus),
          "aria-readonly": readOnly || undefined,
          onClick: toggle,
          onFocus: props.onFocus,
          onBlur: (event: FocusEvent) => {
            combobox.closeDropdown();
            props.onBlur?.(event);
          },
          onKeyDown,
        },
        shown !== undefined && shown !== null && shown !== "" ? <span className="gfui-Choice-value">{shown}</span> : <span className="gfui-Choice-placeholder">{placeholder ?? " "}</span>,
      ),
    );
  }

  return (
    <Combobox store={combobox} onOptionSubmit={submit} withinPortal={false} readOnly={readOnly} classNames={{ dropdown: `gfui-Choice-dropdown gfui-${kind}-dropdown` }}>
      {target}
      <Combobox.Dropdown hidden={readOnly || disabled}>
        <Combobox.Options ref={optionsRef} style={{ maxHeight: height, overflowY: "auto" }}>
          <OnMount run={settleOnOpen} />
          {inProgress ? <Combobox.Empty>{props.inProgressNotificationMessage === undefined ? "" : String(props.inProgressNotificationMessage)}</Combobox.Empty> : list}
          {!inProgress && empty ? <Combobox.Empty>{emptyNode}</Combobox.Empty> : null}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

// --- Markup components --------------------------------------------------------

/** A value as given (initialValue, setValue): one keeps its type, "" when empty; several are an array. */
const singleValue = (raw: unknown) => (raw === undefined || raw === null ? "" : raw);
const multiValue = (raw: unknown) => (Array.isArray(raw) ? raw : raw === undefined || raw === null || raw === "" ? [] : [raw]);

const TEMPLATES: WrapConfig["templates"] = {
  optionTemplate: { prop: "optionTemplate", context: (context: Record<string, unknown>) => context },
  valueTemplate: { prop: "valueTemplate", context: (context: Record<string, unknown>) => context },
  emptyListTemplate: { prop: "emptyListTemplate", context: () => ({}) },
  groupHeaderTemplate: { prop: "groupHeaderTemplate", context: (context: Record<string, unknown>) => context },
  ungroupedHeaderTemplate: { prop: "ungroupedHeaderTemplate", context: () => ({}) },
};

function choice(kind: "Select" | "AutoComplete", multiProp: string) {
  const config = (multi: boolean): WrapConfig => ({
    props: componentMetadata[kind]!.props,
    rename: { enabled: enabledToDisabled, validationStatus, [multiProp]: () => ({}) },
    // itemCreated's text is its $param (an event without configuration gets no arguments).
    events: { ...FOCUS_EVENTS, itemCreated: "onItemCreated" },
    value: { prop: "value", change: "onChange", parse: multi ? multiValue : singleValue },
    templates: TEMPLATES,
    withRef: true,
    api: focusApi,
    fixed: { kind, multi, className: `gfui-${kind}` },
  });
  const Single = wrapComponent(ChoiceNative as never, config(false));
  const Multi = wrapComponent(ChoiceNative as never, config(true));
  // `multiSelect` / `multi` picks the value's shape, so it picks the wrapper (a change remounts it).
  function Choice(props: Record<string, unknown>) {
    return createElement(isTrue(props[multiProp]) ? Multi : Single, props);
  }
  Choice.displayName = kind;
  return withLayout(Choice);
}

export const Select = choice("Select", "multiSelect");
export const AutoComplete = choice("AutoComplete", "multi");

/** Runs `run` once, when it mounts (in the commit that mounts its siblings). */
function OnMount({ run }: { run: () => void }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(run, []);
  return null;
}
