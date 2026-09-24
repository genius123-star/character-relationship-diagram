import { useState, type Dispatch, type SetStateAction } from "react";
import type { ProjectDocument } from "../../domain/model";
import { requestSubgraphSummary, type AiConfiguration } from "../ai/aiClient";

interface AiSummaryPanelProps {
  project: ProjectDocument;
  aiConfiguration: AiConfiguration;
  initialPersonId?: string;
  initialRelationshipId?: string;
  onClose: () => void;
}

// 总结严格读取勾选子图；返回文本不写回项目，也不作为新的图谱事实。
export function AiSummaryPanel({ project, aiConfiguration, initialPersonId, initialRelationshipId, onClose }: AiSummaryPanelProps) {
  const [personIds, setPersonIds] = useState<Set<string>>(() => new Set(initialPersonId ? [initialPersonId] : []));
  const [relationshipIds, setRelationshipIds] = useState<Set<string>>(() => new Set(initialRelationshipId ? [initialRelationshipId] : []));
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const toggle = (set: Dispatch<SetStateAction<Set<string>>>, id: string) => set((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const summarize = async () => {
    setLoading(true); setError(""); setSummary("");
    try { setSummary(await requestSubgraphSummary(aiConfiguration, project, [...personIds], [...relationshipIds])); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "AI 总结失败，请稍后重试。"); }
    finally { setLoading(false); }
  };
  return <aside className="parse-panel ai-summary-panel" aria-label="AI 关系总结">
    <header className="parse-panel__header"><h3>AI 关系总结</h3><button type="button" aria-label="关闭 AI 关系总结" onClick={onClose}>×</button></header>
    <p className="parse-panel__note">只选择你要分析的子图。AI 只会看到这些节点与关系，生成的文字不会写回图谱。</p>
    <section className="parse-group"><h4>人物（{personIds.size}）</h4>{project.people.map((person) => <label className="parse-item" key={person.id}><input type="checkbox" checked={personIds.has(person.id)} onChange={() => toggle(setPersonIds, person.id)} /><span><strong>{person.name}</strong></span></label>)}</section>
    <section className="parse-group"><h4>关系（{relationshipIds.size}）</h4>{project.relationships.map((relationship) => <label className="parse-item" key={relationship.id}><input type="checkbox" checked={relationshipIds.has(relationship.id)} onChange={() => toggle(setRelationshipIds, relationship.id)} /><span><strong>{project.people.find((person) => person.id === relationship.sourcePersonId)?.name ?? "?"} → {project.people.find((person) => person.id === relationship.targetPersonId)?.name ?? "?"}：{relationship.forwardLabel}</strong></span></label>)}</section>
    <button className="button button--primary" type="button" disabled={loading || (personIds.size === 0 && relationshipIds.size === 0)} onClick={() => void summarize()}>{loading ? "总结中…" : "生成关系总结"}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {summary && <section className="ai-summary-output" aria-live="polite"><h4>总结结果</h4><p>{summary}</p></section>}
  </aside>;
}
