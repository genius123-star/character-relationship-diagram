import type { Person } from "./model";

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}

export function searchPeople(people: Person[], query: string): Person[] {
  const keyword = normalize(query.trim());
  if (!keyword) return [];
  return people.filter((person) => [
    person.name,
    ...person.aliases,
    person.summary,
    person.affiliation,
    ...person.personalityTags,
    ...person.identityTags,
  ].some((value) => value && normalize(value).includes(keyword)));
}
