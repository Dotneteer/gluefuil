// TextBox: the first component with an API (step 8). Its text lives in a
// signal, which drives both rendering and the reactive `api.value`.
import { signal, useComponentApi, useSignal, type RegisterApi } from "@patchfuil/runtime";
import { useMemo, useRef, useState } from "react";

const asText = (value: unknown) => (value === undefined || value === null ? "" : String(value));

export function TextBox({
  initialValue,
  placeholder,
  onDidChange,
  registerApi,
}: {
  initialValue?: unknown;
  placeholder?: unknown;
  onDidChange?: (value: string) => void;
  registerApi?: RegisterApi;
}) {
  // `initialValue` is read once, at mount (as in XMLUI).
  const [text] = useState(() => signal(asText(initialValue)));
  const value = useSignal(text);
  const input = useRef<HTMLInputElement>(null);
  const api = useMemo(
    () => ({
      get value() {
        return text.get();
      },
      setValue(next: unknown) {
        text.set(asText(next));
      },
      focus() {
        input.current?.focus();
      },
    }),
    [text],
  );
  useComponentApi(registerApi, api);
  return (
    <input
      ref={input}
      className="pfui-TextBox"
      value={value}
      placeholder={placeholder === undefined || placeholder === null ? undefined : String(placeholder)}
      onChange={(event) => {
        text.set(event.target.value);
        onDidChange?.(event.target.value);
      }}
    />
  );
}
