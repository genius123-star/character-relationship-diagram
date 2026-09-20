import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { getProject, saveProject } from "../storage/projectRepository";
import { saveFolder } from "../storage/folderRepository";
import { createFolder, createPerson, createProject } from "../domain/model";

vi.mock("../features/graph/GraphCanvas", () => ({
  GraphCanvas: () => <div data-testid="graph-canvas" />,
}));

async function fillGraphName(value: string): Promise<void> {
  const nameInput = screen.getByLabelText("图谱名称") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(nameInput, value);
  nameInput.dispatchEvent(new Event("input", { bubbles: true }));
  await waitFor(() => {
    expect((screen.getByRole("button", { name: "创建并打开" }) as HTMLButtonElement).disabled).toBe(false);
  });
}

function deleteTestDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("character-graph");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

describe("App project home", () => {
  beforeEach(async () => {
    await deleteTestDatabase();
  });

  it("shows the empty project home", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "从一部作品开始" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("还没有图谱文件夹")).toBeInTheDocument();
  });

  it("hides frozen journey projects and does not offer journey creation", async () => {
    const folder = createFolder("小说", "folder-frozen-journey");
    const peopleProject = createProject("人物图", "people-view", folder.id, "people");
    const journeyProject = createProject("旧旅程图", "journey-view", folder.id, "journey");
    await saveFolder(folder);
    await saveProject(peopleProject);
    await saveProject(journeyProject);

    render(<App />);

    expect(await screen.findByText("人物图")).toBeInTheDocument();
    expect(screen.queryByText("旧旅程图")).not.toBeInTheDocument();
    expect(screen.getByText("1 张图")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "＋ 在此文件夹新建图谱" }));
    expect(screen.getByLabelText("图谱类型")).not.toHaveTextContent("旅程图");
  });

  it("imports a frozen journey project without opening its retired workspace", async () => {
    render(<App />);
    const project = createProject("历史旅程", "imported-journey", undefined, "journey");
    const bundle = { format: "character-graph", schemaVersion: 1, exportedAt: new Date().toISOString(), project, assets: [] };

    fireEvent.change(await screen.findByLabelText("选择要导入的项目文件"), {
      target: { files: [new File([JSON.stringify(bundle)], "journey.json", { type: "application/json" })] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("旅程图当前已冻结");
    expect(await getProject("imported-journey")).toBeDefined();
    expect(screen.getByRole("heading", { name: "从一部作品开始" })).toBeInTheDocument();
    expect(screen.queryByTestId("current-project")).not.toBeInTheDocument();
  });

  it("creates a project and persists it locally", async () => {
    render(<App />);

    await createFolderThroughUi("小说");
    fireEvent.click(screen.getByRole("button", { name: "＋ 在此文件夹新建图谱" }));
    await fillGraphName("百年孤独");
    fireEvent.click(screen.getByRole("button", { name: "创建并打开" }));

    expect(
      await screen.findByTestId("graph-workspace", {}, { timeout: 20000 }),
    ).toBeInTheDocument();
    const projectId = screen.getByTestId("current-project").dataset.projectId;
    expect(projectId).toBeTruthy();
    expect((await getProject(projectId!))?.name).toBe("百年孤独");
  });

  it("undoes and redoes project edits from the toolbar and keyboard", async () => {
    render(<App />);
    await createFolderThroughUi("小说");
    fireEvent.click(screen.getByRole("button", { name: "＋ 在此文件夹新建图谱" }));
    await fillGraphName("撤销测试");
    fireEvent.click(screen.getByRole("button", { name: "创建并打开" }));

    expect(await screen.findByRole("heading", { name: "撤销测试" }, { timeout: 5000 })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "添加人物" })[0]);
    fireEvent.change(screen.getByLabelText("人物名称"), { target: { value: "小明" } });
    fireEvent.click(screen.getByRole("button", { name: "保存人物" }));
    expect(await screen.findByText("1 个人物 · 0 条关系", {}, { timeout: 5000 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(screen.getByText("0 个人物 · 0 条关系")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(screen.getByText("1 个人物 · 0 条关系")).toBeInTheDocument();
  });

  it("persists parsed sentences to IndexedDB before the panel closes", async () => {
    render(<App />);
    await createFolderThroughUi("小说");
    fireEvent.click(screen.getByRole("button", { name: "＋ 在此文件夹新建图谱" }));
    await fillGraphName("解析持久化");
    fireEvent.click(screen.getByRole("button", { name: "创建并打开" }));
    expect(await screen.findByTestId("graph-workspace", {}, { timeout: 20000 })).toBeInTheDocument();
    const projectId = screen.getByTestId("current-project").dataset.projectId!;

    fireEvent.click(screen.getByRole("button", { name: "更多功能" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "句子解析" }));
    fireEvent.change(screen.getByLabelText("划选文本"), { target: { value: "迪安出了管教所，将首度前来纽约找我，还听说他跟一个叫玛丽露的女孩结婚了" } });
    fireEvent.click(screen.getByRole("button", { name: "解析句子" }));
    expect(await screen.findByText(/解析出 \d+ 项候选/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "一键全确认" }));
    fireEvent.click(screen.getByRole("button", { name: /写入项目/ }));

    // 提交语义：面板关闭时数据必须已落库，无需等待 300ms 防抖。
    await waitFor(() => expect(screen.queryByLabelText("划选文本")).not.toBeInTheDocument());
    const saved = await getProject(projectId);
    expect(saved?.people).toHaveLength(3);
    expect(saved?.relationships).toHaveLength(2);
  });

  it("keeps an extension parse task received on the home page until a project opens", async () => {
    const folder = createFolder("小说", "folder-extension-task");
    const project = createProject("快捷键解析", "project-extension-task", folder.id);
    await saveFolder(folder);
    await saveProject(project);
    render(<App />);

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: "parse-selection-task",
        requestId: "request-1",
        text: "周云逸召见了钦天监。",
      },
    }));

    fireEvent.click((await screen.findByText("快捷键解析")).closest("button")!);

    expect(await screen.findByLabelText("划选文本")).toHaveValue("周云逸召见了钦天监。");
  });

  it("renames and deletes an existing project", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await createFolderThroughUi("小说");
    fireEvent.click(screen.getByRole("button", { name: "＋ 在此文件夹新建图谱" }));
    await fillGraphName("旧书名");
    fireEvent.click(screen.getByRole("button", { name: "创建并打开" }));
    fireEvent.click(await screen.findByRole("button", { name: "返回项目首页" }, { timeout: 20000 }));

    vi.spyOn(window, "prompt").mockReturnValue("新书名");
    fireEvent.click(screen.getAllByRole("button", { name: "重命名" })[1]);
    expect(await screen.findByText("新书名")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[1]);
    await waitFor(() =>
      expect(screen.queryByText("新书名")).not.toBeInTheDocument(),
    );
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("imports a valid project file and opens it", async () => {
    render(<App />);
    const project = {
      schemaVersion: 1,
      id: "imported-project",
      name: "导入的图谱",
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
      timeline: { kind: "chapter", label: "章" },
      people: [], relationships: [], categories: [], layout: {},
    };
    const bundle = { format: "character-graph", schemaVersion: 1, exportedAt: "2026-08-13T00:00:00.000Z", project, assets: [] };

    const input = await screen.findByLabelText("选择要导入的项目文件");
    fireEvent.change(input, { target: { files: [new File([JSON.stringify(bundle)], "graph.json", { type: "application/json" })] } });

    expect(await screen.findByTestId("current-project", {}, { timeout: 5000 })).toHaveAttribute("data-project-id", "imported-project");
    expect((await getProject("imported-project"))?.name).toBe("导入的图谱");
  });

  it("adds a shared person from the current folder into another graph", async () => {
    const folder = createFolder("在路上", "folder-road");
    const peopleGraph = createProject("人物图", "people-view", folder.id, "people");
    const geoGraph = createProject("地理图", "geo-view", folder.id, "geography");
    peopleGraph.people.push(createPerson("迪安", "person-dean"));
    await saveFolder(folder);
    await saveProject(peopleGraph);
    await saveProject(geoGraph);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /地理图.*0 个人物/ }));
    fireEvent.click(await screen.findByRole("button", { name: "更多功能" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "从文件夹加入" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "迪安" }));
    fireEvent.click(screen.getByRole("button", { name: "加入当前图" }));

    expect(await screen.findByText("1 个人物 · 0 条关系", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("shows a precise import error and preserves existing projects", async () => {
    render(<App />);
    await createFolderThroughUi("小说");
    fireEvent.click(screen.getByRole("button", { name: "＋ 在此文件夹新建图谱" }));
    await fillGraphName("安全项目");
    fireEvent.click(screen.getByRole("button", { name: "创建并打开" }));
    fireEvent.click(await screen.findByRole("button", { name: "返回项目首页" }, { timeout: 20000 }));

    const input = screen.getByLabelText("选择要导入的项目文件");
    fireEvent.change(input, { target: { files: [new File(["{"], "broken.json", { type: "application/json" })] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("文件不是有效的 JSON");
    expect(screen.getByText("安全项目")).toBeInTheDocument();
  });

  it("creates and opens the built-in performance benchmark", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "创建性能基准项目" }));

    expect(await screen.findByRole("heading", { name: "500 人 / 3,000 关系性能基准" })).toBeInTheDocument();
    const project = await getProject("benchmark-500-3000");
    expect(project?.people).toHaveLength(500);
    expect(project?.relationships).toHaveLength(3_000);
  });
});

async function createFolderThroughUi(name: string): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: "新建文件夹" }));
  const folderInput = screen.getByLabelText("文件夹名称") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(folderInput, name);
  folderInput.dispatchEvent(new Event("input", { bubbles: true }));
  await waitFor(() => {
    expect((screen.getByRole("button", { name: "创建文件夹" }) as HTMLButtonElement).disabled).toBe(false);
  });
  fireEvent.click(screen.getByRole("button", { name: "创建文件夹" }));
  expect(await screen.findByRole("heading", { name }, { timeout: 5000 })).toBeInTheDocument();
}
