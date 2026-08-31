import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const main = readFileSync(join(root, "src/main.js"), "utf8");
const css = readFileSync(join(root, "src/styles.css"), "utf8");
const worker = readFileSync(join(root, "src/python-worker.js"), "utf8");
const runtime = readFileSync(join(root, "src/python-runtime.py"), "utf8");
const index = readFileSync(join(root, "index.html"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const themeIds = [
  "pylab-dark",
  "midnight-blue",
  "neon-night",
  "minimal-black",
  "deep-ocean",
  "forest",
  "paper-light",
  "sand-light",
];

const checks = [
  ["la marca visible es PyLab Studio", index.includes("PyLab Studio") && !index.includes("IBM Python Studio") && pkg.name === "pylab-studio"],
  ["PyLab Dark es el primer tema y el predeterminado", main.includes('const DEFAULT_THEME = "pylab-dark"') && main.indexOf('id: "pylab-dark"') < main.indexOf('id: "midnight-blue"')],
  ["existen los 8 temas iniciales", themeIds.every((id) => main.includes(`id: "${id}"`))],
  ["los temas usan HighlightStyle de CodeMirror", main.includes("HighlightStyle.define") && main.includes("syntaxHighlighting(pythonHighlightStyle)")],
  ["@lezer/highlight está declarado directamente", pkg.dependencies?.["@lezer/highlight"] === "1.2.3"],
  ["el tema se guarda como preferencia", main.includes("theme: DEFAULT_THEME") && main.includes("workspace.preferences.theme = theme.id")],
  ["existe el selector temporal de temas", index.includes('id="theme-btn"') && index.includes('<dialog id="theme-dialog"')],
  ["el botón de idioma mantiene el mismo tamaño visual que los demás iconos", index.includes('id="language-btn" class="icon-button language-button"') && !index.includes('id="language-code"')],
  ["el terminal recibe el lema de bienvenida", index.includes('data-empty-message="Less bugs, more code."')],
  ["Guardar es acción directa y Guardar como está en Archivos", index.includes('id="save-btn"') && index.includes('id="files-save-as"')],
  ["Guardar usa el handle existente cuando el navegador lo permite", main.includes("writeDocumentToHandle") && main.includes("document.fileHandle?.createWritable")],
  ["Guardar como usa showSaveFilePicker y tiene fallback de descarga", main.includes('"showSaveFilePicker" in window') && main.includes("downloadDocument(document")],
  ["se conservan Ctrl+S y se añade Ctrl+Shift+S", main.includes('event.shiftKey && key === "s"') && main.includes('modifier && key === "s"')],
  ["Nuevo archivo no anuncia ni captura Ctrl+N del navegador", !main.includes('modifier && key === "n"') && !index.includes("Ctrl+N")],
  ["el selector de archivos acepta .ipynb", index.includes(".ipynb") && main.includes('application/x-ipynb+json')],
  ["se puede crear un Notebook sin añadir otro botón permanente", index.includes('id="files-new-notebook"') && !index.includes('id="new-notebook-btn"')],
  ["Notebook ejecuta celdas con una sesión compartida por documento", main.includes("runNotebookCell") && main.includes("sessionId: document.id")],
  ["el Worker diferencia script y notebook", worker.includes('mode === "notebook"') && runtime.includes("__pylab_studio_run_cell__")],
  ["Notebook muestra la última expresión sin alterar scripts normales", runtime.includes("capture_last_expression") && runtime.includes("__pylab_studio_run_source__")],
  ["las salidas de Notebook se muestran en la celda", main.includes("refreshNotebookCellOutput") && css.includes(".notebook-output")],
  ["ejecutar celda tiene activación táctil además de click", main.includes("bindNotebookRunButton") && main.includes('button.addEventListener("pointerup"') && main.includes("runNotebookCell(document.id, cell.id)")],
  ["Notebook nuevo abre pestaña y entra en renombrado conservando .ipynb", main.includes("requestAnimationFrame(() =>") && main.includes("beginRename(document, tab)") && main.includes('input.value.length - ".ipynb".length')],
  ["Notebook usa todo el ancho disponible del editor", /\.notebook-cells,\s*\n\.notebook-add-row\s*\{[\s\S]*?width:\s*100%[\s\S]*?max-width:\s*none/.test(css)],
  ["la pestaña nueva se renderiza antes de montar el editor", /function addDocument\(document\) \{[\s\S]*?workspace\.documents\.push\(document\);[\s\S]*?renderTabs\(\);[\s\S]*?activateDocument\(document\.id\)/.test(main)],
  ["el montaje se valida por identidad de documento y no por un editor residual", main.includes("mountedDocumentId") && main.includes("mountedDocumentId === documentId") && main.includes("mountedDocumentKind")],
  ["cerrar con cambios usa diálogo no bloqueante", index.includes('id="close-document-dialog"') && main.includes("confirmCloseDocument") && main.includes("async function closeDocument")],
  ["cerrar el documento montado limpia la vista Notebook residual", main.includes("wasMountedNotebook") && main.includes("mountedDocumentId = null") && main.includes("activateDocument(next.id, false)")],
  ["se puede abrir una carpeta completa sin abrir todos sus archivos", index.includes('id="directory-input"') && index.includes('id="files-open-project"') && main.includes("openProjectEntry(entry)") && main.includes("renderProjectExplorer")],
  ["el explorador abre solo el archivo elegido en una pestaña", main.includes("document.projectId === projectState.id") && main.includes("addDocument(document)")],
  ["archivos de proyecto con handle conservan guardado sobre original", main.includes("entry.fileHandle ?? null") && main.includes("writeDocumentToHandle")],
  ["terminal tiene acción de copiar todo con fallback", index.includes('id="copy-terminal"') && main.includes("navigator.clipboard?.writeText") && main.includes('execCommand("copy")')],
  ["el terminal es redimensionable y la altura se persiste", main.includes("terminalHeightRatio") && main.includes("setTerminalHeightRatio")],
  ["renombrar y cerrar continúan en las pestañas", main.includes('className = "tab-rename"') && main.includes('className = "tab-close"')],
  ["los temas claros declaran color-scheme light", /data-theme="paper-light"[\s\S]*?color-scheme:\s*light/.test(css) && /data-theme="sand-light"[\s\S]*?color-scheme:\s*light/.test(css)],
  ["Pyodide silencia salida interna al cargar paquetes", worker.includes("suppressRuntimeOutput = true") && worker.includes("if (suppressRuntimeOutput) return")],
  ["se conserva loadPackagesFromImports", worker.includes("await pyodide.loadPackagesFromImports(code)")],
];

let failed = false;
for (const [description, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${description}`);
  if (!ok) failed = true;
}

if (failed) process.exit(1);
console.log("Regresión UI: OK");
