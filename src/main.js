import "./styles.css";

import { basicSetup, EditorView } from "codemirror";
import { EditorState } from "@codemirror/state";
import { indentMore, indentWithTab, toggleLineComment } from "@codemirror/commands";
import { python, pythonLanguage } from "@codemirror/lang-python";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { loadWorkspace, saveWorkspace } from "./storage.js";
import { LANGUAGE_OPTIONS, languageOption, normalizeLanguage, translate } from "./i18n.js";
import PYTHON_RUNTIME from "./python-runtime.py?raw";
import {
  createEmptyNotebook,
  notebookOutputsToText,
  parseNotebook,
  serializeNotebook,
  streamChunksToOutputs,
} from "./notebook.js";

const DEFAULT_LANGUAGE = "en";

function t(key, variables = {}) {
  return translate(workspace?.preferences?.language ?? DEFAULT_LANGUAGE, key, variables);
}

function defaultCode() {
  return `# PyLab Studio\n# ${t("default.comment")}\n\nprint(${JSON.stringify(t("default.greeting"))})\n`;
}
const MAX_TERMINAL_CHARS = 120_000;
const DEFAULT_THEME = "pylab-dark";
const PROJECT_MAX_ENTRIES = 2000;
const PROJECT_OPENABLE_EXTENSIONS = new Set([".py", ".pyi", ".ipynb", ".txt"]);

const THEMES = [
  { id: "pylab-dark", name: "PyLab Dark", descriptionKey: "theme.pylab-dark", themeColor: "#1f1f1f", swatches: ["#1e1e1e", "#c586c0", "#9cdcfe", "#ce9178"] },
  { id: "midnight-blue", name: "Midnight Blue", descriptionKey: "theme.midnight-blue", themeColor: "#111827", swatches: ["#0d1424", "#38bdf8", "#c084fc", "#86efac"] },
  { id: "neon-night", name: "Neon Night", descriptionKey: "theme.neon-night", themeColor: "#101827", swatches: ["#0b1222", "#50d5ff", "#ff5cc8", "#a8e063"] },
  { id: "minimal-black", name: "Minimal Black", descriptionKey: "theme.minimal-black", themeColor: "#0a0a0a", swatches: ["#090909", "#c586c0", "#9cdcfe", "#ce9178"] },
  { id: "deep-ocean", name: "Deep Ocean", descriptionKey: "theme.deep-ocean", themeColor: "#071a2b", swatches: ["#071724", "#00b4d8", "#90e0ef", "#ffd166"] },
  { id: "forest", name: "Forest", descriptionKey: "theme.forest", themeColor: "#102019", swatches: ["#0d1915", "#57cc99", "#c77dff", "#f4d35e"] },
  { id: "paper-light", name: "Paper Light", descriptionKey: "theme.paper-light", themeColor: "#f4f6f8", swatches: ["#ffffff", "#0062a3", "#7c3aed", "#137333"] },
  { id: "sand-light", name: "Sand Light", descriptionKey: "theme.sand-light", themeColor: "#f7f1df", swatches: ["#fffaf0", "#268bd2", "#859900", "#b58900"] },
];

const pythonHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--syntax-keyword)", fontWeight: "600" },
  { tag: [tags.variableName, tags.name, tags.propertyName], color: "var(--syntax-name)" },
  { tag: tags.function(tags.variableName), color: "var(--syntax-function)" },
  { tag: [tags.className, tags.typeName], color: "var(--syntax-type)" },
  { tag: [tags.number, tags.bool, tags.atom, tags.null], color: "var(--syntax-number)" },
  { tag: [tags.string, tags.docString, tags.character], color: "var(--syntax-string)" },
  { tag: [tags.operator, tags.operatorKeyword], color: "var(--syntax-operator)" },
  { tag: [tags.punctuation, tags.bracket], color: "var(--syntax-punctuation)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: [tags.meta, tags.annotation], color: "var(--syntax-meta)" },
  { tag: [tags.regexp, tags.escape, tags.url], color: "var(--syntax-special)" },
  { tag: tags.invalid, color: "var(--syntax-invalid)", textDecoration: "underline wavy" },
]);

const elements = {
  toolbar: document.querySelector(".toolbar"),
  tabs: document.querySelector("#tabs"),
  editor: document.querySelector("#editor"),
  run: document.querySelector("#run-btn"),
  stop: document.querySelector("#stop-btn"),
  create: document.querySelector("#new-btn"),
  save: document.querySelector("#save-btn"),
  comment: document.querySelector("#comment-btn"),
  filesMenuButton: document.querySelector("#files-menu-btn"),
  filesMenu: document.querySelector("#files-menu"),
  filesNewNotebook: document.querySelector("#files-new-notebook"),
  filesOpen: document.querySelector("#files-open"),
  filesOpenProject: document.querySelector("#files-open-project"),
  filesExploreProject: document.querySelector("#files-explore-project"),
  filesSaveAs: document.querySelector("#files-save-as"),
  resetSession: document.querySelector("#reset-session-btn"),
  tabIndent: document.querySelector("#tab-indent-btn"),
  theme: document.querySelector("#theme-btn"),
  themeDialog: document.querySelector("#theme-dialog"),
  themeGrid: document.querySelector("#theme-grid"),
  themeClose: document.querySelector("#theme-close"),
  language: document.querySelector("#language-btn"),
  languageDialog: document.querySelector("#language-dialog"),
  languageOptions: document.querySelector("#language-options"),
  languageClose: document.querySelector("#language-close"),
  themeColor: document.querySelector('meta[name="theme-color"]'),
  editorFontDown: document.querySelector("#editor-font-down"),
  editorFontUp: document.querySelector("#editor-font-up"),
  terminalFontDown: document.querySelector("#terminal-font-down"),
  terminalFontUp: document.querySelector("#terminal-font-up"),
  copyTerminal: document.querySelector("#copy-terminal"),
  clearTerminal: document.querySelector("#clear-terminal"),
  toggleTerminal: document.querySelector("#toggle-terminal"),
  terminalPanel: document.querySelector("#terminal-panel"),
  workspace: document.querySelector(".workspace"),
  workspaceResizer: document.querySelector("#workspace-resizer"),
  notebook: document.querySelector("#notebook"),
  notebookCells: document.querySelector("#notebook-cells"),
  notebookAddCell: document.querySelector("#notebook-add-cell"),
  terminalOutput: document.querySelector("#terminal-output"),
  terminalInputForm: document.querySelector("#terminal-input-form"),
  terminalInput: document.querySelector("#terminal-input"),
  terminalInputSubmit: document.querySelector("#terminal-input-submit"),
  terminalState: document.querySelector("#terminal-state"),
  engineStatus: document.querySelector("#engine-status"),
  engineStatusText: document.querySelector("#engine-status .status-text"),
  fileInput: document.querySelector("#file-input"),
  directoryInput: document.querySelector("#directory-input"),
  projectDialog: document.querySelector("#project-dialog"),
  projectDialogTitle: document.querySelector("#project-dialog-title"),
  projectDialogSubtitle: document.querySelector("#project-dialog-subtitle"),
  projectTree: document.querySelector("#project-tree"),
  projectEmpty: document.querySelector("#project-empty"),
  projectClose: document.querySelector("#project-close"),
  closeDocumentDialog: document.querySelector("#close-document-dialog"),
  closeDocumentName: document.querySelector("#close-document-name"),
  closeDocumentCancel: document.querySelector("#close-document-cancel"),
  closeDocumentConfirm: document.querySelector("#close-document-confirm"),
};

const workspace = {
  documents: [],
  activeId: null,
  preferences: {
    editorFontSize: 16,
    terminalFontSize: 14,
    terminalCollapsed: false,
    terminalHeightRatio: null,
    theme: DEFAULT_THEME,
    language: DEFAULT_LANGUAGE,
    languageExplicit: false,
  },
};

const editorStates = new Map();
const notebookEditorStates = new Map();
const notebookViews = new Map();
const runtimeSymbols = new Map();
let editorView;
let mountedDocumentId = null;
let mountedDocumentKind = null;
let activeNotebookCellId = null;
let activeNotebookEditorView = null;
let pythonWorker;
let workerReady = false;
let workerReadyPromise = Promise.resolve(false);
let resolveWorkerReady = null;
let running = false;
let currentRunId = null;
let currentSessionId = null;
let currentRunTarget = null;
let currentInputRequestId = null;
let currentInputPrompt = "";
let saveTimer = null;
let projectState = null;
const collapsedProjectDirectories = new Set();

function createId() {
  return crypto.randomUUID?.() ?? `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDocument(name, content = "", fileHandle = null, projectInfo = null) {
  return {
    id: createId(),
    kind: "python",
    name,
    content,
    fileHandle,
    projectId: projectInfo?.projectId ?? null,
    projectPath: projectInfo?.projectPath ?? null,
    dirty: false,
    updatedAt: Date.now(),
  };
}

function createNotebookDocument(name, notebook = createEmptyNotebook(createId), fileHandle = null, projectInfo = null) {
  return {
    id: createId(),
    kind: "notebook",
    name,
    content: "",
    cells: notebook.cells,
    notebookMetadata: notebook.metadata,
    nbformat: notebook.nbformat,
    nbformatMinor: notebook.nbformatMinor,
    executionCounter: Math.max(0, ...notebook.cells.map((cell) => cell.executionCount ?? 0)),
    fileHandle,
    projectId: projectInfo?.projectId ?? null,
    projectPath: projectInfo?.projectPath ?? null,
    dirty: false,
    updatedAt: Date.now(),
  };
}

function activeDocument() {
  return workspace.documents.find((document) => document.id === workspace.activeId) ?? null;
}

function uniqueUntitledName(extension = ".py") {
  let index = 1;
  const names = new Set(workspace.documents.map((document) => document.name));
  const base = t("file.untitled");
  while (names.has(`${base}-${index}${extension}`)) index += 1;
  return `${base}-${index}${extension}`;
}

function serializableWorkspace() {
  return {
    documents: workspace.documents.map((document) => ({ ...document })),
    activeId: workspace.activeId,
    preferences: { ...workspace.preferences },
  };
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveWorkspace(serializableWorkspace()), 350);
}

function setEngineStatus(state, text) {
  elements.engineStatus.classList.remove("loading", "ready", "error");
  if (state) elements.engineStatus.classList.add(state);
  elements.engineStatusText.textContent = text;
}

function setRunning(nextRunning, statusText = null) {
  running = nextRunning;
  elements.run.hidden = nextRunning;
  elements.stop.hidden = !nextRunning;
  if (!currentInputRequestId) {
    elements.terminalState.textContent = statusText ?? (nextRunning ? t("terminal.running") : t("terminal.ready"));
  }
}

function markDocumentSaved(document) {
  if (!document) return;
  document.dirty = false;
  document.updatedAt = Date.now();
  renderTabs();
  scheduleSave();
}

function appendTerminal(text) {
  if (!text) return;
  elements.terminalOutput.textContent += text;
  if (elements.terminalOutput.textContent.length > MAX_TERMINAL_CHARS) {
    elements.terminalOutput.textContent =
      t("output.truncated") +
      elements.terminalOutput.textContent.slice(-MAX_TERMINAL_CHARS);
  }
  elements.terminalOutput.scrollTop = elements.terminalOutput.scrollHeight;
}

function notebookRunCell() {
  if (currentRunTarget?.kind !== "notebook") return null;
  const document = workspace.documents.find((item) => item.id === currentRunTarget.documentId);
  const cell = document?.cells?.find((item) => item.id === currentRunTarget.cellId);
  return document && cell ? { document, cell } : null;
}

function appendRunOutput(name, text) {
  if (!text) return;
  const target = notebookRunCell();
  if (!target) {
    appendTerminal(text);
    return;
  }

  currentRunTarget.chunks.push({ name, text });
  target.cell.outputText = currentRunTarget.chunks.map((chunk) => chunk.text).join("");
  if (target.cell.outputText.length > MAX_TERMINAL_CHARS) {
    target.cell.outputText =
      t("output.truncated") +
      target.cell.outputText.slice(-MAX_TERMINAL_CHARS);
    currentRunTarget.chunks = [{ name: "stdout", text: target.cell.outputText }];
  }
  target.cell.outputs = streamChunksToOutputs(currentRunTarget.chunks);
  refreshNotebookCellOutput(target.document, target.cell);
  scheduleSave();
}

async function copyTerminal() {
  const text = elements.terminalOutput.textContent;
  if (!text) {
    elements.terminalState.textContent = t("terminal.empty");
    window.setTimeout(() => {
      if (!running && !currentInputRequestId) elements.terminalState.textContent = t("terminal.ready");
    }, 1200);
    return;
  }

  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = window.document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      window.document.body.append(textarea);
      textarea.select();
      const copied = window.document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error(t("clipboard.rejected"));
    }
    elements.terminalState.textContent = t("terminal.copied");
  } catch (error) {
    elements.terminalState.textContent = t("terminal.copyFailed");
    appendTerminal(`[Terminal] ${error.message}\n`);
  }

  window.setTimeout(() => {
    if (!running && !currentInputRequestId) elements.terminalState.textContent = t("terminal.ready");
  }, 1400);
}

function clearTerminal() {
  elements.terminalOutput.textContent = "";
  if (currentInputRequestId && currentInputPrompt) {
    appendTerminal(currentInputPrompt);
  }
}

function resetTerminalInput() {
  currentInputRequestId = null;
  currentInputPrompt = "";
  elements.terminalInputForm.hidden = true;
  elements.terminalInputForm.classList.remove("processing");
  elements.terminalInput.disabled = false;
  elements.terminalInputSubmit.disabled = false;
  elements.terminalInput.value = "";
  elements.terminalInput.placeholder = t("terminal.inputPlaceholder");
}

function requestTerminalInput(message) {
  if (message.runId !== currentRunId || !running) return;

  if (workspace.preferences.terminalCollapsed) {
    workspace.preferences.terminalCollapsed = false;
    applyPreferences();
    scheduleSave();
  }

  currentInputRequestId = message.requestId;
  currentInputPrompt = message.prompt ?? "";
  if (currentInputPrompt) appendRunOutput("stdout", currentInputPrompt);

  elements.terminalInputForm.hidden = false;
  elements.terminalInputForm.classList.remove("processing");
  elements.terminalInput.disabled = false;
  elements.terminalInputSubmit.disabled = false;
  elements.terminalInput.value = "";
  elements.terminalInput.placeholder = t("terminal.inputPlaceholder");
  elements.terminalState.textContent = t("terminal.waitingInput");

  requestAnimationFrame(() => {
    elements.terminalInput.focus({ preventScroll: true });
    elements.terminalInputForm.scrollIntoView({ block: "nearest" });
  });
}

function submitTerminalInput(event) {
  event.preventDefault();
  if (!currentInputRequestId || !pythonWorker || !running) return;

  const requestId = currentInputRequestId;
  const value = elements.terminalInput.value;
  appendRunOutput("stdout", `${value}\n`);

  currentInputRequestId = null;
  currentInputPrompt = "";
  elements.terminalInput.value = "";
  elements.terminalInput.disabled = true;
  elements.terminalInputSubmit.disabled = true;
  elements.terminalInput.placeholder = t("terminal.processing");
  elements.terminalInputForm.classList.add("processing");
  elements.terminalState.textContent = t("terminal.running");

  pythonWorker.postMessage({
    type: "input-response",
    runId: currentRunId,
    requestId,
    value,
  });
}

function runtimeCompletionSource(context) {
  const token = context.matchBefore(/[A-Za-z_]\w*/);
  if (!token || (!context.explicit && token.from === token.to)) return null;

  const activeSymbols = runtimeSymbols.get(workspace.activeId) ?? [];
  if (activeSymbols.length === 0) return null;

  return {
    from: token.from,
    options: activeSymbols.map((label) => ({
      label,
      type: "variable",
      detail: t("completion.session"),
      boost: 95,
    })),
    validFor: /^[A-Za-z_]\w*$/,
  };
}

function editorExtensions() {
  return [
    basicSetup,
    syntaxHighlighting(pythonHighlightStyle),
    indentUnit.of("    "),
    EditorState.tabSize.of(4),
    python(),
    pythonLanguage.data.of({ autocomplete: runtimeCompletionSource }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      autocapitalize: "off",
      autocomplete: "off",
      autocorrect: "off",
      spellcheck: "false",
    }),
    keymap.of([indentWithTab]),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const document = activeDocument();
      if (!document) return;
      document.content = update.state.doc.toString();
      document.updatedAt = Date.now();
      const becameDirty = !document.dirty;
      document.dirty = true;
      editorStates.set(document.id, update.state);
      if (becameDirty) renderTabs();
      scheduleSave();
    }),
  ];
}

function makeEditorState(document) {
  return EditorState.create({
    doc: document.content,
    extensions: editorExtensions(),
  });
}

function notebookCellKey(documentId, cellId) {
  return `${documentId}:${cellId}`;
}

function notebookEditorExtensions(document, cell) {
  const extensions = [
    basicSetup,
    syntaxHighlighting(pythonHighlightStyle),
    indentUnit.of("    "),
    EditorState.tabSize.of(4),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      autocapitalize: "off",
      autocomplete: "off",
      autocorrect: "off",
      spellcheck: "false",
    }),
    keymap.of([indentWithTab]),
    EditorView.updateListener.of((update) => {
      if (update.focusChanged && update.view.hasFocus) {
        activeNotebookCellId = cell.id;
        activeNotebookEditorView = update.view;
      }
      if (!update.docChanged) return;
      cell.source = update.state.doc.toString();
      document.updatedAt = Date.now();
      const becameDirty = !document.dirty;
      document.dirty = true;
      notebookEditorStates.set(notebookCellKey(document.id, cell.id), update.state);
      if (becameDirty) renderTabs();
      scheduleSave();
    }),
  ];

  if (cell.type === "code") {
    extensions.splice(3, 0, python(), pythonLanguage.data.of({ autocomplete: runtimeCompletionSource }));
  }
  return extensions;
}

function destroyNotebookViews() {
  for (const view of notebookViews.values()) view.destroy();
  notebookViews.clear();
  activeNotebookCellId = null;
  activeNotebookEditorView = null;
  elements.notebookCells?.replaceChildren();
}

function notebookCellOutputElement(cellId) {
  return elements.notebookCells?.querySelector(`[data-cell-id="${CSS.escape(cellId)}"] .notebook-output`) ?? null;
}

function refreshNotebookCellOutput(document, cell) {
  if (workspace.activeId !== document.id) return;
  const output = notebookCellOutputElement(cell.id);
  if (!output) return;
  output.textContent = cell.outputText ?? notebookOutputsToText(cell.outputs);
  output.hidden = !output.textContent;
  const count = elements.notebookCells.querySelector(
    `[data-cell-id="${CSS.escape(cell.id)}"] .notebook-execution-count`,
  );
  if (count) count.textContent = cell.type === "code" ? `[${cell.executionCount ?? " "}]` : "";
}

function setNotebookCellType(document, cell, nextType) {
  if (running && currentSessionId === document.id) {
    appendTerminal(t("notebook.stopBeforeType"));
    renderNotebook(document, cell.id);
    return;
  }
  if (!['code', 'markdown', 'raw'].includes(nextType) || cell.type === nextType) return;
  const key = notebookCellKey(document.id, cell.id);
  const view = notebookViews.get(key);
  if (view) cell.source = view.state.doc.toString();
  cell.type = nextType;
  if (nextType !== "code") {
    cell.executionCount = null;
    cell.outputs = [];
    cell.outputText = "";
  }
  document.dirty = true;
  document.updatedAt = Date.now();
  notebookEditorStates.delete(key);
  renderTabs();
  renderNotebook(document, cell.id);
  scheduleSave();
}

function deleteNotebookCell(document, cellId) {
  if (running && currentSessionId === document.id) {
    appendTerminal(t("notebook.stopBeforeDelete"));
    return;
  }
  if (document.cells.length <= 1) {
    const cell = document.cells[0];
    cell.source = "";
    cell.outputs = [];
    cell.outputText = "";
    cell.executionCount = null;
    notebookEditorStates.delete(notebookCellKey(document.id, cell.id));
  } else {
    const index = document.cells.findIndex((cell) => cell.id === cellId);
    if (index < 0) return;
    notebookEditorStates.delete(notebookCellKey(document.id, cellId));
    document.cells.splice(index, 1);
  }
  document.dirty = true;
  document.updatedAt = Date.now();
  renderTabs();
  renderNotebook(document);
  scheduleSave();
}

function addNotebookCell(document, afterCellId = null) {
  const cell = {
    id: createId(),
    notebookId: null,
    type: "code",
    source: "",
    metadata: {},
    attachments: null,
    executionCount: null,
    outputs: [],
    outputText: "",
  };
  const index = afterCellId ? document.cells.findIndex((item) => item.id === afterCellId) : -1;
  if (index >= 0) document.cells.splice(index + 1, 0, cell);
  else document.cells.push(cell);
  document.dirty = true;
  document.updatedAt = Date.now();
  renderTabs();
  renderNotebook(document, cell.id);
  scheduleSave();
}

function bindNotebookRunButton(button, handler) {
  let pointerStart = null;
  let ignoreNextClick = false;

  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });

  button.addEventListener("pointercancel", () => {
    pointerStart = null;
  });

  button.addEventListener("pointerup", (event) => {
    if (!pointerStart || event.pointerId !== pointerStart.id) return;
    const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    pointerStart = null;
    if (distance > 12) return;
    event.preventDefault();
    ignoreNextClick = true;
    handler();
    window.setTimeout(() => {
      ignoreNextClick = false;
    }, 650);
  });

  button.addEventListener("click", () => {
    if (ignoreNextClick) {
      ignoreNextClick = false;
      return;
    }
    handler();
  });
}

function renderNotebook(document, focusCellId = null) {
  destroyNotebookViews();
  if (!document || document.kind !== "notebook") return;

  for (const cell of document.cells) {
    const shell = window.document.createElement("section");
    shell.className = "notebook-cell";
    shell.dataset.cellId = cell.id;

    const gutter = window.document.createElement("div");
    gutter.className = "notebook-cell-gutter";

    const run = window.document.createElement("button");
    run.type = "button";
    run.className = "notebook-run-cell";
    run.title = cell.type === "code" ? t("notebook.runCell") : t("notebook.codeOnly");
    run.setAttribute("aria-label", t("notebook.runCellAria", { count: cell.executionCount ?? "" }).trim());
    run.disabled = cell.type !== "code";
    run.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>';
    bindNotebookRunButton(run, () => runNotebookCell(document.id, cell.id));

    const executionCount = window.document.createElement("span");
    executionCount.className = "notebook-execution-count";
    executionCount.textContent = cell.type === "code" ? `[${cell.executionCount ?? " "}]` : "";
    gutter.append(run, executionCount);

    const card = window.document.createElement("div");
    card.className = "notebook-cell-card";

    const header = window.document.createElement("div");
    header.className = "notebook-cell-header";

    const type = window.document.createElement("select");
    type.className = "notebook-cell-type";
    type.setAttribute("aria-label", t("notebook.cellType"));
    for (const [value, key] of [["code", "notebook.code"], ["markdown", "notebook.markdown"], ["raw", "notebook.raw"]]) {
      const option = window.document.createElement("option");
      option.value = value;
      option.textContent = t(key);
      option.selected = cell.type === value;
      type.append(option);
    }
    type.addEventListener("change", () => setNotebookCellType(document, cell, type.value));

    const remove = window.document.createElement("button");
    remove.type = "button";
    remove.className = "notebook-delete-cell";
    remove.title = t("notebook.deleteCell");
    remove.setAttribute("aria-label", t("notebook.deleteCell"));
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l-1 14H7zm3-4h6l1 2h4v2H4V5h4z" /></svg>';
    remove.addEventListener("click", () => deleteNotebookCell(document, cell.id));
    header.append(type, remove);

    const host = window.document.createElement("div");
    host.className = "notebook-cell-editor editor-host";
    const key = notebookCellKey(document.id, cell.id);
    const cached = notebookEditorStates.get(key);
    const state = cached ?? EditorState.create({
      doc: cell.source,
      extensions: notebookEditorExtensions(document, cell),
    });
    const view = new EditorView({ state, parent: host });
    notebookViews.set(key, view);
    if (!activeNotebookEditorView) {
      activeNotebookCellId = cell.id;
      activeNotebookEditorView = view;
    }

    const output = window.document.createElement("pre");
    output.className = "notebook-output";
    output.textContent = cell.outputText ?? notebookOutputsToText(cell.outputs);
    output.hidden = !output.textContent;

    card.append(header, host, output);
    shell.append(gutter, card);
    elements.notebookCells.append(shell);
  }

  if (focusCellId) {
    requestAnimationFrame(() => {
      const view = notebookViews.get(notebookCellKey(document.id, focusCellId));
      view?.focus();
      const shell = elements.notebookCells.querySelector(`[data-cell-id="${CSS.escape(focusCellId)}"]`);
      shell?.scrollIntoView({ block: "nearest" });
    });
  }
}

function syncMountedDocumentState() {
  if (!mountedDocumentId) return;
  if (mountedDocumentKind === "python" && editorView) {
    editorStates.set(mountedDocumentId, editorView.state);
    const document = workspace.documents.find((item) => item.id === mountedDocumentId);
    if (document) document.content = editorView.state.doc.toString();
  }
}

function focusMountedDocument() {
  if (mountedDocumentKind === "notebook") activeNotebookEditorView?.focus();
  else editorView?.focus();
}

function mountDocument(document, focusEditor = true) {
  if (!document) return;

  if (mountedDocumentKind === "notebook" && mountedDocumentId !== document.id) {
    destroyNotebookViews();
  }

  if (document.kind === "notebook") {
    elements.editor.hidden = true;
    elements.notebook.hidden = false;
    renderNotebook(document);
  } else {
    elements.notebook.hidden = true;
    elements.editor.hidden = false;
    destroyNotebookViews();

    let state = editorStates.get(document.id);
    if (!state) {
      state = makeEditorState(document);
      editorStates.set(document.id, state);
    }

    if (editorView) editorView.setState(state);
    else editorView = new EditorView({ state, parent: elements.editor });
  }

  mountedDocumentId = document.id;
  mountedDocumentKind = document.kind;
  if (focusEditor) requestAnimationFrame(focusMountedDocument);
}

function activateDocument(documentId, focusEditor = true) {
  const document = workspace.documents.find((item) => item.id === documentId);
  if (!document) return;

  if (workspace.activeId === documentId && mountedDocumentId === documentId) {
    if (focusEditor) focusMountedDocument();
    return;
  }

  syncMountedDocumentState();

  // Actualizamos primero el estado visible de las pestañas. Así una creación o
  // cambio de pestaña nunca queda oculto aunque el montaje del editor tarde o falle.
  workspace.activeId = documentId;
  renderTabs();
  scheduleSave();

  try {
    mountDocument(document, focusEditor);
  } catch (error) {
    console.error("No se pudo montar el documento activo:", error);
    appendTerminal(t("interface.mountFailed", { name: document.name, message: error?.message ?? error }));
  }
}

function commitRename(doc, input) {
  let nextName = input.value.trim();
  if (doc.kind === "notebook" && nextName && !nextName.toLowerCase().endsWith(".ipynb")) {
    nextName += ".ipynb";
  }
  if (nextName && nextName !== doc.name) {
    doc.name = nextName;
    if (doc.fileHandle?.name && doc.fileHandle.name !== nextName) {
      doc.fileHandle = null;
      doc.projectId = null;
      doc.projectPath = null;
    }
    doc.dirty = true;
    doc.updatedAt = Date.now();
  }
  renderTabs();
  scheduleSave();
}

function beginRename(doc, tab) {
  if (tab.querySelector("input")) return;
  const name = tab.querySelector(".tab-name");
  const input = window.document.createElement("input");
  input.className = "tab-rename";
  input.value = doc.name;
  input.setAttribute("aria-label", t("file.nameAria"));
  name.replaceWith(input);
  input.focus();
  if (doc.kind === "notebook" && input.value.toLowerCase().endsWith(".ipynb")) {
    input.setSelectionRange(0, input.value.length - ".ipynb".length);
  } else {
    input.select();
  }

  let cancelled = false;
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename(doc, input);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelled = true;
      renderTabs();
    }
  });
  input.addEventListener("blur", () => {
    if (!cancelled) commitRename(doc, input);
  }, { once: true });
}

function confirmCloseDocument(document) {
  const dialog = elements.closeDocumentDialog;
  if (!dialog || typeof dialog.showModal !== "function") {
    return Promise.resolve(window.confirm(
      t("close.fallbackConfirm", { name: document.name }),
    ));
  }

  elements.closeDocumentName.textContent = document.name;
  if (dialog.open) dialog.close("cancel");

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (dialog.open) dialog.close(value ? "close" : "cancel");
      resolve(value);
    };
    const onCancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    const onBackdrop = (event) => {
      if (event.target === dialog) finish(false);
    };
    const cleanup = () => {
      elements.closeDocumentCancel.removeEventListener("click", cancel);
      elements.closeDocumentConfirm.removeEventListener("click", confirm);
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("click", onBackdrop);
      dialog.removeEventListener("close", onNativeClose);
    };
    const cancel = () => finish(false);
    const confirm = () => finish(true);
    const onNativeClose = () => {
      if (!settled) finish(dialog.returnValue === "close");
    };

    elements.closeDocumentCancel.addEventListener("click", cancel);
    elements.closeDocumentConfirm.addEventListener("click", confirm);
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("click", onBackdrop);
    dialog.addEventListener("close", onNativeClose);
    dialog.showModal();
    requestAnimationFrame(() => elements.closeDocumentCancel.focus());
  });
}

async function closeDocument(documentId) {
  const index = workspace.documents.findIndex((document) => document.id === documentId);
  if (index < 0) return;
  const document = workspace.documents[index];

  if (running && currentSessionId === documentId) {
    appendTerminal(t("file.stopBeforeClose", { name: document.name }));
    return;
  }

  if (document.dirty && !(await confirmCloseDocument(document))) return;

  if (mountedDocumentId === documentId) syncMountedDocumentState();
  if (pythonWorker) {
    pythonWorker.postMessage({ type: "dispose-session", sessionId: documentId });
  }

  const wasActive = workspace.activeId === documentId;
  const wasMountedNotebook = mountedDocumentId === documentId && mountedDocumentKind === "notebook";

  workspace.documents.splice(index, 1);
  editorStates.delete(documentId);
  for (const key of [...notebookEditorStates.keys()]) {
    if (key.startsWith(`${documentId}:`)) notebookEditorStates.delete(key);
  }
  runtimeSymbols.delete(documentId);

  if (wasMountedNotebook) destroyNotebookViews();
  if (mountedDocumentId === documentId) {
    mountedDocumentId = null;
    mountedDocumentKind = null;
  }

  if (workspace.documents.length === 0) {
    const replacement = createDocument(uniqueUntitledName(), defaultCode());
    workspace.documents.push(replacement);
  }

  if (wasActive) {
    const next = workspace.documents[Math.min(index, workspace.documents.length - 1)];
    workspace.activeId = null;
    activateDocument(next.id, false);
  } else {
    renderTabs();
    scheduleSave();
  }
}

function renderTabs() {
  elements.tabs.replaceChildren();

  for (const doc of workspace.documents) {
    const tab = window.document.createElement("div");
    tab.className = "file-tab";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(doc.id === workspace.activeId));
    tab.setAttribute("tabindex", doc.id === workspace.activeId ? "0" : "-1");
    tab.setAttribute("aria-label", `${doc.name}${doc.dirty ? t("file.unsavedSuffix") : ""}`);
    tab.title = doc.dirty
      ? t("file.dirtyTitle", { name: doc.name })
      : doc.id === workspace.activeId
        ? t("file.renameHint")
        : t("file.openTab", { name: doc.name });

    const name = window.document.createElement("span");
    name.className = "tab-name";
    name.textContent = doc.name;

    const dirty = window.document.createElement("span");
    dirty.className = "tab-dirty";
    dirty.setAttribute("aria-hidden", "true");
    dirty.textContent = doc.dirty ? "●" : "";

    const close = window.document.createElement("button");
    close.type = "button";
    close.className = "tab-close";
    close.setAttribute("aria-label", t("file.closeAria", { name: doc.name }));
    close.title = t("file.closeTitle");
    close.textContent = "×";

    close.addEventListener("click", (event) => {
      event.stopPropagation();
      void closeDocument(doc.id);
    });

    tab.addEventListener("click", () => {
      if (workspace.activeId === doc.id) {
        beginRename(doc, tab);
      } else {
        activateDocument(doc.id);
      }
    });

    tab.addEventListener("keydown", (event) => {
      const tabs = [...workspace.documents];
      const currentIndex = tabs.findIndex((item) => item.id === doc.id);
      let target = null;
      if (event.key === "ArrowRight") target = tabs[(currentIndex + 1) % tabs.length];
      else if (event.key === "ArrowLeft") target = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
      else if (event.key === "Home") target = tabs[0];
      else if (event.key === "End") target = tabs[tabs.length - 1];
      if (target) {
        event.preventDefault();
        activateDocument(target.id, false);
        requestAnimationFrame(() => {
          elements.tabs.querySelector('[aria-selected="true"]')?.focus();
        });
      }
    });

    tab.append(name, dirty, close);
    elements.tabs.append(tab);
  }

  const activeTab = elements.tabs.querySelector('[aria-selected="true"]');
  activeTab?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
}

function addDocument(document) {
  workspace.documents.push(document);
  // La pestaña se materializa antes de montar CodeMirror/Notebook para que la UI
  // responda de inmediato incluso si el documento anterior es grande.
  renderTabs();
  activateDocument(document.id);
}

function newDocument() {
  addDocument(createDocument(uniqueUntitledName(".py"), ""));
}

function newNotebook() {
  const document = createNotebookDocument(uniqueUntitledName(".ipynb"));
  addDocument(document);
  requestAnimationFrame(() => {
    const tab = elements.tabs.querySelector('[aria-selected="true"]');
    if (tab && workspace.activeId === document.id) beginRename(document, tab);
  });
}

function isNotebookFilename(name = "") {
  return name.toLowerCase().endsWith(".ipynb");
}

async function documentFromFile(file, fileHandle = null, projectInfo = null) {
  const text = await file.text();
  if (!isNotebookFilename(file.name)) return createDocument(file.name, text, fileHandle, projectInfo);

  try {
    const notebook = parseNotebook(text, createId);
    return createNotebookDocument(file.name, notebook, fileHandle, projectInfo);
  } catch (error) {
    throw new Error(t("file.openFailed", { name: file.name, message: error.message }));
  }
}

async function openWithFileSystemAccess() {
  if (!("showOpenFilePicker" in window)) return false;

  try {
    const [fileHandle] = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: t("file.allDescription"),
          accept: {
            "text/x-python": [".py"],
            "text/plain": [".txt"],
            "application/x-ipynb+json": [".ipynb"],
          },
        },
      ],
    });
    const file = await fileHandle.getFile();
    addDocument(await documentFromFile(file, fileHandle));
    return true;
  } catch (error) {
    if (error?.name !== "AbortError") appendTerminal(t("file.genericError", { message: error.message }));
    return true;
  }
}

async function openFile() {
  const handled = await openWithFileSystemAccess();
  if (!handled) elements.fileInput.click();
}

function projectFileExtension(name = "") {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

function isProjectFileOpenable(entry) {
  return entry?.kind === "file" && PROJECT_OPENABLE_EXTENSIONS.has(projectFileExtension(entry.name));
}

async function collectDirectoryHandleEntries(directoryHandle, prefix = "", entries = []) {
  for await (const [name, handle] of directoryHandle.entries()) {
    if (entries.length >= PROJECT_MAX_ENTRIES) break;
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      entries.push({ kind: "directory", name, path, directoryHandle: handle });
      await collectDirectoryHandleEntries(handle, path, entries);
    } else {
      entries.push({ kind: "file", name, path, fileHandle: handle, file: null });
    }
  }
  return entries;
}

function entriesFromDirectoryFiles(files) {
  const directories = new Map();
  const entries = [];
  let rootName = t("project.defaultName");

  for (const file of files) {
    const relative = file.webkitRelativePath || file.name;
    const parts = relative.split("/").filter(Boolean);
    if (parts.length > 1) rootName = parts[0] || rootName;
    const localParts = parts.length > 1 ? parts.slice(1) : parts;
    for (let index = 1; index < localParts.length; index += 1) {
      const path = localParts.slice(0, index).join("/");
      if (!directories.has(path)) {
        directories.set(path, {
          kind: "directory",
          name: localParts[index - 1],
          path,
          directoryHandle: null,
        });
      }
    }
    const path = localParts.join("/") || file.name;
    entries.push({ kind: "file", name: file.name, path, fileHandle: null, file });
  }

  return {
    rootName,
    entries: [...directories.values(), ...entries].slice(0, PROJECT_MAX_ENTRIES),
  };
}

function projectEntryDepth(entry) {
  return Math.max(0, entry.path.split("/").length - 1);
}

function projectEntryHiddenByCollapsedParent(entry) {
  const parts = entry.path.split("/");
  for (let index = 1; index < parts.length; index += 1) {
    if (collapsedProjectDirectories.has(parts.slice(0, index).join("/"))) return true;
  }
  return false;
}

function renderProjectExplorer() {
  if (!elements.projectTree) return;
  elements.projectTree.replaceChildren();
  const entries = projectState?.entries ?? [];
  elements.filesExploreProject.disabled = !projectState;
  elements.projectEmpty.hidden = entries.some((entry) => isProjectFileOpenable(entry));

  if (!projectState) {
    elements.projectDialogTitle.textContent = t("project.title");
    elements.projectDialogSubtitle.textContent = t("project.subtitle");
    return;
  }

  elements.projectDialogTitle.textContent = projectState.name;
  elements.projectDialogSubtitle.textContent = projectState.writable
    ? t("project.subtitleWritable")
    : t("project.subtitleReadonly");

  const sorted = [...entries].sort((a, b) => {
    const parentA = a.path.includes("/") ? a.path.slice(0, a.path.lastIndexOf("/")) : "";
    const parentB = b.path.includes("/") ? b.path.slice(0, b.path.lastIndexOf("/")) : "";
    if (parentA === parentB && a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" });
  });

  for (const entry of sorted) {
    if (projectEntryHiddenByCollapsedParent(entry)) continue;
    const button = window.document.createElement("button");
    button.type = "button";
    button.className = `project-entry project-entry-${entry.kind}`;
    button.style.setProperty("--project-depth", String(projectEntryDepth(entry)));
    button.setAttribute("role", "treeitem");
    button.title = entry.path;

    const icon = window.document.createElement("span");
    icon.className = "project-entry-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = entry.kind === "directory" ? "▸" : "•";

    const label = window.document.createElement("span");
    label.className = "project-entry-name";
    label.textContent = entry.name;

    const path = window.document.createElement("span");
    path.className = "project-entry-path";
    path.textContent = entry.path.includes("/") ? entry.path.slice(0, entry.path.lastIndexOf("/")) : "";

    if (entry.kind === "directory") {
      const collapsed = collapsedProjectDirectories.has(entry.path);
      icon.textContent = collapsed ? "▸" : "▾";
      button.setAttribute("aria-expanded", String(!collapsed));
      button.addEventListener("click", () => {
        if (collapsed) collapsedProjectDirectories.delete(entry.path);
        else collapsedProjectDirectories.add(entry.path);
        renderProjectExplorer();
      });
    } else if (isProjectFileOpenable(entry)) {
      button.addEventListener("click", () => openProjectEntry(entry));
    } else {
      button.disabled = true;
      button.title = `${entry.path} — tipo no editable desde PyLab Studio`;
    }

    button.append(icon, label, path);
    elements.projectTree.append(button);
  }
}

function openProjectExplorer() {
  renderProjectExplorer();
  if (!projectState) return;
  if (typeof elements.projectDialog.showModal === "function") elements.projectDialog.showModal();
  else elements.projectDialog.setAttribute("open", "");
}

function closeProjectExplorer() {
  if (typeof elements.projectDialog.close === "function") elements.projectDialog.close();
  else elements.projectDialog.removeAttribute("open");
}

async function openProjectEntry(entry) {
  if (!projectState || !isProjectFileOpenable(entry)) return;
  const existing = workspace.documents.find(
    (document) => document.projectId === projectState.id && document.projectPath === entry.path,
  );
  if (existing) {
    activateDocument(existing.id);
    closeProjectExplorer();
    return;
  }

  try {
    const file = entry.file ?? (await entry.fileHandle?.getFile());
    if (!file) throw new Error(t("project.unreadable"));
    const document = await documentFromFile(file, entry.fileHandle ?? null, {
      projectId: projectState.id,
      projectPath: entry.path,
    });
    addDocument(document);
    closeProjectExplorer();
  } catch (error) {
    appendTerminal(t("project.error", { message: error.message }));
  }
}

function setProjectState(nextProject) {
  projectState = nextProject;
  collapsedProjectDirectories.clear();
  elements.filesExploreProject.disabled = !projectState;
  renderProjectExplorer();
}

async function openProjectWithDirectoryPicker() {
  if (!("showDirectoryPicker" in window)) return false;
  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    const entries = await collectDirectoryHandleEntries(directoryHandle);
    setProjectState({
      id: createId(),
      name: directoryHandle.name || t("project.defaultName"),
      rootHandle: directoryHandle,
      entries,
      writable: true,
    });
    appendTerminal(t("project.opened", { name: projectState.name, count: entries.length }));
    if (entries.length >= PROJECT_MAX_ENTRIES) {
      appendTerminal(t("project.entriesLimited", { count: PROJECT_MAX_ENTRIES }));
    }
    openProjectExplorer();
    return true;
  } catch (error) {
    if (error?.name !== "AbortError") appendTerminal(t("project.error", { message: error.message }));
    return true;
  }
}

async function openProject() {
  if (!("showDirectoryPicker" in window)) {
    elements.directoryInput.click();
    return;
  }
  await openProjectWithDirectoryPicker();
}

function syncDocumentFromEditors(document) {
  if (!document) return;
  if (document.kind === "notebook") {
    for (const cell of document.cells) {
      const view = notebookViews.get(notebookCellKey(document.id, cell.id));
      if (view) cell.source = view.state.doc.toString();
    }
  } else if (mountedDocumentId === document.id && editorView) {
    document.content = editorView.state.doc.toString();
  }
}

function serializedDocumentContent(document) {
  syncDocumentFromEditors(document);
  return document.kind === "notebook" ? serializeNotebook(document) : document.content;
}

function savePickerOptions(document) {
  const notebook = document.kind === "notebook";
  return {
    suggestedName: document.name || (notebook ? "Notebook.ipynb" : "Principal.py"),
    types: [
      notebook
        ? {
            description: t("file.notebookDescription"),
            accept: { "application/x-ipynb+json": [".ipynb"] },
          }
        : {
            description: t("file.pythonDescription"),
            accept: { "text/x-python": [".py"], "text/plain": [".txt"] },
          },
    ],
  };
}

async function ensureWritePermission(fileHandle) {
  if (!fileHandle) return false;
  if (typeof fileHandle.queryPermission !== "function") return true;
  const permission = await fileHandle.queryPermission({ mode: "readwrite" });
  if (permission === "granted") return true;
  if (typeof fileHandle.requestPermission !== "function") return false;
  return (await fileHandle.requestPermission({ mode: "readwrite" })) === "granted";
}

async function writeDocumentToHandle(document, fileHandle) {
  if (!fileHandle?.createWritable) return false;
  if (!(await ensureWritePermission(fileHandle))) throw new Error(t("file.permissionDenied"));
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(serializedDocumentContent(document));
  } finally {
    await writable.close();
  }
  return true;
}

function downloadDocument(document, requestedName = document.name) {
  const content = serializedDocumentContent(document);
  const notebook = document.kind === "notebook";
  const blob = new Blob([content], {
    type: notebook ? "application/x-ipynb+json;charset=utf-8" : "text/x-python;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = requestedName || (notebook ? "Notebook.ipynb" : "Principal.py");
  window.document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function saveAs() {
  const document = activeDocument();
  if (!document) return false;

  if ("showSaveFilePicker" in window) {
    try {
      const handle = await window.showSaveFilePicker(savePickerOptions(document));
      await writeDocumentToHandle(document, handle);
      document.fileHandle = handle;
      if (handle.name) document.name = handle.name;
      document.projectId = null;
      document.projectPath = null;
      appendTerminal(t("file.savedAs", { name: document.name }));
      markDocumentSaved(document);
      return true;
    } catch (error) {
      if (error?.name !== "AbortError") appendTerminal(t("file.saveAsFailed", { message: error.message }));
      return false;
    }
  }

  let fallbackName = window.prompt(
    t("file.copyNamePrompt"),
    document.name || (document.kind === "notebook" ? "Notebook.ipynb" : "Principal.py"),
  );
  if (!fallbackName) return false;
  fallbackName = fallbackName.trim();
  if (!fallbackName) return false;
  if (document.kind === "notebook" && !fallbackName.toLowerCase().endsWith(".ipynb")) {
    fallbackName += ".ipynb";
  }
  downloadDocument(document, fallbackName);
  document.name = fallbackName;
  document.projectId = null;
  document.projectPath = null;
  appendTerminal(
    t("file.copyDownloaded", { name: fallbackName }),
  );
  markDocumentSaved(document);
  return true;
}

async function saveDocument() {
  const document = activeDocument();
  if (!document) return false;

  if (!document.fileHandle?.createWritable) return saveAs();

  try {
    await writeDocumentToHandle(document, document.fileHandle);
    appendTerminal(t("file.saved", { name: document.name }));
    markDocumentSaved(document);
    return true;
  } catch (error) {
    appendTerminal(t("file.saveOriginalFailed", { message: error.message }));
    return false;
  }
}

function closeFilesMenu({ restoreFocus = false } = {}) {
  if (!elements.filesMenu || elements.filesMenu.hidden) return;
  elements.filesMenu.hidden = true;
  elements.filesMenuButton.setAttribute("aria-expanded", "false");
  if (restoreFocus) elements.filesMenuButton.focus();
}

function positionFilesMenu() {
  if (!elements.filesMenu || elements.filesMenu.hidden) return;
  const trigger = elements.filesMenuButton.getBoundingClientRect();
  const menu = elements.filesMenu;
  const gap = 6;
  const viewportPadding = 8;
  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;

  let left = trigger.right - menuWidth;
  left = Math.max(viewportPadding, Math.min(left, window.innerWidth - menuWidth - viewportPadding));

  let top = trigger.bottom + gap;
  if (top + menuHeight > window.innerHeight - viewportPadding) {
    top = Math.max(viewportPadding, trigger.top - menuHeight - gap);
  }

  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

function openFilesMenu() {
  if (!elements.filesMenu) return;
  elements.filesMenu.hidden = false;
  elements.filesMenuButton.setAttribute("aria-expanded", "true");
  positionFilesMenu();
  requestAnimationFrame(() => elements.filesNewNotebook.focus());
}

function toggleFilesMenu() {
  if (elements.filesMenu.hidden) openFilesMenu();
  else closeFilesMenu({ restoreFocus: true });
}

function getTheme(themeId) {
  return THEMES.find((theme) => theme.id === themeId) ?? THEMES[0];
}


function setText(selector, key, variables = {}) {
  const node = document.querySelector(selector);
  if (node) node.textContent = t(key, variables);
}

function setAttribute(selector, attribute, key, variables = {}) {
  const node = document.querySelector(selector);
  if (node) node.setAttribute(attribute, t(key, variables));
}

function applyStaticTranslations() {
  const language = languageOption(workspace.preferences.language);
  document.documentElement.lang = language.id;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute("content", t("app.description"));

  setAttribute(".toolbar", "aria-label", "toolbar.label");
  setAttribute("#run-btn", "title", "toolbar.run.title");
  setAttribute("#run-btn", "aria-label", "toolbar.run.aria");
  setAttribute("#stop-btn", "title", "toolbar.stop.title");
  setAttribute("#stop-btn", "aria-label", "toolbar.stop.aria");
  setAttribute("#new-btn", "title", "toolbar.new.title");
  setAttribute("#new-btn", "aria-label", "toolbar.new.aria");
  setAttribute("#save-btn", "title", "toolbar.save.title");
  setAttribute("#save-btn", "aria-label", "toolbar.save.aria");
  setAttribute("#comment-btn", "title", "toolbar.comment.title");
  setAttribute("#comment-btn", "aria-label", "toolbar.comment.aria");
  setAttribute("#tab-indent-btn", "title", "toolbar.tab.title");
  setAttribute("#tab-indent-btn", "aria-label", "toolbar.tab.aria");
  setAttribute("#editor-font-down", "title", "toolbar.editorFontDown");
  setAttribute("#editor-font-down", "aria-label", "toolbar.editorFontDown");
  setAttribute("#editor-font-up", "title", "toolbar.editorFontUp");
  setAttribute("#editor-font-up", "aria-label", "toolbar.editorFontUp");
  setAttribute("#theme-btn", "title", "toolbar.theme");
  setAttribute("#theme-btn", "aria-label", "toolbar.theme");
  setAttribute("#files-menu-btn", "title", "toolbar.files.title");
  setAttribute("#files-menu-btn", "aria-label", "toolbar.files.aria");
  setAttribute("#reset-session-btn", "title", "toolbar.reset.title");
  setAttribute("#reset-session-btn", "aria-label", "toolbar.reset.aria");
  if (elements.language) {
    elements.language.title = t("toolbar.language.title", { language: language.label });
    elements.language.setAttribute("aria-label", t("toolbar.language.aria", { language: language.label }));
  }

  setAttribute(".tabs-row", "aria-label", "tabs.label");
  setAttribute(".editor-panel", "aria-label", "editor.label");
  setAttribute("#notebook", "aria-label", "notebook.label");
  setText("#notebook-add-cell", "notebook.addCodeCell");
  setAttribute("#workspace-resizer", "aria-label", "resizer.aria");

  setText(".terminal-title > span:first-child", "terminal.title");
  setAttribute("#terminal-font-down", "title", "terminal.fontDown");
  setAttribute("#terminal-font-down", "aria-label", "terminal.fontDown");
  setAttribute("#terminal-font-up", "title", "terminal.fontUp");
  setAttribute("#terminal-font-up", "aria-label", "terminal.fontUp");
  setAttribute("#copy-terminal", "title", "terminal.copy");
  setAttribute("#copy-terminal", "aria-label", "terminal.copy");
  setAttribute("#clear-terminal", "title", "terminal.clear");
  setAttribute("#clear-terminal", "aria-label", "terminal.clear");
  setText('label[for="terminal-input"]', "terminal.inputLabel");
  setAttribute("#terminal-input", "aria-label", "terminal.inputAria");
  if (!currentInputRequestId && !elements.terminalInputForm.classList.contains("processing")) {
    elements.terminalInput.placeholder = t("terminal.inputPlaceholder");
  }
  setAttribute("#terminal-input-submit", "title", "terminal.submit");
  setAttribute("#terminal-input-submit", "aria-label", "terminal.submit");
  elements.terminalOutput?.setAttribute("data-empty-message", t("terminal.emptyOutput"));

  setAttribute("#files-menu", "aria-label", "files.menuAria");
  setText("#files-new-notebook span", "files.newNotebook");
  setText("#files-open span", "files.open");
  setText("#files-open-project span", "files.openProject");
  setText("#files-explore-project span", "files.exploreProject");
  setText("#files-save-as span", "files.saveAs");

  setAttribute("#project-close", "title", "project.close");
  setAttribute("#project-close", "aria-label", "project.close");
  setAttribute("#project-tree", "aria-label", "project.filesAria");
  setText("#project-empty", "project.empty");

  setText("#close-document-title", "closeDialog.title");
  setText("#close-document-before", "closeDialog.messageBefore");
  setText("#close-document-after", "closeDialog.messageAfter");
  setText("#close-document-cancel", "closeDialog.cancel");
  setText("#close-document-confirm", "closeDialog.confirm");

  setText("#theme-dialog-title", "theme.title");
  setText("#theme-dialog .theme-dialog-header p", "theme.subtitle");
  setAttribute("#theme-close", "title", "theme.close");
  setAttribute("#theme-close", "aria-label", "theme.close");
  setAttribute("#theme-grid", "aria-label", "theme.available");

  setText("#language-dialog-title", "language.title");
  setText("#language-dialog-subtitle", "language.subtitle");
  setAttribute("#language-close", "title", "language.close");
  setAttribute("#language-close", "aria-label", "language.close");
  setAttribute("#language-options", "aria-label", "language.available");
}

function updateNotebookLanguage() {
  const document = activeDocument();
  if (!document || document.kind !== "notebook" || elements.notebook.hidden) return;
  for (const cell of document.cells) {
    const shell = elements.notebookCells.querySelector(`[data-cell-id="${CSS.escape(cell.id)}"]`);
    if (!shell) continue;
    const run = shell.querySelector(".notebook-run-cell");
    if (run) {
      run.title = cell.type === "code" ? t("notebook.runCell") : t("notebook.codeOnly");
      run.setAttribute("aria-label", t("notebook.runCellAria", { count: cell.executionCount ?? "" }).trim());
    }
    const type = shell.querySelector(".notebook-cell-type");
    if (type) {
      type.setAttribute("aria-label", t("notebook.cellType"));
      for (const option of type.options) {
        option.textContent = t(`notebook.${option.value}`);
      }
    }
    const remove = shell.querySelector(".notebook-delete-cell");
    if (remove) {
      remove.title = t("notebook.deleteCell");
      remove.setAttribute("aria-label", t("notebook.deleteCell"));
    }
  }
}

function renderLanguageOptions() {
  if (!elements.languageOptions) return;
  elements.languageOptions.replaceChildren();
  const activeLanguage = normalizeLanguage(workspace.preferences.language);
  for (const option of LANGUAGE_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "language-option";
    button.dataset.language = option.id;
    button.setAttribute("aria-pressed", String(option.id === activeLanguage));
    button.setAttribute("aria-label", t("language.use", { language: option.label }));

    const code = document.createElement("strong");
    code.className = "language-option-code";
    code.textContent = option.short;
    const label = document.createElement("span");
    label.textContent = option.label;
    const check = document.createElement("span");
    check.className = "theme-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = option.id === activeLanguage ? "✓" : "";
    button.append(code, label, check);
    button.addEventListener("click", () => {
      setLanguage(option.id);
      if (typeof elements.languageDialog.close === "function") elements.languageDialog.close();
      else elements.languageDialog.removeAttribute("open");
      requestAnimationFrame(() => currentEditorView()?.focus());
    });
    elements.languageOptions.append(button);
  }
}

function setLanguage(language, persist = true) {
  workspace.preferences.language = normalizeLanguage(language);
  if (persist) workspace.preferences.languageExplicit = true;
  applyStaticTranslations();
  renderTabs();
  setTheme(workspace.preferences.theme, false);
  renderLanguageOptions();
  updateNotebookLanguage();
  if (projectState) renderProjectExplorer();
  applyTerminalCollapsedLabels();
  updateTerminalResizerAria();
  if (currentInputRequestId) elements.terminalState.textContent = t("terminal.waitingInput");
  else if (running) elements.terminalState.textContent = t("terminal.running");
  else elements.terminalState.textContent = t("terminal.ready");
  if (!workerReady && elements.engineStatus.classList.contains("loading")) {
    elements.engineStatusText.textContent = t("engine.loading");
  } else if (!workerReady && elements.engineStatus.classList.contains("error")) {
    elements.engineStatusText.textContent = t("engine.unavailable");
  } else if (!workerReady) {
    elements.engineStatusText.textContent = t("engine.notLoaded");
  }
  pythonWorker?.postMessage({ type: "set-language", language: workspace.preferences.language });
  if (persist) scheduleSave();
}

function openLanguageDialog() {
  renderLanguageOptions();
  if (typeof elements.languageDialog.showModal === "function") {
    if (!elements.languageDialog.open) elements.languageDialog.showModal();
  } else {
    elements.languageDialog.setAttribute("open", "");
  }
}

function renderThemeOptions() {
  if (!elements.themeGrid) return;
  elements.themeGrid.replaceChildren();
  const activeTheme = getTheme(workspace.preferences.theme);

  for (const theme of THEMES) {
    const button = window.document.createElement("button");
    button.type = "button";
    button.className = "theme-option";
    button.dataset.themeId = theme.id;
    button.setAttribute("aria-pressed", String(theme.id === activeTheme.id));
    button.setAttribute("aria-label", t("theme.use", { theme: theme.name }));

    const swatches = window.document.createElement("span");
    swatches.className = "theme-swatches";
    swatches.setAttribute("aria-hidden", "true");
    for (const color of theme.swatches) {
      const swatch = window.document.createElement("span");
      swatch.style.backgroundColor = color;
      swatches.append(swatch);
    }

    const copy = window.document.createElement("span");
    copy.className = "theme-option-copy";
    const name = window.document.createElement("strong");
    name.textContent = theme.name;
    const description = window.document.createElement("span");
    description.textContent = t(theme.descriptionKey);
    copy.append(name, description);

    const check = window.document.createElement("span");
    check.className = "theme-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = theme.id === activeTheme.id ? "✓" : "";

    button.append(swatches, copy, check);
    button.addEventListener("click", () => {
      setTheme(theme.id);
      if (typeof elements.themeDialog.close === "function") elements.themeDialog.close();
      else elements.themeDialog.removeAttribute("open");
      requestAnimationFrame(() => currentEditorView()?.focus());
    });
    elements.themeGrid.append(button);
  }
}

function setTheme(themeId, persist = true) {
  const theme = getTheme(themeId);
  workspace.preferences.theme = theme.id;
  document.documentElement.dataset.theme = theme.id;
  if (elements.themeColor) elements.themeColor.setAttribute("content", theme.themeColor);
  if (elements.theme) {
    elements.theme.title = t("theme.currentTitle", { theme: theme.name });
    elements.theme.setAttribute("aria-label", t("theme.currentAria", { theme: theme.name }));
  }
  renderThemeOptions();
  if (persist) scheduleSave();
}

function openThemeDialog() {
  renderThemeOptions();
  if (typeof elements.themeDialog.showModal === "function") {
    if (!elements.themeDialog.open) elements.themeDialog.showModal();
  } else {
    elements.themeDialog.setAttribute("open", "");
  }
}

function currentEditorView() {
  return activeDocument()?.kind === "notebook" ? activeNotebookEditorView : editorView;
}

function indentEditor() {
  const view = currentEditorView();
  if (!view) return;
  indentMore(view);
  requestAnimationFrame(() => view.focus());
}

function adjustFont(preference, delta, min, max) {
  workspace.preferences[preference] = Math.max(
    min,
    Math.min(max, workspace.preferences[preference] + delta),
  );
  applyPreferences();
  scheduleSave();
}

function applyTerminalCollapsedLabels() {
  elements.toggleTerminal.title = workspace.preferences.terminalCollapsed ? t("terminal.show") : t("terminal.hide");
  elements.toggleTerminal.setAttribute(
    "aria-label",
    workspace.preferences.terminalCollapsed ? t("terminal.show") : t("terminal.hide"),
  );
}

function applyPreferences() {
  setTheme(workspace.preferences.theme, false);
  document.documentElement.style.setProperty(
    "--editor-font-size",
    `${workspace.preferences.editorFontSize}px`,
  );
  document.documentElement.style.setProperty(
    "--terminal-font-size",
    `${workspace.preferences.terminalFontSize}px`,
  );
  const terminalHeightRatio = Number(workspace.preferences.terminalHeightRatio);
  const hasCustomTerminalHeight = Number.isFinite(terminalHeightRatio) && terminalHeightRatio >= 0.2 && terminalHeightRatio <= 0.75;
  elements.workspace.classList.toggle("terminal-resized", hasCustomTerminalHeight);
  if (hasCustomTerminalHeight) {
    elements.workspace.style.setProperty("--terminal-user-height", `${terminalHeightRatio * 100}%`);
  } else {
    elements.workspace.style.removeProperty("--terminal-user-height");
  }
  elements.terminalPanel.classList.toggle(
    "collapsed",
    workspace.preferences.terminalCollapsed,
  );
  applyTerminalCollapsedLabels();
  const path = elements.toggleTerminal.querySelector("path");
  path.setAttribute(
    "d",
    workspace.preferences.terminalCollapsed ? "m7 14 5-5 5 5z" : "m7 10 5 5 5-5z",
  );
}

function settleWorkerReady(value) {
  if (!resolveWorkerReady) return;
  const resolve = resolveWorkerReady;
  resolveWorkerReady = null;
  resolve(value);
}

function terminatePythonWorker() {
  settleWorkerReady(false);
  pythonWorker?.terminate();
  pythonWorker = null;
  workerReady = false;
}

function createPythonWorker() {
  if (pythonWorker) return pythonWorker;

  workerReady = false;
  workerReadyPromise = new Promise((resolve) => {
    resolveWorkerReady = resolve;
  });
  setEngineStatus("loading", t("engine.loading"));

  const worker = new Worker(new URL("./python-worker.js", import.meta.url));
  pythonWorker = worker;

  worker.addEventListener("message", (event) => {
    if (worker !== pythonWorker) return;
    const message = event.data;

    switch (message.type) {
      case "ready":
        workerReady = true;
        settleWorkerReady(true);
        setEngineStatus("ready", `Python ${message.pythonVersion}`);
        break;
      case "stdout":
      case "stderr":
        if (!message.runId || message.runId === currentRunId) {
          appendRunOutput(message.type === "stderr" ? "stderr" : "stdout", message.text);
        }
        break;
      case "packages-loading":
        if (message.runId === currentRunId && running && !currentInputRequestId) {
          elements.terminalState.textContent = t("terminal.loadingPackages");
        }
        break;
      case "packages-ready":
        if (message.runId === currentRunId && running && !currentInputRequestId) {
          elements.terminalState.textContent = t("terminal.running");
        }
        break;
      case "symbols":
        runtimeSymbols.set(message.sessionId, message.symbols);
        break;
      case "input-request":
        requestTerminalInput(message);
        break;
      case "done":
        if (message.runId !== currentRunId) return;
        resetTerminalInput();
        currentRunId = null;
        currentSessionId = null;
        currentRunTarget = null;
        setRunning(false);
        break;
      case "error":
        if (message.runId !== currentRunId) return;
        resetTerminalInput();
        currentRunId = null;
        currentSessionId = null;
        currentRunTarget = null;
        setRunning(false);
        elements.terminalState.textContent = t("terminal.error");
        break;
      case "engine-error":
        settleWorkerReady(false);
        resetTerminalInput();
        currentRunId = null;
        currentSessionId = null;
        currentRunTarget = null;
        setRunning(false);
        setEngineStatus("error", t("engine.unavailable"));
        appendTerminal(t("engine.message", { message: message.message }));
        terminatePythonWorker();
        break;
      case "session-disposed":
        runtimeSymbols.delete(message.sessionId);
        break;
      default:
        break;
    }
  });

  worker.addEventListener("error", (event) => {
    if (worker !== pythonWorker) return;
    settleWorkerReady(false);
    resetTerminalInput();
    currentRunId = null;
    currentSessionId = null;
    currentRunTarget = null;
    setRunning(false);
    setEngineStatus("error", t("engine.workerError"));
    appendTerminal(t("worker.message", { message: event.message || t("engine.unknownError") }));
    terminatePythonWorker();
  });

  worker.postMessage({ type: "init", pythonRuntime: PYTHON_RUNTIME, language: workspace.preferences.language });
  return worker;
}

async function waitForWorkerReady(timeoutMs = 25_000) {
  if (workerReady) return true;
  if (!pythonWorker) return false;

  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(false), timeoutMs);
  });
  const ready = await Promise.race([workerReadyPromise, timeout]);
  clearTimeout(timeoutId);
  return ready;
}

async function startPythonExecution({ document, code, filename, target }) {
  if (running) return false;

  resetTerminalInput();
  const runId = createId();
  currentRunId = runId;
  currentSessionId = document.id;
  currentRunTarget = target;
  setRunning(true, "Preparando…");
  if (target.kind === "terminal") appendTerminal(`\n▶ ${document.name}\n`);

  if (!pythonWorker) createPythonWorker();
  const ready = await waitForWorkerReady();

  if (!running || currentRunId !== runId) return false;
  if (!ready || !pythonWorker) {
    setEngineStatus("error", t("engine.unavailable"));
    appendTerminal(t("engine.loadTimeout"));
    currentRunId = null;
    currentSessionId = null;
    currentRunTarget = null;
    setRunning(false);
    terminatePythonWorker();
    return false;
  }

  elements.terminalState.textContent = t("terminal.running");
  pythonWorker.postMessage({
    type: "run",
    runId,
    sessionId: document.id,
    code,
    filename,
    mode: target.kind === "notebook" ? "notebook" : "script",
    language: workspace.preferences.language,
  });
  scheduleSave();
  return true;
}

async function runNotebookCell(documentId, cellId) {
  if (running) return;
  const document = workspace.documents.find((item) => item.id === documentId);
  const cell = document?.cells?.find((item) => item.id === cellId);
  if (!document || document.kind !== "notebook" || !cell || cell.type !== "code") return;

  const view = notebookViews.get(notebookCellKey(document.id, cell.id));
  if (view) cell.source = view.state.doc.toString();
  document.executionCounter = (document.executionCounter ?? 0) + 1;
  cell.executionCount = document.executionCounter;
  cell.outputs = [];
  cell.outputText = "";
  document.dirty = true;
  document.updatedAt = Date.now();
  renderTabs();
  refreshNotebookCellOutput(document, cell);

  await startPythonExecution({
    document,
    code: cell.source,
    filename: `${document.name || "Notebook.ipynb"} · ${t("notebook.cellFilename")} ${cell.executionCount}`,
    target: {
      kind: "notebook",
      documentId: document.id,
      cellId: cell.id,
      chunks: [],
    },
  });
}

async function runCode() {
  if (running) return;
  const document = activeDocument();
  if (!document) return;

  if (document.kind === "notebook") {
    const selected = document.cells.find((cell) => cell.id === activeNotebookCellId && cell.type === "code")
      ?? document.cells.find((cell) => cell.type === "code");
    if (selected) await runNotebookCell(document.id, selected.id);
    return;
  }

  document.content = editorView.state.doc.toString();
  await startPythonExecution({
    document,
    code: document.content,
    filename: document.name || "Principal.py",
    target: { kind: "terminal" },
  });
}

function stopCode() {
  if (!running) return;
  terminatePythonWorker();
  currentRunId = null;
  currentSessionId = null;
  currentRunTarget = null;
  resetTerminalInput();
  setRunning(false);
  runtimeSymbols.clear();
  appendTerminal(t("run.stopped"));
  createPythonWorker();
}

function resetActiveSession() {
  const document = activeDocument();
  if (!document) return;
  if (running && currentSessionId === document.id) {
    appendTerminal(t("session.stopBeforeReset"));
    return;
  }

  runtimeSymbols.delete(document.id);
  if (pythonWorker) {
    pythonWorker.postMessage({ type: "dispose-session", sessionId: document.id });
  }
  appendTerminal(t("session.restarted", { name: document.name }));
}

function toggleComments() {
  const view = currentEditorView();
  if (!view) return;
  toggleLineComment(view);
  view.focus();
}

function toggleTerminal() {
  workspace.preferences.terminalCollapsed = !workspace.preferences.terminalCollapsed;
  applyPreferences();
  scheduleSave();
}

function updateTerminalResizerAria() {
  if (!elements.workspaceResizer || workspace.preferences.terminalCollapsed) return;
  const workspaceRect = elements.workspace.getBoundingClientRect();
  const terminalRect = elements.terminalPanel.getBoundingClientRect();
  if (!workspaceRect.height) return;
  const ratio = Math.round((terminalRect.height / workspaceRect.height) * 100);
  elements.workspaceResizer.setAttribute("aria-valuenow", String(Math.max(20, Math.min(75, ratio))));
  elements.workspaceResizer.setAttribute("aria-valuetext", t("resizer.value", { ratio }));
}

function setTerminalHeightRatio(ratio, persist = true) {
  workspace.preferences.terminalHeightRatio = Math.max(0.2, Math.min(0.75, ratio));
  applyPreferences();
  updateTerminalResizerAria();
  if (persist) scheduleSave();
}

function setTerminalHeightFromPointer(clientY) {
  const rect = elements.workspace.getBoundingClientRect();
  if (!rect.height) return;
  setTerminalHeightRatio((rect.bottom - clientY) / rect.height, false);
}

function adjustTerminalHeight(deltaPixels) {
  const rect = elements.workspace.getBoundingClientRect();
  const terminalRect = elements.terminalPanel.getBoundingClientRect();
  if (!rect.height) return;
  setTerminalHeightRatio((terminalRect.height + deltaPixels) / rect.height);
}

function resetTerminalHeight() {
  workspace.preferences.terminalHeightRatio = null;
  applyPreferences();
  requestAnimationFrame(updateTerminalResizerAria);
  scheduleSave();
}

function bindEvents() {
  elements.run.addEventListener("click", runCode);
  elements.stop.addEventListener("click", stopCode);
  elements.create.addEventListener("click", newDocument);
  elements.save.addEventListener("click", saveDocument);
  elements.comment.addEventListener("click", toggleComments);
  elements.filesMenuButton.addEventListener("click", toggleFilesMenu);
  elements.filesNewNotebook.addEventListener("click", () => {
    closeFilesMenu();
    newNotebook();
  });
  elements.filesOpen.addEventListener("click", () => {
    closeFilesMenu();
    openFile();
  });
  elements.filesOpenProject.addEventListener("click", () => {
    closeFilesMenu();
    openProject();
  });
  elements.filesExploreProject.addEventListener("click", () => {
    closeFilesMenu();
    openProjectExplorer();
  });
  elements.filesSaveAs.addEventListener("click", () => {
    closeFilesMenu();
    saveAs();
  });
  elements.resetSession.addEventListener("click", resetActiveSession);
  elements.notebookAddCell.addEventListener("click", () => {
    const document = activeDocument();
    if (document?.kind === "notebook") addNotebookCell(document, activeNotebookCellId);
  });

  let touchIndentAt = -Infinity;
  elements.tabIndent.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    event.preventDefault();
    touchIndentAt = performance.now();
    indentEditor();
  });
  elements.tabIndent.addEventListener("click", () => {
    if (performance.now() - touchIndentAt < 500) return;
    indentEditor();
  });

  elements.theme.addEventListener("click", openThemeDialog);
  elements.themeClose.addEventListener("click", () => {
    if (typeof elements.themeDialog.close === "function") elements.themeDialog.close();
    else elements.themeDialog.removeAttribute("open");
  });
  elements.themeDialog.addEventListener("click", (event) => {
    if (event.target !== elements.themeDialog) return;
    if (typeof elements.themeDialog.close === "function") elements.themeDialog.close();
    else elements.themeDialog.removeAttribute("open");
  });
  elements.language.addEventListener("click", openLanguageDialog);
  elements.languageClose.addEventListener("click", () => {
    if (typeof elements.languageDialog.close === "function") elements.languageDialog.close();
    else elements.languageDialog.removeAttribute("open");
  });
  elements.languageDialog.addEventListener("click", (event) => {
    if (event.target !== elements.languageDialog) return;
    if (typeof elements.languageDialog.close === "function") elements.languageDialog.close();
    else elements.languageDialog.removeAttribute("open");
  });
  elements.projectClose.addEventListener("click", closeProjectExplorer);
  elements.projectDialog.addEventListener("click", (event) => {
    if (event.target === elements.projectDialog) closeProjectExplorer();
  });
  elements.copyTerminal.addEventListener("click", copyTerminal);
  elements.clearTerminal.addEventListener("click", clearTerminal);
  elements.toggleTerminal.addEventListener("click", toggleTerminal);
  elements.terminalInputForm.addEventListener("submit", submitTerminalInput);

  elements.editorFontDown.addEventListener("click", () =>
    adjustFont("editorFontSize", -1, 12, 30),
  );
  elements.editorFontUp.addEventListener("click", () =>
    adjustFont("editorFontSize", 1, 12, 30),
  );
  elements.terminalFontDown.addEventListener("click", () =>
    adjustFont("terminalFontSize", -1, 10, 28),
  );
  elements.terminalFontUp.addEventListener("click", () =>
    adjustFont("terminalFontSize", 1, 10, 28),
  );

  let resizingTerminal = false;
  elements.workspaceResizer.addEventListener("pointerdown", (event) => {
    if (workspace.preferences.terminalCollapsed) return;
    event.preventDefault();
    resizingTerminal = true;
    elements.workspaceResizer.classList.add("dragging");
    elements.workspaceResizer.setPointerCapture?.(event.pointerId);
    setTerminalHeightFromPointer(event.clientY);
  });
  elements.workspaceResizer.addEventListener("pointermove", (event) => {
    if (!resizingTerminal) return;
    event.preventDefault();
    setTerminalHeightFromPointer(event.clientY);
  });
  const finishTerminalResize = (event) => {
    if (!resizingTerminal) return;
    resizingTerminal = false;
    elements.workspaceResizer.classList.remove("dragging");
    if (event?.pointerId != null && elements.workspaceResizer.hasPointerCapture?.(event.pointerId)) {
      elements.workspaceResizer.releasePointerCapture(event.pointerId);
    }
    updateTerminalResizerAria();
    scheduleSave();
  };
  elements.workspaceResizer.addEventListener("pointerup", finishTerminalResize);
  elements.workspaceResizer.addEventListener("pointercancel", finishTerminalResize);
  elements.workspaceResizer.addEventListener("dblclick", resetTerminalHeight);
  elements.workspaceResizer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      adjustTerminalHeight(24);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      adjustTerminalHeight(-24);
    } else if (event.key === "Home") {
      event.preventDefault();
      setTerminalHeightRatio(0.2);
    } else if (event.key === "End") {
      event.preventDefault();
      setTerminalHeightRatio(0.75);
    } else if (event.key === "0") {
      event.preventDefault();
      resetTerminalHeight();
    }
  });

  elements.filesMenu.addEventListener("keydown", (event) => {
    const items = [
      elements.filesNewNotebook,
      elements.filesOpen,
      elements.filesOpenProject,
      elements.filesExploreProject,
      elements.filesSaveAs,
    ].filter((item) => !item.disabled);
    const current = items.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeFilesMenu({ restoreFocus: true });
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const next = (Math.max(current, 0) + direction + items.length) % items.length;
      items[next].focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0].focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items.at(-1).focus();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (elements.filesMenu.hidden) return;
    if (elements.filesMenu.contains(event.target) || elements.filesMenuButton.contains(event.target)) return;
    closeFilesMenu();
  });

  window.addEventListener("resize", () => {
    if (!elements.filesMenu.hidden) positionFilesMenu();
    updateTerminalResizerAria();
  });
  elements.toolbar.addEventListener("scroll", () => closeFilesMenu());

  elements.fileInput.addEventListener("change", async () => {
    const [file] = elements.fileInput.files;
    elements.fileInput.value = "";
    if (!file) return;
    try {
      addDocument(await documentFromFile(file));
    } catch (error) {
      appendTerminal(t("file.genericError", { message: error.message }));
    }
  });

  elements.directoryInput.addEventListener("change", () => {
    const files = [...elements.directoryInput.files];
    elements.directoryInput.value = "";
    if (!files.length) return;
    const { rootName, entries } = entriesFromDirectoryFiles(files);
    setProjectState({
      id: createId(),
      name: rootName,
      rootHandle: null,
      entries,
      writable: false,
    });
    appendTerminal(t("project.compatibleOpened", { name: rootName, count: entries.length }));
    openProjectExplorer();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.projectDialog.hasAttribute("open")) {
      event.preventDefault();
      closeProjectExplorer();
      return;
    }
    if (event.key === "Escape" && !elements.filesMenu.hidden) {
      event.preventDefault();
      closeFilesMenu({ restoreFocus: true });
      return;
    }

    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (event.key === "F5") {
      event.preventDefault();
      runCode();
    } else if (modifier && event.shiftKey && key === "s") {
      event.preventDefault();
      saveAs();
    } else if (modifier && key === "s") {
      event.preventDefault();
      saveDocument();
    } else if (modifier && event.shiftKey && key === "n") {
      event.preventDefault();
      newNotebook();
    } else if (modifier && key === "o") {
      event.preventDefault();
      openFile();
    }
  });

  window.addEventListener("beforeunload", () => {
    syncDocumentFromEditors(activeDocument());
    saveWorkspace(serializableWorkspace());
  });
}

async function restoreWorkspace() {
  const saved = await loadWorkspace();
  if (saved?.documents?.length) {
    workspace.documents = saved.documents.map((document) => {
      const kind = document.kind === "notebook" ? "notebook" : "python";
      if (kind === "notebook") {
        const cells = Array.isArray(document.cells) && document.cells.length
          ? document.cells.map((cell) => ({
              id: cell.id || createId(),
              notebookId: cell.notebookId ?? null,
              type: ["code", "markdown", "raw"].includes(cell.type) ? cell.type : "code",
              source: String(cell.source ?? ""),
              metadata: cell.metadata && typeof cell.metadata === "object" ? cell.metadata : {},
              attachments: cell.attachments && typeof cell.attachments === "object" ? cell.attachments : null,
              executionCount: Number.isInteger(cell.executionCount) ? cell.executionCount : null,
              outputs: Array.isArray(cell.outputs) ? cell.outputs : [],
              outputText: cell.outputText ?? notebookOutputsToText(cell.outputs),
            }))
          : createEmptyNotebook(createId).cells;
        return {
          ...document,
          kind,
          cells,
          executionCounter: Number.isInteger(document.executionCounter)
            ? document.executionCounter
            : Math.max(0, ...cells.map((cell) => cell.executionCount ?? 0)),
          fileHandle: document.fileHandle ?? null,
          dirty: Boolean(document.dirty),
        };
      }
      return {
        ...document,
        kind,
        content: String(document.content ?? ""),
        fileHandle: document.fileHandle ?? null,
        dirty: Boolean(document.dirty),
      };
    });
    workspace.activeId = workspace.documents.some((document) => document.id === saved.activeId)
      ? saved.activeId
      : workspace.documents[0].id;
    workspace.preferences = {
      ...workspace.preferences,
      ...(saved.preferences ?? {}),
    };
    if (saved.preferences?.languageExplicit !== true) {
      workspace.preferences.language = DEFAULT_LANGUAGE;
      workspace.preferences.languageExplicit = false;
    }
  } else {
    const document = createDocument("Principal.py", defaultCode());
    workspace.documents = [document];
    workspace.activeId = document.id;
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  try {
    if (!import.meta.env.PROD) {
      const registration = await navigator.serviceWorker.getRegistration("./");
      await registration?.unregister();
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key.startsWith("pylab-studio-") || key.startsWith("ibm-python-studio-"))
            .map((key) => caches.delete(key)),
        );
      }
      return;
    }
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch (error) {
    console.warn("No se pudo configurar el service worker:", error);
  }
}

async function initialize() {
  await restoreWorkspace();
  setLanguage(workspace.preferences.language, false);
  applyPreferences();
  bindEvents();
  activateDocument(workspace.activeId, false);
  requestAnimationFrame(updateTerminalResizerAria);
  createPythonWorker();
  registerServiceWorker();
}

initialize();
