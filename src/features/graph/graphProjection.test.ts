import { describe, expect, it } from "vitest";
import { createPerson, createProject, createRelationship } from "../../domain/model";
import { toGraphElements } from "./graphProjection";

describe("toGraphElements", () => {
  it("projects people and relationships into Cytoscape elements", () => {
    const ana = createPerson("安娜", "person-1");
    const vronsky = createPerson("渥伦斯基", "person-2");
    const relationship = createRelationship({
      id: "relationship-1",
      sourcePersonId: ana.id,
      targetPersonId: vronsky.id,
      forwardLabel: "恋人",
      kind: "contact",
    });
    const project = {
      ...createProject("安娜·卡列尼娜", "project-1"),
      people: [ana, vronsky],
      relationships: [relationship],
      layout: { "person-1": { x: 120, y: 80, fixed: false } },
    };

    expect(toGraphElements(project)).toEqual([
      { data: { id: "person-1", label: "安娜", kind: "person" }, position: { x: 120, y: 80 } },
      { data: { id: "person-2", label: "渥伦斯基", kind: "person" } },
      {
        data: {
          id: "relationship-1",
          source: "person-1",
          target: "person-2",
          label: "恋人",
          kind: "relationship",
          relationshipKind: "contact",
        },
        classes: "relationship-contact",
      },
    ]);
  });

  it("dims relationships and people outside the selected preview type", () => {
    const project = createProject("测试", "project-1");
    project.people = [createPerson("甲", "person-1"), createPerson("乙", "person-2"), createPerson("丙", "person-3")];
    project.relationships = [
      createRelationship({ id: "directed", sourcePersonId: "person-1", targetPersonId: "person-2", forwardLabel: "师生", kind: "directed" }),
      createRelationship({ id: "contact", sourcePersonId: "person-2", targetPersonId: "person-3", forwardLabel: "见过", kind: "contact" }),
    ];

    const elements = toGraphElements(project, "directed");
    expect(elements.find((element) => element.data.id === "directed")?.classes).toBe("relationship-directed");
    expect(elements.find((element) => element.data.id === "contact")?.classes).toBe("relationship-contact is-dimmed");
    expect(elements.find((element) => element.data.id === "person-3")?.classes).toBe("is-dimmed");
    expect(elements.find((element) => element.data.id === "person-2")?.classes).toBeUndefined();
  });
});
