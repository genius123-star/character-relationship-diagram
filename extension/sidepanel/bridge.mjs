export async function startSidePanelBridge({ chromeApi, iframe, status, windowObj }) {
  const showError = (error) => {
    if (!error?.message) return;
    status.textContent = error.message;
    status.style.display = "block";
  };
  const forward = (task) => {
    if (!task?.requestId || !task?.text || task.status !== "pending") return;
    status.style.display = "none";
    iframe.contentWindow.postMessage({
      type: "parse-selection-task",
      requestId: task.requestId,
      text: task.text,
    }, "*");
  };
  const forwardPending = async () => {
    const { parseTask } = await chromeApi.storage.session.get("parseTask");
    forward(parseTask);
  };

  chromeApi.storage.onChanged.addListener((changes, area) => {
    if (area !== "session") return;
    if (changes.parseTask?.newValue) forward(changes.parseTask.newValue);
    if (changes.parseError?.newValue) showError(changes.parseError.newValue);
  });
  iframe.addEventListener("load", forwardPending);
  windowObj.addEventListener("message", (event) => {
    if (event.source !== iframe.contentWindow) return;
    if (event.data?.type === "parse-bridge-ready") void forwardPending();
    if (event.data?.type === "parse-selection-consumed" && typeof event.data.requestId === "string") {
      void chromeApi.storage.session.get("parseTask").then(({ parseTask }) => {
        if (parseTask?.requestId === event.data.requestId) return chromeApi.storage.session.remove("parseTask");
      });
    }
  });

  const { parseTask, parseError } = await chromeApi.storage.session.get(["parseTask", "parseError"]);
  forward(parseTask);
  if (!parseTask) showError(parseError);
}

if (typeof chrome !== "undefined" && typeof document !== "undefined") {
  void startSidePanelBridge({
    chromeApi: chrome,
    iframe: document.getElementById("app"),
    status: document.getElementById("status"),
    windowObj: window,
  });
}
