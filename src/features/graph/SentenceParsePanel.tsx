import { useState, type ReactNode } from "react";
import { applyParseResult } from "../../domain/parsing/applyParseResult";
import { ruleParser } from "../../domain/parsing/ruleParser";
import type { ParseResult } from "../../domain/parsing/types";
import type { ProjectDocument, RelationshipKind } from "../../domain/model";
import { requestAiParse, type AiConfiguration } from "../ai/aiClient";

interface SentenceParsePanelProps {
  project: ProjectDocument;
  initialSentence?: string;
  aiConfiguration: AiConfiguration;
  onApply: (next: ProjectDocument) => void | Promise<void>;
  onClose: () => void;
}

export function SentenceParsePanel({ project, initialSentence, aiConfiguration, onApply, onClose }: SentenceParsePanelProps) {
  const [sentence, setSentence] = useState(initialSentence ?? "");
  const [result, setResult] = useState<ParseResult>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [narratorPersonId, setNarratorPersonId] = useState("");
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState<"idle" | "done">("idle");
  const [aiError, setAiError] = useState("");

  const parse = () => {
    if (!sentence.trim()) return;
    setParsing(true);
    setStatus("idle");
    setSelected(new Set());
    const narrator = project.people.find((person) => person.id === narratorPersonId);
    setResult(ruleParser.parse(sentence.trim(), { existingPeople: project.people.map((person) => ({ id: person.id, name: person.name, aliases: person.aliases })), narratorName: narrator?.name }));
    setParsing(false);
  };
  const parseWithAi = async () => {
    if (!sentence.trim() || parsing) return;
    setParsing(true);
    setAiError("");
    setStatus("idle");
    setSelected(new Set());
    try {
      const narrator = project.people.find((person) => person.id === narratorPersonId);
      setResult(await requestAiParse(aiConfiguration, sentence.trim(), { existingPeople: project.people.map((person) => ({ id: person.id, name: person.name, aliases: person.aliases })), narratorName: narrator?.name }));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI 解析失败，请稍后重试。");
    } finally {
      setParsing(false);
    }
  };
  const updateResult = (update: (current: ParseResult) => ParseResult) => setResult((current) => current ? update(current) : current);
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const selectAll = () => {
    if (!result) return;
    setSelected(new Set([...result.people, ...result.relationships, ...result.features, ...result.locations, ...result.events].map((item) => item.id)));
  };
  const updatePersonMapping = (candidateId: string, existingPersonId: string) => updateResult((current) => ({ ...current, people: current.people.map((person) => person.id === candidateId ? { ...person, existingPersonId: existingPersonId || undefined } : person) }));
  const updatePerson = (id: string, name: string) => updateResult((current) => ({ ...current, people: current.people.map((item) => item.id === id ? { ...item, name } : item) }));
  const updateRelationship = (id: string, patch: Partial<ParseResult["relationships"][number]>) => updateResult((current) => ({ ...current, relationships: current.relationships.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const updateFeature = (id: string, tag: string) => updateResult((current) => ({ ...current, features: current.features.map((item) => item.id === id ? { ...item, tag } : item) }));
  const updateLocation = (id: string, name: string) => updateResult((current) => ({ ...current, locations: current.locations.map((item) => item.id === id ? { ...item, name } : item) }));
  const updateEvent = (id: string, patch: Partial<ParseResult["events"][number]>) => updateResult((current) => ({ ...current, events: current.events.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const apply = async () => {
    if (!result || applying) return;
    const withNarrator = narratorPersonId ? { ...result, people: result.people.map((person) => person.isNarrator ? { ...person, existingPersonId: narratorPersonId } : person) } : result;
    const requiredPeople = new Set([
      ...withNarrator.relationships.filter((item) => selected.has(item.id)).flatMap((item) => [item.sourcePersonId, item.targetPersonId]),
      ...withNarrator.features.filter((item) => selected.has(item.id)).map((item) => item.personId),
      ...withNarrator.events.filter((item) => selected.has(item.id)).map((item) => item.personId),
      ...withNarrator.locations.filter((item) => selected.has(item.id)).flatMap((item) => item.peopleIds),
    ]);
    const mark = (id: string) => selected.has(id) || requiredPeople.has(id) ? "confirmed" as const : "rejected" as const;
    const confirmed: ParseResult = {
      ...withNarrator,
      people: withNarrator.people.map((person) => ({ ...person, status: mark(person.id) })),
      relationships: withNarrator.relationships.map((relationship) => ({ ...relationship, status: mark(relationship.id) })),
      features: withNarrator.features.map((feature) => ({ ...feature, status: mark(feature.id) })),
      locations: withNarrator.locations.map((location) => ({ ...location, status: mark(location.id) })),
      events: withNarrator.events.map((event) => ({ ...event, status: mark(event.id) })),
    };
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
  const candidateCount = result ? result.people.length + result.relationships.length + result.features.length + result.locations.length + result.events.length : 0;
  const candidatePeople = result?.people ?? [];
  const candidateName = (id: string) => candidatePeople.find((person) => person.id === id)?.name ?? "?";
  const stopToggle = (event: React.MouseEvent) => event.stopPropagation();

  return <aside className="parse-panel" aria-label="句子解析">
    <header className="parse-panel__header"><h3>句子解析</h3><button type="button" aria-label="关闭句子解析" onClick={onClose}>×</button></header>
    <p className="parse-panel__note">粘贴阅读中划选的文本，解析出人物、关系、特征、地点与事件；候选默认不会写入，需由你确认。</p>
    {project.graphType === "geography" && <p className="parse-panel__note">确认地点候选后会自动匹配：唯一地点直接落点，同名地点进入“位置待匹配”供你选择；未提到地点的人物同样保留在该托盘。</p>}
    <label htmlFor="parse-sentence">划选文本</label><textarea id="parse-sentence" value={sentence} onChange={(event) => setSentence(event.target.value)} rows={3} placeholder="例如：迪安出了管教所，将首度前来纽约找我…" />
    <label htmlFor="parse-narrator">"我"映射</label><select id="parse-narrator" value={narratorPersonId} onChange={(event) => setNarratorPersonId(event.target.value)}><option value="">新建"我"</option>{project.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
    <div className="parse-panel__actions"><button className="button button--ghost" type="button" disabled={!sentence.trim() || parsing} onClick={parse}>{parsing ? "解析中…" : "本地解析"}</button><button className="button button--primary" type="button" disabled={!sentence.trim() || parsing} onClick={() => void parseWithAi()}>{parsing ? "解析中…" : "AI 智能解析"}</button>{result && <button className="button button--ghost" type="button" onClick={selectAll}>一键全确认</button>}</div>
    {aiError && <p className="form-error" role="alert">{aiError}</p>}
    {result && <div className="parse-result">
      <p className="parse-result__summary">解析出 {candidateCount} 项候选，勾选后写入。</p>{result.warnings.length > 0 && <p className="form-error" role="status">AI 提示：{result.warnings.join("；")}</p>}
      <ParseGroup title="人物" selected={selected} onToggle={toggle} items={result.people.map((item) => ({ id: item.id, label: `${item.name}${item.existingPersonId ? `（匹配已有：${peopleById.get(item.existingPersonId)?.name ?? "?"}）` : item.isNarrator ? "（叙述者）" : "（新人物）"}`, evidence: item.evidence.map((e) => e.reason).join("；"), editor: <div className="parse-item__editor" onClick={stopToggle}><input aria-label={`${item.id} 人物名称`} value={item.name} onChange={(event) => updatePerson(item.id, event.target.value)} /><select aria-label={`${item.id} 的写入位置`} value={item.existingPersonId ?? ""} onChange={(event) => updatePersonMapping(item.id, event.target.value)}><option value="">新建人物</option>{project.people.map((person) => <option key={person.id} value={person.id}>合并到：{person.name}</option>)}</select></div> }))} />
      <ParseGroup title="关系" selected={selected} onToggle={toggle} items={result.relationships.map((item) => ({ id: item.id, label: `${candidateName(item.sourcePersonId)} → ${candidateName(item.targetPersonId)}：${item.forwardLabel}${item.needsConfirmation ? `（待确认：${item.clarification || "请核对角色或方向"}）` : ""}`, evidence: item.evidence.map((e) => e.reason).join("；"), editor: <div className="parse-item__editor" onClick={stopToggle}><select aria-label={`${item.id} 起点`} value={item.sourcePersonId} onChange={(event) => updateRelationship(item.id, { sourcePersonId: event.target.value })}>{candidatePeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><select aria-label={`${item.id} 终点`} value={item.targetPersonId} onChange={(event) => updateRelationship(item.id, { targetPersonId: event.target.value })}>{candidatePeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><select aria-label={`${item.id} 关系类型`} value={item.kind} onChange={(event) => { const kind = event.target.value as RelationshipKind; updateRelationship(item.id, { kind, symmetric: kind === "undirected" }); }}><option value="directed">单向关系</option><option value="bidirectional">双向关系</option><option value="undirected">共同关系</option><option value="contact">曾有联系</option></select><input aria-label={`${item.id} 关系名称`} value={item.forwardLabel} onChange={(event) => updateRelationship(item.id, { forwardLabel: event.target.value })} /></div> }))} />
      <ParseGroup title="特征" selected={selected} onToggle={toggle} items={result.features.map((item) => ({ id: item.id, label: `${candidateName(item.personId)}：${item.tag}`, evidence: item.evidence.map((e) => e.reason).join("；"), editor: <div className="parse-item__editor" onClick={stopToggle}><input aria-label={`${item.id} 特征标签`} value={item.tag} onChange={(event) => updateFeature(item.id, event.target.value)} /></div> }))} />
      <ParseGroup title="地点" selected={selected} onToggle={toggle} items={result.locations.map((item) => ({ id: item.id, label: `${item.name}${item.longitude !== undefined ? "（已解析坐标）" : "（待解析坐标）"}`, evidence: item.evidence.map((e) => e.reason).join("；"), editor: <div className="parse-item__editor" onClick={stopToggle}><input aria-label={`${item.id} 地点名称`} value={item.name} onChange={(event) => updateLocation(item.id, event.target.value)} /></div> }))} />
      <ParseGroup title="事件" selected={selected} onToggle={toggle} items={result.events.map((item) => ({ id: item.id, label: `${candidateName(item.personId)}：${item.title}`, evidence: item.evidence.map((e) => e.reason).join("；"), editor: <div className="parse-item__editor" onClick={stopToggle}><input aria-label={`${item.id} 事件标题`} value={item.title} onChange={(event) => updateEvent(item.id, { title: event.target.value })} /><textarea aria-label={`${item.id} 事件说明`} value={item.description ?? ""} rows={2} onChange={(event) => updateEvent(item.id, { description: event.target.value || undefined })} /></div> }))} />
      <button className="button button--primary" type="button" disabled={selected.size === 0 || applying} onClick={() => void apply()}>写入项目（{selected.size} 项）</button>
    </div>}
    {status === "done" && <p className="parse-panel__done" role="status">已写入项目，可在图谱中查看。</p>}
  </aside>;
}

function ParseGroup({ title, items, selected, onToggle }: { title: string; items: Array<{ id: string; label: string; evidence: string; editor?: ReactNode }>; selected: Set<string>; onToggle: (id: string) => void }) {
  if (!items.length) return null;
  return <section className="parse-group"><h4>{title}（{items.length}）</h4>{items.map((item) => <label className="parse-item" key={item.id}><input type="checkbox" checked={selected.has(item.id)} onChange={() => onToggle(item.id)} /><span><strong>{item.label}</strong>{item.evidence && <small>{item.evidence}</small>}{item.editor}</span></label>)}</section>;
}
