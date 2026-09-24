import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createProject } from "../../domain/model";
import { SentenceParsePanel } from "./SentenceParsePanel";

const SENTENCE = "迪安出了管教所，将首度前来纽约找我，还听说他跟一个叫玛丽露的女孩结婚了";
const AI_CONFIGURATION = { apiKey: "test-key", model: "deepseek-chat", baseUrl: "" };

async function parseAndSelectAll(): Promise<void> {
  fireEvent.change(screen.getByLabelText("划选文本"), { target: { value: SENTENCE } });
  fireEvent.click(screen.getByRole("button", { name: "本地解析" }));
  expect(await screen.findByText(/解析出 \d+ 项候选/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "一键全确认" }));
}

describe("SentenceParsePanel", () => {
  it("parses the example sentence and commits selected candidates through onApply", async () => {
    const project = createProject("解析", "project-parse");
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<SentenceParsePanel project={project} aiConfiguration={AI_CONFIGURATION} onApply={onApply} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("划选文本"), { target: { value: SENTENCE } });
    fireEvent.click(screen.getByRole("button", { name: "本地解析" }));
    expect(await screen.findByText(/解析出 \d+ 项候选/)).toBeInTheDocument();

    // 未勾选任何候选时写入按钮禁用；一键全确认后启用。
    expect(screen.getByRole("button", { name: /写入项目/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "一键全确认" }));
    expect(screen.getByRole("button", { name: /写入项目/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /写入项目/ }));

    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    const next = onApply.mock.calls[0][0] as ReturnType<typeof createProject>;
    expect(next.people).toHaveLength(3);
    expect(next.relationships).toHaveLength(2);
    expect(next.people.some((person) => person.name === "玛丽露")).toBe(true);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("commits edits made to relationship and event candidates", async () => {
    const project = createProject("解析", "project-editable-candidates");
    const onApply = vi.fn();
    render(<SentenceParsePanel project={project} aiConfiguration={AI_CONFIGURATION} onApply={onApply} onClose={() => undefined} />);

    await parseAndSelectAll();
    fireEvent.change(screen.getAllByLabelText(/关系名称$/)[0], { target: { value: "引荐人" } });
    fireEvent.change(screen.getAllByLabelText(/关系类型$/)[0], { target: { value: "contact" } });
    fireEvent.change(screen.getAllByLabelText(/事件标题$/)[0], { target: { value: "离开管教所" } });
    fireEvent.click(screen.getByRole("button", { name: /写入项目/ }));

    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    const next = onApply.mock.calls[0][0] as ReturnType<typeof createProject>;
    expect(next.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ forwardLabel: "引荐人", kind: "contact" }),
    ]));
    expect(next.people.some((person) => person.events.some((event) => event.title === "离开管教所"))).toBe(true);
  });
  it("waits for the apply promise to settle before closing the panel", async () => {
    const project = createProject("解析", "project-parse");
    let resolveApply: (() => void) | undefined;
    const onApply = vi.fn(() => new Promise<void>((resolve) => { resolveApply = resolve; }));
    const onClose = vi.fn();
    render(<SentenceParsePanel project={project} aiConfiguration={AI_CONFIGURATION} onApply={onApply} onClose={onClose} />);

    await parseAndSelectAll();
    fireEvent.click(screen.getByRole("button", { name: /写入项目/ }));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));

    // 落库未完成前面板保持打开，避免用户立刻刷新丢数据。
    expect(onClose).not.toHaveBeenCalled();
    resolveApply?.();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
