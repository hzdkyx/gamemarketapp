import type { HzdKyxDesktopApi } from "../../../preload";

declare global {
  interface Window {
    hzdk?: HzdKyxDesktopApi;
  }
}

export {};
