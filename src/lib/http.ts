import { NextResponse } from "next/server";

/** Permissive CORS for public, read-only scene/embed endpoints. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/** Scenes never change once created (content-hash dedup), so cache forever. */
export const IMMUTABLE_CACHE =
  "public, max-age=31536000, s-maxage=31536000, immutable";

/** Don't cache error responses. */
export const NO_STORE = "no-store";

export function mergeCorsHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  return { ...CORS_HEADERS, ...(extra ?? {}) };
}

export function jsonWithCors(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): NextResponse {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: mergeCorsHeaders(init?.headers),
  });
}

/** 204 preflight response for OPTIONS. */
export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
