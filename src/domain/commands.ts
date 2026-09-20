import type {
  CategoryDimension,
  EntityId,
  NodeLayout,
  Person,
  PersonEvent,
  ProjectDocument,
  Relationship,
} from "./model";

type PersonChanges = Partial<Omit<Person, "id" | "createdAt">>;
type RelationshipChanges = Partial<
  Omit<Relationship, "id" | "createdAt">
>;
type EventChanges = Partial<Omit<PersonEvent, "id">>;
type CategoryChanges = Partial<Omit<CategoryDimension, "id">>;

export type ProjectCommand =
  | { type: "person.add"; person: Person }
  | { type: "person.update"; id: EntityId; changes: PersonChanges }
  | { type: "person.remove"; id: EntityId }
  | {
      type: "person.restore";
      person: Person;
      personIndex: number;
      relationships: Array<{ relationship: Relationship; index: number }>;
      layout?: NodeLayout;
    }
  | { type: "relationship.add"; relationship: Relationship }
  | {
      type: "relationship.update";
      id: EntityId;
      changes: RelationshipChanges;
    }
  | { type: "relationship.remove"; id: EntityId }
  | {
      type: "relationship.restore";
      relationship: Relationship;
      index: number;
    }
  | { type: "event.add"; personId: EntityId; event: PersonEvent }
  | {
      type: "event.update";
      personId: EntityId;
      id: EntityId;
      changes: EventChanges;
    }
  | { type: "event.remove"; personId: EntityId; id: EntityId }
  | {
      type: "event.restore";
      personId: EntityId;
      event: PersonEvent;
      index: number;
    }
  | { type: "category.add"; dimension: CategoryDimension }
  | {
      type: "category.update";
      id: EntityId;
      changes: CategoryChanges;
    }
  | { type: "category.remove"; id: EntityId }
  | {
      type: "category.restore";
      dimension: CategoryDimension;
      index: number;
      assignments: Array<{ personId: EntityId; valueIds: EntityId[] }>;
    }
  | {
      type: "person.categories.set";
      personId: EntityId;
      dimensionId: EntityId;
      valueIds: EntityId[];
    }
  | { type: "layout.set"; personId: EntityId; layout: NodeLayout }
  | { type: "layout.remove"; personId: EntityId };

interface HistoryEntry {
  redo: ProjectCommand;
  undo: ProjectCommand;
  beforeUpdatedAt: string;
  afterUpdatedAt: string;
}

export interface ProjectHistory {
  present: ProjectDocument;
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export function createHistory(present: ProjectDocument): ProjectHistory {
  return { present, past: [], future: [] };
}

function invertCommand(
  project: ProjectDocument,
  command: ProjectCommand,
): ProjectCommand {
  switch (command.type) {
    case "person.add":
      return { type: "person.remove", id: command.person.id };
    case "person.update": {
      const person = requirePerson(project, command.id);
      return {
        type: "person.update",
        id: command.id,
        changes: previousValues(person, command.changes),
      };
    }
    case "person.remove": {
      const personIndex = project.people.findIndex(
        (person) => person.id === command.id,
      );
      if (personIndex < 0) {
        throw new Error(`人物不存在：${command.id}`);
      }
      return {
        type: "person.restore",
        person: project.people[personIndex],
        personIndex,
        relationships: project.relationships.flatMap((relationship, index) =>
          relationship.sourcePersonId === command.id ||
          relationship.targetPersonId === command.id
            ? [{ relationship, index }]
            : [],
        ),
        layout: project.layout[command.id],
      };
    }
    case "person.restore":
      return { type: "person.remove", id: command.person.id };
    case "relationship.add":
      return { type: "relationship.remove", id: command.relationship.id };
    case "relationship.update": {
      const relationship = requireRelationship(project, command.id);
      return {
        type: "relationship.update",
        id: command.id,
        changes: previousValues(relationship, command.changes),
      };
    }
    case "relationship.remove": {
      const index = project.relationships.findIndex(
        (relationship) => relationship.id === command.id,
      );
      if (index < 0) {
        throw new Error(`关系不存在：${command.id}`);
      }
      return {
        type: "relationship.restore",
        relationship: project.relationships[index],
        index,
      };
    }
    case "relationship.restore":
      return { type: "relationship.remove", id: command.relationship.id };
    case "event.add":
      return {
        type: "event.remove",
        personId: command.personId,
        id: command.event.id,
      };
    case "event.update": {
      const event = requireEvent(project, command.personId, command.id);
      return {
        type: "event.update",
        personId: command.personId,
        id: command.id,
        changes: previousValues(event, command.changes),
      };
    }
    case "event.remove": {
      const person = requirePerson(project, command.personId);
      const index = person.events.findIndex((event) => event.id === command.id);
      if (index < 0) {
        throw new Error(`事件不存在：${command.id}`);
      }
      return {
        type: "event.restore",
        personId: command.personId,
        event: person.events[index],
        index,
      };
    }
    case "event.restore":
      return {
        type: "event.remove",
        personId: command.personId,
        id: command.event.id,
      };
    case "category.add":
      return { type: "category.remove", id: command.dimension.id };
    case "category.update": {
      const dimension = project.categories.find(
        (candidate) => candidate.id === command.id,
      );
      if (!dimension) {
        throw new Error(`归类维度不存在：${command.id}`);
      }
      return {
        type: "category.update",
        id: command.id,
        changes: previousValues(dimension, command.changes),
      };
    }
    case "category.remove": {
      const index = project.categories.findIndex(
        (dimension) => dimension.id === command.id,
      );
      if (index < 0) {
        throw new Error(`归类维度不存在：${command.id}`);
      }
      return {
        type: "category.restore",
        dimension: project.categories[index],
        index,
        assignments: project.people.flatMap((person) =>
          person.categoryValues[command.id]
            ? [
                {
                  personId: person.id,
                  valueIds: person.categoryValues[command.id],
                },
              ]
            : [],
        ),
      };
    }
    case "category.restore":
      return { type: "category.remove", id: command.dimension.id };
    case "person.categories.set": {
      const person = requirePerson(project, command.personId);
      return {
        ...command,
        valueIds: person.categoryValues[command.dimensionId] ?? [],
      };
    }
    case "layout.set": {
      const previous = project.layout[command.personId];
      return previous
        ? { type: "layout.set", personId: command.personId, layout: previous }
        : { type: "layout.remove", personId: command.personId };
    }
    case "layout.remove": {
      const previous = project.layout[command.personId];
      if (!previous) {
        throw new Error(`节点布局不存在：${command.personId}`);
      }
      return { type: "layout.set", personId: command.personId, layout: previous };
    }
  }
}

function requirePerson(project: ProjectDocument, id: EntityId): Person {
  const person = project.people.find((candidate) => candidate.id === id);
  if (!person) {
    throw new Error(`人物不存在：${id}`);
  }
  return person;
}

function requireRelationship(
  project: ProjectDocument,
  id: EntityId,
): Relationship {
  const relationship = project.relationships.find(
    (candidate) => candidate.id === id,
  );
  if (!relationship) {
    throw new Error(`关系不存在：${id}`);
  }
  return relationship;
}

function requireEvent(
  project: ProjectDocument,
  personId: EntityId,
  eventId: EntityId,
): PersonEvent {
  const event = requirePerson(project, personId).events.find(
    (candidate) => candidate.id === eventId,
  );
  if (!event) {
    throw new Error(`事件不存在：${eventId}`);
  }
  return event;
}

function previousValues<T extends object, C extends Partial<T>>(
  source: T,
  changes: C,
): C {
  return Object.fromEntries(
    Object.keys(changes).map((key) => [key, source[key as keyof T]]),
  ) as C;
}

function insertAt<T>(items: T[], index: number, item: T): T[] {
  const result = [...items];
  result.splice(index, 0, item);
  return result;
}

function applyCommand(
  project: ProjectDocument,
  command: ProjectCommand,
  updatedAt: string,
): ProjectDocument {
  switch (command.type) {
    case "person.add":
      if (project.people.some((person) => person.id === command.person.id)) {
        throw new Error(`人物 ID 已存在：${command.person.id}`);
      }
      return {
        ...project,
        updatedAt,
        people: [...project.people, command.person],
      };
    case "person.update":
      return {
        ...project,
        updatedAt,
        people: project.people.map((person) =>
          person.id === command.id
            ? {
                ...person,
                ...command.changes,
                updatedAt: command.changes.updatedAt ?? updatedAt,
              }
            : person,
        ),
      };
    case "person.remove":
      if (!project.people.some((person) => person.id === command.id)) {
        throw new Error(`人物不存在：${command.id}`);
      }
      return {
        ...project,
        updatedAt,
        people: project.people.filter((person) => person.id !== command.id),
        relationships: project.relationships.filter(
          (relationship) =>
            relationship.sourcePersonId !== command.id &&
            relationship.targetPersonId !== command.id,
        ),
        layout: Object.fromEntries(
          Object.entries(project.layout).filter(([id]) => id !== command.id),
        ),
      };
    case "person.restore": {
      let relationships = [...project.relationships];
      for (const item of [...command.relationships].sort(
        (left, right) => left.index - right.index,
      )) {
        relationships = insertAt(
          relationships,
          item.index,
          item.relationship,
        );
      }
      return {
        ...project,
        updatedAt,
        people: insertAt(project.people, command.personIndex, command.person),
        relationships,
        layout: command.layout
          ? { ...project.layout, [command.person.id]: command.layout }
          : project.layout,
      };
    }
    case "relationship.add":
      return {
        ...project,
        updatedAt,
        relationships: [...project.relationships, command.relationship],
      };
    case "relationship.update":
      return {
        ...project,
        updatedAt,
        relationships: project.relationships.map((relationship) =>
          relationship.id === command.id
            ? {
                ...relationship,
                ...command.changes,
                updatedAt: command.changes.updatedAt ?? updatedAt,
              }
            : relationship,
        ),
      };
    case "relationship.remove":
      return {
        ...project,
        updatedAt,
        relationships: project.relationships.filter(
          (relationship) => relationship.id !== command.id,
        ),
      };
    case "relationship.restore":
      return {
        ...project,
        updatedAt,
        relationships: insertAt(
          project.relationships,
          command.index,
          command.relationship,
        ),
      };
    case "event.add":
      return updatePersonEvents(project, command.personId, updatedAt, (events) => [
        ...events,
        command.event,
      ]);
    case "event.update":
      return updatePersonEvents(project, command.personId, updatedAt, (events) =>
        events.map((event) =>
          event.id === command.id ? { ...event, ...command.changes } : event,
        ),
      );
    case "event.remove":
      return updatePersonEvents(project, command.personId, updatedAt, (events) =>
        events.filter((event) => event.id !== command.id),
      );
    case "event.restore":
      return updatePersonEvents(project, command.personId, updatedAt, (events) =>
        insertAt(events, command.index, command.event),
      );
    case "category.add":
      return {
        ...project,
        updatedAt,
        categories: [...project.categories, command.dimension],
      };
    case "category.update":
      return {
        ...project,
        updatedAt,
        categories: project.categories.map((dimension) =>
          dimension.id === command.id
            ? { ...dimension, ...command.changes }
            : dimension,
        ),
      };
    case "category.remove":
      return {
        ...project,
        updatedAt,
        categories: project.categories.filter(
          (dimension) => dimension.id !== command.id,
        ),
        people: project.people.map((person) => {
          const categoryValues = { ...person.categoryValues };
          delete categoryValues[command.id];
          return { ...person, categoryValues };
        }),
      };
    case "category.restore": {
      const assignments = new Map(
        command.assignments.map((assignment) => [
          assignment.personId,
          assignment.valueIds,
        ]),
      );
      return {
        ...project,
        updatedAt,
        categories: insertAt(
          project.categories,
          command.index,
          command.dimension,
        ),
        people: project.people.map((person) => {
          const valueIds = assignments.get(person.id);
          return valueIds
            ? {
                ...person,
                categoryValues: {
                  ...person.categoryValues,
                  [command.dimension.id]: valueIds,
                },
              }
            : person;
        }),
      };
    }
    case "person.categories.set":
      return {
        ...project,
        updatedAt,
        people: project.people.map((person) =>
          person.id === command.personId
            ? {
                ...person,
                updatedAt,
                categoryValues: {
                  ...person.categoryValues,
                  [command.dimensionId]: command.valueIds,
                },
              }
            : person,
        ),
      };
    case "layout.set":
      return {
        ...project,
        updatedAt,
        layout: { ...project.layout, [command.personId]: command.layout },
      };
    case "layout.remove": {
      const layout = { ...project.layout };
      delete layout[command.personId];
      return { ...project, updatedAt, layout };
    }
  }
}

function updatePersonEvents(
  project: ProjectDocument,
  personId: EntityId,
  updatedAt: string,
  update: (events: PersonEvent[]) => PersonEvent[],
): ProjectDocument {
  requirePerson(project, personId);
  return {
    ...project,
    updatedAt,
    people: project.people.map((person) =>
      person.id === personId
        ? { ...person, updatedAt, events: update(person.events) }
        : person,
    ),
  };
}

export function execute(
  history: ProjectHistory,
  command: ProjectCommand,
): ProjectHistory {
  const beforeUpdatedAt = history.present.updatedAt;
  const afterUpdatedAt = new Date().toISOString();
  const entry: HistoryEntry = {
    redo: command,
    undo: invertCommand(history.present, command),
    beforeUpdatedAt,
    afterUpdatedAt,
  };
  const past = [...history.past, entry].slice(-50);

  return {
    present: applyCommand(history.present, command, afterUpdatedAt),
    past,
    future: [],
  };
}

export function undo(history: ProjectHistory): ProjectHistory {
  const entry = history.past.at(-1);
  if (!entry) {
    return history;
  }
  return {
    present: applyCommand(
      history.present,
      entry.undo,
      entry.beforeUpdatedAt,
    ),
    past: history.past.slice(0, -1),
    future: [entry, ...history.future],
  };
}

export function redo(history: ProjectHistory): ProjectHistory {
  const [entry, ...future] = history.future;
  if (!entry) {
    return history;
  }
  return {
    present: applyCommand(history.present, entry.redo, entry.afterUpdatedAt),
    past: [...history.past, entry].slice(-50),
    future,
  };
}
