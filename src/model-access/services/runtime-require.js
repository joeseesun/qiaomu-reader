import { Platform } from "obsidian";
function getRuntimeRequire() {
  if (!Platform.isDesktopApp || typeof window === "undefined") return null;
  const container = window;
  return typeof container.require === "function" ? container.require : null;
}
export {
  getRuntimeRequire
};
