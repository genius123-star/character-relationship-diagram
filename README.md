# 人物关系图谱

一个本地优先的人物关系整理工具，适用于小说阅读、研究资料整理和个人关系记录。用户可以建立人物节点、编辑关系和资料、计算跨节点关系、按阅读进度观察图谱，并将项目导出为可恢复的 JSON 或可分享的 PNG、JPG、PDF。

当前仓库是 Web 核心与交互验证环境。最终目标是复用同一套领域模型、搜索、推理和导入导出能力，制作可在阅读、研究或游戏过程中快速唤起的轻量插件。

## 主要能力

- 人物、关系、事件与可排序资料块管理
- 四种关系类型与右键可视化连线
- 搜索定位、最短路径和亲属称谓推理
- 章节进度观察、颜色归类和预览模式
- 节点布局、固定、碰撞避让与本地自动保存
- JSON 完整备份与原子恢复
- PNG、JPG、PDF 完整关系图导出
- 地理图：MapLibre 连续地图内核、语义比例尺、人物/关系覆盖物与离线轮廓回退

## 技术栈

- React、TypeScript、Vite
- Cytoscape.js 图谱渲染
- MapLibre GL（懒加载）+ OpenFreeMap 矢量瓦片（地理图底图）
- 浏览器 IndexedDB 本地存储
- Vitest、React Testing Library、Playwright

应用不需要服务端、账号或环境变量，项目和头像默认只保存在当前浏览器。地理图底图瓦片按视口联网加载（© OpenFreeMap），断网时回退到内置世界轮廓；用户人物/关系/地点确认始终本地保存。底图数据与许可证记录见 `docs/06-地图数据与许可证.md`。

## 环境要求

- Node.js `>= 24.14.0`
- npm（锁文件由 npm 维护）
- Chromium，用于 Playwright 端到端测试

## 本地启动

```powershell
npm install
npm run dev
```

Vite 会在终端打印实际访问地址。默认通常是 `http://localhost:5173/`；端口被占用时会自动变化，应以终端输出为准。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run lint` | 执行 ESLint |
| `npm run typecheck` | 执行 TypeScript 检查 |
| `npm test` | 执行单元与组件测试 |
| `npm run test:e2e` | 启动真实 Chromium 执行端到端测试 |
| `npm run build` | 生成 `dist/` 生产构建 |

当前 Windows 环境中，全量并行 Vitest 偶发挂起时使用：

```powershell
npx vitest run --maxWorkers=1 --no-file-parallelism
```

Playwright 浏览器尚未安装时运行：

```powershell
npx playwright install chromium
```

## 数据存储与备份

应用使用浏览器 IndexedDB 数据库 `character-graph`：

- `projects` 保存项目文档、人物、关系、事件、分类和布局。
- `assets` 保存头像 Blob，并通过 `projectId` 归属项目。

浏览器清理站点数据、重装浏览器或更换设备都可能使本地数据不可用。重要项目应定期在工作区选择“导出项目 → JSON 完整备份”。恢复时回到项目首页，选择“导入项目”并打开 `.json` 文件。

JSON 导入有 50 MB 上限，会检查格式版本、必填字段、实体引用、危险键和头像数据。所有校验通过后，项目与头像才会在一个 IndexedDB 事务中写入；失败不会覆盖现有项目。

PNG、JPG 和 PDF 只用于分享或打印，不能重新导入继续编辑。它们导出完整图谱，不受当前画布缩放和平移影响。

## 浏览器扩展（划句解析）

阅读网页时划选句子，通过浏览器扩展侧边栏自动解析人物关系、地理位置与人物特征，写入当前项目。

### 安装（开发者模式）

1. 构建扩展：`npm run build:extension`（产物在 `extension/dist`）。
2. 打开 `chrome://extensions`，开启"开发者模式"，点击"加载已解压的扩展程序"，选择 `extension/dist` 目录。
3. 侧边栏默认嵌入 `http://127.0.0.1:5173/`（开发地址）；生产部署后把 `extension/sidepanel/index.html` 中 iframe 的 `src` 改为部署地址，重新打包。

### 使用

- 在任意网页用鼠标划选一句或多句文本，点击扩展图标（或按 `Ctrl+Shift+P`）打开侧边栏；句子会自动填入解析面板。
- 点击"解析句子"查看候选（人物/关系/特征/地点/事件），逐项勾选或"一键全确认"后"写入项目"。
- 侧边栏与网页端访问同一地址，使用同一本地数据库，数据互通；解析结果只在本地处理（规则引擎），不发送任何外部服务。

## 项目结构

```text
src/
├─ app/                 应用入口与项目级编排
├─ domain/              数据模型、命令、搜索、路径与关系推理
├─ features/graph/      工作区、Cytoscape 画布与图像导出
├─ features/projects/   项目首页
├─ storage/             IndexedDB、自动保存和 JSON 交换
├─ styles/              全局样式与设计变量
└─ test/                测试环境和 500/3,000 基准生成器
e2e/                    Playwright 主流程、验收与性能测试
docs/                   PRD、技术设计、实施计划和交接文档
```

核心数据流：

```text
用户操作 → React 工作区 → 项目数据更新 → 图谱派生 → IndexedDB 自动保存
```

Cytoscape 元素只是 `ProjectDocument` 的显示投影；人物和关系的真实数据不能只写入画布实例。

## 性能基准

`src/test/sampleProject.ts` 会确定性生成：

- 500 个人物
- 3,000 条合法关系
- 每人 0–50 个事件

发布门槛为项目打开不超过 3 秒、搜索响应不超过 300 ms。自动化测试不会污染用户项目；项目首页另有“创建性能基准项目”入口供人工审核。首次点击会把同一份基准数据写入 IndexedDB 并直接打开，再次点击会打开已有基准项目，因此拖动和编辑结果不会自动重置。该项目可从首页正常删除。

## 发布前检查

```powershell
npm run lint
npm run typecheck
npx vitest run --maxWorkers=1 --no-file-parallelism
npm run test:e2e
npm run build
npm audit --audit-level=high
```

数据丢失、悬空关系、导入产生半成品、节点拖动不持久化、500/3,000 基准超时均属于发布阻断问题。

## 已知限制

- 当前没有账号、云同步或多人协作。
- AI 全文人物抽取、旅行叙事、势力范围与浏览器插件宿主属于后续阶段。
- 主 JS 包仍超过 Vite 的 500 kB 警告线；MapLibre 已按需动态分包，插件化前还需进一步按工作区拆分。
- 亲属称谓规则覆盖常见关系，不是完整民俗称谓百科；信息不足或规则冲突时会显示候选与推导链，不擅自选择。
- 地理图底图瓦片需要联网（OpenFreeMap），完全离线时只显示内置世界轮廓；不提供卫星影像、等高线、道路、建筑或 POI。

更完整的产品范围、架构和后续路线见 [产品需求文档](docs/02-产品需求文档.md)、[技术设计文档](docs/03-技术设计文档.md) 和 [实施计划](docs/04-实施计划.md)。
