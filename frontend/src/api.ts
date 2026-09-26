import type { WorkspaceData } from "./model";
import { sampleWorkspace } from "./storage";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface SessionInfo {
  email: string;
  csrf_token: string;
}

export interface PublicConfig {
  signup_enabled: boolean;
}

const demoMode = window.location.pathname === "/demo";
let demoWorkspace: WorkspaceData | null = null;
let sessionInfo: SessionInfo | null = null;

async function request(path: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
  });
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

export async function getPublicConfig(): Promise<PublicConfig> {
  const response = await request("/api/public-config");
  return response.json() as Promise<PublicConfig>;
}

export async function getSession(force = false): Promise<SessionInfo> {
  if (demoMode) return { email: "demo", csrf_token: "demo" };
  if (sessionInfo && !force) return sessionInfo;
  const response = await request("/api/auth/session");
  sessionInfo = (await response.json()) as SessionInfo;
  return sessionInfo;
}

export async function signIn(email: string, password: string): Promise<SessionInfo> {
  const response = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  sessionInfo = (await response.json()) as SessionInfo;
  return sessionInfo;
}

export async function signUp(email: string, password: string): Promise<SessionInfo> {
  const response = await request("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  sessionInfo = (await response.json()) as SessionInfo;
  return sessionInfo;
}

export async function signOut(): Promise<void> {
  const session = await getSession();
  await request("/api/auth/logout", {
    method: "POST",
    headers: { "X-CSRF-Token": session.csrf_token },
  });
  sessionInfo = null;
}

export async function loadWorkspace(): Promise<WorkspaceData> {
  if (demoMode) {
    demoWorkspace ??= sampleWorkspace();
    return structuredClone(demoWorkspace);
  }

  await getSession();
  const response = await request("/api/workspace");
  return response.json() as Promise<WorkspaceData>;
}

export async function saveWorkspace(data: WorkspaceData): Promise<WorkspaceData> {
  if (demoMode) {
    demoWorkspace = structuredClone(data);
    return structuredClone(demoWorkspace);
  }

  const session = await getSession();
  const response = await request("/api/workspace", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": session.csrf_token,
    },
    body: JSON.stringify(data),
  });
  return response.json() as Promise<WorkspaceData>;
}
