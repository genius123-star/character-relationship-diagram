import type { Person, PersonEvent, ProjectDocument, Relationship } from "../domain/model";

const timestamp = "2026-08-13T00:00:00.000Z";

export function createBenchmarkProject(): ProjectDocument {
  const people = Array.from({ length: 500 }, (_, index) => benchmarkPerson(index));
  const relationships = Array.from({ length: 3_000 }, (_, index) => benchmarkRelationship(index));
  return {
    schemaVersion: 1,
    id: "benchmark-500-3000",
    name: "500 人 / 3,000 关系性能基准",
    createdAt: timestamp,
    updatedAt: timestamp,
    timeline: { kind: "chapter", label: "章", max: 50 },
    people,
    relationships,
    categories: [{ id: "dimension-school", name: "学派", values: [
      { id: "school-a", name: "甲派", color: "#6157d8" },
      { id: "school-b", name: "乙派", color: "#e78b3e" },
      { id: "school-c", name: "丙派", color: "#4f8b72" },
    ] }],
    layout: Object.fromEntries(people.map((person, index) => [person.id, {
      x: (index % 25) * 104,
      y: Math.floor(index / 25) * 104,
      fixed: false,
    }])),
  };
}

function benchmarkPerson(index: number): Person {
  const id = `person-${String(index).padStart(3, "0")}`;
  const eventCount = index % 51;
  return {
    id,
    name: `人物 ${String(index).padStart(3, "0")}`,
    aliases: [`别名 ${index}`],
    summary: `性能基准人物 ${index} 的简介`,
    affiliation: `地区 ${index % 12}`,
    personalityTags: [`性格 ${index % 7}`],
    identityTags: [`身份 ${index % 9}`],
    firstAppearance: { kind: "chapter", value: (index % 50) + 1 },
    categoryValues: { "dimension-school": [`school-${["a", "b", "c"][index % 3]}`] },
    events: Array.from({ length: eventCount }, (_, eventIndex) => benchmarkEvent(index, eventIndex)),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function benchmarkEvent(personIndex: number, eventIndex: number): PersonEvent {
  return {
    id: `event-${personIndex}-${eventIndex}`,
    title: `人物 ${personIndex} 的事件 ${eventIndex}`,
    position: { kind: "chapter", value: (eventIndex % 50) + 1 },
    location: `地点 ${eventIndex % 15}`,
    description: "用于验证大量人物事件不会阻塞项目打开与搜索。",
  };
}

function benchmarkRelationship(index: number): Relationship {
  const sourceIndex = index % 500;
  const step = Math.floor(index / 500) + 1;
  const targetIndex = (sourceIndex + step) % 500;
  return {
    id: `relationship-${String(index).padStart(4, "0")}`,
    sourcePersonId: `person-${String(sourceIndex).padStart(3, "0")}`,
    targetPersonId: `person-${String(targetIndex).padStart(3, "0")}`,
    forwardLabel: `关系 ${index % 8}`,
    symmetric: index % 4 === 2,
    kind: (["directed", "bidirectional", "undirected", "contact"] as const)[index % 4],
    startsAt: { kind: "chapter", value: (index % 50) + 1 },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
