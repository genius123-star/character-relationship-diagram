import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPerson, createProject } from "../../domain/model";
import { GeographyCanvas } from "./GeographyCanvas";

// 地理解析的未知地点会触发网络请求（镜像地球 / Nominatim 镜像）；测试环境统一返回空结果（进入"解析失败"分支）。
afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => [] }));
});

describe("GeographyCanvas", () => {
  it("renders the scale status, map container and status bar", () => {
    const project = createProject("地理图", "geo", "folder", "geography");
    const { container } = render(<GeographyCanvas project={project} selectedId={undefined} onSelect={vi.fn()} />);
    expect(container.querySelector(".geography-scale-status")).toBeInTheDocument();
    expect(container.querySelector(".geography-map-container")).toBeInTheDocument();
    expect(container.querySelector(".geography-status")).toBeInTheDocument();
  });

  it("shows the correct text for local components", () => {
    const project = createProject("地理图", "geo", "folder", "geography");
    const { container } = render(<GeographyCanvas project={project} selectedId={undefined} onSelect={vi.fn()} />);
    expect(container.querySelector(".geography-status")).toHaveTextContent("0 个人物节点");
    expect(container.querySelector(".geography-status")).toHaveTextContent("0 条关系");
  });

  it("reports known and unknown affiliation counts", () => {
    const matched = { ...createPerson("北京人物", "b"), affiliation: "北京" };
    const unmatched = { ...createPerson("马孔多人物", "m"), affiliation: "马孔多" };
    const project = { ...createProject("地理图", "geo", "folder", "geography"), people: [matched, unmatched] };
    const { container } = render(<GeographyCanvas project={project} selectedId={undefined} onSelect={vi.fn()} />);
    expect(container.querySelector(".geography-status")).toHaveTextContent("已匹配 1");
    expect(container.querySelector(".geography-status")).toHaveTextContent("待匹配 1");
  });

  it("keeps the scale status available for the connection workflow", () => {
    const first = { ...createPerson("甲", "first"), affiliation: "北京" };
    const second = { ...createPerson("乙", "second"), affiliation: "上海" };
    const project = { ...createProject("地理图", "geo", "folder", "geography"), people: [first, second] };
    const onConnect = vi.fn();
    const { container } = render(<GeographyCanvas project={project} selectedId={undefined} onSelect={vi.fn()} onConnect={onConnect} relationshipKind="bidirectional" />);
    expect(container.querySelector(".geography-scale-status")).toBeInTheDocument();
  });
});
