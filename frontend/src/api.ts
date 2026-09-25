import type { GraphData } from "./model";

async function request(path: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(path, options);
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // Keep the HTTP status text.
    }
    throw new Error(detail);
  }
  return response;
}

export async function loadGraph(): Promise<GraphData> {
  const response = await request("/api/graph");
  return response.json() as Promise<GraphData>;
}

export async function saveGraph(data: GraphData): Promise<GraphData> {
  const response = await request("/api/graph", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return response.json() as Promise<GraphData>;
}

export async function health(): Promise<boolean> {
  try {
    await request("/api/health");
    return true;
  } catch {
    return false;
  }
}
