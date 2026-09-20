interface RelationshipEndpoints { id: string; sourcePersonId: string; targetPersonId: string }

export function connectedNeighborhood(personId: string, relationships: RelationshipEndpoints[]) {
  const nodeIds = new Set([personId]);
  const relationshipIds = new Set<string>();
  relationships.forEach((relationship) => {
    if (relationship.sourcePersonId !== personId && relationship.targetPersonId !== personId) return;
    nodeIds.add(relationship.sourcePersonId);
    nodeIds.add(relationship.targetPersonId);
    relationshipIds.add(relationship.id);
  });
  return { nodeIds, relationshipIds };
}
