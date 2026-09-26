import type { GraphData } from "./model";

export const SAMPLE_DATA: GraphData = {
  topics: [
    {
      id: "vectors",
      name: "Vectors",
      status: "learned",
      url: "https://en.wikipedia.org/wiki/Euclidean_vector",
    },
    {
      id: "calculus",
      name: "Calculus",
      status: "learning",
      url: "https://en.wikipedia.org/wiki/Calculus",
    },
    {
      id: "classical-mechanics",
      name: "Classical Mechanics",
      status: "learning",
      url: "https://en.wikipedia.org/wiki/Classical_mechanics",
    },
    {
      id: "newtons-laws",
      name: "Newton's Laws",
      status: "planned",
      url: "https://en.wikipedia.org/wiki/Newton%27s_laws_of_motion",
    },
    {
      id: "conservation-of-energy",
      name: "Conservation of Energy",
      status: "planned",
      url: "",
    },
    {
      id: "electromagnetism",
      name: "Electromagnetism",
      status: "later",
      url: "https://en.wikipedia.org/wiki/Electromagnetism",
    },
  ],
  relationships: [
    {
      id: "vectors--classical-mechanics",
      source: "vectors",
      target: "classical-mechanics",
      kind: "prerequisite",
    },
    {
      id: "calculus--classical-mechanics",
      source: "calculus",
      target: "classical-mechanics",
      kind: "helpful",
    },
    {
      id: "classical-mechanics--newtons-laws",
      source: "classical-mechanics",
      target: "newtons-laws",
      kind: "prerequisite",
    },
    {
      id: "classical-mechanics--conservation-of-energy",
      source: "classical-mechanics",
      target: "conservation-of-energy",
      kind: "helpful",
    },
    {
      id: "vectors--electromagnetism",
      source: "vectors",
      target: "electromagnetism",
      kind: "prerequisite",
    },
    {
      id: "conservation-of-energy--electromagnetism",
      source: "conservation-of-energy",
      target: "electromagnetism",
      kind: "related",
    },
  ],
};

export function sampleGraph(): GraphData {
  return structuredClone(SAMPLE_DATA);
}
