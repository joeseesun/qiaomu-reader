import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProfile } from "./build-profile.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const profileArg = args.find((arg) => arg.startsWith("--profile="));
const profile = buildProfile(profileArg?.slice("--profile=".length) || "standard", root);
const installArg = args.find((arg) => !arg.startsWith("--"));
const installDir = installArg ? path.resolve(installArg) : "";
const releaseFiles = ["main.js", "manifest.json", "styles.css"];
const bundledFonts = [{
  file: "fonts/QiaomuReadingFangsong.woff2",
  family: "QBR Zhuque Fangsong",
}];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

const pkg = readJson(path.join(root, "package.json"));
const manifest = readJson(path.join(profile.outputDir, "manifest.json"));
const versions = readJson(path.join(root, "versions.json"));

requireCheck(manifest.id === "qiaomu-reader", `unexpected plugin id: ${manifest.id}`);
requireCheck(pkg.version === manifest.version, "package.json and manifest.json versions differ");
requireCheck(versions[manifest.version] === manifest.minAppVersion, "versions.json is missing the current release");

const assets = Object.fromEntries(releaseFiles.map((name) => {
  const file = path.join(profile.outputDir, name);
  requireCheck(fs.existsSync(file), `missing release asset: ${name}`);
  requireCheck(fs.statSync(file).size <= 5_300_000, `release asset exceeds 5.3 MB: ${name}`);
  requireCheck(fs.statSync(file).size > 0, `empty release asset: ${name}`);
  return [name, { bytes: fs.statSync(file).size, sha256: sha256(file) }];
}));

const mainSource = fs.readFileSync(path.join(profile.outputDir, "main.js"), "utf8");
requireCheck(mainSource.includes(`Build channel: ${profile.name}`), "bundle channel does not match verification profile");
if (profile.name === "community") {
  const info = readJson(path.join(profile.outputDir, "build-info.json"));
  requireCheck(info.profile === "community", "community build metadata missing");
  requireCheck(info.inputs.includes("src/ai-acp-manual.js"), "manual ACP module is missing");
  requireCheck(!info.inputs.includes("src/ai-acp-installer.js"), "community bundle includes the dependency installer");
  requireCheck(!mainSource.includes("ACP installed but its executable was not found"), "installer execution code leaked into the community bundle");
}
const cssSource = fs.readFileSync(path.join(profile.outputDir, "styles.css"), "utf8");
requireCheck(!/!\s*important\b/i.test(cssSource), "styles.css contains priority overrides; use the scoped component cascade");
requireCheck(!/:has\s*\(/i.test(cssSource), "styles.css contains relational selectors; use an explicit scoped state class");
const fontPayloads = bundledFonts.map(({ file, family }) => {
  const font = path.join(root, file);
  requireCheck(fs.existsSync(font), `missing bundled font source: ${file}`);
  const bytes = fs.readFileSync(font);
  requireCheck(bytes.subarray(0, 4).toString() === "wOF2", `invalid WOFF2 source: ${file}`);
  requireCheck(cssSource.includes(family), `styles.css is missing bundled font family: ${family}`);
  requireCheck(cssSource.includes(bytes.toString("base64")), `styles.css font payload differs: ${file}`);
  return { file, bytes: bytes.length, sha256: sha256(font) };
});
requireCheck(!mainSource.includes("ACP installed but its executable was not found"), "release bundle includes an ACP dependency installer");
requireCheck(mainSource.includes(fs.readFileSync(path.join(root, "licenses/elton-reader-MIT.txt"), "utf8")), "main.js is missing the inherited MIT license");
requireCheck(mainSource.includes("SIL OPEN FONT LICENSE Version 1.1"), "main.js is missing the bundled font license");

if (installDir) {
  const installedManifest = readJson(path.join(installDir, "manifest.json"));
  requireCheck(installedManifest.id === manifest.id, "installed plugin id differs from the build");
  requireCheck(installedManifest.version === manifest.version, "installed plugin version differs from the build");
  for (const name of releaseFiles) {
    const installed = path.join(installDir, name);
    requireCheck(fs.existsSync(installed), `installed asset missing: ${name}`);
    requireCheck(sha256(installed) === assets[name].sha256, `installed asset hash differs: ${name}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  profile: profile.name,
  id: manifest.id,
  version: manifest.version,
  minAppVersion: manifest.minAppVersion,
  installVerified: Boolean(installDir),
  assets,
  fontPayloads,
}, null, 2));
