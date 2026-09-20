import { describe, expect, it } from "vitest";
import { createPerson, createProject } from "../model";
import { ruleParser } from "./ruleParser";
import { applyParseResult } from "./applyParseResult";
import type { ParseResult } from "./types";

function confirmAll(result: ParseResult): ParseResult {
  return {
    ...result,
    people: result.people.map((person) => ({ ...person, status: "confirmed" as const })),
    relationships: result.relationships.map((relationship) => ({ ...relationship, status: "confirmed" as const })),
    features: result.features.map((feature) => ({ ...feature, status: "confirmed" as const })),
    locations: result.locations.map((location) => ({ ...location, status: "confirmed" as const })),
    events: result.events.map((event) => ({ ...event, status: "confirmed" as const })),
  };
}

describe("applyParseResult", () => {
  it("writes confirmed people, relationships, features, location and events into a project", () => {
    const project = createProject("在路上", "journey", "folder", "journey");
    const parsed = ruleParser.parse(
      "迪安出了管教所，将首度前来纽约找我，还听说他跟一个叫玛丽露的女孩结婚了",
      { existingPeople: [] },
    );
    const next = applyParseResult(project, confirmAll(parsed));

    expect(next.people.map((person) => person.name).sort()).toEqual(["我", "玛丽露", "迪安"]);
    expect(next.relationships.map((relationship) => relationship.forwardLabel).sort()).toEqual(["夫妻", "朋友"]);

    const dean = next.people.find((person) => person.name === "迪安")!;
    expect(dean.geo?.label).toBe("纽约");
    expect(dean.events.some((event) => event.title === "出了管教所")).toBe(true);
  });

  it("writes confirmed feature tags into the person profile", () => {
    const project = createProject("在路上", "journey", "folder", "journey");
    project.people = [createPerson("玛丽露", "person-mary")];
    const parsed = ruleParser.parse(
      "玛丽露是漂亮的金发妞，满头卷发像一大片金色海洋",
      { existingPeople: [{ id: "person-mary", name: "玛丽露", aliases: [] }] },
    );
    const next = applyParseResult(project, confirmAll(parsed));
    const mary = next.people.find((person) => person.id === "person-mary")!;
    expect(mary.personalityTags.sort()).toEqual(["卷发", "漂亮", "金发"]);
  });

  it("writes only confirmed candidates and merges same-name people", () => {
    const project = createProject("在路上", "journey", "folder", "journey");
    project.people = [createPerson("迪安", "person-dean")];
    const parsed = ruleParser.parse(
      "迪安出了管教所，将首度前来纽约找我，还听说他跟一个叫玛丽露的女孩结婚了",
      { existingPeople: [{ id: "person-dean", name: "迪安", aliases: [] }] },
    );
    // 只确认人物与"夫妻"关系，忽略"朋友"关系。
    const partial = {
      ...parsed,
      people: parsed.people.map((person) => ({ ...person, status: "confirmed" as const })),
      relationships: parsed.relationships.map((relationship) => ({ ...relationship, status: relationship.forwardLabel === "夫妻" ? ("confirmed" as const) : ("rejected" as const) })),
      features: parsed.features.map((feature) => ({ ...feature, status: "confirmed" as const })),
      locations: parsed.locations.map((location) => ({ ...location, status: "confirmed" as const })),
      events: parsed.events.map((event) => ({ ...event, status: "confirmed" as const })),
    };
    const next = applyParseResult(project, partial);

    // 迪安合并到已有节点（不新建），"朋友"关系不写入。
    expect(next.people).toHaveLength(3);
    expect(next.people.some((person) => person.id === "person-dean")).toBe(true);
    expect(next.relationships.map((relationship) => relationship.forwardLabel)).toEqual(["夫妻"]);
  });
});
