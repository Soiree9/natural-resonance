import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const required = [
  "index.html",
  "styles.css",
  "app.js",
  "MOTION-CONTRACT.md",
  "assets/fonts/InterVariable.woff2",
  "assets/fonts/OFL.txt",
  "assets/product/cv60s-thinline/front-full-hd.png",
  "assets/product/cv60s-thinline/body-angle-hd.png",
  "assets/product/cv60s-thinline/body-detail-hd.png",
  "assets/product/cv60s-thinline/headstock-front-hd.png",
  "assets/ui/fender-351-white-pearl.png",
  "assets/product/cv60s-thinline/SOURCE.md"
];

const minimumDimensions = {
  "assets/product/cv60s-thinline/front-full-hd.png": [3000, 989],
  "assets/product/cv60s-thinline/body-angle-hd.png": [4000, 2300],
  "assets/product/cv60s-thinline/body-detail-hd.png": [2200, 2300],
  "assets/product/cv60s-thinline/headstock-front-hd.png": [2200, 1200],
  "assets/ui/fender-351-white-pearl.png": [300, 360]
};

const runtimeAssets = required.filter((path) => [".avif", ".png"].includes(extname(path)))
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
      const minimum = minimumDimensions[path];
      if (minimum && (width < minimum[0] || height < minimum[1])) {
        problems.push(`${path}: ${width}x${height} is below ${minimum[0]}x${minimum[1]}`);
      }
    }
    if (path.endsWith(".avif")) {
      const brand = file.subarray(4, 12).toString("ascii");
      if (!brand.startsWith("ftypavi")) problems.push(`${path}: invalid AVIF signature`);
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
const forbidden = files.filter((path) => [".mp4", ".mov", ".webm"].includes(extname(path).toLowerCase()));
if (forbidden.length) problems.push(`runtime video found in public tree: ${forbidden.map((path) => relative(root, path)).join(", ")}`);

let runtimeBytes = 0;
for (const path of runtimeAssets) runtimeBytes += (await stat(join(root, path))).size;

const report = {
  passed: problems.length === 0,
  checkedFiles: required.length,
  imageDimensions: dimensions,
  runtimePayloadBytes: runtimeBytes,
  runtimePayloadMiB: Number((runtimeBytes / 1024 / 1024).toFixed(2)),
  forbiddenMediaFiles: forbidden.length,
  problems
};

console.log(JSON.stringify(report, null, 2));
if (problems.length) process.exitCode = 1;
