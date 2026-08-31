import { spawnSync } from "node:child_process";

const testArgs = ["-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"];
const candidates = process.platform === "win32"
  ? [
      { command: "py", prefix: ["-3"] },
      { command: "python", prefix: [] },
      { command: "python3", prefix: [] },
    ]
  : [
      { command: "python3", prefix: [] },
      { command: "python", prefix: [] },
      { command: "py", prefix: ["-3"] },
    ];

for (const candidate of candidates) {
  const probe = spawnSync(candidate.command, [...candidate.prefix, "--version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (probe.error || probe.status !== 0) continue;

  console.log(`Tests de runtime con ${candidate.command} ${candidate.prefix.join(" ")}`.trim());
  const result = spawnSync(candidate.command, [...candidate.prefix, ...testArgs], {
    stdio: "inherit",
    windowsHide: true,
  });
  process.exit(result.status ?? 1);
}

console.error([
  "No se encontró una instalación local de CPython para ejecutar los tests del runtime.",
  "Se probaron py -3, python y python3.",
  "Esto no impide ejecutar PyLab Studio: la aplicación usa Pyodide en el navegador.",
].join("\n"));
process.exit(1);
