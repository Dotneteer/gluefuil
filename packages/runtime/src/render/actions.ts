// Action elements inside <event> (step 32B; design: .ai/plan/poc-32b-files.md
// § G): `<event name="click"><APICall …/></event>` compiles to a handler that
// calls `actionHandler(APICall, props, handlers, scope)`. The props are
// constants or deferred values (they see `$param`/`$params`, the event's
// arguments); the element's own handlers (onSuccess, …) run in handler slots.
// The component runs the action through its static `runAction`.
import { createScope } from "../reactivity/scope";
import { HandlerSlot, type Invocation } from "./handlers";

export interface ActionInput {
  /** The element's props: constants, or deferred values (resolveDeferred with `$param`). */
  readonly props: Readonly<Record<string, unknown>>;
  /** The element's own handlers, by prop name (`onSuccess`), resolving to their results. */
  readonly handlers: Readonly<Record<string, (...args: unknown[]) => Promise<unknown>>>;
  /** The event's arguments. */
  readonly params: readonly unknown[];
}

/** A component usable as an action element: it has a static `runAction`. */
export interface ActionComponent {
  runAction?: (input: ActionInput) => Promise<unknown>;
}

type HandlerFactory = (scope: object) => (invocation: Invocation) => (...args: unknown[]) => unknown;

/** The handler factory of an action element (what compiled code puts in the event's place). */
export function actionHandler(type: unknown, props: Record<string, unknown>, handlers: Record<string, HandlerFactory>, scope: object) {
  return (_invocation: Invocation) =>
    async (...params: unknown[]) => {
      const run = (type as ActionComponent).runAction;
      if (typeof run !== "function") throw new Error("This component can't run as an action inside <event>");
      const calls: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
      // The action's own handlers see the event's arguments (XMLUI passes them as $param).
      const runScope = createScope({ $param: { value: params[0] }, $params: { value: Object.freeze([...params]) } }, scope);
      for (const [name, factory] of Object.entries(handlers)) {
        const slot = new HandlerSlot(factory(runScope));
        calls[name] = (...args) => slot.call(args);
      }
      // Called before any await: the action reads the running invocation (its cancellation).
      return run({ props, handlers: Object.freeze(calls), params });
    };
}
