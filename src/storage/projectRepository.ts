import type { ProjectDocument } from "../domain/model";
import {
  ASSET_STORE,
  openDatabase,
  PROJECT_STORE,
  requestResult,
  transactionComplete,
} from "./database";

export async function saveProject(project: ProjectDocument): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PROJECT_STORE, "readwrite");
    transaction.objectStore(PROJECT_STORE).put(project);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function getProject(
  id: string,
): Promise<ProjectDocument | undefined> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PROJECT_STORE, "readonly");
    const project = await requestResult<ProjectDocument | undefined>(
      transaction.objectStore(PROJECT_STORE).get(id),
    );
    await transactionComplete(transaction);
    return project;
  } finally {
    database.close();
  }
}

export async function listProjects(): Promise<ProjectDocument[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PROJECT_STORE, "readonly");
    const projects = await requestResult<ProjectDocument[]>(
      transaction.objectStore(PROJECT_STORE).getAll(),
    );
    await transactionComplete(transaction);
    return projects.filter((project) => !project.deletedAt).sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  } finally {
    database.close();
  }
}

export async function listDeletedProjects(): Promise<ProjectDocument[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PROJECT_STORE, "readonly");
    const projects = await requestResult<ProjectDocument[]>(transaction.objectStore(PROJECT_STORE).getAll());
    await transactionComplete(transaction);
    return projects.filter((project) => project.deletedAt).sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!));
  } finally { database.close(); }
}

export async function moveProjectToTrash(project: ProjectDocument, now = new Date()): Promise<void> {
  await saveProject({ ...project, deletedAt: now.toISOString(), purgeAt: new Date(now.getTime() + 7 * 86400000).toISOString() });
}

export async function restoreProject(project: ProjectDocument): Promise<void> {
  const { deletedAt: _deletedAt, purgeAt: _purgeAt, ...active } = project;
  void _deletedAt; void _purgeAt;
  await saveProject(active as ProjectDocument);
}

export async function deleteProject(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(
      [PROJECT_STORE, ASSET_STORE],
      "readwrite",
    );
    transaction.objectStore(PROJECT_STORE).delete(id);

    const assetIndex = transaction
      .objectStore(ASSET_STORE)
      .index("projectId");
    const assetKeys = await requestResult<IDBValidKey[]>(
      assetIndex.getAllKeys(IDBKeyRange.only(id)),
    );
    const assets = transaction.objectStore(ASSET_STORE);
    for (const key of assetKeys) {
      assets.delete(key);
    }
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}
