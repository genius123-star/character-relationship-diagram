import type { RelationshipKind } from "../model";

// 解析候选状态：默认 pending，用户确认后 confirmed，忽略后 rejected。
export type ParseCandidateStatus = "pending" | "confirmed" | "rejected";

// 解析证据：结果来自原文哪一段、为什么这样判断，供用户核查与修正。
export interface ParseEvidence {
  fragment: string;
  reason: string;
}

export interface ParsePersonCandidate {
  id: string;
  name: string;
  /** 原文提及形式（如"迪安"、"我"、"玛丽露"）。 */
  mention: string;
  status: ParseCandidateStatus;
  confidence: number;
  evidence: ParseEvidence[];
  /** 若命中项目中已有节点，写入该节点 id，确认时合并而非新建。 */
  existingPersonId?: string;
  /** 是否为叙述者"我"（映射由调用方在 context 中提供）。 */
  isNarrator?: boolean;
}

export interface ParseRelationshipCandidate {
  id: string;
  sourcePersonId: string;
  targetPersonId: string;
  forwardLabel: string;
  kind: RelationshipKind;
  symmetric: boolean;
  status: ParseCandidateStatus;
  confidence: number;
  evidence: ParseEvidence[];
}

export interface ParseFeatureCandidate {
  id: string;
  personId: string;
  tag: string;
  status: ParseCandidateStatus;
  confidence: number;
  evidence: ParseEvidence[];
}

export interface ParseLocationCandidate {
  id: string;
  name: string;
  /** 坐标在确认阶段由 geocodeCandidates 解析填充（规则引擎只负责地名识别）。 */
  longitude?: number;
  latitude?: number;
  countryCode?: string;
  continent?: string;
  status: ParseCandidateStatus;
  confidence: number;
  evidence: ParseEvidence[];
  /** 与该地点关联的人物候选 id（如"迪安前来纽约"）。 */
  peopleIds: string[];
}

export interface ParseEventCandidate {
  id: string;
  personId: string;
  title: string;
  description?: string;
  status: ParseCandidateStatus;
  confidence: number;
  evidence: ParseEvidence[];
}

export interface ParseResult {
  people: ParsePersonCandidate[];
  relationships: ParseRelationshipCandidate[];
  features: ParseFeatureCandidate[];
  locations: ParseLocationCandidate[];
  events: ParseEventCandidate[];
  /** 低置信或无法归类的提示，随面板展示。 */
  warnings: string[];
}
