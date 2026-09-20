import { describe, expect, it } from "vitest";
import { connectedNeighborhood } from "./previewFocus";

describe("preview focus", () => {
  it("returns only the hovered node, its direct neighbors and connecting relationships", () => {
    const relationships = [
      { id: "ab", sourcePersonId: "a", targetPersonId: "b" },
      { id: "bc", sourcePersonId: "b", targetPersonId: "c" },
      { id: "ad", sourcePersonId: "a", targetPersonId: "d" },
      { id: "dc", sourcePersonId: "d", targetPersonId: "c" },
    ];
    expect(connectedNeighborhood("a", relationships)).toEqual({ nodeIds: new Set(["a", "b", "d"]), relationshipIds: new Set(["ab", "ad"]) });
  });
});
