import { describe, expect, it } from "vitest";
import { projectedArrow, projectedArrowPolygon, screenArrowPolygon } from "./relationshipArrows";

describe("projectedArrow", () => {
  const project = ([longitude, latitude]: [number, number]) => ({
    x: longitude * 10,
    // 模拟地球投影产生的弯曲：同一条经纬度线在屏幕上并非水平直线。
    y: -latitude * 10 + longitude * longitude * 0.08,
  });
  const unproject = ({ x, y }: { x: number; y: number }): [number, number] => {
    const longitude = x / 10;
    return [longitude, -(y - longitude * longitude * 0.08) / 10];
  };

  it("places a directed arrow on the projected tangent next to the target node", () => {
    const arrow = projectedArrow([0, 0], [10, 0], "target", project, unproject);
    const endpoint = project([10, 0]);
    const point = project(arrow.coordinates);
    expect(Math.hypot(endpoint.x - point.x, endpoint.y - point.y)).toBeCloseTo(20, 3);
    expect(arrow.rotation).toBeCloseTo(Math.atan2(endpoint.y - point.y, endpoint.x - point.x) * 180 / Math.PI, 3);
  });

  it("places bidirectional arrows at opposite ends facing their respective nodes", () => {
    const sourceArrow = projectedArrow([0, 0], [10, 0], "source", project, unproject);
    const targetArrow = projectedArrow([0, 0], [10, 0], "target", project, unproject);
    const source = project([0, 0]);
    const target = project([10, 0]);
    const sourcePoint = project(sourceArrow.coordinates);
    const targetPoint = project(targetArrow.coordinates);
    expect(Math.hypot(source.x - sourcePoint.x, source.y - sourcePoint.y)).toBeCloseTo(20, 3);
    expect(Math.hypot(target.x - targetPoint.x, target.y - targetPoint.y)).toBeCloseTo(20, 3);
    expect(Math.abs(sourceArrow.rotation - targetArrow.rotation)).toBeGreaterThan(120);
  });

  it("builds a closed triangle whose tip touches the node edge", () => {
    const polygon = projectedArrowPolygon([0, 0], [10, 0], "target", project, unproject);
    expect(polygon).toHaveLength(4);
    expect(polygon[3]).toEqual(polygon[0]);
    const signedArea = polygon.slice(0, -1).reduce((area, point, index, points) => {
      const next = points[(index + 1) % points.length];
      return area + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2;
    expect(signedArea).toBeGreaterThan(0);
    const endpoint = project([10, 0]);
    const tip = project(polygon[0]);
    expect(Math.hypot(endpoint.x - tip.x, endpoint.y - tip.y)).toBeCloseTo(20, 3);
  });

  it("keeps the arrow entirely in screen coordinates for globe projections", () => {
    const polygon = screenArrowPolygon([0, 0], [10, 0], "target", project);
    const endpoint = project([10, 0]);
    expect(polygon).toHaveLength(3);
    expect(Math.hypot(endpoint.x - polygon[0].x, endpoint.y - polygon[0].y)).toBeCloseTo(20, 3);
    expect(polygon.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  });
});
