import path from "node:path";

// Local engineering budget, not an Obsidian service limit. The speech feature
// adds a desktop-only WebSocket client and its license (~60 KB combined).
export const RELEASE_ASSET_BUDGET_BYTES = 5_200_000;

export function buildProfile(name = "standard", root = process.cwd()) {
  if (!["standard", "community"].includes(name)) throw new Error(`Unknown build profile: ${name}`);
  return {
    name,
    outputDir: name === "community" ? path.join(root, "dist", "community") : root,
    plugins: [],
  };
}
