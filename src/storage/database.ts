export const DATABASE_NAME = "character-graph";
export const DATABASE_VERSION = 3;
export const PROJECT_STORE = "projects";
export const ASSET_STORE = "assets";
export const FOLDER_STORE = "folders";
export const FOLDER_LIBRARY_STORE = "folderLibraries";

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        const projects = database.createObjectStore(PROJECT_STORE, {
          keyPath: "id",
        });
        projects.createIndex("updatedAt", "updatedAt");
      }
      if (!database.objectStoreNames.contains(ASSET_STORE)) {
        const assets = database.createObjectStore(ASSET_STORE, {
          keyPath: "id",
        });
        assets.createIndex("projectId", "projectId");
      }
      if (!database.objectStoreNames.contains(FOLDER_STORE)) {
        const folders = database.createObjectStore(FOLDER_STORE, { keyPath: "id" });
        folders.createIndex("updatedAt", "updatedAt");
      }
      if (!database.objectStoreNames.contains(FOLDER_LIBRARY_STORE)) {
        database.createObjectStore(FOLDER_LIBRARY_STORE, { keyPath: "folderId" });
      }
      if (request.transaction && event.oldVersion < 2 && database.objectStoreNames.contains(PROJECT_STORE)) {
        const projects = request.transaction.objectStore(PROJECT_STORE);
        projects.openCursor().onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) return;
          const project = cursor.value as { id: string; name: string; createdAt: string; updatedAt: string; folderId?: string; graphType?: string };
          const folderId = project.folderId ?? `folder-${project.id}`;
          request.transaction!.objectStore(FOLDER_STORE).put({ id: folderId, name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt });
          cursor.update({ ...project, folderId, graphType: project.graphType ?? "people" });
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("本地数据库升级被其他页面阻止"));
  });
}
