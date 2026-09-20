import type { ProjectDocument, Relationship } from "./model";

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function duplicateIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.add(id);
    }
    seen.add(id);
  }
  return [...duplicates];
}

export function validateProject(project: ProjectDocument): string[] {
  const errors: string[] = [];
  const personIds = new Set(project.people.map((person) => person.id));
  const eventIds = new Set(project.people.flatMap((person) => person.events.map((event) => event.id)));

  for (const id of duplicateIds(project.people.map((person) => person.id))) {
    errors.push(`人物 ID 重复：${id}`);
  }
  for (const id of duplicateIds(project.relationships.map((item) => item.id))) {
    errors.push(`关系 ID 重复：${id}`);
  }
  for (const id of duplicateIds(project.people.flatMap((person) => person.events.map((event) => event.id)))) {
    errors.push(`事件 ID 重复：${id}`);
  }

  for (const person of project.people) {
    if (!person.name.trim()) {
      errors.push(`人物名称不能为空：${person.id}`);
    }
    if (
      person.firstAppearance &&
      !isPositiveInteger(person.firstAppearance.value)
    ) {
      errors.push(`人物首次出现章节必须为正整数：${person.id}`);
    }
    if (person.geo != null) {
      const geo = person.geo;
      if (
        !geo.label?.trim() ||
        !Number.isFinite(geo.longitude) ||
        !Number.isFinite(geo.latitude) ||
        (geo.status !== "auto" && geo.status !== "confirmed") ||
        (geo.countryCode !== undefined && typeof geo.countryCode !== "string") ||
        (geo.continent !== undefined && typeof geo.continent !== "string")
      ) {
        errors.push(`人物地理匹配字段无效：${person.id}`);
      }
    }
    for (const event of person.events) {
      if (!event.title.trim()) {
        errors.push(`事件标题不能为空：${event.id}`);
      }
      if (event.position && !isPositiveInteger(event.position.value)) {
        errors.push(`事件章节必须为正整数：${event.id}`);
      }
    }
  }

  for (const relationship of project.relationships) {
    if (!personIds.has(relationship.sourcePersonId)) {
      errors.push(`关系起点不存在：${relationship.id}`);
    }
    if (!personIds.has(relationship.targetPersonId)) {
      errors.push(`关系终点不存在：${relationship.id}`);
    }
    if (relationship.sourcePersonId === relationship.targetPersonId) {
      errors.push(`关系不能连接人物自身：${relationship.id}`);
    }
    if (!relationship.forwardLabel.trim()) {
      errors.push(`关系名称不能为空：${relationship.id}`);
    }
    if (
      relationship.startsAt &&
      !isPositiveInteger(relationship.startsAt.value)
    ) {
      errors.push(`关系开始章节必须为正整数：${relationship.id}`);
    }
    if (
      relationship.endsAt &&
      !isPositiveInteger(relationship.endsAt.value)
    ) {
      errors.push(`关系结束章节必须为正整数：${relationship.id}`);
    }
  }

  if (project.journey) {
    for (const stop of project.journey.stops) {
      if (!stop.label.trim()) {
        errors.push(`行程站点名称不能为空：${stop.id}`);
      }
      if (!Number.isFinite(stop.longitude) || stop.longitude < -180 || stop.longitude > 180) {
        errors.push(`行程站点经度无效：${stop.id}`);
      }
      if (!Number.isFinite(stop.latitude) || stop.latitude < -90 || stop.latitude > 90) {
        errors.push(`行程站点纬度无效：${stop.id}`);
      }
      if (stop.chapter && !isPositiveInteger(stop.chapter.value)) {
        errors.push(`行程站点章节必须为正整数：${stop.id}`);
      }
      for (const personId of stop.personIds) {
        if (!personIds.has(personId)) errors.push(`行程站点引用的人物不存在：${stop.id}`);
      }
      for (const eventId of stop.eventIds) {
        if (!eventIds.has(eventId)) errors.push(`行程站点引用的事件不存在：${stop.id}`);
      }
    }
  }

  return errors;
}

export function getRelationshipLabel(
  relationship: Relationship,
  fromPersonId: string,
  toPersonId: string,
): string {
  const forward =
    fromPersonId === relationship.sourcePersonId &&
    toPersonId === relationship.targetPersonId;
  const reverse =
    fromPersonId === relationship.targetPersonId &&
    toPersonId === relationship.sourcePersonId;

  if (!forward && !reverse) {
    throw new Error("人物不属于该关系");
  }
  if (forward || relationship.symmetric) {
    return relationship.forwardLabel;
  }
  return relationship.reverseLabel ?? "反向关系未定义";
}
