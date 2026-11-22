import { runtimeInfo } from "@patchfuil/runtime";

export { componentMetadata } from "./metadata";

export const componentsInfo = {
  name: "@patchfuil/components",
  runtime: runtimeInfo.name,
} as const;
