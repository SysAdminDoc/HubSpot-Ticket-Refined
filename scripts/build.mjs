import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const sourcePath = path.join(
  projectRoot,
  "src",
  "HubSpot-Ticket-Refined.user.js",
);
const distDir = path.join(projectRoot, "dist");
const scriptName = "HubSpot-Ticket-Refined.user.js";
const metadataName = "HubSpot-Ticket-Refined.meta.js";
const archiveName = `HubSpot-Ticket-Refined-v${packageJson.version}.zip`;

const source = (await readFile(sourcePath, "utf8")).replaceAll("\r\n", "\n");
const metadataMatch = source.match(
  /^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/m,
);
if (!metadataMatch) {
  throw new Error("Userscript metadata block is missing");
}

const metadataVersion = metadataMatch[0].match(
  /^\/\/ @version\s+([^\s]+)$/m,
)?.[1];
const runtimeVersion = source.match(/const VERSION = "([^"]+)";/)?.[1];
if (
  metadataVersion !== packageJson.version ||
  runtimeVersion !== packageJson.version
) {
  throw new Error(
    `Version mismatch: package=${packageJson.version}, metadata=${metadataVersion}, runtime=${runtimeVersion}`,
  );
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await writeFile(path.join(distDir, scriptName), source, "utf8");
await writeFile(
  path.join(distDir, metadataName),
  `${metadataMatch[0]}\n`,
  "utf8",
);

const tar = spawnSync(
  "C:\\Windows\\System32\\tar.exe",
  ["-a", "-c", "-f", archiveName, scriptName, metadataName],
  {
    cwd: distDir,
    encoding: "utf8",
    windowsHide: true,
  },
);
if (tar.status !== 0) {
  throw new Error(`Could not build ZIP: ${tar.stderr || tar.stdout}`);
}

const artifactNames = [scriptName, metadataName, archiveName];
const checksums = [];
for (const name of artifactNames) {
  const bytes = await readFile(path.join(distDir, name));
  checksums.push(`${createHash("sha256").update(bytes).digest("hex")}  ${name}`);
}
await writeFile(
  path.join(distDir, "SHA256SUMS"),
  `${checksums.join("\n")}\n`,
  "utf8",
);

console.log(`Built HubSpot Ticket Refined ${packageJson.version}`);
for (const name of [...artifactNames, "SHA256SUMS"]) {
  console.log(path.join("dist", name));
}
