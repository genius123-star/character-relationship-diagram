import { describe, expect, it, vi } from "vitest";
import { startSidePanelBridge } from "./bridge.mjs";

describe("startSidePanelBridge", () => {
  it("forwards the pending task to the application iframe", async () => {
    const postMessage = vi.fn();
    const iframe = { contentWindow: { postMessage }, addEventListener: vi.fn() };
    const status = { style: {}, textContent: "" };
    const parseTask = { requestId: "request-1", text: "周云逸召见了钦天监。", status: "pending" };
    const chromeApi = {
      storage: {
        session: { get: vi.fn(async () => ({ parseTask })) },
        onChanged: { addListener: vi.fn() },
      },
    };
    const windowObj = { addEventListener: vi.fn() };

    await startSidePanelBridge({ chromeApi, iframe, status, windowObj });

    expect(postMessage).toHaveBeenCalledWith({
      type: "parse-selection-task",
      requestId: "request-1",
      text: "周云逸召见了钦天监。",
    }, "*");
  });
});
