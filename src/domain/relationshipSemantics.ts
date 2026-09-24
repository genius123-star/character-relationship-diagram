import type { RelationshipKind } from "./model";

/**
 * 关系类型只描述线条的方向结构，不规定可使用的关系名称。
 * 名称由用户或 AI 根据原文事实自由填写；此处仅提供不会阻塞输入的灰色示例。
 */
export function relationshipPlaceholder(kind: RelationshipKind): string {
  switch (kind) {
    case "directed": return "例如：老师、引荐人；起点对终点的关系";
    case "bidirectional": return "例如：师生、亲属；双方关系尚不分角色";
    case "undirected": return "例如：好友、竞争者；双方对等关系";
    case "contact": return "例如：认识、同场出现；双方曾有接触";
  }
}