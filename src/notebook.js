const DEFAULT_NOTEBOOK_METADATA = {
  kernelspec: {
    display_name: "Python 3 (Pyodide)",
    language: "python",
    name: "python3",
  },
  language_info: {
    name: "python",
  },
};

function sourceToText(source) {
  if (Array.isArray(source)) return source.join("");
  return String(source ?? "");
}

function textToSourceLines(text) {
  const value = String(text ?? "");
  if (!value) return [];
  const matches = value.match(/.*(?:\n|$)/g) ?? [];
  return matches.filter(Boolean);
}

function outputDataToText(data) {
  if (!data || typeof data !== "object") return "";
  const plain = data["text/plain"];
  if (Array.isArray(plain)) return plain.join("");
  if (plain != null) return String(plain);
  return "";
}

export function notebookOutputsToText(outputs = []) {
  const parts = [];
  for (const output of outputs) {
    if (!output || typeof output !== "object") continue;
    if (output.output_type === "stream") {
      parts.push(sourceToText(output.text));
    } else if (output.output_type === "error") {
      const traceback = Array.isArray(output.traceback) ? output.traceback.join("\n") : "";
      parts.push(traceback || `${output.ename ?? "Error"}: ${output.evalue ?? ""}`.trim());
    } else if (output.output_type === "execute_result" || output.output_type === "display_data") {
      parts.push(outputDataToText(output.data));
    }
  }
  return parts.filter(Boolean).join(parts.length > 1 ? "\n" : "");
}

export function parseNotebook(text, createId = () => crypto.randomUUID()) {
  const raw = JSON.parse(text);
  if (!raw || !Array.isArray(raw.cells)) {
    throw new Error("El archivo no contiene un Notebook Jupyter válido.");
  }

  const cells = raw.cells.map((cell) => {
    const type = cell?.cell_type === "code" ? "code" : cell?.cell_type === "raw" ? "raw" : "markdown";
    const outputs = type === "code" && Array.isArray(cell.outputs) ? structuredClone(cell.outputs) : [];
    const internalId = createId();
    return {
      id: internalId,
      notebookId: typeof cell?.id === "string" && cell.id ? cell.id : internalId,
      type,
      source: sourceToText(cell?.source),
      metadata: cell?.metadata && typeof cell.metadata === "object" ? structuredClone(cell.metadata) : {},
      attachments: cell?.attachments && typeof cell.attachments === "object" ? structuredClone(cell.attachments) : null,
      executionCount: Number.isInteger(cell?.execution_count) ? cell.execution_count : null,
      outputs,
      outputText: notebookOutputsToText(outputs),
    };
  });

  return {
    cells: cells.length ? cells : [{ id: createId(), notebookId: null, type: "code", source: "", metadata: {}, attachments: null, executionCount: null, outputs: [], outputText: "" }],
    metadata: raw.metadata && typeof raw.metadata === "object" ? structuredClone(raw.metadata) : structuredClone(DEFAULT_NOTEBOOK_METADATA),
    nbformat: Number.isInteger(raw.nbformat) ? raw.nbformat : 4,
    nbformatMinor: Number.isInteger(raw.nbformat_minor) ? raw.nbformat_minor : 5,
  };
}

export function createEmptyNotebook(createId = () => crypto.randomUUID()) {
  return {
    cells: [
      {
        id: createId(),
        notebookId: null,
        type: "code",
        source: "",
        metadata: {},
        attachments: null,
        executionCount: null,
        outputs: [],
        outputText: "",
      },
    ],
    metadata: structuredClone(DEFAULT_NOTEBOOK_METADATA),
    nbformat: 4,
    nbformatMinor: 5,
  };
}

export function serializeNotebook(document) {
  const notebook = {
    cells: (document.cells ?? []).map((cell) => {
      const base = {
        cell_type: cell.type === "code" ? "code" : cell.type === "raw" ? "raw" : "markdown",
        id: String(cell.notebookId || cell.id || "cell").slice(0, 64),
        metadata: cell.metadata && typeof cell.metadata === "object" ? structuredClone(cell.metadata) : {},
        source: textToSourceLines(cell.source),
      };
      if (base.cell_type === "markdown" && cell.attachments && typeof cell.attachments === "object") {
        base.attachments = structuredClone(cell.attachments);
      }

      if (base.cell_type === "code") {
        base.execution_count = Number.isInteger(cell.executionCount) ? cell.executionCount : null;
        base.outputs = Array.isArray(cell.outputs) ? structuredClone(cell.outputs) : [];
      }
      return base;
    }),
    metadata: document.notebookMetadata && typeof document.notebookMetadata === "object"
      ? structuredClone(document.notebookMetadata)
      : structuredClone(DEFAULT_NOTEBOOK_METADATA),
    nbformat: Number.isInteger(document.nbformat) ? document.nbformat : 4,
    nbformat_minor: Number.isInteger(document.nbformatMinor) ? Math.max(5, document.nbformatMinor) : 5,
  };

  return `${JSON.stringify(notebook, null, 2)}\n`;
}

export function streamChunksToOutputs(chunks = []) {
  const outputs = [];
  let current = null;
  for (const chunk of chunks) {
    const name = chunk?.name === "stderr" ? "stderr" : "stdout";
    const text = String(chunk?.text ?? "");
    if (!text) continue;
    if (current?.name === name) {
      current.text += text;
    } else {
      current = { output_type: "stream", name, text };
      outputs.push(current);
    }
  }
  return outputs;
}
