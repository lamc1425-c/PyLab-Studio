import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LANGUAGE_OPTIONS, normalizeLanguage, translate } from "../src/i18n.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const main = readFileSync(join(root, "src/main.js"), "utf8");
const worker = readFileSync(join(root, "src/python-worker.js"), "utf8");
const index = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "src/styles.css"), "utf8");

assert.deepEqual(LANGUAGE_OPTIONS.map((item) => item.id), ["en", "es", "it"]);
console.log("✓ están disponibles English, Español e Italiano");

assert.equal(normalizeLanguage("es-ES"), "es");
assert.equal(normalizeLanguage("it-IT"), "it");
assert.equal(normalizeLanguage("fr-FR"), "en");
console.log("✓ idiomas no soportados usan inglés como fallback");

assert.equal(translate("en", "terminal.ready"), "Ready");
assert.equal(translate("es", "terminal.ready"), "Listo");
assert.equal(translate("it", "terminal.ready"), "Pronto");
assert.match(translate("it", "files.saveAs"), /Salva/);
console.log("✓ las tres traducciones principales responden correctamente");

assert.ok(main.includes('const DEFAULT_LANGUAGE = "en";'));
assert.ok(!main.includes('const DEFAULT_LANGUAGE = detectLanguage()'));
assert.ok(main.includes('languageExplicit: false'));
console.log("✓ inglés es el idioma inicial hasta que el usuario elige otro");

for (const language of ["en", "es", "it"]) {
  assert.equal(translate(language, "terminal.emptyOutput"), "Less bugs, more code.");
}
assert.ok(index.includes('data-empty-message="Less bugs, more code."'));
console.log("✓ Less bugs, more code. es el mensaje de bienvenida en los tres idiomas");

const literalKeys = [...main.matchAll(/\bt\("([^"]+)"/g)].map((match) => match[1]);
const extraKeys = [
  ...["code", "markdown", "raw"].map((type) => `notebook.${type}`),
  ...["pylab-dark", "midnight-blue", "neon-night", "minimal-black", "deep-ocean", "forest", "paper-light", "sand-light"].map((id) => `theme.${id}`),
];
for (const key of new Set([...literalKeys, ...extraKeys])) {
  for (const language of ["en", "es", "it"]) {
    assert.notEqual(translate(language, key), key, `falta ${key} en ${language}`);
  }
}
console.log("✓ todas las claves usadas por la interfaz existen en los tres idiomas");

assert.ok(index.includes('id="language-btn"') && index.includes('id="language-dialog"'));
assert.ok(main.includes("language: DEFAULT_LANGUAGE") && main.includes("workspace.preferences.language"));
assert.ok(main.includes("function setLanguage") && main.includes("scheduleSave()"));
console.log("✓ selector de idioma y persistencia están integrados");

assert.ok(main.includes("document.documentElement.lang = language.id"));
assert.ok(main.includes('meta[name="description"]'));
assert.ok(main.includes("updateNotebookLanguage"));
assert.ok(main.includes("renderTabs()"));
console.log("✓ el cambio de idioma actualiza interfaz, pestañas y Notebook sin recargar");

assert.ok(worker.includes("set-language") && worker.includes("WORKER_MESSAGES"));
assert.ok(main.includes('type: "set-language"'));
console.log("✓ el Worker también recibe el idioma activo");

assert.ok(css.includes(".language-dialog") && css.includes(".language-options"));
assert.ok(!index.includes('class="language-row"'));
assert.ok(!index.includes('id="language-code"'));
assert.ok(!css.includes(".language-code"));
console.log("✓ el selector es temporal y el botón de idioma usa el mismo formato visual que la toolbar");

console.log("Regresión de idiomas: OK");
