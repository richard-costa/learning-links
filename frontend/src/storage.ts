import type { GraphData } from "./model";

const STORAGE_KEY = "learning-links.frontend.v1";

export const SAMPLE_DATA: GraphData = {
  topics: [
    {
      id: "formal-grammar",
      name: "Formal Grammar",
      status: "later",
      url: "https://en.wikipedia.org/wiki/Formal_grammar",
    },
    {
      id: "parsing",
      name: "Parsing",
      status: "planned",
      url: "https://en.wikipedia.org/wiki/Parsing",
    },
    { id: "compilers", name: "Compilers", status: "planned", url: "" },
    {
      id: "automata-theory",
      name: "Automata Theory",
      status: "later",
      url: "",
    },
    { id: "type-theory", name: "Type Theory", status: "later", url: "" },
  ],
  relationships: [
    {
      id: "formal-grammar--parsing",
      source: "formal-grammar",
      target: "parsing",
      kind: "helpful",
    },
    {
      id: "formal-grammar--compilers",
      source: "formal-grammar",
      target: "compilers",
      kind: "prerequisite",
    },
    {
      id: "automata-theory--compilers",
      source: "automata-theory",
      target: "compilers",
      kind: "helpful",
    },
  ],
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function looksLikeGraphData(value: unknown): value is GraphData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GraphData>;
  return (
    Array.isArray(candidate.topics) &&
    Array.isArray(candidate.relationships)
  );
}

export function loadGraph(): GraphData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(SAMPLE_DATA);

    const parsed: unknown = JSON.parse(raw);
    return looksLikeGraphData(parsed) ? parsed : clone(SAMPLE_DATA);
  } catch {
    return clone(SAMPLE_DATA);
  }
}

export function saveGraph(data: GraphData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetGraph(): GraphData {
  const data = clone(SAMPLE_DATA);
  saveGraph(data);
  return data;
}

export function clearGraph(): GraphData {
  const data: GraphData = { topics: [], relationships: [] };
  saveGraph(data);
  return data;
}
