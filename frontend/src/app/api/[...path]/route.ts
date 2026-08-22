import { NextRequest } from "next/server";

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

// Generic reverse proxy for every /api/* request: forwards it to the backend
// container (never exposed publicly) and streams the response back. This
// makes the frontend the only service that ever needs to be reachable from
// the outside - one container, one Cloudflare route - and makes frontend and
// API genuinely same-origin for the browser (no CORS, no cross-site cookies).
async function proxy(request: NextRequest, path: string[]): Promise<Response> {
  const url = `${API_INTERNAL_URL}/api/${path.join("/")}${request.nextUrl.search}`;
  const hasBody = !["GET", "HEAD"].includes(request.method);

  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  // Bearer tokens for /api/v1/* (external REST API keys) - external callers
  // reach the backend only through this proxy, same as browsers do.
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  // The backend's rate limiter keys on the real client IP, not this proxy's
  // own - without forwarding these, every request would appear to come
  // from this one container, and the limit would apply to all users
  // combined. Cloudflare sets cf-connecting-ip on the incoming request in
  // production; pass whatever's already there through unchanged.
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) headers.set("cf-connecting-ip", cfConnectingIp);
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);

  const res = await fetch(url, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    // Required by undici whenever a streaming request body is passed.
    // @ts-expect-error -- "duplex" is missing from the RequestInit type.
    duplex: hasBody ? "half" : undefined,
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  for (const name of ["content-type", "content-disposition", "cache-control"]) {
    const value = res.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  for (const cookieValue of res.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", cookieValue);
  }

  return new Response(res.body, { status: res.status, headers: responseHeaders });
}

async function handler(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(request, path);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
