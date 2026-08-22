import { cookies } from "next/headers";

const INTERNAL_API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  language: "de" | "en";
}

// Server-only helper: forwards the incoming request's cookie to the backend's
// /api/auth/me so server components can gate rendering without duplicating
// session-decryption logic on the frontend.
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  if (!cookieHeader) return null;

  const res = await fetch(`${INTERNAL_API_URL}/api/auth/me`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.user as SessionUser;
}
