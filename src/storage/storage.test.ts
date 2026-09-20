import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createProject } from "../domain/model";
import {
  deleteProject,
  getProject,
  listProjects,
  saveProject,
  listDeletedProjects,
  moveProjectToTrash,
  restoreProject,
} from "./projectRepository";
import { getAsset, saveAsset } from "./assetRepository";

function deleteTestDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("character-graph");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

describe("IndexedDB repositories", () => {
  beforeEach(async () => {
    await deleteTestDatabase();
  });

  it("saves, reads and lists projects by latest update", async () => {
    const older = createProject("旧项目", "project-1");
    older.updatedAt = "2026-01-01T00:00:00.000Z";
    const newer = createProject("新项目", "project-2");
    newer.updatedAt = "2026-02-01T00:00:00.000Z";

    await saveProject(older);
    await saveProject(newer);

    expect(await getProject(older.id)).toEqual(older);
    expect((await listProjects()).map((project) => project.id)).toEqual([
      "project-2",
      "project-1",
    ]);
  });

  it("deletes a project and only its assets in one operation", async () => {
    const first = createProject("项目一", "project-1");
    const second = createProject("项目二", "project-2");
    await saveProject(first);
    await saveProject(second);
    await saveAsset({
      id: "asset-1",
      projectId: first.id,
      fileName: "first.png",
      mimeType: "image/png",
      blob: new Blob(["first"], { type: "image/png" }),
    });
    await saveAsset({
      id: "asset-2",
      projectId: second.id,
      fileName: "second.png",
      mimeType: "image/png",
      blob: new Blob(["second"], { type: "image/png" }),
    });

    await deleteProject(first.id);

    expect(await getProject(first.id)).toBeUndefined();
    expect(await getAsset("asset-1")).toBeUndefined();
    expect(await getProject(second.id)).toEqual(second);
    expect(await getAsset("asset-2")).toMatchObject({ projectId: second.id });
  });

  it("keeps deleted projects locally for seven days and restores them", async () => {
    const project = createProject("回收站项目", "trash-project");
    const deletedAt = new Date("2026-08-14T00:00:00.000Z");
    await saveProject(project);
    await moveProjectToTrash(project, deletedAt);
    expect(await listProjects()).toEqual([]);
    const deleted = (await listDeletedProjects())[0];
    expect(deleted.purgeAt).toBe("2026-08-21T00:00:00.000Z");
    await restoreProject(deleted);
    expect((await listProjects())[0]).not.toHaveProperty("deletedAt");
  });
});
