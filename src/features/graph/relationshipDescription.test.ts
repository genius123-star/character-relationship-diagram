import { describe, expect, it } from "vitest";
import { createPerson, createRelationship } from "../../domain/model";
import { calculateRelationshipDescription } from "./relationshipDescription";

describe("calculateRelationshipDescription", () => {
  const people = [createPerson("甲", "person-1"), createPerson("乙", "person-2")];

  it("describes a directed relationship from its start to its end", () => {
    const relationship = createRelationship({ sourcePersonId: "person-1", targetPersonId: "person-2", forwardLabel: "老师", kind: "directed" });
    expect(calculateRelationshipDescription(relationship, people)).toBe("甲是乙的老师（单向关系：甲 → 乙）。");
  });

  it("describes bidirectional and undirected relationships without losing direction context", () => {
    expect(calculateRelationshipDescription(createRelationship({ sourcePersonId: "person-1", targetPersonId: "person-2", forwardLabel: "朋友", kind: "bidirectional" }), people)).toBe("甲与乙互为朋友（双向关系）。");
    expect(calculateRelationshipDescription(createRelationship({ sourcePersonId: "person-1", targetPersonId: "person-2", forwardLabel: "同事", kind: "undirected" }), people)).toBe("甲与乙存在同事关系（无明确方向）。");
  });
});
