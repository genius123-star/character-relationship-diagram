import { knownPlaces } from "../../features/geography/geocoding";
import type { ParseResult, ParseRelationshipCandidate } from "./types";
import type { ParserContext, SentenceParser } from "./parsing";

// v1 本地规则引擎：启发式解析中文句子，输出带证据的候选结果。
// 已知局限（由 UI 确认与修正兜底）：跨句指代只支持"他/她→最近人物"，
// 关系类型为建议值，新人物识别依赖"叫X的"模式或"主语+动作动词"结构。

const CLAUSE_SPLIT = /[，。；！？,;!?\n]+/;

// 排除词：地点、特征、泛指称谓与代词不当作人物名。
const PLACE_TERMS = new Set(knownPlaces.flatMap((place) => place.terms));
const FEATURE_WORDS = ["漂亮", "美丽", "可爱", "金发", "卷发", "高大", "瘦", "胖", "年轻", "苍老", "温柔", "严厉", "聪明", "勇敢", "善良"];
const STOP_WORDS = new Set(["女孩", "男孩", "人们", "朋友", "恋人", "丈夫", "妻子", "父亲", "母亲", "儿子", "女儿", "我", "你", "他", "她", "它", "他们", "她们", "这个", "那个", "一个", "将", "还", "也", "然后", "后来", "听说"]);

// 关系规则：正则命中 → 建议关系。
interface RelationRule {
  pattern: RegExp;
  label: string;
  kind: ParseRelationshipCandidate["kind"];
  symmetric: boolean;
}

const RELATION_RULES: RelationRule[] = [
  { pattern: /结婚|嫁给|娶了|结为夫妻/, label: "夫妻", kind: "bidirectional", symmetric: true },
  { pattern: /谈恋爱|恋人|对象/, label: "恋人", kind: "bidirectional", symmetric: true },
  { pattern: /找|来找|探望/, label: "朋友", kind: "bidirectional", symmetric: true },
  { pattern: /跟.*敌对|敌人/, label: "敌人", kind: "bidirectional", symmetric: true },
  { pattern: /师生|师父|师傅/, label: "师生", kind: "directed", symmetric: false },
];

const PERSON_START = /^([\u4e00-\u9fa5]{2,4})(出了|前来|来到|去了|离开|找|跟|和|对|与|说|问|告诉|遇见|遇到|看着)/;
const NAMED_PERSON = /叫([\u4e00-\u9fa5]{1,4})的/;
const COMPANION_PERSON = /[跟和与]([\u4e00-\u9fa5]{2,4})(?!的)/;
const PRONOUN = /([他她])/;

const EVENT_PATTERNS = [
  /出了([\u4e00-\u9fa5]{1,8})/,
  /前来([\u4e00-\u9fa5]{1,8})/,
  /来到([\u4e00-\u9fa5]{1,8})/,
  /去了([\u4e00-\u9fa5]{1,8})/,
  /离开([\u4e00-\u9fa5]{1,8})/,
  /遇见([\u4e00-\u9fa5]{1,8})/,
];

function isLikelyName(token: string): boolean {
  if (token.length < 2 || PLACE_TERMS.has(token) || STOP_WORDS.has(token) || FEATURE_WORDS.includes(token)) return false;
  // 排除以虚词开头的误匹配（"将首度""还听说他"等）。
  return ![...STOP_WORDS].some((word) => token.startsWith(word));
}

export class RuleSentenceParser implements SentenceParser {
  parse(sentence: string, context: ParserContext): ParseResult {
    const result: ParseResult = { people: [], relationships: [], features: [], locations: [], events: [], warnings: [] };
    const personByMention = new Map<string, ParseResult["people"][number]>();
    const personById = new Map<string, ParseResult["people"][number]>();
    let lastPersonId: string | undefined;

    const findOrCreatePerson = (name: string, mention: string, reason: string, isNarrator = false): ParseResult["people"][number] => {
      const existing = context.existingPeople.find((person) => person.name === name || person.aliases.includes(name));
      const key = `${mention}::${name}`;
      const cached = personByMention.get(key) ?? (existing ? personByMention.get(existing.name) : undefined);
      if (cached) return cached;
      const person: ParseResult["people"][number] = {
        id: `p${result.people.length}`,
        name,
        mention,
        status: "pending",
        confidence: existing ? 1 : 0.65,
        evidence: [{ fragment: mention, reason }],
        existingPersonId: existing?.id,
        isNarrator,
      };
      result.people.push(person);
      personById.set(person.id, person);
      personByMention.set(key, person);
      if (existing) personByMention.set(existing.name, person);
      return person;
    };

    const clauses = sentence.split(CLAUSE_SPLIT).map((item) => item.trim()).filter(Boolean);
    for (const clause of clauses) {
      const mentionIds: string[] = [];
      let explicitSubjectId: string | undefined;

      // 叙述者"我"
      if (clause.includes("我")) {
        const narrator = findOrCreatePerson(context.narratorName ?? "我", "我", "句子中的叙述者'我'", true);
        mentionIds.push(narrator.id);
      }

      // 已有节点命中
      for (const existing of context.existingPeople) {
        const names = [existing.name, ...existing.aliases];
        const hit = names.find((name) => name && clause.includes(name));
        if (hit) {
          const person = findOrCreatePerson(existing.name, hit, `匹配到已有节点"${existing.name}"`);
          if (!mentionIds.includes(person.id)) mentionIds.push(person.id);
        }
      }

      // "叫X的"模式（新人物）
      const named = clause.match(NAMED_PERSON);
      if (named) {
        const name = named[1];
        if (isLikelyName(name)) {
          const person = findOrCreatePerson(name, name, `由"叫${name}的"识别为新人物`);
          if (!mentionIds.includes(person.id)) mentionIds.push(person.id);
        }
      }

      // 主语 + 动作动词（句首新人物，如"迪安出了管教所"）
      const start = clause.match(PERSON_START);
      if (start && isLikelyName(start[1])) {
        const person = findOrCreatePerson(start[1], start[1], `句首主语"${start[1]}"后接动作动词`);
        if (!mentionIds.includes(person.id)) mentionIds.push(person.id);
        explicitSubjectId = person.id;
      }

      // "跟/和X"（同伴提及，排除"叫X的"已覆盖的情况）
      const companion = clause.match(COMPANION_PERSON);
      if (companion && isLikelyName(companion[1])) {
        const person = findOrCreatePerson(companion[1], companion[1], `由"${companion[0]}"识别为人物`);
        if (!mentionIds.includes(person.id)) mentionIds.push(person.id);
      }

      // 主语：显式句首人物优先；否则动作句继承最近人物；代词"他/她"映射最近人物。
      const pronoun = clause.match(PRONOUN);
      const hasAction = RELATION_RULES.some((rule) => rule.pattern.test(clause)) || EVENT_PATTERNS.some((pattern) => pattern.test(clause)) || knownPlaces.some((place) => place.terms.some((term) => clause.includes(term)));
      const subjectId = explicitSubjectId ?? ((hasAction || pronoun) && lastPersonId ? lastPersonId : undefined);

      // 特征：句中出现的特征词归属到主题人物（描述句无动词时继承最近人物）。
      const featureSubjectId = explicitSubjectId ?? mentionIds[0] ?? lastPersonId;
      if (featureSubjectId) {
        for (const word of FEATURE_WORDS) {
          if (clause.includes(word)) {
            result.features.push({
              id: `f${result.features.length}`,
              personId: featureSubjectId,
              tag: word,
              status: "pending",
              confidence: 0.7,
              evidence: [{ fragment: clause, reason: `句中包含特征词"${word}"` }],
            });
          }
        }
      }

      // 关系：匹配关系动词，端点取句中人物（或代词映射）
      for (const rule of RELATION_RULES) {
        if (!rule.pattern.test(clause)) continue;
        const source = explicitSubjectId ?? subjectId;
        const target = mentionIds.find((id) => id !== source);
        if (source && target) {
          result.relationships.push(createRelationship(result, rule, source, target));
        }
      }

      // 地点：内置词表命中 → 地点候选，关联同句人物
      for (const place of knownPlaces) {
        const term = place.terms.find((item) => clause.includes(item));
        if (!term) continue;
        result.locations.push({
          id: `l${result.locations.length}`,
          name: place.label,
          longitude: place.longitude,
          latitude: place.latitude,
          countryCode: place.countryCode,
          continent: place.continent,
          status: "pending",
          confidence: 0.9,
          evidence: [{ fragment: clause, reason: `句中提及地点"${place.label}"` }],
          peopleIds: subjectId ? [...new Set([subjectId, ...mentionIds])] : [...mentionIds],
        });
      }

      // 事件：动作短语 → 事件候选（归属主题人物）
      if (subjectId) {
        for (const pattern of EVENT_PATTERNS) {
          const match = clause.match(pattern);
          if (!match) continue;
          const title = clause.slice(Math.max(0, clause.indexOf(match[0])), clause.indexOf(match[0]) + match[0].length);
          result.events.push({
            id: `e${result.events.length}`,
            personId: subjectId,
            title,
            status: "pending",
            confidence: 0.6,
            evidence: [{ fragment: clause, reason: `句中包含事件短语"${match[0]}"` }],
          });
          break;
        }
      }

      // 更新最近人物：显式主语优先；否则取首个非叙述者提及（"找我"中的"我"不夺主语）。
      if (explicitSubjectId) {
        lastPersonId = explicitSubjectId;
      } else {
        const firstNonNarrator = mentionIds.find((id) => !personById.get(id)?.isNarrator);
        if (firstNonNarrator) lastPersonId = firstNonNarrator;
      }
    }

    return result;
  }
}

function createRelationship(
  result: ParseResult,
  rule: RelationRule,
  sourcePersonId: string,
  targetPersonId: string,
): ParseRelationshipCandidate {
  return {
    id: `r${result.relationships.length}`,
    sourcePersonId,
    targetPersonId,
    forwardLabel: rule.label,
    kind: rule.kind,
    symmetric: rule.symmetric,
    status: "pending",
    confidence: 0.75,
    evidence: [{ fragment: sourcePersonId, reason: `命中关系规则"${rule.label}"` }],
  };
}

export const ruleParser: SentenceParser = new RuleSentenceParser();
