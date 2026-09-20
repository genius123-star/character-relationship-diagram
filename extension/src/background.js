import { runOpenParserCommand } from "./commandCore.mjs";

// 扩展后台：快捷键触发时先读取当前选区，再保存任务并打开侧边栏。
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-parser") {
    void runOpenParserCommand(chrome);
  }
});
