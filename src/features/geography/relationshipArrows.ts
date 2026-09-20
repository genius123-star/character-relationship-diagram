export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ProjectedArrow {
  coordinates: [number, number];
  rotation: number;
}

/**
 * 在地图投影后的屏幕空间中，把箭头尖端放到节点外缘并沿关系线的局部切线旋转。
 * source/target 分别用于双向关系的两端，形成一条线两端反向的“⮂”。
 */
export function projectedArrow(
  from: [number, number],
  to: [number, number],
  endpoint: "source" | "target",
  project: (coordinate: [number, number]) => ScreenPoint,
  unproject: (point: ScreenPoint) => [number, number],
  nodeEdgePixels = 20,
): ProjectedArrow {
  const endpointCoordinate = endpoint === "target" ? to : from;
  const sampleRatio = endpoint === "target" ? 0.98 : 0.02;
  const sampleCoordinate: [number, number] = [
    from[0] + (to[0] - from[0]) * sampleRatio,
    from[1] + (to[1] - from[1]) * sampleRatio,
  ];
  const endpointPoint = project(endpointCoordinate);
  const samplePoint = project(sampleCoordinate);
  const dx = endpointPoint.x - samplePoint.x;
  const dy = endpointPoint.y - samplePoint.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { coordinates: endpointCoordinate, rotation: 0 };
  const unitX = dx / length;
  const unitY = dy / length;
  const tipPoint = {
    x: endpointPoint.x - unitX * nodeEdgePixels,
    y: endpointPoint.y - unitY * nodeEdgePixels,
  };
  return {
    coordinates: unproject(tipPoint),
    rotation: Math.atan2(unitY, unitX) * 180 / Math.PI,
  };
}

export function projectedArrowPolygon(
  from: [number, number],
  to: [number, number],
  endpoint: "source" | "target",
  project: (coordinate: [number, number]) => ScreenPoint,
  unproject: (point: ScreenPoint) => [number, number],
  nodeEdgePixels = 20,
): Array<[number, number]> {
  const arrow = projectedArrow(from, to, endpoint, project, unproject, nodeEdgePixels);
  const tip = project(arrow.coordinates);
  const angle = arrow.rotation * Math.PI / 180;
  const unitX = Math.cos(angle);
  const unitY = Math.sin(angle);
  const base = { x: tip.x - unitX * 13, y: tip.y - unitY * 13 };
  const perpendicular = { x: -unitY * 6, y: unitX * 6 };
  const tipCoordinate = unproject(tip);
  const ring: Array<[number, number]> = [
    tipCoordinate,
    unproject({ x: base.x + perpendicular.x, y: base.y + perpendicular.y }),
    unproject({ x: base.x - perpendicular.x, y: base.y - perpendicular.y }),
  ];
  const signedArea = ring.reduce((area, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
  if (signedArea < 0) ring.splice(1, 2, ring[2], ring[1]);
  return [...ring, ring[0]];
}

export function screenArrowPolygon(
  from: [number, number],
  to: [number, number],
  endpoint: "source" | "target",
  project: (coordinate: [number, number]) => ScreenPoint,
  nodeEdgePixels = 20,
): ScreenPoint[] {
  const endpointCoordinate = endpoint === "target" ? to : from;
  const sampleRatio = endpoint === "target" ? 0.98 : 0.02;
  const sampleCoordinate: [number, number] = [
    from[0] + (to[0] - from[0]) * sampleRatio,
    from[1] + (to[1] - from[1]) * sampleRatio,
  ];
  const endpointPoint = project(endpointCoordinate);
  const samplePoint = project(sampleCoordinate);
  const dx = endpointPoint.x - samplePoint.x;
  const dy = endpointPoint.y - samplePoint.y;
  const length = Math.hypot(dx, dy);
  if (!length) return [];
  const unitX = dx / length;
  const unitY = dy / length;
  const tip = { x: endpointPoint.x - unitX * nodeEdgePixels, y: endpointPoint.y - unitY * nodeEdgePixels };
  const base = { x: tip.x - unitX * 13, y: tip.y - unitY * 13 };
  return [
    tip,
    { x: base.x - unitY * 6, y: base.y + unitX * 6 },
    { x: base.x + unitY * 6, y: base.y - unitX * 6 },
  ];
}
