import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsFiles = [
  "src/main.js",
  "src/notebook.js",
  "src/storage.js",
  "src/python-worker.js",
  "public/sw.js",
  "vite.config.js",
  "scripts/lint.mjs",
  "scripts/mobile-regression.mjs",
  "scripts/notebook-regression.mjs",
  "scripts/test-runtime.mjs",
  "scripts/ui-regression.mjs",
];
const textFiles = [
  ...jsFiles,
  "src/python-runtime.py",
  "src/styles.css",
  "index.html",
  "mobile-static-check.html",
  "README.md",
  "tests/test_python_runtime.py",
  "tests/MOBILE_CHECKLIST.md",
];

let failed = false;

for (const file of jsFiles) {
  const fullPath = join(root, file);
  const result = spawnSync(process.execPath, ["--check", fullPath], { encoding: "utf8" });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(result.stderr || result.stdout);
  }
}

for (const file of textFiles) {
  const fullPath = join(root, file);
  const lines = readFileSync(fullPath, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (/\s+$/.test(line)) {
      failed = true;
      console.error(`${relative(root, fullPath)}:${index + 1}: espacio en blanco al final de línea`);
    }
  });
}

for (const file of ["package.json", "public/manifest.webmanifest"]) {
  try {
    JSON.parse(readFileSync(join(root, file), "utf8"));
  } catch (error) {
    failed = true;
    console.error(`${file}: JSON inválido: ${error.message}`);
  }
}

if (failed) process.exit(1);
console.log("Lint básico: OK");
