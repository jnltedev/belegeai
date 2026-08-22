export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  // Always resolved (never null) - login/register/me bake users.language ??
  // env.DEFAULT_LANGUAGE into this at the point the session is written, so
  // nothing downstream needs to know about that fallback.
  language: "de" | "en";
}
