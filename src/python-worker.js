/* global loadPyodide */

const PYODIDE_VERSION = "0.29.4";
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const sessions = new Map();
const pendingInputs = new Map();

let pyodide = null;
let initialization = null;
let pythonRuntimeSource = null;
let activeRunId = null;
let runPending = false;
let inputSequence = 0;
let suppressRuntimeOutput = false;
let currentLanguage = "en";

const WORKER_MESSAGES = {
  en: {
    noActiveInput: "There is no active execution to receive input.",
    runtimeMissing: "The internal Python runtime was not initialized.",
    busy: "Another execution is already active. Stop it before starting a new one.\n",
    inputEnded: "The execution ended before input was received.",
  },
  es: {
    noActiveInput: "No hay una ejecución activa para recibir la entrada.",
    runtimeMissing: "El runtime interno de Python no fue inicializado.",
    busy: "Ya hay una ejecución activa. Deténla antes de iniciar otra.\n",
    inputEnded: "La ejecución terminó antes de recibir la entrada.",
  },
  it: {
    noActiveInput: "Non c'è un'esecuzione attiva per ricevere l'input.",
    runtimeMissing: "Il runtime Python interno non è stato inizializzato.",
    busy: "È già attiva un'esecuzione. Interrompila prima di avviarne un'altra.\n",
    inputEnded: "L'esecuzione è terminata prima di ricevere l'input.",
  },
};

function setWorkerLanguage(language) {
  const normalized = String(language ?? "").toLowerCase().split("-")[0];
  currentLanguage = Object.hasOwn(WORKER_MESSAGES, normalized) ? normalized : "en";
}

function workerText(key) {
  return WORKER_MESSAGES[currentLanguage]?.[key] ?? WORKER_MESSAGES.en[key] ?? key;
}

function post(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

function requestInput(prompt = "") {
  const runId = activeRunId;
  if (!runId) {
    return Promise.reject(new Error(workerText("noActiveInput")));
  }

  const requestId = `${runId}-input-${++inputSequence}`;
  return new Promise((resolve, reject) => {
    pendingInputs.set(requestId, { resolve, reject, runId });
    post("input-request", {
      runId,
      requestId,
      prompt: String(prompt ?? ""),
    });
  });
}

async function initializePyodide(runtimeSource = pythonRuntimeSource) {
  if (pyodide) return pyodide;
  if (initialization) return initialization;

  if (!runtimeSource) {
    throw new Error(workerText("runtimeMissing"));
  }
  pythonRuntimeSource = runtimeSource;

  initialization = (async () => {
    try {
      self.importScripts(`${PYODIDE_BASE}pyodide.js`);
      pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });

      pyodide.setStdout({
        batched(text) {
          if (suppressRuntimeOutput) return;
          post("stdout", { runId: activeRunId, text: `${text}\n` });
        },
      });
      pyodide.setStderr({
        batched(text) {
          if (suppressRuntimeOutput) return;
          post("stderr", { runId: activeRunId, text: `${text}\n` });
        },
      });

      pyodide.registerJsModule("pylab_studio_bridge", { requestInput });
      pyodide.runPython(pythonRuntimeSource);

      const version = pyodide.runPython("import platform; platform.python_version()");
      post("ready", {
        pythonVersion: version,
        pyodideVersion: PYODIDE_VERSION,
        interactiveInput: true,
      });
      return pyodide;
    } catch (error) {
      initialization = null;
      post("engine-error", { message: String(error?.message ?? error) });
      throw error;
    }
  })();

  return initialization;
}

function getSession(sessionId) {
  let globals = sessions.get(sessionId);
  if (globals) return globals;

  const dictType = pyodide.globals.get("dict");
  globals = dictType();
  dictType.destroy();
  globals.set("__name__", "__main__");
  globals.set("__file__", "<editor>");
  sessions.set(sessionId, globals);
  return globals;
}

function disposeSession(sessionId) {
  const globals = sessions.get(sessionId);
  if (!globals) return false;
  sessions.delete(sessionId);
  globals.destroy?.();
  return true;
}

function readSymbols(globals) {
  const keys = globals.keys();
  const symbols = [];
  try {
    for (const key of keys) {
      if (typeof key === "string" && !key.startsWith("_")) symbols.push(key);
    }
  } finally {
    keys.destroy?.();
  }
  return symbols.sort((a, b) => a.localeCompare(b));
}

async function executeSource(code, filename, globals, mode = "script") {
  const runnerKey = mode === "notebook" ? "__pylab_studio_run_cell__" : "__pylab_studio_run_source__";
  const sourceKey = "__pylab_studio_source__";
  const filenameKey = "__pylab_studio_filename__";

  const runtimeRunner = pyodide.globals.get(runnerKey);
  globals.set(runnerKey, runtimeRunner);
  runtimeRunner.destroy?.();

  globals.set(sourceKey, code);
  globals.set(filenameKey, filename);

  try {
    await pyodide.runPythonAsync(
      `await ${runnerKey}(${sourceKey}, ${filenameKey}, globals())`,
      { globals, filename },
    );
  } finally {
    globals.delete?.(sourceKey);
    globals.delete?.(filenameKey);
    globals.delete?.(runnerKey);
  }
}

async function runPython({ runId, sessionId, code, filename = "Principal.py", mode = "script" }) {
  if (activeRunId || runPending) {
    post("stderr", {
      runId,
      text: workerText("busy"),
    });
    post("error", { runId });
    return;
  }

  runPending = true;
  try {
    await initializePyodide();
  } catch {
    runPending = false;
    post("error", { runId });
    return;
  }

  activeRunId = runId;
  runPending = false;
  const globals = getSession(sessionId);
  globals.set("__file__", filename);

  try {
    post("packages-loading", { runId });
    suppressRuntimeOutput = true;
    try {
      await pyodide.loadPackagesFromImports(code);
    } finally {
      suppressRuntimeOutput = false;
      post("packages-ready", { runId });
    }
    await executeSource(code, filename, globals, mode);
    post("symbols", { sessionId, symbols: readSymbols(globals) });
    post("done", { runId });
  } catch (error) {
    post("stderr", {
      runId,
      text: `${String(error?.message ?? error).trim()}\n`,
    });
    post("error", { runId });
  } finally {
    for (const [requestId, pending] of pendingInputs) {
      if (pending.runId === runId) {
        pendingInputs.delete(requestId);
        pending.reject(new Error(workerText("inputEnded")));
      }
    }
    activeRunId = null;
  }
}

self.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "init") {
    setWorkerLanguage(message.language);
    pythonRuntimeSource = String(message.pythonRuntime ?? "");
    initializePyodide(pythonRuntimeSource).catch(() => {});
  } else if (message.type === "run") {
    setWorkerLanguage(message.language);
    runPython(message);
  } else if (message.type === "set-language") {
    setWorkerLanguage(message.language);
  } else if (message.type === "input-response") {
    const pending = pendingInputs.get(message.requestId);
    if (!pending || pending.runId !== message.runId) return;
    pendingInputs.delete(message.requestId);
    pending.resolve(String(message.value ?? ""));
  } else if (message.type === "dispose-session") {
    const disposed = disposeSession(message.sessionId);
    post("session-disposed", { sessionId: message.sessionId, disposed });
  }
});
