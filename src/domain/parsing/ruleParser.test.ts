import { describe, expect, it } from "vitest";
import { ruleParser } from "./ruleParser";

describe("RuleSentenceParser", () => {
  it("parses the first example sentence into people, relationships, location and events", () => {
    const result = ruleParser.parse(
      "迪安出了管教所，将首度前来纽约找我，还听说他跟一个叫玛丽露的女孩结婚了",
      { existingPeople: [] },
    );

    expect(result.people.map((person) => person.name)).toEqual(["迪安", "我", "玛丽露"]);
    expect(result.people.find((person) => person.name === "我")?.isNarrator).toBe(true);

    const labels = result.relationships.map((relationship) => relationship.forwardLabel);
    expect(labels).toContain("朋友"); // 迪安 → 我（"找我"）
    expect(labels).toContain("夫妻"); // 迪安 → 玛丽露（"跟…结婚了"，他指迪安）
    const friend = result.relationships.find((relationship) => relationship.forwardLabel === "朋友");
    const spouse = result.relationships.find((relationship) => relationship.forwardLabel === "夫妻");
    expect(friend?.sourcePersonId).toBe(result.people[0].id); // 迪安
    expect(friend?.targetPersonId).toBe(result.people[1].id); // 我
    expect(spouse?.sourcePersonId).toBe(result.people[0].id);
    expect(spouse?.targetPersonId).toBe(result.people[2].id); // 玛丽露

    const newYork = result.locations.find((location) => location.name === "纽约");
    expect(newYork?.peopleIds).toEqual(expect.arrayContaining([result.people[0].id, result.people[1].id]));

    const titles = result.events.map((event) => event.title);
    expect(titles).toContain("出了管教所");
    expect(titles.some((title) => title.includes("前来"))).toBe(true);
  });

  it("parses the second example sentence into features for an existing person", () => {
    const result = ruleParser.parse(
      "玛丽露是漂亮的金发妞，满头卷发像一大片金色海洋",
      { existingPeople: [{ id: "person-mary", name: "玛丽露", aliases: [] }] },
    );

    expect(result.people).toHaveLength(1);
    expect(result.people[0].existingPersonId).toBe("person-mary");
    expect(result.features.map((feature) => feature.tag).sort()).toEqual(["卷发", "漂亮", "金发"]);
    for (const feature of result.features) {
      expect(feature.personId).toBe(result.people[0].id);
      expect(feature.status).toBe("pending");
    }
  });

  it("produces no candidates for a sentence without people or known places", () => {
    const result = ruleParser.parse("窗外的雨下了一整天", { existingPeople: [] });
    expect(result.people).toEqual([]);
    expect(result.relationships).toEqual([]);
    expect(result.locations).toEqual([]);
  });
});
