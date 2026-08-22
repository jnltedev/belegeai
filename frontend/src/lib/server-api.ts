import { cookies } from "next/headers";

const INTERNAL_API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

// Server-only fetch helper: forwards the request's session cookie to the
// backend for use in server components (RSC data fetching).
export async function serverFetch<T>(path: string): Promise<T> {
  const cookieStore = await cookies();
  const res = await fetch(`${INTERNAL_API_URL}${path}`, {
    headers: { cookie: cookieStore.toString() },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Request to ${path} failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}
