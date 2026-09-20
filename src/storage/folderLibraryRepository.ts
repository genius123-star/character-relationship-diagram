import { createFolderLibrary, materializeProjectView, type FolderLibrary } from "../domain/folderLibrary";
import type { ProjectDocument } from "../domain/model";
import {
  FOLDER_LIBRARY_STORE,
  openDatabase,
  PROJECT_STORE,
  requestResult,
  transactionComplete,
} from "./database";
import { getProject } from "./projectRepository";

export async function getFolderLibrary(folderId: string): Promise<FolderLibrary | undefined> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(FOLDER_LIBRARY_STORE, "readonly");
    const library = await requestResult<FolderLibrary | undefined>(
      transaction.objectStore(FOLDER_LIBRARY_STORE).get(folderId),
    );
    await transactionComplete(transaction);
    return library;
  } finally {
    database.close();
  }
}

export async function getOrCreateFolderLibrary(folderId: string): Promise<FolderLibrary> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(
      [FOLDER_LIBRARY_STORE, PROJECT_STORE],
      "readwrite",
    );
    const store = transaction.objectStore(FOLDER_LIBRARY_STORE);
    const existing = await requestResult<FolderLibrary | undefined>(store.get(folderId));
    if (existing) {
      await transactionComplete(transaction);
      return existing;
    }
    const projects = await requestResult<ProjectDocument[]>(
      transaction.objectStore(PROJECT_STORE).getAll(),
    );
    const library = createFolderLibrary(
      folderId,
      projects.filter((project) => project.folderId === folderId && !project.deletedAt),
    );
    store.put(library);
    await transactionComplete(transaction);
    return library;
  } finally {
    database.close();
  }
}

export async function saveFolderLibrary(library: FolderLibrary): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(FOLDER_LIBRARY_STORE, "readwrite");
    transaction.objectStore(FOLDER_LIBRARY_STORE).put(library);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function saveProjectWithFolderLibrary(
  project: ProjectDocument,
  library: FolderLibrary,
): Promise<void> {
  if (project.folderId !== library.folderId) {
    throw new Error("图谱与共享库不属于同一文件夹");
  }
  const database = await openDatabase();
  try {
    const transaction = database.transaction(
      [FOLDER_LIBRARY_STORE, PROJECT_STORE],
      "readwrite",
    );
    transaction.objectStore(PROJECT_STORE).put(project);
    transaction.objectStore(FOLDER_LIBRARY_STORE).put(library);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function loadProjectWithFolderLibrary(
  projectId: string,
): Promise<{ project: ProjectDocument; library: FolderLibrary } | undefined> {
  const project = await getProject(projectId);
  if (!project?.folderId) return undefined;
  const library = await getOrCreateFolderLibrary(project.folderId);
  return { project: materializeProjectView(project, library), library };
}
