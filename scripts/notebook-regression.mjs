import assert from "node:assert/strict";
import { createEmptyNotebook, notebookOutputsToText, parseNotebook, serializeNotebook } from "../src/notebook.js";

let id = 0;
const createId = () => `cell-${++id}`;

const sample = JSON.stringify({
  cells: [
    {
      cell_type: "code",
      execution_count: 4,
      metadata: {},
      outputs: [{ output_type: "stream", name: "stdout", text: ["hola\n"] }],
      source: ["x = 2\n", "x\n"],
    },
    { cell_type: "markdown", metadata: {}, source: ["# Título\n"] },
  ],
  metadata: { language_info: { name: "python" } },
  nbformat: 4,
  nbformat_minor: 5,
});

const parsed = parseNotebook(sample, createId);
assert.equal(parsed.cells.length, 2);
assert.equal(parsed.cells[0].source, "x = 2\nx\n");
assert.equal(parsed.cells[0].executionCount, 4);
assert.equal(parsed.cells[0].outputText, "hola\n");
assert.equal(parsed.cells[1].type, "markdown");
console.log("✓ abre .ipynb y conserva celdas, source y outputs");

const document = {
  cells: parsed.cells,
  notebookMetadata: parsed.metadata,
  nbformat: parsed.nbformat,
  nbformatMinor: parsed.nbformatMinor,
};
const serialized = JSON.parse(serializeNotebook(document));
assert.equal(serialized.nbformat, 4);
assert.equal(serialized.cells[0].cell_type, "code");
assert.deepEqual(serialized.cells[0].source, ["x = 2\n", "x\n"]);
assert.equal(serialized.cells[1].cell_type, "markdown");
console.log("✓ guarda un Notebook Jupyter nbformat 4 válido");

assert.equal(
  notebookOutputsToText([
    { output_type: "execute_result", data: { "text/plain": ["(3, 3)"] } },
  ]),
  "(3, 3)",
);
console.log("✓ recupera resultados text/plain de notebooks existentes");

const empty = createEmptyNotebook(createId);
assert.equal(empty.cells.length, 1);
assert.equal(empty.cells[0].type, "code");
console.log("✓ un Notebook nuevo empieza con una celda de código");

console.log("Regresión Notebook: OK");
