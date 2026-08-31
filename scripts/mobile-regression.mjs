import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const index = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "src/styles.css"), "utf8");
const main = readFileSync(join(root, "src/main.js"), "utf8");

const toolbarOrder = [
  "new-btn",
  "save-btn",
  "comment-btn",
  "tab-indent-btn",
  "editor-font-down",
  "editor-font-up",
  "theme-btn",
  "language-btn",
  "files-menu-btn",
  "reset-session-btn",
];

const checks = [
  ["viewport conserva interactive-widget=resizes-content", index.includes("interactive-widget=resizes-content")],
  ["el shell conserva tres filas y no añade una barra móvil", /\.app-shell\s*\{[\s\S]*?grid-template-rows:\s*auto auto minmax\(0, 1fr\)/.test(css)],
  ["la toolbar sigue desplazándose horizontalmente", /\.toolbar\s*\{[\s\S]*?overflow-x:\s*auto/.test(css)],
  ["TAB no ocupa espacio por defecto", /\.tab-indent-button\s*\{[\s\S]*?display:\s*none/.test(css)],
  ["TAB aparece únicamente para puntero táctil/grueso", /@media\s*\(pointer:\s*coarse\)[\s\S]*?\.tab-indent-button\s*\{[\s\S]*?display:\s*inline-flex/.test(css)],
  ["móvil <=430 conserva la altura base original del terminal", /@media\s*\(max-width:\s*430px\)[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\) minmax\(112px, 34dvh\)/.test(css)],
  ["móvil/tablet <=860 conserva la distribución base original", /@media\s*\(max-width:\s*860px\)[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\) minmax\(120px, 35dvh\)/.test(css)],
  ["editor, divisor y terminal permanecen en una sola columna", /\.editor-panel\s*\{[\s\S]*?grid-row:\s*1[\s\S]*?grid-column:\s*1/.test(css) && /\.terminal-panel\s*\{[\s\S]*?grid-row:\s*2[\s\S]*?grid-column:\s*1/.test(css) && /\.workspace-resizer\s*\{[\s\S]*?grid-row:\s*2[\s\S]*?grid-column:\s*1/.test(css)],
  ["el terminal conserva su estructura vertical original", /\.terminal-panel\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\) auto/.test(css)],
  ["el divisor se superpone al límite y no crea una tercera fila", /\.workspace-resizer\s*\{[\s\S]*?grid-row:\s*2[\s\S]*?grid-column:\s*1[\s\S]*?margin-top:\s*-7px/.test(css)],
  ["el divisor táctil solo captura el gesto sobre su propia zona", /\.workspace-resizer\s*\{[\s\S]*?touch-action:\s*none/.test(css)],
  ["el divisor admite puntero y teclado", main.includes('workspaceResizer.addEventListener("pointerdown"') && main.includes('workspaceResizer.addEventListener("keydown"')],
  ["Notebook vive dentro del panel editor, no como fila global", index.indexOf('id="notebook"') > index.indexOf('class="editor-panel"') && index.indexOf('id="notebook"') < index.indexOf('</section>', index.indexOf('class="editor-panel"'))],
  ["Notebook se compacta en <=560px", /@media\s*\(max-width:\s*560px\)[\s\S]*?\.notebook-host/.test(css)],
  ["Notebook no queda centrado en una columna estrecha en escritorio", /\.notebook-cells,\s*\n\.notebook-add-row\s*\{[\s\S]*?width:\s*100%[\s\S]*?max-width:\s*none/.test(css)],
  ["confirmación de cierre es dialog temporal y no bloquea el layout", index.includes('<dialog id="close-document-dialog"') && !index.includes('class="close-document-row"')],
  ["explorador de proyecto es dialog temporal y no añade sidebar", index.includes('<dialog id="project-dialog"') && !index.includes('class="project-sidebar"')],
  ["explorador de proyecto mantiene objetivos táctiles de 44px", /@media\s*\(pointer:\s*coarse\)[\s\S]*?\.project-entry\s*\{[\s\S]*?min-height:\s*44px/.test(css)],
  ["ejecución de celda cubre toque y lápiz sin depender solo de click", main.includes('event.pointerType !== "touch"') && main.includes('button.addEventListener("pointerup"')],
  ["copiar terminal no añade una nueva fila", index.includes('id="copy-terminal"') && /\.terminal-panel\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\) auto/.test(css)],
  ["selector de temas sigue siendo dialog temporal", index.includes('<dialog id="theme-dialog"')],
  ["selector de idioma sigue siendo dialog temporal", index.includes('<dialog id="language-dialog"') && !index.includes('class="language-row"')],
  ["idioma no ensancha la toolbar con un código de texto", !index.includes('id="language-code"') && !css.includes(".language-code")],
  ["menú de archivos sigue flotando fuera del layout", /\.files-menu\s*\{[\s\S]*?position:\s*fixed/.test(css)],
  ["menú de archivos conserva objetivos táctiles de 44px", /\.files-menu-item\s*\{[\s\S]*?min-height:\s*44px/.test(css)],
  ["orden prioritario de toolbar conservado", toolbarOrder.every((id, i) => i === 0 || index.indexOf(`id="${toolbarOrder[i - 1]}"`) < index.indexOf(`id="${id}"`))],
  ["TAB usa indentMore sobre el editor activo", main.includes("indentMore(view)") && main.includes("currentEditorView()")],
  ["los temas no reconstruyen el editor principal", !main.includes("setState(makeEditorState")],
];

let failed = false;
for (const [description, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${description}`);
  if (!ok) failed = true;
}

if (failed) process.exit(1);
console.log("Regresión móvil estática: OK");
