import path from "node:path";

// Both distribution profiles must leave 200 KB below a strict decimal 5 MB.
// This engineering budget applies to every installed asset, not just main.js.
export const RELEASE_ASSET_BUDGET_BYTES = 4_800_000;

export function assertReleaseAssetSize(name, bytes) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > RELEASE_ASSET_BUDGET_BYTES) {
    throw new Error(`${name} must be between 1 and ${RELEASE_ASSET_BUDGET_BYTES} bytes: ${bytes} bytes`);
  }
}

export function buildProfile(name = "standard", root = process.cwd()) {
  if (!["standard", "community"].includes(name)) throw new Error(`Unknown build profile: ${name}`);
  return {
    name,
    outputDir: name === "community" ? path.join(root, "dist", "community") : root,
    plugins: [],
  };
}
