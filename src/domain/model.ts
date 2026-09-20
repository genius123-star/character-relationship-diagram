export type EntityId = string;

export interface ChapterPosition {
  kind: "chapter";
  value: number;
}

export interface PersonEvent {
  id: EntityId;
  title: string;
  position?: ChapterPosition;
  description?: string;
  location?: string;
}

// 人物地理匹配结果（派生解析后由用户确认或唯一结果自动放置的事实）。
// 只记录解析确认的坐标，不覆盖人物自身的"地区/势力"文本。
export interface PersonGeo {
  label: string;
  longitude: number;
  latitude: number;
  countryCode?: string;
  continent?: string;
  status: "auto" | "confirmed";
}

export interface Person {
  id: EntityId;
  name: string;
  aliases: string[];
  avatarAssetId?: EntityId;
  summary?: string;
  affiliation?: string;
  geo?: PersonGeo;
  personalityTags: string[];
  identityTags: string[];
  firstAppearance?: ChapterPosition;
  notes?: string;
  categoryValues: Record<EntityId, EntityId[]>;
  events: PersonEvent[];
  profileBlockOrder?: ProfileBlockKind[];
  createdAt: string;
  updatedAt: string;
}

export type ProfileBlockKind = "aliases" | "firstAppearance" | "affiliation" | "summary" | "personalityTags" | "identityTags" | "events" | "notes";

export interface Relationship {
  id: EntityId;
  sourcePersonId: EntityId;
  targetPersonId: EntityId;
  forwardLabel: string;
  reverseLabel?: string;
  symmetric: boolean;
  kind?: RelationshipKind;
  description?: string;
  startsAt?: ChapterPosition;
  endsAt?: ChapterPosition;
  createdAt: string;
  updatedAt: string;
}

export type RelationshipKind = "directed" | "bidirectional" | "undirected" | "contact";

export interface CategoryValue {
  id: EntityId;
  name: string;
  color: string;
}

export interface CategoryDimension {
  id: EntityId;
  name: string;
  values: CategoryValue[];
}

export interface NodeLayout {
  x: number;
  y: number;
  fixed: boolean;
}

export interface ProjectDocument {
  schemaVersion: 1;
  id: EntityId;
  folderId?: EntityId;
  graphType?: GraphType;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  purgeAt?: string;
  timeline: {
    kind: "chapter";
    label: "章";
    max?: number;
  };
  people: Person[];
  relationships: Relationship[];
  categories: CategoryDimension[];
  layout: Record<EntityId, NodeLayout>;
  journey?: { stops: JourneyStop[] };
}

export type GraphType = "people" | "geography" | "journey";

// 旅行叙事的一个站点：名称与已确认坐标（经 geocodeCandidates 解析或手动输入），
// 可选章节决定行程顺序；personIds/eventIds 为该站的局部图成员引用（事实仍在共享库）。
export interface JourneyStop {
  id: EntityId;
  label: string;
  longitude: number;
  latitude: number;
  countryCode?: string;
  continent?: string;
  chapter?: ChapterPosition;
  personIds: EntityId[];
  eventIds: EntityId[];
  note?: string;
}

export interface ProjectFolder {
  id: EntityId;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  purgeAt?: string;
}

function now(): string {
  return new Date().toISOString();
}

export function createProject(
  name: string,
  id: EntityId = crypto.randomUUID(),
  folderId?: EntityId,
  graphType: GraphType = "people",
): ProjectDocument {
  const timestamp = now();
  return {
    schemaVersion: 1,
    id,
    folderId,
    graphType,
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    timeline: { kind: "chapter", label: "章" },
    people: [],
    relationships: [],
    categories: [],
    layout: {},
    journey: { stops: [] },
  };
}

export function createFolder(name: string, id: EntityId = crypto.randomUUID()): ProjectFolder {
  const timestamp = now();
  return { id, name, createdAt: timestamp, updatedAt: timestamp };
}

export function createPerson(
  name: string,
  id: EntityId = crypto.randomUUID(),
): Person {
  const timestamp = now();
  return {
    id,
    name,
    aliases: [],
    personalityTags: [],
    identityTags: [],
    categoryValues: {},
    events: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

interface CreateRelationshipInput {
  id?: EntityId;
  sourcePersonId: EntityId;
  targetPersonId: EntityId;
  forwardLabel: string;
  reverseLabel?: string;
  symmetric?: boolean;
  kind?: RelationshipKind;
}

export function createRelationship(
  input: CreateRelationshipInput,
): Relationship {
  const timestamp = now();
  return {
    id: input.id ?? crypto.randomUUID(),
    sourcePersonId: input.sourcePersonId,
    targetPersonId: input.targetPersonId,
    forwardLabel: input.forwardLabel,
    reverseLabel: input.reverseLabel,
    symmetric: input.symmetric ?? false,
    kind: input.kind ?? (input.symmetric ? "undirected" : "directed"),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
