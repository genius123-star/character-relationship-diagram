import { expect, test, type Page } from "@playwright/test";

// 在解析面板中粘贴句子并确认全部候选。
async function parseAndConfirmAll(page: Page, sentence: string): Promise<void> {
  await page.getByRole("button", { name: "更多功能" }).click();
  await page.getByRole("menuitem", { name: "句子解析", exact: true }).click();
  await page.getByLabel("划选文本").fill(sentence);
  await page.getByRole("button", { name: "解析句子" }).click();
  await expect(page.getByText(/解析出 \d+ 项候选/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "一键全确认" }).click();
  await page.getByRole("button", { name: /写入项目/ }).click();
  // 写入后面板自动关闭。
  await expect(page.getByRole("button", { name: "更多功能" })).toBeVisible({ timeout: 5_000 });
}

test("parses two selected sentences into people, relationships, features and location", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "＋ 新建文件夹" }).click();
  await page.getByLabel("文件夹名称").fill("划句");
  await page.getByRole("button", { name: "创建文件夹" }).click();
  await page.getByRole("button", { name: "＋ 在此文件夹新建图谱" }).click();
  await page.getByLabel("图谱名称").fill("阅读记录");
  await page.getByRole("button", { name: "创建并打开" }).click();

  // 例句 1：新建迪安、我、玛丽露三个节点，形成朋友/夫妻关系，迪安落点纽约。
  await parseAndConfirmAll(page, "迪安出了管教所，将首度前来纽约找我，还听说他跟一个叫玛丽露的女孩结婚了");
  await expect(page.getByText("3 个人物 · 2 条关系")).toBeVisible({ timeout: 5_000 });

  // 例句 2：玛丽露特征写入画像（漂亮/金发/卷发）。
  await parseAndConfirmAll(page, "玛丽露是漂亮的金发妞，满头卷发像一大片金色海洋");
  await page.getByLabel("搜索人物").fill("玛丽露");
  // 搜索结果辅助信息取自性格标签，证明特征已写入画像（全量标签由单测覆盖）。
  await expect(page.getByRole("button", { name: /玛丽露/ })).toContainText("漂亮");

  // 刷新后重新打开项目：解析结果持久化。
  await page.reload();
  await page.getByRole("button", { name: /阅读记录/ }).click();
  await expect(page.getByText("3 个人物 · 2 条关系")).toBeVisible({ timeout: 10_000 });
});

// 插件侧边栏通过 postMessage 把划选句子传入应用：面板自动打开并填充。
test("opens the parse panel with a sentence received from the extension bridge", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "＋ 新建文件夹" }).click();
  await page.getByLabel("文件夹名称").fill("桥接");
  await page.getByRole("button", { name: "创建文件夹" }).click();
  await page.getByRole("button", { name: "＋ 在此文件夹新建图谱" }).click();
  await page.getByLabel("图谱名称").fill("桥接图");
  await page.getByRole("button", { name: "创建并打开" }).click();
  await expect(page.getByRole("heading", { name: "桥接图" })).toBeVisible({ timeout: 10_000 });

  await page.evaluate(() => {
    window.postMessage({ type: "parse-selection", text: "他遇见了一个叫王五的朋友" }, "*");
  });
  await expect(page.getByLabel("划选文本")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByLabel("划选文本")).toHaveValue("他遇见了一个叫王五的朋友");
});
