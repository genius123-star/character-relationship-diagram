import { describe, expect, it } from "vitest";
import { createPerson, createProject, createRelationship } from "./model";
import {
  createFolderLibrary,
  addMembersToView,
  mergeProjectIntoLibrary,
  materializeProjectView,
  permanentlyRemoveRelationship,
  removeRelationshipFromView,
  permanentlyRemovePerson,
  removePersonFromView,
} from "./folderLibrary";

describe("folder library", () => {
  it("promotes existing project facts into one folder library and keeps per-view membership", () => {
    const peopleGraph = createProject("人物图", "people-view", "folder-1", "people");
    const geographyGraph = createProject("地理图", "geo-view", "folder-1", "geography");
    const sal = createPerson("萨尔", "person-sal");
    const dean = createPerson("迪安", "person-dean");
    peopleGraph.people.push(sal, dean);
    peopleGraph.relationships.push(createRelationship({
      id: "relationship-friend",
      sourcePersonId: sal.id,
      targetPersonId: dean.id,
      forwardLabel: "朋友",
      symmetric: true,
    }));
    geographyGraph.people.push(sal);

    const library = createFolderLibrary("folder-1", [peopleGraph, geographyGraph]);

    expect(library.people.map((person) => person.id)).toEqual(["person-sal", "person-dean"]);
    expect(library.relationships.map((relationship) => relationship.id)).toEqual(["relationship-friend"]);
    expect(library.views[peopleGraph.id]).toEqual({
      personIds: ["person-sal", "person-dean"],
      relationshipIds: ["relationship-friend"],
    });
    expect(library.views[geographyGraph.id]).toEqual({
      personIds: ["person-sal"],
      relationshipIds: [],
    });
  });

  it("removes a person from one view without deleting the shared fact", () => {
    const project = createProject("人物图", "people-view", "folder-1");
    project.people.push(createPerson("萨尔", "person-sal"));
    const library = createFolderLibrary("folder-1", [project]);

    const next = removePersonFromView(library, project.id, "person-sal");

    expect(next.people).toHaveLength(1);
    expect(next.views[project.id].personIds).toEqual([]);
  });

  it("permanently deletes a person, direct relationships and every view reference", () => {
    const project = createProject("人物图", "people-view", "folder-1");
    project.people.push(createPerson("萨尔", "person-sal"), createPerson("迪安", "person-dean"));
    project.relationships.push(createRelationship({
      id: "relationship-friend",
      sourcePersonId: "person-sal",
      targetPersonId: "person-dean",
      forwardLabel: "朋友",
    }));
    const library = createFolderLibrary("folder-1", [project]);

    const next = permanentlyRemovePerson(library, "person-sal");

    expect(next.people.map((person) => person.id)).toEqual(["person-dean"]);
    expect(next.relationships).toEqual([]);
    expect(next.views[project.id]).toEqual({ personIds: ["person-dean"], relationshipIds: [] });
  });

  it("merges edits from one view into shared facts and materializes them in another view", () => {
    const first = createProject("人物图", "people-view", "folder-1");
    const second = createProject("地理图", "geo-view", "folder-1", "geography");
    first.people.push(createPerson("萨尔", "person-sal"));
    second.people.push(createPerson("萨尔", "person-sal"));
    const library = createFolderLibrary("folder-1", [first, second]);
    first.people[0] = { ...first.people[0], name: "萨尔·帕拉迪斯", updatedAt: "2026-08-15T00:00:00.000Z" };

    const merged = mergeProjectIntoLibrary(library, first);
    const materialized = materializeProjectView(second, merged);

    expect(merged.people[0].name).toBe("萨尔·帕拉迪斯");
    expect(materialized.people[0].name).toBe("萨尔·帕拉迪斯");
  });

  it("adds selected folder members and automatically includes relationship endpoints", () => {
    const source = createProject("来源图", "source-view", "folder-1");
    const target = createProject("地理图", "geo-view", "folder-1", "geography");
    source.people.push(createPerson("萨尔", "person-sal"), createPerson("迪安", "person-dean"));
    source.relationships.push(createRelationship({ id: "friendship", sourcePersonId: "person-sal", targetPersonId: "person-dean", forwardLabel: "朋友" }));
    const library = createFolderLibrary("folder-1", [source, target]);

    const next = addMembersToView(library, target.id, [], ["friendship"]);

    expect(next.views[target.id]).toEqual({
      personIds: ["person-sal", "person-dean"],
      relationshipIds: ["friendship"],
    });
  });

  it("removes or permanently deletes a relationship with different scopes", () => {
    const first = createProject("人物图", "people-view", "folder-1");
    const second = createProject("地理图", "geo-view", "folder-1", "geography");
    for (const project of [first, second]) {
      project.people.push(createPerson("萨尔", "person-sal"), createPerson("迪安", "person-dean"));
      project.relationships.push(createRelationship({ id: "friendship", sourcePersonId: "person-sal", targetPersonId: "person-dean", forwardLabel: "朋友" }));
    }
    const library = createFolderLibrary("folder-1", [first, second]);

    const hidden = removeRelationshipFromView(library, first.id, "friendship");
    const deleted = permanentlyRemoveRelationship(library, "friendship");

    expect(hidden.relationships).toHaveLength(1);
    expect(hidden.views[first.id].relationshipIds).toEqual([]);
    expect(hidden.views[second.id].relationshipIds).toEqual(["friendship"]);
    expect(deleted.relationships).toEqual([]);
    expect(deleted.views[first.id].relationshipIds).toEqual([]);
    expect(deleted.views[second.id].relationshipIds).toEqual([]);
  });
});
