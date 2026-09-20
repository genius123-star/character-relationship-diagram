import { describe, expect, it } from "vitest";
import { createPerson, createProject, createRelationship } from "./model";
import { getObservationState, getTimelineMaximum } from "./observationProgress";

describe("observation progress", () => {
  it("marks future people and their relationships without hiding unknown dates", () => {
    const project = createProject("测试", "project-1");
    project.people = [
      { ...createPerson("已出现", "person-1"), firstAppearance: { kind: "chapter", value: 2 } },
      { ...createPerson("未来", "person-2"), firstAppearance: { kind: "chapter", value: 8 } },
      createPerson("未知", "person-3"),
    ];
    project.relationships = [
      createRelationship({ id: "future-person-edge", sourcePersonId: "person-1", targetPersonId: "person-2", forwardLabel: "认识" }),
      { ...createRelationship({ id: "future-edge", sourcePersonId: "person-1", targetPersonId: "person-3", forwardLabel: "合作" }), startsAt: { kind: "chapter", value: 7 } },
    ];

    expect(getObservationState(project, 5)).toEqual({
      futurePersonIds: new Set(["person-2"]),
      futureRelationshipIds: new Set(["future-person-edge", "future-edge"]),
    });
  });

  it("derives the slider maximum from configured and recorded chapters", () => {
    const project = createProject("测试", "project-1");
    project.timeline.max = 6;
    project.people = [{ ...createPerson("人物", "person-1"), firstAppearance: { kind: "chapter", value: 9 } }];
    expect(getTimelineMaximum(project)).toBe(9);
  });
});
