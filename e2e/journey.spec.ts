import { expect, test, type Page } from "@playwright/test";

// 添加人物并在详情面板设置"地区/势力"（可选首次出场章节）。
async function addPerson(page: Page, name: string, affiliation: string, firstAppearance?: number): Promise<void> {
  await page.locator(".graph-toolbar").getByRole("button", { name: "添加人物" }).click();
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

// 添加行程站点：填名称 → 解析位置 → 添加。
async function addStop(page: Page, label: string, chapter: string): Promise<void> {
  const panel = page.locator(".journey-panel");
  await panel.getByLabel("站点名称").fill(label);
  await panel.getByRole("button", { name: "解析位置" }).click();
  await expect(panel.getByRole("button", { name: "添加站点" })).toBeEnabled({ timeout: 10_000 });
  await panel.getByLabel("章节").fill(chapter);
  await panel.getByRole("button", { name: "添加站点" }).click();
}

// 冻结（2026-09-16）：保留该验收脚本和旅程实现，待“叙事线”重新立项后再启用。
// 当前前端不再提供旅程图入口，不能让这条历史验收用例要求已下线的行为。
test.skip("builds a four-stop journey with local graphs, cross-stop ties and chapter progress", async ({ page }) => {
  // 芝加哥不在内置地点，用镜像地球（Nominatim 镜像）mock 提供唯一解析结果。
  await page.route("**://api.mirror-earth.com/nominatim/**", (route) => route.fulfill({ json: [
    { display_name: "芝加哥, 伊利诺伊州, 美国", lon: "-87.6298", lat: "41.8781", address: { country_code: "us" } },
  ] }));
  await page.goto("/");
  await page.getByRole("button", { name: "＋ 新建文件夹" }).click();
  await page.getByLabel("文件夹名称").fill("在路上");
  await page.getByRole("button", { name: "创建文件夹" }).click();
  await page.getByRole("button", { name: "＋ 在此文件夹新建图谱" }).click();
  await page.getByLabel("图谱名称").fill("美国西行");
  await page.getByLabel("图谱类型").selectOption("journey");
  await page.getByRole("button", { name: "创建并打开" }).click();

  await expect(page.locator(".geography-map-container canvas")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".map-load-state")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator(".journey-panel")).toBeVisible({ timeout: 10_000 });

  // 添加两个人物（迪安第 5 章出场、萨尔第 1 章出场），并建立一条关系。
  await addPerson(page, "迪安", "旧金山", 5);
  await addPerson(page, "萨尔", "内华达州", 1);
  await page.getByRole("button", { name: "添加关系" }).click();
  await page.getByLabel("起始人物").selectOption({ label: "迪安" });
  await page.getByLabel("目标人物").selectOption({ label: "萨尔" });
  await page.getByLabel("关系名称").fill("同行");
  await page.getByRole("button", { name: "保存关系" }).click();
  await expect(page.getByText("2 个人物 · 1 条关系")).toBeVisible({ timeout: 5_000 });

  // 建立四站行程：纽约(1) → 芝加哥(3) → 丹佛(5) → 旧金山(7)。
  await addStop(page, "纽约", "1");
  await addStop(page, "芝加哥", "3");
  await addStop(page, "丹佛", "5");
  await addStop(page, "旧金山", "7");
  await expect(page.locator(".journey-panel .journey-stop")).toHaveCount(4);

  // 站点标记层已加入地图（source 与 circle/label 层存在）。
  await expect.poll(async () => page.locator(".geography-map-container").evaluate((container) => {
    const map = (container as unknown as { __map?: { getSource: (id: string) => unknown; getLayer: (id: string) => unknown } }).__map;
    return Boolean(map?.getSource("journey-stops") && map?.getLayer("journey-stops") && map?.getLayer("journey-stops-label"));
  }), { timeout: 10_000 }).toBe(true);

  // 展开纽约站：加入站内人物（迪安、萨尔），站内人物列表出现。
  const nyStop = page.locator(".journey-stop", { hasText: "纽约" });
  await nyStop.locator("header > button").first().click();
  await nyStop.getByText("迪安", { exact: true }).click();
  await nyStop.getByText("萨尔", { exact: true }).click();
  await expect(nyStop.locator(".journey-people")).toContainText("迪安");
  await expect(nyStop.locator(".journey-people")).toContainText("萨尔");

  // 展开丹佛站：加入迪安，形成"迪安(纽约+丹佛) · 同行 · 萨尔(纽约)"的跨站关系。
  const denverStop = page.locator(".journey-stop", { hasText: "丹佛" });
  await denverStop.locator("header > button").first().click();
  await denverStop.getByText("迪安", { exact: true }).click();
  await expect(denverStop.locator(".journey-cross")).toContainText("迪安 · 同行 · 萨尔");

  // 先适配到全部人物，确保节点在视口内，再验证观察进度。
  await page.getByRole("button", { name: "适应全部节点" }).click();
  await expect(page.getByText(/洲际|国家|地区或省州/)).toBeVisible({ timeout: 10_000 });

  // 观察进度：章节 1 时，芝加哥(第 3 章)站点淡化，纽约(第 1 章)正常；
  // 迪安（第 5 章出场）在地图上淡化，萨尔正常。
  await page.getByRole("button", { name: "打开阅读进度" }).click();
  await page.getByRole("checkbox", { name: "匹配当前阅读进度" }).check();
  await expect(page.locator(".journey-stop", { hasText: "芝加哥" })).toHaveClass(/is-future/);
  await expect(page.locator(".journey-stop", { hasText: "纽约" })).not.toHaveClass(/is-future/);
  const futureByName = await page.locator(".geography-map-container").evaluate((container) => {
    const map = (container as unknown as {
      __map?: { queryRenderedFeatures: (o: { layers: string[] }) => Array<{ properties?: { name?: string; future?: boolean } }> };
    }).__map;
    const people = map?.queryRenderedFeatures({ layers: ["geography-people"] }) ?? [];
    return Object.fromEntries(people.filter((person) => person.properties?.name).map((person) => [person.properties!.name!, Boolean(person.properties!.future)]));
  });
  expect(futureByName["迪安"]).toBe(true);
  expect(futureByName["萨尔"]).toBe(false);

  // 刷新页面后重新打开项目：行程与站点成员保留（章节/时间数据持久化）。
  await page.reload();
  await page.getByRole("button", { name: /美国西行/ }).click();
  await expect(page.locator(".journey-panel .journey-stop")).toHaveCount(4, { timeout: 30_000 });
  await expect(page.locator(".journey-stop", { hasText: "纽约" })).toContainText("第 1 章");
});
