import { describe, expect, it } from "vitest";
import { createPerson } from "./model";
import { searchPeople } from "./search";

describe("searchPeople", () => {
  it("matches names, aliases, profile text, tags and affiliation case-insensitively", () => {
    const person = { ...createPerson("Úrsula", "person-1"), aliases: ["乌尔苏拉"], summary: "家族支柱", personalityTags: ["坚韧"], identityTags: ["母亲"], affiliation: "马孔多" };
    for (const query of ["úRS", "乌尔", "支柱", "坚韧", "母亲", "马孔多"]) expect(searchPeople([person], query)).toEqual([person]);
  });

  it("returns no results for an empty query", () => {
    expect(searchPeople([createPerson("甲")], "  ")).toEqual([]);
  });
});
