import type { ParseResult } from "./types";

// 解析上下文：当前项目已有的人物用于匹配与指代映射。
export interface ParserContext {
  existingPeople: Array<{ id: string; name: string; aliases: string[] }>;
  /** "我"映射的目标人物名（缺省时解析结果新建叙述者节点）。 */
  narratorName?: string;
}

// 可插拔解析器接口：v1 为本地规则引擎（ruleParser），LLM 增强实现同一接口。
export interface SentenceParser {
  parse(sentence: string, context: ParserContext): ParseResult;
}
