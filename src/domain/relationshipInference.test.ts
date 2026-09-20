import { describe, expect, it } from "vitest";
import { createPerson, createRelationship } from "./model";
import { inferRelationship, summarizeRelationshipInferences } from "./relationshipInference";

describe("inferRelationship", () => {
  const people = [createPerson("我", "me"), createPerson("爸爸", "father"), createPerson("爷爷", "grandfather"), createPerson("爷爷的二儿子", "uncle")];

  it("infers a kinship title and returns an inspectable chain", () => {
    const relationships = [
      createRelationship({ id: "father-me", sourcePersonId: "father", targetPersonId: "me", forwardLabel: "爸爸", reverseLabel: "孩子" }),
      createRelationship({ id: "grandfather-father", sourcePersonId: "grandfather", targetPersonId: "father", forwardLabel: "爸爸", reverseLabel: "大儿子" }),
      createRelationship({ id: "uncle-grandfather", sourcePersonId: "uncle", targetPersonId: "grandfather", forwardLabel: "二儿子", reverseLabel: "爸爸" }),
    ];
    expect(inferRelationship(people, relationships, { personIds: ["me", "father", "grandfather", "uncle"], relationshipIds: ["father-me", "grandfather-father", "uncle-grandfather"] })).toEqual({
      status: "determined",
      result: "二叔",
      chain: ["爸爸是我的爸爸", "爷爷是爸爸的爸爸", "爷爷的二儿子是爷爷的二儿子"],
      labels: ["爸爸", "爸爸", "二儿子"],
    });
  });

  it("does not force an answer from non-kinship or missing reverse labels", () => {
    const relationships = [createRelationship({ id: "friend", sourcePersonId: "me", targetPersonId: "father", forwardLabel: "朋友" })];
    expect(inferRelationship(people, relationships, { personIds: ["me", "father"], relationshipIds: ["friend"] })).toEqual({
      status: "unknown",
      result: "暂无法确定称谓",
      chain: ["缺少‘爸爸’相对于‘我’的反向称谓"],
      labels: [],
      reason: "关系方向信息不足",
    });
  });

  it("keeps conflicting results as candidates instead of choosing one", () => {
    expect(summarizeRelationshipInferences([
      { status: "determined", result: "叔叔", chain: ["路径一"], labels: ["爸爸", "弟弟"] },
      { status: "determined", result: "舅舅", chain: ["路径二"], labels: ["妈妈", "弟弟"] },
    ])).toEqual({ status: "conflict", candidates: [
      { result: "叔叔", chain: ["路径一"] },
      { result: "舅舅", chain: ["路径二"] },
    ] });
  });

  it("merges equivalent candidate results", () => {
    expect(summarizeRelationshipInferences([
      { status: "determined", result: "叔叔", chain: ["路径一"], labels: ["爸爸", "弟弟"] },
      { status: "determined", result: "叔叔", chain: ["路径二"], labels: ["爸爸", "弟弟"] },
    ])).toEqual({ status: "determined", result: "叔叔", chains: [["路径一"], ["路径二"]] });
  });

  it.each([
    [["父亲", "哥哥"], "伯父"],
    [["父亲", "妹妹"], "姑姑"],
    [["母亲", "弟弟"], "舅舅"],
    [["母亲", "姐姐"], "姨妈"],
    [["哥哥", "儿子"], "侄子"],
    [["妹妹", "女儿"], "外甥女"],
    [["儿子", "儿子"], "孙子"],
    [["女儿", "女儿"], "外孙女"],
  ])("covers common kinship composition %j as %s", (labels, expected) => {
    const pathPeople = labels.map((_, index) => createPerson(`人物${index}`, `p${index}`));
    pathPeople.push(createPerson("终点", `p${labels.length}`));
    const relationships = labels.map((label, index) => createRelationship({
      id: `r${index}`,
      sourcePersonId: `p${index + 1}`,
      targetPersonId: `p${index}`,
      forwardLabel: label,
    }));
    const result = inferRelationship(pathPeople, relationships, {
      personIds: pathPeople.map((person) => person.id),
      relationshipIds: relationships.map((relationship) => relationship.id),
    });
    expect(result.result).toBe(expected);
    expect(result.status).toBe("determined");
  });

  it("keeps ambiguous kinship labels undetermined", () => {
    const relationships = [
      createRelationship({ id: "parent", sourcePersonId: "father", targetPersonId: "me", forwardLabel: "父亲" }),
      createRelationship({ id: "sibling", sourcePersonId: "uncle", targetPersonId: "father", forwardLabel: "兄弟" }),
    ];
    const result = inferRelationship(people, relationships, { personIds: ["me", "father", "uncle"], relationshipIds: ["parent", "sibling"] });
    expect(result.status).toBe("unknown");
    expect(result.reason).toContain("信息不足");
  });
});
