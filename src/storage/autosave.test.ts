import { afterEach, describe, expect, it, vi } from "vitest";
import { createProject } from "../domain/model";
import { createAutosaveController, type SaveStatus } from "./autosave";

describe("autosave controller", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces changes and saves only the latest project", async () => {
    vi.useFakeTimers();
    const savedNames: string[] = [];
    const statuses: SaveStatus[] = [];
    const controller = createAutosaveController({
      save: async (project) => {
        savedNames.push(project.name);
      },
      onStatusChange: (status) => statuses.push(status),
    });
    const first = createProject("第一次修改", "project-1");
    const second = { ...first, name: "第二次修改" };

    controller.schedule(first);
    controller.schedule(second);
    await vi.advanceTimersByTimeAsync(300);

    expect(savedNames).toEqual(["第二次修改"]);
    expect(statuses).toEqual(["saving", "saved"]);
  });

  it("flushes a pending change immediately", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => undefined);
    const controller = createAutosaveController({ save });
    const project = createProject("立即保存", "project-1");

    controller.schedule(project);
    await controller.flush();

    expect(save).toHaveBeenCalledWith(project);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports save failures instead of swallowing them", async () => {
    vi.useFakeTimers();
    const statuses: SaveStatus[] = [];
    const controller = createAutosaveController({
      save: async () => Promise.reject(new Error("容量不足")),
      onStatusChange: (status) => statuses.push(status),
    });

    controller.schedule(createProject("失败项目", "project-1"));
    await vi.advanceTimersByTimeAsync(300);

    expect(statuses).toEqual(["saving", "failed"]);
  });
});
