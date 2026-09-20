import { describe, expect, it } from "vitest";
import {
  createHistory,
  execute,
  redo,
  undo,
} from "./commands";
import {
  createPerson,
  createProject,
  createRelationship,
  type ProjectDocument,
} from "./model";
import { getRelationshipLabel, validateProject } from "./validation";

function projectWithFamily(): ProjectDocument {
  const project = createProject("百年孤独", "project-1");
  project.people.push(
    createPerson("乌尔苏拉", "person-1"),
    createPerson("奥雷里亚诺", "person-2"),
    createPerson("阿玛兰妲", "person-3"),
  );
  project.people[0].events.push({ id: "event-1", title: "建立马孔多" });
  project.relationships.push(
    createRelationship({
      id: "relationship-1",
      sourcePersonId: "person-1",
      targetPersonId: "person-2",
      forwardLabel: "母亲",
      reverseLabel: "儿子",
    }),
    createRelationship({
      id: "relationship-2",
      sourcePersonId: "person-2",
      targetPersonId: "person-3",
      forwardLabel: "兄妹",
      symmetric: true,
    }),
  );
  project.layout["person-1"] = { x: 10, y: 20, fixed: true };
  return project;
}

describe("domain model", () => {
  it("allows people with the same name to coexist by id", () => {
    const project = createProject("重名人物", "project-1");

    project.people.push(
      createPerson("奥雷里亚诺", "person-1"),
      createPerson("奥雷里亚诺", "person-2"),
    );

    expect(validateProject(project)).toEqual([]);
  });

  it("rejects blank names and dangling relationship references", () => {
    const project = createProject("测试项目", "project-1");
    project.people.push(createPerson("   ", "person-1"));
    project.relationships.push(
      createRelationship({
        id: "relationship-1",
        sourcePersonId: "person-1",
        targetPersonId: "missing-person",
        forwardLabel: "朋友",
        symmetric: true,
      }),
    );

    expect(validateProject(project)).toEqual([
      "人物名称不能为空：person-1",
      "关系终点不存在：relationship-1",
    ]);
  });

  it("rejects invalid chapters, event titles and self relationships", () => {
    const project = createProject("测试项目", "project-1");
    const person = createPerson("人物", "person-1");
    person.firstAppearance = { kind: "chapter", value: 0 };
    person.events.push({
      id: "event-1",
      title: " ",
      position: { kind: "chapter", value: -1 },
    });
    project.people.push(person);
    project.relationships.push(
      createRelationship({
        id: "relationship-1",
        sourcePersonId: "person-1",
        targetPersonId: "person-1",
        forwardLabel: " ",
      }),
    );

    expect(validateProject(project)).toEqual([
      "人物首次出现章节必须为正整数：person-1",
      "事件标题不能为空：event-1",
      "事件章节必须为正整数：event-1",
      "关系不能连接人物自身：relationship-1",
      "关系名称不能为空：relationship-1",
    ]);
  });

  it("reads directed and symmetric relationship labels", () => {
    const project = projectWithFamily();
    const directed = project.relationships[0];
    const symmetric = project.relationships[1];

    expect(getRelationshipLabel(directed, "person-1", "person-2")).toBe(
      "母亲",
    );
    expect(getRelationshipLabel(directed, "person-2", "person-1")).toBe(
      "儿子",
    );
    expect(getRelationshipLabel(symmetric, "person-3", "person-2")).toBe(
      "兄妹",
    );
  });

  it("rejects duplicate entity ids", () => {
    const project = createProject("测试项目", "project-1");
    const first = createPerson("人物一", "person-1");
    const second = createPerson("人物二", "person-1");
    first.events.push(
      { id: "event-1", title: "事件一" },
      { id: "event-1", title: "事件二" },
    );
    project.people.push(first, second);
    project.relationships.push(
      createRelationship({
        id: "relationship-1",
        sourcePersonId: "person-1",
        targetPersonId: "person-2",
        forwardLabel: "朋友",
      }),
      createRelationship({
        id: "relationship-1",
        sourcePersonId: "person-1",
        targetPersonId: "person-3",
        forwardLabel: "朋友",
      }),
    );

    expect(validateProject(project)).toContain("人物 ID 重复：person-1");
    expect(validateProject(project)).toContain("事件 ID 重复：event-1");
    expect(validateProject(project)).toContain(
      "关系 ID 重复：relationship-1",
    );
  });

  it("validates journey stops with chapter, coordinates and member references", () => {
    const project = createProject("在路上", "journey-project", "folder", "journey");
    const sal = createPerson("萨尔", "person-sal");
    sal.firstAppearance = { kind: "chapter", value: 1 };
    sal.events = [{ id: "event-chicago", title: "抵达芝加哥", position: { kind: "chapter", value: 3 } }];
    project.people = [sal];
    project.journey = {
      stops: [
        { id: "stop-ny", label: "纽约", longitude: -74.006, latitude: 40.7128, chapter: { kind: "chapter", value: 1 }, personIds: ["person-sal"], eventIds: [], },
        { id: "stop-chicago", label: "芝加哥", longitude: -87.6298, latitude: 41.8781, chapter: { kind: "chapter", value: 3 }, personIds: ["person-sal"], eventIds: ["event-chicago"], },
      ],
    };
    expect(validateProject(project)).toEqual([]);

    project.journey.stops[1].personIds = ["missing-person"];
    expect(validateProject(project)).toContain("行程站点引用的人物不存在：stop-chicago");
    project.journey.stops[1].personIds = [];
    project.journey.stops[1].eventIds = ["missing-event"];
    expect(validateProject(project)).toContain("行程站点引用的事件不存在：stop-chicago");
    project.journey.stops[1].eventIds = [];
    project.journey.stops[1].chapter = { kind: "chapter", value: 0 };
    expect(validateProject(project)).toContain("行程站点章节必须为正整数：stop-chicago");
    project.journey.stops[1].chapter = undefined;
    project.journey.stops[1].longitude = 200;
    expect(validateProject(project)).toContain("行程站点经度无效：stop-chicago");
  });
});

describe("commands and history", () => {
  it("deletes only the person, their events, layout and direct relationships", () => {
    const history = createHistory(projectWithFamily());

    const result = execute(history, { type: "person.remove", id: "person-1" });

    expect(result.present.people.map((person) => person.id)).toEqual([
      "person-2",
      "person-3",
    ]);
    expect(result.present.relationships.map((relation) => relation.id)).toEqual([
      "relationship-2",
    ]);
    expect(result.present.people[0].events).toEqual([]);
    expect(result.present.layout["person-1"]).toBeUndefined();
  });

  it("restores a deleted person and their direct data on undo", () => {
    const original = projectWithFamily();
    const deleted = execute(createHistory(original), {
      type: "person.remove",
      id: "person-1",
    });

    const restored = undo(deleted);

    expect(restored.present).toEqual(original);
  });

  it("clears redo after a new command", () => {
    const original = createHistory(createProject("测试", "project-1"));
    const added = execute(original, {
      type: "person.add",
      person: createPerson("人物一", "person-1"),
    });
    const undone = undo(added);

    const replaced = execute(undone, {
      type: "person.add",
      person: createPerson("人物二", "person-2"),
    });

    expect(redo(replaced)).toBe(replaced);
  });

  it("keeps only the latest 50 undo entries", () => {
    let history = createHistory(createProject("测试", "project-1"));

    for (let index = 0; index < 51; index += 1) {
      history = execute(history, {
        type: "person.add",
        person: createPerson(`人物${index}`, `person-${index}`),
      });
    }

    expect(history.past).toHaveLength(50);
    for (let index = 0; index < 50; index += 1) {
      history = undo(history);
    }
    expect(history.present.people.map((person) => person.id)).toEqual([
      "person-0",
    ]);
  });

  it("updates a person and restores the previous fields on undo", () => {
    const history = createHistory(projectWithFamily());

    const updated = execute(history, {
      type: "person.update",
      id: "person-1",
      changes: { name: "乌尔苏拉·伊瓜兰", aliases: ["乌尔苏拉"] },
    });

    expect(updated.present.people[0].name).toBe("乌尔苏拉·伊瓜兰");
    expect(undo(updated).present).toEqual(history.present);
  });

  it("adds, updates and removes a relationship reversibly", () => {
    const base = projectWithFamily();
    const relationship = createRelationship({
      id: "relationship-3",
      sourcePersonId: "person-1",
      targetPersonId: "person-3",
      forwardLabel: "母亲",
      reverseLabel: "女儿",
    });

    const added = execute(createHistory(base), {
      type: "relationship.add",
      relationship,
    });
    const updated = execute(added, {
      type: "relationship.update",
      id: relationship.id,
      changes: { forwardLabel: "养母" },
    });
    const removed = execute(updated, {
      type: "relationship.remove",
      id: relationship.id,
    });

    expect(removed.present.relationships).toHaveLength(2);
    expect(undo(removed).present.relationships.at(-1)?.forwardLabel).toBe(
      "养母",
    );
    expect(undo(undo(removed)).present.relationships.at(-1)).toEqual(
      relationship,
    );
  });

  it("adds, updates and removes a person event reversibly", () => {
    const event = {
      id: "event-2",
      title: "离开马孔多",
      position: { kind: "chapter" as const, value: 5 },
    };
    let history = createHistory(projectWithFamily());

    history = execute(history, {
      type: "event.add",
      personId: "person-2",
      event,
    });
    history = execute(history, {
      type: "event.update",
      personId: "person-2",
      id: event.id,
      changes: { title: "再次离开马孔多" },
    });
    history = execute(history, {
      type: "event.remove",
      personId: "person-2",
      id: event.id,
    });

    expect(history.present.people[1].events).toEqual([]);
    expect(undo(history).present.people[1].events[0].title).toBe(
      "再次离开马孔多",
    );
  });

  it("updates categories and node layout reversibly", () => {
    const dimension = {
      id: "category-1",
      name: "家族",
      values: [{ id: "value-1", name: "布恩迪亚", color: "#4F63C7" }],
    };
    let history = createHistory(projectWithFamily());

    history = execute(history, { type: "category.add", dimension });
    history = execute(history, {
      type: "person.categories.set",
      personId: "person-1",
      dimensionId: dimension.id,
      valueIds: ["value-1"],
    });
    history = execute(history, {
      type: "layout.set",
      personId: "person-1",
      layout: { x: 80, y: 90, fixed: false },
    });

    expect(history.present.people[0].categoryValues[dimension.id]).toEqual([
      "value-1",
    ]);
    expect(history.present.layout["person-1"]).toEqual({
      x: 80,
      y: 90,
      fixed: false,
    });
    expect(undo(history).present.layout["person-1"]).toEqual({
      x: 10,
      y: 20,
      fixed: true,
    });
  });

  it("updates and removes a category while preserving assignments for undo", () => {
    const dimension = {
      id: "category-1",
      name: "家族",
      values: [{ id: "value-1", name: "布恩迪亚", color: "#4F63C7" }],
    };
    let history = createHistory(projectWithFamily());
    history = execute(history, { type: "category.add", dimension });
    history = execute(history, {
      type: "person.categories.set",
      personId: "person-1",
      dimensionId: dimension.id,
      valueIds: ["value-1"],
    });
    history = execute(history, {
      type: "category.update",
      id: dimension.id,
      changes: { name: "所属家族" },
    });
    history = execute(history, {
      type: "category.remove",
      id: dimension.id,
    });

    expect(history.present.categories).toEqual([]);
    expect(history.present.people[0].categoryValues[dimension.id]).toBeUndefined();

    const restored = undo(history);
    expect(restored.present.categories[0].name).toBe("所属家族");
    expect(restored.present.people[0].categoryValues[dimension.id]).toEqual([
      "value-1",
    ]);
  });
});
