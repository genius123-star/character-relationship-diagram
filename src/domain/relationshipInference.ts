import type { Person, Relationship } from "./model";
import type { RelationshipPath } from "./relationshipPath";

export interface RelationshipInference {
  status: "determined" | "unknown";
  result: string;
  chain: string[];
  labels: string[];
  reason?: string;
}

export type RelationshipInferenceSummary =
  | { status: "determined"; result: string; chains: string[][] }
  | { status: "conflict"; candidates: Array<{ result: string; chain: string[] }> }
  | { status: "unknown"; result: "暂无法确定称谓"; chains: string[][]; reasons: string[] };

const directKinship = new Set(["爸爸", "父亲", "妈妈", "母亲", "儿子", "女儿", "丈夫", "妻子", "哥哥", "弟弟", "姐姐", "妹妹", "爷爷", "奶奶", "外公", "外婆", "孙子", "孙女", "伯父", "叔叔", "姑姑", "舅舅", "姨妈", "侄子", "侄女", "外甥", "外甥女", "大儿子", "二儿子"]);

const labelAliases: Record<string, string> = { 父亲: "爸爸", 母亲: "妈妈" };
const ambiguousLabels = new Set(["父母", "孩子", "子女", "兄弟", "姐妹", "兄弟姐妹", "配偶"]);

const compositions: Record<string, string> = {
  "爸爸>爸爸": "爷爷",
  "爸爸>妈妈": "奶奶",
  "妈妈>爸爸": "外公",
  "妈妈>妈妈": "外婆",
  "爸爸>哥哥": "伯父",
  "爸爸>弟弟": "叔叔",
  "爸爸>姐姐": "姑姑",
  "爸爸>妹妹": "姑姑",
  "妈妈>哥哥": "舅舅",
  "妈妈>弟弟": "舅舅",
  "妈妈>姐姐": "姨妈",
  "妈妈>妹妹": "姨妈",
  "爸爸>爸爸>二儿子": "二叔",
  "哥哥>儿子": "侄子",
  "哥哥>女儿": "侄女",
  "弟弟>儿子": "侄子",
  "弟弟>女儿": "侄女",
  "姐姐>儿子": "外甥",
  "姐姐>女儿": "外甥女",
  "妹妹>儿子": "外甥",
  "妹妹>女儿": "外甥女",
  "儿子>儿子": "孙子",
  "儿子>女儿": "孙女",
  "女儿>儿子": "外孙",
  "女儿>女儿": "外孙女",
};

export function inferRelationship(people: Person[], relationships: Relationship[], path: RelationshipPath): RelationshipInference {
  const chain: string[] = [];
  const labels: string[] = [];
  for (let index = 0; index < path.relationshipIds.length; index += 1) {
    const from = people.find((person) => person.id === path.personIds[index]);
    const to = people.find((person) => person.id === path.personIds[index + 1]);
    const relationship = relationships.find((item) => item.id === path.relationshipIds[index]);
    if (!from || !to || !relationship) return unknown(chain, labels, "关系路径数据不完整");
    if (relationship.targetPersonId === from.id && relationship.sourcePersonId === to.id) {
      labels.push(relationship.forwardLabel);
      chain.push(`${to.name}是${from.name}的${relationship.forwardLabel}`);
      continue;
    }
    if (relationship.sourcePersonId === from.id && relationship.targetPersonId === to.id) {
      const label = relationship.symmetric ? relationship.forwardLabel : relationship.reverseLabel;
      if (!label) return unknown([...chain, `缺少‘${to.name}’相对于‘${from.name}’的反向称谓`], labels, "关系方向信息不足");
      labels.push(label);
      chain.push(`${to.name}是${from.name}的${label}`);
      continue;
    }
    return unknown(chain, labels, "关系路径数据不完整");
  }
  if (labels.some((label) => ambiguousLabels.has(label))) return unknown(chain, labels, "亲属关系信息不足，需要补充性别或长幼");
  const normalizedLabels = labels.map((label) => labelAliases[label] ?? label);
  const result = compositions[normalizedLabels.join(">")] ?? (normalizedLabels.length === 1 && directKinship.has(normalizedLabels[0]) ? normalizedLabels[0] : undefined);
  return result ? { status: "determined", result, chain, labels } : unknown(chain, labels, "称谓规则尚未覆盖或关系不是明确亲属关系");
}

function unknown(chain: string[], labels: string[], reason: string): RelationshipInference {
  return { status: "unknown", result: "暂无法确定称谓", chain, labels, reason };
}

export function summarizeRelationshipInferences(inferences: RelationshipInference[]): RelationshipInferenceSummary {
  const determined = inferences.filter((item) => item.status === "determined");
  const results = [...new Set(determined.map((item) => item.result))];
  if (results.length > 1) return { status: "conflict", candidates: determined.map((item) => ({ result: item.result, chain: item.chain })) };
  if (results.length === 1) return { status: "determined", result: results[0], chains: determined.map((item) => item.chain) };
  return { status: "unknown", result: "暂无法确定称谓", chains: inferences.map((item) => item.chain), reasons: [...new Set(inferences.flatMap((item) => item.reason ? [item.reason] : []))] };
}
