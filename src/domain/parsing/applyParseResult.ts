import { createPerson, createRelationship, type ProjectDocument } from "../model";
import type { ParseResult } from "./types";

export interface ApplyParseOptions {
  /** 叙述者"我"映射到已有节点（缺省时按 result 中 isNarrator 候选人名称新建）。 */
  narratorPersonId?: string;
}

/**
 * 把用户已确认的解析候选写入项目：只处理 status === "confirmed" 的项，
 * pending/rejected 一律不落库。返回新 ProjectDocument（updatedAt 由调用方维护）。
 * 关系端点必须映射到两个不同人物；同名未匹配的新人物与已有节点合并。
 */
export function applyParseResult(project: ProjectDocument, result: ParseResult, options: ApplyParseOptions = {}): ProjectDocument {
  const personIdByCandidate = new Map<string, string>();
  const people = [...project.people];
  const relationships = [...project.relationships];

  const resolvePerson = (candidateId: string, name: string, existingPersonId?: string, isNarrator?: boolean): string | undefined => {
    const mapped = personIdByCandidate.get(candidateId);
    if (mapped) return mapped;
    const match = existingPersonId && project.people.some((person) => person.id === existingPersonId)
      ? existingPersonId
      : isNarrator && options.narratorPersonId && project.people.some((person) => person.id === options.narratorPersonId)
        ? options.narratorPersonId
        : people.find((person) => person.name === name)?.id;
    const personId = match ?? createPerson(name).id;
    if (!match) {
      people.push(createPerson(name, personId));
    }
    personIdByCandidate.set(candidateId, personId);
    return personId;
  };

  for (const candidate of result.people) {
    if (candidate.status !== "confirmed") continue;
    resolvePerson(candidate.id, candidate.name, candidate.existingPersonId, candidate.isNarrator);
  }

  for (const candidate of result.relationships) {
    if (candidate.status !== "confirmed") continue;
    const source = personIdByCandidate.get(candidate.sourcePersonId);
    const target = personIdByCandidate.get(candidate.targetPersonId);
    if (!source || !target || source === target) continue;
    relationships.push(createRelationship({
      sourcePersonId: source,
      targetPersonId: target,
      forwardLabel: candidate.forwardLabel,
      kind: candidate.kind,
      symmetric: candidate.symmetric,
    }));
  }

  for (const candidate of result.features) {
    if (candidate.status !== "confirmed") continue;
    const personId = personIdByCandidate.get(candidate.personId);
    if (!personId) continue;
    const person = people.find((item) => item.id === personId);
    if (!person || person.personalityTags.includes(candidate.tag)) continue;
    person.personalityTags = [...person.personalityTags, candidate.tag];
    person.updatedAt = new Date().toISOString();
  }

  for (const candidate of result.locations) {
    if (candidate.status !== "confirmed") continue;
    const personId = candidate.peopleIds.map((id) => personIdByCandidate.get(id)).find(Boolean);
    if (!personId || candidate.longitude === undefined || candidate.latitude === undefined) continue;
    const person = people.find((item) => item.id === personId);
    if (!person) continue;
    person.geo = {
      label: candidate.name,
      longitude: candidate.longitude,
      latitude: candidate.latitude,
      countryCode: candidate.countryCode,
      continent: candidate.continent,
      status: "confirmed",
    };
    person.updatedAt = new Date().toISOString();
  }

  for (const candidate of result.events) {
    if (candidate.status !== "confirmed") continue;
    const personId = personIdByCandidate.get(candidate.personId);
    if (!personId) continue;
    const person = people.find((item) => item.id === personId);
    if (!person || person.events.some((event) => event.title === candidate.title)) continue;
    person.events = [...person.events, {
      id: crypto.randomUUID(),
      title: candidate.title,
      description: candidate.description,
    }];
    person.updatedAt = new Date().toISOString();
  }

  return { ...project, people, relationships };
}
