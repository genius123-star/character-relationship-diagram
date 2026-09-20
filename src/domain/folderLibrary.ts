import type { Person, ProjectDocument, Relationship } from "./model";

export interface GraphMembership {
  personIds: string[];
  relationshipIds: string[];
}

export interface FolderLibrary {
  folderId: string;
  people: Person[];
  relationships: Relationship[];
  views: Record<string, GraphMembership>;
  updatedAt: string;
}

export function createFolderLibrary(folderId: string, projects: ProjectDocument[]): FolderLibrary {
  const people = mergeNewest(projects.flatMap((project) => project.people));
  const relationships = mergeNewest(projects.flatMap((project) => project.relationships));
  const views = Object.fromEntries(projects.map((project) => [project.id, {
    personIds: unique(project.people.map((person) => person.id)),
    relationshipIds: unique(project.relationships.map((relationship) => relationship.id)),
  }]));
  return {
    folderId,
    people,
    relationships,
    views,
    updatedAt: newestTimestamp(projects.map((project) => project.updatedAt)),
  };
}

export function removePersonFromView(library: FolderLibrary, viewId: string, personId: string): FolderLibrary {
  const view = library.views[viewId];
  if (!view) return library;
  const hiddenRelationshipIds = new Set(library.relationships
    .filter((relationship) => relationship.sourcePersonId === personId || relationship.targetPersonId === personId)
    .map((relationship) => relationship.id));
  return withUpdated(library, {
    ...library.views,
    [viewId]: {
      personIds: view.personIds.filter((id) => id !== personId),
      relationshipIds: view.relationshipIds.filter((id) => !hiddenRelationshipIds.has(id)),
    },
  });
}

export function addMembersToView(
  library: FolderLibrary,
  viewId: string,
  personIds: string[],
  relationshipIds: string[],
): FolderLibrary {
  const view = library.views[viewId];
  if (!view) return library;
  const availablePeople = new Set(library.people.map((person) => person.id));
  const selectedRelationships = library.relationships.filter((relationship) => relationshipIds.includes(relationship.id));
  const selectedPeople = new Set([
    ...view.personIds,
    ...personIds.filter((id) => availablePeople.has(id)),
    ...selectedRelationships.flatMap((relationship) => [relationship.sourcePersonId, relationship.targetPersonId]),
  ]);
  return withUpdated(library, {
    ...library.views,
    [viewId]: {
      personIds: [...selectedPeople],
      relationshipIds: unique([...view.relationshipIds, ...selectedRelationships.map((relationship) => relationship.id)]),
    },
  });
}

export function removeRelationshipFromView(
  library: FolderLibrary,
  viewId: string,
  relationshipId: string,
): FolderLibrary {
  const view = library.views[viewId];
  if (!view) return library;
  return withUpdated(library, {
    ...library.views,
    [viewId]: {
      ...view,
      relationshipIds: view.relationshipIds.filter((id) => id !== relationshipId),
    },
  });
}

export function permanentlyRemoveRelationship(
  library: FolderLibrary,
  relationshipId: string,
): FolderLibrary {
  return {
    ...library,
    relationships: library.relationships.filter((relationship) => relationship.id !== relationshipId),
    views: Object.fromEntries(Object.entries(library.views).map(([viewId, view]) => [viewId, {
      ...view,
      relationshipIds: view.relationshipIds.filter((id) => id !== relationshipId),
    }])),
    updatedAt: new Date().toISOString(),
  };
}

export function permanentlyRemovePerson(library: FolderLibrary, personId: string): FolderLibrary {
  const removedRelationshipIds = new Set(library.relationships
    .filter((relationship) => relationship.sourcePersonId === personId || relationship.targetPersonId === personId)
    .map((relationship) => relationship.id));
  return {
    ...library,
    people: library.people.filter((person) => person.id !== personId),
    relationships: library.relationships.filter((relationship) => !removedRelationshipIds.has(relationship.id)),
    views: Object.fromEntries(Object.entries(library.views).map(([viewId, view]) => [viewId, {
      personIds: view.personIds.filter((id) => id !== personId),
      relationshipIds: view.relationshipIds.filter((id) => !removedRelationshipIds.has(id)),
    }])),
    updatedAt: new Date().toISOString(),
  };
}

export function mergeProjectIntoLibrary(
  library: FolderLibrary,
  project: ProjectDocument,
): FolderLibrary {
  return {
    ...library,
    people: upsertAuthoritative(library.people, project.people),
    relationships: upsertAuthoritative(library.relationships, project.relationships),
    views: {
      ...library.views,
      [project.id]: {
        personIds: unique(project.people.map((person) => person.id)),
        relationshipIds: unique(project.relationships.map((relationship) => relationship.id)),
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

export function materializeProjectView(
  project: ProjectDocument,
  library: FolderLibrary,
): ProjectDocument {
  const view = library.views[project.id];
  if (!view) return project;
  const personIds = new Set(view.personIds);
  const relationshipIds = new Set(view.relationshipIds);
  return {
    ...project,
    people: library.people.filter((person) => personIds.has(person.id)),
    relationships: library.relationships.filter((relationship) => relationshipIds.has(relationship.id)),
    layout: Object.fromEntries(Object.entries(project.layout).filter(([personId]) => personIds.has(personId))),
  };
}

function mergeNewest<T extends { id: string; updatedAt: string }>(items: T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of items) {
    const existing = merged.get(item.id);
    if (!existing || item.updatedAt > existing.updatedAt) merged.set(item.id, item);
  }
  return [...merged.values()];
}

function upsertAuthoritative<T extends { id: string }>(existing: T[], changes: T[]): T[] {
  const merged = new Map(existing.map((item) => [item.id, item]));
  for (const item of changes) merged.set(item.id, item);
  return [...merged.values()];
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

function newestTimestamp(values: string[]): string {
  return values.sort().at(-1) ?? new Date().toISOString();
}

function withUpdated(library: FolderLibrary, views: FolderLibrary["views"]): FolderLibrary {
  return { ...library, views, updatedAt: new Date().toISOString() };
}
