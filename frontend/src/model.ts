export const STATUSES = ["planned", "learning", "learned", "later"] as const;
export const REASONS = ["need", "revisit", "curious"] as const;

export type TopicStatus = (typeof STATUSES)[number];
export type EncounterReason = (typeof REASONS)[number];

export interface Topic {
  id: string;
  name: string;
  status: TopicStatus;
  url: string;
}

export interface Encounter {
  id: string;
  context: string;
  topic: string;
  reason: EncounterReason;
  note: string;
}

export interface WorkspaceData {
  topics: Topic[];
  encounters: Encounter[];
}

export function topicById(data: WorkspaceData, id: string): Topic | undefined {
  return data.topics.find((topic) => topic.id === id);
}

export function encounterId(context: string, topic: string): string {
  return `${context}--${topic}`;
}

export function encountersForTopic(data: WorkspaceData, topicId: string): Encounter[] {
  return data.encounters.filter((encounter) => encounter.topic === topicId);
}

export function encountersFromContext(data: WorkspaceData, topicId: string): Encounter[] {
  return data.encounters.filter((encounter) => encounter.context === topicId);
}

export function connectionCounts(
  data: WorkspaceData,
): Map<string, { cameUpIn: number; flagged: number }> {
  const counts = new Map(
    data.topics.map((topic) => [topic.id, { cameUpIn: 0, flagged: 0 }]),
  );
  for (const encounter of data.encounters) {
    const context = counts.get(encounter.context);
    const topic = counts.get(encounter.topic);
    if (context) context.flagged += 1;
    if (topic) topic.cameUpIn += 1;
  }
  return counts;
}

export function uniqueTopicId(
  data: WorkspaceData,
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
