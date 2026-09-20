import { describe, expect, it } from "vitest";
import { createRelationship } from "./model";
import { findAllShortestRelationshipPaths, findShortestRelationshipPath } from "./relationshipPath";

describe("findShortestRelationshipPath", () => {
  const relationships = [
    createRelationship({ id: "r-ab", sourcePersonId: "a", targetPersonId: "b", forwardLabel: "认识" }),
    createRelationship({ id: "r-bc", sourcePersonId: "b", targetPersonId: "c", forwardLabel: "同事" }),
    createRelationship({ id: "r-ad", sourcePersonId: "a", targetPersonId: "d", forwardLabel: "朋友" }),
    createRelationship({ id: "r-dc", sourcePersonId: "d", targetPersonId: "c", forwardLabel: "同学" }),
  ];

  it("returns a stable shortest path between two people", () => {
    expect(findShortestRelationshipPath(relationships, "a", "c")).toEqual({
      personIds: ["a", "b", "c"],
      relationshipIds: ["r-ab", "r-bc"],
    });
  });

  it("traverses a relationship in either direction for network reachability", () => {
    expect(findShortestRelationshipPath(relationships, "c", "a")?.personIds).toEqual(["c", "b", "a"]);
  });

  it("reports no path between disconnected people", () => {
    expect(findShortestRelationshipPath(relationships, "a", "x")).toBeUndefined();
  });

  it("returns every stable path that has the minimum length", () => {
    expect(findAllShortestRelationshipPaths(relationships, "a", "c")).toEqual([
      { personIds: ["a", "b", "c"], relationshipIds: ["r-ab", "r-bc"] },
      { personIds: ["a", "d", "c"], relationshipIds: ["r-ad", "r-dc"] },
    ]);
  });
});
