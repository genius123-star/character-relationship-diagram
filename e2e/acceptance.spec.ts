import { expect, test } from "@playwright/test";

test("supports progress, categorization and all export choices", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "＋ 新建文件夹" }).click();
  await page.getByLabel("文件夹名称").fill("验收项目");
  await page.getByRole("button", { name: "创建文件夹" }).click();
  await expect(page.getByRole("heading", { name: "验收项目" })).toBeVisible();
  await page.getByRole("button", { name: "＋ 在此文件夹新建图谱" }).click();
  await page.getByLabel("图谱名称").fill("验收项目");
  await page.getByRole("button", { name: "创建并打开" }).click();
  await page.locator(".graph-toolbar").getByRole("button", { name: "添加人物" }).click();
  await page.getByLabel("人物名称", { exact: true }).fill("测试人物");
  await page.getByRole("button", { name: "保存人物", exact: true }).click();

  await page.getByLabel("选择资料块").selectOption("firstAppearance");
  await page.getByRole("button", { name: "添加资料块" }).click();
  await page.getByLabel("首次出场章节").fill("8");
  await page.getByRole("button", { name: "保存人物资料" }).click();
  await page.getByRole("button", { name: "关闭详细信息" }).click();
  await page.getByRole("button", { name: "打开阅读进度" }).click();
  await page.getByRole("checkbox", { name: "匹配当前阅读进度" }).check();
  await page.getByRole("slider", { name: "当前章节" }).fill("5");
  await expect(page.getByText("已阅读至第 5 章。" )).toBeVisible();

  await page.getByLabel("新归类维度").fill("阵营");
  await page.getByRole("button", { name: "创建" }).click();
  await page.getByLabel("新标签名称").fill("主角团");
  await page.getByLabel("标签颜色").fill("#2255aa");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await expect(page.getByText("主角团")).toBeVisible();

  await page.getByRole("button", { name: "导出项目" }).click();
  for (const name of ["JSON 完整备份", "PNG 图片", "JPG 图片", "PDF 文档"]) await expect(page.getByRole("button", { name })).toBeEnabled();
  await page.getByRole("button", { name: "关闭", exact: true }).click();

  const unnamedControls = await page.locator("input:not([type=hidden]), textarea, select").evaluateAll((elements) => elements.filter((element) => !element.getAttribute("aria-label") && !element.id && !element.closest("label")).map((element) => element.outerHTML));
  expect(unnamedControls).toEqual([]);
});
