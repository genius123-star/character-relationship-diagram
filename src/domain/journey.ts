import type { JourneyStop, Person, PersonEvent, ProjectDocument, Relationship } from "./model";

// 站点按章节排序：有章节的按 value 升序，无章节的保持原顺序排在最后。
export function sortedStops(project: ProjectDocument): JourneyStop[] {
  const stops = project.journey?.stops ?? [];
  const withChapter = stops.filter((stop) => stop.chapter).sort((a, b) => a.chapter!.value - b.chapter!.value);
  const withoutChapter = stops.filter((stop) => !stop.chapter);
  return [...withChapter, ...withoutChapter];
}

// 当前观察章节是否已到达该站点：未填写章节的站点始终视为已到达。
export function isStopReached(stop: JourneyStop, chapter: number): boolean {
  return !stop.chapter || stop.chapter.value <= chapter;
}

// 站内人物（按 stop.personIds 从项目人物派生）。
export function stopPeople(project: ProjectDocument, stop: JourneyStop): Person[] {
  const ids = new Set(stop.personIds);
  return project.people.filter((person) => ids.has(person.id));
}

// 站内事件（按 stop.eventIds 从各人物事件展开，按章节升序，无章节的排最后）。
export function stopEvents(project: ProjectDocument, stop: JourneyStop): PersonEvent[] {
  const ids = new Set(stop.eventIds);
  const events = project.people.flatMap((person) => person.events).filter((event) => ids.has(event.id));
  return [...events].sort((a, b) => {
    const ac = a.position?.value ?? Number.MAX_SAFE_INTEGER;
    const bc = b.position?.value ?? Number.MAX_SAFE_INTEGER;
    return ac - bc;
  });
}

// 跨站关系：两端人物的站点集合不同（一端在某站而另一端不在，即该关系把不同站点连起来）。
// 例如"迪安在纽约与丹佛、萨尔只在纽约"的同行关系：在丹佛视角连接了丹佛与纽约。
export function crossStopRelationships(project: ProjectDocument, stops: JourneyStop[]): Relationship[] {
  const stopIdsByPerson = new Map<string, Set<string>>();
  for (const stop of stops) {
    for (const personId of stop.personIds) {
      const set = stopIdsByPerson.get(personId) ?? new Set<string>();
      set.add(stop.id);
      stopIdsByPerson.set(personId, set);
    }
  }
  return project.relationships.filter((relationship) => {
    const sourceStops = stopIdsByPerson.get(relationship.sourcePersonId);
    const targetStops = stopIdsByPerson.get(relationship.targetPersonId);
    if (!sourceStops || !targetStops) return false;
    if (sourceStops.size !== targetStops.size) return true;
    for (const stop of sourceStops) if (!targetStops.has(stop)) return true;
    return false;
  });
}
