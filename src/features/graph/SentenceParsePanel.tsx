import { useState } from "react";
import { applyParseResult } from "../../domain/parsing/applyParseResult";
import { ruleParser } from "../../domain/parsing/ruleParser";
import type { ParseResult } from "../../domain/parsing/types";
import type { ProjectDocument } from "../../domain/model";

interface SentenceParsePanelProps {
  project: ProjectDocument;
  initialSentence?: string;
  onApply: (next: ProjectDocument) => void | Promise<void>;
  onClose: () => void;
}

// 网页端句子解析面板：划句/粘贴文本 → 规则引擎解析 → 候选分组确认（可一键全确认）→ 写入项目。
// 解析结果默认 pending，只有勾选的候选会写入；"我"可映射到已有节点。
export function SentenceParsePanel({ project, initialSentence, onApply, onClose }: SentenceParsePanelProps) {
  const [sentence, setSentence] = useState(initialSentence ?? "");
  const [result, setResult] = useState<ParseResult>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [narratorPersonId, setNarratorPersonId] = useState("");
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState<"idle" | "done">("idle");

  const parse = () => {
    if (!sentence.trim()) return;
    setParsing(true);
    setStatus("idle");
    setSelected(new Set());
    // 解析在本地完成（规则引擎），不发起任何网络请求。
    const narrator = project.people.find((person) => person.id === narratorPersonId);
    const parsed = ruleParser.parse(sentence.trim(), {
      existingPeople: project.people.map((person) => ({ id: person.id, name: person.name, aliases: person.aliases })),
      narratorName: narrator?.name,
    });
    setResult(parsed);
    setParsing(false);
  };

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!result) return;
    const ids = [
      ...result.people.map((item) => item.id),
      ...result.relationships.map((item) => item.id),
      ...result.features.map((item) => item.id),
      ...result.locations.map((item) => item.id),
      ...result.events.map((item) => item.id),
    ];
    setSelected(new Set(ids));
  };

  const apply = async () => {
    if (!result || applying) return;
    const withNarrator = narratorPersonId
      ? { ...result, people: result.people.map((person) => person.isNarrator ? { ...person, existingPersonId: narratorPersonId } : person) }
      : result;
    const mark = (id: string) => (selected.has(id) ? "confirmed" as const : "rejected" as const);
    const confirmed: ParseResult = {
      ...withNarrator,
      people: withNarrator.people.map((person) => ({ ...person, status: mark(person.id) })),
      relationships: withNarrator.relationships.map((relationship) => ({ ...relationship, status: mark(relationship.id) })),
      features: withNarrator.features.map((feature) => ({ ...feature, status: mark(feature.id) })),
      locations: withNarrator.locations.map((location) => ({ ...location, status: mark(location.id) })),
      events: withNarrator.events.map((event) => ({ ...event, status: mark(event.id) })),
    };
    // 写入是"提交"语义：await 保证落库完成后再关闭面板，避免用户立刻刷新/关页丢数据。
    setApplying(true);
    try {
      await onApply(applyParseResult(project, confirmed, { narratorPersonId }));
    } finally {
      setApplying(false);
      setStatus("done");
      setResult(undefined);
      setSelected(new Set());
      setSentence("");
      onClose();
    }
  };

  const peopleById = new Map(project.people.map((person) => [person.id, person]));
  const candidateCount = result
    ? result.people.length + result.relationships.length + result.features.length + result.locations.length + result.events.length
    : 0;

  return (
    <aside className="parse-panel" aria-label="句子解析">
      <header className="parse-panel__header">
        <h3>句子解析</h3>
        <button type="button" aria-label="关闭句子解析" onClick={onClose}>×</button>
      </header>
      <p className="parse-panel__note">粘贴阅读中划选的句子，解析出人物、关系、特征、地点与事件；确认后写入当前项目。</p>
      <label htmlFor="parse-sentence">划选文本</label>
      <textarea id="parse-sentence" value={sentence} onChange={(event) => setSentence(event.target.value)} rows={3} placeholder="例如：迪安出了管教所，将首度前来纽约找我…" />
      <label htmlFor="parse-narrator">"我"映射</label>
      <select id="parse-narrator" value={narratorPersonId} onChange={(event) => setNarratorPersonId(event.target.value)}>
        <option value="">新建"我"</option>
        {project.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select>
      <div className="parse-panel__actions">
        <button className="button button--primary" type="button" disabled={!sentence.trim() || parsing} onClick={parse}>{parsing ? "解析中…" : "解析句子"}</button>
        {result && <button className="button button--ghost" type="button" onClick={selectAll}>一键全确认</button>}
      </div>

      {result && <div className="parse-result">
        <p className="parse-result__summary">解析出 {candidateCount} 项候选，勾选后写入。</p>
        <ParseGroup title="人物" items={result.people.map((item) => ({
          id: item.id,
          label: `${item.name}${item.existingPersonId ? `（匹配已有：${peopleById.get(item.existingPersonId)?.name ?? "?"}）` : item.isNarrator ? "（叙述者）" : "（新人物）"}`,
          evidence: item.evidence.map((e) => e.reason).join("；"),
        }))} selected={selected} onToggle={toggle} />
        <ParseGroup title="关系" items={result.relationships.map((item) => ({
          id: item.id,
          label: `${result.people.find((p) => p.id === item.sourcePersonId)?.name ?? "?"} → ${result.people.find((p) => p.id === item.targetPersonId)?.name ?? "?"}：${item.forwardLabel}`,
          evidence: item.evidence.map((e) => e.reason).join("；"),
        }))} selected={selected} onToggle={toggle} />
        <ParseGroup title="特征" items={result.features.map((item) => ({
          id: item.id,
          label: `${result.people.find((p) => p.id === item.personId)?.name ?? "?"}：${item.tag}`,
          evidence: item.evidence.map((e) => e.reason).join("；"),
        }))} selected={selected} onToggle={toggle} />
        <ParseGroup title="地点" items={result.locations.map((item) => ({
          id: item.id,
          label: `${item.name}${item.longitude !== undefined ? "（已解析坐标）" : "（待解析坐标）"}`,
          evidence: item.evidence.map((e) => e.reason).join("；"),
        }))} selected={selected} onToggle={toggle} />
        <ParseGroup title="事件" items={result.events.map((item) => ({
          id: item.id,
          label: `${result.people.find((p) => p.id === item.personId)?.name ?? "?"}：${item.title}`,
          evidence: item.evidence.map((e) => e.reason).join("；"),
        }))} selected={selected} onToggle={toggle} />
        <button className="button button--primary" type="button" disabled={selected.size === 0 || applying} onClick={() => void apply()}>写入项目（{selected.size} 项）</button>
      </div>}
      {status === "done" && <p className="parse-panel__done" role="status">已写入项目，可在图谱中查看。</p>}
    </aside>
  );
}

function ParseGroup({ title, items, selected, onToggle }: {
  title: string;
  items: Array<{ id: string; label: string; evidence: string }>;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <section className="parse-group">
      <h4>{title}（{items.length}）</h4>
      {items.map((item) => (
        <label className="parse-item" key={item.id}>
          <input type="checkbox" checked={selected.has(item.id)} onChange={() => onToggle(item.id)} />
          <span><strong>{item.label}</strong>{item.evidence && <small>{item.evidence}</small>}</span>
        </label>
      ))}
    </section>
  );
}
