import type { FathomApi } from "../shared/api";

declare global {
  interface Window {
    fathom: FathomApi;
  }
}
