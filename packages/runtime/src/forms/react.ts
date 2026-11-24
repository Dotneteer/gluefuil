// The React side of forms (step 22): the enclosing form, and the field binding
// a bound input reads (provided by the formBinding behavior to exactly the
// input it wraps; the input clears it for whatever it renders inside).

import { createContext, createElement, useContext, type ReactNode } from "react";
import type { FormField, FormStore } from "./store";

const FormContext = createContext<FormStore | undefined>(undefined);

/** Provides a form's store to the bound inputs inside it. */
export function FormProvider({ store, children }: { store: FormStore; children?: ReactNode }) {
  return createElement(FormContext.Provider, { value: store }, children);
}

/** The enclosing form's store, if any. */
export function useFormStore(): FormStore | undefined {
  return useContext(FormContext);
}

/** What a bound input needs: its field, and the id of its messages (aria-describedby). */
export interface FieldBinding {
  field: FormField;
  messagesId: string;
}

const FieldContext = createContext<FieldBinding | null>(null);

/** Gives `binding` to the input inside (the formBinding behavior). */
export function FieldBindingProvider({ binding, children }: { binding: FieldBinding | null; children?: ReactNode }) {
  return createElement(FieldContext.Provider, { value: binding }, children);
}

/** The binding of the input being rendered, if it is bound. */
export function useFieldBinding(): FieldBinding | null {
  return useContext(FieldContext);
}
