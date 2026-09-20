import { expect, test } from "@playwright/test";

test("creates and opens a local project", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "从一部作品开始" })).toBeVisible();
  await page.getByRole("button", { name: "＋ 新建文件夹" }).click();
  await page.getByLabel("文件夹名称").fill("小说");
  await page.getByRole("button", { name: "创建文件夹" }).click();
  await expect(page.getByRole("heading", { name: "小说" })).toBeVisible();
  await page.getByRole("button", { name: "＋ 在此文件夹新建图谱" }).click();
  await page.getByLabel("图谱名称").fill("百年孤独");
  await page.getByRole("button", { name: "创建并打开" }).click();
  await expect(page.getByRole("heading", { name: "百年孤独" })).toBeVisible();

  for (const name of ["乌尔苏拉", "何塞"]) {
    await page.locator(".graph-toolbar").getByRole("button", { name: "添加人物" }).click();
    await page.getByLabel("人物名称", { exact: true }).fill(name);
    await page.getByRole("button", { name: "保存人物", exact: true }).click();
  }
  for (const block of ["aliases", "firstAppearance", "events", "affiliation", "summary"]) {
    await page.getByLabel("选择资料块").selectOption(block);
    await page.getByRole("button", { name: "添加资料块" }).click();
  }
  await page.getByRole("textbox", { name: "别名", exact: true }).fill("何塞·阿尔卡蒂奥");
  await page.getByLabel("首次出场章节").fill("1");
  await page.getByLabel("事件标题 1").fill("建立马孔多");
  await page.getByLabel("事件章节 1").fill("1");
  await page.getByLabel("地点或所属势力").fill("马孔多");
  await page.getByRole("textbox", { name: "人物简介", exact: true }).fill("布恩迪亚家族成员");
  await page.getByRole("button", { name: "保存人物资料" }).click();
  await page.getByRole("button", { name: "关闭详细信息" }).click();
  await page.getByRole("button", { name: "打开关系工具" }).click();
  await page.getByLabel("新关系类型").selectOption("bidirectional");
  await page.getByLabel("新关系名称").fill("夫妻");
  await page.locator(".relationship-tools-toggle").click();
  const stage = await page.locator(".graph-stage").boundingBox();
  if (!stage) throw new Error("关系画布不可见");
  const initialNodePosition = await page.locator(".graph-canvas").evaluate((element) => {
    const cy = (element as HTMLElement & { _cyreg?: { cy?: { nodes: () => { filter: (callback: (node: { data: (key: string) => string }) => boolean) => { first: () => { renderedPosition: () => { x: number; y: number } } } } } } })._cyreg?.cy;
    if (!cy) throw new Error("无法读取关系画布实例");
    return cy.nodes().filter((node) => node.data("label") === "乌尔苏拉").first().renderedPosition();
  });
  const canvas = await page.locator(".graph-canvas").boundingBox();
  if (!canvas) throw new Error("关系画布不可见");
  const nodeX = canvas.x + initialNodePosition.x;
  const firstNodeY = canvas.y + initialNodePosition.y;
  await page.mouse.move(nodeX, firstNodeY);
  await page.mouse.down();
  await page.mouse.move(nodeX + 120, firstNodeY + 70);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const draggedPosition = await page.locator(".graph-canvas").evaluate((element) => {
    const cy = (element as HTMLElement & { _cyreg?: { cy?: { nodes: () => { filter: (callback: (node: { data: (key: string) => string }) => boolean) => { first: () => { renderedPosition: () => { x: number; y: number } } } } } } })._cyreg?.cy;
    if (!cy) throw new Error("无法读取关系画布实例");
    return cy.nodes().filter((node) => node.data("label") === "乌尔苏拉").first().renderedPosition();
  });
  expect(draggedPosition.x).toBeGreaterThan(initialNodePosition.x + 80);
  const draggedNodeX = canvas.x + draggedPosition.x;
  const draggedNodeY = canvas.y + draggedPosition.y;
  const previewMidpoint = { x: draggedNodeX + 45, y: draggedNodeY + 20, width: 30, height: 30 };
  const sourceNode = { x: draggedNodeX - 45, y: draggedNodeY - 45, width: 90, height: 90 };
  const midpointBeforeConnection = await page.screenshot({ clip: previewMidpoint });
  await page.mouse.click(draggedNodeX, draggedNodeY, { button: "right" });
  await expect(page.locator(".connection-overlay line")).toHaveAttribute("marker-start", "url(#connection-preview-arrow)");
  await expect(page.locator(".connection-overlay line")).toHaveAttribute("marker-end", "url(#connection-preview-arrow)");
  await expect(page.locator(".connection-overlay line")).toHaveAttribute("stroke-dasharray", "none");
  const sourceBeforeMove = await page.screenshot({ clip: sourceNode, style: ".connection-overlay line { visibility: hidden !important; }" });
  await page.mouse.move(draggedNodeX + 120, draggedNodeY + 70);
  const sourceAfterMove = await page.screenshot({ clip: sourceNode, style: ".connection-overlay line { visibility: hidden !important; }" });
  const midpointDuringConnection = await page.screenshot({ clip: previewMidpoint });
  expect(sourceAfterMove.equals(sourceBeforeMove)).toBe(true);
  expect(midpointDuringConnection.equals(midpointBeforeConnection)).toBe(false);
  // A right click on empty canvas cancels the active connection preview.
  await page.mouse.click(stage.x + 20, stage.y + 20, { button: "right" });
  await page.waitForTimeout(400);
  await expect.poll(async () => page.evaluate(async (expectedPosition) => {
    const request = indexedDB.open("character-graph");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const project = await new Promise<{ layout: Record<string, { x: number; y: number }> }>((resolve, reject) => {
      const read = database.transaction("projects").objectStore("projects").getAll();
      read.onsuccess = () => resolve(read.result[0]);
      read.onerror = () => reject(read.error);
    });
    database.close();
    const moved = Object.values(project.layout).find((position) => Math.abs(position.x - expectedPosition.x) < 2 && Math.abs(position.y - expectedPosition.y) < 2);
    return Boolean(moved);
  }, draggedPosition)).toBe(true);
  await page.mouse.click(draggedNodeX, draggedNodeY, { button: "right" });
  const targetPosition = await page.locator(".graph-canvas").evaluate((element) => {
    const cy = (element as HTMLElement & { _cyreg?: { cy?: { nodes: () => { filter: (callback: (node: { data: (key: string) => string }) => boolean) => { first: () => { renderedPosition: () => { x: number; y: number } } } } } } })._cyreg?.cy;
    if (!cy) throw new Error("无法读取关系画布实例");
    return cy.nodes().filter((node) => node.data("label") === "何塞").first().renderedPosition();
  });
  await page.mouse.move(canvas.x + targetPosition.x, canvas.y + targetPosition.y, { steps: 12 });
  await page.mouse.click(canvas.x + targetPosition.x, canvas.y + targetPosition.y, { button: "right" });
  await expect(page.getByRole("heading", { name: "夫妻" })).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => {
    const request = indexedDB.open("character-graph");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const project = await new Promise<{ relationships: Array<{ kind?: string }> }>((resolve, reject) => {
      const read = database.transaction("projects").objectStore("projects").getAll();
      read.onsuccess = () => resolve(read.result[0]);
      read.onerror = () => reject(read.error);
    });
    database.close();
    return project.relationships[0]?.kind;
  })).toBe("bidirectional");
  await page.getByLabel("编辑关系类型").selectOption("contact");
  await page.getByLabel("关系说明").fill("曾经共同生活，现已失联");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect.poll(async () => page.evaluate(async () => {
    const request = indexedDB.open("character-graph");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const project = await new Promise<{ relationships: Array<{ kind?: string; description?: string }> }>((resolve, reject) => {
      const read = database.transaction("projects").objectStore("projects").getAll();
      read.onsuccess = () => resolve(read.result[0]);
      read.onerror = () => reject(read.error);
    });
    database.close();
    return `${project.relationships[0]?.kind}:${project.relationships[0]?.description}`;
  })).toBe("contact:曾经共同生活，现已失联");
  const currentStage = await page.locator(".graph-stage").boundingBox();
  if (!currentStage) throw new Error("关系画布不可见");
  await page.getByRole("button", { name: "从画布选择起点" }).click();
  await expect(page.getByText("请在画布中点击一个人物节点作为起点")).toBeVisible();
  await expect(page.locator(".graph-canvas")).toHaveCSS("cursor", "pointer");
  await page.mouse.click(currentStage.x + 20, currentStage.y + currentStage.height / 2);
  await expect(page.getByText("请在画布中点击一个人物节点作为起点")).toBeHidden();
  await expect(page.locator(".graph-canvas")).not.toHaveCSS("cursor", "pointer");
  await page.getByRole("button", { name: "从画布选择终点" }).click();
  const sourcePosition = await page.locator(".graph-canvas").evaluate((element) => {
    const cy = (element as HTMLElement & { _cyreg?: { cy?: { nodes: () => { filter: (callback: (node: { data: (key: string) => string }) => boolean) => { first: () => { renderedPosition: () => { x: number; y: number } } } } } } })._cyreg?.cy;
    if (!cy) throw new Error("无法读取关系画布实例");
    return cy.nodes().filter((node) => node.data("label") === "何塞").first().renderedPosition();
  });
  await page.mouse.click(currentStage.x + sourcePosition.x, currentStage.y + sourcePosition.y);
  await expect(page.getByRole("heading", { name: "夫妻" })).toBeVisible();
  await expect(page.getByText("请在画布中点击一个人物节点作为终点")).toBeHidden();
  await page.locator(".relationship-tools-toggle").click();
  await page.getByLabel("分类预览").selectOption("contact");
  await page.getByRole("button", { name: "关闭详细信息" }).click();
});
