import { expect, test, type Page } from "@playwright/test";

// 添加人物并在详情面板设置"地区/势力"（可选首次出场章节），使其可被地点解析匹配。
async function addPerson(page: Page, name: string, affiliation: string, firstAppearance?: number): Promise<void> {
  await page.getByRole("button", { name: "添加人物" }).click();
  await page.getByLabel("人物名称", { exact: true }).fill(name);
  await page.getByRole("button", { name: "保存人物", exact: true }).click();
  await page.getByLabel("选择资料块").selectOption("affiliation");
  await page.getByRole("button", { name: "添加资料块" }).click();
  await page.locator("#profile-affiliation").fill(affiliation);
  if (firstAppearance !== undefined) {
    await page.getByLabel("选择资料块").selectOption("firstAppearance");
    await page.getByRole("button", { name: "添加资料块" }).click();
    await page.locator("#profile-chapter").fill(String(firstAppearance));
  }
  await page.getByRole("button", { name: "保存人物资料" }).click();
  await page.getByRole("button", { name: "关闭详细信息" }).click();
}

// 读取地图实例的相机、投影与覆盖物状态（通过容器上暴露的 __map，与 Cytoscape 的 _cyreg 同理）。
async function mapState(page: Page) {
  return page.locator(".geography-map-container").evaluate((container) => {
    const map = (container as unknown as {
      __map?: {
        getZoom: () => number;
        getProjection: () => { type: unknown };
        getSource: (id: string) => unknown;
        getLayer: (id: string) => unknown;
        getLayoutProperty: (layer: string, prop: string) => unknown;
        style?: { projection?: { transitionState?: number } };
      };
    }).__map;
    if (!map) return null;
    return {
      zoom: map.getZoom(),
      // 投影由 style 顶层 zoom 表达式驱动；渲染状态 transitionState > 0 表示 3D 球。
      projectionExpression: Array.isArray(map.getProjection()?.type),
      projectionType: map.getProjection()?.type,
      globeRendering: (map.style?.projection?.transitionState ?? 0) > 0,
      hasPeopleSource: Boolean(map.getSource("geography-people")),
      hasPeopleLabelLayer: Boolean(map.getLayer("geography-people-label")),
      hasRelationshipsLayer: Boolean(map.getLayer("geography-relationships")),
      hasLegacyBidirectionalLayers: Boolean(map.getLayer("geography-relationships-bidirectional-a")) || Boolean(map.getLayer("geography-relationships-bidirectional-b")),
      hasArrowsLayer: Boolean(map.getLayer("geography-relationship-arrows")),
      hasArrowOverlay: Boolean(container.parentElement?.querySelector(".geography-arrow-overlay")),
      hasPlaceCountryLayer: Boolean(map.getLayer("place-country")),
      hasWaterwayLayer: Boolean(map.getLayer("waterway")),
      graticuleVisibility: map.getLayer("graticule") ? map.getLayoutProperty("graticule", "visibility") : null,
      offlineOutlineVisibility: map.getLayer("offline-outline") ? map.getLayoutProperty("offline-outline", "visibility") : null,
      connectionPreviewVisible: map.getLayer("connection-preview") ? map.getLayoutProperty("connection-preview", "visibility") === "visible" : false,
    };
  });
}

// 某个人物节点的屏幕坐标。
async function personScreenPosition(page: Page, name: string): Promise<{ x: number; y: number }> {
  return page.locator(".geography-map-container").evaluate((container, personName) => {
    const map = (container as unknown as {
      __map?: {
        queryRenderedFeatures: (o: { layers: string[] }) => Array<{ properties?: { name?: string }; geometry: { coordinates: [number, number] } }>;
        project: (c: [number, number]) => { x: number; y: number };
      };
    }).__map;
    const canvas = container.querySelector("canvas");
    if (!map || !canvas) throw new Error("地图不可用");
    const people = map.queryRenderedFeatures({ layers: ["geography-people"] });
    const feature = people.find((p) => p.properties?.name === personName);
    if (!feature) throw new Error(`人物 ${personName} 不在视口`);
    const rect = canvas.getBoundingClientRect();
    const point = map.project(feature.geometry.coordinates);
    return { x: rect.x + point.x, y: rect.y + point.y };
  }, name);
}

// 关系箭头 source 中的箭头数量（directed 1 个、bidirectional 2 个、其余 0 个）。
// 用 querySourceFeatures 验证数据层：kind 变化后 setData 会实时更新箭头数据。
async function arrowCount(page: Page): Promise<number> {
  return page.locator(".geography-arrow-overlay polygon").count();
}

// 地理图 E2E：真实 Chromium + WebGL 下验证 3D 地球↔平面切换、连续相机、
// 人物/关系覆盖物、点击交互与右键连线预览。
test("renders a 3D globe then switches to a plane with matched people and connections", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "＋ 新建文件夹" }).click();
  await page.getByLabel("文件夹名称").fill("在路上");
  await page.getByRole("button", { name: "创建文件夹" }).click();
  await expect(page.getByRole("heading", { name: "在路上" })).toBeVisible();
  await page.getByRole("button", { name: "＋ 在此文件夹新建图谱" }).click();
  await page.getByLabel("图谱名称").fill("美国西行");
  await page.getByLabel("图谱类型").selectOption("geography");
  await page.getByRole("button", { name: "创建并打开" }).click();

  // 地图容器挂载；MapLibre 内核懒加载后就绪。
  await expect(page.locator(".geography-map-container canvas")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".map-load-state")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText("© OpenFreeMap")).toBeVisible({ timeout: 20_000 });

  // 初始为 3D 地球（全球档）：投影是 style 级 zoom 表达式，渲染状态为 globe，语义比例尺为"全球"。
  await expect
    .poll(async () => (await mapState(page))?.projectionExpression, { timeout: 20_000 })
    .toBe(true);
  await expect
    .poll(async () => (await mapState(page))?.globeRendering, { timeout: 20_000 })
    .toBe(true);
  await expect(page.getByText("全球比例尺")).toBeVisible({ timeout: 10_000 });

  // 放大进入国家档（zoom 4，越过 2.6–3.4 过渡区间）后切换为平面 mercator，并显示经纬网。
  await page.locator(".geography-map-container").evaluate((container) => {
    const map = (container as unknown as { __map?: { flyTo: (o: { center: number[]; zoom: number; duration: number }) => void } }).__map;
    map?.flyTo({ center: [104, 35], zoom: 4, duration: 0 });
  });
  await expect
    .poll(async () => (await mapState(page))?.globeRendering, { timeout: 10_000 })
    .toBe(false);
  await expect
    .poll(async () => (await mapState(page))?.graticuleVisibility, { timeout: 10_000 })
    .toBe("visible");

  // 放大到平面后缩回全球档：应平滑回到 3D 球体（回归验证"回不去球体"已修复）。
  await page.locator(".geography-map-container").evaluate((container) => {
    const map = (container as unknown as { __map?: { flyTo: (o: { center: number[]; zoom: number; duration: number }) => void } }).__map;
    map?.flyTo({ center: [104, 35], zoom: 0.8, duration: 0 });
  });
  await expect
    .poll(async () => (await mapState(page))?.globeRendering, { timeout: 10_000 })
    .toBe(true);
  await expect(page.getByText("全球比例尺")).toBeVisible({ timeout: 10_000 });

  // 添加两个已知地点人物并设置地区/势力。
  await addPerson(page, "迪安", "旧金山");
  await addPerson(page, "萨尔", "内华达州");
  await expect(page.getByText("已匹配 2")).toBeVisible({ timeout: 20_000 });

  // 覆盖物：人物 source + 首字标签 layer 应已加入地图。
  await expect
    .poll(async () => (await mapState(page))?.hasPeopleSource, { timeout: 20_000 })
    .toBe(true);
  await expect
    .poll(async () => (await mapState(page))?.hasPeopleLabelLayer, { timeout: 20_000 })
    .toBe(true);
  // 关系箭头层（directed/bidirectional 符号）与补全的底图图层已加入。
  await expect
    .poll(async () => (await mapState(page))?.hasArrowOverlay, { timeout: 20_000 })
    .toBe(true);
  await expect
    .poll(async () => (await mapState(page))?.hasLegacyBidirectionalLayers, { timeout: 20_000 })
    .toBe(false);
  await expect
    .poll(async () => (await mapState(page))?.hasPlaceCountryLayer, { timeout: 20_000 })
    .toBe(true);
  await expect
    .poll(async () => (await mapState(page))?.hasWaterwayLayer, { timeout: 20_000 })
    .toBe(true);

  // "适应全部节点"调用 fitBounds，zoom 应进入洲际+（两节点横跨美国）。
  await page.getByRole("button", { name: "适应全部节点" }).click();
  await expect
    .poll(async () => (await mapState(page))?.zoom ?? 0, { timeout: 10_000 })
    .toBeGreaterThan(2);

  // 语义比例尺只读 zoom 派生（洲际/国家/地区）。
  await expect(page.getByText(/洲际|国家|地区或省州/)).toBeVisible({ timeout: 10_000 });
});

// 右键连线预览：右键起点 → 出现跟随鼠标的预览线 → 右键终点 → 建立关系并清除预览。
test("creates a relationship with a right-click connection preview", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "＋ 新建文件夹" }).click();
  await page.getByLabel("文件夹名称").fill("连线");
  await page.getByRole("button", { name: "创建文件夹" }).click();
  await expect(page.getByRole("heading", { name: "连线" })).toBeVisible();
  await page.getByRole("button", { name: "＋ 在此文件夹新建图谱" }).click();
  await page.getByLabel("图谱名称").fill("连线图");
  await page.getByLabel("图谱类型").selectOption("geography");
  await page.getByRole("button", { name: "创建并打开" }).click();

  await expect(page.locator(".geography-map-container canvas")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".map-load-state")).toHaveCount(0, { timeout: 20_000 });

  // 添加两个不同地点人物，并适应全部节点使两者都在视口内。
  await addPerson(page, "迪安", "旧金山");
  await addPerson(page, "萨尔", "内华达州");
  await expect(page.getByText("已匹配 2")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "适应全部节点" }).click();
  await expect(page.getByText(/洲际|国家|地区或省州/)).toBeVisible({ timeout: 10_000 });

  // 右键起点迪安：预览层应出现，并显示连线提示。
  const start = await personScreenPosition(page, "迪安");
  const target = await personScreenPosition(page, "萨尔");
  await page.mouse.click(start.x, start.y, { button: "right" });
  await expect(page.getByText("右键起点 → 移动鼠标 → 右键终点完成连线")).toBeVisible({ timeout: 5_000 });
  await expect
    .poll(async () => (await mapState(page))?.connectionPreviewVisible, { timeout: 5_000 })
    .toBe(true);

  // 移动鼠标到终点附近：预览线持续可见。
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await expect
    .poll(async () => (await mapState(page))?.connectionPreviewVisible, { timeout: 5_000 })
    .toBe(true);

  // 右键终点萨尔：建立关系，连线数从 0 → 1，预览隐藏。
  await page.mouse.click(target.x, target.y, { button: "right" });
  await expect(page.getByText("2 个人物 · 1 条关系")).toBeVisible({ timeout: 5_000 });
  await expect
    .poll(async () => (await mapState(page))?.connectionPreviewVisible, { timeout: 5_000 })
    .toBe(false);
  await expect(page.getByText(/右键起点/)).toHaveCount(0);

  // 默认单向关系：线上应只有 1 个指向终点的箭头。
  await expect.poll(() => arrowCount(page), { timeout: 5_000 }).toBe(1);
  await expect(page.locator(".geography-arrow-overlay polygon")).toHaveCount(1);

  // 点击关系线打开详情，把类型改为双向后保存：箭头应变为 2 个。
  const midpoint = await page.locator(".geography-map-container").evaluate((container) => {
    const map = (container as unknown as {
      __map?: { project: (c: [number, number]) => { x: number; y: number } };
    }).__map;
    const canvas = container.querySelector("canvas");
    if (!map || !canvas) throw new Error("地图不可用");
    const p1 = map.project([-122.4194, 37.7749]);
    const p2 = map.project([-116.4194, 38.8026]);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.x + (p1.x + p2.x) / 2, y: rect.y + (p1.y + p2.y) / 2 };
  });
  await page.mouse.click(midpoint.x, midpoint.y);
  await expect(page.getByLabel("编辑关系类型")).toBeVisible({ timeout: 5_000 });
  await page.getByLabel("编辑关系类型").selectOption("bidirectional");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect.poll(() => arrowCount(page), { timeout: 5_000 }).toBe(2);
});

// 网络地理编码：唯一结果自动落点；同名歧义列出候选，用户确认后写回人物坐标。
test("resolves network geocoding with unique result and ambiguous candidates", async ({ page }) => {
  await page.route("**://api.mirror-earth.com/nominatim/**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q") ?? "";
    if (query.includes("马德里")) {
      await route.fulfill({ json: [{ display_name: "马德里, Comunidad de Madrid, España", lon: "-3.7038", lat: "40.4168", address: { country_code: "es" } }] });
    } else {
      await route.fulfill({ json: [
        { display_name: "华盛顿, 哥伦比亚特区, 美国", lon: "-77.0369", lat: "38.9072", address: { country_code: "us" } },
        { display_name: "华盛顿州, 美国", lon: "-120.5", lat: "47.0", address: { country_code: "us" } },
      ] });
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "＋ 新建文件夹" }).click();
  await page.getByLabel("文件夹名称").fill("解析");
  await page.getByRole("button", { name: "创建文件夹" }).click();
  await page.getByRole("button", { name: "＋ 在此文件夹新建图谱" }).click();
  await page.getByLabel("图谱名称").fill("解析图");
  await page.getByLabel("图谱类型").selectOption("geography");
  await page.getByRole("button", { name: "创建并打开" }).click();
  await expect(page.locator(".geography-map-container canvas")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".map-load-state")).toHaveCount(0, { timeout: 20_000 });

  // 唯一结果（马德里）：自动落点，无需人工确认。
  await addPerson(page, "主角", "马德里");
  await expect(page.getByText("已匹配 1")).toBeVisible({ timeout: 20_000 });

  // 歧义结果（华盛顿）：进入待匹配托盘并展示候选，不会被擅自放置。
  await addPerson(page, "议长", "华盛顿");
  await expect(page.getByText("位置待匹配（1）")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("华盛顿, 哥伦比亚特区, 美国")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("已匹配 1")).toBeVisible();

  // 用户确认候选后落点并移出托盘。
  await page.getByRole("button", { name: /华盛顿, 哥伦比亚特区/ }).click();
  await expect(page.getByText("已匹配 2")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("位置待匹配（1）")).toHaveCount(0);
});

// 观察进度：未来章节人物与关系淡化；搜索定位把视野适配到所选人物。
test("dims future people with observation progress and focuses search results", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "＋ 新建文件夹" }).click();
  await page.getByLabel("文件夹名称").fill("进度");
  await page.getByRole("button", { name: "创建文件夹" }).click();
  await page.getByRole("button", { name: "＋ 在此文件夹新建图谱" }).click();
  await page.getByLabel("图谱名称").fill("进度图");
  await page.getByLabel("图谱类型").selectOption("geography");
  await page.getByRole("button", { name: "创建并打开" }).click();
  await expect(page.locator(".geography-map-container canvas")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".map-load-state")).toHaveCount(0, { timeout: 20_000 });

  await addPerson(page, "迪安", "旧金山", 5);
  await addPerson(page, "萨尔", "内华达州", 1);
  await expect(page.getByText("已匹配 2")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "适应全部节点" }).click();
  await expect(page.getByText(/洲际|国家|地区或省州/)).toBeVisible({ timeout: 10_000 });

  // 开启观察进度（当前章节 1）：迪安（第 5 章出场）淡化，萨尔（第 1 章）正常。
  await page.getByRole("button", { name: "打开阅读进度" }).click();
  await page.getByRole("checkbox", { name: "匹配当前阅读进度" }).check();
  await expect.poll(() => page.locator(".geography-map-container").evaluate((container) => {
    const map = (container as unknown as {
      __map?: { queryRenderedFeatures: (o: { layers: string[] }) => Array<{ properties?: { name?: string; future?: boolean } }> };
    }).__map;
    const people = map?.queryRenderedFeatures({ layers: ["geography-people"] }) ?? [];
    return Object.fromEntries(people.filter((person) => person.properties?.name).map((person) => [person.properties!.name!, Boolean(person.properties!.future)]));
  }), { timeout: 5_000 }).toMatchObject({ "迪安": true, "萨尔": false });

  // 搜索定位：点击搜索结果后，地图适配到该人物（zoom 提升到地区档）。
  await page.getByLabel("搜索人物").fill("萨尔");
  await page.getByRole("button", { name: /萨尔/ }).click();
  await expect
    .poll(async () => (await mapState(page))?.zoom ?? 0, { timeout: 10_000 })
    .toBeGreaterThan(5);
});

// 拖动视角时投影必须保持稳定：globe 下拖动会改变 zoom，若投影实时跟随，
// 在过渡阈值附近会出现球↔平面突变。拖动开始后投影应锁定为固定状态。
test("keeps the projection locked while dragging near the globe-to-plane threshold", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "＋ 新建文件夹" }).click();
  await page.getByLabel("文件夹名称").fill("拖动");
  await page.getByRole("button", { name: "创建文件夹" }).click();
  await page.getByRole("button", { name: "＋ 在此文件夹新建图谱" }).click();
  await page.getByLabel("图谱名称").fill("拖动图");
  await page.getByLabel("图谱类型").selectOption("geography");
  await page.getByRole("button", { name: "创建并打开" }).click();
  await expect(page.locator(".geography-map-container canvas")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".map-load-state")).toHaveCount(0, { timeout: 20_000 });

  // 进入过渡区间（2.6–3.4）内的 3D 球状态。
  await page.locator(".geography-map-container").evaluate((container) => {
    const map = (container as unknown as { __map?: { flyTo: (o: { center: number[]; zoom: number; duration: number }) => void } }).__map;
    map?.flyTo({ center: [0, 20], zoom: 2.9, duration: 0 });
  });
  await expect
    .poll(async () => (await mapState(page))?.globeRendering, { timeout: 10_000 })
    .toBe(true);

  // 开始拖动：投影应被锁定为固定字符串 globe，而不是继续跟随 zoom 表达式。
  const box = await page.locator(".geography-map-container").boundingBox();
  if (!box) throw new Error("地图容器不可用");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 45, { steps: 10 });
  const lockedDuringDrag = await page.locator(".geography-map-container").evaluate((container) => {
    const map = (container as unknown as { __map?: { getProjection: () => { type: unknown } } }).__map;
    return map?.getProjection()?.type;
  });
  await page.mouse.up();

  expect(lockedDuringDrag).toBe("globe");
  // 拖动结束后保持 globe（锁定不随 zoom 抖动切换），直到下一次缩放手势。
  await expect
    .poll(async () => (await mapState(page))?.globeRendering, { timeout: 10_000 })
    .toBe(true);
});

// 同坐标人物在渲染层环形散开并带引线，避免节点完全重合遮盖。
test("spreads same-location people apart with leader lines", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: "＋ 新建文件夹" }).click();
  await page.getByLabel("文件夹名称").fill("同城");
  await page.getByRole("button", { name: "创建文件夹" }).click();
  await page.getByRole("button", { name: "＋ 在此文件夹新建图谱" }).click();
  await page.getByLabel("图谱名称").fill("同城图");
  await page.getByLabel("图谱类型").selectOption("geography");
  await page.getByRole("button", { name: "创建并打开" }).click();
  await expect(page.locator(".geography-map-container canvas")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".map-load-state")).toHaveCount(0, { timeout: 30_000 });
  // 先切到 mercator 平面档（zoom 4），避免 globe 首屏瓦片渲染占满主线程导致交互卡顿。
  await page.locator(".geography-map-container").evaluate((container) => {
    const map = (container as unknown as { __map?: { flyTo: (o: { center: number[]; zoom: number; duration: number }) => void } }).__map;
    map?.flyTo({ center: [116.4074, 39.9042], zoom: 4, duration: 0 });
  });

  await addPerson(page, "张三", "北京");
  await addPerson(page, "李四", "北京");
  await expect(page.getByText("已匹配 2")).toBeVisible({ timeout: 20_000 });

  // 散开半径随 zoom 自适应：国家档（zoom 4）就应错开，放大到 zoom 12 仍错开。
  const coordsAtZoom4 = await page.locator(".geography-map-container").evaluate((container) => {
    const map = (container as unknown as {
      __map?: { getZoom: () => number; querySourceFeatures: (id: string) => Array<{ properties?: { name?: string }; geometry?: { coordinates: [number, number] } }> };
    }).__map;
    const zoom = map?.getZoom() ?? 0;
    const people = map?.querySourceFeatures("geography-people") ?? [];
    const zhang = people.find((person) => person.properties?.name === "张三");
    const li = people.find((person) => person.properties?.name === "李四");
    return { zoom, zhang: zhang?.geometry?.coordinates, li: li?.geometry?.coordinates };
  });
  expect(coordsAtZoom4?.zhang).not.toEqual(coordsAtZoom4?.li);

  await page.locator(".geography-map-container").evaluate((container) => {
    const map = (container as unknown as { __map?: { flyTo: (o: { center: number[]; zoom: number; duration: number }) => void } }).__map;
    map?.flyTo({ center: [116.4074, 39.9042], zoom: 12, duration: 0 });
  });
  await expect.poll(async () => (await mapState(page))?.zoom ?? 0, { timeout: 10_000 }).toBeGreaterThan(11);

  // 两个北京人物的渲染坐标不同（散开），且都标记 spread；存在引线指向真实坐标。
  let result: { zhangCoords?: [number, number]; liCoords?: [number, number]; zhangSpread?: boolean; liSpread?: boolean } | null = null;
  await expect.poll(async () => {
    result = await page.locator(".geography-map-container").evaluate((container) => {
      const map = (container as unknown as {
        __map?: {
          querySourceFeatures: (id: string) => Array<{ properties?: { name?: string; spread?: boolean }; geometry?: { coordinates: [number, number] } }>;
        };
      }).__map;
      if (!map) return null;
      const people = map.querySourceFeatures("geography-people");
      const zhang = people.find((person) => person.properties?.name === "张三");
      const li = people.find((person) => person.properties?.name === "李四");
      return {
        zhangCoords: zhang?.geometry?.coordinates,
        liCoords: li?.geometry?.coordinates,
        zhangSpread: zhang?.properties?.spread,
        liSpread: li?.properties?.spread,
      };
    });
    return Boolean(result?.zhangCoords && result.liCoords && result.zhangSpread && result.liSpread &&
      (result.zhangCoords[0] !== result.liCoords[0] || result.zhangCoords[1] !== result.liCoords[1]));
  }, { timeout: 10_000 }).toBe(true);
  // 节点圆扩大一倍后，同点散开的目标间距随之增大（zoom 12 下散开距离超过 20px）。
  const spreadPx = await page.locator(".geography-map-container").evaluate((container, coords) => {
    const map = (container as unknown as { __map?: { project: (c: [number, number]) => { x: number; y: number } } }).__map;
    if (!map || !coords.zhang || !coords.li) return 0;
    const a = map.project(coords.zhang);
    const b = map.project(coords.li);
    return Math.hypot(a.x - b.x, a.y - b.y);
  }, { zhang: result?.zhangCoords, li: result?.liCoords });
  expect(spreadPx).toBeGreaterThan(20);

  // 同地人物之间的关系必须连接各自散开后的节点，不能退回原始重合坐标形成零长度线。
  if (!result?.zhangCoords || !result.liCoords) throw new Error("同地节点坐标不可用");
  await page.getByRole("button", { name: "添加关系" }).click();
  await page.getByLabel("起始人物").selectOption({ label: "张三" });
  await page.getByLabel("目标人物").selectOption({ label: "李四" });
  await page.getByLabel("关系名称").fill("同城相识");
  await page.getByRole("button", { name: "保存关系" }).click();
  await expect(page.getByText("2 个人物 · 1 条关系")).toBeVisible({ timeout: 5_000 });
  await expect.poll(() => page.locator(".geography-map-container").evaluate((container) => {
    const map = (container as unknown as {
      __map?: { querySourceFeatures: (id: string) => Array<{ properties?: { name?: string }; geometry?: { coordinates: [number, number] | [[number, number], [number, number]] } }> };
    }).__map;
    if (!map) return false;
    const people = map.querySourceFeatures("geography-people");
    const zhang = people.find((feature) => feature.properties?.name === "张三")?.geometry?.coordinates;
    const li = people.find((feature) => feature.properties?.name === "李四")?.geometry?.coordinates;
    const relationship = map.querySourceFeatures("geography-relationships")[0]?.geometry?.coordinates;
    return JSON.stringify(relationship) === JSON.stringify([zhang, li]);
  }), { timeout: 5_000 }).toBe(true);
  // 引线层存在且渲染出指向真实坐标的线段。
  await expect.poll(async () => page.locator(".geography-map-container").evaluate((container) => {
    const map = (container as unknown as {
      __map?: { getLayer: (id: string) => unknown; queryRenderedFeatures: (o: { layers: string[] }) => unknown[] };
    }).__map;
    if (!map?.getLayer("geography-person-leaders")) return 0;
    return map.queryRenderedFeatures({ layers: ["geography-person-leaders"] }).length;
  }), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
});

// 中国主要城市走本地词表直接落点，不依赖 Nominatim 网络解析。
test("matches Chinese cities from the local place table without network", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "＋ 新建文件夹" }).click();
  await page.getByLabel("文件夹名称").fill("本地城市");
  await page.getByRole("button", { name: "创建文件夹" }).click();
  await page.getByRole("button", { name: "＋ 在此文件夹新建图谱" }).click();
  await page.getByLabel("图谱名称").fill("城市图");
  await page.getByLabel("图谱类型").selectOption("geography");
  await page.getByRole("button", { name: "创建并打开" }).click();
  await expect(page.locator(".geography-map-container canvas")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".map-load-state")).toHaveCount(0, { timeout: 30_000 });

  for (const city of ["兰州", "郑州", "长沙", "香港"]) {
    await addPerson(page, `旅人-${city}`, city);
  }
  await expect(page.getByText("已匹配 4")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".geography-unmatched")).toHaveCount(0);
});
