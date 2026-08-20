import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const required = [
  "index.html",
  "styles.css",
  "app.js",
  "assets/fonts/InterVariable.woff2",
  "assets/fonts/OFL.txt",
  "assets/stops/mobile/stop-01-form-in-grain.png",
  "assets/stops/mobile/stop-02-air-in-the-body.png",
  "assets/stops/mobile/stop-03-touch-the-signal.png",
  "assets/stops/mobile/stop-04-let-it-resonate.png"
];

const runtimeAssets = required.filter((path) => path.endsWith(".png") && !path.includes("stop-04"))
  .concat("assets/fonts/InterVariable.woff2");
const problems = [];
const dimensions = {};

for (const path of required) {
  try {
    const file = await readFile(join(root, path));
    if (!file.length) problems.push(`${path}: empty file`);
    if (path.endsWith(".png")) {
      const signature = file.subarray(0, 8).toString("hex");
      if (signature !== "89504e470d0a1a0a") problems.push(`${path}: invalid PNG signature`);
      const width = file.readUInt32BE(16);
      const height = file.readUInt32BE(20);
      dimensions[path] = `${width}x${height}`;
      if (width / height < 0.55 || width / height > 0.57) problems.push(`${path}: expected 9:16 portrait asset`);
    }
  } catch (error) {
    problems.push(`${path}: ${error.code || error.message}`);
  }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", "incoming", "evidence", "tools"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const files = await walk(root);
const forbidden = files.filter((path) => [".mp4", ".mov", ".avif", ".webm"].includes(extname(path).toLowerCase()));
if (forbidden.length) problems.push(`raw/runtime video found in public tree: ${forbidden.map((path) => relative(root, path)).join(", ")}`);

let runtimeBytes = 0;
for (const path of runtimeAssets) runtimeBytes += (await stat(join(root, path))).size;

const report = {
  passed: problems.length === 0,
  checkedFiles: required.length,
  portraitDimensions: dimensions,
  runtimePayloadBytes: runtimeBytes,
  runtimePayloadMiB: Number((runtimeBytes / 1024 / 1024).toFixed(2)),
  forbiddenMediaFiles: forbidden.length,
  problems
};

console.log(JSON.stringify(report, null, 2));
if (problems.length) process.exitCode = 1;
