import type { ElementDefinition } from "cytoscape";
import type { ProjectDocument, RelationshipKind } from "../../domain/model";
import { getObservationState } from "../../domain/observationProgress";

export function toGraphElements(project: ProjectDocument, previewKind: RelationshipKind | "all" = "all", avatarUrls: Record<string, string> = {}, nodeColors: Record<string, string> = {}, observationChapter?: number): ElementDefinition[] {
  const highlightedRelationships = previewKind === "all" ? project.relationships : project.relationships.filter((relationship) => (relationship.kind ?? (relationship.symmetric ? "undirected" : "directed")) === previewKind);
  const highlightedPeople = new Set(highlightedRelationships.flatMap((relationship) => [relationship.sourcePersonId, relationship.targetPersonId]));
  const observation = observationChapter === undefined ? undefined : getObservationState(project, observationChapter);
  return [
    ...project.people.map((person) => ({
      data: { id: person.id, label: person.name, kind: "person", ...(avatarUrls[person.id] ? { avatarUrl: avatarUrls[person.id] } : {}), ...(nodeColors[person.id] ? { nodeColor: nodeColors[person.id] } : {}) },
      ...([avatarUrls[person.id] ? "has-avatar" : "", nodeColors[person.id] ? "has-category-color" : "", previewKind !== "all" && !highlightedPeople.has(person.id) ? "is-dimmed" : "", observation?.futurePersonIds.has(person.id) ? "is-future" : ""].filter(Boolean).length ? { classes: [avatarUrls[person.id] ? "has-avatar" : "", nodeColors[person.id] ? "has-category-color" : "", previewKind !== "all" && !highlightedPeople.has(person.id) ? "is-dimmed" : "", observation?.futurePersonIds.has(person.id) ? "is-future" : ""].filter(Boolean).join(" ") } : {}),
      ...(project.layout[person.id]
        ? { position: { x: project.layout[person.id].x, y: project.layout[person.id].y } }
        : {}),
    })),
    ...project.relationships.map((relationship) => {
      const relationshipKind = relationship.kind ?? (relationship.symmetric ? "undirected" : "directed");
      return {
        data: {
        id: relationship.id,
        source: relationship.sourcePersonId,
        target: relationship.targetPersonId,
        label: relationship.forwardLabel,
        kind: "relationship",
        relationshipKind,
      },
        classes: [`relationship-${relationshipKind}`, previewKind !== "all" && !highlightedRelationships.includes(relationship) ? "is-dimmed" : "", observation?.futureRelationshipIds.has(relationship.id) ? "is-future" : ""].filter(Boolean).join(" "),
      };
    }),
  ];
}
