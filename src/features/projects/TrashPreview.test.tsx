import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createProject } from "../../domain/model";
import { TrashPreview } from "./TrashPreview";

const graphCanvasSpy = vi.fn();

vi.mock("../graph/GraphCanvas", () => ({
  GraphCanvas: (props: { previewMode?: boolean }) => {
    graphCanvasSpy(props);
    return <div data-testid="trash-graph" />;
  },
}));

describe("TrashPreview", () => {
  it("用只读画布预览回收站项目并允许返回", () => {
    const project = createProject("回收站图谱");
    const onBack = vi.fn();

    render(<TrashPreview project={project} onBack={onBack} />);

    expect(screen.getByText("回收站只读预览 · 0 个人物 · 0 条关系")).toBeInTheDocument();
    expect(screen.getByTestId("trash-graph")).toBeInTheDocument();
    expect(graphCanvasSpy).toHaveBeenCalledWith(expect.objectContaining({ previewMode: true }));
    fireEvent.click(screen.getByRole("button", { name: "返回回收站" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
