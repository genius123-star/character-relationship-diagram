import { describe, expect, it, vi } from "vitest";
import { runOpenParserCommand } from "./commandCore.mjs";

describe("runOpenParserCommand", () => {
  it("captures the active selection before storing a task and opening the side panel", async () => {
    const order = [];
    const chromeApi = {
      tabs: {
        query: vi.fn(async () => [{ id: 17, url: "https://weread.qq.com/web/reader" }]),
        sendMessage: vi.fn(async () => { order.push("capture"); return { text: "周云逸召见了钦天监。" }; }),
      },
      storage: { session: { set: vi.fn(async ({ parseTask }) => { order.push("store"); expect(parseTask.text).toBe("周云逸召见了钦天监。"); }) } },
      sidePanel: { open: vi.fn(async () => { order.push("open"); }) },
    };

    const result = await runOpenParserCommand(chromeApi, () => "request-1", () => 123);

    expect(result).toMatchObject({ requestId: "request-1", status: "pending", sourceUrl: "https://weread.qq.com/web/reader" });
    expect(chromeApi.tabs.sendMessage).toHaveBeenCalledWith(17, { type: "capture-selection" });
    expect(order).toEqual(["capture", "store", "open"]);
  });

  it("stores an explicit error instead of silently doing nothing when no text is selected", async () => {
    const chromeApi = {
      tabs: { query: vi.fn(async () => [{ id: 17 }]), sendMessage: vi.fn(async () => ({ text: "" })) },
      storage: { session: { set: vi.fn(async () => undefined) } },
      sidePanel: { open: vi.fn(async () => undefined) },
    };

    await runOpenParserCommand(chromeApi, () => "request-2", () => 456);

    expect(chromeApi.storage.session.set).toHaveBeenCalledWith({
      parseError: { requestId: "request-2", code: "EMPTY_SELECTION", message: "请先在阅读页面划选一句话。", createdAt: 456 },
    });
    expect(chromeApi.sidePanel.open).toHaveBeenCalledWith({ tabId: 17 });
  });
});
