import type { Person, ProfileBlockKind } from "../../domain/model";

export const profileBlockLabels: Record<ProfileBlockKind, string> = {
  aliases: "别名/昵称",
  firstAppearance: "时间/章节",
  affiliation: "地区/势力",
  summary: "人物简介",
  personalityTags: "性格标签",
  identityTags: "身份标签",
  events: "相关事件",
  notes: "备注",
};

export const allProfileBlocks = Object.keys(profileBlockLabels) as ProfileBlockKind[];

export function getVisibleProfileBlocks(person: Person): ProfileBlockKind[] {
  if (person.profileBlockOrder) return person.profileBlockOrder;
  return allProfileBlocks.filter((kind) => {
    switch (kind) {
      case "aliases": return person.aliases.length > 0;
      case "firstAppearance": return Boolean(person.firstAppearance);
      case "affiliation": return Boolean(person.affiliation);
      case "summary": return Boolean(person.summary);
      case "personalityTags": return person.personalityTags.length > 0;
      case "identityTags": return person.identityTags.length > 0;
      case "events": return person.events.length > 0;
      case "notes": return Boolean(person.notes);
    }
  });
}

export function moveProfileBlock(order: ProfileBlockKind[], kind: ProfileBlockKind, direction: -1 | 1): ProfileBlockKind[] {
  const from = order.indexOf(kind);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= order.length) return order;
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
