import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { createPerson, createProject, createRelationship, type ProfileBlockKind } from "../../domain/model";
import { GraphWorkspace } from "./GraphWorkspace";
import type { GraphImageExporter } from "./graphImageExport";

vi.mock("./GraphCanvas", () => ({
  GraphCanvas: ({ project, onSelect, onConnect, onMove, relationshipKind, previewMode, focusPersonIds, observationChapter, onExporterReady }: { project: ReturnType<typeof createProject>; onSelect: (id?: string) => void; onConnect: (sourceId: string, targetId: string, kind: "directed" | "bidirectional" | "undirected" | "contact") => void; onMove: (id: string, x: number, y: number) => void; relationshipKind: "directed" | "bidirectional" | "undirected" | "contact"; previewMode?: boolean; focusPersonIds?: string[]; observationChapter?: number; onExporterReady?: (exporter: GraphImageExporter) => void }) => <div data-testid="graph-canvas" data-preview-mode={String(Boolean(previewMode))} data-focus-person-ids={focusPersonIds?.join(",") ?? ""} data-observation-chapter={observationChapter ?? "all"}>
    <button type="button" onClick={() => onExporterReady?.({ export: vi.fn().mockResolvedValue(new Blob(["image"])) })}>模拟画布就绪</button>
    <button type="button" onClick={() => onSelect(undefined)}>画布空白</button>
    {project.people.map((person) => <button key={person.id} type="button" onClick={() => onSelect(person.id)}>{person.name}</button>)}
    {project.relationships.map((relationship) => <button key={relationship.id} type="button" onClick={() => onSelect(relationship.id)}>{relationship.forwardLabel}</button>)}
    {project.people.length > 1 && <button type="button" onClick={() => onConnect(project.people[0].id, project.people[1].id, relationshipKind)}>模拟拖线</button>}
    {project.people.length > 0 && <button type="button" onClick={() => onMove(project.people[0].id, 320, 240)}>模拟拖动</button>}
  </div>,
}));

describe("GraphWorkspace", () => {
  it("persists a moved node through the project change callback", () => {
    const project = createProject("拖动", "project-move");
    project.people = [createPerson("人物", "person-move")];
    const onChange = vi.fn();
    render(<GraphWorkspace project={project} onBack={() => undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "模拟拖动" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ layout: { "person-move": { x: 320, y: 240, fixed: false } } }));
  });

  it("commits parsed sentences through onCommit instead of the debounced onChange", async () => {
    const project = createProject("解析", "project-parse");
    const onChange = vi.fn();
    const onCommit = vi.fn().mockResolvedValue(undefined);
    render(<GraphWorkspace project={project} onBack={() => undefined} onChange={onChange} onCommit={onCommit} />);

    fireEvent.click(screen.getByRole("button", { name: "更多功能" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "句子解析" }));
    fireEvent.change(screen.getByLabelText("划选文本"), { target: { value: "迪安出了管教所，将首度前来纽约找我，还听说他跟一个叫玛丽露的女孩结婚了" } });
    fireEvent.click(screen.getByRole("button", { name: "解析句子" }));
    expect(await screen.findByText(/解析出 \d+ 项候选/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "一键全确认" }));
    fireEvent.click(screen.getByRole("button", { name: /写入项目/ }));

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    const committed = onCommit.mock.calls[0][0] as ReturnType<typeof createProject>;
    expect(committed.people).toHaveLength(3);
    expect(committed.relationships).toHaveLength(2);
    expect(onChange).not.toHaveBeenCalled();
  });
  it("exports JSON from a format chooser", async () => {
    const project = createProject("导出项目", "project-export");
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(<GraphWorkspace project={project} onBack={() => undefined} onChange={() => undefined} onExport={onExport} />);

    fireEvent.click(screen.getByRole("button", { name: "导出项目" }));
    fireEvent.click(screen.getByRole("button", { name: "JSON 完整备份" }));

    expect(onExport).toHaveBeenCalledWith(project);
    expect(await screen.findByRole("status")).toHaveTextContent("导出完成");
  });

  it("exports the complete graph in a selected image format", async () => {
    const onGraphExport = vi.fn().mockResolvedValue(undefined);
    const project = createProject("图片导出", "project-image");
    project.people = [createPerson("人物", "person-image")];
    render(<GraphWorkspace project={project} onBack={() => undefined} onChange={() => undefined} onGraphExport={onGraphExport} />);
    fireEvent.click(screen.getByRole("button", { name: "模拟画布就绪" }));
    fireEvent.click(screen.getByRole("button", { name: "导出项目" }));
    fireEvent.click(screen.getByRole("button", { name: "PNG 图片" }));
    expect(onGraphExport).toHaveBeenCalledWith("png", expect.any(Object));
  });

  it("enables chapter progress and sends the selected chapter to the canvas", () => {
    const person = { ...createPerson("人物", "person-1"), firstAppearance: { kind: "chapter" as const, value: 8 } };
    render(<GraphWorkspace project={{ ...createProject("测试", "project-1"), people: [person] }} onBack={() => undefined} onChange={() => undefined} />);
    expect(screen.queryByRole("checkbox", { name: "匹配当前阅读进度" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开阅读进度" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "匹配当前阅读进度" }));
    fireEvent.change(screen.getByRole("slider", { name: "当前章节" }), { target: { value: "5" } });
    expect(screen.getByTestId("graph-canvas")).toHaveAttribute("data-observation-chapter", "5");
    fireEvent.click(screen.getByRole("button", { name: "画布空白" }));
    expect(screen.queryByRole("checkbox", { name: "匹配当前阅读进度" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开阅读进度" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "匹配当前阅读进度" }));
    expect(screen.getByTestId("graph-canvas")).toHaveAttribute("data-observation-chapter", "all");
  });

  it("keeps only primary actions visible and moves secondary actions into More", () => {
    const project = { ...createProject("测试", "project-1"), people: [createPerson("甲", "person-1"), createPerson("乙", "person-2")] };
    render(<GraphWorkspace project={project} onBack={() => undefined} onChange={() => undefined} onAddFromFolder={() => undefined} />);

    expect(screen.getByRole("button", { name: "添加人物" })).toHaveClass("toolbar-create-button");
    expect(screen.getByRole("button", { name: "添加关系" })).toHaveClass("toolbar-create-button");
    expect(screen.queryByRole("button", { name: "重置布局" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "句子解析" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "更多功能" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "句子解析" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "从文件夹加入" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "开启预览模式" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "重新布局" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "适应全图" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("uses search only to locate a person", () => {
    const first = { ...createPerson("甲", "person-1"), aliases: ["大甲"] };
    const second = { ...createPerson("乙", "person-2"), affiliation: "北京" };
    render(<GraphWorkspace project={{ ...createProject("测试", "project-1"), people: [first, second] }} onBack={() => undefined} onChange={() => undefined} />);
    fireEvent.change(screen.getByLabelText("搜索人物"), { target: { value: "甲" } });
    fireEvent.click(screen.getByRole("button", { name: /甲.*大甲/ }));
    expect(screen.getByTestId("graph-canvas")).toHaveAttribute("data-focus-person-ids", "person-1");
    fireEvent.change(screen.getByLabelText("搜索人物"), { target: { value: "北京" } });
    fireEvent.click(screen.getByRole("button", { name: /乙.*北京/ }));
    expect(screen.getByTestId("graph-canvas")).toHaveAttribute("data-focus-person-ids", "person-2");
  });

  it("selects people and relationships from the current folder", () => {
    const sal = createPerson("萨尔", "person-sal");
    const dean = createPerson("迪安", "person-dean");
    const relationship = createRelationship({ id: "friendship", sourcePersonId: sal.id, targetPersonId: dean.id, forwardLabel: "朋友" });
    const project = { ...createProject("地理图", "geo-view", "folder-1", "geography"), people: [sal] };
    const onAddFromFolder = vi.fn();
    render(<GraphWorkspace project={project} folderPeople={[sal, dean]} folderRelationships={[relationship]} onAddFromFolder={onAddFromFolder} onBack={() => undefined} onChange={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "更多功能" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "从文件夹加入" }));
    expect(screen.getByRole("button", { name: "加入当前图" }).closest(".folder-member-picker__footer")).not.toBeNull();
    expect(screen.getByRole("checkbox", { name: "迪安" }).closest(".folder-member-picker__scroll")).not.toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "迪安" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /萨尔.*朋友.*迪安/ }));
    fireEvent.click(screen.getByRole("button", { name: "加入当前图" }));

    expect(onAddFromFolder).toHaveBeenCalledWith(["person-dean"], ["friendship"]);
  });

  it("opens geography projects on the dedicated geographic canvas", () => {
    const project = createProject("在路上·地理图", "geo-view", "folder-1", "geography");

    render(<GraphWorkspace project={project} onBack={() => undefined} onChange={() => undefined} />);

    expect(screen.getByRole("button", { name: "适应全部节点" })).toBeInTheDocument();
    expect(screen.getByTestId("maplibre-map")).toBeInTheDocument();
    expect(screen.queryByTestId("graph-canvas")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "多节点关系计算" })).not.toBeInTheDocument();
  });

  it("offers view removal and permanent folder deletion separately", () => {
    const sal = createPerson("萨尔", "person-sal");
    const project = { ...createProject("地理图", "geo-view", "folder-1", "geography"), people: [sal] };
    const onRemoveFromView = vi.fn();
    const onDeleteFromFolder = vi.fn();
    render(<GraphWorkspace project={project} folderPeople={[sal]} onRemoveFromView={onRemoveFromView} onDeleteFromFolder={onDeleteFromFolder} onBack={() => undefined} onChange={() => undefined} />);

    expect(screen.getByTestId("maplibre-map")).toBeInTheDocument();
    // 地理图下的人物按钮在 MapLibre 容器中渲染，不在当前测试覆盖范围内
    // 地图人员的右键菜单和选择逻辑保留在 GeographyCanvas 的独立测试中
  });

  it("calculates between independent start and end selectors", () => {
    const first = createPerson("我", "person-1");
    const second = createPerson("爸爸", "person-2");
    const relationship = createRelationship({ id: "r1", sourcePersonId: "person-2", targetPersonId: "person-1", forwardLabel: "爸爸", reverseLabel: "孩子" });
    render(<GraphWorkspace project={{ ...createProject("测试", "project-1"), people: [first, second], relationships: [relationship] }} onBack={() => undefined} onChange={() => undefined} />);
    fireEvent.change(screen.getByLabelText("计算起点"), { target: { value: "我" } });
    fireEvent.change(screen.getByLabelText("计算终点"), { target: { value: "爸爸" } });
    expect(screen.getByRole("heading", { name: "爸爸" })).toBeInTheDocument();
    expect(screen.getByTestId("graph-canvas")).toHaveAttribute("data-focus-person-ids", "person-1,person-2");
  });

  it("selects a calculation endpoint from the canvas and exits on blank space", () => {
    render(<GraphWorkspace project={{ ...createProject("测试", "project-1"), people: [createPerson("甲", "person-1"), createPerson("乙", "person-2")] }} onBack={() => undefined} onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "从画布选择计算起点" }));
    fireEvent.click(screen.getByRole("button", { name: "甲" }));
    expect(screen.getByLabelText("计算起点")).toHaveValue("甲");
    fireEvent.click(screen.getByRole("button", { name: "从画布选择计算终点" }));
    fireEvent.click(screen.getByRole("button", { name: "画布空白" }));
    expect(screen.getByRole("button", { name: "从画布选择计算终点" })).not.toHaveClass("is-active");
  });

  it("shows the calculated kinship and its derivation chain for two selected people", () => {
    const me = createPerson("我", "me");
    const father = createPerson("爸爸", "father");
    const relationship = createRelationship({ id: "father-me", sourcePersonId: "father", targetPersonId: "me", forwardLabel: "爸爸", reverseLabel: "孩子" });
    render(<GraphWorkspace project={{ ...createProject("测试", "project-1"), people: [me, father], relationships: [relationship] }} onBack={() => undefined} onChange={() => undefined} />);
    fireEvent.change(screen.getByLabelText("计算起点"), { target: { value: "我" } });
    fireEvent.change(screen.getByLabelText("计算终点"), { target: { value: "爸爸" } });
    expect(screen.getByRole("heading", { name: "爸爸" })).toBeInTheDocument();
    expect(screen.getByText("爸爸是我的爸爸")).toBeInTheDocument();
  });

  it("shows conflicting kinship candidates from equal shortest paths", () => {
    const people = [createPerson("我", "me"), createPerson("爸爸", "father"), createPerson("妈妈", "mother"), createPerson("亲戚", "relative")];
    const relationships = [
      createRelationship({ id: "father-me", sourcePersonId: "father", targetPersonId: "me", forwardLabel: "爸爸", reverseLabel: "孩子" }),
      createRelationship({ id: "relative-father", sourcePersonId: "relative", targetPersonId: "father", forwardLabel: "弟弟", reverseLabel: "哥哥" }),
      createRelationship({ id: "mother-me", sourcePersonId: "mother", targetPersonId: "me", forwardLabel: "妈妈", reverseLabel: "孩子" }),
      createRelationship({ id: "relative-mother", sourcePersonId: "relative", targetPersonId: "mother", forwardLabel: "弟弟", reverseLabel: "姐姐" }),
    ];
    render(<GraphWorkspace project={{ ...createProject("测试", "project-1"), people, relationships }} onBack={() => undefined} onChange={() => undefined} />);
    fireEvent.change(screen.getByLabelText("计算起点"), { target: { value: "我" } });
    fireEvent.change(screen.getByLabelText("计算终点"), { target: { value: "亲戚" } });
    expect(screen.getByText("存在冲突候选")).toBeInTheDocument();
    expect(screen.getByText("叔叔")).toBeInTheDocument();
    expect(screen.getByText("舅舅")).toBeInTheDocument();
  });

  it("enters read-only preview mode while keeping layout controls", () => {
    render(<GraphWorkspace project={{ ...createProject("测试", "project-1"), people: [createPerson("人物", "person-1")] }} onBack={() => undefined} onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "更多功能" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "开启预览模式" }));
    expect(screen.getByTestId("graph-canvas")).toHaveAttribute("data-preview-mode", "true");
    expect(screen.getByRole("button", { name: /添加人物/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "更多功能" }));
    expect(screen.getByRole("menuitem", { name: "重新布局" })).toBeEnabled();
    expect(screen.queryByRole("menuitem", { name: "重置布局" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "适应全图" })).toBeEnabled();
  });

  it("pins and unpins the selected person's saved position", () => {
    const person = createPerson("人物", "person-1");
    const initial = { ...createProject("测试", "project-1"), people: [person], layout: { [person.id]: { x: 120, y: 180, fixed: false } } };
    function Harness() {
      const [project, setProject] = useState(initial);
      return <GraphWorkspace project={project} onBack={() => undefined} onChange={setProject} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "人物" }));
    fireEvent.click(screen.getByRole("button", { name: "固定节点" }));
    expect(screen.getByRole("button", { name: "取消固定" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消固定" }));
    expect(screen.getByRole("button", { name: "固定节点" })).toBeInTheDocument();
  });

  it("adds optional profile blocks on demand and changes their order", () => {
    const initial = { ...createProject("测试", "project-1"), people: [createPerson("人物", "person-1")] };
    function Harness() {
      const [project, setProject] = useState(initial);
      return <GraphWorkspace project={project} onBack={() => undefined} onChange={setProject} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "人物" }));
    expect(screen.queryByLabelText("别名")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("选择资料块"), { target: { value: "aliases" } });
    fireEvent.click(screen.getByRole("button", { name: "添加资料块" }));
    fireEvent.change(screen.getByLabelText("选择资料块"), { target: { value: "summary" } });
    fireEvent.click(screen.getByRole("button", { name: "添加资料块" }));
    expect(screen.getByLabelText("别名")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "上移人物简介" }));
    const cards = screen.getAllByTestId("profile-block");
    expect(cards.map((card) => card.getAttribute("data-block"))).toEqual(["summary", "aliases"]);
  });

  it("changes the order of event cards", () => {
    const person = { ...createPerson("人物", "person-1"), events: [{ id: "event-1", title: "第一件事" }, { id: "event-2", title: "第二件事" }] };
    render(<GraphWorkspace project={{ ...createProject("测试", "project-1"), people: [person] }} onBack={() => undefined} onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "人物" }));
    fireEvent.click(screen.getByRole("button", { name: "上移事件 2" }));
    expect(screen.getAllByLabelText(/事件标题/).map((input) => (input as HTMLInputElement).value)).toEqual(["第二件事", "第一件事"]);
  });

  it("adds a person and opens the detail panel", async () => {
    const onChange = vi.fn();
    function Harness() {
      const [project, setProject] = useState(createProject("百年孤独", "project-1"));
      return <GraphWorkspace project={project} onBack={() => undefined} onChange={(next) => { onChange(next); setProject(next); }} />;
    }
    render(<Harness />);

    fireEvent.click(screen.getAllByRole("button", { name: "添加人物" })[0]);
    fireEvent.change(screen.getByLabelText("人物名称"), { target: { value: "奥雷里亚诺" } });
    fireEvent.click(screen.getByRole("button", { name: "保存人物" }));

    expect(await screen.findByRole("heading", { name: "奥雷里亚诺" })).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      people: [expect.objectContaining({ name: "奥雷里亚诺" })],
    }));
  });

  it("hides details when the canvas background is selected", () => {
    render(
      <GraphWorkspace
        project={createProject("百年孤独", "project-1")}
        onBack={() => undefined}
        onChange={() => undefined}
      />,
    );
    expect(screen.queryByTestId("detail-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("graph-canvas")).toBeInTheDocument();
  });

  it("creates a directed relationship between two people", () => {
    const initial = createProject("百年孤独", "project-1");
    const project = {
      ...initial,
      people: [
        { ...createPerson("乌尔苏拉", "person-1") },
        { ...createPerson("何塞", "person-2") },
      ],
    };
    const onChange = vi.fn();
    render(<GraphWorkspace project={project} onBack={() => undefined} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /添加关系/ }));
    fireEvent.change(screen.getByLabelText("关系名称"), { target: { value: "夫妻" } });
    fireEvent.click(screen.getByRole("button", { name: "保存关系" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      relationships: [expect.objectContaining({
        sourcePersonId: "person-1",
        targetPersonId: "person-2",
        forwardLabel: "夫妻",
      })],
    }));
  });

  it("creates a relationship from the canvas using the preset type and name", () => {
    const project = { ...createProject("测试", "project-1"), people: [createPerson("甲", "person-1"), createPerson("乙", "person-2")] };
    const onChange = vi.fn();
    render(<GraphWorkspace project={project} onBack={() => undefined} onChange={onChange} />);
    expect(screen.queryByLabelText("新关系类型")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开关系工具" }));
    fireEvent.change(screen.getByLabelText("新关系类型"), { target: { value: "contact" } });
    fireEvent.change(screen.getByLabelText("新关系名称"), { target: { value: "见过" } });
    fireEvent.click(screen.getByRole("button", { name: "模拟拖线" }));
    expect(screen.queryByRole("heading", { name: "编辑关系" })).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ relationships: [expect.objectContaining({ kind: "contact", forwardLabel: "见过" })] }));
  });

  it("offers relationship-type preview filters", () => {
    render(<GraphWorkspace project={createProject("测试", "project-1")} onBack={() => undefined} onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "打开关系工具" }));
    expect(screen.getByLabelText("分类预览")).toHaveValue("all");
    fireEvent.change(screen.getByLabelText("分类预览"), { target: { value: "bidirectional" } });
    expect(screen.getByLabelText("分类预览")).toHaveValue("bidirectional");
  });

  it("edits a selected person's name in place", () => {
    const initial = { ...createProject("百年孤独", "project-1"), people: [createPerson("旧名字", "person-1")] };
    function Harness() {
      const [project, setProject] = useState(initial);
      return <GraphWorkspace project={project} onBack={() => undefined} onChange={setProject} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "旧名字" }));
    fireEvent.change(screen.getByLabelText("编辑人物名称"), { target: { value: "新名字" } });
    expect(screen.queryByRole("button", { name: "保存修改" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存人物资料" }));
    expect(screen.getByRole("heading", { name: "新名字" })).toBeInTheDocument();
  });

  it("edits all optional person profile fields", () => {
    const person = { ...createPerson("人物", "person-1"), profileBlockOrder: ["aliases", "firstAppearance", "events", "affiliation", "summary", "personalityTags", "identityTags", "notes"] as ProfileBlockKind[] };
    const initial = { ...createProject("测试", "project-1"), people: [person] };
    const onChange = vi.fn();
    render(<GraphWorkspace project={initial} onBack={() => undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "人物" }));
    fireEvent.change(screen.getByLabelText("别名"), { target: { value: "别名一、别名二" } });
    fireEvent.change(screen.getByLabelText("首次出场章节"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("事件标题 1"), { target: { value: "抵达马孔多" } });
    fireEvent.change(screen.getByLabelText("事件章节 1"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("事件地点 1"), { target: { value: "马孔多车站" } });
    fireEvent.change(screen.getByLabelText("事件说明 1"), { target: { value: "首次进入小镇" } });
    fireEvent.change(screen.getByLabelText("地点或所属势力"), { target: { value: "马孔多" } });
    fireEvent.change(screen.getByLabelText("人物简介"), { target: { value: "家族成员" } });
    fireEvent.change(screen.getByLabelText("性格标签"), { target: { value: "坚韧、务实" } });
    fireEvent.change(screen.getByLabelText("身份标签"), { target: { value: "母亲、家族核心" } });
    fireEvent.change(screen.getByLabelText("人物备注"), { target: { value: "阅读时重点关注" } });
    fireEvent.click(screen.getByRole("button", { name: "保存人物资料" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ people: [expect.objectContaining({
      aliases: ["别名一", "别名二"],
      firstAppearance: { kind: "chapter", value: 3 },
      affiliation: "马孔多",
      summary: "家族成员",
      personalityTags: ["坚韧", "务实"],
      identityTags: ["母亲", "家族核心"],
      notes: "阅读时重点关注",
      events: [expect.objectContaining({ title: "抵达马孔多", position: { kind: "chapter", value: 3 }, location: "马孔多车站", description: "首次进入小镇" })],
    })] }));
  });

  it("changes the type of an existing relationship", () => {
    const people = [createPerson("甲", "person-1"), createPerson("乙", "person-2")];
    const relationship = createRelationship({ id: "relationship-1", sourcePersonId: people[0].id, targetPersonId: people[1].id, forwardLabel: "师生", kind: "directed" });
    const project = { ...createProject("测试", "project-1"), people, relationships: [relationship] };
    const onChange = vi.fn();
    render(<GraphWorkspace project={project} onBack={() => undefined} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "师生" }));
    fireEvent.change(screen.getByLabelText("编辑关系类型"), { target: { value: "undirected" } });
    fireEvent.change(screen.getByLabelText("关系说明"), { target: { value: "共同参与研究" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ relationships: [expect.objectContaining({ kind: "undirected", symmetric: true, description: "共同参与研究" })] }));
  });

  it("calculates an editable description for a relationship whose description is empty", () => {
    const people = [createPerson("甲", "person-1"), createPerson("乙", "person-2")];
    const relationship = createRelationship({ id: "relationship-1", sourcePersonId: people[0].id, targetPersonId: people[1].id, forwardLabel: "老师", kind: "directed" });
    const onChange = vi.fn();
    render(<GraphWorkspace project={{ ...createProject("测试", "project-1"), people, relationships: [relationship] }} onBack={() => undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "老师" }));
    expect(screen.getByLabelText("关系说明")).toHaveValue("甲是乙的老师（单向关系：甲 → 乙）。");
    fireEvent.change(screen.getByLabelText("关系说明"), { target: { value: "人工补充说明" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ relationships: [expect.objectContaining({ description: "人工补充说明" })] }));
  });

  it("edits relationship endpoints with existing nodes and canvas picking", () => {
    const people = [createPerson("甲", "person-1"), createPerson("乙", "person-2"), createPerson("丙", "person-3")];
    const relationship = createRelationship({ id: "relationship-1", sourcePersonId: people[0].id, targetPersonId: people[1].id, forwardLabel: "同事" });
    const project = { ...createProject("测试", "project-1"), people, relationships: [relationship] };
    const onChange = vi.fn();
    render(<GraphWorkspace project={project} onBack={() => undefined} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "同事" }));
    fireEvent.change(screen.getByLabelText("终点人物"), { target: { value: "甲" } });
    expect(screen.getByRole("button", { name: "保存修改" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("终点人物"), { target: { value: "乙" } });
    fireEvent.click(screen.getByRole("button", { name: "从画布选择起点" }));
    fireEvent.click(screen.getByRole("button", { name: "丙" }));
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ relationships: [expect.objectContaining({ sourcePersonId: "person-3", targetPersonId: "person-2" })] }));
  });

  it("closes endpoint candidates when clicking outside", () => {
    const people = [createPerson("甲", "person-1"), createPerson("乙", "person-2")];
    const relationship = createRelationship({ id: "relationship-1", sourcePersonId: people[0].id, targetPersonId: people[1].id, forwardLabel: "朋友" });
    const project = { ...createProject("测试", "project-1"), people, relationships: [relationship] };
    render(<GraphWorkspace project={project} onBack={() => undefined} onChange={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "朋友" }));
    fireEvent.focus(screen.getByLabelText("起点人物"));
    expect(screen.getByRole("listbox", { name: "起点人物候选" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox", { name: "起点人物候选" })).not.toBeInTheDocument();
  });

  it("creates a color category and assigns its value to a person", () => {
    const initial = { ...createProject("测试", "project-1"), people: [createPerson("乌尔苏拉", "person-1")] };
    let latest = initial;
    function Harness() {
      const [project, setProject] = useState(initial);
      return <GraphWorkspace project={project} onBack={() => undefined} onChange={(next) => { latest = next; setProject(next); }} />;
    }
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("新归类维度"), { target: { value: "家族" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));
    fireEvent.change(screen.getByLabelText("新标签名称"), { target: { value: "布恩迪亚" } });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    fireEvent.click(screen.getByRole("button", { name: "乌尔苏拉" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "布恩迪亚" }));

    const category = latest.categories[0];
    expect(category.name).toBe("家族");
    expect(latest.people[0].categoryValues[category.id]).toEqual([category.values[0].id]);
  });
});
