export const MAX_QUERY_LENGTH = 400;

export class ProxyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

type UserClaims = { sub?: unknown; role?: unknown; is_anonymous?: unknown };

export function validateAuthenticatedUser(authorization: string | null): void {
  if (!authorization?.startsWith("Bearer ")) {
    throw new ProxyError("UNAUTHENTICATED", "Authentication required", 401);
  }
  try {
    const payload = authorization.slice(7).split(".")[1];
    if (!payload) throw new Error("Invalid JWT");
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/");
    const claims = JSON.parse(
      atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    ) as UserClaims;
    if (
      typeof claims.sub !== "string" || !claims.sub ||
      claims.role !== "authenticated" || claims.is_anonymous === true
    ) throw new Error("Not authenticated");
  } catch {
    throw new ProxyError("UNAUTHENTICATED", "Authentication required", 401);
  }
}

export interface ValidatedSearchParams {
  query: string;
  search_depth: "basic" | "advanced";
  topic: "general" | "news";
}

export function validateSearchPayload(body: unknown): ValidatedSearchParams {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ProxyError("INVALID_REQUEST", "Body must be a JSON object");
  }
  const obj = body as Record<string, unknown>;
  if (typeof obj.query !== "string" || obj.query.trim().length === 0) {
    throw new ProxyError("INVALID_REQUEST", "Query is required");
  }

  const query = obj.query.trim().slice(0, MAX_QUERY_LENGTH);
  const search_depth = obj.search_depth === "advanced" ? "advanced" : "basic";
  const topic = obj.topic === "news" ? "news" : "general";

  return { query, search_depth, topic };
}
