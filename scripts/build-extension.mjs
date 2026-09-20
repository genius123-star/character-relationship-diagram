// 打包浏览器扩展：把 manifest、content script、background 与 sidepanel 复制到 extension/dist。
// 网页端 dist 不复制进扩展（侧边栏通过 iframe 加载同一部署地址，数据同源共享）。
import { cpSync, mkdirSync, rmSync } from "node:fs";

const dist = "extension/dist";
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
mkdirSync(`${dist}/sidepanel`, { recursive: true });

cpSync("extension/manifest.json", `${dist}/manifest.json`);
cpSync("extension/src/background.js", `${dist}/background.js`);
cpSync("extension/src/commandCore.mjs", `${dist}/commandCore.mjs`);
cpSync("extension/src/contentScript.js", `${dist}/contentScript.js`);
cpSync("extension/sidepanel/index.html", `${dist}/sidepanel/index.html`);
cpSync("extension/sidepanel/bridge.mjs", `${dist}/sidepanel/bridge.mjs`);

console.log("扩展已打包到 extension/dist，可在 chrome://extensions 以开发者模式加载。");
