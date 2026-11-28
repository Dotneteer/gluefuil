// A .gui file compiles to a module whose default export is its root component.
declare module "*.gui" {
  import type { ComponentType } from "react";
  const component: ComponentType;
  export default component;
}
