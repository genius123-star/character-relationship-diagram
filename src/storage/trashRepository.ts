import type { ProjectDocument, ProjectFolder } from "../domain/model";
import { deleteFolder, listDeletedFolders } from "./folderRepository";
import { deleteProject, listDeletedProjects } from "./projectRepository";

export interface TrashContents { projects: ProjectDocument[]; folders: ProjectFolder[] }

export async function listTrash(): Promise<TrashContents> {
  const [projects, folders] = await Promise.all([listDeletedProjects(), listDeletedFolders()]);
  return { projects, folders };
}

export async function purgeExpiredTrash(now = new Date()): Promise<void> {
  const trash = await listTrash();
  await Promise.all([
    ...trash.projects.filter((item) => item.purgeAt && item.purgeAt <= now.toISOString()).map((item) => deleteProject(item.id)),
    ...trash.folders.filter((item) => item.purgeAt && item.purgeAt <= now.toISOString()).map((item) => deleteFolder(item.id)),
  ]);
}
