import type { Person, Relationship } from "../../domain/model";

export function calculateRelationshipDescription(relationship: Relationship, people: Person[]): string {
  const source = people.find((person) => person.id === relationship.sourcePersonId)?.name ?? "起点人物";
  const target = people.find((person) => person.id === relationship.targetPersonId)?.name ?? "终点人物";
  const kind = relationship.kind ?? (relationship.symmetric ? "undirected" : "directed");
  if (kind === "bidirectional") return `${source}与${target}互为${relationship.forwardLabel}（双向关系）。`;
  if (kind === "undirected") return `${source}与${target}存在${relationship.forwardLabel}关系（无明确方向）。`;
  if (kind === "contact") return `${source}与${target}曾有${relationship.forwardLabel}联系。`;
  return `${source}是${target}的${relationship.forwardLabel}（单向关系：${source} → ${target}）。`;
}
