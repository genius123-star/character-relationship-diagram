import type { ProjectFolder } from "../domain/model";
import { FOLDER_STORE, openDatabase, requestResult, transactionComplete } from "./database";

export async function saveFolder(folder: ProjectFolder): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(FOLDER_STORE, "readwrite");
    transaction.objectStore(FOLDER_STORE).put(folder);
    await transactionComplete(transaction);
  } finally { database.close(); }
}

export async function listFolders(): Promise<ProjectFolder[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(FOLDER_STORE, "readonly");
    const folders = await requestResult<ProjectFolder[]>(transaction.objectStore(FOLDER_STORE).getAll());
    await transactionComplete(transaction);
    return folders.filter((folder) => !folder.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally { database.close(); }
}

export async function listDeletedFolders(): Promise<ProjectFolder[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(FOLDER_STORE, "readonly");
    const folders = await requestResult<ProjectFolder[]>(transaction.objectStore(FOLDER_STORE).getAll());
    await transactionComplete(transaction);
    return folders.filter((folder) => folder.deletedAt).sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!));
  } finally { database.close(); }
}

export async function moveFolderToTrash(folder: ProjectFolder, now = new Date()): Promise<void> {
  await saveFolder({ ...folder, deletedAt: now.toISOString(), purgeAt: new Date(now.getTime() + 7 * 86400000).toISOString() });
}

export async function restoreFolder(folder: ProjectFolder): Promise<void> {
  const { deletedAt: _deletedAt, purgeAt: _purgeAt, ...active } = folder;
  void _deletedAt; void _purgeAt;
  await saveFolder(active as ProjectFolder);
}

export async function deleteFolder(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(FOLDER_STORE, "readwrite");
    transaction.objectStore(FOLDER_STORE).delete(id);
    await transactionComplete(transaction);
  } finally { database.close(); }
}
