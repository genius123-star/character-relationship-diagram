// 快捷键触发时同步读取选区；必须在打开侧边栏前完成，避免焦点切换清空选区。
function readSelection() {
  const selection = window.getSelection();
  return selection ? selection.toString().trim() : "";
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "capture-selection") return false;
  sendResponse({ text: readSelection() });
  return false;
});
