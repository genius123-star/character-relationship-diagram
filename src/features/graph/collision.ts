interface Position {
  x: number;
  y: number;
}

interface CollisionNode extends Position {
  id: string;
  fixed: boolean;
}

export function resolveNodeCollision(position: Position, obstacles: Position[], minimumDistance: number): Position {
  return obstacles.reduce((current, obstacle) => {
    const deltaX = current.x - obstacle.x;
    const deltaY = current.y - obstacle.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance >= minimumDistance) return current;
    if (distance === 0) return { x: obstacle.x + minimumDistance, y: obstacle.y };
    const scale = minimumDistance / distance;
    return { x: obstacle.x + deltaX * scale, y: obstacle.y + deltaY * scale };
  }, position);
}

export function resolveCollisionLayout(dragged: CollisionNode, others: CollisionNode[], minimumDistance: number): Record<string, Position> {
  let draggedPosition = { x: dragged.x, y: dragged.y };
  const result: Record<string, Position> = Object.fromEntries(others.map((node) => [node.id, { x: node.x, y: node.y }]));
  draggedPosition = resolveNodeCollision(draggedPosition, others.filter((node) => node.fixed), minimumDistance);
  others.filter((node) => !node.fixed).forEach((node) => {
    result[node.id] = resolveNodeCollision(result[node.id], [draggedPosition], minimumDistance);
  });
  result[dragged.id] = draggedPosition;
  return result;
}
