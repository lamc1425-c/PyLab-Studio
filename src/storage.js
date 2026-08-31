const DB_NAME = "pylab-studio";
const LEGACY_DB_NAME = "ibm-python-studio";
const DB_VERSION = 1;
const STORE_NAME = "workspace";
const WORKSPACE_KEY = "current";

function openDatabase(name = DB_NAME) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readWorkspace(name) {
  const database = await openDatabase(name);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(WORKSPACE_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function loadWorkspace() {
  try {
    const current = await readWorkspace(DB_NAME);
    if (current) return current;

    // Conserva el trabajo de instalaciones anteriores al cambio de nombre.
    const legacy = await readWorkspace(LEGACY_DB_NAME);
    if (legacy) {
      await saveWorkspace(legacy);
      return legacy;
    }
    return null;
  } catch (error) {
    console.warn("No se pudo leer IndexedDB:", error);
    return null;
  }
}

export async function saveWorkspace(workspace) {
  try {
    const database = await openDatabase(DB_NAME);
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(workspace, WORKSPACE_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  } catch (error) {
    console.warn("No se pudo guardar en IndexedDB:", error);
  }
}
