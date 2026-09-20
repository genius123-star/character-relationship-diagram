export async function runOpenParserCommand(chromeApi, createId = () => crypto.randomUUID(), now = () => Date.now()) {
  const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return undefined;

  const requestId = createId();
  try {
    const response = await chromeApi.tabs.sendMessage(tab.id, { type: "capture-selection" });
    const text = typeof response?.text === "string" ? response.text.trim() : "";
    if (!text) {
      await chromeApi.storage.session.set({
        parseError: { requestId, code: "EMPTY_SELECTION", message: "请先在阅读页面划选一句话。", createdAt: now() },
      });
      await chromeApi.sidePanel.open({ tabId: tab.id });
      return undefined;
    }
    const task = { requestId, text, sourceUrl: tab.url ?? "", createdAt: now(), status: "pending" };
    await chromeApi.storage.session.set({ parseTask: task, parseError: null });
    await chromeApi.sidePanel.open({ tabId: tab.id });
    return task;
  } catch {
    await chromeApi.storage.session.set({
      parseError: { requestId, code: "CAPTURE_UNAVAILABLE", message: "当前页面无法读取划选内容，请切回普通阅读网页后重试。", createdAt: now() },
    });
    await chromeApi.sidePanel.open({ tabId: tab.id });
    return undefined;
  }
}
