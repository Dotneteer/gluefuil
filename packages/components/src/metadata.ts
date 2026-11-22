// React-free entry point: component metadata only. The compiler imports
// this module, so nothing reachable from here may import React, Mantine,
// or @patchfuil/runtime. The boundary test in tools/ enforces this.
export const componentMetadata = {} as const;
