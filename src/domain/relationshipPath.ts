import type { Relationship } from "./model";

export interface RelationshipPath {
  personIds: string[];
  relationshipIds: string[];
}

export function findShortestRelationshipPath(relationships: Relationship[], sourceId: string, targetId: string): RelationshipPath | undefined {
  return findAllShortestRelationshipPaths(relationships, sourceId, targetId)[0];
}

export function findAllShortestRelationshipPaths(relationships: Relationship[], sourceId: string, targetId: string): RelationshipPath[] {
  if (sourceId === targetId) return [{ personIds: [sourceId], relationshipIds: [] }];
  const queue: RelationshipPath[] = [{ personIds: [sourceId], relationshipIds: [] }];
  const results: RelationshipPath[] = [];
  let shortestLength: number | undefined;
  while (queue.length) {
    const path = queue.shift()!;
    if (shortestLength !== undefined && path.relationshipIds.length >= shortestLength) continue;
    const currentId = path.personIds.at(-1)!;
    for (const relationship of relationships) {
      const nextId = relationship.sourcePersonId === currentId
        ? relationship.targetPersonId
        : relationship.targetPersonId === currentId ? relationship.sourcePersonId : undefined;
      if (!nextId || path.personIds.includes(nextId)) continue;
      const nextPath = { personIds: [...path.personIds, nextId], relationshipIds: [...path.relationshipIds, relationship.id] };
      if (nextId === targetId) {
        shortestLength ??= nextPath.relationshipIds.length;
        if (nextPath.relationshipIds.length === shortestLength) results.push(nextPath);
      } else queue.push(nextPath);
    }
  }
  return results;
}
