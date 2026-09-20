import { describe, expect, it } from "vitest";
import { searchPeople } from "../domain/search";
import { toGraphElements } from "../features/graph/graphProjection";
import { createBenchmarkProject } from "./sampleProject";

describe("benchmark project", () => {
  it("generates a stable 500-person and 3,000-relationship project", () => {
    const first = createBenchmarkProject();
    const second = createBenchmarkProject();

    expect(first.people).toHaveLength(500);
    expect(first.relationships).toHaveLength(3_000);
    expect(first.people.every((person) => person.events.length <= 50)).toBe(true);
    expect(new Set(first.relationships.map((relationship) => relationship.id)).size).toBe(3_000);
    expect(new Set(first.relationships.map((relationship) => relationship.sourcePersonId)).size).toBe(500);
    expect(first).toEqual(second);
  });

  it("meets the in-memory search and projection performance budgets", () => {
    const project = createBenchmarkProject();
    const searchStarted = performance.now();
    expect(searchPeople(project.people, "人物 299")).toHaveLength(1);
    const searchDuration = performance.now() - searchStarted;
    const projectionStarted = performance.now();
    expect(toGraphElements(project)).toHaveLength(3_500);
    const projectionDuration = performance.now() - projectionStarted;

    expect(searchDuration).toBeLessThan(300);
    expect(projectionDuration).toBeLessThan(1_000);
  });
});
