// What an App tells the components inside it (step 32): its name (PageMetaTitle's
// suffix) and its logo's URL for the active tone (Logo).
import { createContext } from "react";

export interface AppInfo {
  readonly name?: string;
  readonly logoUrl?: string;
}

export const AppInfoContext = createContext<AppInfo>({});
