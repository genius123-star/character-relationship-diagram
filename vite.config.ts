import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages 的项目站点位于 /character-relationship-diagram/，而本地开发仍使用根路径。
  base: process.env.GITHUB_ACTIONS ? "/character-relationship-diagram/" : "/",
  plugins: [react()],
  optimizeDeps: {
    // MapLibre 动态 import 了 maplibre-gl-worker.mjs（ESM 模块 worker）。
    // 排除它，让 Vite 按原样从 dist 加载，避免注入 @vite/client 到 worker 中。
    // 同时，worker 的 import.meta.url 指向原 dist 路径，其相对 import 的 shared 模块
    // 与主 bundle 共用同一份实例，确保 worker 主线程通信正常。
    exclude: ["maplibre-gl", "pmtiles"],
  },
  worker: {
    format: "es",
  },
});
