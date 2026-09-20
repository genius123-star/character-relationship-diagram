import { expect, test } from "@playwright/test";

test("opens and searches the 500-person / 3,000-relationship benchmark", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "创建性能基准项目" })).toBeVisible();

  // 首次点击生成并写入基准项目（生成 500 人/3000 关系 + IndexedDB 写入）。
  await page.getByRole("button", { name: "创建性能基准项目" }).click();
  await expect(page.getByRole("heading", { name: "500 人 / 3,000 关系性能基准" })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("500 个人物 · 3000 条关系")).toBeVisible();

  // 返回首页，再次打开已存在的基准项目：这是“打开已有项目至图谱可操作”的真实验收，
  // 门槛为 3 秒（PRD 13.4）。
  await page.getByRole("button", { name: "返回项目首页" }).click();
  await expect(page.getByRole("heading", { name: "从一部作品开始" })).toBeVisible();
  const openedAt = Date.now();
  await page.locator(".project-card__open").first().click();
  await expect(page.getByRole("heading", { name: "500 人 / 3,000 关系性能基准" })).toBeVisible({ timeout: 8_000 });
  expect(Date.now() - openedAt).toBeLessThan(3_000);

  const searchDuration = await page.getByLabel("搜索人物").evaluate(async (input) => {
    const startedAt = performance.now();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "人物 299");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    while (![...document.querySelectorAll("button")].some((button) => button.textContent?.includes("人物 299"))) {
      await new Promise(requestAnimationFrame);
    }
    return performance.now() - startedAt;
  });
  expect(searchDuration).toBeLessThan(300);
});
