import type { ProjectDocument, Relationship, RelationshipKind } from "../../domain/model";
import type { ParserContext } from "../../domain/parsing/parsing";
import type { ParseEvidence, ParseResult } from "../../domain/parsing/types";

export interface AiConfiguration {
  apiKey: string;
  model: string;
  /** OpenAI Chat Completions 兼容的服务根地址；第三方中转或私有服务时填写。 */
  baseUrl?: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

const relationshipKinds = new Set<RelationshipKind>(["directed", "bidirectional", "undirected", "contact"]);
const maximumAiInputCharacters = 20_000;

export function resolveAiEndpoint(model: string, baseUrl?: string): string {
  const supplied = baseUrl?.trim();
  const inferred = model.trim().toLowerCase().startsWith("deepseek")
    ? "https://api.deepseek.com/v1"
    : /^(gpt|o1|o3|o4)/.test(model.trim().toLowerCase())
      ? "https://api.openai.com/v1"
      : "";
  const root = supplied || inferred;
  if (!root) throw new Error("无法推断该模型的服务地址，请在高级设置填写 Base URL。");
  const withProtocol = /^https?:\/\//i.test(root) ? root : `https://${root}`;
  const normalized = withProtocol.replace(/\/+$/, "");
  const endpoint = normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error("Base URL 格式无效，请填写可访问的地址。"); }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !loopback) throw new Error("为保护 API Key，Base URL 必须使用 HTTPS（本机 localhost 除外）。");
  return endpoint;
}

export async function requestAiParse(configuration: AiConfiguration, text: string, context: ParserContext): Promise<ParseResult> {
  const content = await requestCompletion(configuration, [
    { role: "system", content: parseSystemPrompt },
    { role: "user", content: `原文：\n${text}\n\n已有节点（只有确有对应时才填写 existingPersonId）：\n${JSON.stringify(context.existingPeople)}` },
  ]);
  return parseAiParseResult(content, new Set(context.existingPeople.map((person) => person.id)));
}

export async function requestSubgraphSummary(configuration: AiConfiguration, project: ProjectDocument, personIds: string[], relationshipIds: string[]): Promise<string> {
  const chosenPeople = project.people.filter((person) => personIds.includes(person.id));
  const chosenRelationships = project.relationships.filter((relationship) => relationshipIds.includes(relationship.id));
  if (!chosenPeople.length && !chosenRelationships.length) throw new Error("请至少选择一个人物或一条关系。");
  const peopleById = new Map(project.people.map((person) => [person.id, person.name]));
  const relationView = chosenRelationships.map((relation) => presentRelationship(relation, peopleById));
  return requestCompletion(configuration, [
    { role: "system", content: "你是关系图谱分析助手。只基于用户提供的子图事实，用简洁中文总结人物/理论脉络、关键关系与不确定处。不得补充未提供的新事实；若信息不足，直接说明。" },
    { role: "user", content: JSON.stringify({ people: chosenPeople.map(({ id, name, aliases, summary, affiliation, personalityTags, identityTags, firstAppearance }) => ({ id, name, aliases, summary, affiliation, personalityTags, identityTags, firstAppearance })), relationships: relationView }) },
  ]);
}

async function requestCompletion(configuration: AiConfiguration, messages: Array<{ role: "system" | "user"; content: string }>): Promise<string> {
  const apiKey = configuration.apiKey.trim();
  const model = configuration.model.trim();
  if (!apiKey) throw new Error("请填写 API Key。");
  if (!model) throw new Error("请填写模型名称。");
  let response: Response;
  const inputLength = messages.reduce((total, message) => total + message.content.length, 0);
  if (inputLength > maximumAiInputCharacters) throw new Error(`本次 AI 输入超过 ${maximumAiInputCharacters.toLocaleString()} 个字符，请缩小文本或子图范围。`);

  try {
    response = await fetch(resolveAiEndpoint(model, configuration.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.2 }),
    });
  } catch {
    throw new Error("无法连接 AI 服务，请检查 Base URL、网络连接或该服务的 CORS 设置。");
  }
  const body = await response.json().catch(() => ({})) as ChatCompletionResponse;
  if (!response.ok) throw new Error(body.error?.message || `模型请求失败（HTTP ${response.status}）。`);
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("模型没有返回可用内容。");
  return content;
}

export function parseAiParseResult(content: string, existingPersonIds = new Set<string>()): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(stripCodeFence(content));
  } catch {
    throw new Error("模型返回的不是有效 JSON，请重试或更换模型。 ");
  }
  if (!raw || typeof raw !== "object") throw new Error("模型返回的候选格式无效。");
  const data = raw as Record<string, unknown>;
  const people = list(data.people).flatMap((item, index) => {
    const candidate = object(item);
    const id = text(candidate.id) || `ai-person-${index + 1}`;
    const name = text(candidate.name);
    if (!name) return [];
    const existingPersonId = text(candidate.existingPersonId);
    return [{ id, name, mention: text(candidate.mention) || name, status: "pending" as const, confidence: confidence(candidate.confidence), evidence: evidence(candidate.evidence), ...(existingPersonId && existingPersonIds.has(existingPersonId) ? { existingPersonId } : {}), ...(candidate.isNarrator === true ? { isNarrator: true } : {}) }];
  });
  const personIds = new Set(people.map((person) => person.id));
  const warnings = list(data.warnings).map(text).filter(Boolean);
  // 兼容模型使用候选 ID、人物名称或原文提及来表达关系端点；最终仍必须解析到本次候选人物。
  const personIdByReference = new Map(people.flatMap((person) => [[person.id, person.id], [person.name, person.id], [person.mention, person.id]]));
  const relationships = list(data.relationships).flatMap((item, index) => {
    const candidate = object(item);
    const sourcePersonId = personIdByReference.get(firstText(candidate, ["sourcePersonId", "source", "sourcePersonName", "from"]));
    const targetPersonId = personIdByReference.get(firstText(candidate, ["targetPersonId", "target", "targetPersonName", "to"]));
    const forwardLabel = firstText(candidate, ["forwardLabel", "label", "relationship", "relation", "type"]);
    if (!sourcePersonId || !targetPersonId || sourcePersonId === targetPersonId || !forwardLabel) return [];
    const requestedKind = text(candidate.kind) as RelationshipKind;
    const kind = relationshipKinds.has(requestedKind) ? requestedKind : candidate.symmetric === true ? "undirected" as const : "directed" as const;
    const needsConfirmation = candidate.needsConfirmation === true || candidate.roleUncertain === true;
    const clarification = firstText(candidate, ["clarification", "confirmationReason", "uncertainty"]);
    if (needsConfirmation) warnings.push(`AI 关系“${forwardLabel}”需要确认：${clarification || "原文不足以确定角色或方向。"}`);
    return [{ id: text(candidate.id) || `ai-relationship-${index + 1}`, sourcePersonId, targetPersonId, forwardLabel, kind, symmetric: kind === "undirected", status: "pending" as const, confidence: confidence(candidate.confidence), evidence: evidence(candidate.evidence), ...(needsConfirmation ? { needsConfirmation: true, clarification: clarification || "原文不足以确定角色或方向。" } : {}) }];
  });
  const features = list(data.features).flatMap((item, index) => candidateForPerson(item, personIds, index, "feature", (candidate, id, personId) => ({ id, personId, tag: text(candidate.tag), status: "pending" as const, confidence: confidence(candidate.confidence), evidence: evidence(candidate.evidence) }), (value) => Boolean(value.tag)));
  const events = list(data.events).flatMap((item, index) => candidateForPerson(item, personIds, index, "event", (candidate, id, personId) => ({ id, personId, title: text(candidate.title), description: text(candidate.description) || undefined, status: "pending" as const, confidence: confidence(candidate.confidence), evidence: evidence(candidate.evidence) }), (value) => Boolean(value.title)));
  const locations = list(data.locations).flatMap((item, index) => {
    const candidate = object(item);
    const name = text(candidate.name);
    const peopleIds = list(candidate.peopleIds).map(text).filter((id) => personIds.has(id));
    if (!name || !peopleIds.length) return [];
    return [{ id: text(candidate.id) || `ai-location-${index + 1}`, name, ...(number(candidate.longitude) !== undefined ? { longitude: number(candidate.longitude) } : {}), ...(number(candidate.latitude) !== undefined ? { latitude: number(candidate.latitude) } : {}), countryCode: text(candidate.countryCode) || undefined, continent: text(candidate.continent) || undefined, status: "pending" as const, confidence: confidence(candidate.confidence), evidence: evidence(candidate.evidence), peopleIds }];
  });
  return { people, relationships, features, locations, events, warnings };
}

const parseSystemPrompt = `从用户提供的中文文本中提取候选关系图数据。只输出 JSON 对象，不使用 Markdown。结构为 {people,relationships,features,locations,events,warnings}。每个候选必须有 id、confidence(0-1)、evidence:[{fragment,reason}]，证据必须引用原文并说明推理依据。people 有 name、mention，可选 existingPersonId/isNarrator；relationships 的 sourcePersonId/targetPersonId 必须严格引用同一响应中 people 的 id，且文本中每一条明确的人物关系都必须生成一项关系候选，不能只返回人物。关系项有 forwardLabel、kind（directed、bidirectional、undirected、contact）和 symmetric。关系名称不是固定词表：根据原文事实自由表达。若能从原文或明确上下文判断角色与方向，输出 directed，forwardLabel 必须描述起点对终点的关系；例如“林舟指导陈晚”或“陈晚拜林舟为师”都写为 sourcePersonId:"林舟",targetPersonId:"陈晚",forwardLabel:"老师",kind:"directed"，并在 evidence.reason 说明依据。若只出现“林舟与陈晚是师生”且没有可靠证据区分老师和学生，不能猜测：输出 forwardLabel:"师生",kind:"bidirectional",needsConfirmation:true,clarification:"请确认谁是老师、谁是学生"。同样地，任何角色、方向或关系事实证据不足时，都保留最忠实的关系表达、设置 needsConfirmation:true，并说明需要确认的内容。undirected 用于文本明确双方对等的关系；contact 用于仅能确认发生过接触。features 有 personId/tag；locations 有 name/peopleIds，可不给坐标；events 有 personId/title/description。宁可标记不确定也不要编造；所有项目都是待用户确认的候选。`;
function presentRelationship(relation: Relationship, peopleById: Map<string, string | undefined>) {
  return { source: peopleById.get(relation.sourcePersonId) ?? relation.sourcePersonId, target: peopleById.get(relation.targetPersonId) ?? relation.targetPersonId, label: relation.forwardLabel, reverseLabel: relation.reverseLabel, kind: relation.kind, symmetric: relation.symmetric, description: relation.description, startsAt: relation.startsAt, endsAt: relation.endsAt };
}
function stripCodeFence(value: string) { return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); }
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function firstText(candidate: Record<string, unknown>, fields: string[]): string { for (const field of fields) { const value = text(candidate[field]); if (value) return value; } return ""; }
function number(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function confidence(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5; }
function evidence(value: unknown): ParseEvidence[] { return list(value).flatMap((item) => { const itemObject = object(item); const fragment = text(itemObject.fragment); const reason = text(itemObject.reason); return fragment || reason ? [{ fragment, reason }] : []; }); }
function candidateForPerson<T>(item: unknown, personIds: Set<string>, index: number, type: string, create: (candidate: Record<string, unknown>, id: string, personId: string) => T, valid: (value: T) => boolean): T[] { const candidate = object(item); const personId = text(candidate.personId); if (!personIds.has(personId)) return []; const value = create(candidate, text(candidate.id) || `ai-${type}-${index + 1}`, personId); return valid(value) ? [value] : []; }
