import { describe, expect, it } from "vitest";
import { resolveCollisionLayout, resolveNodeCollision } from "./collision";

describe("resolveNodeCollision", () => {
  it("keeps a dragged node outside every node safety radius", () => {
    expect(resolveNodeCollision({ x: 60, y: 0 }, [{ x: 0, y: 0 }], 100)).toEqual({ x: 100, y: 0 });
  });

  it("leaves a position unchanged when it is already safe", () => {
    expect(resolveNodeCollision({ x: 140, y: 20 }, [{ x: 0, y: 0 }], 100)).toEqual({ x: 140, y: 20 });
  });

  it("separates perfectly overlapping nodes deterministically", () => {
    expect(resolveNodeCollision({ x: 0, y: 0 }, [{ x: 0, y: 0 }], 100)).toEqual({ x: 100, y: 0 });
  });
});

describe("resolveCollisionLayout", () => {
  it("pushes movable neighbors away from the dragged node", () => {
    expect(resolveCollisionLayout(
      { id: "dragged", x: 0, y: 0, fixed: false },
      [{ id: "neighbor", x: 60, y: 0, fixed: false }],
      100,
    )).toEqual({ dragged: { x: 0, y: 0 }, neighbor: { x: 100, y: 0 } });
  });

  it("keeps fixed neighbors still and moves the dragged node outside their safety radius", () => {
    expect(resolveCollisionLayout(
      { id: "dragged", x: 60, y: 0, fixed: false },
      [{ id: "fixed", x: 0, y: 0, fixed: true }],
      100,
    )).toEqual({ dragged: { x: 100, y: 0 }, fixed: { x: 0, y: 0 } });
  });
});
