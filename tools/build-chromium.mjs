import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "extension");
const outputRoot = path.join(projectRoot, "dist", "chromium");

const runtimeFiles = [
  "content_scripts/impulse.wav",
  "content_scripts/inject.js",
  "icons/icon-48.png",
  "icons/icon-64.png",
  "icons/icon-128.png",
  "icons/icon-512.png",
  "popup/popup.css",
  "popup/popup.html",
  "popup/popup.js"
];

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

for (const relativePath of runtimeFiles) {
  const destination = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(sourceRoot, relativePath), destination);
}

const manifest = JSON.parse(await readFile(path.join(sourceRoot, "manifest.json"), "utf8"));
delete manifest.browser_specific_settings;

await writeFile(
  path.join(outputRoot, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

console.log(`Chromium extension staged at ${outputRoot}`);
