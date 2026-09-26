import type { WorkspaceData } from "./model";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

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
    throw new ApiError(response.status, detail);
  }
  return response;
}

export async function loadWorkspace(): Promise<WorkspaceData> {
  const response = await request("/api/workspace");
  return response.json() as Promise<WorkspaceData>;
}

export async function saveWorkspace(data: WorkspaceData): Promise<WorkspaceData> {
  const response = await request("/api/workspace", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return response.json() as Promise<WorkspaceData>;
}
