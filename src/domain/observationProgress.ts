import type { ProjectDocument } from "./model";

export interface ObservationState {
  futurePersonIds: Set<string>;
  futureRelationshipIds: Set<string>;
}

export function getObservationState(project: ProjectDocument, chapter: number): ObservationState {
  const futurePersonIds = new Set(project.people.filter((person) => person.firstAppearance && person.firstAppearance.value > chapter).map((person) => person.id));
  const futureRelationshipIds = new Set(project.relationships.filter((relationship) =>
    Boolean(relationship.startsAt && relationship.startsAt.value > chapter)
    || futurePersonIds.has(relationship.sourcePersonId)
    || futurePersonIds.has(relationship.targetPersonId),
  ).map((relationship) => relationship.id));
  return { futurePersonIds, futureRelationshipIds };
}

export function getTimelineMaximum(project: ProjectDocument): number {
  return Math.max(
    1,
    project.timeline.max ?? 1,
    ...project.people.map((person) => person.firstAppearance?.value ?? 1),
    ...project.relationships.flatMap((relationship) => [relationship.startsAt?.value ?? 1, relationship.endsAt?.value ?? 1]),
    ...project.people.flatMap((person) => person.events.map((event) => event.position?.value ?? 1)),
  );
}
