import { describe, expect, it } from "vitest";
import { createPerson } from "../../domain/model";
import { getVisibleProfileBlocks, moveProfileBlock } from "./profileBlocks";

describe("profile blocks", () => {
  it("shows no optional blocks for a new empty person", () => {
    expect(getVisibleProfileBlocks(createPerson("新人物"))).toEqual([]);
  });

  it("keeps legacy populated fields visible without an explicit order", () => {
    const person = { ...createPerson("旧人物"), aliases: ["昵称"], summary: "简介", events: [{ id: "event-1", title: "事件" }] };
    expect(getVisibleProfileBlocks(person)).toEqual(["aliases", "summary", "events"]);
  });

  it("moves a block while preserving all other blocks", () => {
    expect(moveProfileBlock(["aliases", "summary", "notes"], "summary", -1)).toEqual(["summary", "aliases", "notes"]);
  });
});
