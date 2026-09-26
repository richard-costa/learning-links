export const STATUSES = ["planned", "learning", "learned", "later"] as const;
export const RELATIONSHIP_KINDS = [
  "prerequisite",
  "helpful",
  "related",
] as const;

export type TopicStatus = (typeof STATUSES)[number];
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

export interface Topic {
  id: string;
  name: string;
  status: TopicStatus;
  url: string;
}

export interface Relationship {
  id: string;
  source: string;
  target: string;
  kind: RelationshipKind;
}

export interface GraphData {
  topics: Topic[];
  relationships: Relationship[];
}

export function topicById(data: GraphData, id: string): Topic | undefined {
  return data.topics.find((topic) => topic.id === id);
}

export function connectionCounts(
  data: GraphData,
): Map<string, { incoming: number; outgoing: number }> {
  const counts = new Map(
    data.topics.map((topic) => [topic.id, { incoming: 0, outgoing: 0 }]),
  );

  for (const relationship of data.relationships) {
    const source = counts.get(relationship.source);
    const target = counts.get(relationship.target);
    if (source) source.outgoing += 1;
    if (target) target.incoming += 1;
  }

  return counts;
}

export function relationshipId(source: string, target: string): string {
  return `${source}--${target}`;
}

export function uniqueTopicId(
  data: GraphData,
  name: string,
  currentId?: string,
): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "topic";

  let candidate = base;
  let suffix = 2;
  while (
    data.topics.some(
      (topic) => topic.id !== currentId && topic.id === candidate,
    )
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
