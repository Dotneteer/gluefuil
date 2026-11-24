// A .pfui file compiles to a module whose default export is its root component.
declare module "*.pfui" {
  import type { ComponentType } from "react";
  const component: ComponentType;
  export default component;
}
