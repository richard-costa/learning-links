import type { WorkspaceData } from "./model";

export const SAMPLE_DATA: WorkspaceData = {
  topics: [
    { id: "classical-mechanics", name: "Classical Mechanics", status: "learning", url: "" },
    { id: "linear-algebra", name: "Linear Algebra", status: "learning", url: "" },
    { id: "differential-equations", name: "Differential Equations", status: "planned", url: "" },
    { id: "control-theory", name: "Control Theory", status: "later", url: "" },
    { id: "signal-processing", name: "Signal Processing", status: "later", url: "" },
    { id: "laplace-transform", name: "Laplace Transform", status: "planned", url: "" },
    { id: "numerical-methods", name: "Numerical Methods", status: "planned", url: "" },
  ],
  encounters: [
    {
      id: "classical-mechanics--differential-equations",
      context: "classical-mechanics",
      topic: "differential-equations",
      reason: "need",
      note: "Harmonic oscillator equations",
    },
    {
      id: "linear-algebra--differential-equations",
      context: "linear-algebra",
      topic: "differential-equations",
      reason: "curious",
      note: "Linear systems of differential equations",
    },
    {
      id: "control-theory--differential-equations",
      context: "control-theory",
      topic: "differential-equations",
      reason: "need",
      note: "State evolution",
    },
    {
      id: "signal-processing--differential-equations",
      context: "signal-processing",
      topic: "differential-equations",
      reason: "revisit",
      note: "Continuous-time systems",
    },
    {
      id: "differential-equations--laplace-transform",
      context: "differential-equations",
      topic: "laplace-transform",
      reason: "revisit",
      note: "Solving initial-value problems",
    },
    {
      id: "differential-equations--numerical-methods",
      context: "differential-equations",
      topic: "numerical-methods",
      reason: "curious",
      note: "Approximate solutions when closed forms fail",
    },
    {
      id: "signal-processing--laplace-transform",
      context: "signal-processing",
      topic: "laplace-transform",
      reason: "need",
      note: "Transfer functions",
    },
  ],
};

export function sampleWorkspace(): WorkspaceData {
  return structuredClone(SAMPLE_DATA);
}
