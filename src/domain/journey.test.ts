import { describe, expect, it } from "vitest";
import { createPerson, createProject, createRelationship } from "./model";
import { crossStopRelationships, isStopReached, sortedStops, stopEvents, stopPeople } from "./journey";

function journeyProject() {
  const project = createProject("在路上", "journey", "folder", "journey");
  const sal = createPerson("萨尔", "person-sal");
  const dean = createPerson("迪安", "person-dean");
  const carla = createPerson("卡米尔", "person-carla");
  const mary = createPerson("玛丽卢", "person-mary");
  const bob = createPerson("鲍勃", "person-bob");
  sal.events = [
    { id: "event-denver", title: "抵达丹佛", position: { kind: "chapter", value: 5 } },
    { id: "event-chicago", title: "抵达芝加哥", position: { kind: "chapter", value: 3 } },
    { id: "event-unsorted", title: "无章节事件" },
  ];
  project.people = [sal, dean, carla, mary, bob];
  project.relationships = [
    createRelationship({ id: "rel-inner", sourcePersonId: "person-sal", targetPersonId: "person-bob", forwardLabel: "同行", symmetric: true }),
    createRelationship({ id: "rel-travel", sourcePersonId: "person-sal", targetPersonId: "person-dean", forwardLabel: "重逢", symmetric: true }),
    createRelationship({ id: "rel-cross", sourcePersonId: "person-carla", targetPersonId: "person-mary", forwardLabel: "重逢", symmetric: true }),
  ];
  project.journey = {
    stops: [
      { id: "stop-ny", label: "纽约", longitude: -74.006, latitude: 40.7128, chapter: { kind: "chapter", value: 1 }, personIds: ["person-sal", "person-dean", "person-carla", "person-bob"], eventIds: [], },
      { id: "stop-chicago", label: "芝加哥", longitude: -87.6298, latitude: 41.8781, chapter: { kind: "chapter", value: 3 }, personIds: ["person-sal", "person-bob"], eventIds: ["event-chicago", "event-unsorted"], },
      { id: "stop-denver", label: "丹佛", longitude: -104.9903, latitude: 39.7392, chapter: { kind: "chapter", value: 5 }, personIds: ["person-mary"], eventIds: ["event-denver"], },
      { id: "stop-loose", label: "未定站", longitude: 0, latitude: 0, personIds: [], eventIds: [], },
    ],
  };
  return project;
}

describe("journey domain", () => {
  it("sorts stops by chapter and keeps chapter-less stops last", () => {
    const project = journeyProject();
    expect(sortedStops(project).map((stop) => stop.label)).toEqual(["纽约", "芝加哥", "丹佛", "未定站"]);
  });

  it("treats chapter-less stops as always reached", () => {
    const project = journeyProject();
    const stops = sortedStops(project);
    expect(isStopReached(stops[0], 2)).toBe(true); // 纽约 第 1 章
    expect(isStopReached(stops[1], 2)).toBe(false); // 芝加哥 第 3 章
    expect(isStopReached(stops[3], 2)).toBe(true); // 无章节
  });

  it("derives stop people and events sorted by chapter", () => {
    const project = journeyProject();
    const stops = sortedStops(project);
    const chicago = stops[1];
    expect(stopPeople(project, chicago).map((person) => person.name)).toEqual(["萨尔", "鲍勃"]);
    expect(stopEvents(project, chicago).map((event) => event.title)).toEqual(["抵达芝加哥", "无章节事件"]);
    expect(stopEvents(project, stops[2]).map((event) => event.title)).toEqual(["抵达丹佛"]);
  });

  it("detects relationships that connect different stops", () => {
    const project = journeyProject();
    // rel-inner 两端站点集合相同（站内）；rel-travel 萨尔多站而迪安仅在纽约（跨站）；
    // rel-cross 连接纽约的卡米尔与丹佛的玛丽卢（跨站）。
    const cross = crossStopRelationships(project, sortedStops(project));
    expect(cross.map((relationship) => relationship.id)).toEqual(["rel-travel", "rel-cross"]);
  });
});
