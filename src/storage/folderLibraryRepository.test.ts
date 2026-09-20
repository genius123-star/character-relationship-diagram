import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createPerson, createProject } from "../domain/model";
import { getOrCreateFolderLibrary, getFolderLibrary, loadProjectWithFolderLibrary, saveProjectWithFolderLibrary } from "./folderLibraryRepository";
import { getProject, saveProject } from "./projectRepository";

function deleteTestDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("character-graph");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

describe("folder library repository", () => {
  beforeEach(deleteTestDatabase);

  it("lazily migrates existing projects in the folder and persists the result", async () => {
    const peopleGraph = createProject("人物图", "people-view", "folder-1", "people");
    const geoGraph = createProject("地理图", "geo-view", "folder-1", "geography");
    peopleGraph.people.push(createPerson("萨尔", "person-sal"));
    geoGraph.people.push(createPerson("迪安", "person-dean"));
    await saveProject(peopleGraph);
    await saveProject(geoGraph);

    const migrated = await getOrCreateFolderLibrary("folder-1");

    expect(migrated.people.map((person) => person.id).sort()).toEqual(["person-dean", "person-sal"]);
    expect(migrated.views[peopleGraph.id].personIds).toEqual(["person-sal"]);
    expect(migrated.views[geoGraph.id].personIds).toEqual(["person-dean"]);
    expect(await getFolderLibrary("folder-1")).toEqual(migrated);
  });

  it("saves a changed project and its shared folder facts together", async () => {
    const project = createProject("人物图", "people-view", "folder-1");
    await saveProject(project);
    const library = await getOrCreateFolderLibrary("folder-1");
    const sal = createPerson("萨尔", "person-sal");
    project.people.push(sal);
    library.people.push(sal);
    library.views[project.id].personIds.push(sal.id);

    await saveProjectWithFolderLibrary(project, library);

    expect((await getProject(project.id))?.people[0].name).toBe("萨尔");
    expect((await getFolderLibrary("folder-1"))?.people[0].name).toBe("萨尔");
  });

  it("loads a view with the latest shared person fields", async () => {
    const first = createProject("人物图", "people-view", "folder-1");
    const second = createProject("地理图", "geo-view", "folder-1", "geography");
    first.people.push(createPerson("萨尔", "person-sal"));
    second.people.push(createPerson("萨尔", "person-sal"));
    await saveProject(first);
    await saveProject(second);
    const library = await getOrCreateFolderLibrary("folder-1");
    library.people[0] = { ...library.people[0], name: "萨尔·帕拉迪斯" };
    await saveProjectWithFolderLibrary(first, library);

    const loaded = await loadProjectWithFolderLibrary(second.id);

    expect(loaded?.project.people[0].name).toBe("萨尔·帕拉迪斯");
    expect(loaded?.library.folderId).toBe("folder-1");
  });
});
